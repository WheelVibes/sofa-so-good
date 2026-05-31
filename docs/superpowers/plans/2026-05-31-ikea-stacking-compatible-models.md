# IKEA Compatible-Model Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a compatible IKEA model (e.g. a mattress) drop onto a base (e.g. a bed frame) so it sits physically snug — at the true support surface, centered on the support area, sharing the base's rotation, joined as one group.

**Architecture:** A pure resolver (`resolveStack`) derives the support-surface Y from scraped IKEA `productMeasurements` (mattress top flush to footboard rail) with a per-category fallback, plus an XZ center offset. `stackOnto` builds a `FurnitureItem` with `props.surfaceHeight = supportY` and a shared `groupId`. Two triggers route through it: an enhanced "Complete with" inspector action and `DragController` snap. One render change lifts GLB items by `surfaceHeight`; collision already reads it.

**Tech Stack:** TypeScript, React, Three.js / @react-three/fiber, Zustand, Vitest.

---

## File Structure

- **Create** `src/furniture/ikea/stacking.ts` — `resolveStack` (fit math) + `stackOnto` (build item + group). Sole owner of "snug" logic.
- **Create** `src/furniture/ikea/stacking.test.ts` — unit tests with real MALM/VITMOSEN numbers.
- **Modify** `src/layout/designRules.ts` — add `STACK` constants (fallback support heights).
- **Modify** `src/furniture/Furniture.tsx` — lift GLB-kind items by `props.surfaceHeight` (GLB only; primitives self-lift).
- **Modify** `src/collision/placement.test.ts` (or create a focused test) — stacked-span collision behavior.
- **Modify** `src/ui/inspector/IkeaBody.tsx` — add "Place on this" action to the existing "Complete with" list.
- **Modify** `src/scene/DragController.tsx` (the drag handler) — snap-to-base on a confirmed compatibility match.
- **Modify** `CLAUDE.md` + `README.md` — document stacking.

Helpers reused (do not reimplement): `resolveCompatible` (`furniture/ikea/compatibility.ts`), `isIkeaDef` (`furniture/catalog.ts`), store `addItem`/`setItems`/`pushHistory`/`setSelectedItemIds`/`itemsInGroup`/`addToGroup`, group-drop idiom from `ui/Toolbar.tsx:737`.

---

## Task 1: Stack constants in designRules

**Files:**
- Modify: `src/layout/designRules.ts` (append to the file, after `CLEARANCE`)

- [ ] **Step 1: Add the STACK constants**

Append to `src/layout/designRules.ts`:

```ts
/** Fallback support-surface heights (metres) for stacking a compatible model
 *  onto a base when the base exposes no usable measurement. Keyed by the base's
 *  FurnitureCategory. `supportY` is where the BOTTOM of the stacked item rests. */
export const STACK = {
  /** Slatted-base top for a bed frame with no "Footboard height" field. */
  bedSlatDefault: 0.13,
  /** Seat height for a sofa accepting seat cushions. */
  seatDefault: 0.42,
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/layout/designRules.ts
git commit -m "feat(stacking): STACK fallback support-height constants"
```

---

## Task 2: `resolveStack` — fit math (TDD)

**Files:**
- Create: `src/furniture/ikea/stacking.ts`
- Create: `src/furniture/ikea/stacking.test.ts`

Reference numbers (verified from scraped metadata):
- MALM frame: `productMeasurements` `{ "Footboard height": "38 cm", "Mattress length": "200 cm", "Mattress width": "90 cm", "Free height under furniture": "21 cm" }`; footprint `{ w: 1.0542, d: 2.09, h: 1.0041, anchorOffset: [0, 0.5021, 0] }`; category `beds`.
- VITMOSEN mattress: footprint `{ w: 1.506, d: 1.9155, h: 0.2543, anchorOffset: [-0.0001, 0.1263, 0.0001] }`; `Thickness: "25 cm"`.

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/stacking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveStack } from './stacking';
import type { IkeaGltfDef } from '../types';

