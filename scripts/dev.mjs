/**
 * `npm run dev` — runs the Vite dev server AND the local Node backend
 * (`scripts/dev-api.ts`) together, so real admin login + cloud sync work in dev
 * (see scripts/dev-api.ts for why we don't use `wrangler pages dev`).
 *
 * Vite serves the app on :5173 and proxies `/api` -> the backend on :8788
 * (vite.config.ts). Use `npm run dev:web` / `npm run dev:api` to run either
 * half alone.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'

// The dev backend needs node:sqlite (Node >= 22.5, run with --experimental-sqlite).
const major = Number(process.versions.node.split('.')[0])
if (major < 22) {
  console.error(
    `\n[dev] Node ${process.versions.node} is too old — the dev backend needs Node >= 22 ` +
      `(node:sqlite). This repo pins ${'24.18.0'} in .nvmrc; run \`nvm use\` then \`npm run dev\`.\n`,
  )
  process.exit(1)
}

const bin = (name) =>
  join('node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)

/** Spawn a child, prefixing each output line so the two streams stay readable. */
function run(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...extraEnv },
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const prefix = (stream) => (buf) => {
    for (const line of buf.toString().split('\n')) {
      if (line.length) stream.write(`[${label}] ${line}\n`)
    }
  }
  child.stdout.on('data', prefix(process.stdout))
  child.stderr.on('data', prefix(process.stderr))
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${label} exited (${code}) — shutting down.`)
      shutdown(code ?? 1)
    }
  })
  return child
}

let shuttingDown = false
const children = []
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) c.kill('SIGINT')
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

children.push(
  run('api', bin('tsx'), ['scripts/dev-api.ts'], {
    NODE_OPTIONS: `--experimental-sqlite ${process.env.NODE_OPTIONS ?? ''}`.trim(),
  }),
)
children.push(run('web', bin('vite'), []))
