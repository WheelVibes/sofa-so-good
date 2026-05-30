import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLineSplitter, parseEvent } from './scraper/progress.mjs';
import { createOptimizePool } from './scraper/optimizePool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SERVED_DIR = path.join(REPO, 'public', 'assets', 'ikea');
const SCRAPER = path.join(REPO, 'python', 'scripts', 'ikea_model_scraper.py');
const OPTIMIZER = path.join(REPO, 'python', 'scripts', 'optimize_glb_lod.mjs');
const PORT = Number(process.env.SCRAPER_PORT || 5174);

/** The single active run, or null when idle. */
let run = null;

function broadcast(event) {
  if (!run) return;
  run.latest.push(event);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.clients) res.write(line);
}

/** Merge scraper NDJSON events into the broadcast stream: forward every event,
 *  submit each landed finish GLB for optimization, and emit `group_ready` once
 *  (metadata written AND ≥1 finish landed). Extracted + exported for unit tests. */
export function createEventMerger({ onEmit, submitOptimize }) {
  const groupsWithFinish = new Set();
  const metadataWritten = new Set();
  const groupsReady = new Set();
  return function handle(ev) {
    onEmit(ev);
    if (ev.phase === 'glb_written' && ev.group && ev.glb) {
      groupsWithFinish.add(ev.group);
      submitOptimize(ev.group, ev.glb);
    }
    if (ev.phase === 'metadata_written' && ev.group) metadataWritten.add(ev.group);
    if (ev.group && metadataWritten.has(ev.group) && groupsWithFinish.has(ev.group)
        && !groupsReady.has(ev.group)) {
      groupsReady.add(ev.group);
      onEmit({ phase: 'group_ready', group: ev.group });
    }
  };
}

function startRun(limit) {
  const runId = `run-${Date.now()}`;
  const optimize = createOptimizePool({
    concurrency: Number(process.env.OPTIMIZE_CONCURRENCY || 3),
    run: (glbAbsPath) =>
      new Promise((resolve, reject) => {
        const p = spawn('node', [OPTIMIZER, glbAbsPath], { cwd: REPO });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`optimizer exit ${code}`))));
      }),
    onPhase: (glb, phase) => broadcast({ phase: `optimize_${phase}`, glb }),
    onError: (glb, err) => broadcast({ phase: 'optimize_failed', glb, error: String(err) }),
  });

  // The merge logic is extracted so it's unit-testable without a live scraper.
  const handle = createEventMerger({
    onEmit: (ev) => broadcast(ev),
    submitOptimize: (group, glb) => optimize.submit(path.join(SERVED_DIR, group, glb)),
  });

  const args = [SCRAPER, '--out', SERVED_DIR, '--progress-ndjson'];
  if (limit > 0) args.push('--limit', String(limit));
  const child = spawn('python3', args, { cwd: path.join(REPO, 'python', 'scripts') });

  const split = createLineSplitter((line) => {
    const ev = parseEvent(line);
    if (ev) handle(ev);
  });

  child.stdout.on('data', (b) => split(String(b)));
  child.stderr.on('data', (b) => process.stderr.write(b));
  child.on('close', async () => {
    split.end();
    await optimize.drain();
    broadcast({ phase: 'run_complete' });
    for (const res of run?.clients ?? []) res.end();
    run = null;
  });

  run = { runId, child, clients: new Set(), latest: [] };
  return runId;
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/ikea/status') {
    return send(res, 200, { running: !!run, runId: run?.runId });
  }
  if (req.method === 'POST' && url.pathname === '/ikea/scrape') {
    if (run) return send(res, 409, { error: 'a run is already in progress', runId: run.runId });
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let limit = 0;
      try { limit = Number(JSON.parse(body || '{}').limit) || 0; } catch { /* default */ }
      const runId = startRun(limit);
      send(res, 200, { runId });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/ikea/progress') {
    if (!run) return send(res, 404, { error: 'no active run' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    for (const ev of run.latest) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    run.clients.add(res);
    req.on('close', () => run?.clients.delete(res));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/ikea/cancel') {
    if (run) { run.child.kill('SIGTERM'); }
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'not found' });
});

// Only start listening when run directly (`node scripts/scraper-server.mjs`),
// not when imported by Vitest — otherwise the test process binds the port.
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`[scraper-server] listening on http://localhost:${PORT}`);
    console.log(`[scraper-server] writing assets to ${SERVED_DIR}`);
  });
}
