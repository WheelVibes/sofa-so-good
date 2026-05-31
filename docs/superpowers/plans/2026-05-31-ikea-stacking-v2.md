# IKEA Stacking v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IKEA model combining physically accurate and general: a mattress rests on the bed frame's true slat plane (detected from GLB geometry), seating arranges *around* a table instead of on top, and modular sofa sections snap edge-to-edge using new scraped configurator metadata.

**Architecture:** Replace v1's estimated `footboard − thickness` support height with a geometric slat-plane detector run over the loaded GLB mesh (cached per def, same pass as the footprint). Add a per-category placement classifier (vertical / around / modular / null) that branches the combine path. Two offline scraper additions: a no-GLB phrase index (to author the classifier from real data) and a sofa-configurator pass emitting section-mating metadata consumed by a geometric edge-snap.

**Tech Stack:** TypeScript, React, three.js / @react-three/fiber, Zustand, Vitest; Python + Playwright (offline scraper).

**Reference evidence (verified by decoding the MALM GLB in-browser):** MALM slat plane ≈ 0.25 m (dominant vertex bands 0.24→7661, 0.26→6658 verts); headboard top ≈ 1.004 m; footboard band ≈ 0.32–0.38 m. Mattress bbox 0.00–0.25 (bottom at 0). VOXLÖV table top ≈ 0.68–0.74 m. Spec: `docs/superpowers/specs/2026-05-31-ikea-stacking-v2-geometric-support-design.md`.

---

## File Structure

- **Create** `src/furniture/ikea/supportPlane.ts` (+ `.test.ts`) — pure `detectSupportPlaneY(samples)` geometry math.
- **Create** `src/furniture/ikea/placementSemantics.ts` (+ `.test.ts`) — `placementKind(phrase)` classifier.
- **Modify** `src/furniture/ikea/stacking.ts` (+ `.test.ts`) — `resolveStack` takes the matched category + uses the cached plane; add `combineOnto` switching on kind; AROUND via `arrangeSet`.
- **Modify** `src/furniture/GltfModel.tsx` — compute + cache the support plane in the existing geometry pass; export `getCachedSupportPlaneY`/`seedGltfSupportPlane`.
- **Modify** `src/furniture/types.ts` — `IkeaGltfDef.supportPlaneY?` and `IkeaGltfDef.modular?` (section-mating block).
- **Modify** `src/ui/inspector/IkeaBody.tsx` + `src/scene/DragController.tsx` — call `combineOnto` with the matched category; AROUND/MODULAR handling.
- **Modify** `python/scripts/ikea_model_scraper.py` — `--phrase-index <out.json>` mode; sofa-configurator pass + `modular` metadata block.
- **Modify** `src/furniture/ikea/metadata.ts` + `translate.ts` — parse the `modular` block.
- **Modify** `CLAUDE.md` + `README.md`.

Reused as-is: `arrangeSet` (`ikeaSets.ts`), `resolveCompatible` (keyed by category), `variantProps`, `itemFootprint`, the Toolbar group-drop idiom, `FOOTPRINT_CACHE` pattern in `GltfModel.tsx`.

---

# PHASE 1 — Geometric support plane (fixes mattress-too-low)

## Task 1: `detectSupportPlaneY` pure geometry (TDD)

**Files:**
- Create: `src/furniture/ikea/supportPlane.ts`
- Create: `src/furniture/ikea/supportPlane.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/supportPlane.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectSupportPlaneY, type HorizontalBand } from './supportPlane';

// Synthetic bed-frame-like distribution: a big horizontal surface (slat plane)
// at Y=0.25 inside the footprint, a tall headboard top at Y=1.0 (small area),
// and a footboard rail band at Y=0.36 (medium). Bands carry summed horizontal
// triangle area inside the interior footprint, per 2cm Y bin.
const bedBands: HorizontalBand[] = [
  { y: 0.0, area: 0.02 },   // tiny floor contact (feet)
  { y: 0.25, area: 1.6 },   // SLAT PLANE — dominant interior surface
  { y: 0.36, area: 0.3 },   // footboard rail top
  { y: 1.0, area: 0.25 },   // headboard top (above the cutoff)
];

describe('detectSupportPlaneY', () => {
  it('picks the dominant interior horizontal surface below the head/footboard region', () => {
    // bboxHeight 1.0 → cutoff 0.6; only bands at/below 0.6 are candidates.
    expect(detectSupportPlaneY(bedBands, 1.0)).toBeCloseTo(0.25, 2);
  });

  it('ignores the tall headboard top even though it is horizontal', () => {
    const y = detectSupportPlaneY(bedBands, 1.0);
    expect(y).not.toBeCloseTo(1.0, 1);
  });

  it('returns null when no band has meaningful area', () => {
    expect(detectSupportPlaneY([{ y: 0.1, area: 0.001 }], 1.0)).toBeNull();
  });

  it('prefers the highest qualifying surface when two large bands exist', () => {
    // a low platform 0.10 and a higher slat 0.25 both large → choose 0.25
    const bands: HorizontalBand[] = [
      { y: 0.1, area: 1.2 },
      { y: 0.25, area: 1.5 },
    ];
    expect(detectSupportPlaneY(bands, 1.0)).toBeCloseTo(0.25, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/furniture/ikea/supportPlane.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation**

Create `src/furniture/ikea/supportPlane.ts`:

```ts
/**
 * Geometric detection of the support surface a stacked item rests on (e.g. a
 * bed frame's slatted-base plane). IKEA publishes no slat height and ships no
 * anchor data, so we derive it from the GLB mesh: a histogram of horizontal
 * triangle area by Y. The support plane is the HIGHEST Y band with substantial
 * horizontal area that lies BELOW the head/footboard region (so we pick the
 * slats, not the headboard top). Pure + unit-tested with synthetic bands; the
 * GLB→bands extraction lives in GltfModel (it needs the loaded geometry).
 */
