/**
 * Local dev backend for `npm run dev`.
 *
 * WHY THIS EXISTS: the production API is a Cloudflare Pages Function
 * (`functions/api/[[route]].ts`, a Hono app) that normally runs under
 * `wrangler pages dev` on the `workerd` runtime. `workerd` needs glibc >= 2.32,
 * which some dev boxes (e.g. Ubuntu 20.04 / WSL, glibc 2.31) don't have, so
 * wrangler can't boot there. Instead of the client-side admin gate, we host the
 * SAME worker app on plain Node with shimmed bindings so real email+password
 * admin login (and cloud sync) work in dev exactly like production:
 *   - D1   -> node:sqlite (persisted to `.wrangler/sofa-dev.sqlite`)
 *   - KV   -> in-memory Map with TTL (sessions/flags/cache; cleared on restart)
 *   - R2   -> stub (asset proxy returns 404 in dev; not needed for auth/designs)
 *
 * DEV ONLY. Not the production runtime. The admin account is seeded from
 * `.dev.vars` (ADMIN_EMAIL / ADMIN_PASSWORD) by the app's own `ensureAdminSeed`
 * on the first request. Turnstile is disabled (no TURNSTILE_SECRET).
 *
 * Requires Node's `node:sqlite` (run with `--experimental-sqlite`, wired by
 * `npm run dev` / `dev:api`).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
// The real production worker — hosted here unchanged.
import { app } from '../functions/api/[[route]].ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.DEV_API_PORT ?? 8788)

// --- Bindings ---------------------------------------------------------------

/** Minimal D1Database over node:sqlite — only the surface `server/*` uses. */
function makeD1(db: DatabaseSync) {
  class Stmt {
    constructor(
      private sql: string,
      private params: unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Stmt(this.sql, params)
    }
    async first<T = unknown>(column?: string): Promise<T | null> {
      const row = db.prepare(this.sql).get(...(this.params as never[])) as
        | Record<string, unknown>
        | undefined
      if (row == null) return null
      return (column !== undefined ? (row[column] as T) : (row as T)) ?? null
    }
    async all<T = unknown>() {
      const results = db.prepare(this.sql).all(...(this.params as never[])) as T[]
      return { results, success: true, meta: {} }
    }
    async run() {
      const info = db.prepare(this.sql).run(...(this.params as never[]))
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
      }
    }
  }
  return {
    prepare: (sql: string) => new Stmt(sql),
    async exec(sql: string) {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
    async batch(stmts: Array<{ all: () => Promise<unknown> }>) {
      return Promise.all(stmts.map((s) => s.all()))
    },
  }
}

/** In-memory KVNamespace with TTL. Sessions/flags/cache; cleared on restart. */
function makeKV() {
  const store = new Map<string, { value: string; expiresAt?: number }>()
  return {
    async get(key: string) {
      const entry = store.get(key)
      if (!entry) return null
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
      })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list() {
      return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true as const }
    },
  }
}

/** R2 stub — the shared-library asset proxy is not served in dev. */
function makeR2Stub() {
  return {
    async get() {
      return null
    },
  }
}

/** Parse a `.dev.vars` (KEY=value per line) into a record, if present. */
function parseDotVars(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

// --- Boot -------------------------------------------------------------------

const dbPath = join(ROOT, '.wrangler', 'sofa-dev.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec('PRAGMA foreign_keys = ON')

// Apply migrations (all idempotent CREATE TABLE IF NOT EXISTS) on every boot.
const migrationsDir = join(ROOT, 'migrations')
for (const file of readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
}

const devVars = { ...parseDotVars(join(ROOT, '.dev.vars')), ...process.env }
const env = {
  DB: makeD1(db),
  LIBRARY: makeR2Stub(),
  SESSIONS: makeKV(),
  CACHE: makeKV(),
  FLAGS: makeKV(),
  // Vars mirror wrangler.toml [vars]; secrets come from .dev.vars.
  ADMIN_EMAIL: devVars.ADMIN_EMAIL,
  ADMIN_PASSWORD: devVars.ADMIN_PASSWORD,
  TURNSTILE_SECRET: devVars.TURNSTILE_SECRET ?? '',
  PBKDF2_ITERATIONS: devVars.PBKDF2_ITERATIONS ?? '100000',
  SESSION_TTL_SECONDS: devVars.SESSION_TTL_SECONDS ?? '1209600',
  MAX_ACCOUNTS: devVars.MAX_ACCOUNTS ?? '200',
  MAX_SLOTS_PER_USER: devVars.MAX_SLOTS_PER_USER ?? '50',
  MAX_DESIGN_BYTES: devVars.MAX_DESIGN_BYTES ?? '4194304',
}

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined))
  })
}

const server = createServer(async (req, res) => {
  try {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue
      for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v)
    }
    const request = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body: await readBody(req),
    })
    const response = await app.fetch(request, env)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length) res.setHeader('set-cookie', cookies)
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: `Dev API error: ${(err as Error).message}` }))
  }
})

server.listen(PORT, () => {
  const seeded = env.ADMIN_EMAIL && env.ADMIN_PASSWORD
  console.log(`[dev-api] worker on http://localhost:${PORT}  (D1 -> ${dbPath})`)
  console.log(
    seeded
      ? `[dev-api] admin seed: ${env.ADMIN_EMAIL} (set in .dev.vars)`
      : '[dev-api] no ADMIN_EMAIL/ADMIN_PASSWORD in .dev.vars — login will have no accounts',
  )
})
