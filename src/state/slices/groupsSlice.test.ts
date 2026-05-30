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
