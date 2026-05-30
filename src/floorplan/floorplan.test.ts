import { describe, it, expect } from 'vitest';
import { buildDefaultPlan } from './defaultPlan';
import { planRoomArea, planTotalArea, wallLength } from './types';
import { INTERIOR_AREA_M2 } from '../apartment/constants';

describe('floor plan model', () => {
  it('builds a default plan from the fixed flat', () => {
    const plan = buildDefaultPlan();
    expect(plan.walls.length).toBeGreaterThan(10);
    expect(plan.rooms.length).toBeGreaterThan(5);
    expect(plan.openings.some((o) => o.kind === 'door')).toBe(true);
    expect(plan.openings.some((o) => o.kind === 'window')).toBe(true);
    expect(plan.ceilingHeight).toBeCloseTo(2.6, 6);
  });

  it('computes room and total areas (incl. L-shape extensions)', () => {
    expect(planRoomArea({ id: 'a', name: 'A', origin: [0, 0], width: 3, depth: 4 })).toBe(12);
    expect(
      planRoomArea({ id: 'b', name: 'B', origin: [0, 0], width: 3, depth: 4, extension: { offset: [3, 0], width: 2, depth: 2 } }),
    ).toBe(16);
  });

  it("default plan's total area matches the fixed flat's interior area", () => {
    // buildDefaultPlan seeds every ROOM (incl. acLedge); INTERIOR_AREA_M2 sums
    // the non-external rooms. The plan total should be at least that.
    const total = planTotalArea(buildDefaultPlan());
    expect(total).toBeGreaterThanOrEqual(INTERIOR_AREA_M2 - 0.01);
  });

  it('measures wall length', () => {
    expect(wallLength({ id: 'w', start: [0, 0], end: [3, 4], thickness: 'internal' })).toBe(5);
  });
});
