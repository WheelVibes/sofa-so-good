# HDB 3D Interior-Design Sandbox — architecture guide

A browser 3D sandbox of an accurate Singapore HDB 4-room flat for interior
design: furnish it, finish surfaces, light it across the day, and walk
through it. React + TypeScript + Three.js via @react-three/fiber, Zustand
state, Vite build, Vitest tests.

## Commands
- `npm run dev` — Vite dev server (localhost:5173).
- `npm test` — Vitest (run once). `npm run test:watch` to watch.
- `npm run build` — `tsc` typecheck + Vite production build.
- `npm run docs:dev` / `docs:build` / `build:all` — the **user guide** is a
  VitePress site under `docs/user/` (config in `docs/user/.vitepress/config.ts`,
  `base: '/sofa-so-good/docs/'`). `docs:build` writes it into the app's
  `dist/docs/`; `build:all` = `npm run build` **then** `docs:build` (order
  matters — the app build empties `dist/` first) and is what `deploy.yml` runs,
  so the guide deploys at `/sofa-so-good/docs/`. An in-app **User guide** button
  (toolbar + Help modal + ⌘K) opens it via `src/ui/docsUrl.ts` (host-agnostic
  `${import.meta.env.BASE_URL}docs/`). (Dev caveat: the guide only exists in
  a built `dist/`; use `docs:dev`/`docs:preview` to view it locally — those
  default to port 5175, shared with `price-server`, so don't run both at once.)
- **Developer docs** under `docs/developer/` are Markdown guides, **not
  deployed**, with their own local-only VitePress site (config in
  `docs/developer/.vitepress/`): `npm run docs:dev:developer` (port 5176) /
  `docs:build:developer` / `docs:preview:developer` render them with VitePress's
  nav/search/dark-mode. Both doc sites share a warm-clay palette + responsive CSS
  in `docs/_shared/docs-theme.css` (imported via each `.vitepress/theme/`). The
  developer site builds to its own gitignored `.vitepress/dist` and never enters
  the app's `dist/` (no `base`/`outDir` overrides), so it can't leak into prod.
- `npm run check` / `npm run check:fix` — **Biome** (single Rust tool, replaces
  Prettier + ESLint) format + lint; `check:fix` applies safe fixes. `npm run
  format` (format-write) and `npm run lint` (lint only) are narrower variants.
  Config in `biome.json`: 2-space / 100-col / single-quote / no-semicolons /
  trailing-commas; recommended rules with noisy non-bug rules disabled (a11y
  `useButtonType`/`noSvgWithoutTitle`/interactive rules, `noArrayIndexKey`,
  `noNonNullAssertion`, `useLiteralKeys`; `noExplicitAny` is a warning).
  `python/` is excluded. CI (`.github/workflows/ci.yml`) enforces format-check
  + `tsc`; lint is reported non-blocking until the ~26-finding backlog clears.
  A **pre-commit hook** (`.githooks/pre-commit`, auto-installed by the
  package.json `prepare` script which runs `git config core.hooksPath
  .githooks` on `npm install`) runs `biome check --staged` and blocks the
  commit on any format/lint error in staged files — bypass with `git commit
  --no-verify`.
- `node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]` —
  Puppeteer screenshot harness (software WebGL). Actions support
  drag/rdrag/wheel/click/type/key/wait. In dev the store is exposed on
  `window.__store` for scripting. `scripts/crop.mjs` crops at full res;
  `scripts/perf.mjs` reports heap/fps under load.
- `npm run optimize:glb` — offline GLB LOD pass
  (`python/scripts/optimize_glb_lod.mjs`): generates `-low`/`-medium` tier
  variants of every GLB under the IKEA model dir (see **GLB LOD pipeline**).
- `npm run compress:glb-textures <dir|file> [--out <dir>] [--etc1s] [--dry-run]`
  — offline **full-resolution, codec-only** KTX2 re-encode
  (`python/scripts/compress_glb_textures.mjs`): swaps a GLB's embedded
  PNG/JPEG/WebP textures for KTX2 Basis-Universal **UASTC** (visually lossless;
  `--etc1s` = smaller/slightly-lossy colour) while keeping **full resolution and
  the original geometry** (Draco untouched, no mesh decimation) — distinct from
  `optimize:glb`, which makes *downscaled + decimated* LOD proxies. Targets the
  `high`/"Original" asset tier the app loads verbatim. ~73% of GLB bytes are
  textures, so a UASTC pass cuts the IKEA corpus roughly 35–45%. Needs the
  KTX-Software `toktx` binary **and** `@gltf-transform/cli` (gltf-transform's
  `textureCompress` does not support KTX2 in v4.x); without them it exits with
  guidance and writes nothing, so it's safe to run anywhere / dry-run.
- `npm run scraper-server` — local Node sidecar (`scripts/scraper-server.mjs`)
  that drives the IKEA scraper for the one-click **IKEA Singapore (live scrape)**
  pack: spawns `ikea_model_scraper.py --out public/assets/ikea --progress-ndjson`,
  runs `optimize_glb_lod.mjs` on each finish GLB the moment it lands (bounded
  parallel pool), and streams per-product progress to the browser over SSE.
  Local/dev-only (default port 5174; `SCRAPER_PORT` overrides). See **IKEA models**.
- `npm run price-server` — local Node sidecar (`scripts/price-server.mjs`) for
  the Shopping panel's **dev-only "Live IKEA SG prices"** toggle: `GET /price?q=
  <name>` resolves a furniture name to a real IKEA Singapore price + buy link via
  IKEA's SIK search JSON API, disk-cached (`.cache/prices.json`). Local/dev-only
  (default port 5175; `PRICE_PORT` overrides). See **Live retail pricing**.
- `python/scripts/` — offline IKEA SG scraper + asset tooling (Python +
  Node). Not part of the app build; see **IKEA scraper (offline)** below.

## REQUIRED: keep CLAUDE.md + README.md + docs current
These have drifted from the code before. After **any** change that adds,
removes, or reshapes a system, command, layout area, or user-facing feature,
update **all** of the following in the same change so they never lag the repo:
- **`CLAUDE.md`** (this architecture index) and **`README.md`** — the terse,
  always-current state.
- **User docs** (`docs/user/`, the deployed VitePress guide) — if the change is
  **user-facing** (a feature, control, panel, shortcut, or workflow a user sees),
  add/update the relevant page(s) and capture a screenshot where it helps. Keep
  pages accurate to the actual UI (verify labels/actions against the source, as
  the catalog tabs / context-menu items are exact).
- **Developer docs** (`docs/developer/`, the local-only VitePress guide) — if the
  change touches **architecture, a system, or a how-to recipe**, update the
  relevant guide and cross-link the spec under `docs/superpowers/specs/`.

(`TODO.md` tracks deferred work per the Process rule; the above track the
*current* state.)

## REQUIRED: visual verification after any app change
For **any** change to the app (not docs/tests-only), you MUST, before
considering the work done: (1) run the app, (2) exercise the functionality you
added or changed — driving the store via `window.__store` and the `scripts/shot.mjs`
actions where UI interaction is needed, (3) capture screenshot(s) of the result,
and (4) **visually review** the screenshots yourself for UI/UX bugs, rendering
artifacts, or regressions. `npm test` + `tsc` passing is NOT sufficient — a green
suite never proves the rendered result looks right. Report what you saw in the
screenshots, not just that you took them.

**Before driving the app, read
[docs/visual-verification-playbook.md](docs/visual-verification-playbook.md)** —
it captures the harness rules, the known interaction gotchas (location-prompt
modal, camera framing, on-screen-to-mount, exposing module functions, render-
populated cache races, dev-server restarts, Draco decoding) and their fixes, plus
a known-good evalFile template. **Whenever you solve a new interaction or
screenshot problem, add the fix to that playbook** so the next agent doesn't
rediscover it.

## Layout of the code
- `src/state/` — Zustand store split into slices (`slices/*`): items,
  selection, finishes, doors, time, location, camera, ui (incl. quality +
  snap grid), placement, clipboard, history, remote catalog, installed packs,
  measurements, orientation, notifications, reset, **userAssets**
  (user-uploaded GLBs + imported `IkeaGltfDef`s — see **IKEA models**), and
  **floorPlan** (editable apartment shell + editor state + saved-plan library),
  **appearance** (theme + light/dark/auto mode — see **Design system**),
  **features** (command-palette / layers-mode / context-menu / onboarding UI
  state), and **userStyles** (user-saved finish styles — per-room floor/wall
  finishes captured from the current design, persisted in `localStorage`
  (`hdb_user_styles`), re-appliable from the Arrange menu's "My styles"; not in
  the autosave/schema). Persistence + migrations under `storage/` (layout autosave;
  `qualityPrefs.ts` graphics prefs; `editorPrefs.ts` snap/grid;
  `appearancePrefs.ts` theme+mode → `[data-theme]`/`[data-mode]` on `<html>`;
  `floorPlanStore.ts` plan library
  + active custom plan; `hydrate.ts`/`hydrateAssets.ts` re-resolve user/IKEA
  defs + their IDB blobs on boot). `schema.ts` is the save/load serializer
  (round-trips parametric items, user GLBs, and IKEA defs).
- `src/apartment/` — the default flat. `constants.ts` is the source of truth
  for walls/doors/windows/rooms (derived from the floor-plan SVG). `walls/`,
  `floor/`, `Window.tsx`, `Door.tsx`, `Ceiling.tsx`, plus a grounding slab in
  `Apartment.tsx`. `PlanShell.tsx` renders a user-authored plan instead (walls
  extruded with openings + `floor/PlanRoomFloor.tsx` per-room finishes) when a
  non-default plan is active.
- `src/floorplan/` — the editable floor-plan model: `types.ts` (FloorPlan =
  walls/openings/rooms + area/bounds helpers), `defaultPlan.ts` (seeds the
  plan from `apartment/constants`), `planGeometry.ts` (plan → renderable wall
  boxes + door-aware collision walls; `isDefaultPlan`), `templates.ts` (starter
  apartments). The 2D editor is `ui/floorplan/` (FloorPlanEditor + PlanInspector).
- `src/furniture/` — catalog + rendering. `builtinCatalog.ts` lists every
  parametric item; `catalog.ts` merges built-ins, installed packs, and user/
  IKEA defs (footprints resolved). Parametric items map to a component in
  `primitives/` (registered in `primitives/index.ts`); GLB items (bundled CC0,
  user uploads, IKEA) render through `GltfModel.tsx` (`gltfRender.ts` picks the
  url/scale/tint/finish-overrides per item). `defaults/` is the move-in-ready
  layout; `lightEmitters.ts` registers which items emit light at night.
  - `gltf/` — GLB plumbing shared by every GLB item: `decoders.ts` (Draco at
    boot, meshopt/KTX2 auto-wired), `lod.ts` (tier budgets + `-low`/`-medium`
    url helpers + sync probe cache + prewarm), `textureBudget.ts` (runtime
    texture downscale fallback), `finishTargets.ts` (named meshes for
    per-component recolour).
  - `convert/` — **in-browser multi-format → GLB conversion** so non-GLB uploads
    become a GLB before the unchanged `validateGlbFile → persistUserGlb` path:
    `formats.ts` (`detectModelFormat` via magic bytes + extension,
    `MODEL_EXTENSIONS`/`isModelEntryFile`, per-format size caps —
    glb/gltf/obj/fbx/stl/ply/dae/3mf/usdz), `loadToObject.ts` (per-format three
    example-loader registry + a `LoadingManager` sibling-blob-URL resolver so
    OBJ→MTL→tex / DAE→tex / glTF→bin refs resolve from the dropped folder, missing
    refs → a 1×1 transparent PNG), `toGlb.ts` (`GLTFExporter` → binary GLB), and
    `convertModel.ts` (orchestrator: detect → size-check → load → export, throws
    `ConvertError`; `needsConversion` is true for anything but a native GLB).
  - `optimize/` — **in-browser GLB optimize pass** run on every imported model
    (converted + plain GLB upload): `optimizeGlb.ts` (pure, worker-safe
    gltf-transform pipeline — weld/dedup/prune + Draco, plus per-texture WebP
    re-encode via OffscreenCanvas; **quality-first/codec-only** — geometry shape
    preserved, no mesh simplify, textures keep resolution unless above
    `maxTextureSize`; never throws — returns the input unchanged on any failure,
    and skips Draco/textures gracefully when the wasm/canvas APIs are absent),
    `optimize.worker.ts` (Web Worker entry), `runOptimize.ts` (main-thread wrapper
    that posts to the worker and falls back to a direct call). KTX2/UASTC is an
    opt-in routed through `src/lib/ktx2encode.ts` (see **Design system** /
    `optimizeGlb`'s `ktx2` option), falling back to WebP when no encoder is
    available.
  - `ikea/` — consumes IKEA scraper output: `metadata.ts` (zod parse +
    `looksLikeIkeaMetadata`), `translate.ts` (scraper category/placement → app
    category + collision flags + `frontClearance`), `importGroup.ts` (metadata +
    GLB files → one `IkeaGltfDef`, writes blobs to IDB, seeds footprints),
    `compatibility.ts` (category-rule "accepts" resolver), `detectGroups.ts`
    (`detectGroups` — auto-detects **every** `metadata.json` IKEA group folder
    among picked files, each scoped to its own folder via `filesUnder`;
    `looseModelFiles` is the non-group remainder — used by the Upload dialog).
    Wired end-to-end (see **IKEA models**).
  - `upload/` — user-model import (now **any supported model format**, not just
    GLB): `isModelFile` spans every `convert/formats.ts` extension, and
    `bulkImport.ts`'s `prepareGlb` (exported as `prepareModelFile` for the
    single-file dialog path) **converts (if non-GLB) + optimizes** each entry —
    `convertModel` → `runOptimize` — before `persistUserGlb`, threading a sibling
    file pool (for .mtl/.bin/texture resolution) and an opt-in `ktx2` flag through
    `BulkImportOptions`/`ImportPlan`. Files: `validate.ts`, `bulkImport.ts`, `persist.ts`,
    `inferFlags.ts` (`inferCollisionFlags` — per-file `mounted`/`noClip` guessed
    from the filename, e.g. rug/mat → noClip, pendant/sconce/wall-art/range-hood
    → mounted; OR'd with the batch checkboxes, gated by the dialog's default-on
    "Auto-detect …" toggle, so a mixed folder drop gets per-item collision
    without manual tagging),
    `hashFile.ts` (SHA-256 content hash — `persist`/`bulkImport` skip a re-upload
    of identical bytes, counting it as a duplicate; the hash rides on
    `UserGltfDef.contentHash`, persisted in IDB meta + the save schema, rehydrated
    on boot), `readDrop.ts` (recurse dropped folders → `File[]` with relative
    paths via a **bounded worker pool** (`READ_CONCURRENCY`) so a big folder reads
    its entries concurrently, not one-at-a-time; entries captured synchronously in
    the drop event before any await; `onProgress(count)` for live scan feedback),
    and `runImport.ts` (`runImport`/`startBackgroundImport` — the import engine:
    imports detected groups through a bounded pool (`GROUP_CONCURRENCY`, parallel
    — was a serial loop) + loose files through the bulk path, all **off the
    modal** as a background job tracked by one `notify` progress notification, so
    closing the dialog doesn't cancel it). **Store writes are batched**: groups
    build with `importGroup(…, {commit:false})` and flush via
    `addManyUserFurniture` every `COMMIT_BATCH` (bulk import + `persistUserGlb`
    `{commit:false}` do the same) — committing *per* item re-ran
    `buildMergedCatalog` (O(total)) in every subscriber for all N items (**O(n²)**),
    starving the render loop on a multi-thousand import until the browser killed
    the WebGL context (**white flicker**); batching makes it a few dozen rebuilds.
    Progress is **rAF-coalesced** to one `notify.update` per frame. In-canvas
    catalog consumers (`FurnitureLayer` excepted — it renders from it; but
    `DragController`/`MarqueeSelector`) use `catalog.ts` **`useCatalogGetter`** (a
    stable `(id)=>def` backed by a non-rendering store subscription) so catalog
    churn never re-renders the R3F tree. `scene/ContextLossGuard.tsx` (mounted in
    both Canvases) is the safety net: `preventDefault`s `webglcontextlost` so the
    browser restores, and `invalidate`s on restore. These drive
    `ui/upload/UploadModelDialog.tsx` (a portaled, viewport-centred modal whose
    single drag-and-drop **`<div>`** zone — not a `<button>`, which mishandles
    native drops — accepts loose files **and** whole folders; shows progress for
    the recursive scan + group auto-detection (count + bar); a **Category** select
    defaulting to **Auto** (groups keep their own detected category, loose files →
    `others`); falls back to a single "Choose folder…" picker; and on close
    mid-scan/detect pops `ui/upload/ConfirmDialog.tsx` — a loading-screen-styled
    warm-gradient confirm). Background-import progress shows in the bottom-left
    `NotificationContainer`.
- `src/materials/` — finishes. `builtinCatalog.ts` (floors/walls), runtime
  `procedural/` PBR generators (wood/parquet/tile/marble/carpet/concrete/
  terrazzo/plaster/stripe/grasscloth/checker/brick/batten),
  `furnitureMaterials.ts` (tintable fabric + wood-grain + stone/marble
  for furniture, plus `getSolidMaterial` for metal/plastic and the `mat:<id>`
  DLC-finish resolver), `worldUv.ts` (metre-space UVs so finishes tile
  consistently). `convert/` — **in-browser texture decode + re-encode** for
  uploaded materials: `decodeImage.ts` (`decodeImage` → straight RGBA8 for
  PNG/JPG/WebP/BMP/GIF via `createImageBitmap`, plus **TGA/TIFF/EXR/HDR** via a
  three loader / `utif`, tonemapping HDR/EXR floats to 8-bit; `isSupportedTexture`
  + `EXTRA_TEXTURE_EXTENSIONS`) and `reencode.ts` (`reencodeToWebp` +
  `normalizeTextureFile` — re-encodes everything except WebP to near-lossless
  WebP, full resolution). `upload/persist.ts` normalizes each channel file
  through `normalizeTextureFile` before `validateImageFile`/IDB write;
  `upload/validate.ts` accepts the extra formats by extension (16 MB source cap).
  KTX2/DDS standalone-texture decode is deferred (needs a WebGL readback — see
  TODO.md).
- `src/scene/` — the R3F `<Canvas>` and systems: `lighting/` (sun astronomy,
  hemisphere fill, `SceneEnvironment` IBL probe, `FurnitureLights`, `Sky`),
  `Effects.tsx` (bloom+SMAA), `quality.ts` + `QualityController` (tiers +
  adaptive 30fps), `ScreenshotController` (PNG export), cameras, selection.
  The main Canvas runs **`frameloop="demand"`**: `RenderPump.tsx` is one
  always-on rAF loop that calls `invalidate()` only when a frame is wanted —
  continuously while something animates (walk, turntable, tour, recording,
  shadow accumulation, a drag, a spinning fan via `animatedSources.ts`, boot,
  asset streaming) and for a short settle tail after any discrete store change;
  idle scenes draw ~0 frames, a hidden tab draws none. `renderDecision.ts` is
  the pure (unit-tested) `shouldRender`/`isContinuous`/`settleTailMs` logic;
  `renderPumpSignal.ts` gates `QualityController` FPS sampling to continuous
  spans (sparse idle frames would otherwise read as ~0 fps); `Lighting` holds
  the loop open while its day/night tween is mid-transition. Repeated decoration
  inside a primitive can collapse to one draw call via `primitives/InstancedBoxes.tsx`
  (e.g. bookshelf books: ~48→~9 draw calls).
- `src/ui/` — DOM overlays: CatalogDrawer (`catalog/`). The drawer is **one
  flat tab row — Catalog / Layers / Packs** (panel title tracks the active tab).
  **Catalog** is one **unified grid** (`useUnifiedCatalog.ts` → `GridItem` =
  local `FurnitureDef` *or* not-yet-downloaded CC0 `RemoteEntry`) that merges
  built-ins, generated, user/IKEA uploads, installed-pack items, already-
  downloaded CC0, **and** the browsable Poly Haven CC0 index into one list — a
  single fuzzy search spans all of it, and a downloaded CC0 entry replaces its
  remote card with the resolved local card (`CatalogCard` for local,
  `RemoteCard` for un-downloaded CC0 — both share the `.cat-card` shape + heart
  `fav-btn`). A **favourites** pseudo-category (star chip, first in
  `CategoryTabs`) houses everything in `collections`; a **recent**
  pseudo-category (clock chip, shown only when non-empty) lists the
  most-recently-placed items (`recentSlice`, hooked from `addItem`, persisted to
  `localStorage` `hdb_recent_items`, kept out of the save schema/autosave).
  **Layers**
  (`LayersPanel.tsx`) is the Objects tree (store-level `leftMode`, shared with
  the command palette + mobile toolbar); **Packs** installs downloadable
  content whose items then appear in the unified grid (see **Downloadable
  content sources**). Then InspectorPanel
  (`inspector/`), FinishPicker, WallAccentPicker, GraphicsSettings, BudgetPanel,
  NavCluster (fused compass + zoom rail + minimap, bottom-right), the
  **CommandPalette** (⌘K), **ContextMenu** (right-click on a placed item),
  **Onboarding** (first-run 3-step intro), **HelpModal**, a shared **Modal**
  primitive, measurement/loading, `upload/` (GLB/material import dialogs),
  `floorplan/` (2D editor), and `toolbar/` — the icon-island toolbar (see
  **Toolbar** + **Design system** below; the toolbar's `AppearancePopover`
  switches theme + light/dark/auto).
- `src/styles/` — the **design-system CSS** (ported from `design/assets/`):
  `tokens.css` (type/spacing/radii + the 8 OKLCH theme palettes),
  `components.css` (`.panel`/`.btn`/`.toolbar`/`.menu`/inputs…), `parts.css`
  (catalog/inspector/navcluster compound UI), `features.css` (layers/cmdk/
  context-menu/toasts/badges), `flows.css` (onboarding/edit-room/presets),
  `screens.css` (appearance popover/loading/plan/walk), `responsive.css`
  (tablet/compact/`body.mobile` bottom-sheet breakpoints), and `app.css`
  (React-port glue: portaled `.pop-panel`/`.tip-box`, `.fld` field rows,
  `.hud-pill`). All imported from `src/index.css` after Tailwind.
- `python/scripts/` — **offline** asset tooling, not part of the app build:
  `ikea_model_scraper.py` (IKEA SG → per-variant-group `metadata.json` +
  `<finish>.glb`), `glb_analysis.py` (stdlib GLB parser → footprint + material
  palette + segments), `categorize.py` (breadcrumb/type → functional category
  + placement semantics), `compatibility.py` (local "complete with" resolver),
  and `optimize_glb_lod.mjs` (the `npm run optimize:glb` LOD pass). See
  **IKEA scraper (offline)** and **GLB LOD pipeline**.

## Key systems
- **Design system & theming** (`src/styles/`, `state/slices/appearanceSlice.ts`,
  `storage/appearancePrefs.ts`): one warm, Singapore-rooted system — **4 themes
  (Clay / Kampong / Porcelain / Estate) × light/dark = 8 OKLCH palettes**,
  switched by `[data-theme]` + `[data-mode]` on `<html>`. Every colour is a CSS
  custom property (`--surface`/`--text`/`--accent`/`--border`/`--scene-*`/…) so
  components never hardcode colour — UI is restyled to the design class
  vocabulary (`.panel`, `.btn`, `.toolbar`/`.tool-btn`, `.menu-item`, `.seg`,
  `.swatch`, `.act`, `.cmdk`, `.ctx-menu`, `.toast`, `.onb-*`, …) instead of
  Tailwind colour utilities. The toolbar **Appearance** control
  (`ui/toolbar/AppearancePopover.tsx`) picks theme + Light/Dark/Auto (its
  `AppearanceControls` body is shared; an anchored popover on desktop, a centred
  blurred `Modal` on mobile); the choice persists in `localStorage`
  (`hdb_appearance`) and is applied pre-paint by an inline script in `index.html`
  (no flash). Auto follows the OS via `matchMedia` (`ui/useIsMobile.ts` is the
  shared ≤640px hook). `body.mobile` (toggled in `App` at ≤640px) switches
  floating panels to bottom-sheets and the toolbar to a minimal bar — **brand
  (top-left) + hamburger (top-right) only** — whose menu opens a bottom **action
  sheet at full desktop parity** (`toolbar/MobileToolbar.tsx`): brand + title
  header, then **collapsible accordion sections** (Camera / View / Scene / Edit /
  Design / Arrange / Tools / Graphics / File / Appearance & help, one open at a
  time so all headers fit without scrolling) covering every desktop action
  including Graphics, Lights, undo/redo, snap, sets/presets/styles, sun study,
  walkthrough, report, and save/load slots. Per-room edit is a single dropdown
  (not one row per room). Shared action logic is factored into
  `furniture/arrangeActions.ts` (set drops) and `scene/sunStudy.ts` (sun-study
  hook). The mobile **Help** modal drops the keyboard-shortcut section (no
  hardware keyboard). A reference screenshot suite (every theme,
  panel, modal, viewport) lives in `assets/screenshots/`. New feature surfaces wired through `featuresSlice`: the **⌘K
  command palette** (`CommandPalette.tsx` — actions / panels / views / "add
  furniture", keyboard-navigable), the **right-click context menu**
  (`ContextMenu.tsx`), the first-run **onboarding** carousel (`Onboarding.tsx`,
  gated on `localStorage.hdb_onboarded`), and the catalog drawer's **Objects /
  Layers** mode (`catalog/LayersPanel.tsx`, items grouped by room with select /
  lock / delete). Production-grade feature panels, all wired to real data and
  mutually-exclusive in the centred-top `.aux` slot: **Swap with similar**
  (`SwapModal.tsx` — same-category alternatives with footprint-fit badges,
  replaces the def in place), **Clearance & fit checks** (`ClearancePanel.tsx`,
  from `layout/clearance.ts` `blockedDoorItems`), **Versions**
  (`VersionsPanel.tsx` — save / restore / delete over the real
  `LocalStorageAdapter` slots + `slotThumbs`, plus **Export/Import** a design as
  a portable `.sofa.json` file via `storage/designFile.ts`), **Shopping list + Collections**
  (`BudgetPanel` List/Saved tabs + a heart `fav-btn` on every catalog card —
  local *and* CC0 — toggling `collections`, which also feeds the catalog's
  favourites category), and **Share & export** (`ShareModal.tsx` — link copy + a real
  PNG snapshot via the `sofa:export` event). The **2D floor-plan editor**
  (`ui/floorplan/`) and **upload dialogs** (`ui/upload/`) are fully token-themed
  (light + dark) — the floor-plan editor hides the main toolbar while open (its
  own header bar), and the upload dialogs portal to `document.body`.
- **Procedural materials**: `materials/procedural/generators.ts` paints one
  tiling tile (albedo+normal+roughness) per finish from seeded noise; plaster
  wall paints share one normal map (tinted by colour) to save memory.
  Surfaces use world-space UVs so a finish tiles at a fixed physical scale.
  Furniture (`furnitureMaterials.ts`) has its own tintable grain generators:
  wood (warped latewood lines + lengthwise pores + roughness map), stone/marble
  (turbulent veins), fabric/leather/velvet, plus `getSolidMaterial` for
  metal/plastic parts — always pass a real `Material` instance to a `material=`
  prop, never a plain props object (three.js ignores those).
- **DLC materials on furniture**: a furniture finish value of `mat:<materialId>`
  applies any catalog finish — including a downloaded CC0 PBR set from the
  ambientCG/Poly Haven remote catalog — to the piece. `FurnitureMaterialLoader`
  (mounted in the scene) watches items, builds the referenced material into the
  shared cache (procedural synchronously; textured via `<Suspense>`+`useTexture`)
  under a furniture-scoped id, and bumps `materialEpoch` so memoised furniture
  re-render. `getSurfaceMaterial` returns the built material, falling back to
  procedural wood until it's ready. The inspector's wood/surface `finish`
  dropdown lists these (labelled “CC0 DLC”).
- **Lighting / time of day**: SunCalc drives sun altitude → `altitudeCurve.ts`
  → directional sun + hemisphere fill + IBL intensity + sky. Light fixtures
  emit capped, day-gated point lights at night and their shades glow via the
  shared `fixtureGlow` signal.
- **Quality tiers** (`quality.ts`): the user-facing **render** tier is a
  4-value `RenderTier` — **Performance / Medium / High / Maximum** (`RENDER_TIERS`,
  `QUALITY_PRESETS`, `QUALITY_LABEL`/`QUALITY_DESCRIPTION`). **Performance is the
  default for everyone, regardless of hardware** — a deliberately *flat*,
  IKEA-style renderer (`shadowMapSize: 0`, no IBL, no post-processing, DPR 1) so
  first load is instant and fluid even on a GPU-less laptop. Medium adds sun
  shadows + an IBL probe; High layers on the GPU post stack (bloom + AO + SMAA);
  Maximum maxes shadow resolution, DPR, light count and geometry detail.
  `detectDefaultTier` always returns `'performance'` (capability no longer
  influences it); higher tiers are strictly opt-in from the Graphics panel.
  `QualityController` only ever steps the tier **down** to hold 30 fps and
  disables itself once the user pins a tier; every setting is overridable
  (persisted; legacy stored `'low'` migrates to `'performance'`). **Asset
  quality** is the separate `AssetTier` axis (`assetTier`, `effectiveAssetTier`,
  `renderToAssetTier`) — low/medium/high(=Original) GLB mesh/texture LOD. It
  follows the render tier by default (`null` = Auto, mapped
  performance→low / medium→medium / high&maximum→Original) but can be pinned
  independently and is immune to the FPS auto-downgrade. Persisted in
  `qualityPrefs`. NB: `QualityTier` is now an alias of `AssetTier` (the LOD axis
  the `gltf/*` files key on); render code uses `RenderTier`.
- **GLB models + LOD** (`furniture/gltf/`, `GltfModel.tsx`): bundled CC0 GLBs,
  user uploads, and IKEA imports all render through one loader. `decoders.ts`
  registers Draco at boot (meshopt/KTX2 auto-wired by drei). The offline
  `npm run optimize:glb` pass writes `-low`/`-medium` variants (≤512/≤1024px
  WebP textures + ~50/75% triangles, Draco) beside each `.glb`; at runtime
  `lod.ts` picks the variant for the effective **asset** tier (the Graphics
  panel's Asset quality control, decoupled from render effects — sync probe
  cache + `prewarmLod`), and `textureBudget.ts` downscales any oversized
  texture as a last-resort fallback (also gated on the asset tier). `finishTargets.ts` enumerates named meshes so a GLB can
  be recoloured per component. The offline pass defaults to **WebP** textures
  but takes an opt-in **`--ktx2`** flag (`optimize_glb_lod.mjs`) to emit
  **KTX2 / Basis Universal** GPU-compressed textures instead (ETC1S colour /
  UASTC data maps) — these stay compressed in VRAM, the biggest runtime-memory
  win on integrated GPUs. KTX2 encoding requires the KTX-Software `toktx`
  binary on PATH; the script detects its absence and falls back to WebP with a
  notice. The runtime KTX2 transcoder is already auto-wired by drei
  (`decoders.ts`).
- **IKEA model import** (`furniture/ikea/`, `state/userAssetsSlice.ts`): the
  Python scraper (below) emits per-variant-group `metadata.json` + `<finish>.glb`.
  The Upload dialog auto-detects IKEA group folders (`detectGroups.ts`
  `detectGroups` — handles a parent folder of **many** groups, importing each
  via path-scoped `filesUnder`; any non-group GLBs import via the bulk path) and
  `importGroup.ts` turns each group into **one** `IkeaGltfDef` — `variants[]` (each with footprint + per-component GLB palette,
  blobs in IDB), with category/placement/`frontClearance`/price/compatibility
  all derived from the scraped `metadata.json` (`translate.ts`,
  `compatibility.ts`). One catalog card per group; the per-instance active
  finish lives in `props.variant` (loads the sibling GLB). Renders via
  `gltfRender.ts` (active variant + per-component `finish:<target>`/global tint
  overrides — inspector `ui/inspector/IkeaBody.tsx`); read-only product info in
  a panel. The **catalog-card thumbnail** is the scraped product photo: import
  downscales each finish's `main_image` once to a ~256 px blob (`thumbnail.ts`
  `downscaleImageFile`) stored in IDB (`kind:'texture'`, `role:'ikea-image'`,
  keyed on the variant's `imageAssetId`), and `ui/catalog/thumbnails.tsx` shows
  the active variant's photo (falling back to the category icon when absent).
  License is non-CC0 `IKEA` (attribution shown, assets not
  redistributed). `IkeaGltfDef`s live in `userAssets`, round-trip through
  `schema.ts` (incl. `imageAssetId`), and re-resolve their GLB + thumbnail blob
  URLs on boot (`storage/hydrate*`).
  Plan: [docs/ikea-import-app-support.md](docs/ikea-import-app-support.md).
- **Combining compatible models** (`furniture/ikea/stacking.ts`,
  `placementSemantics.ts`, `supportPlane.ts`): a compatible model combines with a
  base per a **placement kind** classified from the matched "Complete with"
  category (`placementKind`: vertical / around / modular / null→gated off):
  - **vertical** (mattress→bed frame, cushion→sofa): rests the item's BOTTOM on
    the base's true support surface. That Y is detected **geometrically** from
    the base GLB — `supportPlane.ts` `detectSupportPlaneY` histograms near-
    horizontal triangle area by Y over the footprint interior and picks the
    highest substantial band below the head/footboard region (the slat plane,
    ~0.24 m for MALM), computed + cached by URL in `GltfModel` (`SUPPORT_PLANE_
    CACHE`, its own effect so the footprint short-circuit can't skip it; computed
    from any LOD tier, original-geometry marked authoritative). IKEA publishes no
    slat height, so geometry — not the old footboard-minus-thickness estimate —
    is the source of truth. Fallback `STACK.bedSlatDefault` in `designRules.ts`.
  - **around** (chairs/stools/benches→table): places the seating on the FLOOR at
    the base's front edge, facing it (no Y lift).
  - **modular** (sofa sections→sections): snaps a section to the base's first
    mating edge (from the scraped `IkeaModular` block — role + mating edges),
    flush on the floor, same rotation — extend-a-sofa / L-shape.
  `combineOnto` builds the item(s) with `props.surfaceHeight` (vertical only),
  inherited rotation, and a shared `groupId`. GLB items lift by `surfaceHeight`
  in `Furniture.tsx` (gated `kind !== 'parametric'`; the ContactShadow counter-
  translates by `-liftY` to stay grounded). Two triggers: inspector
  **"Complete with → Place on this"** (`ui/inspector/IkeaBody.tsx`) and
  **drag-snap** (`scene/DragController.tsx` — `itemFootprint` containment +
  `resolveCompatible`, routed through `combineOnto`). Group-mates skip mutual
  collision (`collision/placement.ts`). `surfaceHeight`/`groupId`/`modular`
  round-trip with no schema change. The scraper grows a `--phrase-index` mode
  (harvest accepts-category phrases, no GLBs) and a name-inferred `modular` block
  for sofa sections (`ikea_model_scraper.py`).
- **IKEA live-scrape pack** (`catalog/packs/ikeaLive.ts`, `scripts/scraper-server.mjs`):
  the **IKEA Singapore (live scrape)** pack (a `kind:'ikea-live'` entry in
  `catalog/packs/registry.ts`) downloads the catalogue on demand instead of a
  hosted zip. Its button calls the local sidecar (`npm run scraper-server`),
  which scrapes products one-by-one (parallelized), LOD-optimizes each finish
  GLB the instant it lands (bounded pool), and writes to Vite-served
  `public/assets/ikea/<group>/` (HTTP paths → the pre-baked LOD siblings apply).
  Progress streams per-product over SSE (`PacksTab.tsx` shows a bar + phase
  list); each finished group is fetched over HTTP and registered through the
  existing `importGroup()` → full `IkeaGltfDef`. Sidecar is local/dev-only;
  served IKEA assets are gitignored (non-CC0). The pack card is **dev-only**:
  `registry.ts` `visiblePacks(isDev)` filters the `ikea-live` entry out of the
  Packs tab unless `import.meta.env.DEV`, so a production build never surfaces
  the IKEA-branded scrape entry. (Importing IKEA model folders, grouping, and
  sets all still work in production — only this discoverable card is hidden.)
- **Downloadable content sources** (`catalog/packs/registry.ts`,
  `ui/catalog/PacksTab.tsx`): the Packs tab is a **declarative registry** of free
  furniture + material sources — adding a source is one object in
  `AVAILABLE_PACKS`, no new wiring. Each `Pack` carries a `kind` discriminator,
  an `assetType` (`'furniture'` default / `'material'`, which groups it under the
  tab's two sections + picks the manual-import hint), and a `devOnly` flag.
  `visiblePacks(import.meta.env.DEV)` hides every `devOnly` pack from production;
  `PacksTab.renderCard` switches on `kind` to pick the card component. The
  **gating rule**: a source that can be downloaded programmatically in-browser
  (CORS-friendly) is visible in **both** dev + prod; one that needs a dev proxy /
  sidecar / hand-download is `devOnly`. Current `kind`s:
  - `'poly-pizza'` (**Poly Pizza**, prod) — the only general-purpose furniture
    source that downloads at runtime in production. `catalog/packs/polyPizza.ts`
    is the API client (`searchPolyPizza` + the tolerant pure `parseModels` +
    `guessCategory`; auth via the user's `x-auth-token` key, never bundled;
    `PolyPizzaError` carries user-facing messages). `installPolyPizzaPack`
    (`install.ts`) searches → fetches each GLB → routes through the shared
    `buildEntry`/`commit` pipeline (additive: repeat searches append). The card
    (`PacksTab.PolyPizzaCard`) takes an API-key field (persisted per-pack in
    `localStorage` as `hdb_pack_key_<id>`) + a search box + Download, surfacing
    errors inline. CC0 **and** CC-BY (credited per model via per-entry
    `attribution`/`license` on `InstalledPackEntry` + `PackGltfDef`).
  - `'zip'` (**Kenney**, dev-only) — hosted-archive install (`installPack`).
    `devOnly` because kenney.nl ships no CORS and the `/kenney` path is a dev
    Vite proxy; a same-origin mirror would let it go prod.
  - `'ikea-live'` (dev-only) — see above.
  - `'manual'` (dev-only) — link-out cards for sources with no CORS/programmatic
    download (Quaternius, Sketchfab, FurniMesh, Free3D, Open Source 3D Assets for
    furniture; cgbookcase, TextureCan, 3DTextures.me, Share Textures for
    materials). They open the source page; the user downloads by hand and imports
    via the Upload model / Upload material dialog.
  Materials/textures that download at runtime come from the **remote providers**
  (below), not the Packs tab: Poly Haven (CORS, prod) + ambientCG (proxy,
  dev-only). `catalog/remote/providers/index.ts` `activeProviderIds(isDev)` /
  `PROD_PROVIDER_IDS` gate which providers bootstrap — only CORS-capable ones in
  production (`remoteCatalogSlice.bootstrapRemoteCatalog`). **To add a source:**
  furniture/material download via API/CORS → a `'poly-pizza'`-style client
  reusing `buildEntry`/`commit`, or a new `RemoteProvider` added to `PROVIDERS`
  (+ `PROD_PROVIDER_IDS` if CORS-capable); otherwise a `'manual'` registry entry.
- **IKEA scraper (offline)** (`python/scripts/`): `ikea_model_scraper.py`
  (Playwright) harvests IKEA SG products → `<group>/metadata.json` +
  `<finish>.glb` + `<finish>-main`/`<finish>-context` product images
  (original resolution, recorded as `variants[].main_image`/`context_image`;
  the app downscales the main image for the catalog thumbnail) (`--out <dir>`
  redirects the output root; `--progress-ndjson` emits per-product phase events
  on stdout — both used by the live-scrape sidecar), grouping colour/finish
  variants and detecting multi-piece
  **sets** (writes `sets/<set_key>.json` recipes from the "What's included"
  list). `glb_analysis.py` (pure stdlib) extracts footprint + per-component
  material palette + segment map; `categorize.py` assigns functional category +
  placement semantics; `compatibility.py` resolves "complete with" suggestions
  locally. This is offline tooling — its output is what `furniture/ikea/`
  consumes.
- **Height-aware collision** (`collision/placement.ts`): items carry a vertical
  span plus `mounted` (skip wall checks) / `noClip` (rugs) flags so pendants
  hang over tables, wall units mount above furniture, rugs slide under.
- **Wall reveal** (`apartment/walls/`): exterior walls between the orbit
  camera and the interior fade out; windows/doors fade with them via the
  `wallReveal` registry.
- **Floor plan editor** (`ui/floorplan/`, `floorplan/`): a 2D top-down editor
  (toolbar "Floor plan") edits the store `floorPlan` — walls (interior/
  exterior), rectangular rooms (auto area + total), doors/windows, an
  **adjustable ceiling height** (`PlanInspector` no-selection control →
  `updateFloorPlanMeta`, clamped 2.2–4 m; drives both the default-flat render
  path — `WallSegment`/`Ceiling`/`RoomShell`/`MeasurementOverlay` read
  `floorPlan.ceilingHeight` — and `PlanShell`; per-room `ceilingHeight` overrides
  like the 2.4 m bathrooms still win), grid +
  corner snapping, drag-move, per-room floor finishes, and persistent per-wall
  **length labels** (a "Dims" header toggle, default on). **Non-rectangular
  shapes**: the **Split** tool (`splitWall`) cuts a wall into two segments
  (re-homing its openings) and dragging the selected wall's **endpoint handles**
  (`moveWallVertex`, which drags every wall sharing that corner together) lets
  you pull an outline into an L (or any non-orthogonal/angled shape). Rooms take
  an optional **L-shape `extension`** (a second rectangle) edited in
  `PlanInspector`; `planRoomArea` sums both so the area respects the shape, and
  `PlanShell`/`roomShell` render both floor rects. For **arbitrary
  (free-polygon) rooms** a `PlanRoom` carries an optional `polygon` (world-metre
  vertices) authored with the **Polygon** room tool (click vertices, click the
  first / press Enter to close) or the **Auto room** tool (`detectRoomPolygon`
  in `floorplan/roomDetect.ts` — planar face-extraction tracing the minimal
  wall cycle around a click); when set it's the authoritative shape —
  `polygonArea` (shoelace) for the area, `pointInPolygon`/`pointInRoom` for
  containment (furniture-in-room), and a triangulated `worldUvShapeGeometry`
  floor in `PlanRoomFloor`/`PlanShell` (`floorplan/types.ts` helpers). A
  non-default plan
  renders via `PlanShell` and furniture/walk collision follow it (optional
  `walls` on `canPlace`, `planCollisionWalls`); the default flat keeps the
  curated `<Apartment/>`. Saved plans persist (`floorPlanStore.ts`). The editor
  also renders the **live furniture as top-down footprints** (category-coloured
  polygons from `itemFootprint`/`obbCorners`) — click to select (shared with the
  3D selection), drag (select tool) to move (grid-snapped + `canPlace`-checked,
  same path as the 3D `DragController`). **`P` toggles 2D⇄3D from anywhere**
  (skipped while typing / in walk mode); leaving the editor frames the selected
  item in 3D. A **reference photo/scan backdrop** (Wave F, no ML) can be loaded
  (file pick or drag-drop) to trace over: calibrate real scale with the **Scale
  tool** (drag a known dimension → type its length → `mPerPx`), adjust opacity,
  trace walls on top. The backdrop (blob + calibration: scale/opacity/offset) is
  **persisted to IDB** (`ui/floorplan/backdropPersist.ts`, one fixed slot via
  `IdbAssetStore`) so it survives closing the editor and reloading — rehydrated
  when the editor opens, cleared with the ✕ button. **"AI walls"** (Wave E,
  experimental, bring-your-own-key) sends the backdrop to an OpenAI-compatible
  vision model (`ai/floorPlanAi.ts`) and seeds an editable draft plan from the
  recognised segments; degrades to manual tracing on no key / CORS / no result.
- **Smart Start** (`ui/wizard/SmartStartWizard.tsx`, featuresSlice
  `smartStartOpen`): a friendly onboarding front end over the existing layout
  presets — pick a style and the flat is furnished + walls/floors finished in one
  click (`applyLayoutPreset`), with a complementary UI theme applied. Heuristic,
  not AI. Launchable from onboarding (a "Smart Start" choice), the ⌘K command
  palette, and the toolbar **Arrange** menu.
- **Live retail pricing** (`catalog/pricing/livePrice.ts`, `scripts/price-server.mjs`):
  a **dev-only** "Live IKEA SG prices" toggle in the Shopping panel resolves each
  line's name to a real IKEA Singapore price + buy link via the local
  `price-server` sidecar (IKEA SIK search JSON API, disk-cached). `useLivePrices`
  fails soft — no sidecar / failed lookup keeps the bundled `furniturePrices.ts`
  estimate; production always uses the estimate. Matched product title rides on
  the buy-link tooltip so the fuzzy name→SKU match is auditable.
- **AI photoreal export** (`ai/aiClient.ts`, `ui/ai/AiPhotorealSection.tsx`):
  a **bring-your-own-key**, experimental "Make photoreal" section in the Share
  modal — captures a hi-fi PNG of the current view (`scene/captureCanvas.ts`,
  registered by `ScreenshotController`) and runs image-to-image (Replicate by
  default) with the user's own API key (localStorage, never bundled), preserving
  room structure. Async/honest UX, graceful no-key / CORS / error states. Pure
  request-builder + output-parser are unit-tested; the live round-trip needs a
  real key (and may need a proxy depending on provider CORS).
- **Per-room editor** (`scene/RoomEditorScene.tsx`, `apartment/roomShell.ts` +
  `RoomShell.tsx`, `uiSlice.roomEditor`): an IKEA-planner-
  style mode that isolates one room for furniture planning. Entered from the
  toolbar **View** menu's single **"Edit a room"** entry (enters the first
  non-external room); the room is then **switched in place** — while the editor is
  active the toolbar's leftmost cluster shows a **← exit button** (`Icon.ExitRoom`)
  + a **room-switcher `<select>`** (`.toolbar-room-select`, re-`enterRoomEditor`s
  on change), and **Esc** exits. On mobile the collapsed bar *becomes* the
  room-editor header (brand + room dropdown + **X** exit + hamburger; see
  **Toolbar**). It mounts a **separate
  lightweight `<Canvas>`** (own flat hemisphere/ambient light, DPR 1, no shadows/
  IBL/post — none of the sun/time/Effects systems are even mounted) in place of
  `<Scene>` while active, and is **pinned to the Performance render tier +
  Original (`assetTier:'high'`) assets** on enter (prior tiers restored on exit).
  It reuses every store-driven interaction controller (FurnitureLayer with a room
  filter, DragController, PlacementGhost, selection, CameraRig orbit+walk,
  MeasurementOverlay) so catalog/placement/measurement work unchanged, editing
  the **same live `store.items`** (no scratch layout). `roomShell(roomId)` derives
  the room's footprint rect(s) (main + `extension`), **clips each shared wall to
  that footprint span**, and attributes windows/doors by world-position-within-
  clip; `<RoomShell>` renders clipped wall boxes that **hide themselves when the
  camera is on their outward side** (camera-facing wall reveal) plus a per-rect
  floor and the room's own openings. Floor + wall surfaces use the store's
  **per-room finishes** (`RoomShell` reuses `floor/RoomFloor` and resolves the
  room's `finishes.walls[roomId]` / accent material the same way `WallSegment`
  does). `FurnitureLayer({room})` renders only items whose footprint centre is
  inside the room (`furniture/roomFilter.ts`). `OrbitCamera` frames the room
  (centre + sized 3/4 offset) on enter / room switch. The **toolbar trims to the
  planner essentials** while active — the Scene (time/sun), Tools, and Lights
  clusters are hidden (`Toolbar` gates them on `roomEditor.active`). **Walk mode
  is bounded to the room**: `FirstPersonCamera` spawns the player at the room
  centre and feeds `collision/roomCollisionWalls.ts` `buildRoomCollisionWalls`
  (door-aware solid segments built from the room's *clipped* walls) into the
  movement resolver, so the player can't leave the room (an open door is a gap,
  same as the full flat).
- **Snap grid** (`scene/snap.ts`, `GridOverlay.tsx`, ui `snapEnabled`/
  `gridSize`): drag + initial placement quantise to a customizable grid
  (10/25/50 cm, 1 m); the floor overlay shows it. Persisted via `editorPrefs`.
- **Drag aids**: `DragController` snaps a single drag to other items' centres/
  edges (magenta `AlignmentGuides`), **snaps the footprint flush to a nearby
  wall** (`collision/wallSnap.ts` `wallSnapOffset` — corner-capable, within
  ~12 cm, gated off when grid-snap is on), and shows the nearest-wall gap
  (`DragHud` via `collision/clearanceGap.ts`). Hover highlight (`HoverHighlight`).
- **Rotate gizmo** (`scene/selection/RotateGizmo.tsx` + pure
  `rotateGizmoMath.ts`): a touch-friendly floor ring + knob drawn around the
  **selection** (orbit camera + **select** tool, unlocked, not mid-drag). One
  unified gesture handles both cases: a **single** item spins about its own axis
  (knob doubles as a heading indicator, snaps to absolute **15°** marks), a
  **multi-selection** rotates every member rigidly about the group centroid
  (`rotatePointAround`, snaps the *delta*, signed readout). Hold Shift for free
  rotation; a live degree readout follows the knob, the ring tints green/red for
  placement validity (intra-selection pairs ignored — rigid rotation preserves
  their spacing), and an invalid release reverts the whole set (mirrors the
  item-drag UX, reusing `canPlace`). The ring/knob meshes patch their `raycast`
  to win the pointer pick over taller furniture (they draw always-on-top).
  Mounted beside `SelectionOutline` in both the main and room-editor scenes;
  complements the **R** key (90° / Shift+R 15°, single or group).
- **Walk-mode controls** (`scene/cameras/FirstPersonCamera.tsx`,
  `scene/walkInput.ts`, `ui/walk/WalkJoystick.tsx`, `ui/WalkHud.tsx`,
  `ui/Crosshair.tsx`): first-person look/move adapts to the device.
  **Fine pointer** uses Pointer Lock — click the canvas to capture the cursor,
  mouse spins the view, WASD moves, **Esc** releases (the browser's native
  "Press Esc to show your cursor" banner is browser chrome and **cannot** be
  styled or suppressed — it's a Pointer-Lock security guarantee). **Coarse
  pointer** (touch) has no Pointer Lock, so the bottom-left translucent
  `WalkJoystick` writes a normalized move vector to the `walkInput` singleton
  and a canvas drag spins the view. `WalkHud` is a themed, auto-fading (5 s)
  controls banner shown on walk entry — bottom-centre `.walk-hud` pill whose
  wording branches on `IS_COARSE_POINTER` (Joystick/Drag vs Click/WASD/Esc); it
  reframes the unavoidable native banner with on-brand hints rather than
  replacing it. `Crosshair` is the centre reticle.
- **Toolbar** (`ui/toolbar/`): a streamlined, horizontally-scrollable **icon
  island**. Frequent actions are direct icon buttons (`IconButton`); busy
  clusters collapse into labelled dropdown menus (`ToolbarMenu` + `MenuItem`):
  **View** (top/reset/turntable/edit-room + **saved camera views**: a
  `SavedViewsSection` to bookmark the current angle and fly back to it —
  `cameraViewsSlice`, persisted to `localStorage`, mobile-parity in the View
  accordion), **Scene** (time presets + sun-direction
  `CompassModal`), **Arrange** (Sets/Presets/Style/Floor plan/Tidy), **Tools**
  (Budget/Checks/Sun study/Walkthrough/Report), **File** (Save/Load/Export/
  Record). Every control has a custom portaled **Tooltip** showing its name +
  a keyboard-shortcut chip (label from `shortcuts.ts`, sourced from
  `controls/keybindings.ts` — never hardcoded). Tooltips and menus both render
  through `Popover` (a `createPortal` + fixed-position primitive) so the
  scrollable island never clips them. Editing clusters show only in orbit mode;
  Walk mode keeps the camera essentials. New view shortcuts: Top view **O**,
  Reset **H**, Tidy **L**. `ui/Toolbar.tsx` re-exports `ui/toolbar` so the
  import path is stable. The island **claims the wheel while the cursor is over
  it** — a non-passive native `wheel` listener `preventDefault`s (so it never
  reaches OrbitControls to zoom the scene) and turns vertical wheel into
  horizontal scroll; the row is also **click-and-drag scrollable** (drag on the
  island background, not a control) and shows a slim always-present horizontal
  scrollbar (`.toolbar-scroll` in `index.css`). The FPS counter is no longer a
  toolbar button — it's a **toggle in the Graphics panel** (`showFps`); asset
  credits are surfaced per-item (inspector `SourceLine` + catalog cards), not as
  a toolbar button.
- **FPS counter** (`ui/FpsCounter.tsx`): a themed DOM HUD pill (status dot +
  number, top-left, `.fps-hud`) that replaced drei's unstyled `<Stats/>`. A
  lightweight `requestAnimationFrame` sampler independent of the Canvas (works in
  both the main and room-editor scenes; also mirrors `window.__lastFps` for the
  screenshot harness). Sits at the **`--z-hud` layer (just above the scene)** so
  every panel/popover/modal renders above it. Toggled by `showFps`.
- **Mobile viewport + touch** (`index.html`, `styles/components.css`,
  `styles/responsive.css`, `scene/MobileLongPress.tsx`): the viewport is
  `viewport-fit=cover` and the app root is `100dvh` so the **canvas reaches the
  very top/bottom** under the iOS browser chrome (body painted `--scene-b` so any
  transient gap never reads as a solid bar). **Only the canvas is full-bleed —
  every floating control stays inside the safe area** via `env(safe-area-inset-*)`
  on the mobile bar (top), the FPS HUD, and all bottom-docked sheets / toasts
  (bottom). `body.mobile` disables text selection + the iOS long-press callout
  (inputs stay selectable) and `touch-action: manipulation` kills double-tap
  zoom (pinch preserved). `MobileLongPress` turns a stationary ~500ms press on
  the canvas into a synthesized `contextmenu` (right-click) so the context menu
  is reachable on touch; a press that moves >12px is treated as a drag/orbit.
- **Design tools** (in the toolbar's **Arrange**/**Tools** menus): the **Sets**
  list drops pre-arranged vignettes (`furnitureSets.ts`) plus any imported
  **IKEA set recipes** (`ikeaSets.ts`: `parseSetRecipe`/`buildSetGroup`/
  `arrangeSet` expand a scraped `sets/<key>.json` into a footprint-arranged
  group); the **Tools** menu groups the Budget panel (`furniturePrices.ts`),
  **Checks** (door-swing clearance, `layout/clearance.ts` + `ClearanceOverlay`),
  **Sun study** (time-lapse), **Walkthrough** (auto camera tour + record, in
  `OrbitCamera`), **Measure** (point-to-point tape — `scene/TapeMeasure.tsx` +
  `measurementsSlice` `tapeMode`/`tapePoints`; a transparent floor plane captures
  two clicks and draws an always-on-top amber ruler + live distance label,
  desktop + mobile-parity toggle), and **Report** (`ui/report.ts`, printable).
  Multi-select shows an align/distribute panel; items can be **locked**;
  double-click focuses the camera; saved layouts get thumbnails (`slotThumbs`).
