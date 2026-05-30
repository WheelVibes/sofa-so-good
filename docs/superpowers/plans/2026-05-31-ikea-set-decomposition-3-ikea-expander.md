# IKEA Set Decomposition — Part 2b: Set Expander + Visual Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a scraped IKEA **set recipe** (table + N chairs + …) into a real, arranged **group** of independent member items dropped from the Sets menu, and prove it works with the mandatory visual-verification pass.

**Architecture:** A framework-free `src/furniture/ikeaSets.ts` holds two pure functions — `arrangeSet(members, footprints)` (group-relative geometry: table centred, chairs evenly distributed around the long edges at `CLEARANCE` spacing facing the table; bench/stool/other rules) and `buildSetGroup(recipe, dropCentre, catalog)` (expand members × qty → arrange → stamp one fresh `groupId` via the plan-2 helper → `FurnitureItem[]`). The Sets menu in `Toolbar.tsx` lists imported IKEA recipes alongside the built-in `FURNITURE_SETS` and drops them through `buildSetGroup`; built-in sets get the same `groupId` stamp so there is **one drop code path**. Pure arranger math is TDD'd against fixture recipes + fixture footprints (no real GLB needed).

**Tech Stack:** React + TypeScript, Three.js / @react-three/fiber, Zustand, Vitest. The dev store is exposed on `window.__store`; screenshots via the Puppeteer harness `scripts/shot.mjs`.

**Spec:** `docs/superpowers/specs/2026-05-31-ikea-set-decomposition-design.md` — this plan implements **Part 2 §2.5 (Set-recipe → group expander)** and **§2.7 (testing + REQUIRED visual verification)**.

**DEPENDS ON (must be merged/available first):**
- **Plan 1 — Scraper recipe output** (`docs/superpowers/plans/…-ikea-set-decomposition-1-scraper.md`): produces the real `sets/<set_key>.json` recipe files (schema in spec §1.5: `set_key`, `set_name`, `members[{ group_key, role, qty, article_number }]`). This plan does NOT scrape; it consumes recipes modelled as a typed structure and unit-tests with FIXTURE recipes.
- **Plan 2 — `groupId` + group helpers** (`docs/superpowers/plans/…-ikea-set-decomposition-2-groups-core.md`): provides `FurnitureItem.groupId?: string`, the store helpers `itemsInGroup(groupId)`, `groupItems(ids)`, `groupCentroid(groupId)`, `ungroup(groupId)`, selection drill-in, unit drag/rotate, and schema v2 + migration. This plan calls those helpers by those exact names; it does NOT define them.

**Conventions:**
- Run a single test file: `npx vitest run path/to/file.test.ts`
- Typecheck: `npx tsc --noEmit`
- Commit with `git -c commit.gpgsign=false commit` (GPG signing fails in this env).
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Do NOT push or open a PR (that is a separate, explicitly-requested step).

---

## File Structure

**Create:**
- `src/furniture/ikeaSets.ts` — recipe types (`SetRecipe`, `SetMember`, `SetRole`), `arrangeSet`, `buildSetGroup`, and the imported-recipe accessor `ikeaSetRecipes()`.
- `src/furniture/ikeaSets.test.ts` — unit tests for `arrangeSet` + `buildSetGroup` with fixture recipes & footprints.

**Modify:**
- `src/ui/Toolbar.tsx` (`SetsMenu`, lines ~708–758) — list IKEA recipes alongside `FURNITURE_SETS`; drop via a shared `dropArranged` path that stamps a `groupId` on every set (built-in and IKEA).

**Read for context (do not change):**
- `src/furniture/furnitureSets.ts` — `FurnitureSet`/`SetItem` shape (the target arranged-drop shape).
- `src/layout/autoArrange.ts` (`baseFootprint` ~113–125) — footprint-from-def+props pattern to mirror.
- `src/layout/designRules.ts` — `CLEARANCE` constants reused for chair spacing.
- `src/furniture/types.ts` — `FurnitureItem`, `FurnitureDef`, `ParamProps`.

---

## Reference: shapes used throughout this plan

These are defined in **Task 1** and reused verbatim in later tasks. Repeated here so tasks can be read out of order:

```ts
// src/furniture/ikeaSets.ts
export type SetRole = 'table' | 'chair' | 'bench' | 'stool' | 'other';

export interface SetMember {
  /** Catalog/group key of the imported member def (recipe §1.5 `group_key`). */
  groupKey: string;
  role: SetRole;
  qty: number;
  articleNumber: string;
}

export interface SetRecipe {
  setKey: string;
  setName: string;
  members: SetMember[];
}

/** One member instance to arrange (qty already expanded into N of these). */
export interface SetMemberInstance {
  /** Index back into the expanded instance list (stable id suffix). */
  index: number;
  groupKey: string;
  role: SetRole;
}

/** Unrotated footprint of a member's GLB, in metres (w = x-extent, d = z-extent). */
export interface MemberFootprint {
  w: number;
  d: number;
}

/** A group-relative placement: metres from the group's drop centre + facing. */
export interface MemberPlacement {
  index: number;
  dx: number;
  dz: number;
  rotation: number;
}
```

The plan-2 store helper signatures this plan calls (defined in plan 2, do not redefine):

```ts
itemsInGroup(groupId: string): FurnitureItem[];
groupItems(ids: string[]): string;          // assigns a fresh groupId, returns it
groupCentroid(groupId: string): [number, number];
ungroup(groupId: string): void;
```

---

## Task 1: Recipe + footprint types and the empty `ikeaSets.ts` module

**Files:**
- Create: `src/furniture/ikeaSets.ts`
- Test: `src/furniture/ikeaSets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikeaSets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: FAIL — `Cannot find module './ikeaSets'` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `src/furniture/ikeaSets.ts`:

```ts
/**
 * IKEA set-recipe → arranged group expander.
 *
 * A scraped IKEA set (spec §1.5) is a `SetRecipe`: a name plus members, each a
 * standalone catalog def referenced by `groupKey`, with a `role` (table | chair
 * | bench | stool | other) and a `qty`. `expandMembers` flattens qty into a list
 * of `SetMemberInstance`; `arrangeSet` (Task 2/3) lays them out group-relative
 * using the design-rule spacing; `buildSetGroup` (Task 5) turns a recipe + drop
 * centre into ready-to-place `FurnitureItem[]` stamped with one shared groupId.
 */

export type SetRole = 'table' | 'chair' | 'bench' | 'stool' | 'other';

export interface SetMember {
  groupKey: string;
  role: SetRole;
  qty: number;
  articleNumber: string;
}

export interface SetRecipe {
  setKey: string;
  setName: string;
  members: SetMember[];
}

export interface SetMemberInstance {
  index: number;
  groupKey: string;
  role: SetRole;
}

export interface MemberFootprint {
  w: number;
  d: number;
}

export interface MemberPlacement {
  index: number;
  dx: number;
  dz: number;
  rotation: number;
}

