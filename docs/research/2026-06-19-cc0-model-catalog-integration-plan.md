# CC0 Model Catalog Integration Plan — Poly Haven + Poly Pizza

**Date:** 2026-06-19
**Scope:** AI-INTEG-001 (Poly Haven models) + AI-INTEG-002 (Poly Pizza defaults) from
`docs/research/2026-06-19-asset-integration-roadmap.md`.
**Goal:** surface CC0/CC-BY *models* in the catalog as first-class, prod-visible furnish
sources — implementer-ready, sequenced into agent-sized tasks.

> Research / planning only. No code, no version bump, no TODO edits in this doc's change.

---

## 1. Current state (verified against source)

### 1a. Poly Haven — models AND textures are already fetched

The roadmap's claim is correct. `src/catalog/remote/providers/polyhaven.ts`:

- `fetchIndex()` (`polyhaven.ts:85`) fetches **both** `/assets?t=models` and `/assets?t=textures`
  in parallel and emits `RemoteEntry`s with `kind:'furniture'` for models and `kind:'material'`
  for textures. Model entries get a `FurnitureCategory` via `mapPolyHavenFurnitureCategory`
  (`category-map.ts`).
- `fetchAsset()` (`polyhaven.ts:134`) has a full **furniture (model) path**: pulls
  `gltf[resolution].gltf` + every `include` dependency (`.bin` + texture jpgs) and returns an
  `AssetBundle` of `kind:'furniture'`.
- `fetchSize()` sums model file bytes for the download-size warning.
- `bundleToFurnitureDef()` (`resolver.ts:49`) already builds a `RemoteGltfDef`
  (`id:'<provider>:<slug>:<resolution>'`, `source:'remote'`, `license:'CC0'`,
  `defaultFootprint:{w:1,d:1,h:1}`) by rewriting `images[].uri`/`buffers[].uri` to blob URLs.
- `providers/index.ts`: `PROD_PROVIDER_IDS = ['polyhaven']`, so Poly Haven bootstraps in a
  **production** build (CORS-direct, `api.polyhaven.com` + `cdn.polyhaven.com`). No proxy needed.

**Most important finding — Poly Haven models are ALREADY in the catalog grid, ungated.**
`src/ui/catalog/useUnifiedCatalog.ts` calls `useRemoteEntries('furniture')` and appends every
remote furniture entry (whose category is a real `FurnitureCategory`) into `byCategory[...]`
(`useUnifiedCatalog.ts:69-75`). `CatalogDrawer` renders those as `RemoteCard`s
(`CatalogDrawer.tsx:176`) and bootstraps the remote index whenever the drawer opens
(`CatalogDrawer.tsx:100-102`). Clicking a `RemoteCard` calls `resolveRemoteAsset` → downloads →
`bundleToFurnitureDef` → arms placement via `setActiveDefId(key)`.

So the *plumbing is done end-to-end already* and Poly Haven chairs/sofas/etc. surface in
production right now. **What is wrong / missing is governance + correctness, not plumbing:**

1. **No feature flag.** There is no `remoteFurniture` flag. The materials side has one
   (`remoteMaterials`, pro, `registry.ts:136`) and `RemoteBrowseTab` (the *materials* browser in
   `FinishPicker`) is gated by it. But the *furniture* path in `useUnifiedCatalog` /
   `CatalogDrawer` has **zero** `useFeature` gate. This violates CLAUDE.md's "every feature behind
   a flag" + "Simple is minimal" rules — remote CC0 models show even in Simple mode today.
2. **No Simple/Pro tiering.** Because there's no flag, remote furniture can't be forced off in
   Simple mode the way `resolveFlags` does for pro features.
3. **Footprint/scale is naive.** Every `RemoteGltfDef` ships `defaultFootprint:{w:1,d:1,h:1}`
   (`resolver.ts:90`). The real footprint is only learned after the GLB renders and `GltfModel`'s
   bbox effect caches it (`GltfModel.tsx:232-268`) — so the *pre-placement* collision check uses a
   1×1×1 m guess. Poly Haven models are real-world-metre-scaled (unlike Kenney), so this is
   usually fine, but there is no equivalent of `scaleHeuristic.ts`/`scaledFootprint` (used by the
   pack path) for remote items, and no metre-normalisation safety net for an oddly-scaled GLB.
