# TASKS — autonomous improvement backlog (OPEN ITEMS ONLY)

Each task = its own commit; log every shipped task in `CHANGELOG.md` (the source of truth).
**Policy:** when an item ships it is **removed from this file entirely** (its record lives in
`CHANGELOG.md`) — only genuinely-open work stays here, one terse entry each. Licensed/
non-redistributable additions ship dev-gated; CC0/unlicensed ship in prod too. Run
`npm test` + `tsc` + `biome` before each commit; visually verify any app-facing change.

**Prioritization:** correctness/security → reliability/edge-cases + mobile parity →
performance/memory → realism + high-value features → QOL/aesthetic polish.

## ⛔ Environment-blocked — cannot be done in a pure-client repo (leave as-is)
These need infrastructure/hardware this app doesn't have (a GPU + network don't help):
- **COLLAB-STRUCT / F24** — structured collaboration + live multi-user presence/sync: need a
  persistent real-time backend (auth, DB, websockets).
- **F22 (Android Scene Viewer)** — needs an https-hosted GLB (public URL + upload backend); iOS
  AR Quick Look already ships.
- **F21 (real-headset WebXR)** — controller-locomotion pass needs a physical VR headset to verify;
  the inert WebXR entry + provider already ship.

## Open — UI/UX polish cycle (2026-08-19; sources: internal audit + DESIGN.md research refs)
Bite-sized, one commit each, ordered. Rules: tokens only, both modes tested, visual verify.
### Stage 2 — token consistency (small sweeps)

- [ ] UIUX-5: ConfirmModal + PromptModal action rows → `Modal`'s `footer` prop (10 siblings
  already do).
