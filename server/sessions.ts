/**
 * Session storage in KV. A login writes ONE key (guarding the 1,000 KV
 * writes/day free cap); every request only READS (100k/day). Logout deletes.
 */
import { generateToken, uuid } from './crypto'
import { type Env, intVar } from './env'

const SESSION_PREFIX = 'sess:'
export const SESSION_COOKIE = 'sofa_session'

interface SessionRecord {
  userId: string
  role: 'user' | 'admin'
  createdAt: string
}

export async function createSession(
  env: Env,
  userId: string,
  role: 'user' | 'admin',
): Promise<string> {
  const token = generateToken()
  const ttl = intVar(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 14)
  const record: SessionRecord = { userId, role, createdAt: new Date().toISOString() }
  await env.SESSIONS.put(`${SESSION_PREFIX}${token}`, JSON.stringify(record), {
    expirationTtl: ttl,
  })
  return token
}

export async function readSession(env: Env, token: string | null): Promise<SessionRecord | null> {
  if (!token) return null
  const raw = await env.SESSIONS.get(`${SESSION_PREFIX}${token}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

export async function destroySession(env: Env, token: string | null): Promise<void> {
  if (!token) return
  await env.SESSIONS.delete(`${SESSION_PREFIX}${token}`)
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function sessionCookie(token: string, ttlSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export { uuid }
