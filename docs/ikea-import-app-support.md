# Supporting scraped IKEA metadata in the app — future work

> **STATUS (2026-05-31): IMPLEMENTED.** The app side described below is now
> built and shipped — import pipeline, category mapping, finish/variant
> switching, placement semantics + `frontClearance`, def-level pricing,
> attribution, compatibility resolver, and the product-info panel. See the
> executed plan [docs/superpowers/plans/2026-05-31-ikea-model-import.md](superpowers/plans/2026-05-31-ikea-model-import.md)
> and the code under `src/furniture/ikea/` (metadata/translate/importGroup/
> compatibility/detectGroup). The remaining planning content below is kept for
> reference. Genuinely-deferred items (e.g. KTX2 LOD) are still tracked in
> `TODO.md`.
>
> **Also shipped (categories + live pack):** the category mapping (§3) now
> targets **15** categories with an `others` catch-all (electronics/kids/laundry
> added; unmatched → `others`, not `decor`). A one-click **IKEA live-scrape
> pack** (`catalog/packs/ikeaLive.ts` + `scripts/scraper-server.mjs`) serves
> scraped assets over HTTP paths under `public/assets/ikea/`, which realizes the
> pre-baked-LOD path §11 noted was blocked by blob URLs.

The IKEA scraper (`python/scripts/`) now produces rich, design-grade metadata
per product **variant group**. This document specifies the app-side changes
needed for `sofa-so-good` to consume **everything** the scraper emits, so an
imported IKEA model behaves as a first-class design object (placeable,
collidable, recolourable, swappable between finishes, budgetable).

