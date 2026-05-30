# IKEA model import — design

Bring scraped IKEA product groups into the app as first-class design objects:
placeable, collidable, finish-swappable, priced, attributed, with product info
and "complete with" suggestions. The scraper (`python/scripts/`) is done; this
spec covers the app side, implementing **all** of `docs/ikea-import-app-support.md`
(§3–§9). Decisions taken (all the doc's recommended options):

- **Variant model:** one def per group with a `variants[]` array + active variant
  stored **per-instance** in `FurnitureItem.props`.
- **Categories:** extend the enum (`textiles`, `outdoor`), don't fold.
- **Import entry:** auto-detect a group folder inside the existing Upload dialog.
- **Licensing:** mark IKEA defs non-CC0 and attribute; no extra warning gate.

This builds directly on the existing user-GLB pipeline (IndexedDB blobs +
`UserGltfDef` + `FOOTPRINT_CACHE` + save schema). Read these first:
`src/furniture/types.ts`, `src/furniture/catalog.ts`, `src/furniture/GltfModel.tsx`,
`src/furniture/upload/{persist,bulkImport,validate}.ts`,
`src/state/storage/{IdbAssetStore,hydrateAssets}.ts`, `src/state/schema.ts`,
`src/furniture/Furniture.tsx`, `src/ui/inspector/GltfBody.tsx`,
`src/layout/{autoArrange,clearance,designRules}.ts`,
`src/furniture/furniturePrices.ts`.

The scraper schema is in `docs/ikea-import-app-support.md §1`; a real example is
`python/scripts/ikea_sg_3d_models/malm-bed-frame-high-90x200/metadata.json`. The
compatibility algorithm to port is `python/scripts/compatibility.py`.

---

## Architecture at a glance

```
Upload dialog (folder pick)
  └─ detect metadata.json with group_key
       └─ ikea/importGroup.ts
            ├─ parse + validate metadata (ikea/metadata.ts, zod)
            ├─ translate design→placement, category map (ikea/translate.ts)
            ├─ for each variant with a glb: validate + write blob to IDB
            │     (assetId per article number; meta tags source:'ikea', groupKey)
            ├─ build IkeaGltfDef (variants[], productInfo, compatibility, price)
            ├─ pre-seed FOOTPRINT_CACHE[runtimeUrl] from footprint{w,d,h,anchor}
            └─ addUserFurniture(def)   // reuses the user-furniture slice
hydrateAssets   ── rebuilds IkeaGltfDef groups from IDB on boot
schema.ts       ── round-trips IkeaGltfDef (binaries by assetId, URLs stripped)
Furniture.tsx   ── renders the active variant's GLB (variant from item.props)
Inspector       ── finish picker, product-info panel, "complete with" picker
```

Defs live in the **existing `userFurniture` store slice** (they hydrate from IDB
the same way). `source:'ikea'` distinguishes them. No new slice.

---

## 1. Types & category enum (§3)

`src/furniture/types.ts`:

- Extend `FurnitureCategory` with `'textiles' | 'outdoor'` and append both to
  `FURNITURE_CATEGORIES`. TypeScript exhaustiveness then flags every
  `Record<FurnitureCategory, …>` site to update (see §3 task list).
- Add optional `frontClearance?: number` (metres) to `FurnitureDefBase`.
- New variant + def types:

```ts
export interface IkeaGlbMaterial {
  name: string;          // glb_materials[].name → finish-target key
  hex: string;
  metallic: number;
  roughness: number;
  textured: boolean;
  sampledHex?: string;   // representative colour for the swatch
}

export interface IkeaVariant {
  finish: string;                 // raw scraper finish, e.g. "black-brown"
  label: string;                  // display label (title-cased finish)
  articleNumber: string;
  url: string;
  /** IDB key for this finish's GLB; null = not crawled (stub). */
  assetId: string | null;
  /** Runtime blob URL, hydrated from assetId (not persisted). */
  runtimeUrl?: string;
  price?: number;                 // price_numeral
  currency?: string;
  swatchHex?: string;             // sampled_hex of material_0, for the picker
  footprint?: { w: number; d: number; h: number; anchorOffset: [number, number, number] };
  glbMaterials: IkeaGlbMaterial[];
}

export interface IkeaProductInfo {
  series?: string;
  styleGroup?: string;
  typeName?: string;              // scraper type_name — used by the compatibility resolver
  designer?: string;
  description?: string;
  goodToKnow?: string[];
  categoryHierarchy?: string[];
  size?: string;
  productMeasurements?: Record<string, string>;
  materials?: { part: string; composition: string }[];
  careInstructions?: string;
  documents?: { name: string; url: string }[];
  rating?: { value: number; max: number; count: number };
  mainImageUrl?: string;
  contextualImageUrl?: string;
  categoryConfidence?: 'high' | 'low';
}

export interface IkeaCompatibility {
  acceptsCategories: string[];
  size?: string;
}

export interface IkeaGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'ikea';
  groupKey: string;               // stable id (folder name)
  activeVariant: string;          // default finish (first crawled variant)
  variants: IkeaVariant[];
  frontClearance?: number;        // already on base; mirrored here for clarity
  productInfo?: IkeaProductInfo;
  compatibility?: IkeaCompatibility;
  uploadedAt: string;
  license: 'IKEA';
  attribution: string;            // e.g. "IKEA — imported model, not for redistribution"
  sourceUrl?: string;             // variant url of the active finish
}
```

- Add `IkeaGltfDef` to the `GltfDef` union.
- `catalog.ts`: add `isIkeaDef(def): def is IkeaGltfDef`. In `useCatalog` /
  `useCatalogByCategory`, merge `source:'ikea'` defs (they already arrive via the
  `userFurniture` slice; the existing `for (const def of userFurniture)` loop
  covers them — but `resolveUserDefFootprint` is typed to `UserGltfDef`, so widen
  it to handle both, or branch on source. IKEA defs already carry a footprint
  from the scraper, so the resolver only refreshes from the cache if present and
  must key off the **active variant's** runtimeUrl).

**Footprint resolution for IKEA defs:** `defaultFootprint` is seeded at import
from the active variant's `footprint{w,d,h}`. The cache (keyed by the active
variant's blob URL) is pre-seeded too, so collision is correct before first
render. `resolveUserDefFootprint`'s IKEA branch reads the active variant's URL.

## 2. Categories — consumer updates (§3)

Update every exhaustive `Record<FurnitureCategory, …>` (TS will error on each):

- `src/furniture/furniturePrices.ts` — `CATEGORY_BASE`: `textiles: 200`, `outdoor: 300`.
- `src/ui/BudgetPanel.tsx`, `src/ui/report.ts`, `src/ui/upload/UploadModelDialog.tsx`,
  `src/ui/catalog/CategoryTabs.tsx` — `CATEGORY_LABEL`/`LABELS`: `Textiles`, `Outdoor`.
- `src/ui/catalog/CategoryIcon.tsx` — icons for the two (reuse a sensible glyph).
- `src/ui/Minimap.tsx` — `DOT` is `Partial`, so optional; add colours.
- `src/furniture/catalog.ts` `useCatalogByCategory` — add `textiles: […]`, `outdoor: […]`
  seeded from `BUILTIN_BY_CATEGORY` (will be empty arrays — fine).
- `src/layout/autoArrange.ts` — extend `roleOf` category fallback: `textiles → rug`
  (treat like floor covering / `noClip`), `outdoor → other`. `ROLE` is keyed by
  defId; add a category-based fallback in `roleOf(def)` (change signature to take
  the def so category is available) — `beds→bed`, `storage→storage`,
  `seating→seating`, `lighting→other`, `textiles→rug`, else `other`. This also
  makes imported IKEA items (no defId in ROLE) arrange sensibly.

## 3. Import pipeline (§9)

New module dir `src/furniture/ikea/`:

- `metadata.ts` — a zod schema `IkeaMetadataZ` mirroring the scraper output
  (`docs/ikea-import-app-support.md §1`), plus `parseMetadata(json): Result`.
  Tolerant: unknown extra keys ignored; required = `group_key`, `product_name`,
  `variants[]`. A variant with `glb:null` is a valid stub.
- `translate.ts` — pure functions, fully unit-tested:
  - `mapCategory(design.category): { category: FurnitureCategory; confidence }` —
    the scraper's 11 functional categories → app enum. Known map:
    `beds, seating, tables, storage, kitchen, bathroom, appliances, lighting,
    decor` pass through; `textiles→textiles`, `outdoor→outdoor`. Anything
    unrecognised → `decor` with confidence `low`.
  - `placementFlags(design): { mounted?; noClip?; verticalSpan?; frontClearance? }`
    — `placement:'wall'|'ceiling' → mounted:true`; ceiling also sets a
    `verticalSpan` base near the ceiling (use footprint h to lift); `no_clip →
    noClip:true`; `front_clearance_m → frontClearance` (omit when 0);
    `back_to_wall` is consumed by autoArrange via category role (no def flag).
  - `titleCaseFinish(finish): string` for variant labels.
- `importGroup.ts` — the orchestrator:
  1. Take a `File[]` (the picked folder's files) + the parsed `metadata.json`.
  2. For each variant with a non-null `glb`, find the matching `File` by basename,
     `validateGlbFile` it, write the blob to IDB with a fresh assetId and meta
     `{ source:'ikea', groupKey, articleNumber, finish, kind:'gltf' }`. Stub
     variants (`glb:null`) get `assetId:null`.
  3. Build the `IkeaGltfDef`: `id = ikea-${groupKey}`, name = `product_name`,
     category + flags from `translate`, `variants[]` with runtime blob URLs,
     `defaultFootprint` from the active (first-crawled) variant, `productInfo`,
     `compatibility`, price from the active variant, attribution/license/sourceUrl.
  4. `seedFootprintCache(activeRuntimeUrl, footprint)` (see §7).
  5. `addUserFurniture(def)`.
  Returns `{ ok:true; def } | { ok:false; reason }`. Re-importing the same
  `groupKey` replaces the existing def (dedupe by id; delete old assetIds).
- The active variant = the **first** variant whose `glb` is non-null.

**Validation note:** IKEA GLBs may exceed the 25 MB user-upload cap. Bump
`MAX_GLB_BYTES`? No — instead `importGroup` passes a higher cap to a new
`validateGlbFile(file, { maxBytes })` (default unchanged for user uploads; IKEA
import uses e.g. 50 MB). Keep the magic-byte check.

## 4. IDB hydration (§9)

`src/state/storage/hydrateAssets.ts`:

- IKEA blobs share the `assets` store, tagged `meta.source==='ikea'` +
  `meta.groupKey`. The current loop **skips `source==='pack'`** and treats
  everything else as a single-file user upload. Add a branch: collect all
  `kind:'gltf'` records with `meta.source==='ikea'`, **group by `meta.groupKey`**,
  and rebuild one `IkeaGltfDef` per group.
- The full def metadata (variants list, productInfo, compatibility, category,
  flags, price) is carried through the **save schema** (localStorage) like
  `userFurniture` already is — IDB stores only blobs keyed by assetId. This
  mirrors how `UserGltfDef` round-trips today (def in schema, blob in IDB) and
  avoids stuffing large JSON into per-blob meta.
- `hydrateAssets` does **not** rebuild IKEA defs from blob meta. The persisted
  `userFurniture` (from the layout save, §5) already contains the IKEA defs; a
  hydration step re-resolves each variant's `runtimeUrl` from its `assetId` blob
  (looking the blob up in IDB and calling `URL.createObjectURL`). It runs at the
  same place user/pack runtime URLs are rebuilt at boot. To make this concrete:
  iterate `state.userFurniture`, and for each `source:'ikea'` def, for each
  variant with a non-null `assetId`, `IdbAssetStore.get(assetId)` → set
  `variant.runtimeUrl`. Then `seedGltfFootprint` the active variant.
- Stub variants (`assetId===null`) keep `runtimeUrl` undefined; greyed in the picker.

## 5. Persistence / save schema (§5/§9)

`src/state/schema.ts`:

- Add `IkeaGltfDefZ` (zod) and accept it in `userFurniture` as a union with
  `UserGltfDefZ` (discriminated on `source`). Serialize the IKEA def with all
  fields **except** per-variant `runtimeUrl` (stripped, like `UserGltfDef`'s).
- `serialize()` maps IKEA defs; `applySerialized` keeps them (their `id`s join
  `knownDefIds` so placed instances survive).
- Runtime-URL re-resolution happens at hydration (§4), not in the schema.
- Existing saves without IKEA defs stay valid (the union is additive; the array
  already exists).

## 6. Rendering the active variant (§4)

`src/furniture/Furniture.tsx` + `GltfModel.tsx`:

- For `source:'ikea'`, the rendered URL = the **active variant's** `runtimeUrl`,
  where active = `item.props.variant` (string) if present and that variant has a
  GLB, else `def.activeVariant`.
- Pass `finishOverrides` (per-component recolour) from `item.props` if set —
  reuse the existing `finishOverrides` path keyed by `glb_materials[].name`. For
  single-material models (`material_0` only) the inspector exposes a global tint
  instead (existing `props.tint`).
- `Furniture`'s `memo` comparator already keys on `item` + `def`; switching
  `props.variant` changes `item`, so it re-renders. Pre-load sibling variant GLBs
  lazily (only the active one is loaded; `useGLTF`/Suspense handles the swap).

## 7. Footprint pre-seeding (§9)

`src/furniture/GltfModel.tsx`:

- Export `seedGltfFootprint(url, { w, d, h, anchorOffset })` that writes into the
  module `FOOTPRINT_CACHE` (mapping `anchorOffset[0]→ox`, `anchorOffset[2]→oz`,
  matching the existing `{w,d,h,ox,oz}` shape) **only if not already present**.
  The effect that computes the bbox already early-returns when the key exists, so
  a seeded entry is authoritative until the real GLB loads (and even then the
  effect won't overwrite it — acceptable; the seed is from the same GLB's
  accessors).
- `importGroup` and the hydration step both seed the active variant's URL; when
  the user switches finish, seed that variant's URL on first select from its
  `footprint`.

## 8. Finishes / variant + tint UI (§4)

New `src/ui/inspector/IkeaBody.tsx` (rendered by `InspectorPanel` when
`isIkeaDef(def)`), replacing/augmenting `GltfBody` for IKEA items:

- **Finish picker:** list `def.variants` with a `swatchHex` chip + `label`.
  Selecting one sets `item.props.variant` (and seeds its footprint). Variants
  with `assetId===null` render greyed + disabled ("not available").
- **Per-component recolour:** if the active variant has >1 named material, show
  the existing finish-target swatches (write `item.props['finish:<name>']` →
  composed into `finishOverrides`). For single-material, show the global Tint
  control (reuse `GltfBody`'s tint slider).
- **Scale** slider (reuse).
- **Attribution line:** IKEA, not CC0 — show `def.attribution` + `sourceUrl`
  link (extend `SourceLine` to accept `license:'IKEA'`).

`src/ui/inspector/SourceLine.tsx`: widen `license` to `'CC0' | 'IKEA'`.

## 9. Pricing (§6)

`src/furniture/furniturePrices.ts`:

- Change `itemPrice` to accept the **def** (or a price hint) so a def-level price
  wins over the category fallback. New signature:
  `itemPrice(def: FurnitureDef, category): number` returning, in order:
  IKEA active-variant price → `ITEM_PRICE[def.id]` → `CATEGORY_BASE[category]` → 100.
  Update both call sites (`BudgetPanel.tsx`, `report.ts`) to pass the def.
- The IKEA price reads the **active variant** (per-instance variant may differ;
  for the budget we use the def's active variant price as the estimate — variant
  price deltas are minor and the budget is explicitly an estimate).

## 10. Attribution / credits (§9)

- `IkeaGltfDef.license = 'IKEA'`, `attribution = "IKEA — imported model"`,
  `sourceUrl` = active variant url.
- `src/ui/CreditsModal.tsx`: include IKEA-sourced defs in the credits list with
  their non-CC0 label ("IKEA · imported, not for redistribution"). The modal
  currently assumes `license:'CC0'`; add an IKEA section or widen the entry type.
- `IkeaBody` shows the same inline.

## 11. Compatibility resolver (§7)

`src/furniture/ikea/compatibility.ts` — TS port of `compatibility.py`:

- `productCategories(def): Set<string>` from `productInfo.categoryHierarchy` +
  `type_name`-equivalent (store `typeName` on `productInfo` for this), normalised.
- `categoryMatches(acceptsCategory, labels)` — depluralise + whole-phrase /
  word-boundary match (port `_depluralize`, `_category_matches`).
- `resolveCompatible(active: IkeaGltfDef, catalog: IkeaGltfDef[])` →
  `Record<acceptedCategory, { def; finishes }[]>`, size-gated, skips groups with
  no crawled variant and the active group itself.
- UI: in `IkeaBody`, a **"Complete with…"** section listing compatible groups
  grouped by accepted category, each a button that places that group's def
  (default finish) near the active item (reuse the normal placement/collision
  path). Only shown when `def.compatibility?.acceptsCategories?.length`.

## 12. Import-dialog wiring (§9 + entry decision)

`src/ui/upload/UploadModelDialog.tsx` + `src/furniture/upload/bulkImport.ts`:

- On folder pick, detect a `metadata.json` File whose parsed JSON has `group_key`.
  If found → route the whole FileList to `importGroup` (IKEA path), show an
  IKEA-specific summary ("Imported MALM bed frame — 1 of 3 finishes available").
  The category/mounted/noClip manual controls are hidden for IKEA (derived from
  metadata); show the detected category + a "low confidence — review" note when
  `categoryConfidence==='low'`.
- A folder **without** a valid `metadata.json` keeps the current bulk-GLB path.
- Single-file picks are unchanged.

---

## Testing

- `translate.test.ts` — category map (all 11 + unknown→decor/low), placement
  flags (floor/wall/ceiling/surface, no_clip, front_clearance 0 omitted, >0 kept),
  title-casing.
- `metadata.test.ts` — parse the real MALM fixture; accept stub variants; reject
  missing group_key.
- `compatibility.test.ts` — port the python cases: MALM bed accepts a 90x200
  mattress group, rejects a 150x200 one, rejects a non-mattress, skips no-GLB
  groups. Use small fixtures.
- `importGroup.test.ts` — given the MALM fixture File[], builds a def with one
  crawled variant + two stubs, writes one blob, seeds the footprint cache,
  registers the def. (IDB mocked as in existing asset tests.)
- `schema.test.ts` — extend: an IkeaGltfDef round-trips (variants, productInfo,
  compatibility) and runtime URLs are stripped; placed instance with
  `props.variant` survives.
- `furniturePrices.test.ts` — def-level IKEA price beats category fallback;
  non-IKEA unchanged.
- `autoArrange` / category exhaustiveness — a typecheck pass + a test that a
  `textiles` item gets the `rug` role and an `outdoor` item `other`.
- `catalogUserDefs.test.ts` style — an imported IKEA group surfaces as one
  catalog card in its mapped category (mirrors the existing
  "imported user GLBs surface as catalog cards" test on `main`).

All new pure modules (`translate`, `metadata`, `compatibility`) are framework-free
and unit-tested first (TDD). UI + IDB integration tested at the seams.

## Out of scope / non-goals

- No live IKEA scraping in-app (folders are pre-scraped by the python tool).
- No editing of imported metadata in-app (read-only product info).
- No bundling IKEA assets into the repo or default layout (licensing).
- Variant-price-aware budget per instance (def active-variant price is the
  estimate; this is acceptable for a ballpark budget).

## Suggested implementation order (each independently shippable)

1. Types + category enum + all exhaustive consumers (§1, §2) — compiles, no behaviour.
2. `translate` + `metadata` (pure, TDD) (§3).
3. `importGroup` + footprint seeding + IDB write (§3, §7).
4. Schema round-trip + hydration (§4, §5).
5. Rendering active variant (§6).
6. Dialog wiring + auto-detect (§12).
7. Inspector finish/tint UI + attribution + credits (§8, §10).
8. Pricing (§9).
9. Compatibility resolver + "Complete with" UI (§11).
