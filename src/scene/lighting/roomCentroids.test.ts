import { describe, expect, it } from 'vitest';
import { roomCentroidPose } from './roomCentroids';
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