- **Furniture groups** (`state/slices/groupsSlice.ts`): items sharing an optional
  `FurnitureItem.groupId` are an emergent group (no separate entity). First click
  selects the whole group (`selectItemGrouped` + transient `activeGroupId`); a
  second/Alt click drills into one member. Group drag is the existing multi-drag;
  rotate is rigid about the centroid (`groupRotate`). Group/Ungroup +
  "Add to group" live in the inspector; deleting a member auto-dissolves a group
  that drops below 2. Dropping a Set stamps one shared `groupId`. Persisted via
  save schema **v2** (`groupId` optional; v1→v2 migration is a no-op on items).
- **Visual**: per-item **contact shadows** (`ContactShadow`, quality-gated) +
  **skirting** wall trim (`apartment/Skirting.tsx`, `PlanShell`). (Crown
  molding was removed — a light fixed-colour band at the wall top read as a
  discoloured strip against coloured walls; the painted face already runs
  cleanly floor-to-ceiling.)
  Procedural finishes include **wallpapers** (stripe/grasscloth) + **checker**.
- **Mirror reflections** (`furniture/primitives/MirrorMaterial.tsx`): the wall /
  bathroom / floor mirrors render a **real planar reflection** of the room (drei
  `MeshReflectorMaterial`, re-renders the scene from the mirror's plane each
  frame) on the **High/Maximum** render tiers; **Performance/Medium** keep a
  cheap fake-shiny pane (low-roughness metallic + IBL + faint emissive). One
  shared `MirrorMaterial` element, dropped in as each pane mesh's material;
  `mirrorReflectorConfig(tier)` is the pure tier→{real,resolution} gate
  (512px High / 1024px Maximum). Off-screen mirrors are frustum-culled (free);
  no recursion (a mirror inside a mirror falls back to its base look).
  **Uploaded GLB mirrors**: an inspector toggle ("Reflective surface", `GltfBody`,
  stored as `props.reflective`) makes `GltfModel` detect the model's largest flat
  mesh (`gltf/mirrorPlane.ts` `pickMirrorPlane`/`detectMirrorPlane`), hide it, and
  overlay the same tier-gated reflector plane fitted to its bounds — so uploaded
  mirrors reflect too (High/Maximum only).
