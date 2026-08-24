// Upload a local asset tree to the shared R2 bucket.
//
// The mirror of `pull-r2-library.mjs`, sharing its SigV4 client
// (`scripts/lib/r2-client.mjs`) — no `rclone`/`aws` install needed.
// Idempotent: an object whose remote size already matches the local file is
// skipped, so an interrupted run resumes cheaply and a re-publish only sends
// what changed.
//
// Usage:
//   node scripts/push-r2-library.mjs <localDir> <keyPrefix> [--dry-run]
//                                    [--concurrency 16] [--bucket sofa-assets]
//                                    [--exclude <name>]... [--rename <from>=<to>]
//
// Publish the packed ambientCG library (see scripts/pack-ambientcg.mjs):
//   node scripts/push-r2-library.mjs resources/acg acg \
//     --exclude index.json --exclude .DS_Store
//   node scripts/push-r2-library.mjs resources/acg '' \
//     --only index.json --rename index.json=library/acg-index.json
//
// The manifest MUST land at `library/acg-index.json`, not `acg/index.json`:
// `server/assets.ts` exempts only the `library/` prefix from the year-long
// immutable cache, and a manifest is replaced in place on every re-publish.

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fmtBytes, loadDotEnv, makeClient, pool, resolveCreds } from './lib/r2-client.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const out = {
    dir: null,
    prefix: null,
    bucket: 'sofa-assets',
    concurrency: 16,
    remote: process.env.R2_RCLONE_REMOTE ?? 'sofa-r2',
    exclude: new Set(['.DS_Store']),
    only: null,
    rename: new Map(),
    dryRun: false,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--bucket') out.bucket = argv[++i]
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else if (a === '--remote') out.remote = argv[++i]
    else if (a === '--exclude') out.exclude.add(argv[++i])
    else if (a === '--only') {
      out.only ??= new Set()
      out.only.add(argv[++i])
    } else if (a === '--rename') {
      const [from, to] = argv[++i].split('=')
      out.rename.set(from, to)
    } else if (a.startsWith('--')) throw new Error(`unknown argument: ${a}`)
    else positional.push(a)
  }
  if (positional.length < 1) throw new Error('usage: push-r2-library.mjs <localDir> <keyPrefix>')
  out.dir = positional[0]
  out.prefix = (positional[1] ?? '').replace(/^\/+|\/+$/g, '')
  return out
}

/** Every file under `dir`, as paths relative to it (POSIX separators). */
async function walk(dir, base = dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full, base)))
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadDotEnv(path.join(ROOT, '.r2.env'))
  const creds = await resolveCreds(args.remote)
  console.log(`[push-r2] auth: ${creds.source}`)
  const client = makeClient({ ...creds, bucket: args.bucket })

  const localDir = path.resolve(ROOT, args.dir)
  const rels = (await walk(localDir))
    .filter((r) => !args.exclude.has(path.basename(r)))
    .filter((r) => !args.only || args.only.has(r))
    .sort()

  /** Local relative path → destination object key. */
  const keyFor = (rel) => args.rename.get(rel) ?? (args.prefix ? `${args.prefix}/${rel}` : rel)

  const files = []
  for (const rel of rels) {
    files.push({ rel, key: keyFor(rel), size: (await stat(path.join(localDir, rel))).size })
  }
  const total = files.reduce((n, f) => n + f.size, 0)
  console.log(`[push-r2] ${files.length} files, ${fmtBytes(total)} from ${args.dir}`)

  // One LIST over the destination prefix beats a HEAD per object (and costs a
  // handful of Class B ops instead of thousands).
  const remote = new Map()
  for (const p of new Set(files.map((f) => f.key.split('/')[0]))) {
    for (const o of await client.list(`${p}/`)) remote.set(o.key, o.size)
  }

  if (args.dryRun) {
    for (const f of files.slice(0, 20)) {
      const cur = remote.get(f.key)
      console.log(
        `  ${f.rel} -> ${f.key} (${fmtBytes(f.size)})${cur === f.size ? ' [current]' : ''}`,
      )
    }
    if (files.length > 20) console.log(`  … ${files.length - 20} more`)
    return
  }

  let done = 0
  let skipped = 0
  let bytes = 0
  const failures = []
  await pool(files, args.concurrency, async (f) => {
    try {
      if (remote.get(f.key) === f.size) {
        skipped++
      } else {
        await client.put(f.key, await readFile(path.join(localDir, f.rel)))
        bytes += f.size
      }
    } catch (err) {
      failures.push({ key: f.key, err: String(err) })
    }
    done++
    if (done % 100 === 0 || done === files.length) {
      console.log(
        `[push-r2] ${done}/${files.length}  uploaded ${fmtBytes(bytes)}  skipped ${skipped}  failed ${failures.length}`,
      )
    }
  })

  console.log(
    `[push-r2] done — ${files.length - skipped - failures.length} uploaded (${fmtBytes(bytes)}), ` +
      `${skipped} already current, ${failures.length} failed`,
  )
  for (const f of failures.slice(0, 20)) console.error(`  FAIL ${f.key}: ${f.err}`)
  if (failures.length) process.exitCode = 1
}

main().catch((err) => {
  console.error('[push-r2] failed:', err.message ?? err)
  process.exit(1)
})
