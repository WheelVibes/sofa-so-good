import { describe, expect, it } from 'vitest'
import { DOORS, WALLS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { levelAsPlan, planLevels } from '../floorplan/levels'
import { hdbMaisonette } from '../floorplan/templates/hdb'
import { doorAimSegments } from './doorAim'

/**
 * WALK-AIM-PLAN (v0.31.5.99) — walk-mode door interaction must aim at the LOADED
 * plan's doors, on the storey being walked.
 *
 * Before this, `FirstPersonCamera` held a module-level `DOOR_SEGMENTS` built from
 * `apartment/constants.ts` — the default 4-room flat's hardcoded `DOORS`/`WALLS`.
 * Measured: the maisonette's door ids and the constants' door ids overlap by
 * ZERO, so on 18 of the 19 shipped templates (and every user-drawn plan) the
 * walker was offered phantom doorways from a different apartment while no real
 * door could be opened.
 */

/** The OLD module constant's maths, kept as the reference for the one plan it
 *  was ever right about. Any drift on the default flat is a regression. */
function legacyDoorSegments() {
  return DOORS.map((d) => {
    const wall = WALLS.find((w) => w.id === d.wallId)!
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wlen = Math.hypot(wdx, wdz)
    const ux = wdx / wlen
    const uz = wdz / wlen
    return {
      id: d.id,
      sx: wall.start[0] + ux * d.offset,
      sz: wall.start[1] + uz * d.offset,
      segDx: ux * d.width,
      segDz: uz * d.width,
    }
  })
}

const key = (s: { id: string; sx: number; sz: number; segDx: number; segDz: number }) =>
  `${s.id}@${s.sx.toFixed(4)},${s.sz.toFixed(4)}+${s.segDx.toFixed(4)},${s.segDz.toFixed(4)}`

describe('doorAimSegments', () => {
  it('CONTROL: the default flat is bit-for-bit what the old constants produced', () => {
    // The default flat is the ONE plan the hardcoded constants were right about,
    // and its plan openings reuse the same eight ids — so this change must be a
    // no-op there. An identical reading is the correct result here.
    const got = doorAimSegments(buildDefaultPlan()).map(key).sort()
    const want = legacyDoorSegments().map(key).sort()
    expect(got).toEqual(want)
  })

  it("aims at the MAISONETTE's own doors, which share NO id with the constants", () => {
    // The regression, stated as data: zero overlap means every prompt the walker
    // saw on this template referred to a door the plan does not contain.
    const plan = hdbMaisonette()
    const ids = doorAimSegments(plan).map((s) => s.id)
    const constIds = DOORS.map((d) => d.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.filter((id) => constIds.includes(id))).toEqual([])
    expect(ids).toContain('em-main')
  })

  it('scopes to the walked storey — an AimSegment is 2D, so this is load-bearing', () => {
    // The two storeys sit directly on top of each other, and the aim ray only
    // uses x/z. Without the level narrowing the walker could open a door on the
    // floor below THROUGH the floor.
    const plan = hdbMaisonette()
    const [ground, upper] = planLevels(plan)
    const groundIds = doorAimSegments(levelAsPlan(plan, ground!)).map((s) => s.id)
    const upperIds = doorAimSegments(levelAsPlan(plan, upper!)).map((s) => s.id)
    expect(upperIds.length).toBeGreaterThan(0)
    expect(groundIds.length).toBeGreaterThan(0)
    // Disjoint: no id appears on both storeys.
    expect(upperIds.filter((id) => groundIds.includes(id))).toEqual([])
    expect(upperIds).toContain('emu-bed2-door')
    expect(upperIds).not.toContain('em-main')
  })

  it('ignores windows — only doors are openable', () => {
    const plan = hdbMaisonette()
    const winIds = planLevels(plan)
      .flatMap((l) => l.openings)
      .filter((o) => o.kind === 'window')
      .map((o) => o.id)
    expect(winIds.length).toBeGreaterThan(0)
    const ids = doorAimSegments(plan).map((s) => s.id)
    expect(ids.filter((id) => winIds.includes(id))).toEqual([])
  })

  it('spans the doorway, not a zero-length point', () => {
    for (const s of doorAimSegments(hdbMaisonette())) {
      expect(Math.hypot(s.segDx, s.segDz)).toBeGreaterThan(0.1)
    }
  })
})
