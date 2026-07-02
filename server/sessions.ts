/**
 * Session storage in KV. A login writes ONE session key (guarding the 1,000 KV
 * writes/day free cap); every request only READS the session (100k/day). Logout
 * deletes.
 *
 * To support admin-forced credential changes we also keep a per-user token index
 * (`usess:<userId>` -> `{ tokens }`) so all of a user's sessions can be revoked
 * at once. The index is only written on login / logout / revoke — rare events —
 * so the read-heavy hot path (`readSession`) still costs a single KV read.
 */
import { generateToken, uuid } from './crypto'
import { type Env, intVar } from './env'

const SESSION_PREFIX = 'sess:'
const USER_INDEX_PREFIX = 'usess:'
export const SESSION_COOKIE = 'sofa_session'

const DEFAULT_TTL = 60 * 60 * 24 * 14

interface SessionRecord {
  userId: string
  role: 'user' | 'admin'
  createdAt: string
}

function sessionTtl(env: Env): number {
  return intVar(env.SESSION_TTL_SECONDS, DEFAULT_TTL)
}

function parseTokens(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { tokens?: unknown }
    return Array.isArray(parsed.tokens) ? parsed.tokens.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

async function addTokenToIndex(env: Env, userId: string, token: string, ttl: number): Promise<void> {
  const key = `${USER_INDEX_PREFIX}${userId}`
  const tokens = parseTokens(await env.SESSIONS.get(key))
  if (!tokens.includes(token)) tokens.push(token)
  await env.SESSIONS.put(key, JSON.stringify({ tokens }), { expirationTtl: ttl })
}

async function removeTokenFromIndex(env: Env, userId: string, token: string): Promise<void> {
  const key = `${USER_INDEX_PREFIX}${userId}`
  const raw = await env.SESSIONS.get(key)
  if (!raw) return
  const tokens = parseTokens(raw).filter((t) => t !== token)
  if (tokens.length === 0) {
    await env.SESSIONS.delete(key)
  } else {
    await env.SESSIONS.put(key, JSON.stringify({ tokens }), { expirationTtl: sessionTtl(env) })
  }
}

export async function createSession(
  env: Env,
  userId: string,
  role: 'user' | 'admin',
): Promise<string> {
  const token = generateToken()
  const ttl = sessionTtl(env)
  const record: SessionRecord = { userId, role, createdAt: new Date().toISOString() }
  await env.SESSIONS.put(`${SESSION_PREFIX}${token}`, JSON.stringify(record), {
    expirationTtl: ttl,
  })
  await addTokenToIndex(env, userId, token, ttl)
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
  const record = await readSession(env, token)
  await env.SESSIONS.delete(`${SESSION_PREFIX}${token}`)
  if (record) await removeTokenFromIndex(env, record.userId, token)
}

/** Revoke every active session for a user (used when an admin changes their
 *  password or role). Deletes each session key and clears the index. */
export async function revokeUserSessions(env: Env, userId: string): Promise<void> {
  const key = `${USER_INDEX_PREFIX}${userId}`
  const tokens = parseTokens(await env.SESSIONS.get(key))
  await Promise.all(tokens.map((t) => env.SESSIONS.delete(`${SESSION_PREFIX}${t}`)))
  await env.SESSIONS.delete(key)
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
