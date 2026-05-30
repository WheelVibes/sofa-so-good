import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { FurnitureItem } from '../../furniture/types';

function item(id: string, pos: [number, number], groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: pos, rotation: 0, groupId, props: {} };
}

describe('groupsSlice.itemsInGroup', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('returns the members sharing a groupId', () => {
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [1, 0], 'g1'),
      item('c', [2, 0], 'g2'),
      item('d', [3, 0]),
    ]);
    const ids = useStore.getState().itemsInGroup('g1').map((i) => i.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('returns [] for an unknown group', () => {
    useStore.getState().setItems([item('a', [0, 0], 'g1')]);
    expect(useStore.getState().itemsInGroup('nope')).toEqual([]);
  });
});

describe('groupsSlice.groupCentroid / groupBounds', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('groupCentroid is the mean of member positions', () => {
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [2, 0], 'g1'),
      item('c', [2, 4], 'g1'),
      item('d', [0, 4], 'g1'),
    ]);
    expect(useStore.getState().groupCentroid('g1')).toEqual([1, 2]);
  });

  it('groupCentroid returns null for an empty group', () => {
    expect(useStore.getState().groupCentroid('nope')).toBeNull();
  });

  it('groupBounds is the min/max envelope of member positions', () => {
    useStore.getState().setItems([
      item('a', [-1, 3], 'g1'),
      item('b', [5, -2], 'g1'),
    ]);
    expect(useStore.getState().groupBounds('g1')).toEqual({
      minX: -1,
      minZ: -2,
      maxX: 5,
      maxZ: 3,
    });
  });

  it('groupBounds returns null for an empty group', () => {
    expect(useStore.getState().groupBounds('nope')).toBeNull();
  });
});

describe('groupsSlice.groupItems', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('stamps a shared fresh groupId on all given items and returns it', () => {
    useStore.getState().setItems([item('a', [0, 0]), item('b', [1, 0]), item('c', [2, 0])]);
    const gid = useStore.getState().groupItems(['a', 'b']);
    expect(typeof gid).toBe('string');
    expect(gid).not.toBe('');
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'a')?.groupId).toBe(gid);
    expect(items.find((i) => i.id === 'b')?.groupId).toBe(gid);
    expect(items.find((i) => i.id === 'c')?.groupId).toBeUndefined();
  });

  it('returns empty string and groups nothing for fewer than 2 ids', () => {
    useStore.getState().setItems([item('a', [0, 0])]);
    const gid = useStore.getState().groupItems(['a']);
    expect(gid).toBe('');
    expect(useStore.getState().items[0].groupId).toBeUndefined();
  });
});

describe('groupsSlice.ungroup', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('clears groupId on every member, leaving other groups intact', () => {
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [1, 0], 'g1'),
      item('c', [2, 0], 'g2'),
    ]);
    useStore.getState().ungroup('g1');
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'a')?.groupId).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.groupId).toBeUndefined();
    expect(items.find((i) => i.id === 'c')?.groupId).toBe('g2');
  });
});

describe('groupsSlice.removeFromGroup (auto-dissolve)', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('clears groupId on the removed item, leaving a 2+ member group intact', () => {
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [1, 0], 'g1'),
      item('c', [2, 0], 'g1'),
    ]);
    useStore.getState().removeFromGroup('a');
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'a')?.groupId).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.groupId).toBe('g1');
    expect(items.find((i) => i.id === 'c')?.groupId).toBe('g1');
  });

  it('auto-dissolves the group when it would drop below 2 members', () => {
    useStore.getState().setItems([item('a', [0, 0], 'g1'), item('b', [1, 0], 'g1')]);
    useStore.getState().removeFromGroup('a');
    const items = useStore.getState().items;
    // a left, and the lone remaining member b is also cleared.
    expect(items.find((i) => i.id === 'a')?.groupId).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.groupId).toBeUndefined();
  });

  it('is a no-op for an ungrouped item', () => {
    useStore.getState().setItems([item('a', [0, 0])]);
    useStore.getState().removeFromGroup('a');
    expect(useStore.getState().items[0].groupId).toBeUndefined();
  });
});

describe('groupsSlice.groupRotate (rigid about centroid)', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('rotates members about the centroid and bumps each rotation', () => {
    // Square of 4 members; centroid (1, 1).
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [2, 0], 'g1'),
      item('c', [2, 2], 'g1'),
      item('d', [0, 2], 'g1'),
    ]);
    useStore.getState().groupRotate('g1', Math.PI / 2);
    const items = useStore.getState().items;
    const get = (id: string) => items.find((i) => i.id === id)!;
    // +90° (CCW in [x,z] with the existing inline formula): a(0,0) -> (2,0).
    expect(get('a').position[0]).toBeCloseTo(2, 6);
    expect(get('a').position[1]).toBeCloseTo(0, 6);
    expect(get('a').rotation).toBeCloseTo(Math.PI / 2, 6);
    // Centroid is preserved.
    const cx =
      (get('a').position[0] + get('b').position[0] + get('c').position[0] + get('d').position[0]) /
      4;
    const cz =
      (get('a').position[1] + get('b').position[1] + get('c').position[1] + get('d').position[1]) /
      4;
    expect(cx).toBeCloseTo(1, 6);
    expect(cz).toBeCloseTo(1, 6);
  });

  it('is a no-op for an empty group', () => {
    useStore.getState().setItems([item('a', [0, 0])]);
    useStore.getState().groupRotate('nope', Math.PI / 2);
    expect(useStore.getState().items[0].rotation).toBe(0);
  });
});
