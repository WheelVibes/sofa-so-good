import { beforeEach, describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import { LAYOUT_PRESETS } from '../../furniture/layoutPresets'
import { BUILTIN_MATERIALS } from '../../materials/builtinCatalog'
import { useStore } from '../store'

describe('applyLayoutPreset', () => {
  beforeEach(() => {
    // Start from a clean, known state with empty history.
    useStore.getState().resetToEmpty()
    useStore.setState({ past: [], future: [] } as never)
  })

  it('applies furniture + finishes and is a SINGLE undo step', () => {
    const preset = LAYOUT_PRESETS[0]
    const beforeItems = useStore.getState().items.length
    useStore.getState().applyLayoutPreset(preset.id)

    const s = useStore.getState()
    expect(s.items.length).toBeGreaterThan(beforeItems)
    // The coordinated palette was applied (at least one room got the preset wall).
    expect(Object.values(s.finishes.walls)).toContain(preset.wall)
    // Exactly one history entry was pushed for the whole preset.
    expect(s.past.length).toBe(1)

    // One undo fully reverts furniture + finishes.
    useStore.getState().undo()
    expect(useStore.getState().items.length).toBe(beforeItems)
  })

  it('furnishes a custom plan + applies the preset palette in one undo step', () => {
    const ext: FloorPlan['walls'][number]['thickness'] = 'external'
    const plan: FloorPlan = {
      id: 'custom-reset-test',
      name: 'Custom',
      ceilingHeight: 2.6,
      extent: [9, 7],
      walls: [
        { id: 'n', start: [0.1, 0.1], end: [8.9, 0.1], thickness: ext },
        { id: 'e', start: [8.9, 0.1], end: [8.9, 6.9], thickness: ext },
        { id: 's', start: [8.9, 6.9], end: [0.1, 6.9], thickness: ext },
        { id: 'w', start: [0.1, 6.9], end: [0.1, 0.1], thickness: ext },
      ],
      openings: [{ id: 'd', kind: 'door', wallId: 's', offset: 4, width: 0.9, sill: 0, head: 2.1 }],
      rooms: [
        { id: 'liv', name: 'Living', origin: [0.2, 0.2], width: 4.4, depth: 6.6, floor: 'floor-x' },
        {
          id: 'bed',
          name: 'Master Bedroom',
          origin: [4.8, 0.2],
          width: 4.0,
          depth: 4.0,
          floor: 'floor-x',
        },
        {
          id: 'kit',
          name: 'Kitchen',
          origin: [4.8, 4.4],
          width: 4.0,
          depth: 2.4,
          floor: 'floor-tile-grey',
        },
      ],
    }
    useStore.getState().setFloorPlan(plan)
    useStore.setState({ past: [], future: [] } as never)
    const preset = LAYOUT_PRESETS.find((p) => p.id === 'scandi-calm')!
    useStore.getState().applyLayoutPreset(preset.id)

    const s = useStore.getState()
    expect(s.items.length).toBeGreaterThan(0)
    const room = (id: string) => s.floorPlan.rooms.find((r) => r.id === id)!
    // Dry rooms take the preset floor; the kitchen keeps its own.
    expect(room('liv').floor).toBe(preset.dryFloor)
    expect(room('bed').floor).toBe(preset.dryFloor)
    expect(room('kit').floor).toBe('floor-tile-grey')
    // The plan wall colour follows the preset wall swatch.
    expect(s.floorPlan.wallColor).toBe(BUILTIN_MATERIALS[preset.wall]?.swatch)
    // One undo step reverts furniture AND the plan palette together.
    expect(s.past.length).toBe(1)
    useStore.getState().undo()
    expect(useStore.getState().items.length).toBe(0)
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === 'liv')!.floor).toBe('floor-x')
  })

  it('honours an explicit room category when applying the dry floor (RM1)', () => {
    const ext: FloorPlan['walls'][number]['thickness'] = 'external'
    const plan: FloorPlan = {
      id: 'custom-reset-cat-test',
      name: 'Custom',
      ceilingHeight: 2.6,
      extent: [9, 7],
      walls: [
        { id: 'n', start: [0.1, 0.1], end: [8.9, 0.1], thickness: ext },
        { id: 'e', start: [8.9, 0.1], end: [8.9, 6.9], thickness: ext },
        { id: 's', start: [8.9, 6.9], end: [0.1, 6.9], thickness: ext },
        { id: 'w', start: [0.1, 6.9], end: [0.1, 0.1], thickness: ext },
      ],
      openings: [{ id: 'd', kind: 'door', wallId: 's', offset: 4, width: 0.9, sill: 0, head: 2.1 }],
      rooms: [
        // Name infers to 'other' (no dry floor); explicit bedroom category wins.
        {
          id: 'kids',
          name: "Ella's room",
          origin: [0.2, 0.2],
          width: 4.4,
          depth: 6.6,
          floor: 'floor-x',
          category: 'bedroom',
        },
      ],
    }
    useStore.getState().setFloorPlan(plan)
    useStore.setState({ past: [], future: [] } as never)
    const preset = LAYOUT_PRESETS.find((p) => p.id === 'scandi-calm')!
    useStore.getState().applyLayoutPreset(preset.id)
    expect(useStore.getState().floorPlan.rooms.find((r) => r.id === 'kids')!.floor).toBe(
      preset.dryFloor,
    )
  })

  it('is a no-op for an unknown preset id', () => {
    useStore.getState().applyLayoutPreset('does-not-exist')
    expect(useStore.getState().past.length).toBe(0)
    expect(useStore.getState().items.length).toBe(0)
  })
})

/**
 * **`dryFloorByCategory` (v0.31.8.17)** — a per-room-category floor override on
 * top of `dryFloor`. Added for Peranakan Accent, whose encaustic tile belongs in
 * the "prestigious interior spaces" and five-foot way of a shophouse, not in the
 * bedrooms; a single whole-home `dryFloor` could not express that.
 */
describe('applyLayoutPreset — dryFloorByCategory', () => {
  beforeEach(() => {
    // These assertions read `finishes.floor`, which is the DEFAULT-FLAT branch of
    // `applyLayoutPreset`; a custom plan writes `plan.rooms[].floor` instead. An
    // earlier test in this file replaces the plan, so restore it explicitly
    // rather than depending on file order.
    useStore.getState().resetFloorPlan()
  })

  it('overrides the living floor but leaves bedrooms on dryFloor', () => {
    const preset = LAYOUT_PRESETS.find((p) => p.id === 'peranakan-accent')!
    expect(preset.dryFloorByCategory?.living, 'preset should override living').toBeTruthy()
    useStore.getState().applyLayoutPreset('peranakan-accent')
    const finishes = useStore.getState().finishes
    // The public zone takes the override...
    expect(finishes.floor.livingDining).toBe(preset.dryFloorByCategory!.living)
    // ...and the private rooms keep the base timber. Both arms matter: a bug
    // that applied the override everywhere would pass the first alone.
    expect(finishes.floor.mainBedroom).toBe(preset.dryFloor)
    expect(finishes.floor.bedroom2).toBe(preset.dryFloor)
  })

  it('leaves every room on dryFloor for a preset with no override', () => {
    const preset = LAYOUT_PRESETS.find(
      (p) => p.group === 'theme' && !p.dryFloorByCategory && p.dryFloor,
    )!
    useStore.getState().applyLayoutPreset(preset.id)
    const finishes = useStore.getState().finishes
    expect(finishes.floor.livingDining).toBe(preset.dryFloor)
    expect(finishes.floor.mainBedroom).toBe(preset.dryFloor)
  })
})