4. **No attribution surfacing for furniture.** `RemoteCard` shows a `CC0` badge + attribution in
   the tooltip; CC0 needs none. Fine for Poly Haven. (Becomes relevant for Poly Pizza CC-BY below.)

### 1b. Poly Pizza — prod pack, key-gated, search-only

`src/catalog/packs/registry.ts` registers `poly-pizza` (`kind:'poly-pizza'`, **not** `devOnly` →
prod-visible via `visiblePacks(isDev)`). `src/catalog/packs/polyPizza.ts` is a CORS-friendly
in-browser client (`https://api.poly.pizza/v1.1`, `x-auth-token` header, `static.poly.pizza` CDN),
with a tolerant `parseModels` and a `guessCategory` heuristic. `installPolyPizzaPack`
(`install.ts`) renders thumbnails, measures footprints via `glbFootprint`, applies
`packEntryScale`/`scaledFootprint`, and registers entries into the installed-packs catalog. CC-BY
attribution is captured per model (`PolyPizzaModel.attribution`) and stored on the pack entry.

The UI is `PolyPizzaCard` in `PacksTab.tsx:200`. **Gaps vs. the goal:**

1. **Requires an API key before anything happens** — `onDownload` errors out with "Enter your Poly
   Pizza API key first" if blank (`PacksTab.tsx:209`). There is **no first-run / no-key starter
   set** and **no curated featured/default queries** — the user must know a search term and own a
   key. The pack is gated by `packs` (pro) too, so it's invisible in Simple mode.
2. **No "featured" tab / curated picks.** `query.trim() || 'furniture'` is the only default
   (`PacksTab.tsx:218`) — a single generic search, not a hand-picked HDB/condo-relevant set.

### 1c. Flags + tiering recap (`features/flags/registry.ts`, `flags/resolve`)

- `packs` — pro, default on (gates the Packs tab → Poly Pizza).
- `remoteMaterials` — pro, default on ("CC0 material browser" → gates `RemoteBrowseTab` materials).
- `modelUpload` — simple, default on.
- **No `remoteFurniture` flag exists.** ← the central missing piece for AI-INTEG-001.
- `resolveFlags(isDev, overrides, isAdmin, uiMode)` forces `devOnly` off in prod and `pro` off in
  Simple. Tests drive both modes via `resolveFlags(..., 'simple')` vs `'pro'`, or by setting
  `uiMode` then `reresolveFeatureFlags()`.

### 1d. Net "missing" list

| # | Missing | Owner task |
|---|---|---|
| M1 | A `remoteFurniture` feature flag (tier + default) | AI-INTEG-001a |
| M2 | Gate the catalog grid's remote-furniture cards on that flag (desktop + mobile parity) | AI-INTEG-001a |
| M3 | Tier-test (hidden in Simple, present in Pro) | AI-INTEG-001a |
| M4 | A metre-sanity / footprint seed for remote GLBs before render | AI-INTEG-001b |
| M5 | Poly Pizza curated featured/default queries (no-search-term path) | AI-INTEG-002a |
| M6 | Poly Pizza optional no-key first-run starter set | AI-INTEG-002b |
| M7 | CC-BY attribution surfaced in the inspector + CREDITS for Poly Pizza models | AI-INTEG-002a |

---

## 2. Plan — Poly Haven models (AI-INTEG-001)

The work is **governance + correctness over already-working plumbing**, not new fetch code.

### 2.1 Feature flag (`remoteFurniture`)

Add to `FEATURE_FLAGS` (`src/features/flags/registry.ts`), mirroring `remoteMaterials`:

```
remoteFurniture: {
  label: 'Online models',
  description: 'CC0 3D-model browser (Poly Haven)',
  default: true,      // CORS-direct CC0 → prod-safe
  tier: 'pro',        // advanced/external content → hidden in Simple, parity with remoteMaterials
}
```

Rationale for `pro`: Simple mode must stay the minimal core loop (built-ins + uploads). External
fetched-model browsing is an advanced surface, exactly like `remoteMaterials` and `packs`. Default
`true` because Poly Haven is CORS-direct CC0 (no proxy, no licence risk).