export interface HorizontalBand {
  /** Bin centre Y in metres. */
  y: number;
  /** Summed near-horizontal triangle area (m^2) in this Y bin, interior only. */
  area: number;
}

/** Minimum horizontal area (m^2) for a band to count as a real surface. */
const MIN_AREA = 0.05;
/** Fraction of bbox height below which a surface can be the mattress support
 *  (excludes the headboard/upper structure). */
const SUPPORT_CUTOFF_FRAC = 0.6;

export function detectSupportPlaneY(bands: HorizontalBand[], bboxHeight: number): number | null {
  const cutoff = bboxHeight * SUPPORT_CUTOFF_FRAC;
  const candidates = bands.filter((b) => b.area >= MIN_AREA && b.y <= cutoff);
  if (!candidates.length) return null;
  // The mattress sits on the highest qualifying interior surface.
  return candidates.reduce((best, b) => (b.y > best.y ? b : best)).y;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/furniture/ikea/supportPlane.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/supportPlane.ts src/furniture/ikea/supportPlane.test.ts
git commit -m "feat(stacking): detectSupportPlaneY — geometric slat-plane math"
```

---

## Task 2: Extract horizontal bands from the GLB + cache the plane

**Files:**
- Modify: `src/furniture/GltfModel.tsx` (the geometry `useEffect` near line 100-137, and the cache/exports near lines 27-55)

- [ ] **Step 1: Read the current footprint pass**

Run: `sed -n '20,140p' src/furniture/GltfModel.tsx`
Expected: see `FOOTPRINT_CACHE`, `seedGltfFootprint`, `getCachedGltfFootprint`, and the `useEffect` that traverses `cloned` building `box`. You will add a parallel `SUPPORT_PLANE_CACHE` populated in the SAME traversal.

- [ ] **Step 2: Add the support-plane cache + band extraction**

Add near the footprint cache (after `getCachedGltfFootprint`, ~line 42):

```ts
import { detectSupportPlaneY, type HorizontalBand } from './ikea/supportPlane';
import { Triangle } from 'three';

const SUPPORT_PLANE_CACHE = new Map<string, number | null>();

export function getCachedSupportPlaneY(url: string): number | null {
  return SUPPORT_PLANE_CACHE.get(baseUrl(url)) ?? null;
}

/** Pre-seed a known support plane (e.g. from a test or a future scraper field). */
export function seedGltfSupportPlane(url: string, y: number | null): void {
  SUPPORT_PLANE_CACHE.set(baseUrl(url), y);
}
```

In the geometry `useEffect`, AFTER `box.getSize(size)` / `box.getCenter(center)` and the `FOOTPRINT_CACHE.set(...)` call, add a second pass that histograms horizontal triangle area by Y and caches the detected plane:

```ts
    // Support-plane detection: histogram near-horizontal triangle area by Y
    // (2cm bins), restricted to triangles whose centroid is inside the footprint
    // interior (within 80% of half-extents, to drop rim/rail overhangs). Used to
    // rest a stacked item (mattress) on the real slat plane, not the bbox top.
    const fpKeyPlane = baseUrl(url);
    if (!SUPPORT_PLANE_CACHE.has(fpKeyPlane) && servingOriginal) {
      const bins = new Map<number, number>();
      const a = new Vector3(); const b = new Vector3(); const c = new Vector3();
      const tri = new Triangle();
      const nrm = new Vector3();
      const cen = new Vector3();
      const halfX = size.x / 2 * 0.8;
      const halfZ = size.z / 2 * 0.8;
      const BIN = 0.02;
      cloned.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
        const pos = mesh.geometry.attributes.position;
        const idx = mesh.geometry.index;
        if (!pos) return;
        const triCount = idx ? idx.count / 3 : pos.count / 3;
        for (let t = 0; t < triCount; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
          b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
          c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
          tri.set(a, b, c);
          tri.getNormal(nrm);
          if (Math.abs(nrm.y) < 0.9) continue; // not near-horizontal
          tri.getMidpoint(cen);
          if (Math.abs(cen.x - center.x) > halfX || Math.abs(cen.z - center.z) > halfZ) continue;
          const area = tri.getArea();
          const bin = Math.round(cen.y / BIN) * BIN;
          bins.set(bin, (bins.get(bin) ?? 0) + area);
        }
      });
      const bands: HorizontalBand[] = [...bins.entries()].map(([y, area]) => ({ y, area }));
      SUPPORT_PLANE_CACHE.set(fpKeyPlane, detectSupportPlaneY(bands, Math.max(0.05, size.y)));
    }
```

(Confirm `Vector3`, `Mesh` are already imported at the top — they are; add `Triangle` to that import line instead of a separate import if cleaner.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/furniture/GltfModel.tsx
git commit -m "feat(stacking): extract+cache GLB support plane in the geometry pass"
```

---

## Task 3: `resolveStack` uses the detected plane (TDD)

**Files:**
- Modify: `src/furniture/ikea/stacking.ts`
- Modify: `src/furniture/ikea/stacking.test.ts`

- [ ] **Step 1: Update the failing tests**

