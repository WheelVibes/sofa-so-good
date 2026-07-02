/**
 * Cloudflare bindings + tunables available to the Pages Function API.
 * Mirrors wrangler.toml. Secrets (ADMIN_*, TURNSTILE_SECRET) are injected at
 * runtime and are optional at the type level so local/preview runs don't crash.
 */
export interface Env {
  /** D1: accounts, saved layouts, favourites. */
  DB: D1Database
  /** R2: shared, read-only asset library. */
  LIBRARY: R2Bucket
  /** KV: session token -> user id (TTL). */
  SESSIONS: KVNamespace
  /** KV: general-purpose cache (asset index, etc.). */
  CACHE: KVNamespace
  /** KV: feature-flag overrides + guardrail kill-switch state. */
  FLAGS: KVNamespace

  /** First-admin seed (set via `wrangler pages secret put`). */
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  /** Cloudflare Turnstile secret for the login form. */
  TURNSTILE_SECRET?: string

  PBKDF2_ITERATIONS?: string
  SESSION_TTL_SECONDS?: string
  MAX_ACCOUNTS?: string
  MAX_SLOTS_PER_USER?: string
  MAX_DESIGN_BYTES?: string
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  password_hash: string
  password_salt: string
  iterations: number
  created_at: string
  created_by: string | null
}

/** Public view of a user (never leaks the password fields). */
export interface PublicUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  createdAt: string
}

export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at }
}

export function intVar(v: string | undefined, fallback: number): number {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
