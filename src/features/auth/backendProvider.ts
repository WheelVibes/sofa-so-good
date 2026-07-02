/**
 * Backend auth provider — email + password against the Cloudflare Pages Function
 * API, with server-side sessions (HttpOnly cookie). Accounts are ADMIN-CREATED
 * only; this provider only signs in / out / validates. Selected in `authSlice`
 * when a backend is configured (`hasBackend()`).
 */
import { ApiError, apiFetch } from '../api/client'
import type { AuthProvider, AuthUser, SignInResult } from './types'

interface ApiUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

function toAuthUser(u: ApiUser): AuthUser {
  return { id: u.id, name: u.name || u.email, role: u.role }
}

function isApiUser(v: unknown): v is AuthUser {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as AuthUser).id === 'string' &&
    ((v as AuthUser).role === 'admin' || (v as AuthUser).role === 'user')
  )
}

export const backendAuthProvider: AuthProvider = {
  id: 'backend',
  label: 'Account',
  backend: true,

  async signIn({ username, password, turnstileToken }): Promise<SignInResult> {
    try {
      const { user } = await apiFetch<{ user: ApiUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: username ?? '', password, turnstileToken }),
      })
      return { ok: true, user: toAuthUser(user) }
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.message : 'Sign-in failed.' }
    }
  },

  restore(stored): AuthUser | null {
    // Optimistic: trust the persisted shape; `validate()` revalidates the cookie on boot.
    return isApiUser(stored) ? (stored as AuthUser) : null
  },

  async signOut(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      /* best-effort; local session is cleared regardless */
    }
  },

  async validate(): Promise<AuthUser | null> {
    try {
      const { user } = await apiFetch<{ user: ApiUser | null }>('/auth/me')
      return user ? toAuthUser(user) : null
    } catch {
      return null
    }
  },
}