In `src/furniture/ikea/stacking.test.ts`, the v1 expectation `supportY ≈ 0.1257` is now wrong. Replace the first two `resolveStack` tests with plane-based behaviour. Add at top of file:

```ts
import { seedGltfSupportPlane } from '../GltfModel';
```

The bed variant has `runtimeUrl`? In tests there's no URL; `resolveStack` must accept an explicit detected plane to stay pure. Change the approach: `resolveStack` reads the plane via an injected lookup. Update the bed test to seed a plane keyed by the variant's url. Since test variants use `url: ''`, seed with `''`:

```ts
describe('resolveStack (geometric support plane)', () => {
  it('rests the mattress BOTTOM on the detected slat plane', () => {
    const base = bedDef();
    const top = mattressDef();
    seedGltfSupportPlane(base.variants[0].runtimeUrl ?? '', 0.25);
    const fit = resolveStack(base, base.variants[0], top, top.variants[0], 'Foam & latex mattresses');
    expect(fit).not.toBeNull();
    expect(fit!.kind).toBe('vertical');
    expect(fit!.supportY).toBeCloseTo(0.25, 3); // bottom on the planks
  });

  it('falls back to STACK.bedSlatDefault when no plane detected', () => {
    const base = bedDef();
    const top = mattressDef();
    seedGltfSupportPlane(base.variants[0].runtimeUrl ?? '', null);
    const fit = resolveStack(base, base.variants[0], top, top.variants[0], 'Foam & latex mattresses');
    expect(fit!.supportY).toBeCloseTo(0.13, 3);
  });
});
```

Remove the old `0.1257`, `clamps`, and `footboard` tests (their premise is gone). Keep the centre-offset and null-base tests but add the 5th arg `'Foam & latex mattresses'`.

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: FAIL — `resolveStack` signature lacks the category arg + returns no `kind`; `StackFit.kind` undefined.

- [ ] **Step 3: Rework `resolveStack`**

In `src/furniture/ikea/stacking.ts`:

Replace the `StackFit` interface:

```ts
export interface StackFit {
  kind: 'vertical' | 'around';
  /** VERTICAL only: Y where the bottom of the stacked item rests. */
  supportY: number;
  /** VERTICAL only: [dx, dz] base-local centre offset. */
  centerOffset: [number, number];
  rotation: number;
}
```

Replace `supportSurfaceY` body's bed branch and `resolveStack`:

```ts
import { getCachedSupportPlaneY } from '../GltfModel';
import { placementKind } from './placementSemantics';

export function resolveStack(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
  acceptedCategory: string,
): StackFit | null {
  if (!baseDef.compatibility?.acceptsCategories?.length) return null;
  const kind = placementKind(acceptedCategory);
  if (kind === null) return null; // unclassified → no wrong combine

  if (kind === 'around') {
    return { kind: 'around', supportY: 0, centerOffset: [0, 0], rotation: 0 };
  }

  // vertical: rest the top's BOTTOM on the detected slat/support plane.
  const url = baseVariant.runtimeUrl ?? baseVariant.url ?? '';
  const plane = getCachedSupportPlaneY(url);
  const supportY = plane ?? STACK.bedSlatDefault;
  return { kind: 'vertical', supportY, centerOffset: centerOffset(baseVariant), rotation: 0 };
}
```

Delete the now-unused `supportSurfaceY` and its `topThickness` param (no longer subtract thickness — the bottom rests on the plane). Keep `centerOffset`, `cmToM`, `measurements` only if still referenced; remove dead code (run tsc to confirm).

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/stacking.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/stacking.ts src/furniture/ikea/stacking.test.ts
git commit -m "feat(stacking): rest mattress on detected plane; classify placement kind"
```

---

# PHASE 2 — Placement semantics + AROUND (fixes chair-on-table)

## Task 4: `placementKind` classifier (TDD)

**Files:**
- Create: `src/furniture/ikea/placementSemantics.ts`
- Create: `src/furniture/ikea/placementSemantics.test.ts`

NOTE: the keyword table is refined from real phrases in Phase 3 (Task 8). This task ships a correct-by-omission first version (the two confirmed cases + gate-off default).

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/placementSemantics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placementKind } from './placementSemantics';

describe('placementKind', () => {
  it('classifies mattresses + bed bases as vertical', () => {
    expect(placementKind('Foam & latex mattresses')).toBe('vertical');
    expect(placementKind('Spring mattresses')).toBe('vertical');
    expect(placementKind('Slatted bed bases')).toBe('vertical');
  });

  it('classifies seating-around-a-table as around', () => {
    expect(placementKind('Kitchen dining chairs')).toBe('around');
    expect(placementKind('Stools')).toBe('around');
    expect(placementKind('Dining benches')).toBe('around');
    expect(placementKind('Upholstered chairs')).toBe('around');
    expect(placementKind('Storage benches')).toBe('around');
  });

  it('returns null for unclassified phrases (gate the action off)', () => {
    expect(placementKind('Mysterious widgets')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- src/furniture/ikea/placementSemantics.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/placementSemantics.ts`:

