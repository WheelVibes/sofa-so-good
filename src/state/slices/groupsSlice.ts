import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { FurnitureItem } from '../../furniture/types';

export interface GroupsSlice {
  /** Members sharing the given groupId, in store order. */
  itemsInGroup: (groupId: string) => FurnitureItem[];
  /** Mean of member [x, z] positions; pivot for unit rotate. Null if empty. */
  groupCentroid: (groupId: string) => [number, number] | null;
  /** Axis-aligned envelope of member positions. Null if empty. */
  groupBounds: (
    groupId: string,
  ) => { minX: number; minZ: number; maxX: number; maxZ: number } | null;
}

export const createGroupsSlice: SliceCreator<GroupsSlice, RootState> = (_set, get) => ({
  itemsInGroup: (groupId) => get().items.filter((it) => it.groupId === groupId),
  groupCentroid: (groupId) => {
    const members = get().itemsInGroup(groupId);
    if (members.length === 0) return null;
    const sx = members.reduce((a, i) => a + i.position[0], 0);
    const sz = members.reduce((a, i) => a + i.position[1], 0);
    return [sx / members.length, sz / members.length];
  },
  groupBounds: (groupId) => {
    const members = get().itemsInGroup(groupId);
    if (members.length === 0) return null;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const i of members) {
      minX = Math.min(minX, i.position[0]);
      maxX = Math.max(maxX, i.position[0]);
      minZ = Math.min(minZ, i.position[1]);
      maxZ = Math.max(maxZ, i.position[1]);
    }
    return { minX, minZ, maxX, maxZ };
  },
});
