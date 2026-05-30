# IKEA Set Decomposition — Part 2a: Groups Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a furniture group a first-class, emergent concept in the store — items sharing an optional `groupId` select together, drill into a single member, drag/rotate as a rigid unit, group/ungroup with auto-dissolve under two members, and survive save/load via a schema v1→v2 bump.

**Architecture:** A group has **no separate entity** — it *is* the set of items sharing a `FurnitureItem.groupId` (a new optional field, mirroring `flipX`/`flipZ`/`locked`). A focused new `src/state/slices/groupsSlice.ts` holds pure-ish group helpers (query members, centroid/bounds, group/ungroup, remove-with-auto-dissolve, rotate-about-centroid) so `itemsSlice` stays about single items and the selection click logic stays in `selectionSlice`; the helpers fold over the existing `items` array. Selection gains a transient `activeGroupId` so a first click on a grouped item selects the whole group and a second/Alt click drills into one member. Persistence is a no-op migration because `groupId` is optional.

**Tech Stack:** TypeScript, React + Three.js (@react-three/fiber), Zustand store (slice pattern, `SliceCreator<T, RootState>`), Zod save schema, Vitest (`npm test` runs once; `npm test -- <file>` runs one file). Tests are store-mutation + pure-helper + schema round-trip — they call `useStore.getState().__resetForTest()` in `beforeEach`, the same style as `src/state/slices/uiSlice.test.ts` and `src/state/schema.test.ts`.

**Why a new `groupsSlice.ts` (not folded into `itemsSlice`):** `itemsSlice` is deliberately about single-item CRUD (`addItem`/`moveItem`/`rotateItem`/`deleteItem`). Group operations read/write *many* items and compute geometry (centroid, rigid rotate); keeping them in one focused slice keeps each file's responsibility clear and makes the helpers directly unit-testable. It composes into `RootState` exactly like every other slice, so it can still call `get().moveItem(...)`, `get().pushHistory()`, etc.

**Scope note — deferred to Part 2b (plan 3):** the IKEA set-recipe loader (`ikeaSets.ts`), the `arrangeSet` arranger, the Sets-menu wiring, and the **mandatory visual verification pass** (CLAUDE.md) all belong to plan 3 (the integrated IKEA expander). This plan ships only the store/selection/drag/schema core, verified by **unit/logic + schema round-trip tests**. No screenshot pass is required here; it is explicitly owned by plan 3.

---

### Task 1: Add the optional `groupId` field to `FurnitureItem`

**Files:**
- Modify: `src/furniture/types.ts:350-366` (the `FurnitureItem` interface)

- [ ] **Step 1: Add the field**

In `src/furniture/types.ts`, inside the `FurnitureItem` interface, add `groupId` right after the `locked` field (keep `props` last):

```ts
export interface FurnitureItem {
  id: string;
  defId: FurnitureType;
  /** [x, z] in metres in the apartment frame; Y is always 0 (floor-anchored). */
  position: [number, number];
  /** Y-axis rotation in radians. */
  rotation: number;
  /** Mirror flips in the item's local frame (left↔right / front↔back).
   *  Optional + default false so saved layouts stay backward-compatible. */
  flipX?: boolean;
  flipZ?: boolean;
  /** When true the item is pinned: it can't be dragged, nudged, rotated or
   *  deleted until unlocked (good for fixed appliances / fixtures). Optional
   *  + default false so saved layouts stay backward-compatible. */
  locked?: boolean;
  /** Items sharing a groupId move/rotate as a unit and select together.
   *  A group IS the set of items with this id — there is no separate entity.
   *  Optional + default undefined so existing saves stay valid. */
  groupId?: string;
  props: ParamProps;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors — adding an optional field can't break existing code).

- [ ] **Step 3: Commit**

```bash
git add src/furniture/types.ts
git commit -m "feat: add optional groupId to FurnitureItem

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `groupsSlice` — `itemsInGroup` query helper + slice scaffold

**Files:**
- Create: `src/state/slices/groupsSlice.ts`
- Create: `src/state/slices/groupsSlice.test.ts`
- Modify: `src/state/store.ts` (compose the slice)

- [ ] **Step 1: Write the failing test**

Create `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `itemsInGroup` does not exist on the store (TS/runtime error).

- [ ] **Step 3: Create the slice with `itemsInGroup`**

Create `src/state/slices/groupsSlice.ts`:

```ts
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
```

- [ ] **Step 4: Compose the slice into the store**

In `src/state/store.ts`, add the import near the other slice imports (after the `createSelectionSlice` import block, around line 36):

```ts
import { createGroupsSlice, type GroupsSlice } from './slices/groupsSlice';
```

Add `GroupsSlice` to the `RootState` interface's extends list (right after `SelectionSlice,` around line 102):

```ts
    SelectionSlice,
    GroupsSlice,
    UserAssetsSlice,