/** Flatten `members × qty` into a contiguous, indexed instance list. Members
 *  keep recipe order (the table tends to be listed first per spec §1.2). */
export function expandMembers(recipe: SetRecipe): SetMemberInstance[] {
  const out: SetMemberInstance[] = [];
  let index = 0;
  for (const m of recipe.members) {
    const qty = Math.max(1, Math.floor(m.qty));
    for (let i = 0; i < qty; i++) {
      out.push({ index: index++, groupKey: m.groupKey, role: m.role });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): recipe types + expandMembers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `arrangeSet` — table centred, chairs around the long edges

**Files:**
- Modify: `src/furniture/ikeaSets.ts`
- Test: `src/furniture/ikeaSets.test.ts`

`arrangeSet(members, footprints)` returns a `MemberPlacement[]` (one per instance, by `index`). It is **group-relative**: the group's drop centre is the origin `(0,0)`, and the table is placed there. `footprints` is a map keyed by instance `index` → `MemberFootprint` (so two chairs with the same GLB still each get an entry). Chair offsets use `CLEARANCE.sofaToCoffee` (0.4 m) as the table-edge-to-chair gap — the same constant the existing dining arranger uses for the chair tuck (`autoArrange.ts` uses `+0.32`; we standardise on the shared constant).

Layout rules (this task: table + chairs):
- **Table** → `dx=0, dz=0, rotation=0`.
- **Chairs** → split as evenly as possible across the table's two **long edges** (the wider of `w`/`d` determines which axis is "long"). Half (rounded up) on the first long edge, the rest on the opposite long edge. Distribute along the edge centred on the table, facing the table.
  - If `w >= d` the long edges run along X (north/south of the table): chairs sit at `dz = ±(d/2 + gap + chairD/2)`, spread along X, facing the table (`rotation = 0` for the −Z side looking +Z toward the table is wrong — we face the chair's +Z **toward** the table; see math below).

Facing convention (matches primitives: items face **+Z** by default): a chair on the **−Z** side of the table must face **+Z** (`rotation = 0`); a chair on the **+Z** side faces **−Z** (`rotation = Math.PI`); on the **−X** side faces **+X** (`rotation = Math.PI/2`); on the **+X** side faces **−X** (`rotation = -Math.PI/2`).

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikeaSets.test.ts`:

```ts
import { arrangeSet } from './ikeaSets';
import { CLEARANCE } from '../layout/designRules';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: FAIL — `arrangeSet is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

Add to `src/furniture/ikeaSets.ts` (imports at top, function below `expandMembers`):

```ts
import { CLEARANCE } from '../layout/designRules';
```

```ts
/** Evenly spaced offsets for `n` items centred on 0 across a usable span. */
function spread(n: number, span: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => -span / 2 + (span * i) / (n - 1));
}

/**
 * Group-relative arrangement for a set: the table sits at the origin; chairs are
 * split across the table's two long edges, distributed along that edge, gapped
 * by `CLEARANCE.sofaToCoffee` from the table edge, and rotated to face the
 * table. Benches/stools/other follow analogous rules (Task 4). Returns one
 * `MemberPlacement` per instance (by `index`); the drop point is the origin.
 */
export function arrangeSet(
  members: SetMemberInstance[],
  footprints: Record<number, MemberFootprint>,
): MemberPlacement[] {
  const out: MemberPlacement[] = [];

  const table = members.find((m) => m.role === 'table');
  const tableFp = table ? footprints[table.index] : undefined;
  if (table) out.push({ index: table.index, dx: 0, dz: 0, rotation: 0 });

  const fp = tableFp ?? { w: 1.2, d: 0.8 };
  // Long edges run along the wider axis. longAlongX → chairs sit at ±Z.
  const longAlongX = fp.w >= fp.d;
  const halfPerp = (longAlongX ? fp.d : fp.w) / 2; // table half-extent toward the chair
  const alongHalf = (longAlongX ? fp.w : fp.d) / 2; // usable half-length of the long edge

  const chairs = members.filter((m) => m.role === 'chair');
  const nFirst = Math.ceil(chairs.length / 2);
  const sideA = chairs.slice(0, nFirst);
  const sideB = chairs.slice(nFirst);

  const placeRow = (row: SetMemberInstance[], sidePerp: 1 | -1) => {
    // Usable span along the edge leaves a small inset so end chairs stay over
    // the table footprint rather than overhanging the corner.
    const usable = Math.max(0, alongHalf * 2 - 0.4);
    const offs = spread(row.length, usable);
    row.forEach((m, i) => {
      const chFp = footprints[m.index] ?? { w: 0.45, d: 0.5 };
      const chPerp = (longAlongX ? chFp.d : chFp.w) / 2;
      const perp = sidePerp * (halfPerp + CLEARANCE.sofaToCoffee + chPerp);
      // Face the table: chair on -perp faces +; on +perp faces -.
      if (longAlongX) {
        const rotation = sidePerp < 0 ? 0 : Math.PI; // -Z faces +Z(0); +Z faces -Z(PI)
        out.push({ index: m.index, dx: offs[i], dz: perp, rotation });
      } else {
        const rotation = sidePerp < 0 ? Math.PI / 2 : -Math.PI / 2; // -X faces +X; +X faces -X
        out.push({ index: m.index, dx: perp, dz: offs[i], rotation });
      }
    });
  };
  placeRow(sideA, -1);
  placeRow(sideB, 1);

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): arrangeSet places chairs around the table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `arrangeSet` — 4 chairs split 2+2, end chairs do not collide

**Files:**
- Modify: `src/furniture/ikeaSets.ts` (only if the test reveals a gap)
- Test: `src/furniture/ikeaSets.test.ts`

This task hardens the arranger against a 4-chair set (the common dining case) and asserts no two chairs on the **same** edge overlap.

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikeaSets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it (likely) passes already, or fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS — the Task-2 implementation already handles 2+2 split. If `sep(...)` FAILS because the usable span `alongHalf * 2 - 0.4` is too tight for two chairs (`< CHAIR.w` apart), proceed to Step 3; otherwise skip to Step 5.

- [ ] **Step 3: Widen the usable span only if the test failed**

If and only if Step 2 failed on `sep`, change the `usable` line in `arrangeSet` so two chairs always clear a chair width — ensure the spread span is at least `row.length * chairWidthGuess`:

```ts
    const chairWGuess = 0.5;
    const usable = Math.max(alongHalf * 2 - 0.4, (row.length - 1) * (chairWGuess + 0.05));
    const offs = spread(row.length, usable);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (all `arrangeSet` tests).

- [ ] **Step 5: Commit (only if files changed)**

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "test(ikea-sets): arrangeSet handles 4-chair dining split

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `arrangeSet` — bench / stool / other rules

**Files:**
- Modify: `src/furniture/ikeaSets.ts`
- Test: `src/furniture/ikeaSets.test.ts`

Rules:
- **bench** → placed like a chair but only ever **one per long edge** (a bench spans the edge), centred (`dx`/`dz` along-axis = 0), gapped + facing the table.
- **stool** → treated exactly like a chair (distributed around the long edges).
- **other** → tucked alongside the table at the **−X end**, just past the table corner, no rotation: `dx = -(longHalfX + gap + otherW/2), dz = 0`. Multiple `other` members stack outward along −X.

To keep one distribution path, fold `stool` into the chair list and handle `bench`/`other` separately.

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikeaSets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: FAIL — benches/others are not produced (the Task-2 `arrangeSet` only emits table + chair instances; stools/benches/others are dropped).

- [ ] **Step 3: Extend `arrangeSet`**

In `arrangeSet`, replace the chair-collection line and add bench/other handling. The chair row now includes stools; benches are forced to one-per-edge; others tuck at −X:

```ts
  // Chairs + stools share the around-the-edges distribution.
  const seats = members.filter((m) => m.role === 'chair' || m.role === 'stool');
  const nFirst = Math.ceil(seats.length / 2);
  const sideA = seats.slice(0, nFirst);
  const sideB = seats.slice(nFirst);
```

(rename the old `chairs`/`sideA`/`sideB` block accordingly — `placeRow(sideA, -1); placeRow(sideB, 1);` stays).

Then, after the seat rows, add:

```ts
  // Benches: at most one per long edge, centred, facing the table.
  const benches = members.filter((m) => m.role === 'bench');
  benches.forEach((m, i) => {
    const bFp = footprints[m.index] ?? { w: 1.0, d: 0.4 };
    const sidePerp: 1 | -1 = i % 2 === 0 ? -1 : 1;
    const bPerp = (longAlongX ? bFp.d : bFp.w) / 2;
    const perp = sidePerp * (halfPerp + CLEARANCE.sofaToCoffee + bPerp);
    if (longAlongX) {
      out.push({ index: m.index, dx: 0, dz: perp, rotation: sidePerp < 0 ? 0 : Math.PI });
    } else {
      out.push({ index: m.index, dx: perp, dz: 0, rotation: sidePerp < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  });

  // "Other" members tuck past the table's -X end, stacking outward.
  const longHalfX = fp.w / 2;
  let outerX = longHalfX;
  for (const m of members.filter((mm) => mm.role === 'other')) {
    const oFp = footprints[m.index] ?? { w: 0.4, d: 0.4 };
    const dx = -(outerX + CLEARANCE.wallGap + oFp.w / 2);
    out.push({ index: m.index, dx, dz: 0, rotation: 0 });
    outerX += CLEARANCE.wallGap + oFp.w;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (all `arrangeSet` tests, incl. bench/stool/other).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): bench/stool/other arrangement rules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `buildSetGroup` — expand, arrange via footprints, stamp one groupId

**Files:**
- Modify: `src/furniture/ikeaSets.ts`
- Test: `src/furniture/ikeaSets.test.ts`

`buildSetGroup(recipe, dropCentre, catalog)` returns `FurnitureItem[]`:
1. `expandMembers(recipe)`.
2. Resolve each instance's footprint from `catalog[groupKey]` using the same logic as `autoArrange.baseFootprint` (def `defaultFootprint` + parametric overrides). Members are imported defs (`IkeaGltfDef` carry their footprint in `defaultFootprint`).
3. `arrangeSet(instances, footprints)`.
4. Build a `FurnitureItem` per placement: `position = [dropCentre.x + dx, dropCentre.z + dz]`, `rotation`, `defId = groupKey`, `props = {}` (or `defaultParamProps` for parametric defs), stable id.
5. Stamp **one** fresh `groupId` on every item.

`buildSetGroup` must not depend on the Zustand store (so it is unit-testable). It accepts the `groupId` from the caller, OR mints one itself if not provided — to keep the store helper `groupItems` as the single source of fresh ids, the Toolbar will pass the id from `groupItems` (Task 6). For the unit test we pass an explicit id and assert it is shared.

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikeaSets.test.ts`:

```ts
import { buildSetGroup } from './ikeaSets';
import type { FurnitureDef } from './types';

/** Minimal parametric catalog entries for the two VIHALS members. */
const FIXTURE_CATALOG: Record<string, FurnitureDef> = {
  'vihals-gateleg-table': {
    kind: 'parametric', primitive: 'DiningTable', id: 'vihals-gateleg-table',
    name: 'VIHALS gateleg table', category: 'tables', paramSchema: [],
    defaultFootprint: { w: 1.4, d: 0.85, h: 0.75 },
  },
  'vihals-folding-chair': {
    kind: 'parametric', primitive: 'DiningChair', id: 'vihals-folding-chair',
    name: 'VIHALS folding chair', category: 'seating', paramSchema: [],
    defaultFootprint: { w: 0.45, d: 0.5, h: 0.9 },
  },
};

describe('buildSetGroup', () => {
  it('produces 1 table + 2 chairs = 3 items, all sharing one groupId', () => {
    const items = buildSetGroup(VIHALS, { x: 6, z: 4 }, FIXTURE_CATALOG, 'grp-test');
    expect(items).toHaveLength(3);

    const groupIds = new Set(items.map((i) => i.groupId));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBe('grp-test');

    // defIds map to member groupKeys.
    const defCounts = items.reduce<Record<string, number>>((a, i) => {
      a[i.defId] = (a[i.defId] ?? 0) + 1; return a;
    }, {});
    expect(defCounts['vihals-gateleg-table']).toBe(1);
    expect(defCounts['vihals-folding-chair']).toBe(2);
  });

  it('positions the table at the drop centre and chairs offset around it', () => {
    const items = buildSetGroup(VIHALS, { x: 6, z: 4 }, FIXTURE_CATALOG, 'g');
    const table = items.find((i) => i.defId === 'vihals-gateleg-table')!;
    expect(table.position[0]).toBeCloseTo(6, 5);
    expect(table.position[1]).toBeCloseTo(4, 5);
    const chairs = items.filter((i) => i.defId === 'vihals-folding-chair');
    // Chairs on opposite sides of the table in Z (table.w >= table.d → ±Z).
    const dzs = chairs.map((c) => c.position[1] - 4).sort((a, b) => a - b);
    expect(dzs[0]).toBeLessThan(0);
    expect(dzs[1]).toBeGreaterThan(0);
  });

  it('gives every item a unique id', () => {
    const items = buildSetGroup(VIHALS, { x: 0, z: 0 }, FIXTURE_CATALOG, 'g');
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(items.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: FAIL — `buildSetGroup is not a function`.

- [ ] **Step 3: Implement `buildSetGroup`**

Add imports + function to `src/furniture/ikeaSets.ts`:

```ts
import type { FurnitureDef, FurnitureItem, ParamProps } from './types';
import { defaultParamProps } from './types';
```

```ts
/** Footprint of a member def + its params (mirrors autoArrange.baseFootprint). */
function defFootprint(def: FurnitureDef, props: ParamProps): MemberFootprint {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {};
    const wv = props[map.w ?? 'width'];
    const dv = props[map.d ?? 'depth'];
    if (typeof wv === 'number') w = wv;
    if (typeof dv === 'number') d = dv;
  }
  return { w, d };
}

export interface DropCentre {
  x: number;
  z: number;
}

/**
 * Resolve a recipe member's `groupKey` to its catalog def. The live catalog
 * (`useCatalog()` / `BUILTIN_CATALOG_PLUS_IKEA`) is keyed by `def.id`, and an
 * imported IKEA def's id is `ikea-<groupKey>` (see `furniture/ikea/importGroup.ts`,
 * `id: \`ikea-${meta.group_key}\``). So we try the bare `groupKey` first (which
 * matches a fixture catalog or any def whose id IS the groupKey) and then the
 * `ikea-` prefixed id. Returns the def (or null if the member isn't imported yet).
 */
function resolveMemberDef(
  catalog: Record<string, FurnitureDef>,
  groupKey: string,
): FurnitureDef | null {
  return catalog[groupKey] ?? catalog[`ikea-${groupKey}`] ?? null;
}

/**
 * Expand a set recipe into arranged, grouped `FurnitureItem`s ready to append
 * to the store. The table lands at `dropCentre`; chairs/benches/stools/other
 * arrange around it (`arrangeSet`). Every item is stamped with `groupId` so
 * they select/move as a unit. `groupId` is supplied by the caller (the Toolbar
 * mints it via the plan-2 `groupItems` helper); when omitted a local fallback
 * id is generated (used only by unit tests / non-store callers).
 *
 * Each item's `defId` is the RESOLVED catalog def id (e.g. `ikea-vihals-…`),
 * not the bare recipe `groupKey` — `defId` must be a real catalog key or the
 * item won't render. A member with no matching imported def is skipped (logged
 * by the caller); the set is still placed with whatever members resolved.
 */
export function buildSetGroup(
  recipe: SetRecipe,
  dropCentre: DropCentre,
  catalog: Record<string, FurnitureDef>,
  groupId: string = `set-${Date.now().toString(36)}`,
): FurnitureItem[] {
  const instances = expandMembers(recipe);

  // Resolve def + props + footprint per instance. Drop instances whose member
  // def isn't in the catalog (not imported) so we never emit an unrenderable
  // defId.
  const resolved: { m: SetMemberInstance; defId: string; props: ParamProps }[] = [];
  const footprints: Record<number, MemberFootprint> = {};
  for (const m of instances) {
    const def = resolveMemberDef(catalog, m.groupKey);
    if (!def) continue;
    const props: ParamProps = def.kind === 'parametric' ? defaultParamProps(def) : {};
    footprints[m.index] = defFootprint(def, props);
    resolved.push({ m, defId: def.id, props });
  }

  const keptInstances = resolved.map((r) => r.m);
  const placements = arrangeSet(keptInstances, footprints);
  const placementByIndex = new Map(placements.map((p) => [p.index, p]));
  const stamp = groupId.replace(/[^a-z0-9]/gi, '');

  return resolved.map(({ m, defId, props }) => {
    const p = placementByIndex.get(m.index) ?? { index: m.index, dx: 0, dz: 0, rotation: 0 };
    return {
      id: `${stamp}-${m.index}`,
      defId,
      position: [dropCentre.x + p.dx, dropCentre.z + p.dz] as [number, number],
      rotation: p.rotation,
      props,
      groupId,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): buildSetGroup expands+arranges+stamps groupId

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `ikeaSetRecipes()` accessor — read recipes from imported IKEA defs

**Files:**
- Modify: `src/furniture/ikeaSets.ts`
- Test: `src/furniture/ikeaSets.test.ts`

The Sets menu needs the list of imported IKEA recipes to render. Recipes arrive via the IKEA import payload (plan 1 emits `sets/<set_key>.json`; plan-2/import wiring stores them). For THIS plan we model the in-app recipe store as a tiny registry module-level array fed by the importer, with a pure accessor so the Toolbar has no import-layer coupling. The registry holds already-typed `SetRecipe`s.

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikeaSets.test.ts`:

```ts
import { ikeaSetRecipes, registerIkeaSetRecipes, _clearIkeaSetRecipes } from './ikeaSets';

describe('ikeaSetRecipes registry', () => {
  it('starts empty and returns registered recipes', () => {
    _clearIkeaSetRecipes();
    expect(ikeaSetRecipes()).toEqual([]);
    registerIkeaSetRecipes([VIHALS]);
    expect(ikeaSetRecipes()).toHaveLength(1);
    expect(ikeaSetRecipes()[0].setKey).toBe(VIHALS.setKey);
  });

  it('dedupes by setKey on re-register', () => {
    _clearIkeaSetRecipes();
    registerIkeaSetRecipes([VIHALS]);
    registerIkeaSetRecipes([VIHALS]);
    expect(ikeaSetRecipes()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: FAIL — `ikeaSetRecipes is not a function`.

- [ ] **Step 3: Implement the registry**

Add to `src/furniture/ikeaSets.ts`:

```ts
// ── Imported-recipe registry ────────────────────────────────────────────────
// Recipes are fed in by the IKEA import path (plan 1 emits sets/<key>.json;
// the importer calls registerIkeaSetRecipes). Kept module-level + pure so the
// Sets menu reads them without importing the IDB/import layer.
const RECIPES = new Map<string, SetRecipe>();

/** All currently-known imported set recipes, in insertion order. */
export function ikeaSetRecipes(): SetRecipe[] {
  return [...RECIPES.values()];
}

/** Register imported recipes (deduped by setKey; later wins). */
export function registerIkeaSetRecipes(recipes: SetRecipe[]): void {
  for (const r of recipes) RECIPES.set(r.setKey, r);
}

/** Test-only: clear the registry. */
export function _clearIkeaSetRecipes(): void {
  RECIPES.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): imported-recipe registry accessor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6b: Pure recipe parser (snake_case JSON → typed `SetRecipe`)

The scraper (plan 1) writes `sets/<set_key>.json` in **snake_case**
(`set_key`, `set_name`, `members[{ group_key, role, qty, article_number }]`),
but the in-app `SetRecipe` type is **camelCase**. The boundary parser is a pure,
importer-independent function — building and testing it here closes the seam
between plan 1's output and this plan's registry, so the future IKEA import
glue only has to call a tested function. No importer is needed for this task.

**Files:**
- Modify: `src/furniture/ikeaSets.ts` (add `parseSetRecipe`)
- Test: `src/furniture/ikeaSets.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

```ts
import { parseSetRecipe } from './ikeaSets';

describe('parseSetRecipe', () => {
  const raw = {
    set_key: 'vihals-vihals-table-and-2-folding-chairs',
    set_name: 'VIHALS / VIHALS table and 2 folding chairs',
    set_article: 's69599421',
    member_source: 'included',
    members: [
      { group_key: 'vihals-gateleg-table', role: 'table', qty: 1, article_number: '70595733' },
      { group_key: 'vihals-folding-chair', role: 'chair', qty: 2, article_number: '40592745' },
    ],
  };

  it('maps snake_case JSON to a camelCase SetRecipe', () => {
    const r = parseSetRecipe(raw);
    expect(r.setKey).toBe('vihals-vihals-table-and-2-folding-chairs');
    expect(r.setName).toBe('VIHALS / VIHALS table and 2 folding chairs');
    expect(r.members).toHaveLength(2);
    expect(r.members[0]).toMatchObject({ groupKey: 'vihals-gateleg-table', role: 'table', qty: 1 });
    expect(r.members[1]).toMatchObject({ groupKey: 'vihals-folding-chair', role: 'chair', qty: 2 });
  });

  it('defaults a missing qty to 1 and an unknown role to "other"', () => {
    const r = parseSetRecipe({
      set_key: 'x', set_name: 'X',
      members: [{ group_key: 'g', role: 'sideboard' }],
    });
    expect(r.members[0]).toMatchObject({ groupKey: 'g', role: 'other', qty: 1 });
  });

  it('throws on a recipe with no members', () => {
    expect(() => parseSetRecipe({ set_key: 'x', set_name: 'X', members: [] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/ikeaSets.test.ts -t parseSetRecipe`
Expected: FAIL — `parseSetRecipe is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/furniture/ikeaSets.ts` (`SetRole`/`SetRecipe`/`SetMember` types are from Task 1):

```ts
const KNOWN_ROLES: ReadonlySet<string> = new Set(['table', 'chair', 'bench', 'stool', 'other']);

function asRole(v: unknown): SetRole {
  return typeof v === 'string' && KNOWN_ROLES.has(v) ? (v as SetRole) : 'other';
}

/** Parse a scraper `sets/<key>.json` (snake_case) into a typed SetRecipe. */
export function parseSetRecipe(raw: unknown): SetRecipe {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawMembers = Array.isArray(o.members) ? o.members : [];
  const members: SetMember[] = rawMembers.map((m) => {
    const mo = (m ?? {}) as Record<string, unknown>;
    const qty = Number(mo.qty);
    return {
      groupKey: String(mo.group_key ?? ''),
      role: asRole(mo.role),
      qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
      articleNumber: mo.article_number != null ? String(mo.article_number) : '',
    };
  }).filter((m) => m.groupKey);
  if (members.length === 0) {
    throw new Error(`parseSetRecipe: recipe "${String(o.set_key)}" has no usable members`);
  }
  return {
    setKey: String(o.set_key ?? ''),
    setName: String(o.set_name ?? o.set_key ?? ''),
    members,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/ikeaSets.test.ts -t parseSetRecipe`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/furniture/ikeaSets.ts src/furniture/ikeaSets.test.ts
git -c commit.gpgsign=false commit -m "feat(ikea-sets): pure snake_case recipe parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Integration note for the future IKEA import glue (out of scope here):** the import pipeline (`docs/ikea-import-app-support.md` §9, not yet built) is responsible for reading each `sets/<key>.json` from the import payload, calling `parseSetRecipe(json)`, and passing the results to `registerIkeaSetRecipes([...])`. Both functions are provided and unit-tested by this plan, so that glue is a two-line call with no parsing logic of its own.

---

## Task 7: Wire the Sets menu — list IKEA recipes + one grouped drop path

**Files:**
- Modify: `src/ui/Toolbar.tsx` (`SetsMenu`, lines ~708–758)
- Test: manual + visual (Task 8); the drop logic itself is exercised by Tasks 1–6 unit tests + the visual pass.

Refactor `SetsMenu.drop` into a shared `dropArranged(items)` that stamps a `groupId` (via the plan-2 `groupItems` helper) on every dropped set — built-in and IKEA — so there is **one** code path. Built-in sets keep their hand-authored offsets; IKEA sets are built via `buildSetGroup`. Render IKEA recipes below the built-in list.

- [ ] **Step 1: Read the current `SetsMenu` and store helper surface**

Run: `npx vitest run src/state` to confirm plan-2 helpers exist.
Confirm in `src/state/slices/` that `groupItems(ids: string[]) => string` is exported on the store (plan 2). If the helper signature differs, adapt the calls below to match plan 2 exactly (it is the source of truth for the name/signature).

- [ ] **Step 2: Replace `SetsMenu` with the grouped, IKEA-aware version**

Replace the whole `SetsMenu` function in `src/ui/Toolbar.tsx` with:

```tsx
/** Drops a pre-arranged furniture set (group-selected, ready to drag). Lists
 *  the built-in vignettes and any imported IKEA set recipes; both land as a
 *  real group (shared groupId) so they move/select as a unit. */
function SetsMenu() {
  const [open, setOpen] = useState(false);

  /** Append items, group them, select the group, push one history entry. */
  const dropArranged = (items: FurnitureItem[]) => {
    const st = useStore.getState();
    st.pushHistory();
    st.setItems([...st.items, ...items]);
    const ids = items.map((i) => i.id);
    // Stamp a fresh shared groupId via the plan-2 helper (single source of ids).
    st.groupItems(ids);
    st.setSelectedItemIds(ids);
    setOpen(false);
  };

  /** Centre of the largest room in the active plan (the drop target). */
  const dropCentre = (): [number, number] => {
    const st = useStore.getState();
    const rooms = st.floorPlan.rooms;
    const big = rooms.reduce((a, b) => (planRoomArea(b) > planRoomArea(a) ? b : a), rooms[0]);
    return big
      ? [big.origin[0] + big.width / 2, big.origin[1] + big.depth / 2]
      : [st.floorPlan.extent[0] / 2, st.floorPlan.extent[1] / 2];
  };

  const dropBuiltin = (setId: string) => {
    const set = FURNITURE_SETS.find((s) => s.id === setId);
    if (!set) return;
    const [bx, bz] = dropCentre();
    const stamp = Date.now().toString(36);
    const items: FurnitureItem[] = set.items.map((e, i) => ({
      id: `set-${stamp}-${i}`,
      defId: e.defId,
      position: [bx + e.dx, bz + e.dz] as [number, number],
      rotation: e.rotation,
      props: e.props ?? {},
    }));
    dropArranged(items);
  };

  const dropIkea = (setKey: string) => {
    const recipe = ikeaSetRecipes().find((r) => r.setKey === setKey);
    if (!recipe) return;
    const [bx, bz] = dropCentre();
    const items = buildSetGroup(recipe, { x: bx, z: bz }, BUILTIN_CATALOG_PLUS_IKEA());
    dropArranged(items);
  };

  const recipes = ikeaSetRecipes();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Drop a pre-arranged furniture set (then drag it into place)"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Sets ▾
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg bg-white p-1 text-xs shadow">
          {FURNITURE_SETS.map((s) => (
            <button
              key={s.id}
              onClick={() => dropBuiltin(s.id)}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
            >
              {s.name}
            </button>
          ))}
          {recipes.length > 0 ? (
            <>
              <div className="mt-1 border-t border-neutral-200 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                IKEA sets
              </div>
              {recipes.map((r) => (
                <button
                  key={r.setKey}
                  onClick={() => dropIkea(r.setKey)}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
                >
                  {r.setName}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Add the imports + the catalog resolver `BUILTIN_CATALOG_PLUS_IKEA`**

`buildSetGroup` needs a catalog that resolves IKEA member `groupKey`s to their imported defs. Imported IKEA defs live in the `userFurniture` store slice (per the IKEA import plan). Add near the top of `Toolbar.tsx` (with the other imports):

```tsx
import { buildSetGroup, ikeaSetRecipes } from '../furniture/ikeaSets';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import type { FurnitureItem, FurnitureDef } from '../furniture/types';
```

And add this helper above `SetsMenu` (it merges built-ins with the store's imported defs so member `groupKey`s resolve):

```tsx
/** Catalog for set expansion: built-ins + the store's imported (IKEA/user) defs. */
function BUILTIN_CATALOG_PLUS_IKEA(): Record<string, FurnitureDef> {
  const st = useStore.getState();
  const merged: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG };
  for (const def of st.userFurniture ?? []) merged[def.id] = def;
  return merged;
}
```

> **Verified (2026-05-31):** the store slice is `userFurniture: (UserGltfDef | IkeaGltfDef)[]` (`src/state/slices/userAssetsSlice.ts`). This map is keyed by `def.id`, and an imported IKEA def's id is `ikea-<groupKey>` (`furniture/ikea/importGroup.ts`). `buildSetGroup`'s `resolveMemberDef` already tries both the bare `groupKey` and the `ikea-` prefix, so members resolve against this id-keyed map correctly — no change needed here. `BUILTIN_CATALOG` imports from `./builtinCatalog` (the same source `catalog.ts` uses).

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors. If `groupItems` / the imported-defs accessor name differs, fix the call sites to match the real store API, then re-run.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run the full unit suite + commit**

Run: `npm test`
Expected: PASS (existing suite + new `ikeaSets.test.ts`). Note: `furnitureSets.test.ts` still passes (built-in sets unchanged in shape).

```bash
git add src/ui/Toolbar.tsx
git -c commit.gpgsign=false commit -m "feat(ikea-sets): Sets menu lists IKEA recipes + one grouped drop path

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: REQUIRED visual verification pass (MANDATORY — per CLAUDE.md)

**This task is not optional and not satisfied by green tests.** Per CLAUDE.md and spec §2.7, every app change must be run, exercised, screenshotted, and **visually reviewed by you**. For each step below: run the command, **open the PNG and actually look at it**, then write 1–3 sentences in your task report describing what you saw (arrangement correct? overlaps? selection highlight? moved as a unit?). Do not write "screenshot captured" — describe the pixels.

> **VERIFIED MECHANICS (2026-05-31) — read before running any command below.** `scripts/shot.mjs` action types are ONLY `drag | wheel | click | key | wait` (see its header comment). **There is NO `{"type":"eval",...}` action** — the `eval` actions written in the command blocks below DO NOT WORK. Instead, every state mutation must run via the **`evalFile` (4th CLI arg)**, which `shot.mjs` executes in the page *before* it screenshots. So the pattern is **one evalFile per screenshot**: write `/tmp/ikea-set-<step>.js` that (a) seeds the recipe/defs if needed and (b) applies that step's mutation against `window.__store.getState()`, then call `node scripts/shot.mjs <out.png> 2500 /tmp/ikea-set-<step>.js '[{"type":"wait","ms":1200}]'`. Translate each `eval` action's `js` payload below into the body of that step's evalFile. Because page state does NOT persist across `shot.mjs` invocations (each reloads the app), every step's evalFile must re-seed + re-apply all prior mutations up to that step (or, simpler, re-build the post-state directly). Use the **store-only path** (next paragraph) so no real GLB/import is required.
>
> **Store-only seeding (no real scrape/import needed).** Drive everything through `buildSetGroup` + the store. In `src/main.tsx`, under `if (import.meta.env.DEV)`, temporarily expose: `window.__buildSetGroup = buildSetGroup; window.__catalog = BUILTIN_CATALOG; window.__groupItems = useStore.getState().groupItems;` (import `buildSetGroup` from `./furniture/ikeaSets`, `BUILTIN_CATALOG` from `./furniture/builtinCatalog`). **Remove this dev hook before any commit — Task 8 does not commit.** Then each evalFile builds an arranged group from BUILTIN substitutes (`dining-table-4` table + `dining-chair` chairs — both exist in `BUILTIN_CATALOG`, so they render without an IKEA import) and applies the step's change. Example seed body (drop):
> ```js
> const recipe = { setKey:'demo', setName:'Demo dining set', members:[
>   { groupKey:'dining-table-4', role:'table', qty:1, articleNumber:'1' },
>   { groupKey:'dining-chair',   role:'chair', qty:4, articleNumber:'2' } ] };
> const st = window.__store.getState();
> const items = window.__buildSetGroup(recipe, { x: 10.8, z: 4 }, window.__catalog, 'demo-grp');
> st.setItems([...st.items, ...items]);
> st.setSelectedItemIds(items.map(i => i.id));
> ```
> This exercises the real `buildSetGroup` + `arrangeSet` + `groupId` stamping (the actual code under test) end-to-end in the rendered app. The IKEA-specific path (recipe registry + `ikea-`-prefixed defs) is covered by the unit tests; this visual pass proves the arrangement + grouping render correctly. In each step below, IGNORE the literal `{"type":"eval",...}` action JSON and instead put its `js` into the step's evalFile as described here.

**Files:**
- Create (scratch, do not commit): `/tmp/ikea-set-seed.js` (an eval file that registers a fixture recipe + imported member defs so the Sets menu shows an IKEA set in dev).
- Output PNGs to `/tmp/ikea-set-*.png`.

**Setup — dev server + seed eval file.**

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev`
Expected: Vite serves on `http://localhost:5173`. Confirm it is up:
Run: `curl -sS -o /dev/null -w "%{http_code}" http://localhost:5173` → expect `200`.

- [ ] **Step 2: Write the seed eval file**

`scripts/shot.mjs` accepts an `evalFile` (4th arg) run in the page before screenshotting, and an `actionsJson` (5th arg). The store is on `window.__store`. Create `/tmp/ikea-set-seed.js` — it registers a VIHALS fixture recipe and the two member defs into the store's imported catalog + the recipe registry, so the Sets menu and `buildSetGroup` can resolve them without a real scrape:

```js
// Runs in the page (browser) context before the screenshot.
// Registers a fixture IKEA dining set so the Sets menu can drop it.
(() => {
  const tableDef = {
    kind: 'parametric', primitive: 'DiningTable', id: 'vihals-gateleg-table',
    name: 'VIHALS gateleg table', category: 'tables', paramSchema: [],
    defaultFootprint: { w: 1.4, d: 0.85, h: 0.75 },
  };
  const chairDef = {
    kind: 'parametric', primitive: 'DiningChair', id: 'vihals-folding-chair',
    name: 'VIHALS folding chair', category: 'seating', paramSchema: [],
    defaultFootprint: { w: 0.45, d: 0.5, h: 0.9 },
  };
  const st = window.__store.getState();
  // Add the member defs to the store's imported-def slice. Use whichever setter
  // the store exposes; addUserFurniture is the IKEA-import plan's accessor.
  (st.userFurniture ?? []).length; // touch to confirm slice exists
  if (st.addUserDef) { st.addUserDef(tableDef); st.addUserDef(chairDef); }
  else if (st.addUserFurniture) { st.addUserFurniture(tableDef); st.addUserFurniture(chairDef); }
  // Register the recipe.
  window.__ikeaSets = window.__ikeaSets || {};
  window.dispatchEvent(new CustomEvent('seed-ikea-set'));
})();
```

> The exact imported-def setter name comes from plan 2 / the IKEA-import plan. **Before running**, `grep -rn "addUserDef\|addUserFurniture\|registerIkeaSetRecipes" src` and adjust the seed file to the real names. The recipe registry is registered via `registerIkeaSetRecipes` (Task 6) — since that is module state, the simplest reliable seed is to import-and-register from a tiny dev hook; if calling it from the eval file is awkward, instead temporarily seed it from `src/main.tsx` under `import.meta.env.DEV` and document removing the seed before commit.

> **Fallback that avoids store-API guesswork:** if wiring the imported-def slice from an eval file proves fiddly, drive the verification through `buildSetGroup` directly in the eval file using `BUILTIN_CATALOG` substitutes (`dining-table-4` for the table, `dining-chair` for chairs) and `st.setItems` + `st.groupItems`, e.g.:
> ```js
> const st = window.__store.getState();
> const recipe = { setKey: 'demo', setName: 'Demo dining set',
>   members: [ { groupKey: 'dining-table-4', role: 'table', qty: 1, articleNumber: '1' },
>              { groupKey: 'dining-chair', role: 'chair', qty: 2, articleNumber: '2' } ] };
> // buildSetGroup is not on window; instead expose it: in dev, main.tsx can set
> // window.__buildSetGroup = buildSetGroup. Then:
> const items = window.__buildSetGroup(recipe, { x: 10.8, z: 4 }, window.__catalog);
> st.pushHistory(); st.setItems([...st.items, ...items]);
> st.groupItems(items.map((i) => i.id)); st.setSelectedItemIds(items.map((i) => i.id));
> ```
> To enable this, temporarily add in `src/main.tsx` under `if (import.meta.env.DEV)`: `window.__buildSetGroup = buildSetGroup; window.__catalog = BUILTIN_CATALOG;` (remove before any commit; this task does not commit).

- [ ] **Step 3: VERIFICATION 1 — drop an IKEA dining set, screenshot the arrangement**

Run:
```bash
node scripts/shot.mjs /tmp/ikea-set-1-drop.png 2500 /tmp/ikea-set-seed.js '[{"type":"wait","ms":1500}]'
```
(If using the `__buildSetGroup` fallback, the seed file itself performs the drop; the actions just wait for the scene to settle.)

Then **open `/tmp/ikea-set-1-drop.png` with the Read tool and look at it.** Report: is there one table with two chairs arranged on opposite long edges, facing the table, no overlaps, all sitting on the floor (not floating/clipping)? If the chairs overlap the table or each other, the arranger math is wrong — fix `arrangeSet` and re-run before proceeding.

- [ ] **Step 4: VERIFICATION 2 — single click selects the whole group; drag moves it as a unit**

Single click on the table should select all 3 items (plan-2 unit-select). Use a click action on the table's screen position, then a drag. Because exact screen coordinates are fiddly, drive selection via the store and the drag via the action harness:

Capture BEFORE:
```bash
node scripts/shot.mjs /tmp/ikea-set-2a-selected.png 2500 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1200},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;s.setSelectedItemIds(s.itemsInGroup(g).map(i=>i.id));"},{"type":"wait","ms":400}]'
```
> If `shot.mjs` has no `eval` action type, run the selection by clicking: add a `{"type":"click","x":<tableX>,"y":<tableY>}` action where `<tableX>/<tableY>` is the table's screen position (read it from a prior screenshot). Confirm `scripts/shot.mjs` action types with `node scripts/shot.mjs --help` or by reading the file first.

**Open `/tmp/ikea-set-2a-selected.png` and look:** are all three pieces highlighted as one selection (not just the table)? Report what the selection outline covers.

Capture AFTER a unit drag (translate the whole group via the store to emulate the drag deterministically, then also verify a real pointer drag keeps it rigid):
```bash
node scripts/shot.mjs /tmp/ikea-set-2b-moved.png 2500 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1200},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;const ids=new Set(s.itemsInGroup(g).map(i=>i.id));s.setItems(s.items.map(i=>ids.has(i.id)?{...i,position:[i.position[0]+0.8,i.position[1]]}:i));"},{"type":"wait","ms":400}]'
```
**Open `/tmp/ikea-set-2b-moved.png` and look:** did the entire arrangement shift together by the same offset, preserving the table+chairs spacing (rigid), with nothing left behind? Report the before/after positions you observed.

- [ ] **Step 5: VERIFICATION 3 — drill-in selects one chair; move it; delete it; group stays coherent**

Plan-2 drill-in: a second/Alt click on a member of the already-selected group selects just that member. Emulate by selecting a single chair id, moving it, then deleting it:
```bash
node scripts/shot.mjs /tmp/ikea-set-3a-chair-moved.png 2500 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1200},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;const chair=s.itemsInGroup(g).find(i=>i.defId.includes(\"chair\")||i.defId===\"dining-chair\");s.setSelectedItemIds([chair.id]);s.setItems(s.items.map(i=>i.id===chair.id?{...i,position:[i.position[0],i.position[1]+0.6]}:i));"},{"type":"wait","ms":400}]'
```
**Open `/tmp/ikea-set-3a-chair-moved.png` and look:** is exactly ONE chair selected (others not highlighted) and did only that chair move? Report.

Now delete that chair and check the group still reads coherently (plan-2 auto-dissolves only at <2; a 1-table+1-chair group stays a group):
```bash
node scripts/shot.mjs /tmp/ikea-set-3b-chair-deleted.png 2500 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1200},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;const chair=s.itemsInGroup(g).find(i=>i.defId.includes(\"chair\")||i.defId===\"dining-chair\");s.setSelectedItemIds([chair.id]);s.removeSelected?s.removeSelected():s.setItems(s.items.filter(i=>i.id!==chair.id));"},{"type":"wait","ms":400}]'
```
> Use whichever deletion action plan-2 / the store exposes (`removeSelected` / `deleteSelected`). Verify the name with `grep -rn "removeSelected\|deleteSelected" src/state/slices`.

**Open `/tmp/ikea-set-3b-chair-deleted.png` and look:** is the deleted chair gone, the table + remaining chair still present and sensibly placed? Report.

- [ ] **Step 6: VERIFICATION 4 — add a chair to the group**

Spec §2.4: while a group is active, placing a catalog item assigns it the active `groupId`. Emulate by adding a chair item with the same `groupId` as the table, then re-selecting the group:
```bash
node scripts/shot.mjs /tmp/ikea-set-4-chair-added.png 2500 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1200},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;const t=s.itemsInGroup(g).find(i=>i.defId.includes(\"table\")||i.defId===\"dining-table-4\");const id=\"added-chair\";s.setItems([...s.items,{id,defId:t.defId.includes(\"table\")?\"dining-chair\":\"dining-chair\",position:[t.position[0]+0.9,t.position[1]],rotation:-Math.PI/2,props:{},groupId:g}]);s.setSelectedItemIds(s.itemsInGroup(g).map(i=>i.id));"},{"type":"wait","ms":400}]'
```
**Open `/tmp/ikea-set-4-chair-added.png` and look:** is there an additional chair, and is it highlighted as part of the group selection along with the others? Report.

- [ ] **Step 7: VERIFICATION 5 — save + reload still grouped, still moves as a unit**

Trigger the app's autosave/save, reload the page, confirm the group survived (spec §2.6: groups are emergent from `groupId` in the `items` array, round-trip via the save schema). Capture after reload + a unit move:
```bash
node scripts/shot.mjs /tmp/ikea-set-5-reload.png 4000 /tmp/ikea-set-seed.js \
  '[{"type":"wait","ms":1000},{"type":"eval","js":"const s=window.__store.getState();s.saveLayout?s.saveLayout():null;localStorage.getItem(\"hdb-layout\");"},{"type":"wait","ms":500},{"type":"reload"},{"type":"wait","ms":2500},{"type":"eval","js":"const s=window.__store.getState();const g=s.items.find(i=>i.groupId)?.groupId;if(g){const ids=new Set(s.itemsInGroup(g).map(i=>i.id));s.setSelectedItemIds([...ids]);s.setItems(s.items.map(i=>ids.has(i.id)?{...i,position:[i.position[0]-0.7,i.position[1]]}:i));}"},{"type":"wait","ms":500}]'
```
> If `shot.mjs` lacks a `reload` action, do it in two invocations: first save (no seed reset), then a second `shot.mjs` run WITHOUT the seed file (the seed dropped items but autosave persisted them) and assert `window.__store.getState().items.some(i => i.groupId)` is true via an eval before the move. Verify the autosave key/setter name with `grep -rn "autosave\|saveLayout\|hdb-layout\|persist" src/state/storage`.

**Open `/tmp/ikea-set-5-reload.png` and look:** after reload, are the table + chairs still present, still sharing a group (the unit move shifted them all together), confirming `groupId` persisted? Report.

- [ ] **Step 8: Stop the dev server, remove scratch + temporary dev hooks, write the verification report**

Stop the background `npm run dev`. Delete `/tmp/ikea-set-seed.js` and the PNGs are scratch (do not commit). If you added any `import.meta.env.DEV` dev hooks (`window.__buildSetGroup`, `window.__catalog`) to `src/main.tsx` for the fallback path, **remove them now** and re-run `npx tsc --noEmit` to confirm clean.

Write the final verification report into your task summary: for each of the 5 verifications, the one-to-three sentences describing **what you actually saw** in the PNG. If any verification revealed a bug (overlap, item left behind, group not selecting together, group lost on reload), it must have been fixed and the relevant unit task re-run + re-committed before this task is marked done.

- [ ] **Step 9: Commit (only the verification-discovered fixes, if any)**

If verification surfaced fixes to `arrangeSet`/`buildSetGroup`/`Toolbar.tsx`, they were committed under their own tasks. This task itself commits nothing (scratch files + dev hooks removed). Confirm a clean tree of scratch artifacts:

Run: `git status --porcelain`
Expected: no `/tmp` files listed; `src/main.tsx` unchanged (dev hooks removed); only the legitimately-changed source files (already committed) absent from the working tree.

---

## Self-Review

**Spec coverage (§2.5 + §2.7):**

- §2.5 (1) expand members × qty → **Task 1** (`expandMembers`).
- §2.5 (2) arrange by role — table centred, chairs around long edges at `CLEARANCE` spacing facing the table, bench/stool/other rules, reusing footprint + spacing constants — **Tasks 2, 3, 4** (`arrangeSet`), with `baseFootprint`-equivalent `defFootprint` in **Task 5**.
- §2.5 (3) stamp one fresh `groupId` → **Task 5** (`buildSetGroup`).
- §2.5 Sets menu lists IKEA recipes alongside `FURNITURE_SETS`, drops via `buildSetGroup`, appends + group-selects + pushes history → **Tasks 6 (registry/accessor) + 7 (wiring)**.
- §2.5 built-in `FURNITURE_SETS` gain the same `groupId` stamp / one code path → **Task 7** (`dropArranged` shared path).
- §2.7 unit tests: `arrangeSet` chairs-around-table no-overlap + clearance with fixture footprints → **Tasks 2–4**; `buildSetGroup` single shared groupId + 1 table + 2 chairs = 3 items → **Task 5**.
- §2.7 REQUIRED visual verification, all 5 scenarios (drop, unit select+drag, drill-in move+delete, add chair, save+reload), each captured AND visually reviewed with findings reported → **Task 8**.

**Out of scope here (covered by plans 1/2, correctly NOT in this plan):** scraper recipe emission (plan 1); `groupId` field + helpers + selection drill-in + unit drag/rotate + schema v2/migration (plan 2). This plan calls `itemsInGroup`, `groupItems`, `groupCentroid`, `ungroup` and assumes they exist.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step has real TS; every run step has a real command + expected result. The only deliberately-conditional spots are (a) Task 3 Step 3 (widen span *only if* the assertion fails — both branches specified) and (b) Task 7/8 store-API names (`groupItems`, imported-def setter, `removeSelected`, autosave key) which depend on plan 2's exact surface — each flagged with a concrete `grep` to confirm and adapt. These are integration seams with a sibling plan, not vague placeholders.

**Name consistency:** `arrangeSet(members, footprints)` and `buildSetGroup(recipe, dropCentre, catalog, groupId?)` used identically across Tasks 2–8. Plan-2 helpers referenced by their spec names throughout: `itemsInGroup`, `groupItems`, `groupCentroid`, `ungroup` (no drift to `groupCentre`/`makeGroup`/etc.). Types `SetRecipe`/`SetMember`/`SetMemberInstance`/`MemberFootprint`/`MemberPlacement`/`SetRole` defined once in Task 1 and reused. Registry trio `ikeaSetRecipes`/`registerIkeaSetRecipes`/`_clearIkeaSetRecipes` consistent between Task 6 and Task 7.

**Known integration risk (documented, not a gap):** the imported-member catalog accessor (`userFurniture` vs `userDefs`) and the autosave key are owned by the IKEA-import plan / plan 2; Task 7 Step 3 and Task 8 Step 2 instruct verifying the real names before writing. No invented store method is relied on without a fallback.
