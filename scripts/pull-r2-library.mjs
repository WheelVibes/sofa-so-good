// Mirror the shared R2 asset library (sofa-assets) into resources/ for local use.
//
// R2 is S3-compatible, so this speaks SigV4 directly via `lib/r2-client.mjs`
// (no aws-sdk / rclone needed): ListObjectsV2 to enumerate, parallel GETs to
// download. Resumes by skipping any local file whose size already matches the
// object's Content-Length. `push-r2-library.mjs` is the upload counterpart.
//
// Credentials (R2 -> Manage API tokens -> Object Read-only on sofa-assets) are
// resolved in this order, first hit wins:
//   1. the environment: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   2. .r2.env in the repo root (same keys, gitignored)
//   3. an rclone S3 remote (default `sofa-r2` in ~/.config/rclone/rclone.conf) --
//      the account id is read off its r2.cloudflarestorage.com endpoint
//
// Usage:
//   node scripts/pull-r2-library.mjs [--prefix ikea/] [--out resources] [--concurrency 16]
//                                    [--bucket sofa-assets] [--remote sofa-r2] [--dry-run]
//
// The bucket is non-redistributable (IKEA) — resources/ is gitignored. Never commit it.

import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { fmtBytes, loadDotEnv, makeClient, pool, resolveCreds } from './lib/r2-client.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- args + env

function parseArgs(argv) {
  const out = {
    prefix: [],
    bucket: 'sofa-assets',
    out: 'resources',
    concurrency: 16,
    remote: process.env.R2_RCLONE_REMOTE ?? 'sofa-r2',
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--prefix') out.prefix.push(argv[++i])
    else if (a === '--bucket') out.bucket = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--remote') out.remote = argv[++i]
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else throw new Error(`unknown argument: ${a}`)
  }
  if (out.prefix.length === 0) out.prefix = ['ikea/', 'acg/', 'library/']
  if (!Number.isFinite(out.concurrency) || out.concurrency < 1) throw new Error('bad --concurrency')
  return out
}

// ---------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadDotEnv(path.join(ROOT, '.r2.env'))
  const creds = await resolveCreds(args.remote)
  console.log(`[pull-r2] auth: ${creds.source}`)
  const client = makeClient({ ...creds, bucket: args.bucket })
  const outDir = path.resolve(ROOT, args.out)

  const objects = []
  for (const prefix of args.prefix) {
    const found = await client.list(prefix)
    console.log(`[pull-r2] ${prefix} -> ${found.length} objects`)
    objects.push(...found)
  }
  const total = objects.reduce((n, o) => n + o.size, 0)
  console.log(`[pull-r2] ${objects.length} objects, ${fmtBytes(total)} in ${args.bucket}`)
  if (args.dryRun) {
    for (const o of objects.slice(0, 20)) console.log(`  ${o.key} (${fmtBytes(o.size)})`)
    if (objects.length > 20) console.log(`  … ${objects.length - 20} more`)
    return
  }

  let done = 0
  let skipped = 0
  let bytes = 0
  const failures = []
  await pool(objects, args.concurrency, async (obj) => {
    const dest = path.join(outDir, obj.key)
    try {
      const existing = await stat(dest).catch(() => null)
      if (existing?.size === obj.size) {
        skipped++
        done++
        return
      }
      await mkdir(path.dirname(dest), { recursive: true })
      const res = await client.get(obj.key)
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
      bytes += obj.size
    } catch (err) {
      failures.push({ key: obj.key, err: String(err) })
    }
    done++
    if (done % 50 === 0 || done === objects.length) {
      console.log(
        `[pull-r2] ${done}/${objects.length}  downloaded ${fmtBytes(bytes)}  skipped ${skipped}  failed ${failures.length}`,
      )
    }
  })

  console.log(
    `[pull-r2] done — ${objects.length - skipped - failures.length} downloaded (${fmtBytes(bytes)}), ${skipped} already current, ${failures.length} failed -> ${outDir}`,
  )
  for (const f of failures.slice(0, 20)) console.error(`  FAIL ${f.key}: ${f.err}`)
  if (failures.length) process.exitCode = 1
}

main().catch((err) => {
  console.error('[pull-r2] failed:', err.message ?? err)
  process.exit(1)
})
