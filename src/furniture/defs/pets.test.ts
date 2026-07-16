import { describe, expect, it } from 'vitest'
import { PRIMITIVE_COMPONENTS } from '../primitives/index'
import { defaultParamProps, type FurnitureDef, type ParametricDef } from '../types'
import { PETS_DEFS as PETS_DEFS_TYPED } from './pets'

const PETS_DEFS = PETS_DEFS_TYPED as Record<string, FurnitureDef>

/**
 * Pet program Stage P1 — the `pets` category defs: pet bed (moved from decor,
 * id unchanged), window/balcony mesh screen (windowBound), doorway pet gate +
 * pet-door insert (doorBound), freestanding playpen.
 */
describe('PETS_DEFS', () => {
  it('every def is in the pets category with a registered primitive', () => {
    for (const def of Object.values(PETS_DEFS)) {
      expect(def.category).toBe('pets')
      expect(def.kind).toBe('parametric')
      expect(PRIMITIVE_COMPONENTS[(def as ParametricDef).primitive]).toBeTypeOf('function')
    }
  })

  it('ships the P1 line-up', () => {
    for (const id of [
      'pet-bed',
      'window-mesh-screen',
      'pet-gate',
      'pet-door-insert',
      'pet-playpen',
    ]) {
      expect(PETS_DEFS).toHaveProperty(id)
    }
  })

  it('keeps the pet-bed id (saved designs reference the def id, not its category)', () => {
    expect(PETS_DEFS['pet-bed'].id).toBe('pet-bed')
    expect((PETS_DEFS['pet-bed'] as ParametricDef).primitive).toBe('PetBed')
  })

  it('the window mesh screen is windowBound (snaps like a curtain)', () => {
    expect(PETS_DEFS['window-mesh-screen'].windowBound).toBe(true)
    expect(PETS_DEFS['window-mesh-screen'].doorBound).toBeUndefined()
  })

  it('the pet gate and pet-door insert are doorBound (span a doorway)', () => {
    expect(PETS_DEFS['pet-gate'].doorBound).toBe(true)
    expect(PETS_DEFS['pet-door-insert'].doorBound).toBe(true)
  })

  it('the playpen is a freestanding floor item with front clearance', () => {
    expect(PETS_DEFS['pet-playpen'].windowBound).toBeUndefined()
    expect(PETS_DEFS['pet-playpen'].doorBound).toBeUndefined()
    expect(PETS_DEFS['pet-playpen'].frontClearance).toBeGreaterThan(0)
  })

  it('every def yields valid default props (schema is well-formed)', () => {
    for (const def of Object.values(PETS_DEFS)) {
      const props = defaultParamProps(def as ParametricDef)
      expect(Object.keys(props).length).toBeGreaterThan(0)
      for (const f of (def as ParametricDef).paramSchema) {
        expect(props[f.key]).toBe(f.default)
      }
    }
  })
})