function bedDef(): IkeaGltfDef {
  return {
    id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'malm', activeVariant: 'black',
    variants: [{ finish: 'black', label: 'Black', articleNumber: '1', url: '', assetId: 'a',
      footprint: { w: 1.0542, d: 2.09, h: 1.0041, anchorOffset: [0, 0.5021, 0] } }],
    defaultFootprint: { w: 1.0542, d: 2.09, h: 1.0041 },
    productInfo: { categoryHierarchy: [], productMeasurements: {
      'Footboard height': '38 cm', 'Mattress length': '200 cm',
      'Mattress width': '90 cm', 'Free height under furniture': '21 cm' } },
    compatibility: { acceptsCategories: ['Foam & latex mattresses'], size: '90x200' },
    uploadedAt: '', license: 'IKEA',
  } as IkeaGltfDef;
}

function mattressDef(): IkeaGltfDef {
  return {
    id: 'ikea-vitmosen', name: 'VITMOSEN', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'vitmosen', activeVariant: 'white',
    variants: [{ finish: 'white', label: 'White', articleNumber: '2', url: '', assetId: 'b',
      footprint: { w: 1.506, d: 1.9155, h: 0.2543, anchorOffset: [-0.0001, 0.1263, 0.0001] } }],
    defaultFootprint: { w: 1.506, d: 1.9155, h: 0.2543 },
    productInfo: { categoryHierarchy: [] },
    uploadedAt: '', license: 'IKEA',
  } as IkeaGltfDef;
}