```ts
/**
 * Classifies an IKEA "Complete with" accepted-category phrase into how the
 * accepted item is physically placed relative to the base:
 *   - 'vertical' — rests ON the base's support surface (mattress on a frame).
 *   - 'around'   — placed BESIDE/around the base on the floor (chairs at a table).
 *   - 'modular'  — sofa sections that snap edge-to-edge (handled via modular
 *                  metadata, not this rule; reserved here for completeness).
 *   - null       — unclassified; callers gate the combine action off so nothing
 *                  is ever wrongly stacked.
 * Keyword table is informed by the scraper phrase index (see plan Phase 3).
 */
export type PlacementKind = 'vertical' | 'around' | 'modular';

const VERTICAL = ['mattress', 'mattresses', 'bed base', 'bed bases', 'slatted',
  'cushion', 'cushions', 'seat pad', 'pad', 'topper', 'mattress pad'];
const AROUND = ['chair', 'chairs', 'stool', 'stools', 'bench', 'benches'];

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function placementKind(acceptedCategory: string): PlacementKind | null {
  const p = norm(acceptedCategory);
  if (AROUND.some((k) => p.includes(k))) return 'around';
  if (VERTICAL.some((k) => p.includes(k))) return 'vertical';
  return null;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/placementSemantics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/placementSemantics.ts src/furniture/ikea/placementSemantics.test.ts
git commit -m "feat(stacking): placementKind classifier (vertical/around/modular)"
```

---

## Task 5: `combineOnto` — vertical item or around-edge placement (TDD)

**Files:**
- Modify: `src/furniture/ikea/stacking.ts`
- Modify: `src/furniture/ikea/stacking.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikea/stacking.test.ts`:

```ts
import { combineOnto } from './stacking';

describe('combineOnto', () => {
  it('vertical: returns a lifted, grouped item resting on the plane', () => {
    const base = bedDef();
    seedGltfSupportPlane(base.variants[0].runtimeUrl ?? '', 0.25);
    const baseItem: FurnitureItem = { id: 'frame', defId: base.id, position: [2, 3], rotation: 0, props: {} };
    const top = mattressDef();
    const res = combineOnto(baseItem, base, top, top.variants[0], 'Foam & latex mattresses');
    if (!('items' in res)) throw new Error('expected items');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].props['surfaceHeight']).toBeCloseTo(0.25, 3);
    expect(res.items[0].groupId).toBe(res.groupId);
  });

  it('around: places seating beside the base on the floor (no lift)', () => {
    const base = tableDef(); // helper: a tables-category def that accepts chairs
    const baseItem: FurnitureItem = { id: 'tbl', defId: base.id, position: [5, 5], rotation: 0, props: {} };
    const chair = chairDef();
    const res = combineOnto(baseItem, base, chair, chair.variants[0], 'Kitchen dining chairs');
    if (!('items' in res)) throw new Error('expected items');
    expect(res.items[0].props['surfaceHeight']).toBeUndefined(); // floor-standing
    // beside, not on top: x or z differs from the table centre
    const moved = res.items[0].position[0] !== 5 || res.items[0].position[1] !== 5;
    expect(moved).toBe(true);
    expect(res.items[0].groupId).toBe(res.groupId);
  });
});
```

Add the `tableDef()` and `chairDef()` helpers near `bedDef()` (a `category:'tables'` def with `compatibility.acceptsCategories:['Kitchen dining chairs']` + footprint w:1.8,d:0.9; a `category:'seating'` chair def footprint w:0.45,d:0.5).

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: FAIL — `combineOnto` not exported.

- [ ] **Step 3: Implement `combineOnto`**

Rename the v1 `stackOnto` to an internal `buildVerticalItem` and add `combineOnto`. In `src/furniture/ikea/stacking.ts`:

```ts
export type CombineResult =
  | { items: FurnitureItem[]; groupId: string }
  | { error: string };

/** Place `topDef`/`topVariant` onto/around `baseItem` per the matched category.
 *  VERTICAL → one item resting on the support plane (props.surfaceHeight).
 *  AROUND  → one seat at the nearest free edge of the base, on the floor.
 *  Shared groupId (reused from base or minted). Caller commits in one history step. */
export function combineOnto(
  baseItem: FurnitureItem,
  baseDef: IkeaGltfDef,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
  acceptedCategory: string,
): CombineResult {
  if (!topVariant) return { error: `Missing variant for ${topDef.name}.` };
  const fit = resolveStack(baseDef, baseDef.variants[0], topDef, topVariant, acceptedCategory);
  if (!fit) return { error: `No combine rule for ${topDef.name} on ${baseDef.name}.` };
  const groupId = baseItem.groupId ?? newStackId();

  if (fit.kind === 'vertical') {
    const [dx, dz] = fit.centerOffset;
    const cos = Math.cos(baseItem.rotation), sin = Math.sin(baseItem.rotation);
    const item: FurnitureItem = {
      id: newStackId(), defId: topDef.id,
      position: [baseItem.position[0] + dx * cos - dz * sin, baseItem.position[1] + dx * sin + dz * cos],
      rotation: baseItem.rotation, groupId,
      props: { ...variantProps(topVariant.finish), surfaceHeight: fit.supportY },
    };
    return { items: [item], groupId };
  }

  // around: one seat at the long-edge midpoint nearest +Z of the base, facing it.
  const baseFp = baseDef.defaultFootprint;
  const longAlongX = baseFp.w >= baseFp.d;
  const perp = (longAlongX ? baseFp.d : baseFp.w) / 2 + (topDef.defaultFootprint.d / 2) + 0.05;
  const dx = 0, dz = perp; // base-local: in front
  const cos = Math.cos(baseItem.rotation), sin = Math.sin(baseItem.rotation);
  const item: FurnitureItem = {
    id: newStackId(), defId: topDef.id,
    position: [baseItem.position[0] + dx * cos - dz * sin, baseItem.position[1] + dx * sin + dz * cos],
    rotation: baseItem.rotation + Math.PI, // face the table
    groupId,
    props: { ...variantProps(topVariant.finish) }, // no surfaceHeight → floor
  };
  return { items: [item], groupId };
}
```

