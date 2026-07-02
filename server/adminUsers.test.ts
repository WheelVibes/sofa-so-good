// @vitest-environment node
// Uses the node/undici Request so the forbidden `Cookie` header survives
// (happy-dom strips it, which would make every authed request read as anonymous).
import { describe, expect, it } from 'vitest'
import { app } from '../functions/api/[[route]]'
import { verifyPassword } from './crypto'
import {
  countAdmins,
  createUser,
  getUserById,
  updateUserPassword,
  updateUserRole,
} from './db'
import type { Env, UserRow } from './env'
import { createSession, SESSION_COOKIE } from './sessions'

/** Minimal in-memory KV. */
class FakeKV {
  store = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}

/** In-memory D1 covering only the `users` statements used by the admin routes. */
class FakeD1 {
  users: UserRow[] = []
  prepare(sql: string) {
    return new FakeStmt(this, sql.replace(/\s+/g, ' ').trim())
  }
}

class FakeStmt {
  private args: unknown[] = []
  constructor(
    private db: FakeD1,
    private sql: string,
  ) {}
  bind(...args: unknown[]) {
    this.args = args
    return this
  }
  async first<T>(): Promise<T | null> {
    const { sql, db, args } = this
    if (sql.includes('COUNT(*)') && sql.includes("role = 'admin'")) {
      return { n: db.users.filter((u) => u.role === 'admin').length } as unknown as T
    }
    if (sql.includes('COUNT(*)') && sql.includes('FROM users')) {
      return { n: db.users.length } as unknown as T
    }
    if (sql.startsWith('SELECT * FROM users WHERE email')) {
      const email = String(args[0]).toLowerCase()
      return (db.users.find((u) => u.email === email) ?? null) as unknown as T | null
    }
    if (sql.startsWith('SELECT * FROM users WHERE id')) {
      return (db.users.find((u) => u.id === args[0]) ?? null) as unknown as T | null
    }
    return null
  }
  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.startsWith('SELECT * FROM users ORDER BY')) {
      return { results: [...this.db.users] as unknown as T[] }
    }
    return { results: [] }
  }
  async run(): Promise<{ success: boolean }> {
    const { sql, db, args } = this
    if (sql.startsWith('INSERT INTO users')) {
      const [id, email, name, role, password_hash, password_salt, iterations, created_at, created_by] =
        args
      db.users.push({
        id,
        email,
        name,
        role,
        password_hash,
        password_salt,
        iterations,
        created_at,
        created_by,
      } as UserRow)
    } else if (sql.startsWith('UPDATE users SET password_hash')) {
      const [hash, salt, iterations, id] = args
      const u = db.users.find((x) => x.id === id)
      if (u) {
        u.password_hash = hash as string
        u.password_salt = salt as string
        u.iterations = iterations as number
      }
    } else if (sql.startsWith('UPDATE users SET role')) {
      const [role, id] = args
      const u = db.users.find((x) => x.id === id)
      if (u) u.role = role as 'user' | 'admin'
    } else if (sql.startsWith('DELETE FROM users WHERE id')) {
      db.users = db.users.filter((x) => x.id !== args[0])
    }
    return { success: true }
  }
}

function makeEnv() {
  const DB = new FakeD1()
  const SESSIONS = new FakeKV()
  const FLAGS = new FakeKV()
  const env = {
    DB,
    SESSIONS,
    FLAGS,
    PBKDF2_ITERATIONS: '1000',
    SESSION_TTL_SECONDS: '3600',
  } as unknown as Env
  return { env, DB, SESSIONS }
}

async function seedAdmin(env: Env, role: 'user' | 'admin' = 'admin') {
  const u = await createUser(env, {
    email: 'admin@example.com',
    name: 'Admin',
    password: 'seedpassword',
    role,
    createdBy: null,
  })
  const token = await createSession(env, u.id, role)
  return { u, token, cookie: `${SESSION_COOKIE}=${token}` }
}