> Note: `FeatureFlag` is the keyof `FEATURE_FLAGS`, so adding the key is the only type change;
> `FEATURE_FLAG_KEYS` derives automatically.

### 2.2 Gate the catalog grid

The remote-furniture cards enter the grid in **one place** — `useUnifiedCatalog` — so gate there
(cleanest, single chokepoint) and/or in `CatalogDrawer`:

- **Preferred:** pass a `includeRemote: boolean` into `useUnifiedCatalog` (from
  `useFeature('remoteFurniture')` in `CatalogDrawer`), and skip the
  `byCategory[...].push({kind:'remote',...})` loop (`useUnifiedCatalog.ts:69-75`) plus the
  favourites remote-resolution branch when false. Counts then naturally exclude remote.
- Also guard the remote **bootstrap**: `CatalogDrawer.tsx:100-102` currently calls
  `bootstrapRemoteCatalog()` whenever the drawer opens. Gate it on
  `useFeature('remoteFurniture') || useFeature('remoteMaterials')` (materials still needs the index
  via `FinishPicker`). Don't fetch the model index at all when both are off.
- Mobile parity: the mobile catalog uses the same `CatalogDrawer`/`useUnifiedCatalog`, so gating at
  the hook covers both. Verify no second remote-furniture render path exists (grep
  `useRemoteEntries('furniture')` — only `useUnifiedCatalog` consumes it today).

