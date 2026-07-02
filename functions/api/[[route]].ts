/**
 * Sofa So Good API — a Hono app served as a Cloudflare Pages Function on the
 * same origin as the static site (`/api/*`), so the browser talks to it with
 * session cookies and no CORS.
 *
 * Accounts are ADMIN-CREATED ONLY (no public signup). R2 reads are auth-gated
 * and fronted by a Cache API + kill-switch guardrail. See docs/deployment-cloudflare.md.
 */
import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { serveAsset } from '../../server/assets'
import { verifyPassword } from '../../server/crypto'
import {
  addFavourite,
  countAdmins,
  countNamedSlots,
  createUser,
  deleteDesign,
  deleteUser,
  ensureAdminSeed,
  getUserByEmail,
  getUserById,
  listDesigns,
  listFavourites,
  listUsers,
  loadDesign,
  countUsers,
  removeFavourite,
  saveDesign,
  updateUserPassword,
  updateUserRole,
} from '../../server/db'
import { type Env, intVar, type PublicUser, toPublicUser } from '../../server/env'
import { clientIp, isTripped, KILL_ALL, rateLimit } from '../../server/guardrails'
import {
  clearedCookie,
  createSession,
  destroySession,
  parseCookie,
  readSession,
  revokeUserSessions,
  SESSION_COOKIE,
  sessionCookie,
} from '../../server/sessions'
import { verifyTurnstile } from '../../server/turnstile'

interface SessionCtx {
  userId: string
  role: 'user' | 'admin'
}

type Variables = { session: SessionCtx | null; token: string | null }

// Exported for tests; production entry is `onRequest` at the bottom.
export const app = new Hono<{ Bindings: Env; Variables: Variables }>().basePath('/api')

// Seed the first admin once per isolate (idempotent; unique-email guards races).
let seeded = false

app.use('*', async (c, next) => {
  if (!seeded) {
    seeded = true
    try {
      await ensureAdminSeed(c.env)
    } catch {
      seeded = false // retry on the next request if the seed failed
    }
  }
  // Global kill-switch (admin / emergency) — everything except health returns 503.
  if (c.req.path !== '/api/health' && (await isTripped(c.env, KILL_ALL))) {
    return c.text('Service temporarily unavailable (usage guardrail).', 503)
  }
  const token = parseCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE)
  const record = await readSession(c.env, token)
  c.set('token', token)
  c.set('session', record ? { userId: record.userId, role: record.role } : null)
  await next()
})

function requireAuth(c: { get: (k: 'session') => SessionCtx | null }): SessionCtx | null {
  return c.get('session')
}

// --- Health ------------------------------------------------------------------
app.get('/health', (c) => c.json({ ok: true }))

// --- Auth (login only — no public signup) ------------------------------------
app.post('/auth/login', async (c) => {
  if (!rateLimit(`login:${clientIp(c.req.raw)}`, 10, 60_000)) {
    return c.json({ error: 'Too many attempts. Try again shortly.' }, 429)
  }
  const body = await c.req.json<{ email?: string; password?: string; turnstileToken?: string }>()
  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400)

  const ok = await verifyTurnstile(c.env, body.turnstileToken ?? null, c.req.header('CF-Connecting-IP') ?? null)
  if (!ok) return c.json({ error: 'Verification failed. Please retry.' }, 400)

  const user = await getUserByEmail(c.env, email)
  // Always compare to avoid trivial user-enumeration timing; fail closed.
  if (!user || !(await verifyPassword(password, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.iterations,
  }))) {
    return c.json({ error: 'Incorrect email or password.' }, 401)
  }

  const token = await createSession(c.env, user.id, user.role)
  const ttl = intVar(c.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 14)
  c.header('Set-Cookie', sessionCookie(token, ttl))
  return c.json({ user: toPublicUser(user) })
})

app.post('/auth/logout', async (c) => {
  await destroySession(c.env, c.get('token'))
  c.header('Set-Cookie', clearedCookie())
  return c.json({ ok: true })
})

