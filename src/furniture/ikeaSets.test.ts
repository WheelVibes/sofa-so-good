import { describe, it, expect } from 'vitest';
import type { SetRecipe, SetMemberInstance, MemberFootprint } from './ikeaSets';
import { expandMembers, arrangeSet } from './ikeaSets';
import { CLEARANCE } from '../layout/designRules';

/** Fixture: VIHALS dining set — 1 gateleg table + 2 folding chairs (spec §1.5). */
const VIHALS: SetRecipe = {
  setKey: 'vihals-vihals-table-and-2-folding-chairs',
  setName: 'VIHALS / VIHALS table and 2 folding chairs',
  members: [
    { groupKey: 'vihals-gateleg-table', role: 'table', qty: 1, articleNumber: '70595733' },
    { groupKey: 'vihals-folding-chair', role: 'chair', qty: 2, articleNumber: '40592745' },
  ],
};

describe('expandMembers', () => {
  it('expands each member by qty into a flat, indexed instance list', () => {
    const out: SetMemberInstance[] = expandMembers(VIHALS);
    expect(out).toHaveLength(3); // 1 table + 2 chairs
    expect(out.map((m) => m.role)).toEqual(['table', 'chair', 'chair']);
    expect(out.map((m) => m.index)).toEqual([0, 1, 2]); // contiguous, stable
    expect(out[0].groupKey).toBe('vihals-gateleg-table');
  });
});

// Type-only smoke: MemberFootprint is { w, d }.
const _fp: MemberFootprint = { w: 1.4, d: 0.85 };
void _fp;

/** Build the index→footprint map a `SetMemberInstance[]` needs. */
function footprintsFor(
  instances: { index: number; role: string }[],
  byRole: Record<string, MemberFootprint>,
): Record<number, MemberFootprint> {
  const out: Record<number, MemberFootprint> = {};
  for (const m of instances) out[m.index] = byRole[m.role];
  return out;
}

describe('arrangeSet', () => {
  const TABLE: MemberFootprint = { w: 1.4, d: 0.85 }; // long edge along X
  const CHAIR: MemberFootprint = { w: 0.45, d: 0.5 };

  it('centres the table at the group origin', () => {
    const instances = expandMembers(VIHALS);
    const placements = arrangeSet(instances, footprintsFor(instances, { table: TABLE, chair: CHAIR }));
    const table = placements.find((p) => p.index === 0)!;
    expect(table.dx).toBe(0);
    expect(table.dz).toBe(0);
    expect(table.rotation).toBe(0);
  });

  it('puts the 2 chairs on opposite long edges, facing the table, no overlap, clearance respected', () => {
    const instances = expandMembers(VIHALS);
    const fps = footprintsFor(instances, { table: TABLE, chair: CHAIR });
    const placements = arrangeSet(instances, fps);
    const chairs = placements.filter((p) => p.index !== 0);
    expect(chairs).toHaveLength(2);

    // Opposite long (Z) edges: one at -Z, one at +Z.
    const zs = chairs.map((c) => c.dz).sort((a, b) => a - b);
    expect(zs[0]).toBeLessThan(0);
    expect(zs[1]).toBeGreaterThan(0);

    // Edge-to-chair gap >= CLEARANCE.sofaToCoffee (table half-depth + gap + chair half-depth).
    const minCentreOffset = TABLE.d / 2 + CLEARANCE.sofaToCoffee + CHAIR.d / 2;
    for (const c of chairs) expect(Math.abs(c.dz)).toBeGreaterThanOrEqual(minCentreOffset - 1e-9);

    // Facing the table: -Z chair faces +Z (rot 0), +Z chair faces -Z (rot PI).
    const back = chairs.find((c) => c.dz < 0)!;
    const front = chairs.find((c) => c.dz > 0)!;
    expect(back.rotation).toBeCloseTo(0, 5);
    expect(front.rotation).toBeCloseTo(Math.PI, 5);

    // No overlap between the two chairs (they're on different edges → trivially
    // separated in Z by > chair depth).
    expect(Math.abs(back.dz - front.dz)).toBeGreaterThan(CHAIR.d);
  });
});

