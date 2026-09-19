import { describe, expect, it } from 'vitest'
import {
  createGestureLease,
  expireGestureLease,
  LEASE_IDLE_MS,
  releaseGestureLease,
  renewGestureLease,
} from './gestureLease'

/** WALK-GESTURE-LEASE (N1) — begin/renew/expire for a source with no end event
 *  (Pointer Lock). The caller owns the clock, so every case here is exact. */
describe('gestureLease', () => {
  it('starts un-held', () => {
    const lease = createGestureLease()
    expect(lease.held).toBe(false)
    expect(expireGestureLease(lease, 10_000)).toBeNull()
    expect(releaseGestureLease(lease)).toBeNull()
  })

  it('the first movement begins, every later one only renews', () => {
    const lease = createGestureLease()
    expect(renewGestureLease(lease, 100)).toBe('begin')
    expect(renewGestureLease(lease, 116)).toBe('renew')
    expect(renewGestureLease(lease, 132)).toBe('renew')
    expect(lease.held).toBe(true)
  })

  it('does not expire while movement keeps renewing it', () => {
    const lease = createGestureLease()
    renewGestureLease(lease, 0)
    for (let t = 16; t <= 4000; t += 16) {
      expect(expireGestureLease(lease, t)).toBeNull()
      renewGestureLease(lease, t)
    }
    expect(lease.held).toBe(true)
  })

  it('expires exactly once, idleMs after the last renewal', () => {
    const lease = createGestureLease()
    renewGestureLease(lease, 1000)
    expect(expireGestureLease(lease, 1000 + LEASE_IDLE_MS - 1)).toBeNull()
    expect(expireGestureLease(lease, 1000 + LEASE_IDLE_MS)).toBe('end')
    // The N1 shape: a second poll must not double-end the shared ref-count.
    expect(expireGestureLease(lease, 1000 + LEASE_IDLE_MS + 5000)).toBeNull()
    expect(lease.held).toBe(false)
  })

  it('a pause shorter than idleMs, then movement, is one continuous gesture', () => {
    const lease = createGestureLease()
    expect(renewGestureLease(lease, 0)).toBe('begin')
    expect(expireGestureLease(lease, 200)).toBeNull()
    expect(renewGestureLease(lease, 200)).toBe('renew')
    expect(expireGestureLease(lease, 400)).toBeNull()
  })

  it('a pause longer than idleMs ends it, and the next movement begins a new one', () => {
    const lease = createGestureLease()
    renewGestureLease(lease, 0)
    expect(expireGestureLease(lease, 300)).toBe('end')
    expect(renewGestureLease(lease, 900)).toBe('begin')
  })

  it('releases unconditionally, and only once — every guaranteed-end path may call it', () => {
    const lease = createGestureLease()
    renewGestureLease(lease, 0)
    expect(releaseGestureLease(lease)).toBe('end')
    // mouseup then blur then unmount, all after the same gesture.
    expect(releaseGestureLease(lease)).toBeNull()
    expect(expireGestureLease(lease, 10_000)).toBeNull()
  })

  it('honours a caller-supplied idle window', () => {
    const lease = createGestureLease()
    renewGestureLease(lease, 0)
    expect(expireGestureLease(lease, 60, 50)).toBe('end')
  })
})