- **Loading overlay + fast boot** (`ui/loading/`, `state/storage/bootstrap.ts`,
  uiSlice `bootPhase`/`loading`): `main.tsx` registers the GLB decoders
  (synchronous, must precede any model load) then renders React **immediately**
  — no longer awaiting hydration, so the page is never a blank screen. The
  async boot work (IDB user assets + packs, autosave restore, pref loaders,
  and the default-layout seed — which now runs *after* hydration so it can't
  clobber a restored layout) lives in `runBootstrap()`, kicked off once from
  `App`'s `<BootHydrator>` effect; it flips `bootPhase` `'hydrating'→'ready'`
  in a `finally`. `LoadingOverlay` is a single fixed DOM overlay (soft warm
  gradient + a looping SVG line-art room that furnishes itself — walls draw in,
  then sofa→table→lamp→plant pop in staggered; pure CSS keyframes, respects
  `prefers-reduced-motion`). It covers three triggers: **initial boot**
  (`bootPhase !== 'ready'`, label "Furnishing your flat…"), **orbit↔walk**
  (`setCameraMode` calls `showLoading` on a real mode change, skipped inside the
  room editor), and **per-room editor enter/exit** (`enterRoomEditor`/
  `exitRoomEditor` set a labelled `loading`). Transition triggers set
  `loading.active` synchronously; `App` clears it on the next rAF, and the
  overlay's own **min-time (600ms) + fade (250ms)** lifecycle
  (`useOverlayLifecycle`) holds it visible long enough to avoid flicker on fast
  swaps. Boot uses `bootPhase`; transitions use `loading` — kept separate so
  each is independently testable.