```

Add the slice spread inside `create<RootState>(...)` (right after `...createSelectionSlice(set, get, api),` around line 146):

```ts
  ...createSelectionSlice(set, get, api),
  ...createGroupsSlice(set, get, api),
  ...createUserAssetsSlice(set, get, api),
```

(`GroupsSlice` has no own state fields, so it is **not** added to `INITIAL`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts src/state/store.ts
git commit -m "feat: groupsSlice with itemsInGroup query

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `groupCentroid` + `groupBounds` geometry helpers

**Files:**
- Modify: `src/state/slices/groupsSlice.ts`
- Modify: `src/state/slices/groupsSlice.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `groupCentroid` / `groupBounds` not defined.

- [ ] **Step 3: Implement the helpers**

In `src/state/slices/groupsSlice.ts`, extend the interface and the creator. Add to the `GroupsSlice` interface:

```ts
  /** Mean of member [x, z] positions; pivot for unit rotate. Null if empty. */
  groupCentroid: (groupId: string) => [number, number] | null;
  /** Axis-aligned envelope of member positions. Null if empty. */
  groupBounds: (
    groupId: string,
  ) => { minX: number; minZ: number; maxX: number; maxZ: number } | null;
```

Add to the returned object in `createGroupsSlice`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts
git commit -m "feat: groupCentroid + groupBounds helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `groupItems(ids)` — assign a fresh groupId

**Files:**
- Modify: `src/state/slices/groupsSlice.ts`
- Modify: `src/state/slices/groupsSlice.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `groupItems` not defined.

- [ ] **Step 3: Implement `groupItems`**

In `src/state/slices/groupsSlice.ts`, add a UUID helper at the top of the file (matching `itemsSlice.ts`'s `newId`, with the non-secure fallback):

```ts
function newGroupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `grp-${crypto.randomUUID()}`;
  }
  return `grp-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
```

Add to the `GroupsSlice` interface:

```ts
  /** Assign one fresh groupId to the given items (needs >= 2; pushes history).
   *  Returns the new id, or '' if fewer than 2 ids were supplied. */
  groupItems: (ids: string[]) => string;
```

Add to the creator (note it now uses `set`, so change the signature from `(_set, get)` to `(set, get)`):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts
git commit -m "feat: groupItems assigns a fresh groupId

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `ungroup(groupId)` — clear groupId on members

**Files:**
- Modify: `src/state/slices/groupsSlice.ts`
- Modify: `src/state/slices/groupsSlice.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `ungroup` not defined.

- [ ] **Step 3: Implement `ungroup`**

Add to the `GroupsSlice` interface:

```ts
  /** Clear groupId on every member of a group (pushes history). */
  ungroup: (groupId: string) => void;
```

Add to the creator:

```ts
  ungroup: (groupId) => {
    if (get().itemsInGroup(groupId).length === 0) return;
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) =>
        it.groupId === groupId ? { ...it, groupId: undefined } : it,
      ),
    }));
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts
git commit -m "feat: ungroup clears groupId on members

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `removeFromGroup(itemId)` with auto-dissolve under 2 members

**Files:**
- Modify: `src/state/slices/groupsSlice.ts`
- Modify: `src/state/slices/groupsSlice.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `removeFromGroup` not defined.

- [ ] **Step 3: Implement `removeFromGroup`**

Add to the `GroupsSlice` interface:

```ts
  /** Remove an item from its group. If that leaves fewer than 2 members,
   *  the remaining lone member is also cleared (a 1-item group is just an
   *  item). No-op for an ungrouped item. Pushes history when it changes. */
  removeFromGroup: (itemId: string) => void;
```

Add to the creator:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts
git commit -m "feat: removeFromGroup with auto-dissolve under 2 members

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Deletion auto-dissolves the group it leaves under-strength

**Files:**
- Modify: `src/state/slices/itemsSlice.ts:55-71` (`deleteItem`)
- Create: `src/state/slices/itemsSlice.groups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/slices/itemsSlice.groups.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { FurnitureItem } from '../../furniture/types';

function item(id: string, pos: [number, number], groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: pos, rotation: 0, groupId, props: {} };
}

