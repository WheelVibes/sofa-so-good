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
  it('returns at least one injector for a windowed bedroom', () => {
    const list = roomWindowedWallInjectors('mainBedroom');
    expect(list.length).toBeGreaterThan(0);
    const inj = list[0];
    expect(Number.isFinite(inj.position[0])).toBe(true);
    expect(Number.isFinite(inj.target[0])).toBe(true);
    const r = ROOMS.mainBedroom;
    const cx = r.origin[0] + r.width / 2;
    const cz = r.origin[1] + r.depth / 2;
    const dx = inj.target[0] - inj.position[0];
    const dz = inj.target[2] - inj.position[2];
    const tx = cx - inj.position[0];
    const tz = cz - inj.position[2];
    expect(dx * tx + dz * tz).toBeGreaterThan(0);
  });

  it('returns an empty list for a windowless interior room', () => {
    expect(roomWindowedWallInjectors('householdShelter')).toEqual([]);
  });
});
