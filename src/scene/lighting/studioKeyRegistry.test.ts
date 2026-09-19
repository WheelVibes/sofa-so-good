import type { DirectionalLight } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { getOrbitStudioKey, registerOrbitStudioKey } from './studioKeyRegistry'

// A `DirectionalLight` instance is not needed to exercise this module — it only
// stores and returns whatever reference it is given — so a plain object stands
// in, cast through `unknown` to keep the registry's real type signature.
function fakeLight(): DirectionalLight {
  return { visible: true } as unknown as DirectionalLight
}

describe('studioKeyRegistry (WALK-LIGHT-CENSUS-WARMUP)', () => {
  afterEach(() => {
    // Leave no cross-test state — every test starts from "nothing mounted".
    registerOrbitStudioKey(null)
  })

  it('starts with nothing registered', () => {
    expect(getOrbitStudioKey()).toBeNull()
  })

  it('returns exactly the instance last registered', () => {
    const light = fakeLight()
    registerOrbitStudioKey(light)
    expect(getOrbitStudioKey()).toBe(light)
  })

  it('clears on a null registration — the ref-callback unmount case', () => {
    registerOrbitStudioKey(fakeLight())
    registerOrbitStudioKey(null)
    expect(getOrbitStudioKey()).toBeNull()
  })

  it('a fresh registration (React remount → new shadow camera) replaces the old instance', () => {
    const first = fakeLight()
    const second = fakeLight()
    registerOrbitStudioKey(first)
    registerOrbitStudioKey(second)
    expect(getOrbitStudioKey()).toBe(second)
    expect(getOrbitStudioKey()).not.toBe(first)
  })
})
