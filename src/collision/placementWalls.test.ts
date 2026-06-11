import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { placementWalls } from './placementWalls'

const base = { floorPlan: buildDefaultPlan(), doors: {} as Record<string, { open: boolean }> }

describe('placementWalls', () => {
  it('returns the room perimeter inside the per-room editor', () => {
    const walls = placementWalls({
      ...base,
      roomEditor: { active: true, roomId: 'mainBedroom' },
    })
    expect(walls).toBeDefined()
    expect(walls!.length).toBeGreaterThanOrEqual(3)
  })

  it('returns undefined on the default flat outside the editor (caller builds flat walls)', () => {
    expect(placementWalls({ ...base, roomEditor: { active: false, roomId: null } })).toBeUndefined()
  })

  it('falls back outside the editor for an active editor with a stale room id', () => {
    // No such room → roomEditorPlacementWalls returns undefined → fall through to
    // the plan branch (default flat → undefined).
    expect(
      placementWalls({ ...base, roomEditor: { active: true, roomId: 'ghost-room' } }),
    ).toBeUndefined()
  })
})

describe('multi-storey wall routing (F13/ML3)', () => {
  it("an upper-level item validates against its own storey's walls", () => {
    const plan = {
      id: 'ml',
      name: 'ML',
      ceilingHeight: 2.6,
      extent: [8, 6] as [number, number],
      walls: [
        {
          id: 'gw',
          start: [0.1, 0.1] as [number, number],
          end: [7.9, 0.1] as [number, number],
          thickness: 'external' as const,
        },
      ],
      openings: [],
      rooms: [],
      upperLevels: [
        {
          id: 'lvl-2',
          name: 'Upper',
          elevation: 2.9,
          walls: [
            {
              id: 'uw',
              start: [0.1, 0.1] as [number, number],
              end: [4.9, 0.1] as [number, number],
              thickness: 'external' as const,
            },
          ],
          openings: [],
          rooms: [],
        },
      ],
    }
    const state = { floorPlan: plan, roomEditor: { active: false, roomId: null }, doors: {} }
    const ground = placementWalls(state)
    const upper = placementWalls(state, 'lvl-2')
    expect(ground?.some((w) => Math.abs(w.bx - 7.9) < 0.2)).toBe(true)
    // The upper storey's wall set ends at x=4.9 — no ground-only walls in it.
    expect(upper?.every((w) => w.ax <= 5 && w.bx <= 5)).toBe(true)
    // Unknown/ground level ids fall back to the ground behaviour.
    expect(placementWalls(state, 'ground')).toEqual(ground)
    expect(placementWalls(state, 'nope')).toEqual(ground)
  })
})
