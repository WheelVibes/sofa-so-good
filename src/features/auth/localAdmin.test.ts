import { describe, expect, it } from 'vitest'
import { localAdminProvider, verifyAdminPassword } from './localAdmin'
import { isAdminUser } from './types'

describe('verifyAdminPassword', () => {
  it('matches the expected password, rejects wrong/empty', () => {
    expect(verifyAdminPassword('secret', 'secret')).toBe(true)
    expect(verifyAdminPassword('nope', 'secret')).toBe(false)
    expect(verifyAdminPassword('', 'secret')).toBe(false)
    expect(verifyAdminPassword('', '')).toBe(false) // empty never matches
  })
})

describe('localAdminProvider', () => {
  it('signs in with the dev fallback password and returns an admin user', async () => {
    const res = await localAdminProvider.signIn({ password: 'sofa-admin' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.user.role).toBe('admin')
      expect(isAdminUser(res.user)).toBe(true)
    }
  })

  it('rejects a wrong password with an error', async () => {
    const res = await localAdminProvider.signIn({ password: 'wrong' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/incorrect/i)
  })

  it('restores only a valid admin session', () => {
    expect(localAdminProvider.restore({ id: 'admin', name: 'Admin', role: 'admin' })).not.toBeNull()
    expect(localAdminProvider.restore({ role: 'user' })).toBeNull()
    expect(localAdminProvider.restore(null)).toBeNull()
    expect(localAdminProvider.restore('garbage')).toBeNull()
  })
})

describe('isAdminUser', () => {
  it('is true only for an admin user', () => {
    expect(isAdminUser({ id: 'a', name: 'A', role: 'admin' })).toBe(true)
    expect(isAdminUser({ id: 'u', name: 'U', role: 'user' })).toBe(false)
    expect(isAdminUser(null)).toBe(false)
  })
})