describe('deleteItem auto-dissolves its group', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('keeps a 2+ member group when one of 3 is deleted', () => {
    useStore.getState().setItems([
      item('a', [0, 0], 'g1'),
      item('b', [1, 0], 'g1'),
      item('c', [2, 0], 'g1'),
    ]);
    useStore.getState().deleteItem('a');
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'a')).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.groupId).toBe('g1');
    expect(items.find((i) => i.id === 'c')?.groupId).toBe('g1');
  });

  it('dissolves the group when deletion leaves a lone member', () => {
    useStore.getState().setItems([item('a', [0, 0], 'g1'), item('b', [1, 0], 'g1')]);
    useStore.getState().deleteItem('a');
    const items = useStore.getState().items;
    expect(items.find((i) => i.id === 'a')).toBeUndefined();
    expect(items.find((i) => i.id === 'b')?.groupId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/itemsSlice.groups.test.ts`
Expected: FAIL — the second case fails: `b` still has `groupId: 'g1'` because `deleteItem` doesn't dissolve.

- [ ] **Step 3: Implement dissolve-on-delete**

In `src/state/slices/itemsSlice.ts`, replace the `deleteItem` body so it also clears a lone surviving group member. Replace lines 55-71:

```ts
  deleteItem: (id) => {
    // Coalesced so a multi-select delete loop produces one undo step.
    get().pushHistoryCoalesced('delete');
    set((s) => {
      const ids = s.selectedItemIds.filter((x) => x !== id);
      const deleted = s.items.find((it) => it.id === id);
      // Auto-dissolve: if deleting this item leaves its group with a single
      // member, that lone member is no longer a group either.
      const dissolveGroup =
        deleted?.groupId != null &&
        s.items.filter((it) => it.groupId === deleted.groupId && it.id !== id).length < 2
          ? deleted.groupId
          : null;
      return {
        items: s.items
          .filter((it) => it.id !== id)
          .map((it) =>
            dissolveGroup != null && it.groupId === dissolveGroup
              ? { ...it, groupId: undefined }
              : it,
          ),
        selectedItemId:
          s.selectedItemId === id
            ? ids.length > 0
              ? ids[ids.length - 1]
              : null
            : s.selectedItemId,
        selectedItemIds: ids,
      };
    });
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/itemsSlice.groups.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Verify no regression on existing item tests**

Run: `npm test -- src/state/`
Expected: PASS (all store/slice tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/state/slices/itemsSlice.ts src/state/slices/itemsSlice.groups.test.ts
git commit -m "feat: deleteItem auto-dissolves an under-strength group

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `groupRotate` — rigid rotation about the group centroid

**Files:**
- Modify: `src/state/slices/groupsSlice.ts`
- Modify: `src/state/slices/groupsSlice.test.ts`

This is the genuinely new transform per spec §2.3. `DragController.tsx:130-171` already translates a whole selected group as a unit, so unit *drag* is free once §2.2 selects the whole group. `groupRotate` provides the pure transform that App.tsx's rotate-key handler currently inlines (App.tsx:210-237) — Task 11 will route that handler through this helper.

`groupRotate` is **pure transform math** (no `canPlace`): it computes and applies the rotated transforms. Collision rejection stays in the caller (the rotate-key handler), matching how the existing inline code checks `canPlace` against `merged` before committing.

- [ ] **Step 1: Write the failing test**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `groupRotate` not defined.

- [ ] **Step 3: Implement `groupRotate`**

Add to the `GroupsSlice` interface:

```ts
  /** Rotate every member of a group by `delta` radians about the group's
   *  centroid (rigid — the arrangement is preserved). Pure transform: the
   *  caller is responsible for any collision rejection before calling.
   *  Pushes history. No-op for an empty group. */
  groupRotate: (groupId: string, delta: number) => void;
```

Add to the creator (uses the same `cx + dx*cos - dz*sin`, `cz + dx*sin + dz*cos` formula as the existing App.tsx inline rotate so behaviour is identical):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts
git commit -m "feat: groupRotate rigid rotation about group centroid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Selection — `activeGroupId` + group-aware `selectItem` with drill-in

**Files:**
- Modify: `src/state/slices/selectionSlice.ts`
- Modify: `src/state/store.ts` (add `activeGroupId` to `INITIAL`)
- Create: `src/state/slices/selectionSlice.groups.test.ts`

Spec §2.2: first click on a grouped item selects the whole group + sets `activeGroupId`; a second/Alt click on an already-selected member drills into just that one member (keeping `activeGroupId`); clicking elsewhere (or selecting an ungrouped item) clears `activeGroupId`. We implement this as a new `selectItemGrouped(id, opts)` action so the existing `selectItem` (used by many callers) keeps its simple semantics, and we add `activeGroupId` + a `clearActiveGroup()` setter. The click handler (Task 10) calls `selectItemGrouped`.

- [ ] **Step 1: Write the failing test**

Create `src/state/slices/selectionSlice.groups.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { FurnitureItem } from '../../furniture/types';

function item(id: string, groupId?: string): FurnitureItem {
  return { id, defId: 'dining-chair', position: [0, 0], rotation: 0, groupId, props: {} };
}

describe('selectionSlice group select + drill-in', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('first click on a grouped item selects the whole group + sets activeGroupId', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1'), item('c')]);
    useStore.getState().selectItemGrouped('a', {});
    expect(useStore.getState().selectedItemIds.slice().sort()).toEqual(['a', 'b']);
    expect(useStore.getState().activeGroupId).toBe('g1');
    expect(useStore.getState().selectedItemId).toBe('a');
  });

  it('second click on an already-selected member drills into just that member', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')]);
    useStore.getState().selectItemGrouped('a', {}); // selects group
    useStore.getState().selectItemGrouped('a', {}); // drill-in
    expect(useStore.getState().selectedItemIds).toEqual(['a']);
    expect(useStore.getState().activeGroupId).toBe('g1'); // still in group context
  });

  it('alt-click drills in directly even on the first click', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')]);
    useStore.getState().selectItemGrouped('a', { alt: true });
    expect(useStore.getState().selectedItemIds).toEqual(['a']);
    expect(useStore.getState().activeGroupId).toBe('g1');
  });

  it('selecting an ungrouped item clears activeGroupId', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1'), item('c')]);
    useStore.getState().selectItemGrouped('a', {});
    useStore.getState().selectItemGrouped('c', {});
    expect(useStore.getState().selectedItemIds).toEqual(['c']);
    expect(useStore.getState().activeGroupId).toBeNull();
  });

  it('clearActiveGroup() drops the group context', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')]);
    useStore.getState().selectItemGrouped('a', {});
    useStore.getState().clearActiveGroup();
    expect(useStore.getState().activeGroupId).toBeNull();
  });

  it('selectItem(null) also clears activeGroupId (deselect-all path)', () => {
    useStore.getState().setItems([item('a', 'g1'), item('b', 'g1')]);
    useStore.getState().selectItemGrouped('a', {});
    useStore.getState().selectItem(null);
    expect(useStore.getState().activeGroupId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/selectionSlice.groups.test.ts`
Expected: FAIL — `activeGroupId`, `selectItemGrouped`, `clearActiveGroup` not defined.

- [ ] **Step 3: Extend the selection slice**

In `src/state/slices/selectionSlice.ts`, add to the `SelectionSlice` interface (after `selectedWall`):

```ts
  /** Transient group context: the group whose members are collectively
   *  selected. Set when a click lands on a grouped item; null when a click
   *  lands elsewhere or on an ungrouped item. Not persisted. */
  activeGroupId: string | null;
```

Add to the interface's method list (after `toggleSelectedItem`):

```ts
  /** Group-aware click selection (spec §2.2).
   *  - grouped item, not already the active group → select whole group.
   *  - grouped item, already-selected member of the active group (or alt) →
   *    drill into just that member (keep activeGroupId).
   *  - ungrouped item → select it and clear activeGroupId. */
  selectItemGrouped: (id: string, opts: { alt?: boolean }) => void;
  /** Drop the active-group context (e.g. on an outside/empty click). */
  clearActiveGroup: () => void;
```

Add `activeGroupId: null,` to the `SELECTION_INITIAL` object and to its `Pick<...>` key union:

```ts
export const SELECTION_INITIAL: Pick<
  SelectionSlice,
  | 'selectedItemId'
  | 'selectedItemIds'
  | 'selectedRoomId'
  | 'selectedWall'
  | 'hoveredItemId'
  | 'activeGroupId'
> = {
  selectedItemId: null,
  selectedItemIds: [],
  selectedRoomId: null,
  selectedWall: null,
  hoveredItemId: null,
  activeGroupId: null,
};
```

Make the existing `selectItem` clear `activeGroupId` (so deselect / plain select drops group context):

```ts
  selectItem: (id) =>
    set({
      selectedItemId: id,
      selectedItemIds: id ? [id] : [],
      selectedRoomId: null,
      selectedWall: null,
      activeGroupId: null,
    }),
```

Add the new actions to the creator (place them after `toggleSelectedItem`). Note this needs `get`, so change the creator signature from `(set)` to `(set, get)`:

```ts
  selectItemGrouped: (id, opts) =>
    set(() => {
      const item = get().items.find((it) => it.id === id);
      const gid = item?.groupId ?? null;
      if (!gid) {
        // Ungrouped item: plain single-select, drop group context.
        return {
          selectedItemId: id,
          selectedItemIds: [id],
          selectedRoomId: null,
          selectedWall: null,
          activeGroupId: null,
        };
      }
      const prev = get();
      const alreadySelectedMember =
        prev.activeGroupId === gid && prev.selectedItemIds.includes(id);
      const drillIn = opts.alt === true || alreadySelectedMember;
      if (drillIn) {
        // Drill into the single member, keep the group context active.
        return {
          selectedItemId: id,
          selectedItemIds: [id],
          selectedRoomId: null,
          selectedWall: null,
          activeGroupId: gid,
        };
      }
      // First click on the group: select all members.
      const memberIds = get().itemsInGroup(gid).map((it) => it.id);
      return {
        selectedItemId: id,
        selectedItemIds: memberIds,
        selectedRoomId: null,
        selectedWall: null,
        activeGroupId: gid,
      };
    }),
  clearActiveGroup: () => set({ activeGroupId: null }),
```

- [ ] **Step 4: Add `activeGroupId` to the store INITIAL via SELECTION_INITIAL**

`activeGroupId` is already in `SELECTION_INITIAL` (Step 3), and `store.ts` spreads `...SELECTION_INITIAL` into `INITIAL`, so `__resetForTest` clears it automatically. No change to `store.ts` is required — confirm by reading `src/state/store.ts:118-137` that `...SELECTION_INITIAL` is present in `INITIAL`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/state/slices/selectionSlice.groups.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Verify no selection regressions**

Run: `npm test -- src/state/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/slices/selectionSlice.ts src/state/slices/selectionSlice.groups.test.ts
git commit -m "feat: group-aware selection with activeGroupId + drill-in

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Route the Furniture click handler through `selectItemGrouped`

**Files:**
- Modify: `src/furniture/Furniture.tsx:24-38` (`onClick`)

The click handler currently calls `selectItem(item.id)` on a plain click. Switch the plain-click path to `selectItemGrouped` so grouped items get group-select + drill-in. Shift-click (multi-select toggle) is unchanged per spec §2.2 ("Existing flat multi-select … is unchanged"). Alt-click drills in directly.

This is a small wiring change with no unit-test entry point (it's a Three.js pointer callback); the behaviour it routes to is already covered by Task 9's `selectItemGrouped` tests. Full visual verification of click→group-highlight is in plan 3.

- [ ] **Step 1: Update the onClick handler**

In `src/furniture/Furniture.tsx`, replace the plain-click branch in `onClick`:

```ts
      // Shift-click extends/toggles the multi-selection; plain click
      // selects the item's group (or the item, if ungrouped) with drill-in
      // on a repeat/Alt click (see selectItemGrouped).
      if (e.shiftKey) state.toggleSelectedItem(item.id);
      else state.selectItemGrouped(item.id, { alt: e.altKey });
```

- [ ] **Step 2: Update onPointerDown so grabbing a grouped member group-selects it**

In `onPointerDown` (around line 55), the current guard `if (!e.shiftKey && !state.selectedItemIds.includes(item.id)) state.selectItem(item.id);` collapses to a single item. Change it to group-select so a drag on a grouped member grabs the whole group (matching §2.3 unit drag). Replace that line with:

```ts
      if (!e.shiftKey && !state.selectedItemIds.includes(item.id)) {
        state.selectItemGrouped(item.id, { alt: e.altKey });
      }
```

The existing `groupOriginals` snapshot below it (lines 67-79) already reads `post.selectedItemIds`, so once the group is selected the whole group is snapshotted and `DragController` translates it as a unit — no further drag change needed.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify the store/scene suite still passes**

Run: `npm test`
Expected: PASS (no test exercises this callback directly; this confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/Furniture.tsx
git commit -m "feat: route furniture click/grab through group-aware selection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Route the rotate-key group path through `groupRotate`

**Files:**
- Modify: `src/App.tsx:187-238` (the rotate keybinding handler)

The rotate-key handler inlines centroid rotation for multi-select (App.tsx:210-237). Replace that inline block with a `canPlace` pre-check followed by a single `groupRotate` call, so group rotate lives in one place (the slice). The single-item branch (lines 193-207) is unchanged. `groupRotate` pushes history itself, so drop the inline `pushHistory()` from this branch.

- [ ] **Step 1: Replace the multi-select rotate block**

In `src/App.tsx`, replace the group-rotate block (the code from the `// Group rotate:` comment through the closing of the `if (allFit)` block, currently lines ~210-237) with:

```ts
        // Group rotate about the centroid (rigid). Pre-check canPlace on the
        // rotated candidates; commit via the store's groupRotate helper if all
        // fit (groupRotate preserves the arrangement + pushes history).
        const cx = group.reduce((a, i) => a + i.position[0], 0) / group.length;
        const cz = group.reduce((a, i) => a + i.position[1], 0) / group.length;
        const cos = Math.cos(step);
        const sin = Math.sin(step);
        const candidates = group.map((i) => {
          const dx = i.position[0] - cx;
          const dz = i.position[1] - cz;
          return {
            ...i,
            position: [cx + dx * cos - dz * sin, cz + dx * sin + dz * cos] as [number, number],
            rotation: i.rotation + step,
          };
        });
        const byId = new Map(candidates.map((c) => [c.id, c]));
        const merged = state.items.map((i) => byId.get(i.id) ?? i);
        const allFit = candidates.every((c) => {
          const def = catalog[c.defId];
          return def && canPlace(c, def, { others: merged, defs: catalog, doors: state.doors });
        });
        if (allFit) {
          // All selected members share one group when this path is reached via
          // a group selection; rotate every distinct group present in the
          // selection about the shared centroid the candidates were computed
          // from. In practice the selection is one group, so rotate it.
          const gid = group[0].groupId;
          if (gid && group.every((i) => i.groupId === gid)) {
            state.groupRotate(gid, step);
          } else {
            // Heterogeneous multi-select (spans groups / ungrouped): keep the
            // historical inline behaviour so a flat marquee still rotates.
            state.pushHistory();
            for (const c of candidates) {
              state.rotateItem(c.id, c.rotation);
              state.moveItem(c.id, c.position);
            }
          }
        }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify the suite still passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route group rotate-key through groupRotate helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Group / Ungroup actions in the multi-select panel

**Files:**
- Modify: the multi-select align/distribute panel component (find it in Step 1)

Spec §2.4: a multi-select of 2+ items shows **"Group"**; an active group shows **"Ungroup"**, in the existing align/distribute multi-select panel. This is a UI wiring task onto the helpers from Tasks 4 & 5. Its visual verification is owned by plan 3; here we only add the buttons + handlers and confirm the build/typecheck.

- [ ] **Step 1: Locate the align/distribute panel**

Run: `grep -rln "align\|distribute\|Distribute\|Align" src/ui`
Then identify the component that renders when `selectedItemIds.length > 1` (the multi-select panel). Read it to learn its store-access pattern (it will already read `selectedItemIds` from `useStore`).

- [ ] **Step 2: Add the Group/Ungroup buttons**

In that panel component, read `activeGroupId`, `selectedItemIds`, `groupItems`, and `ungroup` from the store, e.g.:

```tsx
const selectedItemIds = useStore((s) => s.selectedItemIds);
const activeGroupId = useStore((s) => s.activeGroupId);
const groupItems = useStore((s) => s.groupItems);
const ungroup = useStore((s) => s.ungroup);
```

Add, alongside the existing align/distribute buttons, a conditional control:

```tsx
{activeGroupId ? (
  <button type="button" onClick={() => ungroup(activeGroupId)}>
    Ungroup
  </button>
) : (
  selectedItemIds.length > 1 && (
    <button type="button" onClick={() => groupItems(selectedItemIds)}>
      Group
    </button>
  )
)}
```

(Match the panel's existing button markup/className conventions rather than the bare element above; reuse whatever button component/styles the panel already uses.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: Group/Ungroup buttons in the multi-select panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Minimal "Add to group" affordance in the Inspector

**Files:**
- Modify: `src/ui/InspectorPanel.tsx` (or the inspector component for a single selected item)
- Modify: `src/state/slices/groupsSlice.ts` (add `addToGroup`)
- Modify: `src/state/slices/groupsSlice.test.ts`

Spec §2.4 allows the IKEA-specific Add affordance to be **minimal**. We add an `addToGroup(itemId, groupId)` store action (unit-testable) and a tiny Inspector button "Add to active group" shown when an item is selected and an `activeGroupId` exists but the item isn't yet a member. The drop-while-active-group path is a plan-3 concern (it touches the catalog drop flow); here we ship the store action + a button so a selected loose item can join.

- [ ] **Step 1: Write the failing test for `addToGroup`**

Append to `src/state/slices/groupsSlice.test.ts`:

```ts
describe('groupsSlice.addToGroup', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('stamps the given groupId on the item', () => {
    useStore.getState().setItems([item('a', [0, 0], 'g1'), item('b', [1, 0], 'g1'), item('c', [2, 0])]);
    useStore.getState().addToGroup('c', 'g1');
    expect(useStore.getState().items.find((i) => i.id === 'c')?.groupId).toBe('g1');
  });

  it('is a no-op for an unknown item or empty group id', () => {
    useStore.getState().setItems([item('a', [0, 0])]);
    useStore.getState().addToGroup('a', '');
    expect(useStore.getState().items[0].groupId).toBeUndefined();
    useStore.getState().addToGroup('nope', 'g1');
    expect(useStore.getState().items[0].groupId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: FAIL — `addToGroup` not defined.

- [ ] **Step 3: Implement `addToGroup`**

Add to the `GroupsSlice` interface:

```ts
  /** Add a single existing item into a group (pushes history). No-op if the
   *  item is unknown or groupId is empty. */
  addToGroup: (itemId: string, groupId: string) => void;
```

Add to the creator:

```ts
  addToGroup: (itemId, groupId) => {
    if (!groupId) return;
    if (!get().items.some((it) => it.id === itemId)) return;
    get().pushHistory();
    set((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, groupId } : it)),
    }));
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/slices/groupsSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the minimal Inspector button**

Open the single-item inspector (`grep -rln "InspectorPanel\|Inspector" src/ui` and pick the component rendered for a single selected item). Read `activeGroupId` and `addToGroup` from the store, and the currently selected item. Add, near the other per-item buttons:

```tsx
{activeGroupId && selectedItem && selectedItem.groupId !== activeGroupId && (
  <button type="button" onClick={() => addToGroup(selectedItem.id, activeGroupId)}>
    Add to group
  </button>
)}
```

(Use the inspector's existing button component/markup conventions; `selectedItem` is whatever variable the inspector already derives for the current item — reuse it.)

- [ ] **Step 6: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/slices/groupsSlice.ts src/state/slices/groupsSlice.test.ts src/ui
git commit -m "feat: addToGroup action + minimal Inspector add-to-group button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Schema v2 — `groupId` field + version bump

**Files:**
- Modify: `src/state/schema.ts:18-29` (`FurnitureItemZ`), `:105` (`version` literal), `:167` (`serialize` version)
- Modify: `src/state/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/schema.test.ts`:

```ts
  it('round-trips groupId on items and serializes as version 2', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setItems([
      { id: 'g-a', defId: 'dining-chair', position: [0, 0], rotation: 0, groupId: 'grp-1', props: {} },
      { id: 'g-b', defId: 'dining-chair', position: [1, 0], rotation: 0, groupId: 'grp-1', props: {} },
    ]);
    const out = serialize(useStore.getState());
    expect(out.version).toBe(2);
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const a = parsed.data.items.find((i) => i.id === 'g-a');
      const b = parsed.data.items.find((i) => i.id === 'g-b');
      expect(a?.groupId).toBe('grp-1');
      expect(b?.groupId).toBe('grp-1');
    }
  });

  it('accepts an item with no groupId (back-compat)', () => {
    useStore.getState().__resetForTest();
    useStore.getState().setItems([
      { id: 'plain', defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} },
    ]);
    const out = serialize(useStore.getState());
    const parsed = SerializedStateZ.safeParse(out);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items.find((i) => i.id === 'plain')?.groupId).toBeUndefined();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/schema.test.ts`
Expected: FAIL — `out.version` is `1` (not `2`), and the `version: z.literal(1)` parse rejects the v2 payload.

- [ ] **Step 3: Add `groupId` to `FurnitureItemZ`**

In `src/state/schema.ts`, add the field to `FurnitureItemZ` (after the `locked` line, before `props`):

```ts
const FurnitureItemZ = z.object({
  id: z.string(),
  defId: z.string(),
  position: z.tuple([z.number(), z.number()]),
  rotation: z.number(),
  // Optional mirror flips (backward-compatible with pre-flip saves).
  flipX: z.boolean().optional(),
  flipZ: z.boolean().optional(),
  // Optional lock/pin flag (backward-compatible).
  locked: z.boolean().optional(),
  // Optional group membership (introduced in save v2; absent = ungrouped).
  groupId: z.string().optional(),
  props: z.record(z.string(), z.union([z.number(), z.string()])),
});
```

- [ ] **Step 4: Bump the schema version literal**

Change the `version` field of `RawSerializedStateZ` (line ~105) from:

```ts
  version: z.literal(1),
```

to:

```ts
  version: z.literal(2),
```

- [ ] **Step 5: Bump the serialize() version**

In `serialize()` (line ~167) change:

```ts
    version: 1,
```

to:

```ts
    version: 2,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/state/schema.test.ts`
Expected: PASS (new cases pass; the existing round-trip test still passes — it doesn't assert on `version`).

- [ ] **Step 7: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts
git commit -m "feat: schema v2 with optional item groupId

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: v1→v2 migration (no-op on items) + bump `CURRENT_VERSION`

**Files:**
- Modify: `src/state/storage/migrations.ts`
- Modify: `src/state/storage/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/storage/migrations.test.ts` (inside the existing `describe('migrate', ...)`):

```ts
  it('migrates a v1 payload to v2, leaving items untouched (groupId optional)', () => {
    const v1 = {
      version: 1,
      items: [{ id: 'a', defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} }],
    };
    const out = migrate(v1) as { version: number; items: unknown[] };
    expect(out.version).toBe(2);
    expect(out.items).toEqual(v1.items); // no groupId added; absent = ungrouped
  });

  it('passes through a v2 payload unchanged', () => {
    const payload = { version: 2, items: [] };
    expect(migrate(payload)).toBe(payload);
  });
```

Also update the first existing case ("passes through a v1 payload unchanged") — under v2 a v1 payload is now migrated, not passed through, so change it to assert migration:

```ts
  it('migrates a v1 payload (no longer current) up to v2', () => {
    const payload = { version: 1, items: [] };
    const out = migrate(payload) as { version: number };
    expect(out.version).toBe(2);
  });
```

And update the "applies a registered v0→v1 migration if one exists" case: with `CURRENT_VERSION = 2`, `migrate({ version: 0 })` would walk `MIGRATIONS[0]` then `MIGRATIONS[1]`. Keep that case focused on v0 by registering a v0 stub that jumps straight to current, or assert it reaches version 2. Replace it with:

```ts
  it('walks a registered v0 migration up the chain to current', () => {
    MIGRATIONS[0] = (raw) => {
      const r = raw as Record<string, unknown>;
      return { ...r, version: 1, addedField: 'default' };
    };
    try {
      const out = migrate({ version: 0 }) as Record<string, unknown>;
      expect(out.version).toBe(2); // 0 -> 1 (stub) -> 2 (real)
      expect(out.addedField).toBe('default');
    } finally {
      delete MIGRATIONS[0];
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/state/storage/migrations.test.ts`
Expected: FAIL — `CURRENT_VERSION` is still 1, so v1 isn't migrated and `migrate({version:1})` returns it unchanged; the v2-passthrough/migration cases fail.

- [ ] **Step 3: Register the v1→v2 migration + bump CURRENT_VERSION**

In `src/state/storage/migrations.ts`, change `CURRENT_VERSION` and register the migration:

```ts
export const CURRENT_VERSION = 2;
```

```ts
export const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: introduced the optional FurnitureItem.groupId. Absent groupId is
  // already valid (a group is emergent from shared ids), so this is a no-op on
  // items — the bump exists so older readers reject v2 and the registry records
  // the field's introduction.
  1: (raw) => {
    const r = raw as Record<string, unknown>;
    return { ...r, version: 2 };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/state/storage/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — confirms the schema/migration/store changes are coherent across the codebase.

- [ ] **Step 6: Commit**

```bash
git add src/state/storage/migrations.ts src/state/storage/migrations.test.ts
git commit -m "feat: v1->v2 save migration (no-op on items) + bump CURRENT_VERSION

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Visual verification note

Per CLAUDE.md, app changes normally require a run + screenshot + visual-review pass. For this groups-core plan that full pass is **deferred to plan 3 (the integrated IKEA expander)**, where dropping a real set recipe exercises group select / unit drag / rotate / drill-in / add / save-reload end-to-end with screenshots. This plan is validated by unit/logic tests (`groupsSlice`, `selectionSlice` drill-in, `deleteItem` dissolve, `groupRotate` math) plus the schema v1→v2 round-trip and migration tests above. The UI wiring tasks (12, 13) and click/rotate routing (10, 11) are typecheck- and suite-verified here; their on-screen behaviour is reviewed in plan 3.

## Self-review

- **Spec coverage:**
  - §2.1 Store groups — Tasks 1 (`groupId`), 2 (`itemsInGroup`), 3 (`groupCentroid`/`groupBounds`), 4 (`groupItems`), 5 (`ungroup`), 6 (`removeFromGroup` auto-dissolve), 7 (delete auto-dissolve). ✓
  - §2.2 Selection drill-in — Task 9 (`activeGroupId`, `selectItemGrouped`, `clearActiveGroup`), Task 10 (click handler routing). ✓
  - §2.3 Drag/rotate as a unit — drag is free via existing `DragController` once group-select lands (Tasks 9/10, noted); new rotate-about-centroid in Task 8 (`groupRotate`) wired in Task 11. ✓
  - §2.4 Add/remove members — remove via auto-dissolve (Tasks 6/7); Group/Ungroup in Task 12; minimal Add affordance + `addToGroup` in Task 13. ✓
  - §2.6 Persistence + migration — schema v2 + version bump (Task 14), v1→v2 no-op migration + `CURRENT_VERSION` (Task 15), round-trip test (Task 14). ✓
  - §2.7 unit tests — every helper/selection/rotate task ships its failing-first Vitest test; schema round-trip in Task 14. ✓
  - §2.5 (IKEA expander) and the visual pass — intentionally **out of scope** (plan 3), called out above.
- **Placeholder scan:** no TBD/TODO/"handle edge cases". Tasks 12 and 13's UI markup intentionally says "match the panel's/inspector's existing button conventions" because the exact JSX component is discovered in-step (`grep`); the store actions they call are fully specified and tested. The store/schema/migration tasks (the testable core) carry complete code.
- **Type/name consistency:** action names are stable across tasks — `itemsInGroup`, `groupCentroid`, `groupBounds`, `groupItems`, `ungroup`, `removeFromGroup`, `groupRotate`, `addToGroup` (groupsSlice); `selectItemGrouped`, `clearActiveGroup`, `activeGroupId` (selectionSlice). The `{ alt?: boolean }` opts shape for `selectItemGrouped` matches its call sites in Task 10. `groupRotate` uses the exact `cx + dx*cos - dz*sin` / `cz + dx*sin + dz*cos` formula as the legacy App.tsx inline code so Task 11's refactor is behaviour-preserving. Schema `version` literal (Task 14) and `CURRENT_VERSION` (Task 15) both move to 2.
