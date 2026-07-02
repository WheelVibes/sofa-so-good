/**
 * D1 data access for users, designs, and favourites. Thin, typed wrappers so the
 * route handlers stay declarative.
 */
import { hashPassword, uuid } from './crypto'
import { type Env, intVar, type UserRow } from './env'

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first<UserRow>()
  return row ?? null
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>()
  return row ?? null
}

export async function countUsers(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  return row?.n ?? 0
}

export async function listUsers(env: Env): Promise<UserRow[]> {
  const res = await env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>()
  return res.results ?? []
}

export interface CreateUserInput {
  email: string
  name: string
  password: string
  role: 'user' | 'admin'
  createdBy: string | null
}

export async function createUser(env: Env, input: CreateUserInput): Promise<UserRow> {
  const iterations = intVar(env.PBKDF2_ITERATIONS, 100_000)
  const { hash, salt } = await hashPassword(input.password, iterations)
  const row: UserRow = {
    id: uuid(),
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    password_hash: hash,
    password_salt: salt,
    iterations,
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
  }
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, password_salt, iterations, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.email,
      row.name,
      row.role,
      row.password_hash,
      row.password_salt,
      row.iterations,
      row.created_at,
      row.created_by,
    )
    .run()
  return row
}

export async function deleteUser(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
}

export async function countAdmins(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{
    n: number
  }>()
  return row?.n ?? 0
}

export async function updateUserPassword(env: Env, id: string, password: string): Promise<void> {
  const iterations = intVar(env.PBKDF2_ITERATIONS, 100_000)
  const { hash, salt } = await hashPassword(password, iterations)
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, iterations = ? WHERE id = ?',
  )
    .bind(hash, salt, iterations, id)
    .run()
}

export async function updateUserRole(env: Env, id: string, role: 'user' | 'admin'): Promise<void> {
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run()
}

/** Seed the first admin from ADMIN_EMAIL/ADMIN_PASSWORD if no admin exists yet.
 *  Idempotent; safe to call on any request cheaply after the first run. */
export async function ensureAdminSeed(env: Env): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return
  const existing = await getUserByEmail(env, env.ADMIN_EMAIL)
  if (existing) return
  await createUser(env, {
    email: env.ADMIN_EMAIL,
    name: 'Admin',
    password: env.ADMIN_PASSWORD,
    role: 'admin',
    createdBy: null,
  })
}

// --- Designs -----------------------------------------------------------------

export interface DesignMeta {
  slot: string
  savedAt: string
  name: string
}

export async function listDesigns(env: Env, userId: string): Promise<DesignMeta[]> {
  const res = await env.DB.prepare(
    'SELECT slot, saved_at AS savedAt, name FROM designs WHERE user_id = ? ORDER BY saved_at DESC',
  )
    .bind(userId)
    .all<DesignMeta>()
  return res.results ?? []
}

export async function loadDesign(env: Env, userId: string, slot: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT json FROM designs WHERE user_id = ? AND slot = ?')
    .bind(userId, slot)
    .first<{ json: string }>()
  return row?.json ?? null
}

export async function saveDesign(
  env: Env,
  userId: string,
  slot: string,
  name: string,
  json: string,
  version: number,
  savedAt: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO designs (id, user_id, slot, name, json, version, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, slot) DO UPDATE SET
       name = excluded.name, json = excluded.json, version = excluded.version, saved_at = excluded.saved_at`,
  )
    .bind(uuid(), userId, slot, name, json, version, savedAt)
    .run()
}

export async function deleteDesign(env: Env, userId: string, slot: string): Promise<void> {
  await env.DB.prepare('DELETE FROM designs WHERE user_id = ? AND slot = ?')
    .bind(userId, slot)
    .run()
}

/** Named slots for a user (excludes the autosave slot). */
export async function countNamedSlots(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM designs WHERE user_id = ? AND slot != 'autosave'",
  )
    .bind(userId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

// --- Favourites --------------------------------------------------------------

export interface FavouriteRow {
  kind: 'furniture' | 'finish'
  def_id: string
}

export async function listFavourites(env: Env, userId: string): Promise<FavouriteRow[]> {
  const res = await env.DB.prepare(
    'SELECT kind, def_id FROM favourites WHERE user_id = ? ORDER BY created_at ASC',
  )
    .bind(userId)
    .all<FavouriteRow>()
  return res.results ?? []
}

export async function addFavourite(
  env: Env,
  userId: string,
  kind: string,
  defId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO favourites (user_id, kind, def_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, kind, def_id) DO NOTHING`,
  )
    .bind(userId, kind, defId, new Date().toISOString())
    .run()
}

export async function removeFavourite(
  env: Env,
  userId: string,
  kind: string,
  defId: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM favourites WHERE user_id = ? AND kind = ? AND def_id = ?')
    .bind(userId, kind, defId)
    .run()
}
