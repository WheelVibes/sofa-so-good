import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('floorPlanSlice', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('seeds the default plan and computes a non-trivial layout', () => {
    const plan = useStore.getState().floorPlan;
    expect(plan.id).toBe('default-hdb-4room');
    expect(plan.rooms.length).toBeGreaterThan(5);
  });

  it('adds, updates and removes walls/rooms/openings', () => {
    const s = useStore.getState();
    const wid = s.addWall({ start: [0, 0], end: [2, 0], thickness: 'internal' });
    expect(useStore.getState().floorPlan.walls.some((w) => w.id === wid)).toBe(true);
    s.updateWall(wid, { thickness: 'external' });
    expect(useStore.getState().floorPlan.walls.find((w) => w.id === wid)!.thickness).toBe('external');
    const oid = s.addOpening({ kind: 'door', wallId: wid, offset: 0.2, width: 0.8, sill: 0, head: 2.1 });
    expect(useStore.getState().floorPlan.openings.some((o) => o.id === oid)).toBe(true);
    // Removing the wall drops its openings.
    s.removeWall(wid);
    const after = useStore.getState().floorPlan;
    expect(after.walls.some((w) => w.id === wid)).toBe(false);
    expect(after.openings.some((o) => o.id === oid)).toBe(false);
  });

  it('saves the active plan to the library and loads it back', () => {
    const s = useStore.getState();
    s.newFloorPlan('Test Apartment');
    s.updateFloorPlanMeta({ name: 'Test Apartment' });
    const savedId = s.saveCurrentPlan('Test Apartment');
    expect(useStore.getState().savedPlans.some((p) => p.id === savedId)).toBe(true);
    // Switch away, then load the saved one back.
    useStore.getState().resetFloorPlan();
    expect(useStore.getState().floorPlan.id).toBe('default-hdb-4room');
    useStore.getState().loadSavedPlan(savedId);
    expect(useStore.getState().floorPlan.name).toBe('Test Apartment');
  });

  it('re-saving under the same name updates rather than duplicates', () => {
    const s = useStore.getState();
    s.newFloorPlan('Dupe');
    s.saveCurrentPlan('Dupe');
    s.saveCurrentPlan('Dupe');
    expect(useStore.getState().savedPlans.filter((p) => p.name === 'Dupe').length).toBe(1);
  });
});
