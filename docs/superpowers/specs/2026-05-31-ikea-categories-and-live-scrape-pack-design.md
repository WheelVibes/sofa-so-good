# IKEA-comprehensive categories + one-click live-scrape pack — design

**Date:** 2026-05-31
**Status:** approved design, pre-implementation

Two coupled deliverables:

- **Part A — Comprehensive furniture categories.** Grow `FurnitureCategory`
  to mirror IKEA's top-level departments and add an `others` catch-all, so the
  full IKEA catalogue import lands in sensible buckets with **no manual category
  entry** (always auto-detected).
- **Part B — One-click IKEA pack via a live scraper.** The IKEA pack's
  "download" button drives the existing Python scraper through a local Node
  **sidecar server**, streams **per-product** progress to the browser,
  optimizes each finish GLB **the moment it lands** (per product, not per
  group), writes assets into a Vite-served repo subfolder, and registers each
  group as a full `IkeaGltfDef`.

---

## Part A — Comprehensive furniture categories

### A.1 The category set (11 → 15)

`FurnitureCategory` keeps all 11 existing slugs (they map cleanly to IKEA
departments) and adds four. `others` always sorts **last**.

| Slug | Label | IKEA department |
|------|-------|-----------------|
| `beds` | Beds | Beds & mattresses |
| `seating` | Seating | Sofas & armchairs |
| `tables` | Tables | Tables & desks |
| `storage` | Storage | Storage & organisation |
| `kitchen` | Kitchen | Kitchen |
| `bathroom` | Bathroom | Bathroom |
| `appliances` | Appliances | Appliances |
| `lighting` | Lighting | Lighting |
| `decor` | Decor | Decoration |
| `textiles` | Textiles | Textiles |
| `outdoor` | Outdoor | Outdoor |
| **`electronics`** | Electronics | Home electronics |
| **`kids`** | Baby & Kids | Baby & children |
| **`laundry`** | Laundry | Laundry & cleaning |
| **`others`** | Others | *(catch-all fallback)* |

**Reconciliation decision:** map existing slugs + add new (minimal churn) —
*not* a full rename to IKEA's exact slugs. Existing builtins, autoArrange
roles, the price table, and the remote-catalog map keep working unchanged.

### A.2 Code touch points (Part A)

Adding members to the union makes TypeScript flag every **exhaustive** consumer;
that compiler error list is the authoritative checklist. Known sites:

1. **`src/furniture/types.ts`** — add `electronics`, `kids`, `laundry`,
   `others` to the `FurnitureCategory` union **and** the `FURNITURE_CATEGORIES`
   ordered array (with `others` last).
2. **`src/ui/catalog/CategoryTabs.tsx`** — `LABELS` is an exhaustive
   `Record<FurnitureCategory,string>`; add the four labels.
3. **`src/ui/catalog/CategoryIcon.tsx`** — `switch` over category (currently
   11 cases, no `default`); add four top-down SVG glyphs (electronics: TV/screen
   rectangle; kids: small chair/teddy; laundry: basket/tumble; others: dotted
   square / question-ish neutral glyph).
4. **`src/furniture/furniturePrices.ts`** — `CATEGORY_BASE:
   Record<FurnitureCategory,number>` (exhaustive); add base prices
   (electronics ~120, kids ~80, laundry ~60, others ~100).
5. **`src/ui/BudgetPanel.tsx`** — `CATEGORY_LABEL:
   Record<FurnitureCategory,string>` (exhaustive); add four.
6. **`src/ui/report.ts`** — `CAT_LABEL: Record<FurnitureCategory,string>`
   (exhaustive); add four.
7. **`src/layout/autoArrange.ts`** — `roleForCategory(cat)` `switch`; assign
   roles (electronics → like decor/surface or against-wall for TVs; kids → bed/
   seating-ish "against wall"; laundry → against-wall floor; others →
   the existing generic/`other` role). No new `ArrangeRole` required.
8. **`src/catalog/remote/category-map.ts`** — rules list with a fallback; no
   exhaustive record, so no forced change. Leave fallback as-is (`decor`) for
   the *remote CC0* providers — Part A's `others` fallback is for IKEA only
   (see A.3); revisit only if the type-checker complains.