Keep `stackOnto` exported as a thin wrapper if any caller still imports it, OR update callers (Task 6/7). Prefer updating callers and removing `stackOnto`.

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/stacking.test.ts && npx tsc --noEmit`
Expected: tests PASS; tsc may flag callers still using `stackOnto` — fixed in Task 6/7.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/stacking.ts src/furniture/ikea/stacking.test.ts
git commit -m "feat(stacking): combineOnto — vertical rest or around-edge placement"
```

---

## Task 6: Inspector "Place on this" → `combineOnto`

**Files:**
- Modify: `src/ui/inspector/IkeaBody.tsx`

- [ ] **Step 1: Update the handler + disabled check**

Replace the `placeOnThis` handler and the per-match `canPlace`/button to pass the matched `category` and use `combineOnto` (which returns `items[]`). In `IkeaBody.tsx`:

```tsx
import { combineOnto } from '../../furniture/ikea/stacking';
```

Handler:

```tsx
  const placeOnThis = (matchDef: IkeaGltfDef, finish: string, category: string) => {
    const variant = matchDef.variants.find((v) => v.finish === finish) ?? matchDef.variants[0];
    const res = combineOnto(item, def, matchDef, variant, category);
    if ('error' in res) return;
    const st = useStore.getState();
    st.pushHistory();
    const withBaseGroup = item.groupId
      ? st.items
      : st.items.map((it) => (it.id === item.id ? { ...it, groupId: res.groupId } : it));
    st.setItems([...withBaseGroup, ...res.items]);
    st.setSelectedItemIds(res.items.map((i) => i.id));
  };
```

In the matched-category map (the `category` is already in scope from `matchedCategories.map(([category, list]) => ...)`), update the per-match compute + click:

```tsx
                      const canPlace = !('error' in combineOnto(item, def, m.def, variant0, category));
                      ...
                        onClick={() => placeOnThis(m.def, finish0, category)}
```

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (no caller references `stackOnto` anymore for IkeaBody).

- [ ] **Step 3: Commit**

```bash
git add src/ui/inspector/IkeaBody.tsx
git commit -m "feat(stacking): inspector Place-on-this uses combineOnto (vertical/around)"
```

---

## Task 7: Drag-snap → `combineOnto` with matched category

**Files:**
- Modify: `src/scene/DragController.tsx`

- [ ] **Step 1: Read the current drop path**

Run: `grep -n "stackOnto\|snapBase\|resolveCompatible\|onUp\|setItems" src/scene/DragController.tsx`
Expected: find where the drop computes `stackOnto`. You will replace it with `combineOnto`, and you need the MATCHED category (which `resolveCompatible(baseDef, [draggedDef])` produces, keyed by category).

- [ ] **Step 2: Derive the matched category + call combineOnto**

Where the drop currently calls `stackOnto`, replace with:

```ts
import { combineOnto } from '../furniture/ikea/stacking';
// ...
const matches = resolveCompatible(baseDef, [draggedDef]);
const category = Object.entries(matches).find(([, list]) => list.length > 0)?.[0];
if (category) {
  const draggedVariant = draggedDef.variants.find(
    (v) => v.finish === (draggedItem.props['variant'] ?? draggedDef.activeVariant)) ?? draggedDef.variants[0];
  const res = combineOnto(base, baseDef, draggedDef, draggedVariant, category);
  if ('items' in res) {
    const st = useStore.getState();
    st.pushHistory();
    const placed = res.items[0]; // single item for drag
    const groupId = res.groupId;
    st.setItems(st.items.map((it) => {
      if (it.id === draggedItem.id) return { ...it, position: placed.position, rotation: placed.rotation, groupId, props: { ...it.props, ...placed.props } };
      if (it.id === base.id && !base.groupId) return { ...it, groupId };
      return it;
    }));
    st.setSelectedItemIds([draggedItem.id]);
    state.endDrag();
    return;
  }
}
// else fall through to normal free placement
```

Ensure `snapBase` (the highlight predicate) still uses `resolveCompatible` non-empty — it does; no change needed there.

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. No remaining references to `stackOnto`; if any, remove the `stackOnto` export.

- [ ] **Step 4: Commit**

```bash
git add src/scene/DragController.tsx
git commit -m "feat(stacking): drag-snap routes through combineOnto with matched category"
```

---

## Task 8: Visual verification — Phase 1+2 (REQUIRED)

**Files:** none. Per CLAUDE.md, prove the render.

- [ ] **Step 1: Stage assets + temporary debug hooks**

Copy `malm-bed-frame-high-90x200`, `vitm-sen-pocket-sprung-mattress-90x200`, `voxl-v-dining-table-180x90`, `voxl-v-chair` into `public/assets/ikea/`. Temporarily expose `__importGroup`/`__combineOnto` in `src/main.tsx` (revert before finishing; do not commit).

- [ ] **Step 2: Capture mattress-on-frame**

Import frame + mattress, place frame, `combineOnto(frame, frameDef, matDef, matDef.variants[0], 'Foam & latex mattresses')`, add items, focus camera. Capture a side/profile shot `/tmp/v2-bed.png` (waitMs 9000).

- [ ] **Step 3: Capture chair-around-table**

Import table + chair, place table, `combineOnto(table, tableDef, chairDef, chairDef.variants[0], 'Kitchen dining chairs')`, add items, focus. Capture `/tmp/v2-table.png`.

