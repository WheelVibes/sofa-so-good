import { describe, expect, it } from 'vitest'
import { buildEditedObject } from './buildObject'
import { combineGroupToMeshPart } from './csgEval'
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
  it('exposes exactly 14 archetype starters with unique ids and 2–4 params each', () => {
    expect(TEMPLATE_LIBRARY.length).toBe(14)
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
      'dining-chair',
      'wardrobe',
      'desk',
      'tv-console',
      'bench',
      'bar-stool',
      'floating-shelf',
      'bathroom-vanity',
    ]) {
      expect(templateById(id)).not.toBeNull()
    }
    expect(templateById('nope')).toBeNull()
  })

  it.each(
    TEMPLATE_LIBRARY.map((t) => [t.id, t] as const),
  )('%s builds a buildable spec with a single wrapping group of finite parts', (_id, def: TemplateDef) => {
    const result = buildTemplate(def)
    // Most archetypes are ≥4 parts; the floating shelf is a minimal wall slab (3).
    expect(result.parts.length).toBeGreaterThanOrEqual(3)
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

  it('dining chair reads as a chair: seat at the seat-height param, back above it, legs plumb', () => {
    const seatH = 0.45
    const backH = 0.9
    const parts = buildTemplate(templateById('dining-chair')!, {
      seatHeight: seatH,
      seatWidth: 0.44,
      seatDepth: 0.42,
      backHeight: backH,
    }).parts
    const b = aabb(parts)
    // A seat board sits at ~seat height (a thin, wide, deep box straddling seatH).
    const seat = parts.find(
      (p) =>
        Math.abs(p.position[1] - (seatH - 0.02)) < 0.03 && p.size[0] > 0.35 && p.size[2] > 0.35,
    )
    expect(seat).toBeDefined()
    // Seat height sits inside the ergonomic band.
    expect(seatH).toBeGreaterThanOrEqual(0.42)
    expect(seatH).toBeLessThanOrEqual(0.48)
    // The backrest reaches above the seat, up to ~the back-height param.
    expect(b.hi[1]).toBeGreaterThan(seatH + 0.2)
    expect(b.hi[1]).toBeCloseTo(backH, 1)
    // Legs reach the floor; nothing dips below it; footprint tracks the seat.
    expect(b.lo[1]).toBeCloseTo(0, 2)
    expect(b.w).toBeCloseTo(0.44, 1)
  })

  it('wardrobe is a tall carcass tracking width/height, with an interior rail', () => {
    const parts = buildTemplate(templateById('wardrobe')!, {
      width: 1.0,
      height: 2.1,
      depth: 0.58,
      doors: 3,
    }).parts
    // The rail is a horizontal cylinder (its size[1] is its LENGTH, not its
    // vertical extent), so measure the carcass from the axis-aligned box parts.
    const b = aabb(parts.filter((p) => p.kind === 'box'))
    expect(b.hi[1]).toBeCloseTo(2.1, 1)
    expect(b.w).toBeCloseTo(1.0, 1)
    // A horizontal steel cylinder near the top is the hanging rail.
    const rail = parts.find((p) => p.kind === 'cylinder' && (p.metalness ?? 0) > 0.5)
    expect(rail).toBeDefined()
    expect(rail!.position[1]).toBeGreaterThan(2.1 * 0.8)
  })

  it('desk top sits at the height param with a drawer pedestal on one side', () => {
    const few = buildTemplate(templateById('desk')!, { drawers: 2 }).parts.length
    const many = buildTemplate(templateById('desk')!, { drawers: 3 }).parts.length
    expect(many).toBeGreaterThan(few) // more drawers → more fronts + pulls
    const parts = buildTemplate(templateById('desk')!, {
      width: 1.4,
      depth: 0.7,
      height: 0.74,
    }).parts
    const b = aabb(parts)
    expect(b.hi[1]).toBeCloseTo(0.74, 2)
    expect(b.w).toBeCloseTo(1.4, 1)
    expect(b.lo[1]).toBeCloseTo(0, 2)
  })

  it('tv console is low (0.4–0.6 m) and tracks its width', () => {
    const b = aabb(buildTemplate(templateById('tv-console')!, { width: 1.4, height: 0.5 }).parts)
    expect(b.hi[1]).toBeCloseTo(0.5, 2)
    expect(b.hi[1]).toBeLessThan(0.6)
    expect(b.w).toBeCloseTo(1.4, 1)
    expect(b.lo[1]).toBeCloseTo(0, 2)
  })
})

