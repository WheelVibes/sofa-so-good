import { hasBackend } from '../../features/api/client'
import { backendAuthProvider } from '../../features/auth/backendProvider'
import { localAdminProvider } from '../../features/auth/localAdmin'
import type { AuthProvider, AuthUser, Credentials } from '../../features/auth/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Session state over the active {@link AuthProvider}. The provider is chosen by
 * build config: when a backend is configured (`VITE_API_BASE` set, i.e. the
 * Cloudflare deployment) real email+password accounts with server sessions are
 * used; otherwise (GitHub Pages / offline) the client-side admin gate applies.
 * The signed-in user is persisted to localStorage and revived through the
 * provider on boot; `refreshAuth` revalidates the server session.
 */
const provider: AuthProvider = hasBackend() ? backendAuthProvider : localAdminProvider
const LS_KEY = 'hdb_auth'

function loadUser(): AuthUser | null {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY)
    return raw ? provider.restore(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

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
  currentUser: loadUser(),
  authError: null,
  authProviderLabel: provider.label,
  authIsBackend: provider.backend,
}

export const createAuthSlice: SliceCreator<AuthSlice, RootState> = (set, get) => ({
  ...AUTH_INITIAL,
  signIn: async (credentials) => {
    const res = await provider.signIn(credentials)
    if (res.ok) {
      try {
        globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(res.user))
      } catch {
        /* ignore persistence failure */
      }
      set({ currentUser: res.user, authError: null })
      // Admin unlocks dev-only features → recompute the flag map.
      get().reresolveFeatureFlags()
      return true
    }
    set({ authError: res.error })
    return false
  },
  signOut: () => {
    void provider.signOut?.()
    try {
      globalThis.localStorage?.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    set({ currentUser: null, authError: null })
    get().reresolveFeatureFlags()
  },
  refreshAuth: async () => {
    if (!provider.validate) return
    const user = await provider.validate()
    try {
      if (user) globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(user))
      else globalThis.localStorage?.removeItem(LS_KEY)
    } catch {
      /* ignore persistence failure */
    }
    set({ currentUser: user })
    get().reresolveFeatureFlags()
  },
})