- [ ] **Step 4: Review the screenshots (report what you see)**

Confirm and report: (a) the mattress top now sits PROUD above the footboard rail with its bottom on the planks (not 12cm low); (b) the chair stands on the FLOOR beside the table facing it (NOT on the tabletop). If either is wrong, return to the relevant task.

- [ ] **Step 5: Cleanup + commit any fixes**

Revert `main.tsx`, remove staged assets, stop dev server. Commit only real source fixes if any were needed.

---

# PHASE 3 — Scraper phrase index (robust classifier)

## Task 9: `--phrase-index` scraper mode

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py`

- [ ] **Step 1: Add the CLI flag + a no-GLB crawl path**

In `python/scripts/ikea_model_scraper.py`, add to the argparse block (near line 1314):

```python
    parser.add_argument("--phrase-index", type=str, default=None,
                        help="Crawl pages and dump {group_key, product_name, category, "
                             "accepts_categories[]} to this JSON file. No GLB download.")
```

Thread `phrase_index` into `main(...)`. When set, for each visited product run the existing `scrape_complete_with(page)` + category detection but SKIP the GLB download / `optimize` / blob write, appending a dict per product. Write the JSON array to the path at the end.

```python
# inside the per-product loop, when phrase_index_path is set:
if phrase_index_path is not None:
    accepts = (compatibility or {}).get("accepts_categories", [])
    phrase_rows.append({
        "group_key": group_key,
        "product_name": product_name,
        "category": (design or {}).get("category"),
        "accepts_categories": accepts,
    })
    continue  # skip GLB work for this product
```

(Use the real variable names present in the loop — confirm by reading `main`'s body around the per-product processing; `compatibility`, `design`, `group_key`, `product_name` are computed there.)

- [ ] **Step 2: Smoke-run on a tiny limit**

Run: `cd python/scripts && python ikea_model_scraper.py -n 5 --phrase-index /tmp/phrases.json` (requires Playwright/network; if unavailable in CI, document the command and verify the code path by reading).
Expected: `/tmp/phrases.json` is a JSON array of rows with `accepts_categories`.

- [ ] **Step 3: Commit**

```bash
git add python/scripts/ikea_model_scraper.py
git commit -m "feat(scraper): --phrase-index mode dumps accepts_categories without GLBs"
```

---

## Task 10: Refine `placementKind` from harvested phrases

**Files:**
- Modify: `src/furniture/ikea/placementSemantics.ts`
- Modify: `src/furniture/ikea/placementSemantics.test.ts`

- [ ] **Step 1: Analyse the phrase index (if produced)**

If `/tmp/phrases.json` exists, tabulate distinct `accepts_categories` phrases and assign each vertical/around/modular. If the scrape couldn't run (no network), use the local metadata phrases plus IKEA's published "Complete with" category names and note the limitation in the commit.

- [ ] **Step 2: Add tests for every newly-covered phrase**

For each distinct phrase, add an assertion to `placementSemantics.test.ts` mapping it to its kind (vertical/around/modular/null). Example additions:

```ts
  it('covers harvested phrases', () => {
    expect(placementKind('Headboards')).toBe('vertical');       // mounts on/at the frame head
    expect(placementKind('Chair pads')).toBe('vertical');
    expect(placementKind('Sofa sections')).toBe('modular');
    // ...one assertion per distinct harvested phrase...
  });
```

(Replace these with the ACTUAL harvested phrases. Do not invent — only add phrases that appear in the index or IKEA's published category list.)

- [ ] **Step 3: Extend the keyword tables to pass**

Update `VERTICAL`/`AROUND` and add a `MODULAR = ['section', 'sections', 'corner section']` list; in `placementKind`, check MODULAR before the others:

```ts
const MODULAR = ['section', 'sections', 'corner section', 'chaise'];
// in placementKind, first:
if (MODULAR.some((k) => p.includes(k))) return 'modular';
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/placementSemantics.test.ts`
Expected: PASS (all phrase assertions).

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/placementSemantics.ts src/furniture/ikea/placementSemantics.test.ts
git commit -m "feat(stacking): classifier covers harvested accepts_categories phrases"
```

---

# PHASE 4 — Modular sofa sections

## Task 11: Scraper sofa-configurator pass + `modular` metadata block

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py`

- [ ] **Step 1: Detect a modular sofa + capture section-mating data**

Add a function `scrape_modular_sections(page)` that, when a product page exposes IKEA's sofa configurator / "build your own" widget, extracts per-section connection info: the section's role (`seat`/`corner`/`chaise`/`armrest`), and which edges (`left`/`right`/`back`) accept which neighbour roles. Return a dict or `None`.

```python
async def scrape_modular_sections(page):
    """
    If the product is part of a modular sofa series with a configurator, capture
    section connection metadata: role + per-edge accepted neighbour roles.
    Returns {"role": str, "mates": [{"edge": "left|right|back", "accepts": [roles]}]}
    or None when the product is not modular.
    """
    try:
        root = await page.query_selector(".js-sofa-configurator, .modular-builder, [data-modular]")
        if not root:
            return None
        data = await page.evaluate("""() => {
            // Extract role + edge rules from the configurator DOM. Shape:
            // { role, mates: [{edge, accepts:[...]}] }. Return null if absent.
            const el = document.querySelector('.js-sofa-configurator, .modular-builder, [data-modular]');
            if (!el) return null;
            // Selectors are best-effort; adjust to the live widget's DOM.
            const role = el.getAttribute('data-section-role') || null;
            const mates = [...el.querySelectorAll('[data-edge]')].map((e) => ({
                edge: e.getAttribute('data-edge'),
                accepts: (e.getAttribute('data-accepts') || '').split(',').map(s=>s.trim()).filter(Boolean),
            }));
            return role ? { role, mates } : null;
        }""")
        return data
    except Exception as e:
        print(f"[-] Modular scrape omitted: {e}")
        return None