app.get('/auth/me', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ user: null })
  const user = await getUserById(c.env, session.userId)
  return c.json({ user: user ? toPublicUser(user) : null })
})

// --- Admin: user management (the only way accounts are created) --------------
app.use('/admin/*', async (c, next) => {
  const session = requireAuth(c)
  if (!session || session.role !== 'admin') return c.json({ error: 'Forbidden.' }, 403)
  await next()
})

app.get('/admin/users', async (c) => {
  const users: PublicUser[] = (await listUsers(c.env)).map(toPublicUser)
  return c.json({ users })
})

app.post('/admin/users', async (c) => {
  const body = await c.req.json<{ email?: string; name?: string; password?: string; role?: string }>()
  const email = (body.email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim() || email
  const password = body.password ?? ''
  const role = body.role === 'admin' ? 'admin' : 'user'
  if (!email || !password) return c.json({ error: 'Email and password are required.' }, 400)
  if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters.' }, 400)

  const max = intVar(c.env.MAX_ACCOUNTS, 200)
  if ((await countUsers(c.env)) >= max) {
    return c.json({ error: `Account limit reached (${max}).` }, 409)
  }
  if (await getUserByEmail(c.env, email)) {
    return c.json({ error: 'An account with that email already exists.' }, 409)
  }
  const session = requireAuth(c)
  const user = await createUser(c.env, {
    email,
    name,
    password,
    role,
    createdBy: session?.userId ?? null,
  })
  return c.json({ user: toPublicUser(user) }, 201)
})

// Reset an account's password and/or change its role. Editing your own row is
// how the admin credentials are rotated.
app.patch('/admin/users/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ password?: string; role?: string }>()
  const password = typeof body.password === 'string' ? body.password : ''
  const hasPassword = password.length > 0
  const hasRole = body.role === 'user' || body.role === 'admin'
  if (!hasPassword && !hasRole) {
    return c.json({ error: 'Provide a new password or role to update.' }, 400)
  }
  if (hasPassword && password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters.' }, 400)
  }

  const target = await getUserById(c.env, id)
  if (!target) return c.json({ error: 'Account not found.' }, 404)

  // Last-admin guard: never demote the final admin.
  if (hasRole && body.role === 'user' && target.role === 'admin' && (await countAdmins(c.env)) <= 1) {
    return c.json({ error: 'Cannot demote the last admin account.' }, 409)
  }

  if (hasRole && body.role !== target.role) {
    await updateUserRole(c.env, id, body.role as 'user' | 'admin')
  }
  if (hasPassword) {
    await updateUserPassword(c.env, id, password)
  }

  // Any credential change forces the target to re-authenticate everywhere.
  await revokeUserSessions(c.env, id)

  // Self-edit would kill the acting admin's own session — re-mint it so they
  // stay signed in (all their OTHER sessions are still revoked above).
  const session = requireAuth(c)
  if (session && session.userId === id) {
    const newRole = hasRole ? (body.role as 'user' | 'admin') : target.role
    const token = await createSession(c.env, id, newRole)
    const ttl = intVar(c.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 14)
    c.header('Set-Cookie', sessionCookie(token, ttl))
  }

  const updated = await getUserById(c.env, id)
  return c.json({ user: updated ? toPublicUser(updated) : null })
})

app.delete('/admin/users/:id', async (c) => {
  const id = c.req.param('id')
  const session = requireAuth(c)
  if (session && session.userId === id) {
    return c.json({ error: 'You cannot delete your own account.' }, 400)
  }
  const target = await getUserById(c.env, id)
  if (!target) return c.json({ error: 'Account not found.' }, 404)
  if (target.role === 'admin' && (await countAdmins(c.env)) <= 1) {
    return c.json({ error: 'Cannot delete the last admin account.' }, 409)
  }
  await deleteUser(c.env, id)
  await revokeUserSessions(c.env, id)
  return c.json({ ok: true })
})