describe('resolveStack', () => {
  it('sits a mattress so its top is flush with the footboard rail', () => {
    const base = bedDef();
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit).not.toBeNull();
    // supportY = footboard(0.38) - thickness(0.2543) = 0.1257
    expect(fit!.supportY).toBeCloseTo(0.1257, 3);
    // mattress top lands at the footboard rail
    expect(fit!.supportY + top.variants[0].footprint!.h).toBeCloseTo(0.38, 2);
  });

  it('clamps supportY to at least free height under furniture', () => {
    const base = bedDef();
    base.productInfo!.productMeasurements!['Footboard height'] = '20 cm'; // would push below clearance
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.supportY).toBeGreaterThanOrEqual(0.21);
  });

  it('falls back to the slat-default height when no footboard field', () => {
    const base = bedDef();
    delete base.productInfo!.productMeasurements!['Footboard height'];
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.supportY).toBeCloseTo(0.13, 3);
  });

  it('centers the mattress on the base footprint (zero offset for a centered bed)', () => {
    const base = bedDef();
    const top = mattressDef();
    const fit = resolveStack(base, base.variants[0], top, top.variants[0]);
    expect(fit!.centerOffset[0]).toBeCloseTo(0, 2);
    expect(fit!.centerOffset[1]).toBeCloseTo(0, 2);
  });

  it('returns null for a non-stackable base category with no rule', () => {
    const base = mattressDef(); // a mattress is not a base that accepts things
    base.compatibility = undefined;
    const top = mattressDef();
    expect(resolveStack(base, base.variants[0], top, top.variants[0])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: FAIL — `resolveStack` not exported / module missing.

- [ ] **Step 3: Write the implementation**

Create `src/furniture/ikea/stacking.ts`:

```ts
/**
 * Snug-stacking math for compatible IKEA models. resolveStack derives where the
 * BOTTOM of a stacked item (mattress) rests on a base (bed frame): the support
 * surface Y, an XZ centre offset (so the mattress centres on the support area,
 * not the headboard-skewed bbox), and the inherited rotation. Measurement-
 * derived where IKEA exposes the numbers, else a per-category fallback.
 * Pure + render-free — see stacking.test.ts.
 */
import type { FurnitureItem, FurnitureCategory } from '../types';
import type { IkeaGltfDef, IkeaVariant } from '../types';
import { STACK } from '../../layout/designRules';

export interface StackFit {
  /** Y (metres) where the bottom of the stacked item rests. */
  supportY: number;
  /** [dx, dz] in the BASE's local (unrotated) frame, base-centre → support-centre. */
  centerOffset: [number, number];
  /** Stacked item inherits the base rotation. */
  rotation: number;
}

/** Parse "38 cm" / "21 cm" → metres; undefined when absent/unparseable. */
function cmToM(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /([\d.]+)\s*cm/i.exec(value);
  return m ? parseFloat(m[1]) / 100 : undefined;
}

function measurements(def: IkeaGltfDef): Record<string, string> {
  return def.productInfo?.productMeasurements ?? {};
}

/** Support-surface Y for the bottom of the stacked item, by base category. */
function supportSurfaceY(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  topThickness: number,
): number | null {
  const pm = measurements(baseDef);
  const baseH = baseVariant.footprint?.h ?? baseDef.defaultFootprint.h;
  const freeUnder = cmToM(pm['Free height under furniture']) ?? 0;

  switch (baseDef.category as FurnitureCategory) {
    case 'beds': {
      const footboard = cmToM(pm['Footboard height']);
      // Mattress TOP should be flush with the footboard rail (adjustable sides).
      const y = footboard !== undefined ? footboard - topThickness : STACK.bedSlatDefault;
      return Math.max(y, freeUnder);
    }
    case 'seating':
      return STACK.seatDefault;
    default:
      // Generic: rest on the box top (only when this base actually accepts).
      return baseH;
  }
}

/** XZ offset (base local frame) centring the top on the base's support area.
 *  Uses the base's "Mattress width/length" recess when present, else the base
 *  footprint centre. anchorOffset shifts the geometric centre off [0,0]. */
function centerOffset(baseDef: IkeaGltfDef, baseVariant: IkeaVariant): [number, number] {
  const ao = baseVariant.footprint?.anchorOffset ?? [0, 0, 0];
  // The base OBB is centred on item.position + (ao.x, ao.z) rotated; the
  // support recess for a symmetric bed is the same XZ centre, so the offset is
  // just the anchor's XZ (top centres on the base centre).
  return [ao[0], ao[2]];
}

export function resolveStack(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
): StackFit | null {
  // A base must declare it accepts something to be stackable-onto.
  if (!baseDef.compatibility?.acceptsCategories?.length) return null;
  const topThickness = topVariant.footprint?.h ?? topDef.defaultFootprint.h;
  const supportY = supportSurfaceY(baseDef, baseVariant, topThickness);
  if (supportY === null) return null;
  return { supportY, centerOffset: centerOffset(baseDef, baseVariant), rotation: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: PASS (5 tests). Note `rotation` in the fit is the base-relative delta (0); `stackOnto` adds the base's absolute rotation in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/stacking.ts src/furniture/ikea/stacking.test.ts
git commit -m "feat(stacking): resolveStack derives snug support surface + centre"
```

---

## Task 3: GLB-only `surfaceHeight` lift in the renderer

**Files:**
- Modify: `src/furniture/Furniture.tsx:109-111` (the outer `<group position=...>`)

- [ ] **Step 1: Make the change**

In `src/furniture/Furniture.tsx`, replace the outer group's `position` line. Find:

```tsx
    <group
      position={[item.position[0], 0, item.position[1]]}
```

Replace with:

```tsx
    <group
      position={[item.position[0], def.kind === 'parametric' ? 0 : liftY, item.position[1]]}
```

And immediately before the `return (` of the component body (after `body` is built), add:

```tsx
  // GLB items lift by props.surfaceHeight so a stacked model (mattress on a
  // frame) renders at its support surface. Parametric primitives self-lift in
  // local space, so they stay at group-Y 0 to avoid double-counting.
  const liftY = typeof item.props['surfaceHeight'] === 'number' ? (item.props['surfaceHeight'] as number) : 0;
```

- [ ] **Step 2: Typecheck + existing tests**

Run: `npx tsc --noEmit && npm test -- src/collision`
Expected: PASS (no regressions; collision already accounts for `surfaceHeight`).

- [ ] **Step 3: Commit**

```bash
git add src/furniture/Furniture.tsx
git commit -m "feat(stacking): lift GLB items by surfaceHeight for snug stacking"
```

---

## Task 4: `stackOnto` — build the stacked item + group (TDD)

**Files:**
- Modify: `src/furniture/ikea/stacking.ts`
- Modify: `src/furniture/ikea/stacking.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikea/stacking.test.ts`:

```ts
import { stackOnto } from './stacking';

describe('stackOnto', () => {
  it('builds a grouped, lifted, centred, rotation-inheriting item', () => {
    const base = bedDef();
    const baseItem: FurnitureItem = {
      id: 'frame-1', defId: base.id, position: [3, 4], rotation: Math.PI / 2, props: {},
    };
    const top = mattressDef();
    const res = stackOnto(baseItem, base, top, top.variants[0]);
    expect('item' in res).toBe(true);
    if (!('item' in res)) return;
    expect(res.item.defId).toBe(top.id);
    expect(res.item.rotation).toBeCloseTo(Math.PI / 2, 5); // inherits base
    expect(res.item.props['surfaceHeight']).toBeCloseTo(0.1257, 3);
    expect(res.item.props['variant']).toBe('white');
    // centre offset [0,0] (rotated) → mattress stays at the frame position
    expect(res.item.position[0]).toBeCloseTo(3, 5);
    expect(res.item.position[1]).toBeCloseTo(4, 5);
    // both share a groupId
    expect(res.groupId).toBeTruthy();
  });

  it('reuses an existing base groupId', () => {
    const base = bedDef();
    const baseItem: FurnitureItem = {
      id: 'frame-1', defId: base.id, position: [0, 0], rotation: 0, groupId: 'g-existing', props: {},
    };
    const top = mattressDef();
    const res = stackOnto(baseItem, base, top, top.variants[0]);
    if (!('item' in res)) throw new Error('expected item');
    expect(res.groupId).toBe('g-existing');
    expect(res.item.groupId).toBe('g-existing');
  });

  it('returns an error when no fit resolves', () => {
    const base = mattressDef();
    base.compatibility = undefined;
    const baseItem: FurnitureItem = { id: 'm', defId: base.id, position: [0, 0], rotation: 0, props: {} };
    const top = mattressDef();
    const res = stackOnto(baseItem, base, top, top.variants[0]);
    expect('error' in res).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: FAIL — `stackOnto` not exported.

- [ ] **Step 3: Implement `stackOnto`**

Append to `src/furniture/ikea/stacking.ts`:

```ts
export type StackResult =
  | { item: FurnitureItem; groupId: string }
  | { error: string };

function newStackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `stack-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build the FurnitureItem for `topDef`/`topVariant` stacked on `baseItem`.
 *  Position centres on the base support area (offset rotated by base rotation),
 *  rotation inherits the base, Y lift via props.surfaceHeight, and a shared
 *  groupId (reused from the base if it already has one). The caller adds the
 *  item to the store and stamps the base's groupId in one history step. */
export function stackOnto(
  baseItem: FurnitureItem,
  baseDef: IkeaGltfDef,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
): StackResult {
  const baseVariant =
    baseDef.variants.find((v) => v.finish === (baseItem.props['variant'] ?? baseDef.activeVariant)) ??
    baseDef.variants[0];
  const fit = resolveStack(baseDef, baseVariant, topDef, topVariant);
  if (!fit) return { error: `No snug fit for ${topDef.name} on ${baseDef.name}.` };

  // Rotate the base-local centre offset into world XZ by the base rotation.
  const [dx, dz] = fit.centerOffset;
  const cos = Math.cos(baseItem.rotation);
  const sin = Math.sin(baseItem.rotation);
  const wx = baseItem.position[0] + dx * cos - dz * sin;
  const wz = baseItem.position[1] + dx * sin + dz * cos;

  const groupId = baseItem.groupId ?? newStackId();

  const item: FurnitureItem = {
    id: newStackId(),
    defId: topDef.id,
    position: [wx, wz],
    rotation: baseItem.rotation + fit.rotation,
    groupId,
    props: { variant: topVariant.finish, surfaceHeight: fit.supportY },
  };
  return { item, groupId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/stacking.ts src/furniture/ikea/stacking.test.ts
git commit -m "feat(stacking): stackOnto builds grouped, lifted stacked item"
```

---

## Task 5: Height-aware collision for a stacked item (TDD)

**Files:**
- Modify: `src/collision/placement.test.ts` (add a describe block)

Goal: prove the stacked mattress (`props.surfaceHeight` set) does NOT collide with the frame solid it sits on, but a floor-level item at the same XZ still does.

- [ ] **Step 1: Inspect the existing test setup**

Run: `sed -n '1,40p' src/collision/placement.test.ts`
Expected: see how `canPlace`, a `PlacementContext`, and `defs` are built. Reuse that harness style (mirror an existing test's context construction; do not invent new helpers).

- [ ] **Step 2: Write the failing test**

Add to `src/collision/placement.test.ts` (adapt `makeCtx`/`def` factory names to the ones the file already uses):

```ts
describe('stacked surfaceHeight collision', () => {
  it('a lifted item clears a tall base it rests on but a floor item does not', () => {
    // A 1m-tall base GLB at origin.
    const baseDef = { kind: 'gltf', defaultFootprint: { w: 1, d: 2, h: 1 } } as any;
    const base = { id: 'base', defId: 'base', position: [0, 0], rotation: 0, props: {} } as any;
    // A 0.25m mattress lifted to 0.13m (span 0.13..0.38) over the same XZ.
    const topDef = { kind: 'gltf', defaultFootprint: { w: 1, d: 2, h: 0.25 } } as any;
    const lifted = { id: 'm', defId: 'top', position: [0, 0], rotation: 0, props: { surfaceHeight: 0.13 } } as any;
    const floor = { id: 'f', defId: 'top', position: [0, 0], rotation: 0, props: {} } as any;

    const ctx = {
      doors: [], others: [base], walls: [],
      defs: { base: baseDef, top: topDef } as any,
    } as any;

    expect(canPlace(lifted, topDef, ctx)).toBe(true);  // span 0.13..0.38 vs base 0..1 — wait: overlaps!
  });
});
```

NOTE: a mattress span (0.13..0.38) DOES overlap a solid base box (0..1), so a naive box base WOULD collide. The real bed-frame GLB is hollow (the mattress sits in the recess), and its OBB is the full bbox — so collision between a stacked mattress and its own base must be **suppressed by group membership**, not by span. Correct the test and implementation accordingly in the next steps.

- [ ] **Step 3: Correct the test to assert group-suppressed collision**

Replace the test body with:

```ts
describe('stacked group-mate collision', () => {
  it('does not collide with a base it shares a groupId with, but does with a non-group item', () => {
    const baseDef = { kind: 'gltf', defaultFootprint: { w: 1, d: 2, h: 1 } } as any;
    const base = { id: 'base', defId: 'base', position: [0, 0], rotation: 0, groupId: 'g1', props: {} } as any;
    const topDef = { kind: 'gltf', defaultFootprint: { w: 1, d: 2, h: 0.25 } } as any;
    const grouped = { id: 'm', defId: 'top', position: [0, 0], rotation: 0, groupId: 'g1', props: { surfaceHeight: 0.13 } } as any;
    const ungrouped = { ...grouped, id: 'm2', groupId: undefined } as any;

    const ctx = { doors: [], others: [base], walls: [], defs: { base: baseDef, top: topDef } } as any;

    expect(canPlace(grouped, topDef, ctx)).toBe(true);    // same group → ignored
    expect(canPlace(ungrouped, topDef, ctx)).toBe(false); // different group, spans overlap → blocked
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/collision/placement.test.ts -t "stacked group-mate"`
Expected: FAIL — `canPlace` currently blocks the grouped item (no group suppression yet).

- [ ] **Step 5: Implement group suppression in `canPlace`**

In `src/collision/placement.ts`, inside the `for (const other of ctx.others)` loop (after the `other.id === item.id` check), add:

```ts
    // Group-mates never collide with each other — a stacked mattress sits inside
    // its frame's OBB by design, and grouped pieces move as a unit.
    if (item.groupId && other.groupId === item.groupId) continue;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/collision/placement.test.ts`
Expected: PASS (new tests + existing tests).

- [ ] **Step 7: Commit**

```bash
git add src/collision/placement.ts src/collision/placement.test.ts
git commit -m "feat(stacking): group-mates skip mutual collision (snug stacking)"
```

---

## Task 6: "Place on this" inspector action

**Files:**
- Modify: `src/ui/inspector/IkeaBody.tsx` (the "Complete with" block near line 214)

- [ ] **Step 1: Inspect the existing Complete-with render**

Run: `sed -n '214,250p' src/ui/inspector/IkeaBody.tsx`
Expected: each match `m` renders a `<button onClick={() => setActiveDefId(m.def.id)}>`. Confirm what `item`, `def`, and store actions are in scope (`updateItemProps`, `useStore`).

- [ ] **Step 2: Add the place action**

Add this handler in the `IkeaBody` component body (above the `return`):

```tsx
  const placeOnThis = (matchDef: IkeaGltfDef, finish: string) => {
    const variant = matchDef.variants.find((v) => v.finish === finish) ?? matchDef.variants[0];
    const res = stackOnto(item, def, matchDef, variant);
    if ('error' in res) return; // button is disabled in this case; defensive
    const st = useStore.getState();
    st.pushHistory();
    const baseWithGroup = item.groupId
      ? st.items
      : st.items.map((it) => (it.id === item.id ? { ...it, groupId: res.groupId } : it));
    st.setItems([...baseWithGroup, res.item]);
    st.setSelectedItemIds([res.item.id]);
  };
```

Add the import at the top of the file:

```tsx
import { stackOnto } from '../../furniture/ikea/stacking';
```

- [ ] **Step 3: Wire a "Place on this" button per match**

In the matched-category list, next to the existing navigate button for each `m`, add (use the match's first available finish):

```tsx
                      <button
                        onClick={() => placeOnThis(m.def, m.finishes[0]?.finish ?? m.def.activeVariant)}
                        disabled={'error' in stackOnto(item, def, m.def, m.def.variants.find((v) => v.finish === (m.finishes[0]?.finish)) ?? m.def.variants[0])}
                        className="rounded border border-blue-500 px-1.5 py-1 text-[10px] text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Drop this onto the selected item, snug"
                      >
                        Place on this
                      </button>
```

(`item`/`def` are the currently-inspected base; `m.def` is the compatible top.)

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/inspector/IkeaBody.tsx
git commit -m "feat(stacking): 'Place on this' inspector action drops compatible model snug"
```

---

## Task 7: Drag-snap onto a compatible base

**Files:**
- Modify: the drag handler (`src/scene/DragController.tsx` — confirm the exact path with `git grep -l "class DragController\|function DragController\|AlignmentGuides"`).

- [ ] **Step 1: Locate the drop commit + the item-under-cursor lookup**

Run: `git grep -ln "DragController" src; git grep -n "onPointerUp\|commit\|setItems\|drop\|hover" src/scene/DragController.tsx`
Expected: identify (a) where a drag ends and the new position is written, and (b) any existing "what item is under the pointer" helper. Reuse them; do not add a new raycaster if one exists.

- [ ] **Step 2: Compute a snap candidate during drag**

Where the drag computes the live XZ, add (using the dragged item's def + the item under the cursor):

```ts
// Snap candidate: the dragged IKEA item is compatible-as-top with the IKEA
// item under the cursor, and the cursor is over that base's footprint.
import { resolveCompatible } from '../furniture/ikea/compatibility';
import { isIkeaDef } from '../furniture/catalog';
import { stackOnto } from '../furniture/ikea/stacking';

function snapCandidate(draggedDef, hoveredItem, hoveredDef) {
  if (!hoveredItem || !isIkeaDef(draggedDef) || !isIkeaDef(hoveredDef)) return null;
  // dragged is the TOP, hovered is the BASE: base must accept dragged's category.
  const matches = resolveCompatible(hoveredDef, [draggedDef]);
  const any = Object.values(matches).some((list) => list.length > 0);
  return any ? hoveredItem : null;
}
```

- [ ] **Step 3: Highlight the base when a candidate exists**

When `snapCandidate` is non-null during drag, render the existing base-highlight (reuse the `HoverHighlight`/`AlignmentGuides` visual the file already uses — match its props) around `hoveredItem`. Do not author a new highlight mesh.

- [ ] **Step 4: On drop, route through `stackOnto`**

In the drop-commit path, if a snap candidate is active:

```ts
const base = snapCandidate(draggedDef, hoveredItem, hoveredDef);
if (base) {
  const draggedVariant = draggedDef.variants.find(
    (v) => v.finish === (draggedItem.props.variant ?? draggedDef.activeVariant)) ?? draggedDef.variants[0];
  const res = stackOnto(base, hoveredDef, draggedDef, draggedVariant);
  if ('item' in res) {
    const st = useStore.getState();
    st.pushHistory();
    // Move the DRAGGED item onto the base (don't add a duplicate): adopt the
    // resolved position/rotation/group + surfaceHeight.
    const groupId = res.groupId;
    st.setItems(st.items.map((it) => {
      if (it.id === draggedItem.id) return { ...it, position: res.item.position, rotation: res.item.rotation, groupId, props: { ...it.props, surfaceHeight: res.item.props.surfaceHeight } };
      if (it.id === base.id && !base.groupId) return { ...it, groupId };
      return it;
    }));
    return; // skip the normal free-placement commit
  }
}
```

- [ ] **Step 5: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/DragController.tsx
git commit -m "feat(stacking): drag-snap a compatible model onto a base"
```

---

## Task 8: Visual verification (REQUIRED by CLAUDE.md)

**Files:** none (verification only). This task is NOT optional — a green suite does not prove the render looks right.

- [ ] **Step 1: Ensure an IKEA frame + matching mattress are importable**

Use the scraped groups `malm-bed-frame-high-90x200` and a 90x200 mattress. If none is present at 90x200, import the closest pair via the Upload dialog or seed via `window.__store` for the test.

- [ ] **Step 2: Drop the frame, then stack via the inspector**

Run the app: `npm run dev` (or drive headless). Using `window.__store` + `scripts/shot.mjs` actions: add the frame, select it, click "Place on this" for the mattress.

Run: `node scripts/shot.mjs /tmp/stack-picker.png 1500 <evalFile-or-actions>`

- [ ] **Step 3: Stack via drag-snap**

Add a fresh frame + a loose mattress, drag the mattress over the frame, confirm the highlight appears, drop.

Run: `node scripts/shot.mjs /tmp/stack-drag.png 1500 <actionsJson>`

- [ ] **Step 4: Visually review both screenshots**

Open both PNGs and CONFIRM, reporting what you see (not just that you captured them):
- mattress top sits flush at the footboard rail (no floating gap, no clipping into the frame),
- mattress is centred on the sleeping area (not shifted toward the headboard),
- moving/rotating the frame carries the mattress (group),
- no z-fighting / shadow artifacts at the contact surface.

If any are wrong, fix the resolver/render and re-shoot before proceeding.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix(stacking): visual-verification adjustments"
```

---

## Task 9: Documentation (REQUIRED)

**Files:**
- Modify: `CLAUDE.md` (IKEA models section + design tools)
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Under the **IKEA model import** bullet (or a new **Stacking** sub-bullet), add: compatible models stack snug via `furniture/ikea/stacking.ts` (`resolveStack`/`stackOnto`) — support surface derived from scraped `productMeasurements` (mattress top flush to footboard) with `STACK` fallbacks in `designRules.ts`; reuses `props.surfaceHeight` for the Y lift (GLB-only in `Furniture.tsx`) and a shared `groupId`; triggered by the inspector "Place on this" action and `DragController` snap; group-mates skip mutual collision.

- [ ] **Step 2: Update README.md**

Add a user-facing line under the IKEA/design-tools section: "Combine compatible IKEA pieces — drag a mattress onto a bed frame (or use the item's *Complete with → Place on this*) and it snaps snug onto the support surface, grouped so they move together."

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document snug stacking of compatible IKEA models"
```

---

## Self-Review Notes

- **Spec coverage:** Component 1 (resolver) → Tasks 1–2; Component 2 (placement core + render change) → Tasks 3–4; collision → Task 5; Component 3 triggers → Tasks 6 (picker) & 7 (drag); error handling → resolveStack null + stackOnto error (Tasks 2,4,6); save round-trip (no schema change — surfaceHeight/groupId already persist, asserted by reuse); testing → Tasks 2,4,5,8; docs → Task 9.
- **Correction captured:** group-mate collision suppression (Task 5) replaces the naive span assumption — a mattress sits *inside* the frame OBB, so span-overlap alone would falsely block it. This refines the spec's "collision correct for free" claim.
- **Type consistency:** `StackFit`, `StackResult`, `resolveStack(baseDef, baseVariant, topDef, topVariant)`, `stackOnto(baseItem, baseDef, topDef, topVariant)` used identically across tasks; `props.surfaceHeight` + `props.variant` are the only props written; `groupId` reused/minted consistently.
- **Open verification:** Task 7 drag handler path is `git grep`-confirmed in Step 1 before editing (the file may be `DragController.tsx` or a hook); the plan instructs reusing existing hover/raycast helpers rather than inventing them.
