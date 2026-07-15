import { describe, expect, it } from 'vitest'
import { buildEditedObject } from './buildObject'
import { createEmptySpec, isBuildable, partGroups, type ShapePart } from './editSpec'
import { matchingFinishPresetId } from './finishPresets'
import {
  buildTemplate,
  insertTemplate,
  resolveTemplateParams,
  TEMPLATE_LIBRARY,
  type TemplateDef,
  templateById,
} from './templates'

/** Loose world AABB over parts (position ± size/2, ignoring rotation). Template
 *  parts are axis-aligned boxes/legs, so this is exact enough for proportions. */
function aabb(parts: ShapePart[]) {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const p of parts) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p.position[a] - p.size[a] / 2)
      hi[a] = Math.max(hi[a], p.position[a] + p.size[a] / 2)
    }
  }
  return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2] }
}

describe('template library', () => {
  it('exposes exactly 6 archetype starters with unique ids and 2–4 params each', () => {
    expect(TEMPLATE_LIBRARY.length).toBe(6)
    const ids = new Set<string>()
    for (const t of TEMPLATE_LIBRARY) {
      expect(ids.has(t.id)).toBe(false)
      ids.add(t.id)
      expect(t.params.length).toBeGreaterThanOrEqual(2)
      expect(t.params.length).toBeLessThanOrEqual(4)
      // Every param names an ergonomic standard in its hint + has a sane range.
      for (const p of t.params) {
        expect(p.hint.length).toBeGreaterThan(0)
        expect(p.min).toBeLessThan(p.max)
        expect(p.default).toBeGreaterThanOrEqual(p.min)
        expect(p.default).toBeLessThanOrEqual(p.max)
      }
    }
    // The six required archetypes are present.
    for (const id of [
      'dining-table',
      'coffee-table',
      'bookshelf',
      'cabinet',
      'bed-frame',
      'sofa-frame',
    ]) {
      expect(templateById(id)).not.toBeNull()
    }
    expect(templateById('nope')).toBeNull()
  })

  it.each(
    TEMPLATE_LIBRARY.map((t) => [t.id, t] as const),
  )('%s builds a buildable spec with a single wrapping group of finite parts', (_id, def: TemplateDef) => {
    const result = buildTemplate(def)
    expect(result.parts.length).toBeGreaterThanOrEqual(4)
    // Exactly one wrapping group holding every part (one move handle).
    expect(result.groups.length).toBe(1)
    const ids = new Set(result.parts.map((p) => p.id))
    expect(ids.size).toBe(result.parts.length) // unique ids
    expect(result.groups[0].partIds.length).toBe(result.parts.length)
    for (const gid of result.groups[0].partIds) expect(ids.has(gid)).toBe(true)
    // Finite, positive-size, floor-anchored geometry.
    const box = aabb(result.parts)
    for (const p of result.parts) {
      for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
      for (const s of p.size) expect(s).toBeGreaterThan(0)
    }
    expect(box.lo[1]).toBeGreaterThanOrEqual(-1e-6) // nothing below the floor
    expect(box.lo[1]).toBeLessThan(0.02) // something reaches the floor
    // Inserts into an empty spec and builds a real three object without throwing.
    const { spec } = insertTemplate(createEmptySpec(), result)
    expect(isBuildable(spec)).toBe(true)
    const obj = buildEditedObject(null, spec)
    expect(obj.children.length).toBeGreaterThan(0)
  })
})

