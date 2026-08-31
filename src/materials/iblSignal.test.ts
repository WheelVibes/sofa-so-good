import { beforeEach, describe, expect, it } from 'vitest'
import {
  cappedMetalCount,
  effectiveMetalness,
  NO_IBL_METALNESS,
  registerCappedMetal,
  setIblActive,
} from './iblSignal'

// The signal is module state shared across tests, so pin it before each one.
beforeEach(() => {
  setIblActive(true)
})

// IBL-CAP-LIVE — the metalness cap has to track the tier at RUNTIME, not just at
// material-creation time. TIER-ADAPTIVE walks the ladder while the app runs, so a
// material built at the `medium` boot tier outlives IBL the moment the ladder
// demotes to `performance`. Measured before this fix: the default flat's wardrobe
// frame panels sat at metalness 0.75 at `performance` — fully uncapped, nothing to
// reflect, which is the black-slab defect NO_IBL_METALNESS exists to prevent —
// while the door pull (via the SUBSCRIBING MetalMaterial component) was correct.
describe('effectiveMetalness', () => {
  it('passes the requested value through when IBL is available', () => {
    expect(effectiveMetalness(0.75, true)).toBe(0.75)
    expect(effectiveMetalness(0.04, true)).toBe(0.04)
  })

  it('caps only ABOVE the ceiling when IBL is absent', () => {
    expect(effectiveMetalness(0.75, false)).toBe(NO_IBL_METALNESS)
    // A non-metal must be left alone — capping is a ceiling, not a floor.
    expect(effectiveMetalness(0.04, false)).toBe(0.04)
    expect(effectiveMetalness(NO_IBL_METALNESS, false)).toBe(NO_IBL_METALNESS)
  })
})

describe('registerCappedMetal', () => {
  it('applies the cap immediately, against the CURRENT state', () => {
    setIblActive(false)
    const m = registerCappedMetal({ metalness: 0 }, 0.9)
    expect(m.metalness).toBe(NO_IBL_METALNESS)
    setIblActive(true)
    const n = registerCappedMetal({ metalness: 0 }, 0.9)
    expect(n.metalness).toBe(0.9)
  })

  it('re-derives registered materials on every later IBL change, both ways', () => {
    setIblActive(true)
    const m = registerCappedMetal({ metalness: 0 }, 0.75)
    expect(m.metalness).toBe(0.75)
    // Demote: the exact case that was broken — built with IBL, then the ladder
    // drops to performance.
    setIblActive(false)
    expect(m.metalness).toBe(NO_IBL_METALNESS)
    // Promote again: the cap must LIFT, or a demotion would permanently flatten
    // every metal for the session.
    setIblActive(true)
    expect(m.metalness).toBe(0.75)
  })

  it('remembers the REQUESTED value, not the capped one', () => {
    // Keying or storing the capped value is what froze the old behaviour: once
    // flattened to 0.25 there was no way back to 0.75.
    setIblActive(false)
    const m = registerCappedMetal({ metalness: 0 }, 0.9)
    expect(m.metalness).toBe(NO_IBL_METALNESS)
    setIblActive(true)
    expect(m.metalness).toBe(0.9)
  })

  it('leaves sub-ceiling materials untouched across switches', () => {
    setIblActive(true)
    const m = registerCappedMetal({ metalness: 0 }, 0.04)
    setIblActive(false)
    expect(m.metalness).toBe(0.04)
    setIblActive(true)
    expect(m.metalness).toBe(0.04)
  })
})

// `cappedMetalCount` is the registry's own test seam. It existed from v0.31.5.15
// with nothing using it, which the dead-code scan flagged; the tests above all
// assert a MATERIAL's metalness, so none of them pinned that the registry
// actually tracks what it claims to. Asserted as a DELTA, not an absolute:
// `cappable` is module state shared across this whole file and is never reset,
// so an absolute count would depend on test order.
describe('cappedMetalCount', () => {
  it('tracks each registered material', () => {
    const before = cappedMetalCount()
    const a = registerCappedMetal({ metalness: 0 }, 0.9)
    const b = registerCappedMetal({ metalness: 0 }, 0.5)
    expect(cappedMetalCount()).toBe(before + 2)
    // Keep the refs live to the end of the test: the registry holds WeakRefs, so
    // a collected material is pruned and the count would be free to drop.
    expect([a.metalness, b.metalness].every((v) => typeof v === 'number')).toBe(true)
  })
})
