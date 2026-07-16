import { describe, expect, it } from 'vitest'
import { AQUARIUM_TANK_DIMS } from '../primitives/AquariumStand'
import { BIRD_CAGE_SIZES } from '../primitives/BirdCage'
import { CRATE_SIZES } from '../primitives/DogCrate'
import { HAMSTER_TANK_SIZES } from '../primitives/HamsterTank'
import { PRIMITIVE_COMPONENTS } from '../primitives/index'
import { CC_GRID_CELL } from '../primitives/SmallPetPen'
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

  // ---- Stage P3 — the dog set --------------------------------------------
  it('ships the P3 dog-set line-up, each dog-keyworded with a registered primitive', () => {
    for (const id of [
      'dog-crate',
      'dog-bed-orthopedic',
      'pet-feeding-station',
      'dog-ramp',
      'pet-cooling-mat',
      'pet-toy-bin',
    ]) {
      expect(PETS_DEFS).toHaveProperty(id)
      const def = PETS_DEFS[id] as ParametricDef
      expect(def.category).toBe('pets')
      expect(PRIMITIVE_COMPONENTS[def.primitive]).toBeTypeOf('function')
      // Every P3 item is discoverable by the 'dog' keyword (curation rule).
      expect(def.keywords).toContain('dog')
    }
  })

  it('the dog crate offers XXS–M sizes + wire/furniture styles', () => {
    const crate = PETS_DEFS['dog-crate'] as ParametricDef
    const size = crate.paramSchema.find((f) => f.key === 'size')
    expect(size?.kind).toBe('enum')
    expect(size && 'options' in size ? size.options.map((o) => o.value) : []).toEqual([
      'XXS',
      'XS',
      'S',
      'M',
    ])
    const style = crate.paramSchema.find((f) => f.key === 'style')
    expect(style && 'options' in style ? style.options.map((o) => o.value) : []).toEqual([
      'wire',
      'furniture',
    ])
    expect(crate.frontClearance).toBeGreaterThan(0)
  })

  it('the crate size table stays within the SG small-breed envelope (XXS→M)', () => {
    // XXS ~41×28×23 cm through M ~61×46×51 cm; monotonically non-decreasing.
    const order = ['XXS', 'XS', 'S', 'M']
    const dims = order.map((k) => CRATE_SIZES[k])
    for (const d of dims) expect(d).toBeDefined()
    expect(CRATE_SIZES.XXS).toEqual({ w: 0.41, d: 0.28, h: 0.23 })
    expect(CRATE_SIZES.M).toEqual({ w: 0.61, d: 0.46, h: 0.51 })
    for (let i = 1; i < dims.length; i++) {
      expect(dims[i].w).toBeGreaterThanOrEqual(dims[i - 1].w)
      expect(dims[i].h).toBeGreaterThanOrEqual(dims[i - 1].h)
    }
    // The def's footprint matches the default (S) size.
    expect(PETS_DEFS['dog-crate'].defaultFootprint.w).toBe(CRATE_SIZES.S.w)
  })

  it('the cooling mat is a flat noClip floor covering (like a rug), sized S/M', () => {
    const mat = PETS_DEFS['pet-cooling-mat']
    expect(mat.noClip).toBe(true)
    expect(mat.windowBound).toBeUndefined()
    expect(mat.doorBound).toBeUndefined()
    // Thin: never taller than a rug/threshold.
    expect(mat.defaultFootprint.h).toBeLessThanOrEqual(0.02)
    const size = (mat as ParametricDef).paramSchema.find((f) => f.key === 'size')
    expect(size && 'options' in size ? size.options.map((o) => o.value) : []).toEqual(['S', 'M'])
  })

  it('the orthopedic bed is a distinct rectangular def (not a pet-bed shape clone)', () => {
    const ortho = PETS_DEFS['dog-bed-orthopedic'] as ParametricDef
    expect(ortho.primitive).toBe('DogBedOrthopedic')
    expect(ortho.footprintParams).toEqual({ w: 'width', d: 'depth' })
    // Its own bolster axis, separate from pet-bed's round/rect shape enum.
    expect(ortho.paramSchema.some((f) => f.key === 'bolster_style')).toBe(true)
  })

  it('the feeding station keeps front clearance + a bowl-count control', () => {
    const feeder = PETS_DEFS['pet-feeding-station'] as ParametricDef
    expect(feeder.frontClearance).toBeGreaterThan(0)
    const bowls = feeder.paramSchema.find((f) => f.key === 'bowls')
    expect(bowls?.kind).toBe('enum')
  })

  it('the dog ramp footprint tracks its run + width (ramp/steps styles)', () => {
    const ramp = PETS_DEFS['dog-ramp'] as ParametricDef
    expect(ramp.footprintParams).toEqual({ w: 'width', d: 'length' })
    const height = ramp.paramSchema.find((f) => f.key === 'height')
    expect(height && 'min' in height ? height.min : undefined).toBe(0.4)
    expect(height && 'max' in height ? height.max : undefined).toBe(0.7)
    const style = ramp.paramSchema.find((f) => f.key === 'style')
    expect(style && 'options' in style ? style.options.map((o) => o.value) : []).toEqual([
      'ramp',
      'steps',
    ])
  })

  // ---- Stage P4 — other pets ---------------------------------------------
  it('ships the P4 other-pets line-up, each with a registered primitive', () => {
    for (const id of [
      'bird-cage',
      'bird-play-gym',
      'rabbit-hutch',
      'small-pet-pen',
      'hamster-tank',
      'aquarium-stand',
    ]) {
      expect(PETS_DEFS).toHaveProperty(id)
      const def = PETS_DEFS[id] as ParametricDef
      expect(def.category).toBe('pets')
      expect(PRIMITIVE_COMPONENTS[def.primitive]).toBeTypeOf('function')
    }
  })

  it('keywords each P4 item by its pet type (bird / rabbit / guinea-pig / hamster / fish)', () => {
    const has = (id: string, kw: string) => PETS_DEFS[id].keywords?.includes(kw)
    expect(has('bird-cage', 'bird')).toBe(true)
    expect(has('bird-play-gym', 'bird')).toBe(true)
    expect(has('rabbit-hutch', 'rabbit')).toBe(true)
    expect(has('rabbit-hutch', 'small-pet')).toBe(true)
    expect(has('small-pet-pen', 'guinea-pig')).toBe(true)
    expect(has('small-pet-pen', 'small-pet')).toBe(true)
    expect(has('hamster-tank', 'hamster')).toBe(true)
    expect(has('hamster-tank', 'small-pet')).toBe(true)
    expect(has('aquarium-stand', 'fish')).toBe(true)
  })

  it('the bird cage offers a dome/rect shape + stand/tabletop mount, S/M sizes', () => {
    const cage = PETS_DEFS['bird-cage'] as ParametricDef
    const shape = cage.paramSchema.find((f) => f.key === 'shape')
    expect(shape && 'options' in shape ? shape.options.map((o) => o.value) : []).toEqual([
      'dome',
      'rect',
    ])
    const mount = cage.paramSchema.find((f) => f.key === 'mount')
    expect(mount && 'options' in mount ? mount.options.map((o) => o.value) : []).toEqual([
      'stand',
      'tabletop',
    ])
    // Size table monotonic S → M.
    expect(BIRD_CAGE_SIZES.M.dia).toBeGreaterThan(BIRD_CAGE_SIZES.S.dia)
    expect(BIRD_CAGE_SIZES.M.cageH).toBeGreaterThan(BIRD_CAGE_SIZES.S.cageH)
  })

  it('the rabbit hutch defaults to the researched 135×60×90 cm envelope', () => {
    const hutch = PETS_DEFS['rabbit-hutch'] as ParametricDef
    expect(hutch.defaultFootprint).toEqual({ w: 1.35, d: 0.6, h: 0.9 })
    expect(hutch.footprintParams).toEqual({ w: 'width', d: 'depth' })
    expect(hutch.frontClearance).toBeGreaterThan(0)
    // W/D/H are all editable + clamped.
    for (const key of ['width', 'depth', 'height']) {
      const f = hutch.paramSchema.find((p) => p.key === key)
      expect(f?.kind).toBe('number')
    }
  })

  it('the C&C pen clamps to a 2×3 grid minimum (≈27×41 in)', () => {
    const pen = PETS_DEFS['small-pet-pen'] as ParametricDef
    for (const key of ['gridsX', 'gridsY']) {
      const f = pen.paramSchema.find((p) => p.key === key)
      expect(f?.kind).toBe('integer')
      expect(f && 'min' in f ? f.min : undefined).toBe(2)
    }
    // A 3×2 default grid of 0.36 m cells clears the 27×41 in (≈0.69×1.04 m) minimum.
    expect(CC_GRID_CELL).toBeCloseTo(0.36)
    expect(3 * CC_GRID_CELL).toBeGreaterThanOrEqual(1.04)
    expect(2 * CC_GRID_CELL).toBeGreaterThanOrEqual(0.69)
  })

  it('the hamster enclosure meets the ≥100×50 cm floor at Medium', () => {
    const tank = PETS_DEFS['hamster-tank'] as ParametricDef
    expect(HAMSTER_TANK_SIZES.M.w).toBeGreaterThanOrEqual(1.0)
    expect(HAMSTER_TANK_SIZES.M.d).toBeGreaterThanOrEqual(0.5)
    const base = tank.paramSchema.find((f) => f.key === 'base')
    expect(base && 'options' in base ? base.options.map((o) => o.value) : []).toEqual([
      'floor',
      'stand',
    ])
  })

  it('the aquarium stand surfaces its load rating in the def description', () => {
    const aq = PETS_DEFS['aquarium-stand'] as ParametricDef
    expect(aq.description).toBeTruthy()
    expect(aq.description).toMatch(/kg/)
    // Tank length drives stand dims: 0.6 / 0.9 / 1.2 m present + monotonic.
    const len = aq.paramSchema.find((f) => f.key === 'tankLength')
    expect(len && 'options' in len ? len.options.map((o) => o.value) : []).toEqual([
      '0.6',
      '0.9',
      '1.2',
    ])
    expect(AQUARIUM_TANK_DIMS['1.2'].w).toBeGreaterThan(AQUARIUM_TANK_DIMS['0.6'].w)
    // Cabinet doors are toggleable.
    expect(aq.paramSchema.some((f) => f.key === 'doors')).toBe(true)
  })
})