## Adding content
- **Furniture**: add a `primitives/<Name>.tsx` (a function taking
  `{ props }`), register it in `primitives/index.ts` + the `PrimitiveKind`
  union, and add a `ParametricDef` to `furniture/builtinCatalog.ts`. Set
  `verticalSpan`/`mounted`/`noClip` for non-floor items. To emit light, add to
  `lightEmitters.ts`. To ship in the default flat, add to `furniture/defaults/`
  (every entry is collision-checked by `defaultLayout.test.ts`).
  The catalog spans 15 categories (`FurnitureCategory` in
  `furniture/types.ts`), mirroring IKEA's top-level departments: beds, seating,
  tables, storage, kitchen, bathroom, appliances, lighting, decor, textiles,
  outdoor, **electronics**, **kids**, **laundry**, and **others** (the
  auto-detect catch-all, always sorted last). A new category must be added to
  that union, `FURNITURE_CATEGORIES`, and the exhaustive
  `Record<FurnitureCategory,…>` consumers the type-checker flags
  (`furniturePrices.ts`, `BudgetPanel.tsx`, `report.ts`, `UploadModelDialog.tsx`,
  catalog grouping) plus the catalog UI (`ui/catalog/CategoryTabs.tsx` +
  `CategoryIcon.tsx`). Category is auto-detected for imports, never entered by
  hand (`ikea/translate.ts` + `python/scripts/categorize.py`; unmatched →
  `others`).
