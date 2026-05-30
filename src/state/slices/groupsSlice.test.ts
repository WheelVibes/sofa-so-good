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
