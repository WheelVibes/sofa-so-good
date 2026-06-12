/**
 * Client-side admin provider. Unlocks dev-only features behind a password.
 *
 * SECURITY: this is **not** a security boundary. The expected password ships in
 * the client bundle and the session is just a localStorage flag, so a determined
 * user can bypass it (read the bundle, set localStorage, use `?ff=`). It exists
 * to keep dev/QA-only surfaces out of the *normal* user's way, not to protect
 * anything. A real auth boundary needs the future backend provider.
 *
 * The expected password comes from `VITE_ADMIN_PASSWORD` at build time, with a
 * dev fallback so local dev works out of the box.
 */
import type { AuthProvider, AuthUser, SignInResult } from './types'

export const ADMIN_USER: AuthUser = { id: 'admin', name: 'Admin', role: 'admin' }

const EXPECTED_PASSWORD =
  ((import.meta.env?.VITE_ADMIN_PASSWORD as string | undefined) ?? '').trim() || 'admin'

/** Pure password check (injectable expected value for testing). */
export function verifyAdminPassword(input: string, expected: string = EXPECTED_PASSWORD): boolean {
  return input.length > 0 && input === expected
}

export const localAdminProvider: AuthProvider = {
  id: 'local-admin',
  label: 'Admin',
  async signIn({ password }): Promise<SignInResult> {
    if (verifyAdminPassword(password)) return { ok: true, user: ADMIN_USER }
    return { ok: false, error: 'Incorrect password.' }
  },
  restore(stored): AuthUser | null {
    if (
      stored &&
      typeof stored === 'object' &&
      (stored as AuthUser).role === 'admin' &&
      typeof (stored as AuthUser).id === 'string'
    ) {
      return stored as AuthUser
    }
    return null
  },
}