9. **`src/ui/Minimap.tsx`** — `DOT` is `Partial<Record<…>>`; not forced. Add
   colours for the new categories for completeness (optional but recommended).

`src/furniture/categories.test.ts` is extended to assert the 15-member set and
that `others` is the final element.

### A.3 Auto-detection (no manual category)

Category is **always derived**, never entered by hand:

- **Offline scraper** (`python/scripts/categorize.py`) writes
  `metadata.json → design.category`. Add three rules (ordered before the
  generic `decor`/`outdoor` rules for specificity) and matching
  `_CATEGORY_SEMANTICS` entries; change the **final fallback** from
  `("decor","low")` to `("others","low")`.
  - `electronics`: `tv|television|monitor|speaker|soundbar|sound system|`
    `charger|smart home|remote control|headphone|earphone|router|`
    `air quality sensor` → category `electronics`.
  - `kids`: `baby|children|kids|junior|cot\b|crib|high chair|changing|`
    `nursery|toy` → category `kids`.
  - `laundry`: `laundry|drying rack|clothes airer|ironing|laundry basket|`
    `laundry bag|cleaning` → category `laundry`.
  - `_CATEGORY_SEMANTICS` defaults: `electronics` = `{placement: surface,`
    `back_to_wall: False, front_clearance_m: 0.0}` (large/heavy → floor via the
    existing surface→floor footprint refinement); `kids` =
    `{placement: floor, back_to_wall: True, front_clearance_m: 0.0}`;
    `laundry` = `{placement: floor, back_to_wall: True, front_clearance_m: 0.0}`;
    `others` = `{placement: floor, back_to_wall: False, front_clearance_m: 0.0}`
    (conservative floor anchoring — **not** `surface`, so unknown custom models
    sit on the floor rather than floating).
- **App import** (`src/furniture/ikea/translate.ts → mapCategory`): change the
  unmatched fallback from `'decor'` to `'others'`. Known categories (now
  including the three new ones) pass through with `confidence: 'high'`;
  unmatched → `others` with `confidence: 'low'`.

The Kenney pack parser (`src/catalog/packs/parsers.ts`) is unaffected (its own
filename heuristic, fallback `decor`) — out of scope for this change.

---

## Part B — One-click IKEA pack via live scraper

### B.1 Why a sidecar

The app is a **pure browser/Vite app with no backend**. A browser cannot spawn
Python/Playwright, write to repo/local folders, or run the Node LOD optimizer.
A standalone Node **sidecar server** bridges the browser and the machine.

- **Process:** `scripts/scraper-server.mjs`, started via
  `npm run scraper-server` (new package.json script). Plain Node `http`
  server (no new runtime deps; reuses `child_process`, `fs`). Default port
  e.g. `5174`; the app talks to it over `http://localhost:5174` (add a Vite
  dev proxy `'/ikea' → http://localhost:5174` so the browser uses a same-origin
  path and avoids CORS).
- **Local-dev-only:** the sidecar is never part of the production browser
  bundle. If it's not running, the pack button degrades gracefully (B.5).

### B.2 Sidecar HTTP surface

- `POST /ikea/scrape` body `{ limit?: number }` → starts a scrape run if none
  is active; returns `{ runId }`. `limit` caps product count (0/absent = full
  catalogue; small values used for tests/smoke).
- `GET /ikea/progress?runId=…` → **Server-Sent Events** stream of per-product
  events (B.4). Closes when the run ends.
- `POST /ikea/cancel` `{ runId }` → aborts the run (kills child processes,
  drains the optimize pool).
- `GET /ikea/status` → `{ running, runId? }` so the UI can detect a sidecar
  that's up and whether a run is in flight (also the liveness probe for B.5).

### B.3 Sidecar orchestration

1. **Spawn scraper.** `python ikea_model_scraper.py --out <servedDir>
   [--limit N] --progress-ndjson` as a child process. `<servedDir>` =
   `public/assets/ikea/` (B.6).