It is a **planning doc, not implemented** — the scraper side is done; the app
side below is the remaining work. Scope was deliberately deferred ("scraper-side
first").

---

## 1. What the scraper produces

One folder per variant group under the scraper's output dir, e.g.
`malm-bed-frame-high-90x200/`, containing:

- `<finish>.glb` per crawled finish (e.g. `black-brown.glb`, `white.glb`)
- `metadata.json` — shared specs + a `variants[]` array (one per finish)

### `metadata.json` schema (current scraper output)

```jsonc
{
  // ── group-level (identical across finishes) ───────────────────────────────
  "group_key": "malm-bed-frame-high-90x200",   // folder name / stable id
  "product_name": "MALM bed frame, high",
  "type_name": "bed frame, high",
  "size": "90x200",                             // normalised, or null
  "series": "MALM series",
  "style_group": "Basic Modern",                // aesthetic grouping
  "designer": "Eva Lilja Löwenhielm",
  "description": "…",
  "good_to_know": ["…", "…"],
  "category_hierarchy": ["Beds & mattresses", "Bed frames", "…"],

  "design": {                                   // derived design classification
    "category": "beds",                         // see §3 category mapping
    "category_confidence": "high",              // "high" | "low" (review low)
    "placement": "floor",                       // floor|wall|ceiling|surface
    "semantics": {                              // optional keys present per type
      "back_to_wall": true,
      "front_clearance_m": 0.0,
      "mounted": true,                          // present for wall/ceiling
      "no_clip": true                           // present for rugs/mats
    }
  },

  "product_measurements": { "Length": "209 cm", "Width": "105 cm", … },
  "package_measurements": [ { "Width": "77 cm", "Weight": "16.35 kg", … } ],

  "compatibility": {                            // category-rule (hybrid model)
    "accepts_categories": ["Spring mattresses", "Slatted bed bases", "…"],
    "size": "90x200",
    "example_products": [ { "category", "article_number", "name", "url" } ]
  },

  // ── per-finish ────────────────────────────────────────────────────────────
  "variants": [
    {
      "article_number": "40265178",
      "finish": "black-brown",
      "url": "https://www.ikea.com/sg/en/p/…",
      "product_title": "MALM Bed frame, high, black-brown, 90x200 cm",
      "price_tag": "$204", "price_excl_tax": "$187.16",
      "price_numeral": 204, "currency": "SGD",
      "rating": { "value": 4.5, "max": 5, "count": 45 },
      "materials": [ { "part": "Head/footboard", "composition": "Particleboard, …" } ],
      "care_instructions": "Wipe clean with …",
      "documents": [ { "name": "…", "url": "…assembly….pdf" } ],
      "main_image_url": "…", "contextual_image_url": "…",
      "global_model_id": "80249493",
      "model_asset_url": "https://web-api.ikea.com/….glb",
      "glb": "black-brown.glb",                 // local file in the group folder

      "footprint": {                            // from GLB accessors, metres
        "w": 1.0542, "d": 2.09, "h": 1.0041,
        "anchor_offset": [0.0, 0.5021, -0.0]    // local-space centre (x,y,z)
      },
      "glb_materials": [                         // per-component renderable palette
        { "name": "material_0", "hex": "#ffffff", "metallic": 1, "roughness": 1,
          "textured": true, "sampled_hex": "#504c4b" }
      ],
      "glb_segments": [ { "mesh": "model", "material": "material_0" } ]
    },
    // a not-yet-crawled sibling appears as a stub:
    { "article_number": "90325165", "finish": "White stained oak veneer",
      "url": "…", "glb": null }
  ]
}
```

Reference modules: `glb_analysis.py` (footprint + materials), `categorize.py`
(category + placement semantics), `compatibility.py` (runtime resolver),
`ikea_model_scraper.py` (orchestration + variant-group accretion).

---

## 2. App data model — current state & gaps

Relevant existing types (`src/furniture/types.ts`):

- `FurnitureDefBase` — `id`, `name`, `category: FurnitureCategory`, `keywords?`,
  `defaultRotation?`, `defaultFootprint {w,d,h}`, `verticalSpan?`,
  `mounted?`, `noClip?`.
- `UserGltfDef` / `RemoteGltfDef` / `PackGltfDef` — gltf sources, with
  `finishTargets?: {key,label}[]` and `finishOverrides?: Record<string,string>`.
- `FurnitureItem` — placed instance: `position`, `rotation`, `flipX/Z`,
  `locked`, `props`.
- `FurnitureCategory` — **9 values**: beds, seating, tables, storage, kitchen,
  bathroom, appliances, lighting, decor.

### Field-by-field mapping (scraper → app)

| Scraper field | App target | Status | Work needed |
|---|---|---|---|
| `group_key` | new `IkeaProductDef.groupKey` | ❌ | new def kind / id |
| `product_name`, `type_name` | `name` | ✅ | concat |
| `variants[].finish` | `finishTargets`/variant id | ⚠️ | model finishes as variants (§4) |
| `variants[].footprint {w,d,h}` | `defaultFootprint` | ✅ field exists | populate at import (no need to wait for bbox) |
| `variants[].footprint.anchor_offset` | GLB anchor (auto-detected by `GltfModel`) | ✅ | none — already auto-handled; can pre-seed cache |
| `design.category` | `category: FurnitureCategory` | ⚠️ | **map / extend enum** (§3) |
| `design.placement` + `design.semantics` | `mounted`, `noClip`, `verticalSpan` + **new** clearance fields | ⚠️ | translate (§5) |
| `design.semantics.front_clearance_m` | **new** `frontClearance` on def | ❌ | add field + use in collision/auto-arrange |
| `variants[].price_numeral` | `furniturePrices.ts` per-item | ⚠️ | wire imported prices (§6) |
| `variants[].glb_materials` (+ `glb_segments`) | `finishTargets` + recolour | ⚠️ | per-component finish system (§4) |
| `compatibility` | **new** compatibility lookup | ❌ | runtime resolver port (§7) |
| `series`, `style_group` | **new** def metadata + filters | ❌ | optional (§8) |
| `materials`, `care_instructions`, `documents`, `rating`, images | **new** info panel data | ❌ | optional (§8) |
| `size`, `product_measurements` | info panel / fit checks | ❌ | optional (§8) |

---

## 3. Category mapping (required)

The scraper emits **11** functional categories; the app enum has **9**. The
scraper adds `textiles` and `outdoor`.

**Decision needed:** either
- **(A)** extend `FurnitureCategory` to include `'textiles' | 'outdoor'`
  (touches `FURNITURE_CATEGORIES`, `furniturePrices.CATEGORY_BASE`,
  `autoArrange` role map, budget UI, catalog drawer filters), **or**
- **(B)** fold them at import — `textiles → decor`, `outdoor → decor` (or drop).

Recommendation: **(A)** — textiles (rugs/curtains) and outdoor are legitimate
interior-design categories and the per-category clearance/pricing differs.

**Tasks**
- [ ] Add `textiles`, `outdoor` to `FurnitureCategory` + `FURNITURE_CATEGORIES`.
- [ ] Add `CATEGORY_BASE` prices for the new categories (`furniturePrices.ts`).
- [ ] Add `autoArrange` roles for them (`textiles → rug/no_clip`, treat outdoor
      as `other`).
- [ ] Surface `category_confidence: "low"` items for manual review at import
      (don't silently trust the mapping).

---

## 4. Finishes & per-component recolouring (required for "customise")

The scraper gives, per finish: the **whole sibling GLB** (different baked
texture / geometry) **and** the GLB's per-component palette (`glb_materials` +
`glb_segments`). Two distinct mechanisms:

1. **Finish switch = load a different GLB.** Each `variants[]` entry is a
   separate model file. Picking "white" loads `white.glb`, not a recolour.
2. **Per-component tint = `glb_materials`/`glb_segments`.** For multi-material
   models (named materials like `STEEL`, `cloth`) the app can recolour
   individual components via the existing `finishTargets`/`finishOverrides`
   path. For single baked-texture models (`material_0`) recolouring is a global
   tint only; `sampled_hex` gives the representative colour for swatch UI.

**Tasks**
- [ ] New def kind/source for IKEA imports (e.g. `IkeaGltfDef extends
      FurnitureDefBase { source:'ikea'; groupKey; variants: IkeaVariant[];
      activeVariant: string }`), or reuse `UserGltfDef` per finish + a sibling
      group reference. Decide single-def-with-variants vs def-per-finish.
- [ ] Variant picker UI in the inspector: list `variants[]` by `finish`
      (+ `sampled_hex` swatch + thumbnail), switch loads that finish's GLB.
- [ ] Map `glb_materials[].name` → `finishTargets[{key,label}]` at import so the
      existing `finishOverrides` recolour works for multi-material models.
- [ ] For single-material models, expose only a global tint (current `props.tint`).
- [ ] Skip / grey-out variants whose `glb` is `null` (not yet crawled).

---

## 5. Placement semantics → collision & auto-arrange (required)

The scraper's `design.placement` + `design.semantics` describe how the item
occupies space. Translate at import:

| Scraper | App |
|---|---|
| `placement: "wall"` or `"ceiling"` | `mounted = true` (+ a `verticalSpan` raising the base for ceiling) |
| `semantics.no_clip: true` | `noClip = true` |
| `placement: "floor"`/`"surface"` | default floor anchoring |
| `semantics.back_to_wall: true` | auto-arrange "flush to wall" role |
| `semantics.front_clearance_m` | **new** clearance the layout must preserve |

**Tasks**
- [ ] Import translator: `design` → `{mounted, noClip, verticalSpan}` on the def.
- [ ] Add optional `frontClearance?: number` (metres) to `FurnitureDefBase`.
- [ ] Consume `frontClearance` in `src/layout/clearance.ts` /
      `ClearanceOverlay` and the `autoArrange` heuristics (currently clearance
      values are hardcoded in `designRules.ts CLEARANCE`).
- [ ] Map `design.category` + `back_to_wall` to an `ArrangeRole`
      (`autoArrange.ts`).

---

## 6. Pricing / budget (small)

Scraper gives `price_numeral` + `currency` per variant.

**Tasks**
- [ ] Let imported defs carry an explicit price (extend `itemPrice()` in
      `furniturePrices.ts` to read a def-level price before the category fallback).
- [ ] Budget panel already groups by category — no change once prices flow.

---

## 7. Compatibility resolver (port from `compatibility.py`) (optional/advanced)

`compatibility.accepts_categories` + `size` lets the app, at load time, resolve
which *other imported groups* fit (e.g. mattresses/bases for a bed) — see
`python/scripts/compatibility.py` for the reference algorithm (category
whole-phrase match, depluralised, size-gated, skips groups with no GLB).

**Tasks**
- [ ] Port `resolve_compatible` to TS over the imported catalog.
- [ ] UI affordance: "Complete with…" picker showing compatible groups/finishes.
- [ ] Use it for valid product combinations (don't offer a 150×200 mattress for
      a 90×200 bed).

---

## 8. Informational metadata (optional, low effort)

Surface in an inspector "Product info" panel; no behavioural impact:
`series`, `style_group`, `materials` (part→composition), `care_instructions`,
`documents` (PDF links), `rating`, `main_image_url`/`contextual_image_url`,
`size`, `product_measurements`.

`style_group` + `series` could later drive **style-coherent suggestions** and
"complete the set" features — worth storing even if unused initially.

---

## 9. Import pipeline (glue)

The app already handles user/remote/pack GLTF (IndexedDB blobs, `runtimeUrl`
hydration, `FOOTPRINT_CACHE`). The IKEA importer needs to:

**Tasks**
- [ ] Reader: parse a group folder's `metadata.json` + load each `<finish>.glb`
      blob into the asset store (IndexedDB), keyed by article number.
- [ ] Builder: construct the def(s) from the schema in §1, applying §3/§4/§5/§6
      translations.
- [ ] Pre-seed `FOOTPRINT_CACHE[url]` from `footprint {w,d,h,anchor_offset}` so
      collision works before first render (avoids the "wait for bbox" path in
      `GltfModel.tsx`).
- [ ] Persistence/migration: imported defs must round-trip through `schema.ts`
      save/load (only runtime URLs are non-persisted; rebuild from IDB on load).
- [ ] Attribution: IKEA models are **not** CC0 — set `license`/`attribution`
      accordingly and ensure credits UI reflects their source/terms.

> ⚠️ **Licensing:** unlike the bundled CC0 assets and Poly Haven/ambientCG
> downloads, IKEA GLBs and metadata are IKEA's IP. Confirm usage terms before
> shipping imported IKEA content; this may be dev/research-only.

---

## 10. Suggested order

1. **Import pipeline skeleton** (§9) + **footprint** + **category mapping** (§3)
   → item places & collides correctly. *(MVP: an IKEA model you can drop in.)*
2. **Finishes/variants** (§4) → switch colour by loading sibling GLBs.
3. **Placement semantics** (§5) → realistic flush-to-wall / clearance behaviour.
4. **Pricing** (§6) → budget accuracy.
5. **Info panel** (§8) → materials/care/docs/rating/images.
6. **Compatibility** (§7) → "complete with" suggestions.

Each step is independently shippable.

---

## 11. Asset optimization (LOD variants) — IMPLEMENTED

Imported GLBs are heavy. Measured across the scraped set: **~30 MB decoded
texture VRAM per model on average** (worst cases 68–128 MB; multiple 2k–4k
textures on small objects), 2.19M triangles total. A furnished room of 20–30
*distinct* models is ~600 MB–1 GB of texture VRAM — too much for the low/medium
integrated-GPU quality tiers. (drei caches by URL, so cost is per unique model,
not per instance.)

**Pipeline (hybrid build-time + runtime fallback):**

- **Offline generator** — `npm run optimize:glb` (`python/scripts/optimize_glb_lod.mjs`)
  writes `<name>-low.glb` / `<name>-medium.glb` beside each original under
  `python/scripts/ikea_sg_3d_models/`. Budgets: **low** = textures ≤512px +
  ~50% triangles; **medium** = ≤1024px + ~75% triangles; **high** = original.
  Textures are resized + re-encoded to WebP via `sharp`; geometry is simplified
  with meshoptimizer (`error: 0.01`) and re-Draco-compressed. Idempotent by
  mtime; pass a path/dir arg to convert a subset; one bad file is logged and
  skipped, not fatal. Re-run after importing new models. Variants are gitignored
  (non-CC0, local-only). Verified: a 2-seat sofa went 3.68MB→1.03MB (medium)
  →502KB (low); 21.8k→16.4k→12.7k tris; 2617→1024→512px textures.
  - *KTX2 (GPU-compressed textures) is a future upgrade, not yet wired: the app
    already supports KTX2 decoding, but the generator currently always emits
    WebP. Switching `textureCompress` to `targetFormat: 'ktx2'` (gated on a
    `toktx`/basisu encoder) is the remaining step — it would cut VRAM further
    beyond the resolution win.*

- **App-side selection** — `src/furniture/gltf/lod.ts` rewrites a model URL to
  its tier variant by **sibling filename suffix** (`foo.glb` → `foo-low.glb`),
  gated by an async existence probe (`prewarmLod`) feeding a synchronous cache
  (`resolveLodUrlSync`) so it stays Suspense-compatible. `GltfModel` reads
  `qualityTier` from the store and loads the resolved URL. The footprint cache is
  keyed by the **base** URL so collision always uses the high-tier (authoritative)
  bounding box regardless of which variant renders.

- **Runtime fallback** — `src/furniture/gltf/textureBudget.ts`
  (`applyTextureBudget`) downscales over-budget textures in place when a model is
  loaded with no pre-baked variant. Textures only — geometry simplification stays
  offline (too slow for the load path). No-op on high.

> **Note on the current import flow:** §9 imports models as blob URLs
> (`URL.createObjectURL`), which have no fetchable siblings — so today those
> models take the **runtime texture fallback**, not the pre-baked variants. The
> sibling-suffix path activates for any model served by HTTP path; a future
> serve-from-path import flow gets the full geometry + texture win automatically.
