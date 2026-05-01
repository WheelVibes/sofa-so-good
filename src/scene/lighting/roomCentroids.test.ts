import { describe, expect, it } from 'vitest';
import { roomCentroidPose, roomWindowedWallInjectors } from './roomCentroids';
import { ROOMS, FLAT } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';

describe('roomCentroidPose', () => {
  it('returns a centroid above the floor for a windowed bedroom', () => {
    const id: RoomId = 'mainBedroom';
    const pose = roomCentroidPose(id);
    const r = ROOMS[id];
    expect(pose.x).toBeCloseTo(r.origin[0] + r.width / 2, 3);
    expect(pose.z).toBeCloseTo(r.origin[1] + r.depth / 2, 3);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.y).toBeLessThan(r.ceilingHeight ?? FLAT.ceilingHeight);
  });
});

describe('roomWindowedWallInjectors', () => {
  it('returns at least one injector positioned inside a windowed bedroom', () => {
    const list = roomWindowedWallInjectors('mainBedroom');
    expect(list.length).toBeGreaterThan(0);
    const inj = list[0];
    expect(Number.isFinite(inj.position[0])).toBe(true);
    expect(inj.radius).toBeGreaterThan(0);
    const r = ROOMS.mainBedroom;
    // Position must lie within the room's footprint (interior placement).
    expect(inj.position[0]).toBeGreaterThanOrEqual(r.origin[0]);
    expect(inj.position[0]).toBeLessThanOrEqual(r.origin[0] + r.width);
    expect(inj.position[2]).toBeGreaterThanOrEqual(r.origin[1]);
    expect(inj.position[2]).toBeLessThanOrEqual(r.origin[1] + r.depth);
  });

  it('returns an empty list for a windowless interior room', () => {
    expect(roomWindowedWallInjectors('householdShelter')).toEqual([]);
  });
});
