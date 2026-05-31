# IKEA Model Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import scraped IKEA product-group folders as first-class catalog items — placeable, collidable, finish-swappable, priced, attributed, with product info and "complete with" suggestions.

**Architecture:** One `IkeaGltfDef` per group (folder) carries a `variants[]` array; the active finish lives per-instance in `FurnitureItem.props.variant`. Defs reuse the existing `userFurniture` store slice + IndexedDB blob store + save-schema round-trip; `source:'ikea'` distinguishes them. Pure import logic (metadata parse, design→placement translation, category map, compatibility resolver) is framework-free and TDD'd first; UI/IDB integration is wired at the seams.

**Tech Stack:** React + TypeScript, Three.js / @react-three/fiber, Zustand, Zod, Vitest. IndexedDB for blobs, localStorage for the save schema.

**Spec:** `docs/superpowers/specs/2026-05-31-ikea-model-import-design.md`
**Fixture:** `python/scripts/ikea_sg_3d_models/malm-bed-frame-high-90x200/{metadata.json,black-brown.glb}`

**Conventions:**
- Run a single test file: `npx vitest run path/to/file.test.ts`
- Typecheck: `npx tsc --noEmit`
- Commit with `git -c commit.gpgsign=false commit` (GPG signing fails in this env).
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Create:**
- `src/furniture/ikea/metadata.ts` — Zod schema + `parseMetadata`.
- `src/furniture/ikea/metadata.test.ts`
- `src/furniture/ikea/translate.ts` — `mapCategory`, `placementFlags`, `titleCaseFinish`.
- `src/furniture/ikea/translate.test.ts`
- `src/furniture/ikea/importGroup.ts` — orchestrator: blobs→IDB, build def, seed cache.
- `src/furniture/ikea/importGroup.test.ts`
- `src/furniture/ikea/compatibility.ts` — TS port of `compatibility.py`.
- `src/furniture/ikea/compatibility.test.ts`
- `src/ui/inspector/IkeaBody.tsx` — finish picker, tint, product info, "complete with".

**Modify:**
- `src/furniture/types.ts` — enum + `IkeaGltfDef` + variant/info types + `frontClearance`.
- `src/furniture/catalog.ts` — `isIkeaDef`, footprint resolver branch.
- `src/furniture/GltfModel.tsx` — export `seedGltfFootprint`.
- `src/furniture/Furniture.tsx` — render active variant.
- `src/furniture/furniturePrices.ts` — def-level price + new category bases.
- `src/state/schema.ts` — `IkeaGltfDefZ`, serialize/round-trip.
- `src/state/storage/hydrateAssets.ts` — re-resolve IKEA variant runtime URLs.
- `src/layout/autoArrange.ts` — category-fallback roles incl. textiles/outdoor.
- `src/ui/upload/UploadModelDialog.tsx` + `src/furniture/upload/bulkImport.ts` — detect group folder.
- `src/furniture/upload/validate.ts` — optional `maxBytes`.
- `src/ui/inspector/InspectorPanel.tsx` — dispatch `IkeaBody`, widen source-line guard.
- `src/ui/inspector/SourceLine.tsx` — `license:'CC0'|'IKEA'`.
- `src/ui/BudgetPanel.tsx`, `src/ui/report.ts` — pass def to `itemPrice`; new category labels.
- `src/ui/catalog/CategoryTabs.tsx`, `src/ui/Minimap.tsx`, `src/ui/catalog/CategoryIcon.tsx` — new categories.

---

## Task 1: Extend FurnitureCategory enum

**Files:**
- Modify: `src/furniture/types.ts:20-41`
- Test: `src/furniture/categories.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/furniture/categories.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FURNITURE_CATEGORIES } from './types';

describe('FurnitureCategory', () => {
  it('includes textiles and outdoor', () => {
    expect(FURNITURE_CATEGORIES).toContain('textiles');
    expect(FURNITURE_CATEGORIES).toContain('outdoor');
  });
  it('has 11 categories', () => {
    expect(FURNITURE_CATEGORIES).toHaveLength(11);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/furniture/categories.test.ts`
Expected: FAIL (`textiles`/`outdoor` not present, length 9).

- [ ] **Step 3: Implement**

In `src/furniture/types.ts`, add `| 'textiles' | 'outdoor'` to the `FurnitureCategory` union (after `'decor'`) and append `'textiles', 'outdoor'` to the `FURNITURE_CATEGORIES` array.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/furniture/categories.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck to surface all exhaustive consumers**

Run: `npx tsc --noEmit`
Expected: errors at each `Record<FurnitureCategory, …>` literal that's now missing keys — note them; Task 2 fixes them.

- [ ] **Step 6: Commit**

```bash
git add src/furniture/types.ts src/furniture/categories.test.ts
git -c commit.gpgsign=false commit -m "feat: add textiles and outdoor furniture categories

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Fill in new categories across exhaustive consumers

**Files:**
- Modify: `src/furniture/furniturePrices.ts:10-21` (CATEGORY_BASE)
- Modify: `src/furniture/catalog.ts:60-70` (useCatalogByCategory literal)
- Modify: `src/ui/BudgetPanel.tsx:7` (CATEGORY_LABEL)
- Modify: `src/ui/report.ts:12` (CAT_LABEL)
- Modify: `src/ui/upload/UploadModelDialog.tsx:19` (CATEGORY_LABEL)
- Modify: `src/ui/catalog/CategoryTabs.tsx:13` (LABELS)
- Modify: `src/ui/catalog/CategoryIcon.tsx` (icon map)
- Modify: `src/ui/Minimap.tsx:11` (DOT — Partial, optional but add)

- [ ] **Step 1: Add prices**

In `furniturePrices.ts` `CATEGORY_BASE`, add: `textiles: 200,` and `outdoor: 300,`.

- [ ] **Step 2: Add catalog buckets**

In `catalog.ts` `useCatalogByCategory`'s `out` literal, add:
```ts
    textiles: [...(BUILTIN_BY_CATEGORY.textiles ?? [])],
    outdoor: [...(BUILTIN_BY_CATEGORY.outdoor ?? [])],
```

- [ ] **Step 3: Add labels**

In each label map (`BudgetPanel.tsx`, `report.ts`, `UploadModelDialog.tsx`, `CategoryTabs.tsx`), add `textiles: 'Textiles',` and `outdoor: 'Outdoor',`.

- [ ] **Step 4: Add icon + minimap entries**

In `CategoryIcon.tsx`, add cases for `textiles` and `outdoor` (reuse an existing emoji/glyph, e.g. textiles → '🧶' or the rug glyph, outdoor → '🌳'; match the file's existing style). In `Minimap.tsx` `DOT`, add `textiles: '#…', outdoor: '#…'` matching the palette style there.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no more missing-key errors).

- [ ] **Step 6: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git -c commit.gpgsign=false commit -m "feat: wire textiles/outdoor into prices, catalog, labels, icons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add IkeaGltfDef types

**Files:**
- Modify: `src/furniture/types.ts` (add `frontClearance` to base; add new interfaces; extend `GltfDef`)
- Test: `src/furniture/ikeaTypes.test.ts` (create — a compile-time/shape smoke test)

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikeaTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { IkeaGltfDef } from './types';

describe('IkeaGltfDef', () => {
  it('constructs a minimal valid def', () => {
    const def: IkeaGltfDef = {
      id: 'ikea-malm-bed-frame-high-90x200',
      name: 'MALM bed frame, high',
      category: 'beds',
      kind: 'gltf',
      source: 'ikea',
      groupKey: 'malm-bed-frame-high-90x200',
      activeVariant: 'black-brown',
      variants: [
        {
          finish: 'black-brown',
          label: 'Black-brown',
          articleNumber: '40265178',
          url: 'https://ikea.example/p/40265178',
          assetId: 'asset-1',
          glbMaterials: [{ name: 'material_0', hex: '#fff', metallic: 1, roughness: 1, textured: true }],
        },
      ],
      defaultFootprint: { w: 1.05, d: 2.09, h: 1.0 },
      uploadedAt: new Date().toISOString(),
      license: 'IKEA',
      attribution: 'IKEA — imported model',
    };
    expect(def.variants[0].finish).toBe('black-brown');
    expect(def.source).toBe('ikea');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikeaTypes.test.ts`
Expected: FAIL (type `IkeaGltfDef` not exported).

- [ ] **Step 3: Implement the types**

In `src/furniture/types.ts`:
- Add to `FurnitureDefBase`: `frontClearance?: number;` (with a one-line doc comment: "Clear floor (m) the layout must preserve in front of this piece; from IKEA design semantics.").
- Add the interfaces `IkeaGlbMaterial`, `IkeaVariant`, `IkeaProductInfo`, `IkeaCompatibility`, `IkeaGltfDef` exactly as in spec §1 (including `typeName?` on `IkeaProductInfo`).
- Extend the union: `export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef | PackGltfDef | IkeaGltfDef;`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikeaTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (adding a union member may surface exhaustive `switch`/narrowing on `GltfDef.source` — if any error appears, add an `ikea` branch that falls through sensibly; note the file for the implementing agent).

