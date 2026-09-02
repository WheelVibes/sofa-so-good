// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../../features/featureFlags'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { useStore } from '../store'

const firstWallId = () => useStore.getState().floorPlan.walls[0]!.id
const measurements = () => useStore.getState().floorPlan.siteMeasurements ?? []

describe('siteMeasurements flag', () => {
  it('is a pro-tier flag, on by default, off in Simple', () => {
    expect(FEATURE_FLAGS['siteMeasurements'].tier).toBe('pro')
    expect(FEATURE_FLAGS['siteMeasurements'].default).toBe(true)
    expect(resolveFlags(false, {}, false, 'simple').siteMeasurements).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').siteMeasurements).toBe(true)
  })
})

describe('setSiteMeasurement / clearSiteMeasurement', () => {
  beforeEach(() => {
    // `resetToDefault` resets FURNITURE only (correctly — it is the demo-layout
    // restore, not a plan reset), so it leaves `siteMeasurements` in place.
    // Replace the plan outright for a clean baseline.
    useStore.setState({ floorPlan: buildDefaultPlan() })
  })

  it('records a measurement against a wall', () => {
    const id = firstWallId()
    useStore.getState().setSiteMeasurement('wall', id, 3456)
    const m = measurements()
    expect(m).toHaveLength(1)
    expect(m[0]!.kind).toBe('wall')
    expect(m[0]!.targetId).toBe(id)
    expect(m[0]!.measuredMm).toBe(3456)
  })

  it('REPLACES rather than accumulating when the same target is re-measured', () => {
    // The useful question is "what does it actually measure", not a history of
    // what we thought last time.
    const id = firstWallId()
    useStore.getState().setSiteMeasurement('wall', id, 3456)
    useStore.getState().setSiteMeasurement('wall', id, 3460)
    expect(measurements()).toHaveLength(1)
    expect(measurements()[0]!.measuredMm).toBe(3460)
  })

  it('keeps measurements of DIFFERENT targets side by side', () => {
    const a = firstWallId()
    const b = useStore.getState().floorPlan.walls[1]!.id
    useStore.getState().setSiteMeasurement('wall', a, 3000)
    useStore.getState().setSiteMeasurement('wall', b, 4000)
    expect(measurements()).toHaveLength(2)
  })

  it('distinguishes a room width from its depth', () => {
    const rid = useStore.getState().floorPlan.rooms[0]!.id
    useStore.getState().setSiteMeasurement('room-width', rid, 3000)
    useStore.getState().setSiteMeasurement('room-depth', rid, 2400)
    expect(measurements()).toHaveLength(2)
    expect(new Set(measurements().map((m) => m.kind))).toEqual(
      new Set(['room-width', 'room-depth']),
    )
  })

  it('rounds to whole millimetres — a tape does not read fractions', () => {
    useStore.getState().setSiteMeasurement('wall', firstWallId(), 3456.7)
    expect(measurements()[0]!.measuredMm).toBe(3457)
  })

  it('ignores a non-positive or non-finite value instead of storing it', () => {
    const id = firstWallId()
    useStore.getState().setSiteMeasurement('wall', id, 0)
    useStore.getState().setSiteMeasurement('wall', id, -5)
    useStore.getState().setSiteMeasurement('wall', id, Number.NaN)
    expect(measurements()).toHaveLength(0)
  })

  it('clearing removes the key entirely so an untouched plan stays clean', () => {
    const id = firstWallId()
    useStore.getState().setSiteMeasurement('wall', id, 3456)
    useStore.getState().clearSiteMeasurement('wall', id)
    // Not an empty array — the field is gone, so the save file is unchanged.
    expect(useStore.getState().floorPlan.siteMeasurements).toBeUndefined()
  })

  it('clearing one target leaves the others', () => {
    const a = firstWallId()
    const b = useStore.getState().floorPlan.walls[1]!.id
    useStore.getState().setSiteMeasurement('wall', a, 3000)
    useStore.getState().setSiteMeasurement('wall', b, 4000)
    useStore.getState().clearSiteMeasurement('wall', a)
    expect(measurements()).toHaveLength(1)
    expect(measurements()[0]!.targetId).toBe(b)
  })

  it('is undoable', () => {
    const id = firstWallId()
    useStore.getState().setSiteMeasurement('wall', id, 3456)
    expect(measurements()).toHaveLength(1)
    useStore.getState().undo()
    expect(useStore.getState().floorPlan.siteMeasurements ?? []).toHaveLength(0)
  })
})
