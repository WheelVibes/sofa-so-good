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

  it('signs in with the correct admin password and persists', async () => {
    const ok = await useStore.getState().signIn({ password: 'admin' })
    expect(ok).toBe(true)
    expect(isAdminUser(useStore.getState().currentUser)).toBe(true)
    expect(useStore.getState().authError).toBeNull()
    expect(localStorage.getItem('hdb_auth')).toContain('admin')
  })

  it('records an error on a wrong password and stays signed out', async () => {
    const ok = await useStore.getState().signIn({ password: 'nope' })
    expect(ok).toBe(false)
    expect(useStore.getState().currentUser).toBeNull()
    expect(useStore.getState().authError).toMatch(/incorrect/i)
  })

  it('signs out and clears the persisted session', async () => {
    await useStore.getState().signIn({ password: 'admin' })
    useStore.getState().signOut()
    expect(useStore.getState().currentUser).toBeNull()
    expect(localStorage.getItem('hdb_auth')).toBeNull()
  })
})