2. **Consume scraper NDJSON** (B.4) line-by-line from the child's stdout.
3. **On each `glb_written` event**, enqueue an **optimize job** for exactly that
   file into a **bounded parallel pool** (concurrency cap 2–4, default 3). The
   pool drains as GLBs land and **overlaps** ongoing scraping. Each job runs
   `node python/scripts/optimize_glb_lod.mjs <servedDir>/<group>/<finish>.glb`
   (the optimizer already accepts a path arg, is idempotent by mtime, and
   writes `-low`/`-medium` siblings). The optimizer is per-path and safe to run
   in parallel across distinct files.
4. **Emit a merged progress stream** to the SSE clients combining scraper
   events with sidecar-injected optimize-job phases per file. The scraper
   emits `queued | scraping | glb_written | done | failed` (B.4); the sidecar
   inserts an `optimizing` phase between a file's `glb_written` and its final
   `done` (which the sidecar now emits only once the optimize job for that file
   finishes). So the per-file phase sequence the browser sees is
   `queued → scraping → glb_written → optimizing → done/failed`.
5. **On group metadata finalized + ≥1 finish optimized**, emit a
   `group_ready` event carrying the group's served path so the browser can
   register it (B.7).

### B.4 Scraper changes (`ikea_model_scraper.py`)

Additive, behind flags (default run is unchanged):

- `--out <dir>`: output root for group folders + `processed_urls.txt`
  (defaults to today's `python/scripts/ikea_sg_3d_models/` when omitted, so the
  CLI keeps working; the sidecar passes `public/assets/ikea/`).
- `--progress-ndjson`: emit one JSON line per phase transition to stdout, at
  **per-product (per-finish) granularity**:
  ```jsonc
  {"group":"malm-bed-frame-high-90x200","finish":"black-brown",
   "glb":"black-brown.glb","phase":"scraping","done":3,"total":120}
  // phases: queued | scraping | glb_written | done | failed
  // group-level: {"group":"…","phase":"metadata_written"}
  ```
  `glb_written` fires the instant a finish's `.glb` is flushed to disk (this is
  the signal the sidecar optimizes on). `total` is the count of pending products
  for the run; `done` increments as finishes complete.
- The **parsing of NDJSON into events** is factored into a small pure module so
  it can be unit-tested without a live scrape (B.8). The emitter in Python is a
  thin `print(json.dumps(...))` at existing phase boundaries in `queue_worker` /
  the per-variant write path.

The scraper already scrapes parallelized via a worker queue
(`CONCURRENT_PAGES`) and tracks `processed_urls.txt`; we only add the flags +
emitter, not new scraping concurrency.

### B.5 Browser: pack entry + progress UI

- **Pack entry.** Add an "IKEA Singapore (live scrape)" card to the packs UI
  (`AVAILABLE_PACKS` / the catalog packs surface). Unlike Kenney it has no
  `downloadUrl`/`sizeBytes` zip; it's a distinct pack **kind** whose action
  calls the sidecar. Model this as a discriminated field on the pack
  (`kind: 'zip' | 'ikea-live'`) so `install.ts` stays untouched and the new
  flow is its own module (`src/catalog/packs/ikeaLive.ts`).