- **Finish**: add an entry to `materials/builtinCatalog.ts` (`procedural` with
  a pattern, or `solid`). New patterns go in `procedural/generators.ts`.
- **GLB models**: bundled GLBs and user uploads go through the generic
  `GltfModel` loader; set the same `verticalSpan`/`mounted`/`noClip` flags. Run
  `npm run optimize:glb` to generate the `-low`/`-medium` LOD variants. IKEA
  imports come from the offline scraper as `IkeaGltfDef`s (see **IKEA models**).
  - **Bundled-GLB pipeline** (`scripts/asset-pipeline/`): drop a `<name>.glb`
    (+ optional `<name>.glb.json` sidecar: `id`/`name`/`category`/`footprint`/
    `scale`/`anchor`/`license`/`attribution`/`sourceUrl`) into
    `public/assets/furniture/`, then `npm run index-assets` regenerates
    `src/furniture/generatedCatalog.ts` (`GENERATED_FURNITURE`, merged into the
    catalog by `furniture/catalog.ts`) and rewrites `public/assets/CREDITS.json`
    + `CREDITS.md`. The runtime renders these via the uniform-`scale` GLB path —
    it does **not** re-centre or fit-to-footprint, so a bundled GLB must already
    be floor-anchored (`min.y≈0`) and centred on X/Z; bake any sizing/centring
    into the file (e.g. with `@gltf-transform`). Licence is **CC0 by default but
    may be `CC-BY`** (attribution-required): the real licence rides on the
    sidecar → `BuiltinGltfDef.license` → inspector `SourceLine` + `CreditsModal`.
    The **pool tables** (6/7/8/9 ft, category `tables`) are bundled this way —
    one CC-BY base model (Evol-Love, poly.pizza) baked to four regulation
    footprints with the felt recoloured green.