function patch(env: Env, id: string, cookie: string, body: unknown) {
  return app.request(
    `/api/admin/users/${id}`,
    {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  )
}

describe('db user helpers', () => {
  it('updateUserPassword re-hashes: old password fails, new verifies', async () => {
    const { env, DB } = makeEnv()
    const u = await createUser(env, {
      email: 'a@b.com',
      name: 'A',
      password: 'oldpassword',
      role: 'admin',
      createdBy: null,
    })
    await updateUserPassword(env, u.id, 'newpassword')
    const row = DB.users.find((x) => x.id === u.id) as UserRow
    const stored = { hash: row.password_hash, salt: row.password_salt, iterations: row.iterations }
    expect(await verifyPassword('newpassword', stored)).toBe(true)
    expect(await verifyPassword('oldpassword', stored)).toBe(false)
  })

  it('updateUserRole is reflected by countAdmins', async () => {
    const { env } = makeEnv()
    const a = await createUser(env, {
      email: 'a@b.com',
      name: 'A',
      password: 'password1',
      role: 'admin',
      createdBy: null,
    })
    const b = await createUser(env, {
      email: 'b@b.com',
      name: 'B',
      password: 'password1',
      role: 'user',
      createdBy: null,
    })
    expect(await countAdmins(env)).toBe(1)
    await updateUserRole(env, b.id, 'admin')
    expect(await countAdmins(env)).toBe(2)
    await updateUserRole(env, a.id, 'user')
    expect(await countAdmins(env)).toBe(1)
  })
})

describe('PATCH /api/admin/users/:id', () => {
  it('resets a target user password and revokes their sessions', async () => {
    const { env, DB, SESSIONS } = makeEnv()
    const { cookie } = await seedAdmin(env)
    const target = await createUser(env, {
      email: 'user@b.com',
      name: 'U',
      password: 'password1',
      role: 'user',
      createdBy: null,
    })
    const targetToken = await createSession(env, target.id, 'user')

    const res = await patch(env, target.id, cookie, { password: 'brandnewpw' })
    expect(res.status).toBe(200)

    expect(await SESSIONS.get(`sess:${targetToken}`)).toBeNull()
    const row = DB.users.find((x) => x.id === target.id) as UserRow
    expect(
      await verifyPassword('brandnewpw', {
        hash: row.password_hash,
        salt: row.password_salt,
        iterations: row.iterations,
      }),
    ).toBe(true)
  })

  it('changes a user role', async () => {
    const { env } = makeEnv()
    const { cookie } = await seedAdmin(env)
    const target = await createUser(env, {
      email: 'user@b.com',
      name: 'U',
      password: 'password1',
      role: 'user',
      createdBy: null,
    })
    const res = await patch(env, target.id, cookie, { role: 'admin' })
    expect(res.status).toBe(200)
    expect((await getUserById(env, target.id))?.role).toBe('admin')
  })

  it('refuses to demote the last admin (409)', async () => {
    const { env } = makeEnv()
    const { u, cookie } = await seedAdmin(env)
    const res = await patch(env, u.id, cookie, { role: 'user' })
    expect(res.status).toBe(409)
    expect((await getUserById(env, u.id))?.role).toBe('admin')
  })

  it('rejects a body with no changes (400)', async () => {
    const { env } = makeEnv()
    const { u, cookie } = await seedAdmin(env)
    const res = await patch(env, u.id, cookie, {})
    expect(res.status).toBe(400)
  })

  it('rejects a short password (400)', async () => {
    const { env } = makeEnv()
    const { u, cookie } = await seedAdmin(env)
    const res = await patch(env, u.id, cookie, { password: 'short' })
    expect(res.status).toBe(400)
  })

  it('rejects a non-admin session (403)', async () => {
    const { env } = makeEnv()
    const { u, cookie } = await seedAdmin(env, 'user')
    const res = await patch(env, u.id, cookie, { password: 'brandnewpw' })
    expect(res.status).toBe(403)
  })

  it('re-mints the session when an admin changes their own password', async () => {
    const { env, SESSIONS } = makeEnv()
    const { u, token, cookie } = await seedAdmin(env)
    const res = await patch(env, u.id, cookie, { password: 'password2new' })
    expect(res.status).toBe(200)

    const setCookie = res.headers.get('Set-Cookie') as string
    expect(setCookie).toContain(`${SESSION_COOKIE}=`)
    const newToken = /sofa_session=([^;]+)/.exec(setCookie)?.[1] as string
    expect(await SESSIONS.get(`sess:${newToken}`)).not.toBeNull()
    // The previous session token was revoked.
    expect(await SESSIONS.get(`sess:${token}`)).toBeNull()
  })
})