- **Liveness.** On opening the card, probe `GET /ikea/status`. If the sidecar
  is down, the button is disabled with help text: *"Run `npm run
  scraper-server` to enable live IKEA scraping."*
- **Progress.** Clicking download `POST /ikea/scrape`, then opens the SSE
  stream and renders a **per-product** progress panel:
  - overall `done/total` bar,
  - a compact live list of in-flight items showing `group · finish` and current
    phase (`queued → scraping → glb_written → optimizing → done/failed`),
  - failures surfaced inline (don't abort the whole run on one bad product).
  Reuse the notifications slice for the top-level run notification; the per-item
  rows are a small dedicated component fed by the SSE events (a transient store
  slice or local component state — not persisted).

### B.6 Asset destination (Vite-served repo subfolder)

- Assets land in **`public/assets/ikea/<group>/`** (`metadata.json`,
  `<finish>.glb`, and the optimizer's `<finish>-low.glb` / `<finish>-medium.glb`
  siblings), mirroring the scraper's per-group folder layout.
- Vite serves `public/` at the web root, so the browser fetches over **HTTP
  paths** (`/assets/ikea/<group>/black-brown.glb`), not blob URLs. This is what
  activates the **pre-baked LOD sibling** path (`furniture/gltf/lod.ts` rewrites
  `foo.glb → foo-low.glb` by sibling filename), fixing the blob-URL limitation
  called out in `docs/ikea-import-app-support.md` §11.
- **Gitignore** `public/assets/ikea/` — IKEA GLBs/metadata are IKEA IP (non-CC0,
  local/dev-only), consistent with the existing LOD-variant gitignore and the
  licensing warning in the import doc.

### B.7 Browser: registration → `IkeaGltfDef`

On each `group_ready` SSE event (group metadata finalized + ≥1 finish
optimized):

- Fetch `/assets/ikea/<group>/metadata.json` over HTTP, parse + validate via
  the existing `furniture/ikea/metadata.ts` (zod + `looksLikeIkeaMetadata`).
- Fetch the group's finish `.glb`s as `File`/`Blob`s and run the **existing**
  `importGroup(meta, files)` (`furniture/ikea/importGroup.ts`) → builds a full
  `IkeaGltfDef` (finish variants, footprints, placement flags, product info,
  **auto category** via `mapCategory`). This reuses tested code and keeps the
  richness (finishes/product-info/compatibility).
- **Incremental registration:** a group registers as soon as its metadata +
  first optimized finish exist; remaining finishes appear as they optimize
  (re-import/patch the def's variants as later `done` events arrive for the same
  group, deduped by `groupKey` — `importGroup` already replaces an existing
  import of the same group).
- Imported defs round-trip through `schema.ts` (already supported); only runtime
  blob/URL state is non-persisted and rebuilt on boot.

> **Note:** `importGroup` today reads GLBs from `File[]` and writes blobs to IDB,
> producing blob `runtimeUrl`s (which bypass pre-baked LOD siblings). To get the
> LOD win from B.6, the registration path should prefer the **HTTP path URL**
> for served IKEA assets over an IDB blob URL. Implementation chooses one of:
> (a) extend the IKEA def/import to carry an optional served `httpUrl` per
> variant used at render time when present; or (b) a thin served-path variant of
> the importer. Either keeps `importGroup`'s metadata/translate logic. This is
> the one place Part B extends existing code beyond pure reuse; flagged so it's
> not a surprise during implementation.

### B.8 Testing & verification (Part B)

- **Unit (pure):** NDJSON → event parser (sidecar side); optimize-pool
  scheduler (concurrency cap, drains on completion, isolates failures);
  pack-entry/liveness wiring; `mapCategory` fallback `others`.
- **Python:** `categorize.py` new rules + `others` fallback (extend its manual
  check / add a tiny pytest-free assertion script invoked in CI-style).
- **Sidecar integration (no network):** stub the scraper child with a fake that
  emits canned NDJSON + touches dummy `.glb` files, stub the optimizer; assert
  the merged SSE stream and `group_ready` ordering.
- **Visual verification (REQUIRED by CLAUDE.md):** run `npm run dev` + `npm run
  scraper-server`, click the IKEA pack download (small `limit` for speed),
  **screenshot** the per-product progress panel, then **screenshot** the catalog
  drawer showing the new category tabs/icons populated with imported items.
  Review the screenshots for rendering/UX issues and report what was seen — not
  just that shots were taken.

---

## Out of scope

- Full IKEA finish/variant **picker UI** and compatibility resolver port
  (already deferred in `docs/ikea-import-app-support.md` §4/§7) beyond what
  `importGroup` already produces.
- Production (non-localhost) scraping/serving of IKEA assets — licensing makes
  this dev/research-only.
- Re-categorizing the Kenney pack or the remote CC0 providers' fallback.

## Suggested implementation order

1. **Part A** (categories) — self-contained, TS-exhaustiveness-guided, plus the
   `categorize.py` rules. Independently shippable & verifiable.
2. **Scraper flags** (`--out`, `--progress-ndjson`) + NDJSON parser unit tests.
3. **Sidecar server** (spawn + optimize pool + SSE) with the stubbed
   integration test.
4. **Browser pack entry + progress UI + registration**, then visual
   verification.

Both `CLAUDE.md` and `README.md` get updated in the same change (per the
keep-docs-current rule): new categories, the `npm run scraper-server` command,
and the live-scrape IKEA pack flow.
