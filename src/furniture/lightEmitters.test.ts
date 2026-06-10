import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { isEmitter, LIGHT_EMITTERS } from './lightEmitters'
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

  it('places the aquarium light inside its tank', () => {
    const h = LIGHT_EMITTERS.aquarium!.height({})
    // Stand is 0.7 m, tank ~0.42 m → the bulb should sit within the water column.
    expect(h).toBeGreaterThan(0.7)
    expect(h).toBeLessThan(1.12)
  })
})
