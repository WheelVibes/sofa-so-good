import { describe, expect, it } from 'vitest'
import type { Env } from './env'
import { createSession, destroySession, readSession, revokeUserSessions } from './sessions'

/** Minimal in-memory KV (get/put/delete) — TTL/options are ignored. */
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

function makeEnv() {
  const SESSIONS = new FakeKV()
  const env = { SESSIONS, SESSION_TTL_SECONDS: '3600' } as unknown as Env
  return { env, SESSIONS }
}

describe('session token index + revocation', () => {
  it('indexes every token per user; readSession returns the record', async () => {
    const { env, SESSIONS } = makeEnv()
    const t1 = await createSession(env, 'u1', 'admin')
    const t2 = await createSession(env, 'u1', 'admin')
    expect(await readSession(env, t1)).toMatchObject({ userId: 'u1', role: 'admin' })
    const idx = JSON.parse((await SESSIONS.get('usess:u1')) as string)
    expect(idx.tokens).toEqual(expect.arrayContaining([t1, t2]))
    expect(idx.tokens).toHaveLength(2)
  })

  it('revokeUserSessions deletes every session key and the index, leaving others intact', async () => {
    const { env, SESSIONS } = makeEnv()
    const t1 = await createSession(env, 'u1', 'user')
    const t2 = await createSession(env, 'u1', 'user')
    const other = await createSession(env, 'u2', 'user')
    await revokeUserSessions(env, 'u1')
    expect(await readSession(env, t1)).toBeNull()
    expect(await readSession(env, t2)).toBeNull()
    expect(await SESSIONS.get('usess:u1')).toBeNull()
    expect(await readSession(env, other)).toMatchObject({ userId: 'u2' })
  })

  it('destroySession removes only that token from the index', async () => {
    const { env, SESSIONS } = makeEnv()
    const t1 = await createSession(env, 'u1', 'user')
    const t2 = await createSession(env, 'u1', 'user')
    await destroySession(env, t1)
    expect(await readSession(env, t1)).toBeNull()
    expect(await readSession(env, t2)).toMatchObject({ userId: 'u1' })
    const idx = JSON.parse((await SESSIONS.get('usess:u1')) as string)
    expect(idx.tokens).toEqual([t2])
  })

  it('destroying the last token clears the index key', async () => {
    const { env, SESSIONS } = makeEnv()
    const t1 = await createSession(env, 'u1', 'user')
    await destroySession(env, t1)
    expect(await SESSIONS.get('usess:u1')).toBeNull()
  })
})