- [ ] **Step 6: Commit**

```bash
git add src/furniture/types.ts src/furniture/ikeaTypes.test.ts
git -c commit.gpgsign=false commit -m "feat: add IkeaGltfDef + variant/product-info types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: translate.ts — category map, placement flags, finish labels

**Files:**
- Create: `src/furniture/ikea/translate.ts`
- Test: `src/furniture/ikea/translate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/translate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapCategory, placementFlags, titleCaseFinish } from './translate';

describe('mapCategory', () => {
  it('passes through known app categories', () => {
    expect(mapCategory('beds')).toEqual({ category: 'beds', confidence: 'high' });
    expect(mapCategory('lighting')).toEqual({ category: 'lighting', confidence: 'high' });
  });
  it('maps textiles and outdoor', () => {
    expect(mapCategory('textiles').category).toBe('textiles');
    expect(mapCategory('outdoor').category).toBe('outdoor');
  });
  it('falls back unknown to decor/low', () => {
    expect(mapCategory('spaceships')).toEqual({ category: 'decor', confidence: 'low' });
  });
});

describe('placementFlags', () => {
  it('floor placement → no flags', () => {
    expect(placementFlags({ placement: 'floor', semantics: { back_to_wall: true, front_clearance_m: 0 } }))
      .toEqual({});
  });
  it('wall placement → mounted', () => {
    expect(placementFlags({ placement: 'wall', semantics: {} }).mounted).toBe(true);
  });
  it('ceiling placement → mounted + lifted span', () => {
    const f = placementFlags({ placement: 'ceiling', semantics: {} }, { h: 0.3 });
    expect(f.mounted).toBe(true);
    expect(f.verticalSpan?.base).toBeGreaterThan(0);
  });
  it('no_clip → noClip', () => {
    expect(placementFlags({ placement: 'surface', semantics: { no_clip: true } }).noClip).toBe(true);
  });
  it('keeps positive front_clearance, omits zero', () => {
    expect(placementFlags({ placement: 'floor', semantics: { front_clearance_m: 0.6 } }).frontClearance).toBe(0.6);
    expect(placementFlags({ placement: 'floor', semantics: { front_clearance_m: 0 } }).frontClearance).toBeUndefined();
  });
});