describe('template geometry tracks its params (bbox)', () => {
  it('dining table: top face sits at the height param, legs reach the floor', () => {
    const parts = buildTemplate(templateById('dining-table')!, {
      width: 1.6,
      depth: 0.95,
      height: 0.75,
    }).parts
    const b = aabb(parts)
    expect(b.hi[1]).toBeCloseTo(0.75, 2) // tabletop top == H
    expect(b.lo[1]).toBeCloseTo(0, 2) // legs reach the floor
    expect(b.w).toBeCloseTo(1.6, 2)
    expect(b.d).toBeCloseTo(0.95, 2)
  })

  it('coffee table defaults sit lower than a dining table', () => {
    const coffee = aabb(buildTemplate(templateById('coffee-table')!).parts).hi[1]
    const dining = aabb(buildTemplate(templateById('dining-table')!).parts).hi[1]
    expect(coffee).toBeLessThan(dining)
    expect(coffee).toBeGreaterThan(0.34)
    expect(coffee).toBeLessThan(0.5)
  })

  it('bookshelf reuses the parametric generator (shelf count → part count grows)', () => {
    const few = buildTemplate(templateById('bookshelf')!, { shelves: 2 }).parts.length
    const many = buildTemplate(templateById('bookshelf')!, { shelves: 6 }).parts.length
    expect(many).toBeGreaterThan(few)
    const b = aabb(
      buildTemplate(templateById('bookshelf')!, { width: 0.9, height: 1.8, depth: 0.3 }).parts,
    )
    expect(b.w).toBeCloseTo(0.9, 1)
    expect(b.hi[1]).toBeCloseTo(1.8, 1)
  })

  it('bed frame matches the SG mattress preset (Queen wider than Single)', () => {
    const single = aabb(buildTemplate(templateById('bed-frame')!, { size: 0 }).parts).w
    const queen = aabb(buildTemplate(templateById('bed-frame')!, { size: 2 }).parts).w
    expect(single).toBeCloseTo(0.91 + 0.08, 1) // mattress + overhang
    expect(queen).toBeCloseTo(1.52 + 0.08, 1)
    expect(queen).toBeGreaterThan(single)
  })

  it('sofa cushions carry the Velvet finish preset', () => {
    const parts = buildTemplate(templateById('sofa-frame')!).parts
    const velvety = parts.filter((p) => matchingFinishPresetId(p) === 'velvet')
    expect(velvety.length).toBeGreaterThanOrEqual(2) // ≥ seat + back cushions
    for (const p of velvety) expect(p.sheen ?? 0).toBeGreaterThan(0)
  })
})

describe('ergonomic clamps hold', () => {
  it.each(
    TEMPLATE_LIBRARY.map((t) => [t.id, t] as const),
  )('%s clamps every param to its ergonomic range', (_id, def: TemplateDef) => {
    const tooBig: Record<string, number> = {}
    const tooSmall: Record<string, number> = {}
    for (const p of def.params) {
      tooBig[p.key] = p.max * 10 + 100
      tooSmall[p.key] = p.min - 100
    }
    const hi = resolveTemplateParams(def, tooBig)
    const lo = resolveTemplateParams(def, tooSmall)
    for (const p of def.params) {
      expect(hi[p.key]).toBeLessThanOrEqual(p.max)
      expect(lo[p.key]).toBeGreaterThanOrEqual(p.min)
    }
  })

  it('garbage / missing overrides fall back to the ergonomic default', () => {
    const def = templateById('dining-table')!
    const r = resolveTemplateParams(def, { width: Number.NaN } as Record<string, number>)
    expect(r.width).toBe(1.4)
    expect(r.height).toBe(0.75)
  })
})

describe('insertTemplate', () => {
  it('replaces an empty spec (group at identity, no offset)', () => {
    const result = buildTemplate(templateById('dining-table')!)
    const { spec, groupId } = insertTemplate(createEmptySpec(), result)
    expect(spec.parts.length).toBe(result.parts.length)
    expect(partGroups(spec).length).toBe(1)
    expect(partGroups(spec)[0].position).toBeUndefined() // identity — replace
    expect(groupId).toBe(result.groups[0].id)
  })

  it('inserts alongside a non-empty spec, offset on +X, keeping the existing content', () => {
    const first = insertTemplate(
      createEmptySpec(),
      buildTemplate(templateById('dining-table')!),
    ).spec
    const before = first.parts.length
    const shelf = buildTemplate(templateById('bookshelf')!)
    const { spec, groupId } = insertTemplate(first, shelf)
    // Both pieces present.
    expect(spec.parts.length).toBe(before + shelf.parts.length)
    expect(partGroups(spec).length).toBe(2)
    // The inserted group carries a positive X offset (alongside, not overlapping).
    const inserted = partGroups(spec).find((g) => g.id === groupId)!
    expect(inserted.position).toBeDefined()
    expect(inserted.position![0]).toBeGreaterThan(0)
  })

  it('does not clobber a source-only spec (inserts alongside)', () => {
    const base = { ...createEmptySpec(), sourceAssetId: 'src-1' }
    const { spec } = insertTemplate(base, buildTemplate(templateById('cabinet')!))
    expect(spec.sourceAssetId).toBe('src-1')
    expect(partGroups(spec)[0].position).toBeDefined() // offset, not a replace
  })
})
