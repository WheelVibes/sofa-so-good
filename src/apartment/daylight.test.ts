// src/apartment/daylight.test.ts
import { describe, it, expect } from 'vitest';
import { roomDaylightFactor } from './daylight';

const downSun: [number, number, number] = [0, -1, 0];
const noonSun: [number, number, number] = [0.1, 1, 0];
// Singapore noon-ish: sun roughly south, high altitude. Scene +Z is south.
const noonFromSouth: [number, number, number] = [0, 0.95, 0.31];
const morningEast: [number, number, number] = [0.7, 0.7, 0]; // east + up
const westernSun: [number, number, number] = [-0.7, 0.7, 0];

describe('roomDaylightFactor', () => {
  it('returns 0 when sun is below horizon', () => {
    expect(roomDaylightFactor('mainBedroom', downSun)).toBe(0);
  });

  it('returns 1 for external rooms (acLedge) when sun is up', () => {
    expect(roomDaylightFactor('acLedge', noonSun)).toBe(1);
  });

  it('returns 0 for fully interior rooms (corridor) under any sun', () => {
    expect(roomDaylightFactor('corridor', noonSun)).toBe(0);
    expect(roomDaylightFactor('corridor', morningEast)).toBe(0);
  });

  it('lights the main bedroom when sun comes from its window-bearing wall', () => {
    // mainBedroom has windows on the north external wall.
    const northSun: [number, number, number] = [0, 0.7, -0.7];
    expect(roomDaylightFactor('mainBedroom', northSun)).toBeGreaterThan(0);
  });

  it('does not light the main bedroom when sun comes from the opposite side', () => {
    const southSun: [number, number, number] = [0, 0.7, 0.7];
    expect(roomDaylightFactor('mainBedroom', southSun)).toBe(0);
  });

  it('clamps to 1', () => {
    expect(roomDaylightFactor('mainBedroom', noonFromSouth)).toBeLessThanOrEqual(1);
  });

  it('returns a finite number for every room', () => {
    const rooms: import('./types').RoomId[] = [
      'mainBedroom','bedroom2','bedroom3','bath1','bath2',
      'livingDining','kitchen','corridor','serviceYard','householdShelter','acLedge',
    ];
    for (const r of rooms) {
      const f = roomDaylightFactor(r, westernSun);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
