/**
 * LP6 — lux overlay: time-of-day scrub + per-fixture exclusion.
 *
 * Covers:
 * - `luxExcludedIds` / `toggleLuxExcluded` / `setLuxExcludedIds`
 * - `luxPlaying` / `setLuxPlaying`
 * - Exclusion clears + play stops when overlay is turned off
 * - Exclusion changes the lux result (pure computation test via luxGrid)
 * - Feature flag (`drawings`) is pro-tier — hidden in Simple, present in Pro
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import type { PlanLight } from '../../lighting2d/lightingPlan'
import {
  buildRoomLuxGrid,
  MASKED,
  planWindowSources,
  type RoomLuxGrid,
} from '../../lighting2d/luxGrid'
import { useStore } from '../store'

// ── Store slice tests ────────────────────────────────────────────────────────

describe('featuresSlice LP6 — luxExcludedIds', () => {
  beforeEach(() =>
    useStore.setState({
      luxOverlayOn: false,
      luxExcludedIds: [],
      luxPlaying: false,
    } as never),
  )

  it('defaults to empty exclusion set and playing off', () => {
    expect(useStore.getState().luxExcludedIds).toEqual([])
    expect(useStore.getState().luxPlaying).toBe(false)
  })

  it('toggleLuxExcluded adds an id when not present', () => {
    useStore.getState().toggleLuxExcluded('fixture-1')
    expect(useStore.getState().luxExcludedIds).toContain('fixture-1')
  })

  it('toggleLuxExcluded removes an id when already present', () => {
    useStore.getState().toggleLuxExcluded('fixture-1')
    useStore.getState().toggleLuxExcluded('fixture-1')
    expect(useStore.getState().luxExcludedIds).not.toContain('fixture-1')
  })

  it('setLuxExcludedIds replaces the full set', () => {
    useStore.getState().setLuxExcludedIds(['a', 'b'])
    expect(useStore.getState().luxExcludedIds).toEqual(['a', 'b'])
    useStore.getState().setLuxExcludedIds([])
    expect(useStore.getState().luxExcludedIds).toEqual([])
  })

  it('setLuxPlaying toggles the playing flag', () => {
    useStore.getState().setLuxPlaying(true)
    expect(useStore.getState().luxPlaying).toBe(true)
    useStore.getState().setLuxPlaying(false)
    expect(useStore.getState().luxPlaying).toBe(false)
  })

  it('turning the overlay OFF clears excluded ids and stops playing', () => {
    useStore.getState().setLuxExcludedIds(['x'])
    useStore.getState().setLuxPlaying(true)
    // Turn on first so toggling off is meaningful
    useStore.getState().setLuxOverlayOn(true)
    useStore.getState().setLuxOverlayOn(false)
    expect(useStore.getState().luxExcludedIds).toEqual([])
    expect(useStore.getState().luxPlaying).toBe(false)
  })

  it('turning the overlay ON does not clear existing exclusions', () => {
    useStore.getState().setLuxExcludedIds(['y'])
    useStore.getState().setLuxOverlayOn(true)
    expect(useStore.getState().luxExcludedIds).toEqual(['y'])
  })
})

// ── Per-fixture exclusion changes the lux result (pure computation) ──────────

const room = (id: string, w: number, d: number): PlanRoom => ({
  id,
  name: 'Living',
  origin: [0, 0],
  width: w,
  depth: d,
})

const light = (id: string, x: number, z: number, intensity = 9): PlanLight => ({
  id,
  type: 'ceiling-light',
  label: 'Ceiling light',
  x,
  z,
  height: 2.05,
  intensity,
  distance: 6.5,
  color: '#fff',
})

describe('LP6 — per-fixture exclusion changes lux computation', () => {
  const r = room('lv', 4, 4)
  const lights = [light('f1', 1, 1), light('f2', 3, 3)]
  const opts = { fixtureLevel: 1, daylightLevel: 0 }

  it('full grid (both fixtures) is brighter than with one excluded', () => {
    const gridAll = buildRoomLuxGrid(r, lights, [], opts)!
    const gridOne = buildRoomLuxGrid(r, lights.slice(0, 1), [], opts)!
    const inRoom = (g: RoomLuxGrid) => [...g.values].filter((v) => v !== MASKED)
    const avgAll = inRoom(gridAll).reduce((s, v) => s + v, 0) / inRoom(gridAll).length
    const avgOne = inRoom(gridOne).reduce((s, v) => s + v, 0) / inRoom(gridOne).length
    expect(avgAll).toBeGreaterThan(avgOne)
  })

  it('excluding ALL fixtures gives a fully dark grid (zero fixtures)', () => {
    const grid = buildRoomLuxGrid(r, [], [], opts)!
    expect(grid.maxLux).toBe(0)
  })

  it('excluding a single specific fixture reduces max lux', () => {
    const gridAll = buildRoomLuxGrid(r, lights, [], opts)!
    // Exclude fixture f1 — pass only f2
    const gridMinusF1 = buildRoomLuxGrid(
      r,
      lights.filter((l) => l.id !== 'f1'),
      [],
      opts,
    )!
    expect(gridMinusF1.maxLux).toBeLessThan(gridAll.maxLux)
    expect(gridMinusF1.maxLux).toBeGreaterThan(0)
  })
})

// ── Time input changes lux result (fixtureLevel/daylightLevel sensitivity) ───

describe('LP6 — time-of-day scrub changes lux result', () => {
  const r = room('lv', 4, 4)
  const lights = [light('f1', 2, 2)]

  it('night (fixtureLevel=1) is brighter than twilight (fixtureLevel=0.5)', () => {
    const night = buildRoomLuxGrid(r, lights, [], { fixtureLevel: 1, daylightLevel: 0 })!
    const half = buildRoomLuxGrid(r, lights, [], { fixtureLevel: 0.5, daylightLevel: 0 })!
    expect(night.maxLux).toBeGreaterThan(half.maxLux)
  })

  it('full daylight (daylightLevel=1) with windows yields brighter near-window cells', () => {
    const plan: FloorPlan = {
      id: 'p',
      name: 'P',
      ceilingHeight: 2.6,
      extent: [10, 10],
      walls: [{ id: 'w1', start: [0, 0], end: [4, 0], thickness: 'external' }],
      openings: [
        { id: 'o1', kind: 'window', wallId: 'w1', offset: 1, width: 2, sill: 0.9, head: 2.1 },
      ],
      rooms: [r],
    }
    const wins = planWindowSources(plan)
    const day = buildRoomLuxGrid(r, [], wins, { fixtureLevel: 0, daylightLevel: 1 })!
    const dark = buildRoomLuxGrid(r, [], wins, { fixtureLevel: 0, daylightLevel: 0 })!
    expect(day.maxLux).toBeGreaterThan(0)
    expect(dark.maxLux).toBe(0)
  })
})

// ── Feature flag / Simple vs Pro mode gating ──────────────────────────────────

describe('LP6 — feature flag gating (drawings is pro-tier)', () => {
  it('drawings flag is ON in Pro mode', () => {
    const flags = resolveFlags(true, {}, false, 'pro')
    expect(flags.drawings).toBe(true)
  })

  it('drawings flag is OFF in Simple mode (hidden from casual users)', () => {
    const flags = resolveFlags(true, {}, false, 'simple')
    expect(flags.drawings).toBe(false)
  })
})
