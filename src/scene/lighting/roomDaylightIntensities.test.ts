import { describe, expect, it } from 'vitest';
import { computeRoomDaylightIntensities } from './roomDaylightIntensities';
import type { DoorState } from '../../state/slices/doorsSlice';
import { DOORS } from '../../apartment/constants';

const DEG = Math.PI / 180;
const sunDirNoon: [number, number, number] = [0, Math.sin(60 * DEG), -Math.cos(60 * DEG)];

function allDoorsOpen(): Record<string, DoorState> {
  const s: Record<string, DoorState> = {};
  for (const d of DOORS) s[d.id] = { open: true };
  return s;
}
function allDoorsClosed(): Record<string, DoorState> {
  const s: Record<string, DoorState> = {};
  for (const d of DOORS) s[d.id] = { open: false };
  return s;
}

describe('computeRoomDaylightIntensities', () => {
  it('windowless room with all doors closed has zero ambient fill at noon', () => {
    const r = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    expect(r.householdShelter.ambientFill).toBe(0);
  });

  it('opening any door from a windowless room toward a sunlit room raises its ambient fill', () => {
    const closed = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    const open = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsOpen());
    expect(open.householdShelter.ambientFill).toBeGreaterThan(closed.householdShelter.ambientFill);
  });

  it('all rooms have zero ambient fill below civil twilight', () => {
    const r = computeRoomDaylightIntensities([0, -0.2, -1], -10 * DEG, allDoorsOpen());
    for (const id of Object.keys(r)) {
      expect(r[id as keyof typeof r].ambientFill).toBe(0);
    }
  });

  it('windowed room with own door closed still has nonzero ambient fill at noon', () => {
    const r = computeRoomDaylightIntensities(sunDirNoon, 60 * DEG, allDoorsClosed());
    expect(r.mainBedroom.ambientFill).toBeGreaterThan(0);
  });
});
