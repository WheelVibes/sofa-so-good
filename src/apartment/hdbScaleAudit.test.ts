import { afterEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { DOORS, FLAT, WALLS } from './constants'
import {
  doorHardware,
  HANDLE_HEIGHT_FRAC,
  handleHeightOf,
  KICK_PLATE_H_M,
  kickPlateHeightOf,
} from './doorHardwareModel'
import {
  DOOR_HANDLE_HEIGHT_M,
  HS_DOOR_HEAD_M,
  HS_DOOR_ID,
  HS_DOOR_WIDTH_M,
  hdbScaleAuditOn,
  hdbScaledCutout,
  hdbScaledDoor,
  KICK_PLATE_HEIGHT_M,
} from './hdbScaleAudit'
import { buildWallSegments } from './wallSegments'
import { buildWallBodyOutline } from './walls/wallBodyShape'

/**
 * HDB-SCALE-AUDIT — the corrected shell/fitting dimensions, in BOTH flag states.
 *
 * The point of these tests is not that 0.7 equals 0.7. It is that the FOUR places a door's
 * opening is expressed — the wall's solid segments, the extruded wall body's hole, the leaf
 * spec, and the editable plan's `PlanOpening` — all move together, because they historically
 * did not: the first pass of this change corrected the segments and the leaf and left the
 * extruded body's hole at 2.1 m, which put a lintel-height strip of daylight over the blast
 * door. So each assertion below reads a DIFFERENT consumer of the same correction.
 *
 * Reference values and their citations live in `hdbScaleAudit.ts` and
 * `docs/audit/hdb-scale-audit-2026-09-07.md`.
 */

const on = () => setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
// An override is honoured only for a PRIVILEGED session (`resolveFlags`'s kill-switch rule),
// hence `isDev = true` here — the same path `?ff=hdbScaleAudit:off` takes on the dev server.
const off = () => setResolvedFlags(resolveFlags(true, { hdbScaleAudit: false }, false, 'simple'))

const hsWall = () => {
  const w = WALLS.find((x) => x.cutouts.some((c) => c.refId === HS_DOOR_ID))
  if (!w) throw new Error('no wall carries the household-shelter door cutout')
  return w
}
const hsDoorSpec = () => {
  const d = DOORS.find((x) => x.id === HS_DOOR_ID)
  if (!d) throw new Error('no household-shelter door in DOORS')
  return d
}

afterEach(on)

describe('hdbScaleAudit flag state', () => {
  it('is on by default and off under an explicit override', () => {
    on()
    expect(hdbScaleAuditOn()).toBe(true)
    off()
    expect(hdbScaleAuditOn()).toBe(false)
  })
})

describe('household-shelter blast door — SCDF TRHS 2023 cl. 2.5 (700 x 1900 mm)', () => {
  it('corrects the door spec when on and leaves it untouched when off', () => {
    const raw = hsDoorSpec()
    on()
    expect(hdbScaledDoor(raw).width).toBe(HS_DOOR_WIDTH_M)
    expect(hdbScaledDoor(raw).head).toBe(HS_DOOR_HEAD_M)
    off()
    expect(hdbScaledDoor(raw)).toBe(raw)
    expect(hdbScaledDoor(raw).width).toBe(FLAT.internalDoorWidth)
    expect(hdbScaledDoor(raw).head).toBeUndefined()
  })

  it('leaves every OTHER door alone in both flag states', () => {
    for (const state of [on, off]) {
      state()
      for (const d of DOORS) {
        if (d.id === HS_DOOR_ID) continue
        expect(hdbScaledDoor(d)).toBe(d)
      }
    }
  })

  it('corrects the wall CUTOUT, not just the leaf', () => {
    const cut = hsWall().cutouts.find((c) => c.refId === HS_DOOR_ID)!
    on()
    expect(hdbScaledCutout(cut).width).toBe(HS_DOOR_WIDTH_M)
    expect(hdbScaledCutout(cut).head).toBe(HS_DOOR_HEAD_M)
    off()
    expect(hdbScaledCutout(cut)).toBe(cut)
  })

  it("moves the wall's solid segments so a lintel spans 1.9 m to the ceiling", () => {
    const wall = hsWall()
    const cut = wall.cutouts.find((c) => c.refId === HS_DOOR_ID)!
    on()
    const lintel = buildWallSegments(wall, FLAT.ceilingHeight).find(
      (s) => Math.abs(s.start - cut.offset) < 1e-6 && s.bottom > 0,
    )
    expect(lintel?.bottom).toBeCloseTo(HS_DOOR_HEAD_M, 6)
    expect(lintel?.end).toBeCloseTo(cut.offset + HS_DOOR_WIDTH_M, 6)

    off()
    const wide = buildWallSegments(wall, FLAT.ceilingHeight).find(
      (s) => Math.abs(s.start - cut.offset) < 1e-6 && s.bottom > 0,
    )
    expect(wide?.bottom).toBeCloseTo(FLAT.doorHeight, 6)
    expect(wide?.end).toBeCloseTo(cut.offset + FLAT.internalDoorWidth, 6)
  })

  it("moves the EXTRUDED wall body's hole too (the regression this test exists for)", () => {
    const wall = hsWall()
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    // The blast door reaches the floor, so its opening is a notch in the outline's bottom
    // edge rather than a separate hole contour — its top edge is the tallest outline point
    // strictly below the wall top.
    const notchTop = (top: number) =>
      Math.max(
        ...buildWallBodyOutline(wall, top, length, 0, 0)
          .outline.map(([, y]) => y)
          .filter((y) => y < top - 1e-6),
      )
    on()
    expect(notchTop(FLAT.ceilingHeight)).toBeLessThan(HS_DOOR_HEAD_M + 0.01)
    expect(notchTop(FLAT.ceilingHeight)).toBeGreaterThan(HS_DOOR_HEAD_M - 0.05)
    off()
    expect(notchTop(FLAT.ceilingHeight)).toBeGreaterThan(FLAT.doorHeight - 0.05)
  })

  it('reaches the editable plan, so 2D / schedules / drawings agree with 3D', () => {
    on()
    const opening = buildDefaultPlan().openings.find((o) => o.id === HS_DOOR_ID)
    expect(opening?.width).toBe(HS_DOOR_WIDTH_M)
    expect(opening?.head).toBe(HS_DOOR_HEAD_M)

    off()
    const legacy = buildDefaultPlan().openings.find((o) => o.id === HS_DOOR_ID)
    expect(legacy?.width).toBe(FLAT.internalDoorWidth)
    expect(legacy?.head).toBe(FLAT.doorHeight)
  })

  it('leaves every other plan opening byte-identical between the two states', () => {
    on()
    const a = buildDefaultPlan().openings.filter((o) => o.id !== HS_DOOR_ID)
    off()
    const b = buildDefaultPlan().openings.filter((o) => o.id !== HS_DOOR_ID)
    expect(b).toEqual(a)
  })
})

describe('door lever height — BCA COA 2025 cl. 4.4.8.1(c) (900-1100 mm AFFL)', () => {
  const spec = {
    width: 0.8,
    height: FLAT.doorHeight,
    leafThick: FLAT.doorThickness,
    hinge: 'start',
    swing: 'left',
    kind: 'flush',
  } as const

  it('lands inside the 900-1100 mm band when the flag supplies the height', () => {
    expect(DOOR_HANDLE_HEIGHT_M).toBeGreaterThanOrEqual(0.9)
    expect(DOOR_HANDLE_HEIGHT_M).toBeLessThanOrEqual(1.1)
    expect(handleHeightOf({ ...spec, handleHeight: DOOR_HANDLE_HEIGHT_M })).toBe(
      DOOR_HANDLE_HEIGHT_M,
    )
  })

  it('falls back to the pre-audit leaf fraction with no height supplied', () => {
    expect(handleHeightOf(spec)).toBeCloseTo(FLAT.doorHeight * HANDLE_HEIGHT_FRAC, 6)
    // ...and that value is exactly what the audit flagged: below the band.
    expect(handleHeightOf(spec)).toBeLessThan(0.9)
  })

  it('drives the rendered lever, rose and cylinder — not just the number', () => {
    const corrected = doorHardware({ ...spec, handleHeight: DOOR_HANDLE_HEIGHT_M })
    const legacy = doorHardware(spec)
    for (const face of corrected.lever) {
      expect(face.rose[1]).toBeCloseTo(DOOR_HANDLE_HEIGHT_M, 6)
      expect(face.lever[0][1]).toBeCloseTo(DOOR_HANDLE_HEIGHT_M, 6)
      // The privacy cylinder keeps its fixed drop BELOW the rose.
      expect(face.escutcheon[1]).toBeLessThan(face.rose[1])
    }
    expect(legacy.lever[0].rose[1]).toBeLessThan(corrected.lever[0].rose[1])
  })

  it('is independent of leaf height — a 1.9 m blast leaf gets the same 1.0 m', () => {
    // The old fraction produced 0.798 m on a 1.9 m leaf: a shorter door moved the handle,
    // which is exactly the bug in deriving a floor-referenced height from the leaf.
    const short = { ...spec, height: HS_DOOR_HEAD_M }
    expect(handleHeightOf(short)).toBeCloseTo(HS_DOOR_HEAD_M * HANDLE_HEIGHT_FRAC, 6)
    expect(handleHeightOf({ ...short, handleHeight: DOOR_HANDLE_HEIGHT_M })).toBe(
      DOOR_HANDLE_HEIGHT_M,
    )
  })
})

describe('main-door kick plate — BCA COA 2019 cl. 4.4.13.1 (at least 250 mm)', () => {
  const mainSpec = {
    width: FLAT.mainDoorWidth,
    height: FLAT.doorHeight,
    leafThick: FLAT.doorThickness,
    hinge: 'start',
    swing: 'right',
    kind: 'main',
  } as const

  it('meets the 250 mm minimum when supplied, and the old 200 mm did not', () => {
    expect(KICK_PLATE_HEIGHT_M).toBeGreaterThanOrEqual(0.25)
    expect(KICK_PLATE_H_M).toBeLessThan(0.25)
    expect(kickPlateHeightOf({ ...mainSpec, kickPlateHeight: KICK_PLATE_HEIGHT_M })).toBe(
      KICK_PLATE_HEIGHT_M,
    )
    expect(kickPlateHeightOf(mainSpec)).toBe(KICK_PLATE_H_M)
  })

  it('publishes the height it positioned the plate from, so the mesh cannot disagree', () => {
    for (const h of [undefined, KICK_PLATE_HEIGHT_M]) {
      const hw = doorHardware({ ...mainSpec, kickPlateHeight: h })
      expect(hw.kickPlate).not.toBeNull()
      expect(hw.kickPlate?.position[1]).toBeCloseTo((hw.kickPlate?.height ?? 0) / 2, 6)
    }
  })

  it('only the main leaf carries one, in both states', () => {
    for (const h of [undefined, KICK_PLATE_HEIGHT_M]) {
      expect(doorHardware({ ...mainSpec, kind: 'flush', kickPlateHeight: h }).kickPlate).toBeNull()
    }
  })
})
