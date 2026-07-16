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

  // ---- Stage P2 — the cat set --------------------------------------------
  it('ships the P2 cat-set line-up, each with a registered primitive', () => {
    for (const id of [
      'cat-tree',
      'cat-wall-shelf',
      'cat-wall-steps',
      'cat-wall-bridge',
      'scratching-post',
      'litter-box',
      'litter-cabinet',
      'cat-window-perch',
      'cat-tunnel',
    ]) {
      expect(PETS_DEFS).toHaveProperty(id)
      const def = PETS_DEFS[id] as ParametricDef
      expect(def.category).toBe('pets')
      expect(PRIMITIVE_COMPONENTS[def.primitive]).toBeTypeOf('function')
      // Every cat item is discoverable by the 'cat' keyword (curation rule).
      expect(def.keywords).toContain('cat')
    }
  })

  it('the wall shelf / steps / bridge are mounted with a mountHeight param', () => {
    for (const id of ['cat-wall-shelf', 'cat-wall-steps', 'cat-wall-bridge']) {
      const def = PETS_DEFS[id] as ParametricDef
      expect(def.mounted).toBe(true)
      expect(def.paramSchema.some((f) => f.key === 'mountHeight')).toBe(true)
    }
  })

  it('the cat wall steps clamp to 3–5 rising steps (count integer field)', () => {
    const steps = PETS_DEFS['cat-wall-steps'] as ParametricDef
    const count = steps.paramSchema.find((f) => f.key === 'count')
    expect(count?.kind).toBe('integer')
    expect(count && 'min' in count ? count.min : undefined).toBe(3)
    expect(count && 'max' in count ? count.max : undefined).toBe(5)
  })

  it('the cat tree exposes tiers (2–5) + sisal/plush controls and stays over its base', () => {
    const tree = PETS_DEFS['cat-tree'] as ParametricDef
    const tiers = tree.paramSchema.find((f) => f.key === 'tiers')
    expect(tiers?.kind).toBe('integer')
    expect(tiers && 'min' in tiers ? tiers.min : undefined).toBe(2)
    expect(tiers && 'max' in tiers ? tiers.max : undefined).toBe(5)
    // Post + platform colour controls (sisal read + plush platforms).
    for (const key of ['postStyle', 'plushColor', 'postColor', 'height', 'baseWidth']) {
      expect(tree.paramSchema.some((f) => f.key === key)).toBe(true)
    }
    // Footprint tracks the base width, so the tree's footprint is its stable base.
    expect(tree.footprintParams).toEqual({ w: 'baseWidth', d: 'baseWidth' })
  })

  it('the window perch is windowBound (snaps to a window at the sill)', () => {
    const perch = PETS_DEFS['cat-window-perch']
    expect(perch.windowBound).toBe(true)
    expect(perch.noClip).toBe(true)
    expect(perch.doorBound).toBeUndefined()
  })

  it('the litter box + cabinet keep front clearance for access', () => {
    expect(PETS_DEFS['litter-box'].frontClearance).toBeGreaterThan(0)
    expect(PETS_DEFS['litter-cabinet'].frontClearance).toBeGreaterThan(0)
  })
})
