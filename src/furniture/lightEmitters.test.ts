import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import {
  isEmitter,
  isItemEmitter,
  LIGHT_EMITTERS,
  OVERRIDE_EMITTER,
  resolveEmitterSpec,
} from './lightEmitters'
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

  describe('user light-source override (PARITY-FURNLIGHT)', () => {
    const sofa = 'sofa-3seat' as FurnitureType

    it('lets any item emit when props.lightOn === yes', () => {
      expect(isItemEmitter(sofa, {})).toBe(false)
      expect(isItemEmitter(sofa, { lightOn: 'yes' })).toBe(true)
    })

    it('resolves the override spec for a flagged non-fixture, none otherwise', () => {
      expect(resolveEmitterSpec(sofa, {})).toBeNull()
      expect(resolveEmitterSpec(sofa, { lightOn: 'yes' })).toBe(OVERRIDE_EMITTER)
    })

    it('keeps the registry spec for a real fixture (override never shadows it)', () => {
      expect(resolveEmitterSpec('table-lamp' as FurnitureType, {})).toBe(
        LIGHT_EMITTERS['table-lamp'],
      )
      // A gated fixture that is OFF does not fall through to the override.
      expect(
        resolveEmitterSpec('vanity' as FurnitureType, { lights: 'no', mirror: 'rect' }),
      ).toBeNull()
    })

    it('OVERRIDE_EMITTER has sane values + reads an item height when present', () => {
      expect(OVERRIDE_EMITTER.intensity).toBeGreaterThan(0)
      expect(OVERRIDE_EMITTER.distance).toBeGreaterThan(0)
      expect(OVERRIDE_EMITTER.height({})).toBeCloseTo(1.2)
      expect(OVERRIDE_EMITTER.height({ height: 0.5 })).toBeCloseTo(0.6)
    })
  })

  describe('per-item power override (WALK-LIGHT-INTERACT)', () => {
    it('lightOn:"no" forces a registered fixture off, overriding its own enabled gate', () => {
      // table-lamp has no `enabled` gate at all (always on by default)…
      expect(isItemEmitter('table-lamp' as FurnitureType, {})).toBe(true)
      expect(isItemEmitter('table-lamp' as FurnitureType, { lightOn: 'no' })).toBe(false)
      expect(resolveEmitterSpec('table-lamp' as FurnitureType, { lightOn: 'no' })).toBeNull()
      // …and a gated fixture that WOULD otherwise pass its own enabled() gate
      // is still forced off by the explicit per-item override.
      expect(
        isItemEmitter('vanity' as FurnitureType, { lights: 'yes', mirror: 'rect', lightOn: 'no' }),
      ).toBe(false)
      expect(
        resolveEmitterSpec('vanity' as FurnitureType, {
          lights: 'yes',
          mirror: 'rect',
          lightOn: 'no',
        }),
      ).toBeNull()
    })

    it('lightOn:"no" also forces off a user-override (non-registered) light source', () => {
      const sofa = 'sofa-3seat' as FurnitureType
      expect(isItemEmitter(sofa, { lightOn: 'yes' })).toBe(true)
      expect(isItemEmitter(sofa, { lightOn: 'no' })).toBe(false)
      expect(resolveEmitterSpec(sofa, { lightOn: 'no' })).toBeNull()
    })

    it('per-item OFF is independent of the scene-wide lightsMode multiplier', () => {
      // `isItemEmitter`/`resolveEmitterSpec` never read `lightsMode` — the
      // item-level gate is evaluated upstream of that brightness multiplier
      // (applied separately in `FurnitureLights.tsx`), so the composition
      // rule holds in every mode ('auto'/'on'/'off'): an item switched off
      // here is excluded from the active-lights set entirely, not merely dimmed.
      expect(resolveEmitterSpec('table-lamp' as FurnitureType, { lightOn: 'no' })).toBeNull()
    })
  })
})