describe('arrangeSet — 4 chairs', () => {
  const TABLE: MemberFootprint = { w: 1.6, d: 0.9 };
  const CHAIR: MemberFootprint = { w: 0.45, d: 0.5 };

  const FOUR: SetRecipe = {
    setKey: 'x-table-4-chairs',
    setName: 'X table and 4 chairs',
    members: [
      { groupKey: 'x-table', role: 'table', qty: 1, articleNumber: '00000001' },
      { groupKey: 'x-chair', role: 'chair', qty: 4, articleNumber: '00000002' },
    ],
  };

  it('splits 4 chairs 2+2 across opposite edges with no same-edge overlap', () => {
    const instances = expandMembers(FOUR);
    const fps: Record<number, MemberFootprint> = {};
    for (const m of instances) fps[m.index] = m.role === 'table' ? TABLE : CHAIR;
    const placements = arrangeSet(instances, fps);

    const chairs = placements.filter((p) => p.index !== 0);
    expect(chairs).toHaveLength(4);

    const back = chairs.filter((c) => c.dz < 0);
    const front = chairs.filter((c) => c.dz > 0);
    expect(back).toHaveLength(2);
    expect(front).toHaveLength(2);

    // Same-edge chairs separated along X by more than a chair width.
    const sep = (row: typeof back) =>
      Math.abs(row[0].dx - row[1].dx);
    expect(sep(back)).toBeGreaterThan(CHAIR.w);
    expect(sep(front)).toBeGreaterThan(CHAIR.w);

    // All chairs face the table.
    for (const c of back) expect(c.rotation).toBeCloseTo(0, 5);
    for (const c of front) expect(c.rotation).toBeCloseTo(Math.PI, 5);
  });
});

describe('arrangeSet — bench / stool / other', () => {
  const TABLE: MemberFootprint = { w: 1.6, d: 0.9 };
  const SEAT: MemberFootprint = { w: 0.45, d: 0.5 };
  const BENCH: MemberFootprint = { w: 1.2, d: 0.4 };
  const OTHER: MemberFootprint = { w: 0.4, d: 0.4 };

  it('treats stools like chairs (distributed around the edges)', () => {
    const recipe: SetRecipe = {
      setKey: 'bar', setName: 'bar', members: [
        { groupKey: 't', role: 'table', qty: 1, articleNumber: '1' },
        { groupKey: 's', role: 'stool', qty: 2, articleNumber: '2' },
      ],
    };
    const instances = expandMembers(recipe);
    const fps: Record<number, MemberFootprint> = {};
    for (const m of instances) fps[m.index] = m.role === 'table' ? TABLE : SEAT;
    const placed = arrangeSet(instances, fps).filter((p) => p.index !== 0);
    expect(placed).toHaveLength(2);
    expect(placed.some((p) => p.dz < 0)).toBe(true);
    expect(placed.some((p) => p.dz > 0)).toBe(true);
  });

  it('centres one bench per long edge, facing the table', () => {
    const recipe: SetRecipe = {
      setKey: 'bench-set', setName: 'bench set', members: [
        { groupKey: 't', role: 'table', qty: 1, articleNumber: '1' },
        { groupKey: 'b', role: 'bench', qty: 2, articleNumber: '2' },
      ],
    };
    const instances = expandMembers(recipe);
    const fps: Record<number, MemberFootprint> = {};
    for (const m of instances) fps[m.index] = m.role === 'table' ? TABLE : BENCH;
    const benches = arrangeSet(instances, fps).filter((p) => p.index !== 0);
    expect(benches).toHaveLength(2);
    // Centred along the edge.
    for (const b of benches) expect(b.dx).toBeCloseTo(0, 5);
    // Opposite edges, facing the table.
    const back = benches.find((b) => b.dz < 0)!;
    const front = benches.find((b) => b.dz > 0)!;
    expect(back.rotation).toBeCloseTo(0, 5);
    expect(front.rotation).toBeCloseTo(Math.PI, 5);
  });

  it('tucks an "other" member past the -X end of the table', () => {
    const recipe: SetRecipe = {
      setKey: 'o-set', setName: 'o set', members: [
        { groupKey: 't', role: 'table', qty: 1, articleNumber: '1' },
        { groupKey: 'o', role: 'other', qty: 1, articleNumber: '2' },
      ],
    };
    const instances = expandMembers(recipe);
    const fps: Record<number, MemberFootprint> = {};
    for (const m of instances) fps[m.index] = m.role === 'table' ? TABLE : OTHER;
    const other = arrangeSet(instances, fps).find((p) => p.index !== 0)!;
    expect(other.dx).toBeLessThan(0); // past -X end
    expect(other.dz).toBeCloseTo(0, 5);
    expect(other.rotation).toBe(0);
    // Clear of the table edge.
    expect(Math.abs(other.dx)).toBeGreaterThanOrEqual(TABLE.w / 2 + OTHER.w / 2 - 1e-9);
  });
});
