import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOptimizePool } from './scraper/optimizePool.mjs'
import { createLineSplitter, parseEvent } from './scraper/progress.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const SERVED_DIR = path.join(REPO, 'public', 'assets', 'ikea')
const SCRAPER = path.join(REPO, 'python', 'scripts', 'ikea_model_scraper.py')
const OPTIMIZER = path.join(REPO, 'python', 'scripts', 'optimize_glb_lod.mjs')
const PORT = Number(process.env.SCRAPER_PORT || 5174)

/** The single active run, or null when idle. */
let run = null

function broadcast(event) {
  if (!run) return
  run.latest.push(event)
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const res of run.clients) res.write(line)
}

/** Merge scraper NDJSON events into the broadcast stream: forward every event,
 *  submit each landed finish GLB for optimization, and emit `group_ready` each
 *  time the group's on-disk metadata.json gains a finish.
 *
 *  A multi-finish IKEA product is scraped one finish at a time — each finish is
 *  a separate product page that re-writes the SHARED group metadata.json,
 *  filling in its own variant (the others remain `glb:null` stubs until their
 *  turn). So the FIRST `metadata_written` only has one usable variant. We
 *  therefore re-emit `group_ready` on every `metadata_written` that follows a
 *  newly-landed finish, so the client re-registers (idempotently, via
 *  `replaceUserFurniture`) with the now-fuller metadata. Without this, every
 *  multi-finish group imports with only its first finish usable.
 *
 *  Extracted + exported for unit tests. */
export function createEventMerger({ onEmit, submitOptimize }) {
  // Per-group count of finishes whose GLB has landed since we last emitted
  // group_ready for it — lets us fire only when there's genuinely more to load.
  const finishesLanded = new Map()
  const finishesAtLastReady = new Map()
  return function handle(ev) {
    onEmit(ev)
    if (ev.phase === 'glb_written' && ev.group && ev.glb) {
      finishesLanded.set(ev.group, (finishesLanded.get(ev.group) ?? 0) + 1)
      submitOptimize(ev.group, ev.glb)
    }
    if (ev.phase === 'metadata_written' && ev.group) {
      const landed = finishesLanded.get(ev.group) ?? 0
      // Ready only once ≥1 finish has a GLB, and only if a new finish landed
      // since the last emit (so we don't re-fire on a metadata-only refresh).
      if (landed > 0 && landed > (finishesAtLastReady.get(ev.group) ?? 0)) {
        finishesAtLastReady.set(ev.group, landed)
        onEmit({ phase: 'group_ready', group: ev.group })
      }
    }
  }
}

function startRun(limit) {
  const runId = `run-${Date.now()}`
  const optimize = createOptimizePool({
    concurrency: Number(process.env.OPTIMIZE_CONCURRENCY || 3),
    run: (glbAbsPath) =>
      new Promise((resolve, reject) => {
        const p = spawn('node', [OPTIMIZER, glbAbsPath], { cwd: REPO })
        p.on('error', reject)
        p.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`optimizer exit ${code}`)),
        )
      }),
    onPhase: (glb, phase) => broadcast({ phase: `optimize_${phase}`, glb }),
    onError: (glb, err) => broadcast({ phase: 'optimize_failed', glb, error: String(err) }),
  })

  // The merge logic is extracted so it's unit-testable without a live scraper.
  const handle = createEventMerger({
    onEmit: (ev) => broadcast(ev),
    submitOptimize: (group, glb) => optimize.submit(path.join(SERVED_DIR, group, glb)),
  })

  // Command + leading args to run the scraper. Default: the real Python
  // scraper. `SCRAPER_CMD` (space-separated) overrides it — a testability seam
  // for stubbing the scraper in local end-to-end verification without network.
  const [cmd, ...cmdArgs] = (process.env.SCRAPER_CMD ?? `python3 ${SCRAPER}`).split(' ')
  const args = [...cmdArgs, '--out', SERVED_DIR, '--progress-ndjson']
  if (limit > 0) args.push('--limit', String(limit))
  const child = spawn(cmd, args, { cwd: path.join(REPO, 'python', 'scripts') })

  const split = createLineSplitter((line) => {
    const ev = parseEvent(line)
    if (ev) handle(ev)
  })

  child.stdout.on('data', (b) => split(String(b)))
  child.stderr.on('data', (b) => process.stderr.write(b))
  child.on('close', async () => {
    split.end()
    await optimize.drain()
    broadcast({ phase: 'run_complete' })
    for (const res of run?.clients ?? []) res.end()
    run = null
  })

  run = { runId, child, clients: new Set(), latest: [] }
  return runId
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'GET' && url.pathname === '/ikea/status') {
    return send(res, 200, { running: !!run, runId: run?.runId })
  }
  if (req.method === 'POST' && url.pathname === '/ikea/scrape') {
    if (run) return send(res, 409, { error: 'a run is already in progress', runId: run.runId })
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let limit = 0
      try {
        limit = Number(JSON.parse(body || '{}').limit) || 0
      } catch {
        /* default */
      }
      const runId = startRun(limit)
      send(res, 200, { runId })
    })
    return
  }
  if (req.method === 'GET' && url.pathname === '/ikea/progress') {
    if (!run) return send(res, 404, { error: 'no active run' })
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    for (const ev of run.latest) res.write(`data: ${JSON.stringify(ev)}\n\n`)
    run.clients.add(res)
    req.on('close', () => run?.clients.delete(res))
    return
  }
  if (req.method === 'POST' && url.pathname === '/ikea/cancel') {
    if (run) {
      run.child.kill('SIGTERM')
    }
    return send(res, 200, { ok: true })
  }
  send(res, 404, { error: 'not found' })
})

// Only start listening when run directly (`node scripts/scraper-server.mjs`),
// not when imported by Vitest — otherwise the test process binds the port.
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`[scraper-server] listening on http://localhost:${PORT}`)
    console.log(`[scraper-server] writing assets to ${SERVED_DIR}`)
  })
}
