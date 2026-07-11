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
- [ ] SLOT-203 (configurator GLB-sub-asset options): needs a **bundled CC0 GLB** asset + the load
  path (load → reparent at the slot anchor → per-slot `listFinishTargets` namespacing). The v1
  products are all-procedural, so this is gated on sourcing a suitable CC0 GLB option to bundle.
- [ ] IXT-SUITES: remaining interaction-test scenarios (C267 harness) — livePrices.
  (**AI-surfaces simple rung landed** — `ai-surfaces-simple.json` (50 steps, all green): covers
  the three AI features, all pro-tier + prod-safe + BYO-key (NOT devOnly, unlike
  `ikeaLive`/`livePrices` — pure client code that fails soft with no key/sidecar):
  `aiPhotoreal` (Share modal's "Make photoreal" section, `ui/ai/AiPhotorealSection.tsx`),
  `aiLayout` (Command Palette "AI auto-furnish (BYO key)", `ui/CommandPalette.tsx`), and
  `aiWalls` (FloorPlanEditor's "AI walls" trace button). **Headless-testable without a
  network/key**: flag/tier gating (hidden in Simple, present in Pro — asserted at both the
  store-flag level AND the real UI-mount level) and pre-inference UI state. For `aiPhotoreal`,
  the scenario opens the Share modal (an idle-preloaded lazy chunk — mounts headless like
  `glb-designer-simple`'s dialog, see the playbook), asserts the AI section is completely
  absent in Simple, then in Pro asserts the "Make photoreal" button starts **disabled** with no
  key and **enables** purely from typing a fake key into the password field via a native-setter
  eval — the button is never clicked, so no `fetch` to Replicate ever fires (verified: no
  `<img>` result ever appears). For `aiLayout`, the scenario opens the (non-lazy) Command
  Palette, confirms "AI auto-furnish (BYO key)" is entirely absent from Simple's results
  (`COMMAND_FLAGS['ai-furnish'] = 'aiLayout'`, pro-tier), then in Pro runs it and shows the
  real pre-inference `PromptModal` ("Describe the home…"), cancels via the Cancel button, and
  asserts no vision-key follow-up prompt and no auto-furnish notification ever appeared —
  proving the cancel path returns before `ai/autoLayoutAi.ts`'s `requestAutoLayout` is ever
  reached, so nothing hit the network. **`aiWalls` is checked at the store-flag level only**
  (Simple `false` / Pro `true`) — its "AI walls" button only renders once a floor-plan trace
  backdrop image is uploaded inside `FloorPlanEditor.tsx` (`src/ui/floorplan/**`), which this
  cycle's IXT-SUITES pass deliberately left untouched (another agent's area this cycle); a
  future ladder can add the full backdrop-upload + button-mount rung there, mirroring
  `backdrop-upload-simple.json`'s window-backdrop upload pattern but for the 2D plan-trace
  backdrop instead. **The real AI inference itself is out of scope for ALL THREE surfaces** —
  every path needs either a live Replicate/vision-model API key or an actual network call,
  neither of which the headless harness can supply without faking a provider response (which
  the task explicitly rules out); `ai/aiClient.ts`, `ai/floorPlanAi.ts`, and
  `ai/autoLayoutAi.ts`'s request/response builders are pinned by their own unit tests
  (`aiClient` has no dedicated test file yet — its pure helpers `buildReplicateImg2ImgBody`/
  `parseReplicateOutput`/`safePollUrl` are good candidates for a future unit-test pass, out of
  scope here) so the wire contract stays covered even though the live round-trip isn't. Added
  a dedicated `describe('AI surfaces …')` block to `featureFlags.test.ts` pinning all three
  flags' tier/devOnly/default in one place (mirrors the existing per-flag describe pattern).
  No stub lever was needed — unlike `livePrices`/model-upload, none of the three AI surfaces
  needed faking a sidecar or a network response to reach their tractable pre-inference UI.)
  (**GLB-designer re-rung landed** — `glb-designer-simple.json`: the pro-only 3D asset
  designer (`ui/glbEditor/GlbDesignerDialog.tsx`, gated directly on `uiMode==='pro'`, not a
  `FEATURE_FLAGS` entry). Asserts the Simple/Pro gate (dialog stays UNMOUNTED in Simple even with
  `glbDesignerOpen` forced true, present in Pro), a REAL edit round-trip (add box → change size X to
  1 m + raise Y to 0.8 m → the controlled inputs AND the live 3D preview both reflect the elongated
  raised box), and a REAL **save round-trip to the store** (name it → Save asset → a `UserGltfDef`
  named "IXT Simple Box" lands in `state.userFurniture` via the real `buildEditedObject → exportGlb →
  persistUserGlb → addUserFurniture` path, toast + dialog-close confirm), then back-to-Simple +
  mobile legs re-assert it's hidden. The dialog is `React.lazy` but is idle-preloaded
  (`preloadOnIdle.ts` `PRELOAD_ORDER`), so it mounts headless fine — the model-upload note's
  "lazy dialogs won't mount headless" does NOT apply here (that dialog isn't preloaded).
  **NEW HARNESS GOTCHA found here — and it retro-explains why the pre-existing
  `glb-csg-textures-simple.json` save step was silently failing:** the harness's `clickByText`
  (`scripts/lib/interact.mjs`) clicks the element's bounding-rect centre with `page.mouse.click`
  **without scrolling it into view**, so a button below the fold in a scrolling panel is missed and
  its onClick never fires — silent no-op, no error. The designer's "Save asset" lives at the bottom
  of the scrolling right panel, below the fold at every viewport. Fix in-scenario: click Save via a
  DOM `.click()` eval (viewport-independent), NOT the text-click. Verified: import + parse of
  GLTFExporter and `persistUserGlb` all work headless — the ONLY blocker was the missed click.
  `glb-csg-textures-simple.json` should get the same one-line fix when next touched.)
  (crown-molding, backdrop-upload and
  furnlight simple rungs landed — `crown-molding-simple.json` v0.11.2.13,
  `backdrop-upload-simple.json` + `furnlight-simple.json` v0.11.2.14; **ceilingDesign simple rung
  landed** — `ceilingdesign-walk-simple.json`: Simple/Pro flag gate, tray+cove then coffered 3×3
  applied to livingDining, walk-mode look-up via the dev-only `__walkLook` pitch lever proves both
  treatments render from below.)
  - first-run re-rungs: **persistence re-rung landed** (`first-run-returning-user.json`) — clean-profile
    carousel → top-nav "Skip" (the third dismissal path, beyond the tour / Enter-sandbox choices the
    other first-run scenarios cover) persists `hdb_onboarded='1'` → a real `location.reload()` proves
    the returning user re-sees NEITHER the carousel (end-to-end `resolveBootDecision` persistence,
    beyond the pure-function `bootDecision.test.ts` coverage) NOR the location prompt
    (`locationPromptDismissed` autosave round-trip).
  - model-upload: **simple rung landed** (`model-upload-simple.json` — Upload entry gating + 60-group
    detection via the `__detectGroups` dev hook). A full journey rung is blocked on the dialog being
    `React.lazy` (won't mount headless); the paginated-list render is instead covered by
    `GroupPanel.test.tsx` + `pageWindow.test.ts` and a temporary `?__pagerdemo` `main.tsx` mount.
- [ ] PARITY-VIDEO tail: MP4 transcode of the walkthrough `.webm` + a duration modal.
- [ ] C-PLANTS/DECOR tail: curated CC0 set-dressing bundles from Poly Haven / Poly Pizza.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate).
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud).
- [ ] GE4 tail: "Update original" full export round-trip needs a real-env verification pass.
- [ ] X-SHOP: verify Courts/HipVan/Castlery price adapters against the live sites (built offline).

## Open — real-GPU / frontier (need a real GPU to implement+verify the pixel pass)
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle with WebGL fallback.
- [ ] PR4/R-SSAO: soft-shadow upgrade (PCSS/VSM) + contact-shadow refinement.
- [ ] R-BLEED: inter-room light-bleed directional weighting (needs geometry raycasting).
- [ ] PHOTO-* frontier: PHOTO-POM, PHOTO-SSGI-SSR (WebGPU), PHOTO-WEBGPU. See `PHOTOREALISM.md`
  (GLASS + SOFTSHADOW shipped v0.19.0.1; GTAO rejected by real-GPU ruling 2026-07-11).
- [ ] P3 tail: rotation-capable instancing for venetian-blind / drying-rack slats.
- [ ] PERF6 tail: `antialias`/`preserveDrawingBuffer` toggle needs a context recreate (flash) +
  real-GPU verify.

## Dead-export prune plan (from docs/research/2026-07-03-dead-export-audit.md, verified per-symbol)
- [ ] **DE-5** (pre-req discovered 2026-07-10): `npm run deadcode` (knip) CRASHES on an
  oxc-parser ESM/CJS `require()` mismatch (both Node 20 and the pinned 24.18.0) — upgrade
  knip/oxc-parser first, then extend `knip.json` to `functions/**`, `workers/**`,
  `electron/*.mjs`, verify clean (DE-1..3 landed v0.18.6.8/.9), and add `npm run deadcode` to CI.
- [ ] **DE-5**: extend `knip.json` entry/project to `functions/**`, `workers/**`, `electron/*.mjs`
  (currently invisible to knip), verify clean after DE-2/3, then add `npm run deadcode` to CI.


## Bugs found by PLAN-FURNISH Phase 3 verification (2026-07-11, pre-existing — not Phase-3 regressions)
- [ ] **BUG: the 2D plan's `PlanInspector` + rotate handle ignore `def.windowBound`** — a selected
  curtain in the plan shows editable X/Z/Angle/Width fields and a rotate knob, while the 3D
  inspector hides transforms and `Furniture.tsx` blocks drags. Editing them detaches the fixture
  from its window. Fix: gate those controls on `windowBound` like the 3D inspector does.
- [ ] **Cosmetic: plan inspector "Size (W×D×H)" shows the def's footprint H** (e.g. 275 cm) rather
  than the window-sized `props.height` (255 cm) for window fixtures.

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Keep this file pending-only; keep `TODO.md` (legacy deferred-work log) current.
