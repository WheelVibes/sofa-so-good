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
- [ ] C-PLANTS/DECOR tail: curated CC0 set-dressing bundles from Poly Haven / Poly Pizza.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud).
- [ ] GE4 tail: "Update original" full export round-trip needs a real-env verification pass.
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

## Dead-export prune plan (from docs/research/2026-07-03-dead-export-audit.md, verified per-symbol)


## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Keep this file pending-only; keep `TODO.md` (legacy deferred-work log) current.