## Conventions
- Furniture primitives are floor-anchored, centred on the footprint, facing
  +Z; geometry is built at real-world metres.
- **Structural soundness**: parts must connect (no floating members), supports
  reach floor→underside, legs sit inside the top/seat footprint, and seats
  cover the span their legs bound. `material=` props need a real three `Material`
  (use the `furnitureMaterials.ts` helpers), not a plain `{color,roughness}`
  object. Don't invent bespoke texture art — for photoreal surfaces apply a CC0
  DLC material (`mat:<id>`) over the procedural fallback.
- **Placement follows the interior-design rules in
  [docs/interior-design-guidelines.md](docs/interior-design-guidelines.md)**:
  storage/appliances/beds flush to walls, TVs on windowless walls, seating
  faces the TV, walkways + door/window clearances preserved. Clearance values
  live in `src/layout/designRules.ts` (`CLEARANCE`) and drive the per-room
  auto-arranger in `src/layout/autoArrange.ts` (`arrangeRoom`, exposed in-app
  as the Finish-picker "Tidy up room" button). Per-room strategies by
  `roomKind`: living, bedroom, **kitchen** (`arrangeKitchen` — counters flush
  largest-first, then fridge + stove biased to opposite ends of the longest run
  so the sink sits between them: the refrigerator→sink→range work triangle),
  **bath** (`arrangeFixtures` — fixtures flush to walls largest-first, clear of
  door swings), and generic. Author default layouts/presets to these rules and
  reuse the constants.
- Keep `TODO.md` current when deferring work (see superpowers specs/plans
  under `docs/`).
- Bundled assets are procedurally generated (CC0-equivalent) wherever possible;
  the few bundled GLBs (e.g. the pool tables) carry a real per-item licence +
  attribution shown in the inspector and `CREDITS.json` (CC-BY models require
  it). Downloadable Poly Haven/ambientCG/Kenney/Poly Pizza assets are credited
  on their catalog cards (Poly Pizza CC-BY models carry per-entry attribution).
