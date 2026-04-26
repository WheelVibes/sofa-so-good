import { describe, it, expect } from 'vitest';
import { roomPolygon, roomCentroid, roomArea } from './rooms';
import { ROOMS } from './constants';

describe('roomPolygon', () => {
  it('returns 4 corners in NW-NE-SE-SW order', () => {
    const poly = roomPolygon('mainBedroom');
    expect(poly).toHaveLength(4);
    const r = ROOMS.mainBedroom;
    expect(poly[0]).toEqual(r.origin);
    expect(poly[1]).toEqual([r.origin[0] + r.width, r.origin[1]]);
    expect(poly[2]).toEqual([r.origin[0] + r.width, r.origin[1] + r.depth]);
    expect(poly[3]).toEqual([r.origin[0], r.origin[1] + r.depth]);
  });
});

describe('roomCentroid', () => {
  it('returns the rectangle center', () => {
    const c = roomCentroid('mainBedroom');
    const r = ROOMS.mainBedroom;
    expect(c[0]).toBeCloseTo(r.origin[0] + r.width / 2);
    expect(c[1]).toBeCloseTo(r.origin[1] + r.depth / 2);
  });
});

describe('roomArea', () => {
  it('returns width × depth', () => {
    const r = ROOMS.mainBedroom;
    expect(roomArea('mainBedroom')).toBeCloseTo(r.width * r.depth);
  });
});
