import { hasBackend } from '../../features/api/client'
import { backendAuthProvider } from '../../features/auth/backendProvider'
import type { AuthProvider, AuthUser, Credentials } from '../../features/auth/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Session state over the active {@link AuthProvider}. Auth requires a real
 * backend: when one is configured (`VITE_API_BASE` set — the Cloudflare
 * deployment, or the local dev backend started by `npm run dev`) real
 * email+password accounts with server sessions are used. Without a backend
 * (GitHub Pages / offline build) there is no provider and no sign-in at all —
 * the app stays fully guest/local.
 *
 * The **server session (HttpOnly cookie) is the single source of truth** for
 * identity — we deliberately do NOT persist the signed-in user (id/name/email)
 * to localStorage, so no personal data sits in clear text at rest where XSS
 * could read it (CodeQL js/clear-text-storage-of-sensitive-information). On
 * boot, `cloudBoot()` calls `refreshAuth()` which revives the session straight
 * from the server via the cookie. `signOut` still clears the legacy `hdb_auth`
 * key so sessions cached by older builds don't linger.
 */
const provider: AuthProvider | null = hasBackend() ? backendAuthProvider : null
/** Legacy key older builds persisted the session under — cleared, never written. */
const LEGACY_LS_KEY = 'hdb_auth'

export interface AuthSlice {
  currentUser: AuthUser | null
  /** Last sign-in error (for the login screen), cleared on success/sign-out. */
  authError: string | null
  /** The active provider's label (for the login screen). */
  authProviderLabel: string
  /** Whether the active provider authenticates against a real backend. */
  authIsBackend: boolean
  signIn: (credentials: Credentials) => Promise<boolean>
  signOut: () => void
  /** Revalidate the persisted session against the server (backend only). */
  refreshAuth: () => Promise<void>
}

export const AUTH_INITIAL: Pick<
  AuthSlice,
  'currentUser' | 'authError' | 'authProviderLabel' | 'authIsBackend'
> = {
  currentUser: null,
  authError: null,
  authProviderLabel: provider?.label ?? '',
  authIsBackend: provider?.backend ?? false,
}

export const createAuthSlice: SliceCreator<AuthSlice, RootState> = (set, get) => ({
  ...AUTH_INITIAL,
  signIn: async (credentials) => {
    if (!provider) {
      set({ authError: 'Sign-in is unavailable in this build.' })
      return false
    }
    const res = await provider.signIn(credentials)
    if (res.ok) {
      // Identity is not persisted — the server cookie is the source of truth
      // (revived by refreshAuth on boot). Nothing to write to localStorage.
      set({ currentUser: res.user, authError: null })
      // Admin unlocks dev-only features → recompute the flag map.
      get().reresolveFeatureFlags()
      return true
    }
    set({ authError: res.error })
    return false
  },
  signOut: () => {
    void provider?.signOut?.()
    try {
      // Purge any session a previous build persisted; we no longer write it.
      globalThis.localStorage?.removeItem(LEGACY_LS_KEY)
    } catch {
      /* ignore */
    }
    set({ currentUser: null, authError: null })
    get().reresolveFeatureFlags()
  },
  refreshAuth: async () => {
    if (!provider?.validate) return
    const user = await provider.validate()
    set({ currentUser: user })
    get().reresolveFeatureFlags()
  },
})
