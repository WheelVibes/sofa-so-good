/**
 * Auth abstraction. The only implementation is `backendAuthProvider`
 * (email+password against the Cloudflare API with server sessions — see
 * `backendProvider.ts`); the `AuthProvider` interface stays generic so another
 * provider (OAuth / magic-link) could be dropped in without touching store/UI.
 *
 * Auth requires a real backend (`hasBackend()`). A build with no backend
 * (GitHub Pages / offline) has no provider and no sign-in at all — it is fully
 * guest/local, so there is no client-side gate to mistake for a security
 * boundary.
 */

type UserRole = 'admin' | 'user'

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
