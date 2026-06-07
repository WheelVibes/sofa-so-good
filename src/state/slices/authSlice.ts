import { localAdminProvider } from '../../features/auth/localAdmin'
import type { AuthProvider, AuthUser, Credentials } from '../../features/auth/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Session state over the active {@link AuthProvider}. Today the provider is the
 * client-side `localAdminProvider`; swapping in a backend provider later only
 * changes this constant. The signed-in user is persisted to localStorage and
 * revived (validated) through the provider on boot.
 */
const provider: AuthProvider = localAdminProvider
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
  signIn: (credentials: Credentials) => Promise<boolean>
  signOut: () => void
}

export const AUTH_INITIAL: Pick<AuthSlice, 'currentUser' | 'authError' | 'authProviderLabel'> = {
  currentUser: loadUser(),
  authError: null,
  authProviderLabel: provider.label,
}

export const createAuthSlice: SliceCreator<AuthSlice, RootState> = (set) => ({
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
      return true
    }
    set({ authError: res.error })
    return false
  },
  signOut: () => {
    try {
      globalThis.localStorage?.removeItem(LS_KEY)
    } catch {
      /* ignore */
    }
    set({ currentUser: null, authError: null })
  },
})
