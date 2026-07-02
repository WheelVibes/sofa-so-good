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
  /** Optional for the admin gate (password only); the backend provider uses it as the email. */
  username?: string
  password: string
  /** Cloudflare Turnstile token (backend login form only). */
  turnstileToken?: string
}

export interface AuthProvider {
  /** Stable id (e.g. 'local-admin', 'backend'). */
  readonly id: string
  /** Human label for the login screen. */
  readonly label: string
  /** Whether this provider authenticates against a real backend (email + password,
   *  server sessions) vs the client-side admin gate. Drives the login-form shape. */
  readonly backend: boolean
  /** Attempt a sign-in. Async so a network provider fits the same shape. */
  signIn(credentials: Credentials): Promise<SignInResult>
  /** Validate + revive a persisted session value (from localStorage), or null. */
  restore(stored: unknown): AuthUser | null
  /** Optional server-side sign-out (clears the session cookie). */
  signOut?(): Promise<void>
  /** Optional live session validation against the server (revalidates the cookie). */
  validate?(): Promise<AuthUser | null>
}

/** True for an admin session. Future role checks build on this. */
export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin'
}