describe('titleCaseFinish', () => {
  it('title-cases a hyphenated finish', () => {
    expect(titleCaseFinish('black-brown')).toBe('Black-brown');
    expect(titleCaseFinish('White stained oak veneer')).toBe('White stained oak veneer');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikea/translate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/translate.ts`:

```ts
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../types';

export interface DesignBlock {
  placement: 'floor' | 'wall' | 'ceiling' | 'surface';
  semantics?: {
    back_to_wall?: boolean;
    front_clearance_m?: number;
    mounted?: boolean;
    no_clip?: boolean;
  };
}

export interface PlacementFlags {
  mounted?: boolean;
  noClip?: boolean;
  verticalSpan?: { base: number; top: number };
  frontClearance?: number;
}

/** Map the scraper's functional category to the app enum. Known categories
 *  (including textiles/outdoor) pass through; anything else → decor/low. */
export function mapCategory(
  scraperCategory: string,
): { category: FurnitureCategory; confidence: 'high' | 'low' } {
  if ((FURNITURE_CATEGORIES as readonly string[]).includes(scraperCategory)) {
    return { category: scraperCategory as FurnitureCategory, confidence: 'high' };
  }
  return { category: 'decor', confidence: 'low' };
}

/** Translate design.placement + semantics into collision flags. `footprint.h`
 *  lifts a ceiling item's vertical span so it hangs near the ceiling. */
export function placementFlags(
  design: DesignBlock,
  footprint?: { h: number },
): PlacementFlags {
  const out: PlacementFlags = {};
  const sem = design.semantics ?? {};
  if (design.placement === 'wall' || design.placement === 'ceiling' || sem.mounted) {
    out.mounted = true;
  }
  if (design.placement === 'ceiling') {
    // Hang from the ceiling: a default Singapore ceiling is ~2.6 m; lift the
    // base so the item sits just under it. Use a conservative base if no height.
    const h = footprint?.h ?? 0.3;
    const base = Math.max(0, 2.6 - h);
    out.verticalSpan = { base, top: base + h };
  }
  if (sem.no_clip) out.noClip = true;
  if (typeof sem.front_clearance_m === 'number' && sem.front_clearance_m > 0) {
    out.frontClearance = sem.front_clearance_m;
  }
  return out;
}

/** Display label for a finish: capitalise the first letter, keep the rest. */
export function titleCaseFinish(finish: string): string {
  if (!finish) return finish;
  return finish.charAt(0).toUpperCase() + finish.slice(1);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikea/translate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/translate.ts src/furniture/ikea/translate.test.ts
git -c commit.gpgsign=false commit -m "feat: IKEA design→app translation (category, placement, finish labels)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: metadata.ts — parse + validate scraper metadata

**Files:**
- Create: `src/furniture/ikea/metadata.ts`
- Test: `src/furniture/ikea/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/metadata.test.ts`. Use a trimmed inline fixture (not the file) so the test is hermetic:

```ts
import { describe, it, expect } from 'vitest';
import { parseMetadata } from './metadata';

const FIXTURE = {
  group_key: 'malm-bed-frame-high-90x200',
  product_name: 'MALM bed frame, high',
  type_name: 'bed frame, high',
  size: '90x200',
  series: 'MALM series',
  style_group: 'International Modern',
  designer: 'Eva',
  description: 'A clean design.',
  good_to_know: ['Mattress sold separately.'],
  category_hierarchy: ['Beds & mattresses', 'Bed frames'],
  design: { category: 'beds', category_confidence: 'high', placement: 'floor',
    semantics: { back_to_wall: true, front_clearance_m: 0 } },
  product_measurements: { Length: '209 cm' },
  compatibility: { accepts_categories: ['Spring mattresses'], size: '90x200', example_products: [] },
  variants: [
    { article_number: '40265178', finish: 'black-brown', url: 'https://x/p/1',
      price_numeral: 204, currency: 'SGD', rating: { value: 4.5, max: 5, count: 45 },
      glb: 'black-brown.glb', footprint: { w: 1.05, d: 2.09, h: 1.0, anchor_offset: [0, 0.5, 0] },
      glb_materials: [{ name: 'material_0', hex: '#ffffff', metallic: 1, roughness: 1, textured: true, sampled_hex: '#504c4b' }],
      glb_segments: [{ mesh: 'model', material: 'material_0' }] },
    { article_number: '20265179', finish: 'White', url: 'https://x/p/2', glb: null },
  ],
};

describe('parseMetadata', () => {
  it('parses a valid group', () => {
    const r = parseMetadata(FIXTURE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.group_key).toBe('malm-bed-frame-high-90x200');
    expect(r.data.variants).toHaveLength(2);
    expect(r.data.variants[1].glb).toBeNull();
  });
  it('rejects missing group_key', () => {
    const r = parseMetadata({ ...FIXTURE, group_key: undefined });
    expect(r.ok).toBe(false);
  });
  it('tolerates unknown extra keys', () => {
    const r = parseMetadata({ ...FIXTURE, some_future_field: 123 });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikea/metadata.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/metadata.ts`:

```ts
import { z } from 'zod';

const GlbMaterialZ = z.object({
  name: z.string(),
  hex: z.string().optional(),
  metallic: z.number().optional(),
  roughness: z.number().optional(),
  textured: z.boolean().optional(),
  sampled_hex: z.string().optional(),
}).passthrough();

const VariantZ = z.object({
  article_number: z.string(),
  finish: z.string(),
  url: z.string(),
  product_title: z.string().optional(),
  price_numeral: z.number().optional(),
  currency: z.string().optional(),
  rating: z.object({ value: z.number(), max: z.number(), count: z.number() }).optional(),
  materials: z.array(z.object({ part: z.string(), composition: z.string() })).optional(),
  care_instructions: z.string().optional(),
  documents: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  main_image_url: z.string().optional(),
  contextual_image_url: z.string().optional(),
  glb: z.string().nullable(),
  footprint: z.object({
    w: z.number(), d: z.number(), h: z.number(),
    anchor_offset: z.tuple([z.number(), z.number(), z.number()]),
  }).optional(),
  glb_materials: z.array(GlbMaterialZ).optional(),
  glb_segments: z.array(z.object({ mesh: z.string(), material: z.string() })).optional(),
}).passthrough();

const DesignZ = z.object({
  category: z.string(),
  category_confidence: z.enum(['high', 'low']).optional(),
  placement: z.enum(['floor', 'wall', 'ceiling', 'surface']),
  semantics: z.object({
    back_to_wall: z.boolean().optional(),
    front_clearance_m: z.number().optional(),
    mounted: z.boolean().optional(),
    no_clip: z.boolean().optional(),
  }).optional(),
}).passthrough();

export const IkeaMetadataZ = z.object({
  group_key: z.string(),
  product_name: z.string(),
  type_name: z.string().optional(),
  size: z.string().nullable().optional(),
  series: z.string().optional(),
  style_group: z.string().optional(),
  designer: z.string().optional(),
  description: z.string().optional(),
  good_to_know: z.array(z.string()).optional(),
  category_hierarchy: z.array(z.string()).optional(),
  design: DesignZ,
  product_measurements: z.record(z.string(), z.string()).optional(),
  compatibility: z.object({
    accepts_categories: z.array(z.string()),
    size: z.string().nullable().optional(),
    example_products: z.array(z.unknown()).optional(),
  }).optional(),
  variants: z.array(VariantZ).min(1),
}).passthrough();

export type IkeaMetadata = z.infer<typeof IkeaMetadataZ>;
export type IkeaMetadataVariant = z.infer<typeof VariantZ>;

export type ParseResult =
  | { ok: true; data: IkeaMetadata }
  | { ok: false; reason: string };

/** True when an object looks like an IKEA group metadata.json (has group_key
 *  and variants) — used to auto-detect the import path. */
export function looksLikeIkeaMetadata(json: unknown): boolean {
  return !!json && typeof json === 'object'
    && typeof (json as { group_key?: unknown }).group_key === 'string'
    && Array.isArray((json as { variants?: unknown }).variants);
}

export function parseMetadata(json: unknown): ParseResult {
  const r = IkeaMetadataZ.safeParse(json);
  if (!r.success) return { ok: false, reason: r.error.issues[0]?.message ?? 'invalid metadata' };
  return { ok: true, data: r.data };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikea/metadata.test.ts`
Expected: PASS

- [ ] **Step 5: Verify against the real fixture (manual sanity, no commit gate)**

Add a temporary test reading the real file is unnecessary in a browser app; instead confirm the inline fixture mirrors the real schema. Skip if confident.

- [ ] **Step 6: Commit**

```bash
git add src/furniture/ikea/metadata.ts src/furniture/ikea/metadata.test.ts
git -c commit.gpgsign=false commit -m "feat: parse + validate IKEA group metadata (zod)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: seedGltfFootprint export

**Files:**
- Modify: `src/furniture/GltfModel.tsx:12-22` (export a seeder)
- Test: `src/furniture/gltfFootprintSeed.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/furniture/gltfFootprintSeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedGltfFootprint, getCachedGltfFootprint } from './GltfModel';

describe('seedGltfFootprint', () => {
  it('seeds a cache entry from footprint + anchor offset', () => {
    seedGltfFootprint('blob:test-1', { w: 1.05, d: 2.09, h: 1.0, anchorOffset: [0.1, 0.5, -0.2] });
    expect(getCachedGltfFootprint('blob:test-1')).toEqual({ w: 1.05, d: 2.09, h: 1.0, ox: 0.1, oz: -0.2 });
  });
  it('does not overwrite an existing entry', () => {
    seedGltfFootprint('blob:test-2', { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] });
    seedGltfFootprint('blob:test-2', { w: 9, d: 9, h: 9, anchorOffset: [0, 0, 0] });
    expect(getCachedGltfFootprint('blob:test-2')?.w).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/gltfFootprintSeed.test.ts`
Expected: FAIL (`seedGltfFootprint` not exported).

- [ ] **Step 3: Implement**

In `src/furniture/GltfModel.tsx`, after `getCachedGltfFootprint`, add:

```ts
/** Pre-seed the footprint cache from known GLB accessor data (e.g. the IKEA
 *  scraper's footprint) so collision is correct before first render. No-op if
 *  the key is already cached. anchorOffset is the local-space center [x,y,z];
 *  only x/z (→ ox/oz) matter for the OBB. */
export function seedGltfFootprint(
  url: string,
  fp: { w: number; d: number; h: number; anchorOffset: [number, number, number] },
): void {
  if (FOOTPRINT_CACHE.has(url)) return;
  FOOTPRINT_CACHE.set(url, {
    w: Math.max(0.05, fp.w),
    d: Math.max(0.05, fp.d),
    h: Math.max(0.05, fp.h),
    ox: fp.anchorOffset[0],
    oz: fp.anchorOffset[2],
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/gltfFootprintSeed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/GltfModel.tsx src/furniture/gltfFootprintSeed.test.ts
git -c commit.gpgsign=false commit -m "feat: export seedGltfFootprint for pre-render collision

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: validateGlbFile optional maxBytes

**Files:**
- Modify: `src/furniture/upload/validate.ts:19`
- Test: `src/furniture/upload/validate.test.ts` (extend if exists, else create)

- [ ] **Step 1: Write the failing test**

Create/extend `src/furniture/upload/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateGlbFile } from './validate';

function glbFile(bytes: number): File {
  const buf = new Uint8Array(bytes);
  new DataView(buf.buffer).setUint32(0, 0x46546c67, true); // 'glTF'
  return new File([buf], 'm.glb', { type: 'model/gltf-binary' });
}

describe('validateGlbFile maxBytes', () => {
  it('rejects above default cap', async () => {
    const r = await validateGlbFile(glbFile(26 * 1024 * 1024));
    expect(r.ok).toBe(false);
  });
  it('accepts above default cap when a larger maxBytes is passed', async () => {
    const r = await validateGlbFile(glbFile(26 * 1024 * 1024), { maxBytes: 50 * 1024 * 1024 });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/upload/validate.test.ts`
Expected: FAIL (second case rejects; `maxBytes` ignored).

- [ ] **Step 3: Implement**

In `validate.ts`, change the signature to `validateGlbFile(file: File, opts?: { maxBytes?: number })` and the cap check to:

```ts
  const maxBytes = opts?.maxBytes ?? MAX_GLB_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, reason: `File too large (${(file.size / 1_048_576).toFixed(1)} MB > ${maxBytes / 1_048_576} MB).` };
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/upload/validate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/upload/validate.ts src/furniture/upload/validate.test.ts
git -c commit.gpgsign=false commit -m "feat: optional maxBytes for IKEA GLB validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: importGroup.ts — build def, write blobs, seed cache

**Files:**
- Create: `src/furniture/ikea/importGroup.ts`
- Test: `src/furniture/ikea/importGroup.test.ts`

**Context the implementer needs:**
- `IdbAssetStore.put({ assetId, kind:'gltf', mime, name, uploadedAt, blob, meta })` (see `src/state/storage/IdbAssetStore.ts`).
- The store action `useStore.getState().addUserFurniture(def)` accepts a `UserGltfDef`; **widen its type** to `UserGltfDef | IkeaGltfDef` (Task 8a below, do first).
- Existing tests stub IDB; look at `src/furniture/catalogUserDefs.test.ts` for the IDB-mock pattern and reuse it.
- `crypto.randomUUID` id pattern is in `persist.ts`.

### Task 8a: widen the user-furniture slice to accept IkeaGltfDef

- [ ] **Step 1:** In `src/state/slices/userAssetsSlice.ts`, change `UserGltfDef` references in the slice interface (`userFurniture: UserGltfDef[]`, `addUserFurniture`, `removeUserFurniture` cleanup, `setUserFurniture`) to `UserGltfDef | IkeaGltfDef`. Import `IkeaGltfDef`. In `removeUserFurniture`'s cleanup, `def.runtimeUrl` exists on UserGltfDef but not IkeaGltfDef — guard with `'runtimeUrl' in def && def.runtimeUrl`, and for IKEA, revoke each `variant.runtimeUrl` and delete each non-null `variant.assetId`. For the assetId delete, branch: `'assetId' in def && def.assetId` for user; for IKEA iterate variants.

- [ ] **Step 2:** Update `src/furniture/catalog.ts`: `resolveUserDefFootprint(def: UserGltfDef)` — leave it for user defs; add a separate branch so IKEA defs are merged without going through the user-only resolver (call a new `resolveIkeaDefFootprint(def)` that reads the active variant's `runtimeUrl` for the cache and seeds `defaultFootprint` from it if cached, else keeps the def's seeded footprint). Add `export function isIkeaDef(def: FurnitureDef): def is IkeaGltfDef { return def.kind === 'gltf' && def.source === 'ikea'; }`. In both `useCatalog` and `useCatalogByCategory`, change the user loop to branch: `isIkeaDef(def) ? resolveIkeaDefFootprint(def) : resolveUserDefFootprint(def)`.

- [ ] **Step 3:** Typecheck. Run `npx tsc --noEmit`. Expected PASS.

- [ ] **Step 4: Commit**

```bash
git add src/state/slices/userAssetsSlice.ts src/furniture/catalog.ts
git -c commit.gpgsign=false commit -m "refactor: user-furniture slice + catalog accept IkeaGltfDef

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8b: importGroup

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/importGroup.test.ts`. Mock `IdbAssetStore` and the store; build `File[]` from the inline fixture's variants:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const put = vi.fn().mockResolvedValue(undefined);
vi.mock('../../state/storage/IdbAssetStore', () => ({
  IdbAssetStore: { put: (...a: unknown[]) => put(...a), delete: vi.fn() },
}));
const added: unknown[] = [];
vi.mock('../../state/store', () => ({
  useStore: { getState: () => ({ addUserFurniture: (d: unknown) => added.push(d), userFurniture: [] }) },
}));

import { importGroup } from './importGroup';
import { parseMetadata } from './metadata';

const META = { /* same FIXTURE object as metadata.test.ts */ } as const;

function glb(name: string): File {
  const buf = new Uint8Array(64);
  new DataView(buf.buffer).setUint32(0, 0x46546c67, true);
  return new File([buf], name, { type: 'model/gltf-binary' });
}

beforeEach(() => { put.mockClear(); added.length = 0; });

describe('importGroup', () => {
  it('builds a def with one crawled variant + one stub, writes one blob', async () => {
    const parsed = parseMetadata(META);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const files = [glb('black-brown.glb')]; // white.glb is a stub (glb:null)
    const r = await importGroup(parsed.data, files);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.def.source).toBe('ikea');
    expect(r.def.variants).toHaveLength(2);
    expect(r.def.variants[0].assetId).toBeTruthy();
    expect(r.def.variants[1].assetId).toBeNull();
    expect(r.def.activeVariant).toBe('black-brown');
    expect(r.def.category).toBe('beds');
    expect(r.def.defaultFootprint.d).toBeCloseTo(2.09, 2);
    expect(put).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(1);
  });
  it('fails when no crawled variant has a matching file', async () => {
    const parsed = parseMetadata(META);
    if (!parsed.ok) return;
    const r = await importGroup(parsed.data, []); // no files
    expect(r.ok).toBe(false);
  });
});
```

(Copy the same FIXTURE used in `metadata.test.ts` into `META`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikea/importGroup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/importGroup.ts`:

```ts
import type { IkeaGltfDef, IkeaVariant, IkeaProductInfo, IkeaGlbMaterial } from '../types';
import type { IkeaMetadata, IkeaMetadataVariant } from './metadata';
import { IdbAssetStore } from '../../state/storage/IdbAssetStore';
import { useStore } from '../../state/store';
import { validateGlbFile } from '../upload/validate';
import { seedGltfFootprint } from '../GltfModel';
import { mapCategory, placementFlags, titleCaseFinish } from './translate';

const IKEA_MAX_BYTES = 50 * 1024 * 1024;

export type ImportGroupResult =
  | { ok: true; def: IkeaGltfDef }
  | { ok: false; reason: string };

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `asset-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function matsFrom(v: IkeaMetadataVariant): IkeaGlbMaterial[] {
  return (v.glb_materials ?? []).map((m) => ({
    name: m.name,
    hex: m.hex ?? '#ffffff',
    metallic: m.metallic ?? 1,
    roughness: m.roughness ?? 1,
    textured: m.textured ?? false,
    sampledHex: m.sampled_hex,
  }));
}

function fileByBasename(files: File[], basename: string): File | undefined {
  return files.find((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return (path.split('/').pop() ?? f.name) === basename;
  });
}

/** Build + register one IkeaGltfDef from parsed metadata + the group's files.
 *  Writes each crawled finish's GLB to IDB; stub finishes (glb:null) become
 *  greyed variants. Pre-seeds the active variant's footprint cache. */
export async function importGroup(meta: IkeaMetadata, files: File[]): Promise<ImportGroupResult> {
  const { category, confidence } = mapCategory(meta.design.category);
  const activeMeta = meta.variants.find((v) => v.glb);
  const activeFootprint = activeMeta?.footprint;
  const flags = placementFlags(meta.design, activeFootprint ? { h: activeFootprint.h } : undefined);

  const variants: IkeaVariant[] = [];
  let wroteOne = false;
  for (const v of meta.variants) {
    let assetId: string | null = null;
    let runtimeUrl: string | undefined;
    if (v.glb) {
      const file = fileByBasename(files, v.glb);
      if (file) {
        const valid = await validateGlbFile(file, { maxBytes: IKEA_MAX_BYTES });
        if (valid.ok) {
          assetId = newId();
          const blob = new Blob([await file.arrayBuffer()], { type: valid.mime });
          await IdbAssetStore.put({
            assetId, kind: 'gltf', mime: valid.mime, name: `${meta.product_name} — ${v.finish}`,
            uploadedAt: new Date().toISOString(), blob,
            meta: { source: 'ikea', groupKey: meta.group_key, articleNumber: v.article_number, finish: v.finish },
          });
          runtimeUrl = URL.createObjectURL(blob);
          wroteOne = true;
        }
      }
    }
    variants.push({
      finish: v.finish,
      label: titleCaseFinish(v.finish),
      articleNumber: v.article_number,
      url: v.url,
      assetId,
      runtimeUrl,
      price: v.price_numeral,
      currency: v.currency,
      swatchHex: v.glb_materials?.[0]?.sampled_hex,
      footprint: v.footprint
        ? { w: v.footprint.w, d: v.footprint.d, h: v.footprint.h, anchorOffset: v.footprint.anchor_offset }
        : undefined,
      glbMaterials: matsFrom(v),
    });
  }

  if (!wroteOne) return { ok: false, reason: 'No crawled GLB file matched the metadata variants.' };

  const active = variants.find((v) => v.assetId)!;
  if (active.runtimeUrl && active.footprint) seedGltfFootprint(active.runtimeUrl, active.footprint);

  const fp = active.footprint ?? { w: 1, d: 1, h: 1, anchorOffset: [0, 0, 0] as [number, number, number] };
  const productInfo: IkeaProductInfo = {
    series: meta.series, styleGroup: meta.style_group, typeName: meta.type_name,
    designer: meta.designer, description: meta.description, goodToKnow: meta.good_to_know,
    categoryHierarchy: meta.category_hierarchy, size: meta.size ?? undefined,
    productMeasurements: meta.product_measurements,
    materials: activeMeta?.materials, careInstructions: activeMeta?.care_instructions,
    documents: activeMeta?.documents, rating: activeMeta?.rating,
    mainImageUrl: activeMeta?.main_image_url, contextualImageUrl: activeMeta?.contextual_image_url,
    categoryConfidence: meta.design.category_confidence ?? confidence,
  };

  const def: IkeaGltfDef = {
    id: `ikea-${meta.group_key}`,
    name: meta.product_name,
    category,
    kind: 'gltf',
    source: 'ikea',
    groupKey: meta.group_key,
    activeVariant: active.finish,
    variants,
    defaultFootprint: { w: fp.w, d: fp.d, h: fp.h },
    ...(flags.mounted ? { mounted: true } : {}),
    ...(flags.noClip ? { noClip: true } : {}),
    ...(flags.verticalSpan ? { verticalSpan: flags.verticalSpan } : {}),
    ...(flags.frontClearance ? { frontClearance: flags.frontClearance } : {}),
    productInfo,
    compatibility: meta.compatibility
      ? { acceptsCategories: meta.compatibility.accepts_categories, size: meta.compatibility.size ?? undefined }
      : undefined,
    uploadedAt: new Date().toISOString(),
    license: 'IKEA',
    attribution: 'IKEA — imported model',
    sourceUrl: active.url,
  };

  // Replace an existing import of the same group (dedupe by id).
  const existing = useStore.getState().userFurniture.find((d) => d.id === def.id);
  if (existing) useStore.getState().removeUserFurniture(def.id);
  useStore.getState().addUserFurniture(def);
  return { ok: true, def };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikea/importGroup.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/furniture/ikea/importGroup.ts src/furniture/ikea/importGroup.test.ts
git -c commit.gpgsign=false commit -m "feat: importGroup builds IkeaGltfDef + writes variant blobs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Save-schema round-trip for IkeaGltfDef

**Files:**
- Modify: `src/state/schema.ts:31-49` (add `IkeaGltfDefZ`), `:117` (`userFurniture` array union), `:174-188` (serialize)
- Test: `src/state/schema.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

In `src/state/schema.test.ts`, add:

```ts
it('round-trips an IkeaGltfDef and strips variant runtime URLs', () => {
  const def = {
    id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
    groupKey: 'malm', activeVariant: 'black-brown',
    variants: [{ finish: 'black-brown', label: 'Black-brown', articleNumber: '1', url: 'https://x',
      assetId: 'a1', runtimeUrl: 'blob:should-be-stripped', price: 204, swatchHex: '#504c4b',
      footprint: { w: 1, d: 2, h: 1, anchorOffset: [0, 0.5, 0] },
      glbMaterials: [{ name: 'material_0', hex: '#fff', metallic: 1, roughness: 1, textured: true }] }],
    defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: '2026-05-31T00:00:00Z',
    license: 'IKEA', attribution: 'IKEA — imported model', sourceUrl: 'https://x',
  };
  const state = { /* minimal RootState with userFurniture: [def], userMaterials: [], items: [], ... */ } as any;
  const ser = serialize(state);
  const reparsed = SerializedStateZ.parse(JSON.parse(JSON.stringify(ser)));
  const out = reparsed.userFurniture.find((d: any) => d.id === 'ikea-malm');
  expect(out).toBeTruthy();
  expect(out.variants[0].runtimeUrl).toBeUndefined();
  expect(out.variants[0].assetId).toBe('a1');
});
```

(Follow the existing schema.test.ts helpers for building a `state`; reuse its existing `serialize` import and minimal-state factory if one exists.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state/schema.test.ts`
Expected: FAIL (Zod rejects the `source:'ikea'` def; or serialize drops it).

- [ ] **Step 3: Implement**

In `schema.ts`:
- Add `IkeaGltfDefZ`:

```ts
const IkeaVariantZ = z.object({
  finish: z.string(), label: z.string(), articleNumber: z.string(), url: z.string(),
  assetId: z.string().nullable(),
  price: z.number().optional(), currency: z.string().optional(), swatchHex: z.string().optional(),
  footprint: z.object({ w: z.number(), d: z.number(), h: z.number(),
    anchorOffset: z.tuple([z.number(), z.number(), z.number()]) }).optional(),
  glbMaterials: z.array(z.object({
    name: z.string(), hex: z.string(), metallic: z.number(), roughness: z.number(),
    textured: z.boolean(), sampledHex: z.string().optional() })),
}); // note: runtimeUrl intentionally omitted

const IkeaGltfDefZ = z.object({
  id: z.string(), name: z.string(), category: z.string(),
  kind: z.literal('gltf'), source: z.literal('ikea'),
  groupKey: z.string(), activeVariant: z.string(), variants: z.array(IkeaVariantZ),
  defaultFootprint: z.object({ w: z.number(), d: z.number(), h: z.number() }),
  verticalSpan: z.object({ base: z.number(), top: z.number() }).optional(),
  mounted: z.boolean().optional(), noClip: z.boolean().optional(),
  frontClearance: z.number().optional(),
  productInfo: z.record(z.string(), z.unknown()).optional(),
  compatibility: z.object({ acceptsCategories: z.array(z.string()), size: z.string().optional() }).optional(),
  uploadedAt: z.string(), license: z.literal('IKEA'),
  attribution: z.string(), sourceUrl: z.string().optional(),
});
```

(For `productInfo`, a permissive `z.record(...).optional()` avoids re-declaring the whole nested shape; refine later if needed.)

- Change the `userFurniture` field in `RawSerializedStateZ` to `z.array(z.union([UserGltfDefZ, IkeaGltfDefZ]))`.
- In `serialize()`, map `userFurniture` with a branch: if `source === 'ikea'`, emit all IKEA fields but strip each variant's `runtimeUrl` (`variants: d.variants.map(({ runtimeUrl, ...v }) => v)`); else emit the existing UserGltfDef shape. Keep the existing UserGltfDef mapping for `source==='user'`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/state/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/state/schema.ts src/state/schema.test.ts
git -c commit.gpgsign=false commit -m "feat: round-trip IkeaGltfDef through the save schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Hydrate IKEA variant runtime URLs on boot

**Files:**
- Modify: `src/state/storage/hydrateAssets.ts`
- Test: `src/state/storage/hydrateIkea.test.ts` (create)

**Context:** After the layout save is applied, `state.userFurniture` already holds the IKEA defs (no runtime URLs). This step looks up each variant's blob by `assetId` and sets `runtimeUrl`, then seeds the active variant's footprint. The current `hydrateUserAssets` rebuilds *user* defs from IDB metas — IKEA defs come from the layout schema instead, so this is a separate resolver. Add `resolveIkeaRuntimeUrls()` and call it after the layout has been applied (check `hydrate.ts` for ordering; it must run after `setUserFurniture`/layout apply). If the layout apply happens after `hydrateUserAssets`, expose `resolveIkeaRuntimeUrls` and call it from `hydrate.ts` once the store's `userFurniture` is populated.

- [ ] **Step 1: Write the failing test**

Create `src/state/storage/hydrateIkea.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

const blob = new Blob([new Uint8Array(8)], { type: 'model/gltf-binary' });
vi.mock('./IdbAssetStore', () => ({
  IdbAssetStore: { get: vi.fn(async (id: string) => (id === 'a1' ? { assetId: 'a1', blob } : null)) },
}));

import { resolveIkeaRuntimeUrls } from './hydrateAssets';
import type { IkeaGltfDef } from '../../furniture/types';

describe('resolveIkeaRuntimeUrls', () => {
  it('sets runtimeUrl for variants with an assetId, leaves stubs null', async () => {
    // jsdom needs URL.createObjectURL
    (URL as any).createObjectURL = vi.fn(() => 'blob:resolved');
    const def: IkeaGltfDef = {
      id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
      groupKey: 'malm', activeVariant: 'bb',
      variants: [
        { finish: 'bb', label: 'BB', articleNumber: '1', url: 'u', assetId: 'a1',
          footprint: { w: 1, d: 2, h: 1, anchorOffset: [0, 0.5, 0] }, glbMaterials: [] },
        { finish: 'white', label: 'White', articleNumber: '2', url: 'u', assetId: null, glbMaterials: [] },
      ],
      defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
    };
    const [out] = await resolveIkeaRuntimeUrls([def]);
    expect(out.variants[0].runtimeUrl).toBe('blob:resolved');
    expect(out.variants[1].runtimeUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/state/storage/hydrateIkea.test.ts`
Expected: FAIL (`resolveIkeaRuntimeUrls` not exported).

- [ ] **Step 3: Implement**

In `hydrateAssets.ts`, add and export:

```ts
import { seedGltfFootprint } from '../../furniture/GltfModel';
import type { IkeaGltfDef } from '../../furniture/types';

/** Re-attach runtime blob URLs to persisted IKEA defs (their binaries live in
 *  IDB by assetId; the def itself comes from the layout save). Seeds the active
 *  variant's footprint cache so collision is correct before first render. */
export async function resolveIkeaRuntimeUrls(defs: IkeaGltfDef[]): Promise<IkeaGltfDef[]> {
  if (typeof indexedDB === 'undefined') return defs;
  const out: IkeaGltfDef[] = [];
  for (const def of defs) {
    const variants = await Promise.all(def.variants.map(async (v) => {
      if (!v.assetId) return v;
      const rec = await IdbAssetStore.get(v.assetId).catch(() => null);
      if (!rec) return v;
      return { ...v, runtimeUrl: URL.createObjectURL(rec.blob) };
    }));
    const resolved = { ...def, variants };
    const active = variants.find((v) => v.finish === def.activeVariant) ?? variants.find((v) => v.runtimeUrl);
    if (active?.runtimeUrl && active.footprint) seedGltfFootprint(active.runtimeUrl, active.footprint);
    out.push(resolved);
  }
  return out;
}
```

- [ ] **Step 4:** Wire it into boot. In `src/state/storage/hydrate.ts`, after the layout is applied and `userFurniture` is in the store, split user vs ikea, resolve IKEA URLs, and write back:

```ts
const all = useStore.getState().userFurniture;
const ikea = all.filter((d): d is IkeaGltfDef => d.kind === 'gltf' && d.source === 'ikea');
if (ikea.length) {
  const resolved = await resolveIkeaRuntimeUrls(ikea).catch(() => ikea);
  const byId = new Map(resolved.map((d) => [d.id, d] as const));
  useStore.getState().setUserFurniture(all.map((d) => byId.get(d.id) ?? d));
}
```

(Import `IkeaGltfDef` + `resolveIkeaRuntimeUrls`. Place this after the autosave/layout apply step — read `hydrate.ts` to find the right point; if the layout apply is later than `hydrateUserAssets`, put this block right after that apply.)

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `npx vitest run src/state/storage/hydrateIkea.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/state/storage/hydrateAssets.ts src/state/storage/hydrate.ts src/state/storage/hydrateIkea.test.ts
git -c commit.gpgsign=false commit -m "feat: re-resolve IKEA variant runtime URLs on boot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Render the active variant

**Files:**
- Modify: `src/furniture/Furniture.tsx:96-114`
- Test: `src/furniture/ikeaRender.test.tsx` (create — a thin unit test of the URL/override selection helper)

**Approach:** Extract the GLTF body's URL + override selection into a pure helper so it's testable without rendering Three.js.

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikeaRender.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectGltfRender } from './gltfRender';
import type { FurnitureItem, IkeaGltfDef } from './types';

const def: IkeaGltfDef = {
  id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea',
  groupKey: 'malm', activeVariant: 'bb',
  variants: [
    { finish: 'bb', label: 'BB', articleNumber: '1', url: 'u', assetId: 'a1', runtimeUrl: 'blob:bb', glbMaterials: [] },
    { finish: 'white', label: 'White', articleNumber: '2', url: 'u', assetId: 'a2', runtimeUrl: 'blob:white', glbMaterials: [] },
    { finish: 'oak', label: 'Oak', articleNumber: '3', url: 'u', assetId: null, glbMaterials: [] },
  ],
  defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
};

function item(props: Record<string, string | number> = {}): FurnitureItem {
  return { id: 'i1', defId: def.id, position: [0, 0], rotation: 0, props };
}

describe('selectGltfRender (ikea)', () => {
  it('uses default variant URL when no props.variant', () => {
    expect(selectGltfRender(item(), def)?.url).toBe('blob:bb');
  });
  it('uses props.variant URL when set + crawled', () => {
    expect(selectGltfRender(item({ variant: 'white' }), def)?.url).toBe('blob:white');
  });
  it('falls back to default when props.variant is a stub', () => {
    expect(selectGltfRender(item({ variant: 'oak' }), def)?.url).toBe('blob:bb');
  });
  it('composes finishOverrides from finish:<name> props', () => {
    const r = selectGltfRender(item({ 'finish:material_0': '#abcdef' }), def);
    expect(r?.finishOverrides).toEqual({ material_0: '#abcdef' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikeaRender.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

Create `src/furniture/gltfRender.ts`:

```ts
import { isIkeaDef } from './catalog';
import type { FurnitureItem, GltfDef } from './types';

export interface GltfRender {
  url: string;
  scale: number;
  tint?: string;
  finishOverrides?: Record<string, string>;
}

/** Resolve which URL + per-component overrides a GLTF item should render with.
 *  Returns null when no URL is resolvable (e.g. unhydrated). */
export function selectGltfRender(item: FurnitureItem, def: GltfDef): GltfRender | null {
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : def.scale) ?? 1;
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : undefined;

  if (isIkeaDef(def)) {
    const wanted = typeof item.props['variant'] === 'string' ? item.props['variant'] : def.activeVariant;
    const byWanted = def.variants.find((v) => v.finish === wanted && v.runtimeUrl);
    const active = byWanted ?? def.variants.find((v) => v.finish === def.activeVariant && v.runtimeUrl)
      ?? def.variants.find((v) => v.runtimeUrl);
    if (!active?.runtimeUrl) return null;
    const finishOverrides: Record<string, string> = {};
    for (const [k, val] of Object.entries(item.props)) {
      if (k.startsWith('finish:') && typeof val === 'string') finishOverrides[k.slice('finish:'.length)] = val;
    }
    return {
      url: active.runtimeUrl, scale, tint,
      finishOverrides: Object.keys(finishOverrides).length ? finishOverrides : undefined,
    };
  }

  const url = def.source === 'builtin' ? def.url : def.runtimeUrl;
  if (!url) return null;
  return { url, scale, tint, finishOverrides: 'finishOverrides' in def ? def.finishOverrides : undefined };
}
```

- [ ] **Step 4:** Use it in `Furniture.tsx`. Replace the GLTF IIFE (lines ~98-113) with:

```tsx
        {(() => {
          const r = selectGltfRender(item, def as GltfDef);
          if (!r) return null;
          return <GltfModel url={r.url} scale={r.scale} tint={r.tint} finishOverrides={r.finishOverrides} />;
        })()}
```

Add `import { selectGltfRender } from './gltfRender';` and `import type { GltfDef } from './types';` (or reuse existing type import).

- [ ] **Step 5: Run helper test + full suite + typecheck**

Run: `npx vitest run src/furniture/ikeaRender.test.ts && npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/furniture/gltfRender.ts src/furniture/ikeaRender.test.ts src/furniture/Furniture.tsx
git -c commit.gpgsign=false commit -m "feat: render IKEA active variant + per-component overrides

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Auto-arrange roles for IKEA + new categories

**Files:**
- Modify: `src/layout/autoArrange.ts:109-111` (roleOf) + call sites passing defId
- Test: `src/layout/autoArrangeRole.test.ts` (create)

**Context:** `roleOf(defId: string)` looks up `ROLE[defId]`. IKEA defIds (`ikea-…`) aren't in `ROLE`, and the new categories have no fallback. Change `roleOf` to take the def so it can fall back by category. Find every `roleOf(...)` call (grep) and pass the def — most call sites already have the def or item+catalog nearby; if a call site only has defId, look the def up from the room items it already iterates.

- [ ] **Step 1: Write the failing test**

Create `src/layout/autoArrangeRole.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleForCategory } from './autoArrange';

describe('roleForCategory', () => {
  it('maps categories to sensible arrange roles', () => {
    expect(roleForCategory('beds')).toBe('bed');
    expect(roleForCategory('storage')).toBe('storage');
    expect(roleForCategory('seating')).toBe('seating');
    expect(roleForCategory('textiles')).toBe('rug');
    expect(roleForCategory('outdoor')).toBe('other');
    expect(roleForCategory('decor')).toBe('other');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/layout/autoArrangeRole.test.ts`
Expected: FAIL (`roleForCategory` not exported).

- [ ] **Step 3: Implement**

In `autoArrange.ts`, add and export a category→role fallback, and have `roleOf` use it:

```ts
import type { FurnitureCategory, FurnitureDef } from '../furniture/types';

export function roleForCategory(cat: FurnitureCategory): ArrangeRole {
  switch (cat) {
    case 'beds': return 'bed';
    case 'storage': return 'storage';
    case 'appliances': return 'storage';
    case 'seating': return 'seating';
    case 'textiles': return 'rug';
    default: return 'other';
  }
}

function roleOf(def: Pick<FurnitureDef, 'id' | 'category'>): ArrangeRole {
  return ROLE[def.id] ?? roleForCategory(def.category);
}
```

Update every `roleOf(...)` call to pass the def (or `{ id, category }`). In the body where the code iterates room items it already has `def`/catalog; for the inline `roleOf(it.defId)` calls (e.g. lines ~387, ~396, ~410), look up the def via the catalog the function already receives, or pass `{ id: it.defId, category: getDef(catalog, it.defId)?.category ?? 'decor' }`. Check the function's existing parameters for a catalog/def map; reuse it.

- [ ] **Step 4: Run to verify it passes + typecheck + full suite**

Run: `npx vitest run src/layout/autoArrangeRole.test.ts && npx tsc --noEmit && npm test`
Expected: PASS (the existing autoArrange tests must still pass — if a call site can't reach a def, that's the place to thread the catalog through; do not weaken existing behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/layout/autoArrange.ts src/layout/autoArrangeRole.test.ts
git -c commit.gpgsign=false commit -m "feat: category-fallback arrange roles (covers IKEA + textiles/outdoor)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Front-clearance in clearance checks

**Files:**
- Modify: `src/layout/clearance.ts`
- Test: `src/layout/clearance.test.ts` (extend or create)

**Context:** `frontClearance` (metres, on the def) is the keep-clear strip in front of a piece. Read `clearance.ts` to see how door/storage clearance rects are built; add a function that yields a keep-clear rect in front of any item whose def has `frontClearance > 0`, oriented by the item's rotation (front = local +Z, the primitive facing convention).

- [ ] **Step 1: Write the failing test**

Create/extend `src/layout/clearance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { frontClearanceRect } from './clearance';
import type { FurnitureItem, FurnitureDef } from '../furniture/types';

const def = { id: 'x', name: 'x', category: 'storage', kind: 'parametric', primitive: 'Sideboard',
  paramSchema: [], defaultFootprint: { w: 1, d: 0.4, h: 0.8 }, frontClearance: 0.75 } as unknown as FurnitureDef;

describe('frontClearanceRect', () => {
  it('returns a rect in front (local +Z) for a forward-facing item', () => {
    const item: FurnitureItem = { id: 'i', defId: 'x', position: [2, 3], rotation: 0, props: {} };
    const rect = frontClearanceRect(item, def);
    expect(rect).not.toBeNull();
    // +Z front at rotation 0 → rect centre z greater than item z
    expect(rect!.cz).toBeGreaterThan(3);
    expect(rect!.depth).toBeCloseTo(0.75, 2);
  });
  it('returns null when no frontClearance', () => {
    const item: FurnitureItem = { id: 'i', defId: 'x', position: [0, 0], rotation: 0, props: {} };
    const bare = { ...def, frontClearance: undefined } as FurnitureDef;
    expect(frontClearanceRect(item, bare)).toBeNull();
  });
});
```

(Match the actual Rect shape used in `clearance.ts` — if it uses `{x0,z0,x1,z1}` instead of `{cx,cz,width,depth}`, adapt the test + impl to that shape. Read the file first.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/layout/clearance.test.ts`
Expected: FAIL (`frontClearanceRect` not exported).

- [ ] **Step 3: Implement**

Add `frontClearanceRect(item, def)` to `clearance.ts` returning the keep-clear rect (in the same Rect shape the module already uses), or `null` when `def.frontClearance` is falsy. Orient the strip along the item's facing: front is local +Z rotated by `item.rotation`. Reuse any existing footprint/OBB helper in the file. Wire the rect into the existing clearance-overlay / blocked-item check so a violation is reported alongside door/storage clearances (follow how `doorSwingRects`/storage rects are consumed by `ClearanceOverlay`).

- [ ] **Step 4: Run to verify it passes + typecheck**

Run: `npx vitest run src/layout/clearance.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/layout/clearance.ts src/layout/clearance.test.ts
git -c commit.gpgsign=false commit -m "feat: front-clearance keep-clear rect from def.frontClearance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Def-level pricing

**Files:**
- Modify: `src/furniture/furniturePrices.ts:93-95`
- Modify: `src/ui/BudgetPanel.tsx:45`, `src/ui/report.ts:39`
- Test: `src/furniture/furniturePrices.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/furniture/furniturePrices.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { itemPrice } from './furniturePrices';
import type { FurnitureDef, IkeaGltfDef } from './types';

const ikea: IkeaGltfDef = {
  id: 'ikea-malm', name: 'MALM', category: 'beds', kind: 'gltf', source: 'ikea', groupKey: 'malm',
  activeVariant: 'bb',
  variants: [{ finish: 'bb', label: 'BB', articleNumber: '1', url: 'u', assetId: 'a1', price: 204, glbMaterials: [] }],
  defaultFootprint: { w: 1, d: 2, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
};

describe('itemPrice', () => {
  it('uses the IKEA active-variant price', () => {
    expect(itemPrice(ikea, 'beds')).toBe(204);
  });
  it('falls back to per-item then category for non-IKEA', () => {
    const bed = { id: 'bed-queen', category: 'beds' } as FurnitureDef;
    expect(itemPrice(bed, 'beds')).toBe(900); // ITEM_PRICE['bed-queen']
    const unknown = { id: 'nope', category: 'tables' } as FurnitureDef;
    expect(itemPrice(unknown, 'tables')).toBe(240); // CATEGORY_BASE.tables
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/furniturePrices.test.ts`
Expected: FAIL (`itemPrice` takes `(defId, category)` not a def).

- [ ] **Step 3: Implement**

Change `itemPrice`:

```ts
import type { FurnitureCategory, FurnitureDef } from './types';

export function itemPrice(def: Pick<FurnitureDef, 'id' | 'category'> & Partial<FurnitureDef>, category: FurnitureCategory): number {
  if (def.kind === 'gltf' && def.source === 'ikea') {
    const active = def.variants.find((v) => v.finish === def.activeVariant) ?? def.variants[0];
    if (typeof active?.price === 'number') return active.price;
  }
  return ITEM_PRICE[def.id] ?? CATEGORY_BASE[category] ?? 100;
}
```

Update call sites:
- `BudgetPanel.tsx:45` — `const each = itemPrice(def, cat);`
- `report.ts:39` — `const each = itemPrice(def, def.category);`

- [ ] **Step 4: Run to verify it passes + typecheck + full suite**

Run: `npx vitest run src/furniture/furniturePrices.test.ts && npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/furniturePrices.ts src/ui/BudgetPanel.tsx src/ui/report.ts src/furniture/furniturePrices.test.ts
git -c commit.gpgsign=false commit -m "feat: def-level pricing (IKEA variant price beats category fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Compatibility resolver (port compatibility.py)

**Files:**
- Create: `src/furniture/ikea/compatibility.ts`
- Test: `src/furniture/ikea/compatibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/compatibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCompatible } from './compatibility';
import type { IkeaGltfDef } from '../types';

function group(id: string, opts: Partial<IkeaGltfDef> & {
  accepts?: string[]; size?: string; hierarchy?: string[]; typeName?: string; crawled?: boolean;
}): IkeaGltfDef {
  return {
    id: `ikea-${id}`, name: id, category: 'beds', kind: 'gltf', source: 'ikea', groupKey: id,
    activeVariant: 'a',
    variants: [{ finish: 'a', label: 'A', articleNumber: '1', url: 'u',
      assetId: opts.crawled === false ? null : 'x', glbMaterials: [] }],
    defaultFootprint: { w: 1, d: 1, h: 1 }, uploadedAt: 'x', license: 'IKEA', attribution: 'IKEA',
    productInfo: { categoryHierarchy: opts.hierarchy, typeName: opts.typeName, size: opts.size },
    compatibility: opts.accepts ? { acceptsCategories: opts.accepts, size: opts.size } : undefined,
  };
}

const bed = group('malm-bed', { accepts: ['Spring mattresses', 'Slatted bed bases'], size: '90x200' });
const mattressFit = group('valevag-mattress', { hierarchy: ['Mattresses', 'Spring mattresses'], size: '90x200' });
const mattressWrongSize = group('big-mattress', { hierarchy: ['Spring mattresses'], size: '150x200' });
const base = group('loenset-base', { hierarchy: ['Slatted bed bases'], size: '90x200' });
const lamp = group('lamp', { hierarchy: ['Lighting'], typeName: 'lamp' });
const uncrawled = group('ghost-mattress', { hierarchy: ['Spring mattresses'], size: '90x200', crawled: false });

describe('resolveCompatible', () => {
  it('matches a same-size mattress + base, by accepted category', () => {
    const out = resolveCompatible(bed, [bed, mattressFit, mattressWrongSize, base, lamp, uncrawled]);
    const springs = out['Spring mattresses'].map((g) => g.def.groupKey);
    expect(springs).toContain('valevag-mattress');
    expect(springs).not.toContain('big-mattress');   // wrong size
    expect(springs).not.toContain('ghost-mattress');  // no GLB
    expect(out['Slatted bed bases'].map((g) => g.def.groupKey)).toContain('loenset-base');
  });
  it('excludes the active group and non-matching categories', () => {
    const out = resolveCompatible(bed, [bed, lamp]);
    expect(Object.values(out).flat()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikea/compatibility.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/compatibility.ts`, porting `python/scripts/compatibility.py`:

```ts
import type { IkeaGltfDef } from '../types';

function norm(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function depluralize(phrase: string): string {
  return norm(phrase).split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Category labels a product can be matched against: breadcrumb names + typeName. */
export function productCategories(def: IkeaGltfDef): Set<string> {
  const labels = new Set<string>();
  for (const crumb of def.productInfo?.categoryHierarchy ?? []) labels.add(norm(crumb));
  if (def.productInfo?.typeName) labels.add(norm(def.productInfo.typeName));
  return labels;
}

export function categoryMatches(acceptsCategory: string, labels: Set<string>): boolean {
  const want = depluralize(acceptsCategory);
  for (const label of labels) {
    const lab = depluralize(label);
    if (want === lab) return true;
    const re = new RegExp(`(?:^|\\W)${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`);
    if (re.test(lab)) return true;
  }
  return false;
}

function hasCrawledVariant(def: IkeaGltfDef): boolean {
  return def.variants.some((v) => v.assetId);
}

export interface CompatibleMatch {
  def: IkeaGltfDef;
  finishes: { finish: string; label: string }[];
}

/** Groups in `catalog` compatible with `active`, keyed by accepted category.
 *  Size-gated (when both declare a size); skips the active group and any group
 *  with no crawled variant. Ported from compatibility.py. */
export function resolveCompatible(
  active: IkeaGltfDef,
  catalog: IkeaGltfDef[],
): Record<string, CompatibleMatch[]> {
  const accepts = active.compatibility?.acceptsCategories ?? [];
  const wantSize = active.compatibility?.size;
  const out: Record<string, CompatibleMatch[]> = {};
  for (const cat of accepts) out[cat] = [];

  for (const def of catalog) {
    if (def.groupKey === active.groupKey) continue;
    if (!hasCrawledVariant(def)) continue;
    const labels = productCategories(def);
    const gsize = def.productInfo?.size;
    for (const cat of accepts) {
      if (!categoryMatches(cat, labels)) continue;
      if (wantSize && gsize && wantSize !== gsize) continue;
      out[cat].push({
        def,
        finishes: def.variants.filter((v) => v.assetId).map((v) => ({ finish: v.finish, label: v.label })),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikea/compatibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/furniture/ikea/compatibility.ts src/furniture/ikea/compatibility.test.ts
git -c commit.gpgsign=false commit -m "feat: port IKEA compatibility resolver to TS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: SourceLine + InspectorPanel IKEA attribution

**Files:**
- Modify: `src/ui/inspector/SourceLine.tsx:1-9`
- Modify: `src/ui/inspector/InspectorPanel.tsx:264-270`
- Test: none (trivial JSX widening; covered by typecheck + the inspector usage)

- [ ] **Step 1:** In `SourceLine.tsx`, widen `license?: 'CC0'` to `license?: 'CC0' | 'IKEA'`. The existing text template already interpolates `license`, so `IKEA` shows correctly.

- [ ] **Step 2:** In `InspectorPanel.tsx`, widen the source-line guard so IKEA defs also show it:

```tsx
      {def.kind === 'gltf' && (def.source === 'builtin' || def.source === 'ikea') && (
        <SourceLine
          attribution={def.attribution}
          license={def.license}
          sourceUrl={def.sourceUrl}
        />
      )}
```

(Both `builtin` and `ikea` carry `attribution`/`license`/`sourceUrl`; TS narrows the union.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/inspector/SourceLine.tsx src/ui/inspector/InspectorPanel.tsx
git -c commit.gpgsign=false commit -m "feat: show IKEA (non-CC0) attribution in the inspector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: IkeaBody inspector — finish picker, tint, product info, complete-with

**Files:**
- Create: `src/ui/inspector/IkeaBody.tsx`
- Modify: `src/ui/inspector/InspectorPanel.tsx:259-263` (dispatch IkeaBody for IKEA defs)

**Context:** Selecting a finish sets `item.props.variant` and seeds that variant's footprint. Per-component recolour writes `item.props['finish:<materialName>']`. For single-material variants, show the global tint (`item.props.tint`). "Complete with" uses `resolveCompatible` over the current catalog and places a chosen group via the normal placement path. Use `useStore`'s `updateItemProps`, the merged catalog (`useCatalog`), and the existing add-to-scene action (grep for how the catalog drawer adds an item — e.g. `activateDef`/`placeItem`/`addItem`; reuse it). Keep the file focused; if "complete with" grows large, extract a `CompleteWith.tsx`.

- [ ] **Step 1: Write the failing test** (logic-only: the props a finish click writes)

Create `src/ui/inspector/ikeaBodyProps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { variantProps, finishOverrideKey } from './ikeaBodyProps';

describe('IkeaBody prop helpers', () => {
  it('variantProps sets the variant finish key', () => {
    expect(variantProps('white')).toEqual({ variant: 'white' });
  });
  it('finishOverrideKey namespaces a material name', () => {
    expect(finishOverrideKey('STEEL')).toBe('finish:STEEL');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/inspector/ikeaBodyProps.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `src/ui/inspector/ikeaBodyProps.ts`:

```ts
export function variantProps(finish: string): { variant: string } {
  return { variant: finish };
}
export function finishOverrideKey(materialName: string): string {
  return `finish:${materialName}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/inspector/ikeaBodyProps.test.ts`
Expected: PASS

- [ ] **Step 5: Implement IkeaBody.tsx**

Create `src/ui/inspector/IkeaBody.tsx` with:
- **Finish picker:** map `def.variants` → swatch buttons (`backgroundColor: v.swatchHex ?? '#ccc'`), label `v.label`. Disabled + greyed when `!v.assetId`. Active = `item.props.variant ?? def.activeVariant`. onClick: `updateItemProps(item.id, variantProps(v.finish))` then, if the variant has a `runtimeUrl` + `footprint`, `seedGltfFootprint(v.runtimeUrl, v.footprint)`.
- **Recolour / tint:** find the active variant; if `glbMaterials.length > 1`, render one color input per material (value from `item.props[finishOverrideKey(m.name)]` default `m.hex`/`m.sampledHex`; onChange writes that prop). Else render the global tint control (copy from `GltfBody`, writing `item.props.tint`).
- **Scale slider:** copy from `GltfBody`.
- **Product info (collapsible):** show `def.productInfo` — series, styleGroup, designer, description, size, key `productMeasurements`, materials (part → composition), careInstructions, documents (PDF links), rating (value/max + count), and `mainImageUrl` thumbnail. Use a `<details>` element to keep it compact. Show a "⚠ category may be wrong — review" note when `productInfo.categoryConfidence === 'low'`.
- **Complete with:** if `def.compatibility?.acceptsCategories?.length`, compute `resolveCompatible(def, ikeaDefsFromCatalog)` where `ikeaDefsFromCatalog = Object.values(useCatalog()).filter(isIkeaDef)`. For each accepted category with matches, list buttons "Add <name>" that place that group's def near the active item (reuse the catalog drawer's add/activate action). Hide categories with no matches.

Imports: `useStore`, `useCatalog`, `isIkeaDef`, `resolveCompatible`, `seedGltfFootprint`, `variantProps`, `finishOverrideKey`, types.

- [ ] **Step 6:** Dispatch from `InspectorPanel.tsx`. Replace the `def.kind === 'parametric' ? <ParametricBody/> : <GltfBody/>` block with a three-way:

```tsx
      {def.kind === 'parametric' ? (
        <ParametricBody item={item} def={def} />
      ) : isIkeaDef(def) ? (
        <IkeaBody item={item} def={def} />
      ) : (
        <GltfBody item={item} def={def} />
      )}
```

Add imports for `IkeaBody` and `isIkeaDef`.

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/ui/inspector/IkeaBody.tsx src/ui/inspector/ikeaBodyProps.ts src/ui/inspector/ikeaBodyProps.test.ts src/ui/inspector/InspectorPanel.tsx
git -c commit.gpgsign=false commit -m "feat: IKEA inspector — finish picker, recolour, product info, complete-with

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Upload-dialog auto-detect + IKEA import path

**Files:**
- Modify: `src/ui/upload/UploadModelDialog.tsx`
- Test: `src/furniture/ikea/detectGroup.test.ts` (create — the detection helper)

**Context:** The folder picker yields a `FileList` including a `metadata.json`. Detect it, parse, and if `looksLikeIkeaMetadata`, route to `importGroup`. Hide the manual category/mounted/noClip controls for the IKEA path (derived from metadata). Show the detected category + a low-confidence note.

- [ ] **Step 1: Write the failing test**

Create `src/furniture/ikea/detectGroup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findMetadataFile } from './detectGroup';

function jsonFile(name: string, obj: unknown): File {
  return new File([JSON.stringify(obj)], name, { type: 'application/json' });
}

describe('findMetadataFile', () => {
  it('finds metadata.json with group_key among picked files', async () => {
    const files = [
      new File([new Uint8Array(4)], 'black-brown.glb'),
      jsonFile('metadata.json', { group_key: 'malm', variants: [] }),
    ];
    const r = await findMetadataFile(files);
    expect(r?.group_key).toBe('malm');
  });
  it('returns null when no ikea metadata present', async () => {
    const files = [new File([new Uint8Array(4)], 'model.glb')];
    expect(await findMetadataFile(files)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/furniture/ikea/detectGroup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/furniture/ikea/detectGroup.ts`:

```ts
import { looksLikeIkeaMetadata } from './metadata';

/** Find and parse a metadata.json in the picked files that looks like an IKEA
 *  group. Returns the raw parsed JSON (for parseMetadata) or null. */
export async function findMetadataFile(files: File[]): Promise<Record<string, unknown> | null> {
  for (const f of files) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const base = path.split('/').pop() ?? f.name;
    if (base.toLowerCase() !== 'metadata.json') continue;
    try {
      const json = JSON.parse(await f.text());
      if (looksLikeIkeaMetadata(json)) return json as Record<string, unknown>;
    } catch {
      // ignore unparseable metadata.json
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/furniture/ikea/detectGroup.test.ts`
Expected: PASS

- [ ] **Step 5:** Wire into `UploadModelDialog.tsx`:
- In `onPick`, after setting files, asynchronously call `findMetadataFile(picked)`; store the parsed metadata + a derived `{ name, category, confidence }` in new state `ikeaMeta`. When `ikeaMeta` is set, the dialog renders an "IKEA group detected" panel: product name, mapped category (`mapCategory(...).category`), variant count + how many have a GLB, and a low-confidence warning when applicable. Hide the manual Name/Category/mounted/noClip inputs in this mode.
- In `submit`, when `ikeaMeta` is set: `const parsed = parseMetadata(ikeaMeta); if (parsed.ok) { const r = await importGroup(parsed.data, files); … }`. On success show a summary ("Imported <name> — N of M finishes available"), reset, close on confirm. On failure show `r.reason`.
- Plain folders (no `ikeaMeta`) keep the current `importGlbFiles` bulk path; single files unchanged.

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/upload/UploadModelDialog.tsx src/furniture/ikea/detectGroup.ts src/furniture/ikea/detectGroup.test.ts
git -c commit.gpgsign=false commit -m "feat: auto-detect IKEA group folders in the upload dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: End-to-end catalog-card test + final verification

**Files:**
- Test: `src/furniture/ikeaCatalogCard.test.ts` (create — mirrors the existing "imported user GLBs surface as catalog cards" test)

- [ ] **Step 1: Write the test**

Create `src/furniture/ikeaCatalogCard.test.ts` that: mocks IDB, runs `importGroup` with the MALM fixture File[], then asserts the def appears under `category:'beds'` when building the by-category catalog (replicate how `catalogUserDefs.test.ts` reads the merged catalog from the store — reuse its harness). Assert one card, name "MALM bed frame, high", source `ikea`.

```ts
// Follow src/furniture/catalogUserDefs.test.ts for the store + IDB mock harness.
// After importGroup, read the store's userFurniture and confirm a single
// source:'ikea' def in the beds bucket with the expected name + groupKey.
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/furniture/ikeaCatalogCard.test.ts`
Expected: PASS (adjust harness until green).

- [ ] **Step 3: Full verification gate**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/furniture/ikeaCatalogCard.test.ts
git -c commit.gpgsign=false commit -m "test: imported IKEA group surfaces as one catalog card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Update docs**

Mark the IKEA import work done where tracked: update `docs/ikea-import-app-support.md` header to note "app side implemented (see plan 2026-05-31-ikea-model-import.md)" and tick `TODO.md` if it lists this. Add a one-line note to `CLAUDE.md` "Key systems" describing IKEA import (one def per group, variants[], per-instance finish, non-CC0 attribution). Commit:

```bash
git add docs/ikea-import-app-support.md TODO.md CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: mark IKEA import implemented

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes (coverage map)

- §3 categories → Tasks 1, 2, 12.
- §4 finishes/variants → Tasks 3, 8, 11, 17.
- §5 placement semantics → Tasks 4, 8 (flags), 13 (frontClearance).
- §6 pricing → Task 14.
- §7 compatibility → Tasks 15, 17 (UI).
- §8 info panel → Task 17.
- §9 import pipeline → Tasks 5, 6, 7, 8, 9, 10, 18, 19.
- §10 attribution → Tasks 8 (def fields), 16.
- Rendering → Task 11.

All pure modules are TDD'd before consumers. Each task ends green + committed.