```

Call it in the per-product flow; when non-None, add `metadata["modular"] = data` before writing `metadata.json`.

NOTE: the exact widget selectors must be verified against the live IKEA sofa page during implementation (the configurator DOM is not documented). If the widget can't be reliably parsed, emit `modular` with role only (from the product name: `*corner*`→`corner`, `*chaise*`→`chaise`, else `seat`) and rely on geometric edge-snap as the fallback (Task 13). Log clearly what was captured vs. inferred.

- [ ] **Step 2: Smoke-run on a VIMLE section**

Run: `cd python/scripts && python ikea_model_scraper.py -u <vimle-section-url>` and inspect the written `metadata.json` for a `modular` block.
Expected: `modular` present (parsed or name-inferred role).

- [ ] **Step 3: Commit**

```bash
git add python/scripts/ikea_model_scraper.py
git commit -m "feat(scraper): capture modular sofa section-mating metadata"
```

---

## Task 12: Parse the `modular` block into `IkeaGltfDef` (TDD)

**Files:**
- Modify: `src/furniture/types.ts`
- Modify: `src/furniture/ikea/metadata.ts`
- Modify: `src/furniture/ikea/importGroup.ts`
- Modify: `src/furniture/ikea/importGroup.test.ts`

- [ ] **Step 1: Add the type**

In `src/furniture/types.ts`, add to `IkeaGltfDef` (after `compatibility?`):

```ts
  /** Modular sofa section connectivity (from the scraper configurator pass).
   *  Absent for non-modular products. */
  modular?: {
    role: 'seat' | 'corner' | 'chaise' | 'armrest';
    mates: { edge: 'left' | 'right' | 'back'; accepts: string[] }[];
  };
```

And the zod schema in `src/furniture/ikea/metadata.ts` (mirror the existing optional-field style):

```ts
  modular: z.object({
    role: z.enum(['seat', 'corner', 'chaise', 'armrest']),
    mates: z.array(z.object({
      edge: z.enum(['left', 'right', 'back']),
      accepts: z.array(z.string()),
    })),
  }).optional(),
```

- [ ] **Step 2: Write the failing import test**

In `src/furniture/ikea/importGroup.test.ts`, add a case: metadata with a `modular` block → the built `IkeaGltfDef.modular` matches. (Mirror an existing import test's setup.)

```ts
it('carries the modular block onto the def', async () => {
  const meta = makeMeta({ modular: { role: 'corner', mates: [{ edge: 'right', accepts: ['seat'] }] } });
  const res = await importGroup(meta, makeFiles());
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.def.modular).toEqual({ role: 'corner', mates: [{ edge: 'right', accepts: ['seat'] }] });
});
```

- [ ] **Step 3: Run to confirm fail**

Run: `npm test -- src/furniture/ikea/importGroup.test.ts`
Expected: FAIL — `modular` not propagated.

- [ ] **Step 4: Propagate in `importGroup.ts`**

In the `def` object built in `importGroup.ts`, add:

```ts
    ...(meta.modular ? { modular: meta.modular } : {}),
```

- [ ] **Step 5: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/importGroup.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/furniture/types.ts src/furniture/ikea/metadata.ts src/furniture/ikea/importGroup.ts src/furniture/ikea/importGroup.test.ts
git commit -m "feat(stacking): import modular section metadata onto IkeaGltfDef"
```

---

## Task 13: Modular edge-snap placement (TDD)

**Files:**
- Modify: `src/furniture/ikea/stacking.ts`
- Modify: `src/furniture/ikea/stacking.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/furniture/ikea/stacking.test.ts`:

```ts
describe('combineOnto modular', () => {
  it('snaps a section to the base section right edge, sharing rotation, grouped, on floor', () => {
    const base = sectionDef('seat');     // helper: modular role seat, footprint w:0.9,d:0.95
    const baseItem: FurnitureItem = { id: 's1', defId: base.id, position: [4, 4], rotation: 0, props: {} };
    const add = sectionDef('seat');
    const res = combineOnto(baseItem, base, add, add.variants[0], 'Sofa sections');
    if (!('items' in res)) throw new Error('expected items');
    const it = res.items[0];
    expect(it.props['surfaceHeight']).toBeUndefined();   // floor
    expect(it.rotation).toBeCloseTo(0, 5);               // shares rotation
    // placed beside along the mating edge: x shifts by ~base half-width + add half-width
    expect(Math.abs(it.position[0] - 4)).toBeGreaterThan(0.4);
    expect(it.position[1]).toBeCloseTo(4, 5);
    expect(it.groupId).toBe(res.groupId);
  });
});
```

Add a `sectionDef(role)` helper: a `category:'seating'` def with `modular:{role, mates:[{edge:'right',accepts:['seat','corner']}]}`, `compatibility.acceptsCategories:['Sofa sections']`, footprint w:0.9,d:0.95.

- [ ] **Step 2: Run to confirm fail**

Run: `npm test -- src/furniture/ikea/stacking.test.ts`
Expected: FAIL — modular branch not handled (returns null/around).

- [ ] **Step 3: Implement the modular branch**

In `combineOnto`, before the vertical/around handling, add a modular path keyed on `placementKind(acceptedCategory) === 'modular'` (or `baseDef.modular` present):