- [ ] UIUX-6: shared `.form-err` class (4 modals paste `color: var(--danger, #c0392b)` — dead
  hex literal); define or drop `--on-scrim` (PresentationMode renders literal #fff);
  ProductTour scrim `rgba(20,16,12,.55)` + raw transition → tokens.
- [ ] UIUX-7: add `.panel-sub.plain` (un-uppercase modifier) — 10+ inline
  `textTransform:'none'` hacks (StagingReveal, WallNumericEntry, GridZoomControls,
  PlanTotalLabel, AiPhotorealSection, FinishPicker ×2).
- [ ] UIUX-8: motion/hover token strays — walk-HUD 600ms → `--dur-3 --ease-out`
  (app.css:246), screens.css 0.3s → `--dur-2`, `.share-opt:hover` → `--surface-3`
  (features.css:364 inverted hover), `.ss-card` raw .12s + 4px radius + missing hover fill
  (flows.css:160).
### Stage 3 — mobile/a11y + list vocab
- [ ] UIUX-9: 44px touch floor — catalog-card ♥/↻/× (32px) + `.lyr-geye` (30px) get the same
  `::after { inset:-9px }` extension panel-head icons already have (responsive.css).
- [ ] UIUX-10: labelled bare `.slider` → `SliderField` (ItemLightControls Brightness,
  PaintVizModal Coverage, ElevationPanel lux hour, TiltControls, ItemPhysicalControls ×2).
- [ ] UIUX-11: FileMenu saved-layouts list → `.saved-view-row` vocabulary + `EmptyState`
  (currently Tailwind clone: off-scale radii/type, ~20px "×" delete, hand-rolled empty text).
### Stage 4 — off-system surface migrations (Tailwind → tokens)
- [ ] UIUX-12: inspector bodies (IkeaBody/GltfBody/ParametricBody/SourceLine/
  MultiSelectPanel/IesProfilePicker/ItemLightControls/ItemPhysicalControls): `.sec-h`
  headers, `Button size="sm"`, `Disclosure` over raw `<details>`, `EmptyState` (split into
  2–3 commits).
- [ ] UIUX-13: catalog PacksTab/RemoteBrowseTab/ResolutionPicker/CachePane: hand-rolled
  accent buttons → `Button`/`.btn-accent`, `--danger-soft`, type ladder.
- [ ] UIUX-14: PlanViewMenuActions 8 boolean toggles are accent-CTA buttons → check rows /
  `.seg-btn.on` grammar (match 3D ViewMenu); same `btn-accent`-as-open-state leak in
  PlanEditorHeader/LevelMenu/PlanToolMenu/PlanMenu.
- [ ] UIUX-15: GraphicsSettings hand-built overlay → shared `Modal` (gains focus trap).
- [ ] UIUX-16: literal burn-down — FinishPicker `#ccc` fallbacks + inline rows,
  ParametricControls 26px/radius-6 swatch ×3 → `.swatch`, WebGLFallback/ErrorBoundary
  off-system, LoadingOverlay/PresentationMode grandfathered inline px.
### Stage 5 — polish patterns from research (each flag-gated, reduced-motion-safe)
- [ ] UIUX-20: Segmented control sliding active-pill (Watermelon fluid-tabs mechanic; CSS
  transform on measured offset).
- [ ] UIUX-21: animated number on Budget HUD/panel totals (rAF lerp, tabular-nums,
  reduced-motion snaps).
- [ ] UIUX-22: text-shimmer on loading/AI-progress labels (background-clip gradient;
  Motion-Primitives mechanic; ambientFx-gated).
- [ ] UIUX-23: toast behavior upgrade — pause-timer + expand on hover, stack-collapse ≥3
  (Sonner spec), keep existing notify API.
- [ ] UIUX-24: Haikei-style inline SVG blob backdrops for EmptyState/onboarding (static,
  `currentColor`/accent-tinted, no runtime cost).
- [ ] UIUX-25: copy/save state-morph confirmation on copy-link/copy buttons (icon crossfade
  + spring-ish cubic-bezier).
- [ ] UIUX-26: origin-aware popover/menu entrance (transform-origin from anchor side,
  scale .96→1 `--dur-1 --ease-out`; exits faster).
- [ ] UIUX-27: skeleton-shimmer class + Doherty pass over async surfaces (catalog thumbs,
  DLC materials, cloud sync) — verify catalog blank-tile lazy-load look.
- [ ] UIUX-28: onboarding checklist (furnish→finish→light→share) — simple-tier flag,
  goal-gradient progress, dismissable (Watermelon onboarding-checklist pattern).
- [ ] UIUX-29: guard test / adoption sweep — every new pattern documented in DESIGN.md as it
  ships; keep adding tasks discovered during stages above.

## Open — client-doable
- [ ] MOD-FPE-SPLIT (optional tail, REFAC-2 landed a further cut): `FloorPlanEditor.tsx` is now
  **~2432 lines** (was 4271, −43%). Done: state/effect hooks `usePlanBackdrop` (v.46), `usePlanAiWalls`
  (v.47), `usePlanViewport` (v.49), `usePlanLevel` (v.50); **all 11 SVG render layers** in
  `editor/layers/*` — `WallsLayer`, `RoomsLayer`, `OpeningsLayer`, `DimensionsLayer`, `NotesLayer`,
  `PolylinesLayer`, `TourStopsLayer`, `FurnitureLayer`, `FurnitureRotateHandle`, `WallHandlesLayer`,
  `DraftOverlayLayer` (v.51–.60); and (REFAC-2) **4 more layers** (`PlanGuidesLayer`,
  `OtherLevelsUnderlay`, `PersistentDimensionsLayer`, `AnnotationsLayer`), the screen→world coordinate
  mapping (`editor/planPointerMapping.ts`), and 8 small presentational toolbar controls +
  2 layout shells (`PlanEditorHeader`, `PlanToolsSheet`) that take already-built fragments as props —
  each behaviour-preserving + interactively verified. Pure tool math/decisions were already
  modularised (`toolDraftReducer`, `*Commit`, `snap*`, `floorPlanGeometry`, `marqueeSelect`). What
  remains is **intentionally kept in the component** per `editor/CLAUDE.md`: the pointer-tool
  **dispatcher** (`onDown/onMove/onUp`, ~550 lines) is a thin dispatch over those pure helpers + store
  writes and should stay; the "Plan ▾" menu's file/reference-photo actions (`fileActions`, ~230 lines,
  many independent feature-flagged pieces) were also left inline — bundling them needs a 40+ prop
  surface (passing the whole store-action snapshot), which would hurt readability more than the
  current named-fragment const. Revisit only if either grows further.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud).
- [ ] X-SHOP tail [DEV]: HipVan price adapter is blocked — its public
  `www.hipvan.com/api/search/products` endpoint was retired (404); search now runs through an
  authenticated `api.communa.sg` API gateway (`/hv_shop/api/v1/search/products`, session token +
  refresh on top of an `x-api-key`), which a plain browser-UA fetch can't reach. Adapter stays
  dev-gated best-effort (fails soft to "no match") until a public endpoint returns. Courts
  (Magento GraphQL) and Castlery (Algolia hits embedded in the Next.js RSC payload) were verified
  live and updated 2026-07 (v0.21.2.23).

## Open — real-GPU / frontier (need a real GPU to implement+verify the pixel pass)
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle with WebGL fallback.
- [ ] PHOTO-* frontier: PHOTO-SSGI-SSR (WebGPU), PHOTO-WEBGPU. See `PHOTOREALISM.md`
  (GLASS + SOFTSHADOW shipped v0.19.0.1; GTAO rejected by real-GPU ruling 2026-07-11;
  PR4/R-SSAO closed by real-GPU audit 2026-07-15 — VSM verified artifact-free, PCSS rejected,
  contact shadows verified, no tuning warranted, v0.21.2.18; **PHOTO-POM verified by real-GPU
  pixel A/B 2026-07-15 — grout recession/occlusion confirmed at High/Max, no artifacts, no code
  change, v0.21.2.19**; the remaining two stay blocked on a real WebGPU adapter in-sandbox).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Keep this file pending-only; keep `TODO.md` (legacy deferred-work log) current.
