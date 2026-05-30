import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { FurnitureItem } from '../../furniture/types';

export interface GroupsSlice {
  /** Members sharing the given groupId, in store order. */
  itemsInGroup: (groupId: string) => FurnitureItem[];
}

export const createGroupsSlice: SliceCreator<GroupsSlice, RootState> = (_set, get) => ({
  itemsInGroup: (groupId) => get().items.filter((it) => it.groupId === groupId),
});