No `COMMAND_FLAGS` entry needed (no ⌘K command opens a remote-furniture-only surface; the catalog
drawer itself isn't flag-gated).

### 2.3 Footprint / scale / collision-flag handling for fetched GLBs

What exists: `bundleToFurnitureDef` hard-codes `defaultFootprint:{w:1,d:1,h:1}` and **no**
`verticalSpan`/`mounted`/`noClip`. After first render, `GltfModel`'s bbox effect
(`GltfModel.tsx:232-268`) caches the true footprint (clamped ≥0.05 m, with center offset) and the
support-plane, so collision self-corrects once visible. Poly Haven models are authored in real
metres, so this is acceptable for the common case.

Recommended hardening (small, optional, ship behind the same flag):

1. **Better pre-render footprint seed.** Poly Haven's `/files/{slug}` payload does not include
   bbox dims, so we can't know the size before download. Two cheap options:
   - Keep `{1,1,1}` (status quo) — acceptable; the post-render cache fixes collision within a frame.
   - OR after `fetchAsset`, parse the gltf `accessors`/`meshes` min/max in `bundleToFurnitureDef`
     to compute a real bbox and set `defaultFootprint` from it (no extra network). **Preferred** —
     makes the *first* placement collision-check honest. Add a unit test on a tiny gltf fixture.
2. **Collision flags.** Poly Haven models are decor/furniture (floor-standing); leaving
   `mounted`/`noClip` unset (floor-anchored, full collision) is correct. No category in
   `mapPolyHavenFurnitureCategory` maps to wall/ceiling items, so no special-casing needed now.
3. **Metre sanity clamp (defensive).** If a future provider GLB is in cm/inches, the bbox would be
   100× off. Optional: in `bundleToFurnitureDef`, if the computed longest horizontal axis is
   absurd (>6 m or <0.05 m), apply a normalising scale to `defaultFootprint` only (don't rescale
   the mesh — Poly Haven is correct, so this branch should never fire for it; it's a guardrail for
   reuse). Lower priority; can defer.

### 2.4 Attribution display

CC0 → no attribution required. `RemoteCard` already shows a `CC0` badge + the attribution string in
the tooltip (`RemoteCard.tsx:120-134`), and `RemoteGltfDef` carries `attribution`/`license:'CC0'`
(`resolver.ts:98-100`). The inspector + `CREDITS.json` path exists for CC-BY but Poly Haven needs
nothing extra. **No change.**

### 2.5 Category mapping

`mapPolyHavenFurnitureCategory` (`category-map.ts`) maps PH categories → 6 furniture categories,
defaulting to `decor`. Adequate. Optional polish (defer): extend rules to map more PH model
categories (`bathroom`, `electronics`, `outdoor`) since the unified grid drops any remote entry
whose category isn't a real `FurnitureCategory` (`useUnifiedCatalog.ts:73`) — currently anything
unmapped lands in `decor`, which is fine but coarse.

### 2.6 CORS / prod

None needed. `polyhaven` is already in `PROD_PROVIDER_IDS`; API + CDN send CORS headers. This task
ships to **production** with `default:true`.

### 2.7 Headless verification (sandbox can't fetch)

Mirror `src/catalog/remote/__tests__/integration.test.tsx`: `vi.mock('../providers', …)` returning
a fake `polyhaven` whose `fetchIndex` yields a `kind:'furniture'` sample and `fetchAsset` returns a
`{kind:'furniture', gltfJson, bin, textures}` bundle. Assertions:

- `bootstrapRemoteCatalog()` → `remoteIndexes.polyhaven.status === 'ready'` with the furniture entry.
- `resolveRemoteAsset(furnitureEntry, '2k')` → `resolvedRemoteFurniture['polyhaven:<slug>:2k']` is a
  `RemoteGltfDef` (`kind:'gltf'`, `source:'remote'`, `license:'CC0'`).
- **Flag/tier test (both modes):** `resolveFlags(false, {}, false, 'simple').remoteFurniture ===
  false` and `…, 'pro').remoteFurniture === true`; and a `useUnifiedCatalog`/`CatalogDrawer` render
  test asserting remote cards are **absent in Simple, present in Pro** (set `uiMode` +
  `reresolveFeatureFlags()`), per the "Test BOTH modes" rule.
- If 2.3 option (gltf-min/max footprint) is taken: a parser unit test on a fixture gltf with known
  `accessors[].min/max` → expected `defaultFootprint`.

No network, no GLB render needed (footprint-from-render is already covered by existing GltfModel
tests; the new test targets the def builder + flag gate).

---

## 3. Plan — Poly Pizza defaults (AI-INTEG-002)

### 3.1 Curated featured / default queries (AI-INTEG-002a)

Add a small curated list of HDB/condo-relevant terms, e.g.
`['sofa','dining chair','coffee table','bed','wardrobe','floor lamp','bookshelf','plant']`, as a
const in `polyPizza.ts` (e.g. `POLY_PIZZA_FEATURED`). In `PolyPizzaCard` (`PacksTab.tsx:200`):

- Render the curated terms as one-tap chips above/below the search field; tapping a chip sets the
  query and runs `installPolyPizzaPack` for that term (still key-gated unless 3.2 lands).
- Keep the free-text search. This is pure UI + a const; CC-BY attribution already flows through
  `PolyPizzaModel.attribution` → installed pack entry.

### 3.2 No-key first-run starter set (AI-INTEG-002b)

Two viable paths — pick per how strict we are about bundling:

- **Path A (preferred, prod-clean): build-time bundled starter pack.** A `scripts/` ingest (using
  `research/scrapers/poly_pizza_scraper.py` as the API reference) fetches a small curated CC0/CC-BY
  set once at build time with a maintainer key, runs them through `optimize/runOptimize.ts`
  (Draco/meshopt/WebP + LOD siblings), and bundles them as a static, same-origin `kind:'zip'`-style
  pack (reuse pack install + `parseEntries`). Ships in prod with **no runtime key**; CC-BY items
  carry attribution → inspector + `CREDITS.json`. This is the same pattern the roadmap prescribes
  for GSO/Quaternius (AI-INTEG-004).
- **Path B (runtime, key-optional): bundled maintainer key for a tiny featured fetch.** The API is
  CORS-friendly, so a small build-injected key (env var, not committed) could power a "Load
  featured" button with no user key. Riskier (key quota/exposure) — Path A is cleaner and avoids
  shipping a credential. **Recommend Path A.**

Either way: still gated by `packs` (pro) today — to make it visible in Simple's core loop would
need its own simple-tier flag or surfacing the bundled starter set as plain built-in catalog
entries (out of scope here; note as follow-up).

### 3.3 CC-BY attribution handling

Already captured (`PolyPizzaModel.attribution`, normalised license in `parseModels`). Ensure the
bundled/curated path writes attribution to the pack entry AND that it reaches the inspector +
`CREDITS.json` (the per-entry attribution field already exists on pack entries — verify the
inspector reads it for `kind:'poly-pizza'`/bundled pack defs). Add a test that a CC-BY model's
attribution survives `parseModels` → installed def (mocked fetch, like the integration test).

---

## 4. Sequenced task list (agent-sized)

| ID | One-line | Files touched | Effort | Prod/Flag | Conflict group |
|---|---|---|---|---|---|
| **AI-INTEG-001a** | Add `remoteFurniture` flag (pro, default on); gate remote-furniture cards + remote bootstrap in the catalog grid; tier-test both modes | `features/flags/registry.ts`, `ui/catalog/useUnifiedCatalog.ts`, `ui/catalog/CatalogDrawer.tsx`, new `useUnifiedCatalog`/flag tests | **S** | **Prod**, flag `remoteFurniture` | A (flags + catalog-ui) |
| **AI-INTEG-001b** | Seed `RemoteGltfDef.defaultFootprint` from the gltf accessor min/max in `bundleToFurnitureDef` (+ defensive metre clamp); unit-test on a fixture | `catalog/remote/resolver.ts`, `catalog/remote/resolver.test.ts` | **S** | **Prod** (same flag) | A (sequence after 001a; same files-adjacent) |
| **AI-INTEG-002a** | Poly Pizza curated featured/default query chips; verify CC-BY attribution flows to inspector/CREDITS; test | `catalog/packs/polyPizza.ts`, `ui/catalog/PacksTab.tsx`, polyPizza test | **S** | **Prod** (under existing `packs` flag) | B (packs) |
| **AI-INTEG-002b** | No-key first-run starter set — build-time bundled curated Poly Pizza pack (Path A) via `scripts/` ingest → `runOptimize` → static pack | `scripts/` ingest, `catalog/packs/registry.ts`, parser, `CREDITS.json` | **M** | **Prod** (CC-BY, attribution) | B (packs) / D (offline-ingest) |

**Sequencing & parallelism:**

- Group **A** (001a → 001b) is one focused PR; 001a is the gate, 001b hardens footprint. They touch
  overlapping areas (`resolver.ts` vs catalog-ui) so do 001a first, 001b second (or together).
- Group **B** is independent of A — different files (`packs/*`, `PacksTab`). 002a (S, pure UI+const)
  can ship immediately; 002b (M, build-time ingest) is the heavier follow-up and overlaps the
  roadmap's D (offline-ingest) tooling.
- A and B can run in **parallel** (no shared files).

**Verification without network (all tasks):** unit tests with `vi.mock('../providers', …)` /
`fetchImpl` injection (Poly Pizza's `searchPolyPizza` already takes `opts.fetchImpl`); flag/tier
tests via `resolveFlags(..., 'simple'|'pro')` and `uiMode`+`reresolveFeatureFlags()`; render tests
asserting card presence/absence per mode. The 001b footprint test runs on a static gltf JSON
fixture (no GLB render). Visual verification (drawer screenshot, place a Poly Haven model) is the
final manual step for 001a per CLAUDE.md, but is **not** blocked by the sandbox's lack of network
for the unit layer.

---

## 5. Blocked-on-proxy vs. doable-now (honest)

- **Doable now, no proxy (prod):** AI-INTEG-001a, 001b, 002a. Poly Haven is CORS-direct
  (`PROD_PROVIDER_IDS`), Poly Pizza is a CORS-friendly API/CDN. None need the AI-INTEG-003 prod
  proxy.
- **Doable now, no proxy, but heavier:** AI-INTEG-002b (build-time bundle) — same-origin static
  pack, the ingest runs offline with a maintainer key; no runtime proxy. The only "cost" is a
  one-time maintainer Poly Pizza key + a curation pass.
- **Not blocked by this plan, flagged for honesty:** runtime ambientCG materials, retailer scrapes,
  and OAuth model sources (Sketchfab/CGTrader) remain blocked on AI-INTEG-003 (prod CORS proxy) /
  a backend — out of scope here, already tracked in the roadmap.

**Net:** the Poly Haven + Poly Pizza model integration is **prod-shippable today** with no proxy.
The single most important fix is governance — adding the `remoteFurniture` flag and tiering the
already-live (but ungated) Poly Haven model grid so it obeys the Simple/Pro contract.
