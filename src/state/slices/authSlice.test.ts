// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { isAdminUser } from '../../features/auth/types'
import { useStore } from '../store'

describe('authSlice', () => {
  beforeEach(() => {
    useStore.getState().signOut()
  })

  it('starts signed out', () => {
    expect(useStore.getState().currentUser).toBeNull()
    expect(isAdminUser(useStore.getState().currentUser)).toBe(false)
  })

  it('signIn is unavailable without a backend (no client-side gate)', async () => {
    // The test build leaves VITE_API_BASE unset, so there is no auth provider —
    // sign-in fails closed instead of unlocking a client-side admin gate.
    const ok = await useStore.getState().signIn({ username: 'admin@sofa.dev', password: 'admin' })
    expect(ok).toBe(false)
    expect(useStore.getState().currentUser).toBeNull()
    expect(useStore.getState().authError).toMatch(/unavailable/i)
  })

  it('signs out and clears the persisted session', () => {
    // Simulate a signed-in session the way a backend login would persist one.
    const user = { id: 'u1', name: 'Admin', role: 'admin' as const }
    localStorage.setItem('hdb_auth', JSON.stringify(user))
    useStore.setState({ currentUser: user })
    useStore.getState().signOut()
    expect(useStore.getState().currentUser).toBeNull()
    expect(localStorage.getItem('hdb_auth')).toBeNull()
  })
})
