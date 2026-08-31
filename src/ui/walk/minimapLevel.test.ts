import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID } from '../../floorplan/levels'
import { hdb4Room, hdbMaisonette } from '../../floorplan/templates/hdb'
import { minimapLevelView } from './minimapLevel'

/**
 * MINIMAP-LEVEL (v0.31.5.96) — the walk-mode minimap must draw the storey the
 * walker is standing on.
 *
 * Measured before the fix on `tpl-hdb-maisonette` at the `emu-master` pose
 * (upper level `em-up`, elevation 2.9 m, camera eye y=4.5): the minimap drew
 * the GROUND shell, highlighted a ground room and labelled it "LIVING / DINING"
 * — the name of the ground room `em-living` — while the walker was in the upper
 * Master Bedroom. The dots were the ground floor's furniture too.
 *
 * These assertions are written against the REAL template (not a synthetic
 * fixture) and are DISCRIMINATING: on the old behaviour the minimap used the
 * raw `state.floorPlan`, whose `.rooms`/`.walls` ARE the ground storey's, so
 * every "upper" expectation below fails.
 */
describe('minimapLevelView picks the walked storey', () => {
  it('returns the UPPER storey rooms — not the ground ones — for an upper level id', () => {
    const plan = hdbMaisonette()
    const { plan: drawn, levelId } = minimapLevelView(plan, 'em-up')
    expect(levelId).toBe('em-up')
    const ids = drawn.rooms.map((r) => r.id)
    // The room the walker was actually standing in.
    expect(ids).toContain('emu-master')
    // The room the map used to draw + label instead. This single assertion is
    // the regression: the raw plan's rooms contain `em-living` and not
    // `emu-master`, so the old behaviour fails here.
    expect(ids).not.toContain('em-living')
    expect(drawn.rooms.map((r) => r.name)).not.toContain('Living / Dining')
  })

  it('switches the WALLS and OPENINGS too, not just the room fills', () => {
    // The shell outline is the most visible half of the map; a fix that scoped
    // only `rooms` would still draw the ground floor's walls around them.
    const plan = hdbMaisonette()
    const upper = plan.upperLevels?.[0]
    expect(upper).toBeDefined()
    const { plan: drawn } = minimapLevelView(plan, 'em-up')
    expect(drawn.walls).toBe(upper?.walls)
    expect(drawn.openings).toBe(upper?.openings)
    // Ground and upper genuinely differ (13 vs 11 walls), so this is a real
    // discriminator rather than two references that happen to match.
    expect(drawn.walls.length).not.toBe(plan.walls.length)
  })

  it('hands back a genuinely single-storey plan (upperLevels stripped)', () => {
    // Downstream geometry helpers walk `plan.rooms`/`plan.walls` only; leaving
    // `upperLevels` on would let a future consumer fan out over both storeys.
    const { plan: drawn } = minimapLevelView(hdbMaisonette(), 'em-up')
    expect(drawn.upperLevels).toBeUndefined()
  })

  it("maps the 'all' selection to the GROUND floor, matching where the walker stands", () => {
    // `FirstPersonCamera` stands the walker on `walkLevel(plan, viewLevelId)`,
    // which resolves 'all' to the ground floor — the map must agree, or the
    // arrow would ride over the wrong shell in the default view selection.
    const { plan: drawn, levelId } = minimapLevelView(hdbMaisonette(), 'all')
    expect(levelId).toBe(GROUND_LEVEL_ID)
    expect(drawn.rooms.map((r) => r.id)).toContain('em-living')
  })

  it('degrades an unknown/stale level id to the ground floor rather than an empty map', () => {
    // Switching plans can leave a stale `viewLevelId`; a blank minimap would be
    // a worse failure than the wrong storey.
    const { plan: drawn, levelId } = minimapLevelView(hdbMaisonette(), 'no-such-level')
    expect(levelId).toBe(GROUND_LEVEL_ID)
    expect(drawn.rooms.length).toBeGreaterThan(0)
  })

  it('returns the SAME plan reference for a single-storey plan (memo stability)', () => {
    // The common case must not allocate a new plan object per render, or the
    // component's `useMemo`s would recompute the fit + room paths every time.
    const flat = hdb4Room()
    expect(flat.upperLevels).toBeUndefined()
    const a = minimapLevelView(flat, 'all')
    expect(a.plan).toBe(flat)
    expect(a.levelId).toBe(GROUND_LEVEL_ID)
    expect(minimapLevelView(flat, 'ground').plan).toBe(flat)
  })
})
