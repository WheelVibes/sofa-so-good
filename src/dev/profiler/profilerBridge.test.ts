import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, profilerBridge } from './profilerBridge'
import type { MetricsSample } from './profilerTypes'

function sample(t: number): MetricsSample {
  return {
    t,
    fps: 60,
    frameMs: 16.7,
    calls: 100,
    triangles: 5000,
    lines: 0,
    points: 0,
    geometries: 40,
    textures: 20,
    heapMB: 128,
    lights: 3,
    continuous: true,
  }
}

describe('profilerBridge', () => {
  beforeEach(() => profilerBridge.__resetForTest())

  it('stores the latest sample and exposes it via getSnapshot', () => {
    profilerBridge.pushSample(sample(1))
    profilerBridge.pushSample(sample(2))
    const snap = profilerBridge.getSnapshot()
    expect(snap.latest?.t).toBe(2)
    expect(snap.history.length).toBe(2)
    expect(snap.history[0].t).toBe(1)
  })

  it('caps history at HISTORY_LIMIT, keeping the newest', () => {
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) profilerBridge.pushSample(sample(i))
    const snap = profilerBridge.getSnapshot()
    expect(snap.history.length).toBe(HISTORY_LIMIT)
    expect(snap.history[snap.history.length - 1].t).toBe(HISTORY_LIMIT + 24)
    expect(snap.history[0].t).toBe(25)
  })

  it('notifies subscribers on push and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = profilerBridge.subscribe(cb)
    profilerBridge.pushSample(sample(1))
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
    profilerBridge.pushSample(sample(2))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('reflects the tier set via setTier', () => {
    profilerBridge.setTier('high')
    expect(profilerBridge.getSnapshot().tier).toBe('high')
  })
})