describe('Stage 7c archetypes', () => {
  it('bench: upholstered top ships plumped + tufted, seat ~0.45 m', () => {
    const result = buildTemplate(templateById('bench')!, {
      width: 1.2,
      depth: 0.4,
      seatHeight: 0.45,
    })
    const b = aabb(result.parts)
    expect(b.hi[1]).toBeCloseTo(0.45, 2) // cushion top at seat height
    expect(b.lo[1]).toBeCloseTo(0, 2) // legs reach the floor
    // A plumped, tufted cushion is the showcase part.
    const cushion = result.parts.find((p) => (p.plump ?? 0) > 0 && p.tuft)
    expect(cushion).toBeDefined()
    // Its tuft buttons are generated and tagged (rows × cols).
    expect(result.decals?.length).toBeGreaterThan(0)
    expect(result.decals!.every((dd) => dd.tuft && dd.kind === 'button')).toBe(true)
    expect(result.decals!.length).toBe(cushion!.tuft!.rows * cushion!.tuft!.cols)
  })

  it('bar stool: tall seat (0.65–0.78 m), round lathe seat + a swept foot ring', () => {
    const result = buildTemplate(templateById('bar-stool')!, {
      seatHeight: 0.72,
      seatDiameter: 0.34,
    })
    const b = aabb(result.parts)
    expect(b.hi[1]).toBeCloseTo(0.72, 2)
    expect(b.lo[1]).toBeCloseTo(0, 2)
    expect(result.parts.some((p) => p.kind === 'lathe')).toBe(true) // round seat
    expect(result.parts.some((p) => p.kind === 'sweep')).toBe(true) // foot ring
  })

  it('floating shelf: wall placement, board underside at y=0', () => {
    const def = templateById('floating-shelf')!
    expect(def.placement).toBe('wall')
    const b = aabb(buildTemplate(def, { width: 0.8, depth: 0.22, thickness: 0.04 }).parts)
    expect(b.lo[1]).toBeCloseTo(0, 3)
    expect(b.w).toBeCloseTo(0.8, 1)
  })

  it('bathroom vanity: counter ~0.85 m, ships with a built-in basin-cutout combine', () => {
    const result = buildTemplate(templateById('bathroom-vanity')!, {
      width: 0.9,
      height: 0.85,
      depth: 0.5,
      doors: 2,
    })
    // Measure the solids only — the basin HOLE cylinder deliberately overshoots
    // the counter (a clean through-cut), so it isn't part of the visible extent.
    const b = aabb(result.parts.filter((p) => p.role !== 'hole'))
    expect(b.hi[1]).toBeCloseTo(0.85, 2) // counter top at vanity height
    expect(b.lo[1]).toBeCloseTo(0, 2)
    // One subtract combine group over the countertop + basin hole.
    expect(result.combineGroups?.length).toBe(1)
    const cg = result.combineGroups![0]
    expect(cg.op).toBe('subtract')
    expect(cg.partIds.length).toBe(2)
    // The basin operand is a hole; the counter is a solid.
    const basin = result.parts.find((p) => p.role === 'hole')
    expect(basin).toBeDefined()
    expect(cg.partIds).toContain(basin!.id)
  })

  it("vanity's built-in combine round-trips through insert + evaluates to a mesh", async () => {
    const result = buildTemplate(templateById('bathroom-vanity')!)
    const { spec } = insertTemplate(createEmptySpec(), result)
    // The combine group survives insertion, and its members share the wrapping
    // transform group's home (so it has a well-defined container to build under).
    expect(spec.combineGroups?.length).toBe(1)
    const group = spec.combineGroups![0]
    expect(partGroups(spec)[0].partIds).toEqual(expect.arrayContaining(group.partIds))
    // The boolean actually evaluates (counter minus basin) to a non-empty mesh.
    const mesh = await combineGroupToMeshPart(spec, group)
    expect(mesh.kind).toBe('mesh')
    expect(mesh.geometry!.positions.length).toBeGreaterThan(0)
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
