import { describe, expect, it } from 'vitest'
import { mainDoor } from '../../apartment/fittings/fittingModel'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { planExtent } from '../../floorplan/planExtent'
import { PLAN_TEMPLATES } from '../../floorplan/templates'
import type { FloorPlan } from '../../floorplan/types'
import {
  CORRIDOR_DOOR_CLEAR_M,
  type CorridorSide,
  corridorFromPlan,
  type EstateFrame,
  estateFrame,
  frameToWorld,
} from './estateCorridor'
import { buildEstateLayout, type EstateBox } from './estateLayout'

/** Every HDB plan the estate can mount over: the built-in default flat + the HDB templates. */
const HDB_PLANS: FloorPlan[] = [
  buildDefaultPlan(),
  ...PLAN_TEMPLATES.filter((t) => t.category?.housingType === 'HDB'),
]

interface Rect {
  x: number
  z: number
  w: number
  d: number
}

/** Main door centre in PLAN metres, and the side of the plan's own extent it is nearest. */
function doorCentre(plan: FloorPlan): { x: number; z: number; width: number } {
  const md = mainDoor(plan)
  if (!md) throw new Error(`${plan.id} has no main door`)
  const { opening: o, wall: w } = md
  const dx = w.end[0] - w.start[0]
  const dz = w.end[1] - w.start[1]
  const len = Math.hypot(dx, dz)
  const t = o.offset + o.width / 2
  return { x: w.start[0] + (dx / len) * t, z: w.start[1] + (dz / len) * t, width: o.width }
}

/** A canonical estate box in WORLD plan coordinates. Yaws are multiples of 90°, so an
 *  axis-aligned box stays axis-aligned — only w/d swap on the ±x faces. */
function toWorld(frame: EstateFrame, b: EstateBox | Rect): Rect {
  const [x, z] = frameToWorld(frame, b.x, b.z)
  const swap = Math.abs(Math.sin(frame.yaw)) > 0.5
  return { x, z, w: swap ? b.d : b.w, d: swap ? b.w : b.d }
}

/** True only for a REAL overlap: boxes that merely touch (a wing ending on the flat's own
 *  exterior face) are fine, so the comparison keeps a 1 mm tolerance. */
function overlaps(a: Rect, b: Rect, tol = 1e-3) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - tol && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - tol
}

// The side each plan's main door actually opens onto — read off the templates, and asserted
// against `mainDoor` below so a template edit that moves the front door fails loudly here.
const EXPECTED: Record<string, CorridorSide> = {
  'default-hdb-4room': '+z',
  'tpl-hdb-2room': '+z',
  'tpl-hdb-3room': '+z',
  'tpl-hdb-4room': '+z',
  'tpl-hdb-5room': '-z',
  'tpl-hdb-exec': '+z',
  'tpl-hdb-3gen': '+x',
  'tpl-hdb-jumbo': '+z',
  'tpl-hdb-maisonette': '+z',
}

