// src/apartment/roomGraph.test.ts
import { describe, it, expect } from 'vitest';
import { buildRoomGraph, relaxDaylight, BLEED_ATTENUATION } from './roomGraph';
import type { RoomId } from './types';
import { DOORS, WALLS } from './constants';

describe('buildRoomGraph', () => {
  it('connects mainBedroom to corridor when their shared door exists', () => {
    const g = buildRoomGraph({});
    const mb = g.edges['mainBedroom'] ?? [];
    expect(mb.some((e) => e.neighbour === 'corridor')).toBe(true);
  });
  it('every interior door maps to exactly two rooms', () => {
    const g = buildRoomGraph({});
    for (const door of DOORS) {
      const wall = WALLS.find((w) => w.id === door.wallId)!;
      if (wall.thickness === 'external') continue; // external entrance doors connect to outside
      const roomsForDoor = (Object.keys(g.edges) as RoomId[]).filter((r) =>
        g.edges[r].some((e) => e.doorId === door.id),
      );
      expect(roomsForDoor.length, `door ${door.id} should appear in exactly 2 rooms`).toBe(2);
    }
  });
  it('marks edges open when doorState says so', () => {
    const g = buildRoomGraph({});
    const someDoorId = (g.edges['mainBedroom'] ?? [])[0]?.doorId;
    expect(someDoorId).toBeTruthy();
    const g2 = buildRoomGraph({ [someDoorId]: { open: true } });
    const edge = g2.edges['mainBedroom'].find((e) => e.doorId === someDoorId)!;
    expect(edge.open).toBe(true);
  });
});

describe('relaxDaylight', () => {
  // corridor is adjacent to mainBedroom, bedroom2, bedroom3, bath2, householdShelter
  const base: Record<RoomId, number> = {
    mainBedroom: 0, bedroom2: 0, bedroom3: 0, bath1: 0, bath2: 0,
    livingDining: 1, kitchen: 0, corridor: 1,
    serviceYard: 0, householdShelter: 0, acLedge: 1,
  };

  it('leaves base values when all doors closed', () => {
    const g = buildRoomGraph({});
    const out = relaxDaylight(base, g);
    expect(out.mainBedroom).toBe(0);
  });

  it('bleeds light from corridor into mainBedroom when their door is open', () => {
    const all = buildRoomGraph({});
    const mbDoor = all.edges['mainBedroom'].find((e) => e.neighbour === 'corridor')!.doorId;
    const g = buildRoomGraph({ [mbDoor]: { open: true } });
    const out = relaxDaylight(base, g);
    expect(out.mainBedroom).toBeCloseTo(BLEED_ATTENUATION, 5);
  });

  it('attenuates over multiple hops', () => {
    // open every door
    const allOpen: Record<string, { open: boolean }> = {};
    const g0 = buildRoomGraph({});
    for (const list of Object.values(g0.edges)) {
      for (const e of list) allOpen[e.doorId] = { open: true };
    }
    const g = buildRoomGraph(allOpen);
    const out = relaxDaylight(base, g);
    // bath1 is 2 hops from corridor (corridor -> mainBedroom -> bath1)
    expect(out.bath1).toBeGreaterThan(0);
    expect(out.bath1).toBeLessThanOrEqual(BLEED_ATTENUATION ** 2 + 1e-9);
  });
});
