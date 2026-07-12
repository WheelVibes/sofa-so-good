import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { GENERATED_FURNITURE } from './generatedCatalog'
import { applyDecorStyling } from './layout/decorStyling'
import { FURNITURE_CATEGORIES, type FurnitureDef, type FurnitureItem } from './types'

const PROJECT_ROOT = resolve(__dirname, '../../')

/** The CC0/CC-BY GLB set-dressing props added by the asset pipeline
 *  (scripts/asset-pipeline/index-assets.ts). These are what PHOTO-DETAIL-PROPS
 *  ships; the pool tables predate this file and are covered by the same checks. */
describe('GENERATED_FURNITURE (bundled GLB props)', () => {
  it('has entries', () => {
    expect(GENERATED_FURNITURE.length).toBeGreaterThan(0)
  })

  it('every def is a well-formed builtin gltf with a real-metre footprint', () => {
    for (const def of GENERATED_FURNITURE) {
      expect(def.kind).toBe('gltf')
      if (def.kind !== 'gltf') continue
      expect(def.source).toBe('builtin')
      // Footprint is real metres and non-degenerate — a vase must not be 2 m tall.
      expect(def.defaultFootprint.w).toBeGreaterThan(0)
      expect(def.defaultFootprint.d).toBeGreaterThan(0)
      expect(def.defaultFootprint.h).toBeGreaterThan(0)
      expect(def.defaultFootprint.w).toBeLessThan(3)
      expect(def.defaultFootprint.d).toBeLessThan(3)
      expect(def.defaultFootprint.h).toBeLessThan(2)
      // Category is a real FurnitureCategory so it lands in a catalog tab.
      expect(FURNITURE_CATEGORIES).toContain(def.category)
    }
  })

  it('carries a valid licence (+ attribution/source when required)', () => {
    for (const def of GENERATED_FURNITURE) {
      if (def.kind !== 'gltf' || def.source !== 'builtin') continue
      expect(['CC0', 'CC-BY']).toContain(def.license)
      // A source URL is present and well-formed for every attributed asset.
      expect(() => new URL(def.sourceUrl ?? '')).not.toThrow()
      // CC-BY MUST carry an attribution string (shown in inspector + CREDITS).
      if (def.license === 'CC-BY') expect((def.attribution ?? '').length).toBeGreaterThan(0)
    }
  })

  it('every referenced GLB file exists and starts with the glTF magic header', () => {
    for (const def of GENERATED_FURNITURE) {
      if (def.kind !== 'gltf' || def.source !== 'builtin') continue
      // url is `${BASE_URL}assets/...`; BASE_URL is '/' under vitest.
      const buf = readFileSync(resolve(PROJECT_ROOT, `public${def.url}`))
      expect(buf.length).toBeGreaterThan(12)
      // 'glTF' little-endian = 0x46546C67
      expect(buf.readUInt32LE(0)).toBe(0x46546c67)
    }
  })

  it('ids are unique and do not collide with BUILTIN_CATALOG', () => {
    const ids = GENERATED_FURNITURE.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(BUILTIN_CATALOG[id as never]).toBeUndefined()
  })
})

/** The CC0 tabletop props registered as auto-styling options (decorStyling.ts).
 *  They must be `noClip` (so the styling pass drops them onto a host surface
 *  without a placement conflict, exactly like the parametric decor primitives)
 *  and must actually surface when the merged catalog is available. */
describe('GLB set-dressing props in the auto-styling pass', () => {
  const genById = Object.fromEntries(GENERATED_FURNITURE.map((d) => [d.id, d]))
  const STYLING_PROPS = [
    'ceramic-vase-wide',
    'ceramic-vase-slim',
    'potted-succulent',
    'book-set',
    'standing-photo-frame',
    'tea-set',
  ] as const

  it('every styling-registered GLB prop is noClip', () => {
    for (const id of STYLING_PROPS) {
      const def = genById[id] as FurnitureDef | undefined
      expect(def, `${id} present in generated catalog`).toBeDefined()
      expect(def?.noClip, `${id} is noClip`).toBe(true)
    }
  })

  it('the floor-standing GLB props (plant, lamp) are NOT noClip (they collide)', () => {
    for (const id of ['potted-plant-leafy', 'desk-lamp-arm']) {
      const def = genById[id] as FurnitureDef | undefined
      expect(def).toBeDefined()
      expect(def?.noClip ?? false).toBe(false)
    }
  })

  it('a GLB prop surfaces on a host when the merged catalog is passed', () => {
    const merged: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG, ...genById }
    // Enlarge the coffee-table footprint so its per-surface budget reaches the
    // second priority slot ('tea-set'), where the CC0 GLB prop is registered.
    merged['coffee-table'] = {
      ...merged['coffee-table'],
      defaultFootprint: { w: 2, d: 1, h: 0.42 },
    } as FurnitureDef
    const host: FurnitureItem = {
      id: 'host-coffee',
      defId: 'coffee-table' as FurnitureItem['defId'],
      position: [3, 3],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([host], merged)
    expect(decor.some((d) => d.defId === 'tea-set')).toBe(true)
    // And the prop self-lifts to the host top via surfaceHeight (no double-lift).
    for (const d of decor.filter((x) => x.defId === 'tea-set')) {
      expect(d.props.surfaceHeight).toBeCloseTo(0.42, 5)
      expect(d.elevation ?? 0).toBe(0)
    }
  })

  it('the same host with only BUILTIN_CATALOG skips the GLB prop cleanly (no crash)', () => {
    // decorStyling must tolerate an unresolved prop id (BUILTIN_CATALOG lacks the
    // generated defs) by skipping that slot — never emitting a broken item.
    const host: FurnitureItem = {
      id: 'host-coffee-2',
      defId: 'coffee-table' as FurnitureItem['defId'],
      position: [3, 3],
      rotation: 0,
      props: {},
    }
    const decor = applyDecorStyling([host], BUILTIN_CATALOG)
    expect(decor.every((d) => d.defId !== 'tea-set')).toBe(true)
    expect(decor.length).toBeGreaterThan(0)
  })
})