describe('corridorFromPlan (ESTATE-DOOR-SIDE)', () => {
  it('covers every HDB plan the estate mounts over', () => {
    expect(HDB_PLANS.map((p) => p.id).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const plan of HDB_PLANS) {
    describe(plan.id, () => {
      const [W, D] = planExtent(plan)
      const corridor = corridorFromPlan(plan)
      const door = doorCentre(plan)

      it('puts the corridor on the face the main door opens onto', () => {
        expect(corridor.side).toBe(EXPECTED[plan.id])
        // …and that face really is the nearest plan-extent edge to the door.
        const dist = { '-z': door.z, '+z': D - door.z, '-x': door.x, '+x': W - door.x }
        expect(dist[corridor.side]).toBeLessThanOrEqual(Math.min(...Object.values(dist)) + 1e-9)
      })

      it('spans the door plus clearance, clamped to the face', () => {
        const along = corridor.side === '+z' || corridor.side === '-z' ? door.x : door.z
        const faceLen = corridor.side === '+z' || corridor.side === '-z' ? W : D
        const [a, b] = corridor.span
        expect(a).toBeGreaterThanOrEqual(-1e-9)
        expect(b).toBeLessThanOrEqual(faceLen + 1e-9)
        expect(a).toBeLessThan(along)
        expect(b).toBeGreaterThan(along)
        // At least the clearance either side of the leaf, unless the face itself ran out.
        expect(along - door.width / 2 - a).toBeGreaterThan(
          Math.min(CORRIDOR_DOOR_CLEAR_M, along - door.width / 2) - 1e-9,
        )
        expect(b - along - door.width / 2).toBeGreaterThan(
          Math.min(CORRIDOR_DOOR_CLEAR_M, faceLen - along - door.width / 2) - 1e-9,
        )
        // One end always runs out to the nearer block end.
        expect(along < faceLen / 2 ? a : b).toBeCloseTo(along < faceLen / 2 ? 0 : faceLen)
      })

      it('places no estate geometry inside the flat, and the corridor outside its door face', () => {
        const frame = estateFrame(corridor, [W, D])
        const L = buildEstateLayout({ extent: frame.extent, corridorSpan: frame.span })
        const flat: Rect = { x: W / 2, z: D / 2, w: W, d: D }
        // `own.below`/`own.above`/`own.roof` are the storeys under and over the flat — they
        // share its footprint on purpose and are separated in Y. Everything else must clear it.
        const solid = [L.own.westWing, L.own.eastWing, L.own.corridorFloor, L.own.corridorParapet]
        for (const b of solid) expect(overlaps(toWorld(frame, b), flat), 'box in flat').toBe(false)
        for (const b of L.blocks)
          expect(overlaps(toWorld(frame, b), flat), `${b.id} in flat`).toBe(false)
        for (const t of L.trees)
          expect(overlaps(toWorld(frame, { x: t.x, z: t.z, w: 0, d: 0 }), flat)).toBe(false)

        // The corridor slab lies just OUTSIDE the door's own exterior face, and spans the door.
        const corr = toWorld(frame, L.own.corridorFloor)
        const alongX = corridor.side === '+z' || corridor.side === '-z'
        const sign = corridor.side === '+z' || corridor.side === '+x' ? 1 : -1
        const faceAt = sign > 0 ? (alongX ? D : W) : 0
        expect(((alongX ? corr.z : corr.x) - faceAt) * sign).toBeGreaterThan(0)
        const alongPos = alongX ? corr.x : corr.z
        const alongLen = alongX ? corr.w : corr.d
        expect(Math.abs(alongPos - (alongX ? door.x : door.z))).toBeLessThan(alongLen / 2)
      })
    })
  }
})

describe('estateFrame', () => {
  it('is the identity for a +z door (the default flat is untouched)', () => {
    const f = estateFrame({ side: '+z', span: [9.5, 12.72] }, [12.72, 9.38])
    expect(f).toEqual({ yaw: 0, offset: [0, 0], extent: [12.72, 9.38], span: [9.5, 12.72] })
    expect(frameToWorld(f, 3, 4)).toEqual([3, 4])
  })

  it('is a rigid 90° family — never a reflection', () => {
    const extent: [number, number] = [10, 6]
    const sides: CorridorSide[] = ['+z', '-z', '+x', '-x']
    for (const side of sides) {
      const f = estateFrame({ side, span: [2, 8] }, extent)
      expect(Math.abs(Math.sin(f.yaw) ** 2 + Math.cos(f.yaw) ** 2)).toBeCloseTo(1)
      // The canonical footprint centre lands on the plan's footprint centre.
      const [cx, cz] = frameToWorld(f, f.extent[0] / 2, f.extent[1] / 2)
      expect(cx).toBeCloseTo(extent[0] / 2)
      expect(cz).toBeCloseTo(extent[1] / 2)
      // The canonical +z corridor direction maps to the named outward face.
      const [ox, oz] = frameToWorld(f, 0, 1)
      const [zx, zz] = frameToWorld(f, 0, 0)
      const dir = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] }[side]
      expect(ox - zx).toBeCloseTo(dir[0])
      expect(oz - zz).toBeCloseTo(dir[1])
      // Width/depth swap on the ±x faces only.
      expect(f.extent).toEqual(side === '+z' || side === '-z' ? [10, 6] : [6, 10])
    }
  })
})
