import { describe, it, expect } from 'vitest';
import type { SetRecipe, SetMemberInstance, MemberFootprint } from './ikeaSets';
import { expandMembers } from './ikeaSets';

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