// --- Designs (StorageAdapter-shaped) -----------------------------------------
app.get('/designs', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  const slots = (await listDesigns(c.env, session.userId)).map((d) => ({
    slot: d.slot,
    savedAt: d.savedAt,
  }))
  return c.json({ slots })
})

app.get('/designs/:slot', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  const json = await loadDesign(c.env, session.userId, c.req.param('slot'))
  if (!json) return c.json({ state: null })
  return c.json({ state: JSON.parse(json) })
})

app.put('/designs/:slot', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  const slot = c.req.param('slot')
  const raw = await c.req.text()
  const maxBytes = intVar(c.env.MAX_DESIGN_BYTES, 4 * 1024 * 1024)
  if (raw.length > maxBytes) {
    return c.json({ error: 'Design is too large to sync to the cloud.' }, 413)
  }
  let state: { savedAt?: string; version?: number; note?: string }
  try {
    state = JSON.parse(raw)
  } catch {
    return c.json({ error: 'Invalid design payload.' }, 400)
  }
  if (slot !== 'autosave') {
    const maxSlots = intVar(c.env.MAX_SLOTS_PER_USER, 50)
    // Only enforce when creating a NEW slot (upsert of an existing slot is fine).
    const existing = await loadDesign(c.env, session.userId, slot)
    if (!existing && (await countNamedSlots(c.env, session.userId)) >= maxSlots) {
      return c.json({ error: `Saved-slot limit reached (${maxSlots}).` }, 409)
    }
  }
  await saveDesign(
    c.env,
    session.userId,
    slot,
    typeof state.note === 'string' ? state.note.slice(0, 200) : '',
    raw,
    typeof state.version === 'number' ? state.version : 2,
    state.savedAt ?? new Date().toISOString(),
  )
  return c.json({ ok: true })
})

app.delete('/designs/:slot', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  await deleteDesign(c.env, session.userId, c.req.param('slot'))
  return c.json({ ok: true })
})

// --- Favourites --------------------------------------------------------------
app.get('/favourites', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  const rows = await listFavourites(c.env, session.userId)
  return c.json({
    furniture: rows.filter((r) => r.kind === 'furniture').map((r) => r.def_id),
    finish: rows.filter((r) => r.kind === 'finish').map((r) => r.def_id),
  })
})

app.put('/favourites/:kind/:defId', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  const kind = c.req.param('kind')
  if (kind !== 'furniture' && kind !== 'finish') return c.json({ error: 'Bad kind.' }, 400)
  await addFavourite(c.env, session.userId, kind, c.req.param('defId'))
  return c.json({ ok: true })
})

app.delete('/favourites/:kind/:defId', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  await removeFavourite(c.env, session.userId, c.req.param('kind'), c.req.param('defId'))
  return c.json({ ok: true })
})

// --- Shared asset library (auth-gated R2 proxy) ------------------------------
app.get('/assets/*', async (c) => {
  const session = requireAuth(c)
  if (!session) return c.json({ error: 'Unauthorized.' }, 401)
  if (!rateLimit(`assets:${clientIp(c.req.raw)}`, 600, 60_000)) {
    return c.text('Too many requests.', 429)
  }
  // Everything after `/api/assets/` is the R2 object key.
  const key = decodeURIComponent(c.req.path.slice('/api/assets/'.length))
  if (!key || key.includes('..')) return c.json({ error: 'Bad key.' }, 400)
  return serveAsset(c.env, c.req.raw, key)
})

// --- Remote feature-flag overrides (optional) --------------------------------
app.get('/flags', async (c) => {
  try {
    const raw = await c.env.FLAGS.get('overrides')
    return c.json({ overrides: raw ? JSON.parse(raw) : {} })
  } catch {
    return c.json({ overrides: {} })
  }
})

app.notFound((c) => c.json({ error: 'Not found.' }, 404))

export const onRequest = handle(app)
