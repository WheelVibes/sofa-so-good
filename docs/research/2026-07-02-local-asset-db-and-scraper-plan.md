# Local dev asset DB + upload parallelization + scraper finalization — 2026-07-02

Planning doc for three related asks. Grounded in three code-level audits (upload
pipeline, catalog/dev-server hooks, `research/scrapers/` inventory) plus the prior
`2026-06-19-asset-integration-roadmap.md` and `-import-export-pipeline-audit.md`.

---

## Part 1 — Dev-only local asset DB (RECOMMENDED: build it)

### The ask
Drop GLB files into a local folder and have them auto-load into the furniture
catalog **without** the browser upload pipeline (convert → optimize → LOD → IndexedDB),
which is too slow for bulk datasets. Dev-server only (local filesystem); GitHub Pages
has no filesystem, only browser storage.

### Recommendation — yes, via a dev-only Vite plugin (no sidecar process)
The cleanest integration is a **custom Vite dev plugin** (not a separate
`npm run …` sidecar like `scraper-server.mjs`). It "just works" with `npm run dev`
— no second process to launch — and is impossible to reach in a production build.

**Why a plugin over a sidecar:** the scraper/price sidecars exist because they do
long-running work (crawl, price lookups) and stream progress. A local folder scan is
instant and read-only — Vite `configureServer` middleware serves it directly with zero
extra process. (A sidecar remains the right pattern for the *scraper* work in Part 3.)

### Design
1. **Folder:** `local-assets/` at repo root (gitignored; added to `server.watch.ignored`
   so it never floods the file-watcher). Optional one-level category subfolders
   (`local-assets/seating/foo.glb`); otherwise category is inferred from the filename.
   `.glb` served as-is; `.gltf`+sidecars served from the same dir (relative URIs resolve).
2. **Vite plugin** (`scripts/vite-local-assets.mjs`, added to `plugins` only in `serve`):
   - `GET /@local-assets/index.json` → scans the folder, returns
     `[{ relPath, name, bytes, subdir }]` (metadata only — category logic stays in TS).
   - `GET /@local-assets/file/<relPath>` → streams the GLB/GLTF/bin/texture, with a
     path-traversal guard (resolve + `startsWith(root)`).
   - Dev-only by construction; the routes don't exist on GitHub Pages.
3. **Feature flag** `localAssets` (`devOnly: true`, `tier: 'simple'`) in
   `features/flags/registry.ts` + the `FeatureFlag` union. `resolveFlags` forces it off
   in prod (belt-and-suspenders with the plugin only running in dev).
4. **Store slice** `localAssetsSlice` — `localFurniture: LocalGltfDef[]` +
   `bootstrapLocalAssets()`. Bootstrap fetches the index, builds defs (category via the
   existing `guessCategory`, collision flags via `inferCollisionFlags`), footprint seeded
   1×1×1 and refined on first render by the existing `FOOTPRINT_CACHE`. Called at app
   start next to `bootstrapRemoteCatalog()`, gated by `isFeatureEnabled('localAssets') &&
   import.meta.env.DEV`.
5. **Catalog merge:** add `localFurniture` as a 5th source in `buildMergedCatalog` +
   `useCatalog`/`useCatalogByCategory`/`snapshotCatalog`/`useCatalogGetter` (mechanical,
   mirrors the existing `packFurniture` merge). Def is a GLB def with `source: 'local'`,
   `url: /@local-assets/file/<relPath>` — loads via `useGLTF` like any builtin GLB. **No
   optimize, no IndexedDB** — that's the whole point (instant bulk load).
6. **Def type:** add `LocalGltfDef` to the `GltfDef` union (`kind:'gltf'`, `source:'local'`,
   `url`, `defaultFootprint`, `mounted?`, `noClip?`, `category`). `selectGltfRender`
   already switches on `source==='builtin' ? def.url : def.runtimeUrl` — extend to treat
   `local` like `builtin` (uses `def.url`).

### Non-goals / caveats
- Not a persistence store — it's a live view of a dev folder (reload re-scans).
- No optimize on load; if a user wants LOD/Draco they still use the upload path or run
  `npm run optimize:glb` offline. (Optional future: a "bake" button that runs the folder
  through the optimize worker and writes optimized siblings.)
