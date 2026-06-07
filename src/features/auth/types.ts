/**
 * Auth abstraction. Today there's a single client-side `LocalAdminProvider`
 * (admin unlock for dev-only features); the `AuthProvider` interface is shaped
 * so a real backend provider (OAuth / email+password / magic-link issuing a
 * session token) can be dropped in later without touching the store/UI.
 *
 * IMPORTANT: a client-side-only build has **no real security boundary** — any
 * gate here hides UI, it cannot protect secrets. Real auth requires the future
 * backend. See `localAdmin.ts`.
 */

export type UserRole = 'admin' | 'user'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
}

export type SignInResult = { ok: true; user: AuthUser } | { ok: false; error: string }

export interface Credentials {
  /** Optional for the admin gate (password only); future providers may use it. */
  username?: string
  password: string
}

export interface AuthProvider {
  /** Stable id (e.g. 'local-admin', 'oauth-google'). */
  readonly id: string
  /** Human label for the login screen. */
  readonly label: string
  /** Attempt a sign-in. Async so a future network provider fits the same shape. */
  signIn(credentials: Credentials): Promise<SignInResult>
  /** Validate + revive a persisted session value (from localStorage), or null. */
  restore(stored: unknown): AuthUser | null
}

/** True for an admin session. Future role checks build on this. */
export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin'
}