```ts
  if (placementKind(acceptedCategory) === 'modular' && baseDef.modular) {
    // Snap the new section beside the base along its first mating edge.
    const edge = baseDef.modular.mates[0]?.edge ?? 'right';
    const baseHalfW = baseDef.defaultFootprint.w / 2;
    const addHalfW = topDef.defaultFootprint.w / 2;
    // left/right run along base local X; back along -Z.
    const sign = edge === 'left' ? -1 : 1;
    const dx = edge === 'back' ? 0 : sign * (baseHalfW + addHalfW);
    const dz = edge === 'back' ? -(baseDef.defaultFootprint.d / 2 + topDef.defaultFootprint.d / 2) : 0;
    const cos = Math.cos(baseItem.rotation), sin = Math.sin(baseItem.rotation);
    const item: FurnitureItem = {
      id: newStackId(), defId: topDef.id,
      position: [baseItem.position[0] + dx * cos - dz * sin, baseItem.position[1] + dx * sin + dz * cos],
      rotation: baseItem.rotation, groupId,
      props: { ...variantProps(topVariant.finish) },
    };
    return { items: [item], groupId };
  }
```

(Note: this requires `resolveStack`/`combineOnto` not to early-return for the modular category. Ensure `placementKind` returns `'modular'` for `'Sofa sections'` — added in Task 10 — and that `resolveStack`'s `kind === null` gate doesn't reject modular: handle the modular branch in `combineOnto` BEFORE calling `resolveStack`.)

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- src/furniture/ikea/stacking.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/stacking.ts src/furniture/ikea/stacking.test.ts
git commit -m "feat(stacking): modular section edge-snap placement"
```

---

## Task 14: Visual verification — modular (REQUIRED)

**Files:** none.

- [ ] **Step 1: Stage two VIMLE sections** (e.g. `vimle-1-seat-section` + `vimle-corner-section`) in `public/assets/ikea/`; temporary `__importGroup`/`__combineOnto` hooks in `main.tsx` (revert, don't commit).

- [ ] **Step 2: Import both, place one, combine the second** via `combineOnto(base, baseDef, addDef, addDef.variants[0], 'Sofa sections')`; add items; focus camera; capture `/tmp/v2-modular.png` (waitMs 9000).

- [ ] **Step 3: Review + report:** the two sections sit flush edge-to-edge on the floor (no gap, no overlap, no float), aligned, forming a continuous sofa. If wrong, return to Task 13.

- [ ] **Step 4: Cleanup** (revert main.tsx, remove assets, stop server); commit any real fixes.

---

## Task 15: Documentation (REQUIRED)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md stacking entry**

Revise the **Stacking compatible models** bullet: support height is now GEOMETRIC (`supportPlane.ts` `detectSupportPlaneY` over the GLB mesh, cached in `GltfModel`), replacing the footboard estimate; combining branches on `placementKind` (`placementSemantics.ts`) into VERTICAL (rest on plane), AROUND (`combineOnto` places seating beside the base via the `arrangeSet` edge logic), or MODULAR (sofa sections snap edge-to-edge using the scraper's `modular` metadata). Note the two scraper additions (`--phrase-index`; sofa-configurator `modular` block).

- [ ] **Step 2: Update README.md**

Revise the "Combine compatible pieces" bullet: a mattress rests on the bed frame's actual slat surface (its top sits proud above the footboard, as in real life); dining chairs/benches arrange around a table on the floor; modular sofa sections snap together side-by-side.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: stacking v2 — geometric support, around-placement, modular sofas"
```

---

## Self-Review Notes

- **Spec coverage:** support plane (A)→Tasks 1-3; placement semantics (B)→Tasks 4,10; resolveStack rework (C)→Task 3,5; triggers (D)→Tasks 6,7; collision/shadow (E)→unchanged from v1 (verified still correct; AROUND/modular items have no surfaceHeight so liftY=0 and the v1 shadow grounding is a no-op for them); phrase index (F)→Task 9; sofa configurator + schema (G)→Tasks 11,12,13. Visual verification→Tasks 8,14. Docs→Task 15.
- **Type consistency:** `StackFit.kind`, `CombineResult { items[]; groupId } | { error }`, `combineOnto(baseItem, baseDef, topDef, topVariant, acceptedCategory)`, `placementKind → 'vertical'|'around'|'modular'|null`, `detectSupportPlaneY(bands, bboxHeight)`, `getCachedSupportPlaneY(url)`/`seedGltfSupportPlane(url,y)`, `IkeaGltfDef.supportPlaneY?`-via-cache (not a def field; cached by url) and `IkeaGltfDef.modular?` used consistently. NOTE: the spec mentioned `IkeaGltfDef.supportPlaneY?` but the plan caches by URL in `GltfModel` (parallel to footprint) rather than adding a def field — simpler and matches the existing footprint pattern; the def field is not added.
- **Known implementation risk (flagged, not a placeholder):** Task 11's configurator DOM selectors are unverified against the live IKEA widget; the task explicitly instructs verifying them during implementation and falling back to name-inferred role + geometric edge-snap if the widget can't be parsed. Task 13's edge-snap works from `modular.role`/`mates` regardless, so Phase 4 degrades gracefully.
- **Order dependency:** Phase 1+2 (Tasks 1-8) are app-only and fix the two confirmed bugs; Phase 3 refines the classifier; Phase 4 (modular) depends on Tasks 10 (classifier returns 'modular') and 12 (def carries `modular`).