- Prod-safe: flag `devOnly`, plugin dev-only, URLs 404 on Pages, so the catalog just has
  no local entries in prod.

---

## Part 2 — Upload-pipeline parallelization

The pipeline is already well-built (bounded worker pool in `bulkImport.ts`,
`COMMIT_BATCH=25`, source-hash dedup, best-effort optimize/LOD). Concrete wins found:

1. **Optimize worker POOL (highest value) — DONE.** `optimize/runOptimize.ts` used a single
   module-level `Worker`, serializing every file's optimize+LOD through one thread regardless
   of `bulkImport`'s `concurrency`. Replaced with a pool sized by `computePoolMax(cores,
   deviceMemory)` = `cores - 1`, hard-capped at `HARD_POOL_MAX` (8) and downshifted on
   low-RAM devices (shipped v0.9.0.65). Workers spawn **on contention** (`pickWorker`) and
   idle-teardown (terminate + drop from the pool) after `IDLE_TEARDOWN_MS` (30s) with no
   pending calls, so a burst doesn't hold its peak worker count for the rest of the session
   (2026-07-03). A worker `error`/`messageerror` retires only that worker — its own queued
   calls fall back to the unoptimized original, the rest of the pool is unaffected. Unit-tested
   with a mock `Worker` (`runOptimize.pool.test.ts`): burst > pool size, mid-task error, and
   idle teardown/timer-cancel-on-reclaim.
2. **Move conversion off the main thread (medium) — open.** `convert/convertModel.ts` runs
   three.js loaders + `GLTFExporter` on the **main thread**, competing with the render loop and
   serialized across files. Most loaders (OBJ/FBX/STL/PLY) don't need the DOM → run in a
   worker. Higher effort/risk; the natural follow-up now that the optimize pool is done.
3. **Early size-cap checks (correctness+speed, from IO-002) — DONE (GLB half).** `bulkImport.ts:
   prepareGlb` now rejects a *hopelessly* oversized converted/raw GLB **before** the optimize/LOD
   pass (2026-07-03): pre-optimize size > `EARLY_REJECT_MULTIPLIER` (3) × `MAX_GLB_BYTES` — i.e.
   >75 MB at the current 25 MB cap — is refused up front instead of burning a worker-pool slot on
   Draco/texture re-encoding it would fail anyway (a dense CAD-exported convert lands in the
   hundreds of MB, far past this line). Crucially the early gate is **not** the strict cap:
   optimize routinely shrinks 5-10× (Draco geometry + WebP textures), so a between-cap-and-3×cap
   file (e.g. 30 MB → 8 MB) keeps its optimize chance, and the **post-optimize** check remains the
   real cap, enforced on the actual bytes that would be stored. Texture decode gating on
   `file.size` before `decodeImage` (IO-001) was already done separately (v0.8.0.32).
4. **Tune `concurrency`** default from 4 → `hardwareConcurrency`-aware — open (the pool itself is
   now hardware-aware; `bulkImport`'s own `concurrency` option, which bounds convert+persist
   fan-out ahead of the pool, is still a flat default of 4).

Remaining: #2 (convert off main thread) and #4 (tune `concurrency`).

---

## Part 3 — Finalized scrapable libraries + enumeration (per `research/scrapers/`)

`research/scrapers/` already has **35 working scrapers** on shared infra
(`scraper_common.py`: rate-limit + resumable manifest + retries; `_retailer.py`: robots-aware
sitemap crawl → `<model-viewer>` GLB/USDZ extraction). Enumeration is **already solved** per
source. Finalization = prioritize + note the enumeration method + license disposition.

### Tier 1 — ship in prod (CC0 / commercial-safe, fully enumerable)
| Library | Enumeration method | Format | License | Notes |
|---|---|---|---|---|
| **Poly Haven** (HDRI + **materials/textures only**) | REST `GET /assets?t=textures`, no auth | JPG/EXR | CC0 | Wired as a **materials** provider; **furniture models are NOT sourced from Poly Haven** (product decision, 2026-07-02) |
| **Poly Pizza** | REST search pagination (`api.poly.pizza/v1.1`, free key) | GLB | CC0/CC-BY | Already a prod pack; add featured/default queries |
| **ambientCG** (materials/HDRI) | REST v2 pagination (`full_json?offset=&limit=`) | textures | CC0 | Already wired (dev proxy); prod needs a CORS proxy |
| **Google Scanned Objects** | Gazebo Fuel REST paginated listing | OBJ→GLB | CC-BY 4.0 | 1,030 items; bundle curated subset (attribution) |
| **Quaternius** | HTML scrape: listing → pack pages → ZIP | GLB (in ZIP) | CC0 | Bundle curated subset same-origin |
| **Kenney** | HTML scrape: category → pack ZIP | GLB (in ZIP) | CC0 | Furniture/Kitchen kits; dev proxy today |
| **Sketchfab** (CC0/CC-BY filter) | Data API v3 search + cursor; Download API | GLB | CC0/CC-BY | OAuth; 800k+ free; huge scale |
| **Objaverse 1.0** (CC-safe filter) | Python `objaverse` API + per-object CC metadata | GLB | per-object CC | Filter to CC0/CC-BY slice |
| **Redwood 3DScan** | JSON index + loader | PLY→GLB | public domain | Raw scans; needs cleanup |

### Tier 2 — dev-only (proprietary retailers; never bundle GLBs)
Wayfair (**official keyless 3D-model demo API** — cleanest, no scraping), Castlery (SG),
Crate&Barrel, Target, Houzz, West Elm/Pottery Barn — all via sitemap → `<model-viewer>`
extraction (the `_retailer.py` pattern). **3D-Cloud/Marxent cluster** (Macy's, Lowe's, Ashley…)
= one extraction pattern unlocks ~12 brands. **Amazon** = heavy anti-bot (`--rps 0.1`, needs
session) — treat as reference shape, not turnkey. Article/West Elm/HipVan: **verify
`<model-viewer>` on a live PDP first** (flagged unverified).

### Tier 3 — datasets (offline ingest; mostly research-only)
Commercial-safe to bundle: **GSO** (CC-BY), **Redwood** (PD), **CC-filtered Objaverse slice**.
Research/eval only (do NOT ship): ABO (CC-BY-NC), 3D-FUTURE, 3D-FRONT, ShapeNet, OmniObject3D,
Pix3D, Matterport/Replica/HM3D/ScanNet.

### Tier 4 — AI generation (on-demand)
Self-host (best license): **TRELLIS (MIT)**, Stable Fast 3D / TripoSR (MIT), Hunyuan3D 2.1.
Paid hosted: Meshy, Tripo, Rodin. Start as a dev-only generation sidecar (like the scraper).

### What's left to *do* for Part 3
The scrapers exist but only the **IKEA** one is wired into the app sidecar
(`scraper-server.mjs`). Options, in priority order:
1. **Prod, no scraping:** Poly Pizza featured queries — pure app work, source already fetches.
   (~~Poly Haven models~~ are **excluded** — furniture is not sourced from Poly Haven, 2026-07-02.)
2. **Dev bulk corpus → local asset DB (Part 1):** run the Tier-1 CC0 scrapers offline
   (`research/scrapers/*.py`) into `local-assets/` and browse them instantly via Part 1.
   This is the natural pairing — the local asset DB is the *consumer* of the scraper output.
3. **Dev retailer reference:** wire Wayfair (API) + Castlery into the scraper sidecar behind
   `devOnly` flags for reference/measurement.

**Recommended sequence:** Part 1 (local asset DB) → Part 2 (optimize pool) → run Tier-1
scrapers into `local-assets/`. (Poly Haven furniture models are excluded as a source.)

---

## Decisions taken (proceeding unless redirected)
- Local asset DB via **Vite dev plugin** + `local-assets/` folder + `localAssets` devOnly flag.
- Serve **raw** GLBs (no optimize/IDB) for instant bulk load; optimize stays opt-in via upload.
- Upload parallelization starts with the **optimize worker pool**.
- Scraper enumeration is already complete in `research/scrapers/`; finalization is the tiering
  above + wiring the highest-value sources into `local-assets/`.
- **Poly Haven furniture is NOT an asset source** (2026-07-02, user): the remote provider now
  emits materials/textures only, the `polyhaven --type models` scrape was dropped from the driver,
  and the scraped model corpus was deleted. Poly Haven materials + HDRIs are kept.
