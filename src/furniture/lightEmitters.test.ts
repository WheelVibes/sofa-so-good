import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { isEmitter, isItemEmitter, LIGHT_EMITTERS } from './lightEmitters'
import type { FurnitureType } from './types'

describe('LIGHT_EMITTERS', () => {
  it('every emitter key is a real catalog def', () => {
    for (const id of Object.keys(LIGHT_EMITTERS)) {
      expect(BUILTIN_CATALOG[id], id).toBeDefined()
    }
  })

  it('every emitter spec has sane, finite values', () => {
    for (const [id, spec] of Object.entries(LIGHT_EMITTERS)) {
      const h = spec!.height({})
      expect(Number.isFinite(h), `${id} height`).toBe(true)
      expect(h, `${id} height`).toBeGreaterThanOrEqual(0)
      expect(spec!.intensity, `${id} intensity`).toBeGreaterThan(0)
      expect(spec!.distance, `${id} distance`).toBeGreaterThan(0)
      expect(spec!.color, `${id} color`).toMatch(/^#[0-9a-f]{6}$/i)
      if (spec!.offset) {
        const [ox, oz] = spec!.offset({})
        expect(Number.isFinite(ox) && Number.isFinite(oz), `${id} offset`).toBe(true)
      }
    }
  })

  it('isEmitter reflects registry membership', () => {
    expect(isEmitter('aquarium' as FurnitureType)).toBe(true)
    expect(isEmitter('table-lamp' as FurnitureType)).toBe(true)
    expect(isEmitter('sofa-3seat' as FurnitureType)).toBe(false)
  })

  it('vanity emits only when its Hollywood bulbs are on (rect mirror + lights)', () => {
    // Registered as an emitter at the def level…
    expect(isEmitter('vanity' as FurnitureType)).toBe(true)
    // …but a placed item only emits with lights=yes on the rectangular mirror.
    expect(isItemEmitter('vanity' as FurnitureType, { lights: 'yes', mirror: 'rect' })).toBe(true)
    expect(isItemEmitter('vanity' as FurnitureType, { lights: 'no', mirror: 'rect' })).toBe(false)
    expect(isItemEmitter('vanity' as FurnitureType, { lights: 'yes', mirror: 'round' })).toBe(false)
    expect(isItemEmitter('vanity' as FurnitureType, {})).toBe(false)
    // Ungated emitters are item-emitters with any props.
    expect(isItemEmitter('table-lamp' as FurnitureType, {})).toBe(true)
    expect(isItemEmitter('sofa-3seat' as FurnitureType, {})).toBe(false)
    // The bulb ring sits at the rect mirror's height, just in front of it.
    const spec = LIGHT_EMITTERS.vanity!
    expect(spec.height({})).toBeGreaterThan(0.75)
    expect(spec.height({})).toBeLessThan(1.35)
    const [ox, oz] = spec.offset!({ depth: 0.42 })
    expect(ox).toBe(0)
    expect(oz).toBeGreaterThan(-0.21) // in front of the mirror plane…
    expect(oz).toBeLessThan(0.21) // …within the footprint
  })

  it('places the aquarium light inside its tank', () => {
    const h = LIGHT_EMITTERS.aquarium!.height({})
    // Stand is 0.7 m, tank ~0.42 m → the bulb should sit within the water column.
    expect(h).toBeGreaterThan(0.7)
    expect(h).toBeLessThan(1.12)
  })
})
