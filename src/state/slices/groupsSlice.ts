import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { FurnitureItem } from '../../furniture/types';

function newGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `grp-${crypto.randomUUID()}`;
  }
  return `grp-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export interface GroupsSlice {
  /** Members sharing the given groupId, in store order. */
  itemsInGroup: (groupId: string) => FurnitureItem[];
  /** Mean of member [x, z] positions; pivot for unit rotate. Null if empty. */
  groupCentroid: (groupId: string) => [number, number] | null;
  /** Axis-aligned envelope of member positions. Null if empty. */
  groupBounds: (
    groupId: string,
  ) => { minX: number; minZ: number; maxX: number; maxZ: number } | null;
  /** Assign one fresh groupId to the given items (needs >= 2; pushes history).
   *  Returns the new id, or '' if fewer than 2 ids were supplied. */
  groupItems: (ids: string[]) => string;
  /** Clear groupId on every member of a group (pushes history). */
  ungroup: (groupId: string) => void;
  /** Remove an item from its group. If that leaves fewer than 2 members,
   *  the remaining lone member is also cleared (a 1-item group is just an
   *  item). No-op for an ungrouped item. Pushes history when it changes. */
  removeFromGroup: (itemId: string) => void;
  /** Rotate every member of a group by `delta` radians about the group's
   *  centroid (rigid — the arrangement is preserved). Pure transform: the
   *  caller is responsible for any collision rejection before calling.
   *  Pushes history. No-op for an empty group. */
  groupRotate: (groupId: string, delta: number) => void;
  /** Add a single existing item into a group (pushes history). No-op if the
   *  item is unknown or groupId is empty. */
  addToGroup: (itemId: string, groupId: string) => void;
}

export const createGroupsSlice: SliceCreator<GroupsSlice, RootState> = (set, get) => ({
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
  groupItems: (ids) => {
    if (ids.length < 2) return '';
    const gid = newGroupId();
    const idSet = new Set(ids);
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) => (idSet.has(it.id) ? { ...it, groupId: gid } : it)),
    }));
    return gid;
  },
  ungroup: (groupId) => {
    if (get().itemsInGroup(groupId).length === 0) return;
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) =>
        it.groupId === groupId ? { ...it, groupId: undefined } : it,
      ),
    }));
  },
  removeFromGroup: (itemId) => {
    const target = get().items.find((it) => it.id === itemId);
    const gid = target?.groupId;
    if (!gid) return;
    // After clearing `itemId`, who's left in the group?
    const remaining = get()
      .itemsInGroup(gid)
      .filter((it) => it.id !== itemId);
    // Clear the target, and if fewer than 2 remain, clear them too (dissolve).
    const dissolve = remaining.length < 2;
    const clearIds = new Set<string>([itemId, ...(dissolve ? remaining.map((it) => it.id) : [])]);
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) =>
        clearIds.has(it.id) ? { ...it, groupId: undefined } : it,
      ),
    }));
  },
  groupRotate: (groupId, delta) => {
    const members = get().itemsInGroup(groupId);
    if (members.length === 0) return;
    const centroid = get().groupCentroid(groupId);
    if (!centroid) return;
    const [cx, cz] = centroid;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    const next = new Map(
      members.map((i) => {
        const dx = i.position[0] - cx;
        const dz = i.position[1] - cz;
        return [
          i.id,
          {
            position: [cx + dx * cos - dz * sin, cz + dx * sin + dz * cos] as [number, number],
            rotation: i.rotation + delta,
          },
        ] as const;
      }),
    );
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) => {
        const t = next.get(it.id);
        return t ? { ...it, position: t.position, rotation: t.rotation } : it;
      }),
    }));
  },
  addToGroup: (itemId, groupId) => {
    if (!groupId) return;
    if (!get().items.some((it) => it.id === itemId)) return;
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, groupId } : it)),
    }));
  },
});
