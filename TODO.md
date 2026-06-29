# TODO

Single source of truth for deferred work across this project. Each entry links back to the spec, plan, or file that introduced it. Removed when done.

## 🔭 2026-06-26 RESEARCH WAVE — fresh pure-client/headless backlog (TOP PRIORITY)

Compiled by a read-only audit+research agent, cross-checked against `CHANGELOG.md` (source of
truth). All items are pure-client and headlessly verifiable on SwiftShader (unit tests or
`window.__store` scenario assertions). Conflict-group tags (`cg-*`) parallelize: same tag = serialize.
**Already dispatched/shipped this session — do NOT re-do:** AUD-002/003, PARITY-SH3D-FURN/OPENINGS
(tests), PARITY-DUP-PATH, PARITY-SNAP-ROTATE, PARITY-PLAN-ROOM-DUP, PARITY-PLAN-MARQUEE,
PARITY-PLAN-ALIGN, MOD-FPE-SPLIT, BUG-RADIAL-FULLCIRCLE, PARITY-ROOM-CSV, PARITY-PLAN-SCALE,
PARITY-STAMP-PLACE, PARITY-SCATTER-ROOM, BUG-PATHARRAY-LOOP (the no-polyline infinite-render fix).
**BUG-PATHARRAY-EMPTY was VERIFIED a false positive** (pathArrayPlacements already guards
`segments.length===0 || total<=1e-9 → []` and sampleAt guards the division) — removed, no fix needed.

> **⚠️ Orchestration constraint (learned this session):** isolated worktree subagents fork from the
> **session-start base** (`b0371d9`), NOT the branch tip — so (a) files *created* this session
> (`pathArray.ts`, `scatterInRoom.ts`, `rescalePlan.ts`, `marqueeSelect.ts`, `toolDraftReducer.ts`,
> `PlanMultiSelectActions.tsx`, `PathArraySection.tsx`, …) are **invisible** to a delegated agent and
> must be edited inline; and (b) **behaviour-preserving refactors of files modified this session**
> (`FloorPlanEditor.tsx`, `PlanInspector.tsx`, `MobileToolbar.tsx`) can't be safely delegated — a
> b0371d9-based refactor would drop this session's additions on merge. **Deferred until the base
> resets** (next PR merge to `main`) or to careful inline work: **MOD-PLANINSPECTOR-SPLIT**,
> **MOD-MOBILETOOLBAR-SPLIT**.
> (**PARITY-PLAN-VERTEX-ANGLESNAP** was done **inline** by the orchestrator, v0.3.0.42 — a small
> localized edit only the orchestrator could make, since worktree agents fork pre-churn.)

### Correctness / reliability (highest priority)
### Layout productivity
### Data / export
### Maintainability (debt — CLAUDE.md "no monolithic files")
- [ ] **MOD-PLANINSPECTOR-SPLIT** (MED/M, `cg-planinspector` — serialize AFTER PARITY-PLAN-ALIGN) —
  `ui/floorplan/PlanInspector.tsx` is **1348 lines**. Extract wall/room/opening/notes-dimension
  branches into sibling `editor/inspector/<Branch>.tsx` panels; keep `PlanInspector` a thin dispatcher
  (proven `PathArraySection`/`PlanFurnitureInspector` pattern). Verify: behaviour-preserving — existing
  scenarios green + tsc/biome.
- [ ] **MOD-MOBILETOOLBAR-SPLIT** (LOW/M, `cg-mobiletoolbar`) — `ui/toolbar/MobileToolbar.tsx` is
  **1204 lines**. Extract per-section detail-pane renderers into `toolbar/mobile/<Section>.tsx`; keep
  the rail/sheet shell thin. Verify: mobile scenario parity + tsc/biome.

> **(historical) Recommended first parallel batch** — BUG-RADIAL-FULLCIRCLE + PARITY-PLAN-SCALE +
> PARITY-ROOM-CSV + PARITY-SCATTER-ROOM + PARITY-STAMP-PLACE: **all shipped** (Waves 4–6).
> PARITY-PLAN-VERTEX-ANGLESNAP shipped inline (v0.3.0.42). MOD-PLANINSPECTOR-SPLIT still deferred
> (needs base reset).
> **Verified already shipped (do NOT propose):** door-swing obstruction check, arrow-key nudge,
> compass/north + scale-bar + auto-dimension strings, photo-trace backdrop. **Per-frame alloc findings**
> in DragController/SelectionOutline are LOW (Canvas is `frameloop="demand"` → only during active drags).

## 🔭 2026-06-26 RESEARCH WAVE #2 — new-file parity features (post-Wave-5 audit)

A second read-only audit (app at v0.3.0.27) found **no open correctness/leak bugs** (the pure
geometry modules audit clean; BUG-001/004/008 already shipped). Next value is **new pure-module
parity features**. Conflict-group tags parallelize. **SHIPPED:** PARITY-PLAN-STATS, PARITY-RENO-ICS,
PARITY-GRID-SNAP (Wave 6, v0.3.0.29–.31), PARITY-THERMAL (Wave 7, v0.3.0.32).
**DROPPED — PARITY-SCENE-JSON-EXPORT VERIFIED redundant** (ShareModal "Export file" /
`exportDesignToFile` already downloads `<name>.sofa.json` with a round-trip test).

### Inline-only / needs base-reset (touch churned files — defer to next `main` merge)
- [ ] **MOD-PLANINSPECTOR-SPLIT** (`cg-planinspector`, 1348 ln) · **MOD-MOBILETOOLBAR-SPLIT**
  (`cg-mobiletoolbar`, 1204 ln) — behaviour-preserving splits; can't be stale-base-refactored safely.

> **Real-GPU/backend (out of scope):** DoF bokeh, 8K render, VSM/PCSS, denoise, HDRI IBL, SSGI,
> AI plan-gen, branded catalogs, multi-user collab, CORS-proxied providers.

## 🔭 2026-06-26 RESEARCH WAVE #3 — report/export-surface features (fully clean-delegate)

Audit found the report/export/analysis surfaces (`ui/report.ts` append slots, `export/*`, `analysis/*`,
additive ToolsMenu/⌘K) are conflict-light + fully shippable — the productive lane while the editor
files stay churned. Several analysis **builders already exist** but aren't surfaced in the printable
report/export. **IN FLIGHT (Wave 9):** PARITY-OPENING-SCHED, PARITY-DAYLIGHT-DIGEST, PARITY-FFE-CSV.
> NOTE: report-section items contend on `report.ts` — serialize them (one agent owns report.ts per wave);
> export-only items run in parallel.

## 🔭 2026-06-26 RESEARCH WAVE #4 — materials / realism / perf (beyond the saturated report surface)

The report/export surface is saturated; this wave mines `materials/`/`furniture/`/`apartment/`/`layout/`
(clean, not in the churned-editor avoid-list), aligned with the photoreal/parity North Star. Sourced
from `docs/research/2026-06-19-material-microdetail-plan.md` (MAT-006a/b are the only un-shipped rows)
+ a codebase audit. **IN FLIGHT (Wave 12):** MAT-006a, METAL-LEGS, SHELLPERF + ARRANGE-GRID.

### Clean-delegate
- [ ] **GAP-SUGGEST** (MED/S-M, new `layout/gapFix.ts`) — minimal nudge vector to clear each narrow
  walkway gap (`walkway.ts findNarrowGaps`); pure helper (UI affordance later, pro).

### Clean-delegate but PARTLY real-GPU (verification limited — split / defer the pixel pass)
- [ ] **MAT-006b** (MED/M, `G-flags`) — triplanar projection for sloped/curved walls
  (`materials/triplanar.ts` + `triplanarWalls` pro flag). Uses `onBeforeCompile` → only the CPU-side
  projection-weight math + "shader compiles" is headless-verifiable; the visual needs a real render pass.

## MASTER EXECUTION QUEUE (consolidated 2026-06-19)

One de-duplicated, prioritised dispatch queue distilled from the five 2026-06-19 audit
docs so the orchestrator can grab work **without re-reading six files**. Each row keeps its
original ID and points back to the detailed source doc. The full reasoning, `file:line`
evidence, fix direction, and verify steps live in the source docs — this is an **index**, not
a replacement; do not delete those docs.

**Source docs**
- `docs/research/2026-06-19-correctness-bug-hunt.md` — **BUG-001…014**
- `docs/research/2026-06-19-performance-scalability-audit.md` — **PERF-001…008**
- `docs/research/2026-06-19-mobile-a11y-ux-audit.md` — **UX-001…009**
- `docs/research/2026-06-19-photoreal-parity-deepdive.md` — **RD-402…425** (RD-401, RD-404 already shipped)
- `docs/research/2026-06-19-material-microdetail-plan.md` — **MAT-xxx — NOT PRESENT on this
  branch** (file absent at consolidation time; the material micro-detail work it would have
  covered is represented here by **RD-402** stone/tile/concrete/plaster/metal micro-variation,
  which is open. If the MAT plan lands later, fold its open items in under the same RD-402 area.)

**Already shipped (per `CHANGELOG.md` top — EXCLUDED from the queue):** RD-401 (anisotropy cap),
RD-404 (context-aware tone-mapping), PC-IES-LIGHT, PC-EMPTY-STATES, RZ6 / PC-RZ6-SEAMS
(upholstery seams), PC-GUIDE-SPACING, PC-NUDGE-UNDO, PC-DRAG-DIM, PC-ROOM-AREA-ONPLAN,
PC-ARRAY-GAP, PC-ARRAY-RADIAL, PC-WALL-NUMERIC (= RD-420), PC-CATALOG-FAVOURITES,
PC-MEASURE-UNITS, PC-DISTRIBUTE-OVERLAP, the decor-styling/auto-style/quote-template/parametric-
kitchen-run work. The whole **"Pure-client improvement pipeline (2026-06-19 audit)"** block
below (PC-* without the `2` prefix) is fully shipped except nothing — all of it landed; it is
retained only as historical context. The **PC2-*** refresh-#2 items below are **still open**.

**Effort:** S/M/L. **Conflict-group:** items sharing a tag touch the same file(s) → **must
serialize**; differing tags can run in parallel. **Verify:** all rows are pure-client and
headlessly verifiable on SwiftShader unless explicitly marked *blocked*.

### Ranked queue (highest priority first)

> **⚠️ This index is STALE — `CHANGELOG.md` is the source of truth for what shipped.** Many rows
> below were completed in earlier sessions and never struck through. **Already SHIPPED** (do not
> re-do): all **BUG-001…014**, all **REV-001…006**, all **UX-001…009**, all **MAT-001…004**,
> **PERF-001/002/003/004/005/007/008** (PERF-006 is "don't fix"; PERF-003 broadphase landed
> v0.2.0.37), **RD-401/402/403/404/405/407/408/409/410**,
> **PC2-MULTI-DUP-PASTE**, **PC2-FAVOURITE-MATERIALS**, **PC2-PLAN-FURN-ICONS**,
> **PC2-PLAN-ANGLE-SNAP** (15° wall-draw snap), **PC2-WOOD-GRAIN-FLOW** (per-board grain lean),
> **PC2-DISTRIBUTE-AXIS** (audited sound; OBB integration tests added), **PC2-TONEMAP-EXPOSURE-CTX**
> (shipped as RD-404; v0.2.0.40 added wall-finish preview), **PC2-CONTACT-AO-DECOR** (surface-decor
> contact decal, v0.2.0.39), **PC2-FURN-GROUP** (was fully built; added the missing `furnitureGroups`
> flag + ⌘K command, v0.2.0.41), **PC2-SURFACE-DROP** (shelf-magnetism, v0.2.0.42), and **BUG-015**
> (decor double-lift, v0.2.0.38).
> **Genuinely still OPEN — all real-GPU-pixel or server-infra (NOT headlessly verifiable here):**
> **RD-406** (tile break-up + triplanar), **RD-412** (procedural sky — steps 1–5 SHIPPED v0.2.0.58: pure
> analytic Preetham sky backdrop into `scene.background` via `proceduralSky` flag; the HDR **IBL** steps
> 6–7 remain open + real-GPU as they touch tuned lighting — plan in
> `docs/research/2026-06-20-rd412-sky-ibl-plan.md`), **RD-408** hero props (Trailing-plant v0.2.0.51 + more
> in progress), **PC2-CAM-DOF-LENS** (lens/DoF controls + flag + HQ/raster wiring shipped v0.2.0.53; the
> bokeh-pixel quality pass is real-GPU-pending),
> **PC2-CAM-DOF-LENS** / RD-421/422/410/423 (lens/DoF/VSM/render-clip — pixel passes), and the
> catalog/DLC **server-proxy** items (CORS proxy, Kenney/Quaternius mirrors). Rows marked ✅ below
> were struck this session.

### 2026-06-20 follow-up audit (correctness/perf/dead-code) — `docs/research/2026-06-20-followup-audit.md`
> A fresh audit confirmed these (recent modules sh3d/sky/DoF/furnitureMaterialLogic/floorPlanGeometry +
> autosave/floorPlanSlice/itemsSlice were reviewed and are CORRECT — don't re-investigate):
> - ✅ **AUD-001** (HIGH, done v0.3.0.7) — multi-level (F13) tidy/furnish/decor now walk `planLevels`
>   with per-level `levelAsPlan` geometry + a `(levelId ?? 'ground')` gate (`autoArrange.ts`,
>   `furnishPlan.ts`, `decorStyling.ts`); 8 regression tests (verified red without fix). The
>   stale-based worktree agent fixed autoArrange+furnishPlan; the decorStyling site was completed
>   inline during integration.
> - **AUD-002** (MED, M) — `materials/furnitureMaterials.ts` `cache`/`furnitureRepeatCache`/`patternTex`
>   (lines ~497/769/445) never evict/dispose; keys embed free-hex colour + cloned textures → session VRAM
>   ratchet. Add LRU + dispose-on-evict (precedent `disposeCachedMaterial`/`evictGltfAsset`). Unit-testable.
> - **AUD-003** (LOW, S, inline) — `ui/inspector/InspectorPanel.tsx:371` array "didn't fit" toast uses
>   `${total + 1}` but `total` already excludes the source → counts don't add up. `total + 1` → `total`.
> - **MOD-FPE-SPLIT** (L) — phased FloorPlanEditor split plan in the doc (Phase A: 5 pure modules
>   `wallTransform`/`openingPlacement`/`wallHandlesGeometry`/`draftCommit`/`zoomMath`).

### 2026-06-20 fan-out audit (research agent) — actionable, headlessly-verifiable lane
> A backlog-audit agent re-verified the queue against source: **the table below is badly stale** — most
> rows it lists as open are actually SHIPPED (PC2-ANISO-MAX/RD-401, BUG-001/004/010, PC-IES-LIGHT,
> UX-006, PC2-MULTI-DUP-PASTE, PC2-FAVOURITE-MATERIALS are all done — see CHANGELOG). The genuinely
> open, pure-client/no-GPU items it surfaced:
> - ✅ **FIN-ALLROOMS** (HIGH, done v0.2.0.56) — bulk apply-finish skipped upper storeys; → `allPlanRooms`.
> - ✅ **FIN-DEFAULT-FORK** (done v0.3.0.2) — the 2D plan inspector's finish pickers now read the durable
>   `finishes` map via `resolvePlanRoomFloor`/`resolvePlanRoomWall` (not the default-plan `room.floor`,
>   which `serialize()` drops), fixing the post-reload picker↔render desync. Chose the consumer-side fix
>   over `forkIfDefault` so painting a surface doesn't turn the default flat into a custom plan. The
>   report/BOQ/drawing-set paths already read the resolver (`finishSchedule.ts`) — no change needed there.
> - ✅ **PARITY-SH3D** (done v0.3.0.1 + v0.3.0.3) — imports Sweet Home 3D `.sh3d` walls + rooms
>   (`floorplan/import/sh3d.ts`), and now **places furniture** (collision-safe) + converts
>   **doors/windows to openings** (`floorplan/import/sh3dPlacement.ts`) behind `importSh3d` (pro).
>   **Still open:** legacy serialized (non-`Home.xml`) archives, `.sh3f` furniture libraries, exact
>   sill from SH3D `elevation`, openings on curved/sloped walls, per-product catalog identity.

### 2026-06-20 Coohom/SH3D parity backlog (research agent) — next dispatch waves
> Full doc: `docs/research/2026-06-20-coohom-sh3d-parity-backlog.md`. All pure-client + headlessly
> verifiable. **Wave 1 (conflict-group-disjoint — dispatch in parallel):**
> - ✅ **PARITY-PLAN-FURN-ROTATE** (done v0.3.0.8) — on-canvas rotate handle (ring + facing knob) on
>   the selected 2D-plan furniture footprint; reuses `selection/rotateGizmoMath.ts` 15°-snap (Shift =
>   free), `canPlace`-validated per frame, one undo step per drag. 3 unit tests + scenario; render
>   screenshot-verified.
> - ✅ **PARITY-PLAN-FURN-INSPECT** (done v0.3.0.6) — `PlanFurnitureInspector.tsx`: rename/X-Z/angle/
>   W·D·H/lock/delete/Edit-in-3D; item↔plan-element selection now mutually exclusive. Both modes,
>   desktop + mobile verified.
> - **PARITY-DUP-PATH** (MED, M, `cg-arrayplace`) — duplicate-along-polyline array (have
>   linear/grid/radial). Pure `furniture/pathArray.ts` arc-length + tangent yaw, inspector array section.
> **Wave 2 (serialize on shared files, after wave 1):** PARITY-PLAN-MARQUEE + **MOD-FPE-SPLIT**
> (3.2k-line `FloorPlanEditor.tsx` refactor) after FURN-ROTATE; PARITY-PLAN-ALIGN + PARITY-PLAN-ROOM-DUP
> after FURN-INSPECT. **Deprioritized (real-GPU/backend):** 8K render, RD-406/409/410, AI plan-gen.
> - ✅ **MOD-FPE-GEO** (done v0.3.0.1) — extracted `planCenter`/`nearestWall`/`alongWall` from
>   `FloorPlanEditor.tsx` (−49 lines) into a tested `ui/floorplan/editor/floorPlanGeometry.ts`.
> - ✅ **MOD-FURNMAT-LOGIC** (done v0.3.0.3) — extracted `hash01`/`sheenRough`/`applianceFinish`/
>   `liftedSheenRgb` into a tested `materials/furnitureMaterialLogic.ts` (`metalFinishPreset` doesn't
>   exist in this codebase; it stays with the MAT-004 brushed-metal block in `furnitureMaterials.ts`).
> - **MOD-PLANINSP-CEILING** (LOW) — extract PlanInspector ceiling-param/label-angle/Num-commit clamps.

| Rank | ID | One-line | Sev/Impact | Eff | Area / files | Conflict-group |
|------|----|----------|-----------|-----|--------------|----------------|
| 16 | **RD-402** | Roughness/AO/normal micro-variation: stone/tile/concrete/plaster + brushed-metal anisotropy | HIGH photoreal | M | `procedural/patterns/{stone,tile,wall}.ts`, `patterns/metal.ts` (new), `furnitureMaterials.ts`, `generators.test.ts` | `cg-materials` |
| 19 | **RD-408** | Decor density/variety. **DONE:** per-surface budget+spread+jitter, prop colour variety, hero props (decor tray, trailing plant), more host surfaces. **REMAINING:** more hero props with real silhouettes (varied book heights, layered cushion stacks) — needs new primitives. | HIGH photoreal | M | `furniture/layout/decorStyling.ts`, new primitives | `cg-decor` |
| 20 | **RD-412** | Procedural sky shipped (steps 1–5, v0.2.0.58); **REMAINING:** HDR IBL probe (steps 6–7, real-GPU) | MED photoreal | S | `scene/backdropEquirect.ts`, `scene/lighting/SceneEnvironment.tsx` | `cg-sky` |
| 22 | **RD-406** | Tile-repetition break-up (UV hash/macro-variation) + triplanar for sloped/curved walls | MED photoreal | M | `materials/worldUv.ts`, `materials/triplanar.ts` (new) | `cg-worlduv` |
| 23 | **RD-409** | Light colour-temperature (Kelvin→RGB) + inverse-square falloff per fixture | MED photoreal | M | `scene/lighting/FurnitureLights.tsx`, `lighting/colorTemperature.ts` (new) | `cg-furnlights` |

**Do NOT preemptively fix (audit verdict):** PERF-006 (`moveItem`/`rotateItem` array rebuild —
acceptable at design scale, explicitly "don't fix preemptively"). Listed in the perf doc as
monitor-only. *(PERF-007 `SelectionOutline` selector — DONE v0.2.0.29: empty-selection short-circuit +
Set lookups.)*

### Blocked — DO NOT dispatch headless (need a real GPU or backend)

These cannot be implemented **and** verified on SwiftShader, or need network/licensed assets.
The *wiring* of the camera/render-tier items below is headless-verifiable, but the pixel pass is
real-GPU-pending — split if dispatched.

- **RD-421** Fisheye/DoF lens options on render camera — *wiring headless, bokeh real-GPU*
  (= PC2-CAM-DOF-LENS; same item, merge).
- **RD-422** 8K tiled still + fast rasterized "preview render" — *dimensions headless, quality real-GPU*.
- **RD-410** VSM soft shadows (replace PCFSoft) — *type assert headless, penumbra real-GPU* (`cg-scenemount`).
- **RD-423** Day-to-night animated render clip — *hour interpolation headless, final clip real-GPU*.
- Photoreal real-GPU/backend track (from the dossier §4): PHOTO-PT-TUNE, PHOTO-DENOISE,
  PHOTO-SSGI-SSR, PHOTO-WEBGPU, PHOTO-GTAO, PHOTO-POM, PHOTO-HDRI, PHOTO-PBR-MAPS, PHOTO-KTX2.
- **RD-424** in-engine style transfer and **RD-425** before/after reveal slider are pure-client
  and *not* blocked — they sit in the QOL/polish lane but were left in the dossier's parity track;
  pull them forward only after the photoreal material chain.

### REMAINING OPEN — dispatch concurrently (all distinct conflict-groups)

Batches A/B (all bugs/leaks/perf) and the a11y/polish batch fully shipped (see CHANGELOG). Only the
photoreal-material items survive, each on its own conflict-group → safe to run in parallel:
RD-402 `cg-materials`, RD-408 `cg-decor`, RD-406 `cg-worlduv`, RD-409 `cg-furnlights`, RD-412 `cg-sky`
(RD-412 HDR-IBL tail is real-GPU).

## Render fidelity + GLTF hardening (2026-05-31)
Milestone 1 of the IKEA-grade fidelity program. Spec:
[docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md](docs/superpowers/specs/2026-05-30-render-fidelity-gltf-hardening-design.md);
plan: [docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md](docs/superpowers/plans/2026-05-30-render-fidelity-gltf-hardening.md).

**Next milestone — slot-based product configurator** (mattress-on-frame,
modular sofa): base + named slots with anchor points, swappable compatible
options, live reprice. Reuses the unit-3 finish-target mechanism
([src/furniture/gltf/finishTargets.ts](src/furniture/gltf/finishTargets.ts)).

## Multi-format import: convert-to-GLB + in-browser optimize (2026-06-04)
Accept OBJ/FBX/STL/PLY/USDZ/DAE/3MF models + TGA/TIFF/BMP/EXR/HDR textures by
converting/re-encoding in-browser, and optimize every imported GLB (converted +
plain uploads). Spec:
[docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md](docs/superpowers/specs/2026-06-04-multi-format-import-conversion-design.md);
plan:
[docs/superpowers/plans/2026-06-04-multi-format-import-conversion.md](docs/superpowers/plans/2026-06-04-multi-format-import-conversion.md).

- Deferred follow-ups (carried from the plan's honest-scope flags):
  - **Real in-browser KTX2/UASTC encoder** — currently the `ktx2` opt-in
    scaffolds the path but falls back to near-lossless WebP (no clean
    browser basis-encoder dep in this stack), mirroring `optimize_glb_lod.mjs`
    falling back when `toktx` is absent ([src/lib/ktx2encode.ts]).
  - **KTX2/DDS standalone-material decode** — needs a WebGL readback; the model
    importer handles embedded KTX2, but standalone KTX2/DDS material uploads are
    not yet decoded ([src/materials/convert/decodeImage.ts]).

## Layout / placement (2026-05-30)
Done — preset circulation is now regression-tested (`layoutPresets.test.ts`:
no tight pinch below 0.5 m between large circulation pieces; the WFH studio's
sofa↔desk squeeze was re-spaced 0.40 → 0.75 m). The in-app checker still
hints at snug 0.5–0.6 m adjacencies by design.

## Asset realism + structural audit (2026-05-30)
- The curated one-tap furniture finishes shipped (`ui/inspector/QuickFinishes.tsx`
  — oak/walnut/teak/ash/ebony/marble swatch row under the finish dropdown).
  Remaining: verify the runtime remote-material download end-to-end behind the
  prod reverse-proxy (sandbox network allowlist blocks ambientCG/Poly Haven, so
  that path is covered only by mocked unit tests) — needs a prod/staging session.

## Realism & content pass (2026-05-29)
Shipped this iteration — recorded here for follow-up polish:

Deferred follow-ups from this pass:

- **Instanced furniture meshes** — repeated primitives (chairs etc.) are many small draw calls; consider merging/instancing for scenes with hundreds of items. (Tension with per-item picking — would need an instance→item index map.)

## Furniture Catalog Expansion
Decomposed into four subsystems, each shipped independently. Brainstormed 2026-05-01.

- **Quaternius DLC pack support** — deferred from subsystem 2. Their packs are Google-Drive-folder-hosted (no programmatic single-zip download from a browser) and ship FBX/OBJ/Blend rather than GLB. Either (a) build a server-side proxy that exposes a single zip endpoint over a Drive folder + add three's `FBXLoader`, or (b) maintainer-mirror packs to a CC0-redistributable CDN with format conversion. Revisit after subsystem 4.
- **DLC pack URL drift** — Kenney's pack URL contains a content-hash directory; HEAD-validation on `Content-Length` ± 5% catches breakage. Bump the registry entry when the upstream rotates.
- **DLC pack scale curation** — Kenney's furniture-kit is unevenly scaled (most seating/storage/kitchen/lighting/bath items render at ~½ real size at scale=1; beds and the cross dining table are already correct). [src/catalog/packs/scaleHeuristic.ts](src/catalog/packs/scaleHeuristic.ts) ships a curated per-id multiplier table; install + hydrate apply it and existing installs auto-migrate on next boot. New packs need their own measured table or items will render at the wrong size.
- **Subsystem 3: Sketchfab** — REST + OAuth token + runtime fetch. Largest variety gain; auth+ToS friction. Pending.
- **Subsystem 4: Procedural furniture** — **shipped v1+v2+kitchen-run** (C257/C258/C270:
  dimension-driven bookshelf/wardrobe/sideboard/desk/kitchen-run generator with drawers,
  per-compartment config, toe-kick, worktop slab, optional uppers, `src/furniture/parametric/`). Complete.

## Runtime CC0 Catalog
Plan: [docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md](docs/superpowers/plans/2026-05-01-runtime-cc0-catalog.md). Spec: [docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md](docs/superpowers/specs/2026-05-01-runtime-cc0-catalog-design.md). Active implementation in progress on this branch.

- **Runtime catalog: production CORS proxy** — ambientCG's API and CDN do not send `Access-Control-Allow-Origin` (re-verified 2026-06). Dev uses Vite's reverse proxy ([vite.config.ts](vite.config.ts) `/acg` and `/acg-cdn`); production needs an equivalent proxy (Cloudflare Worker, Vercel edge function, or hosted reverse-proxy) to re-enable ambientCG in prod. Until then ambientCG is **dev-gated** (`catalog/remote/providers/index.ts` `activeProviderIds` / `PROD_PROVIDER_IDS`) so prod only bootstraps Poly Haven, whose API + CDN send CORS and work direct.
- **Runtime catalog: Kenney support** — Kenney has no CORS-friendly API and ships single ZIPs. Add a build-time mirror (or proxy worker) before extending the runtime catalog to Kenney.
- **Runtime catalog: Quaternius support** — same rationale as Kenney.
- **Runtime catalog: HDRI environment** — reconsider when scene lighting is exposed.

## Assets
- **Poly Haven model fetcher** — Poly Haven serves models as multi-file gltf+bin+textures bundles, not single GLBs. Need a pipeline path that downloads the .gltf + .bin + referenced textures, then repacks via gltf-transform's `NodeIO` into a self-contained .glb. v1 furniture manifest ships empty until this lands. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md).
- **Kenney bundle extraction** — Kenney's furniture kit ships as a single archive, not per-file GLBs. Add an extract-from-zip step (or host per-file mirrors) before adding Kenney entries to the manifest. See [asset-population plan Task 14](docs/superpowers/plans/2026-04-26-asset-population.md).
- **KTX2 texture compression** — `@gltf-transform/functions`'s `textureCompress` lacks a bundled KTX2 encoder; current pipeline ships JPG/PNG at 2K. To get the KTX2 size/VRAM benefit promised in the spec, integrate `@gltf-transform/cli` (which ships `toktx`) or a standalone `basisu` binary. See [scripts/asset-pipeline/process-texture.ts](scripts/asset-pipeline/process-texture.ts).
- **Drop-folder material auto-detection** — current indexer skips material folders without a sidecar. A future improvement could infer channels from filenames (`*_diff.*`, `*_nor.*`, etc.) like the Poly Haven naming convention. See [scripts/asset-pipeline/index-assets.ts](scripts/asset-pipeline/index-assets.ts).
- **Standard asset set (~80 assets, ~120 MB)** — manifest schema already supports it; expand when v1 Starter set is in production. See [asset-population spec](docs/superpowers/specs/2026-04-26-asset-population-design.md#v1-contents-starter-25-assets-30-mb-target).
- **Per-LOD texture variants** — for performance on lower-end devices. See [asset-population spec — Out of scope](docs/superpowers/specs/2026-04-26-asset-population-design.md#out-of-scope-for-this-spec).
- **Lazy-loading / streaming individual GLBs** — current approach bundles refs at build; revisit if total bundle size becomes a problem. See [asset-population spec — Out of scope](docs/superpowers/specs/2026-04-26-asset-population-design.md#out-of-scope-for-this-spec).
- **Quaternius pack inclusion** — manifest source enum already admits `quaternius`; add concrete entries when expanding past Starter.
- **`builtinCatalog.ts` solid-swatch entries for floor textures** — once the texture pipeline is exercised end-to-end, the eight solid-swatch entries (`floor-wood-oak`, `floor-wood-walnut`, etc.) can be deleted; the generated catalog will provide textured equivalents under the same ids. See [src/materials/builtinCatalog.ts](src/materials/builtinCatalog.ts).

## Time of Day
Spec: [docs/superpowers/specs/2026-05-01-time-of-day-design.md](docs/superpowers/specs/2026-05-01-time-of-day-design.md). Pending implementation plan.

- **Time-of-day rework — Phase 3 (realistic indoor lighting)** — partially done (2026-05-29). Procedural IBL probe ([src/scene/lighting/SceneEnvironment.tsx](src/scene/lighting/SceneEnvironment.tsx)) + real sun shadows through window cutouts shipped. **Still pending:** SSAO (tried via postprocessing but software-renderer-grainy and unverifiable on GPU — deferred) and inter-room light bleed through open doors.

Out-of-scope items deferred from the spec:

- **Time-of-day: auto-advancing in-world clock** — option C from brainstorming (accelerated day/night loop). See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: window glass tinting / curtains affecting shadow color** — current shadows are clear-glass equivalent. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: localized per-room IBL probes** — single global environment used; per-room probes would localize bounce more accurately at the cost of additional cubemap captures. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: directional weighting of door bleed** — current attenuation is uniform per traversal; orientation-aware weighting would dim bleed for doors not facing the source room's sunlit walls. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: animated dusk/dawn transitions** faster than the existing 0.6 s tween. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: outdoor environment beyond apartment shell** — skybox stays stylistic, no terrain/buildings. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).
- **Time-of-day: real-time path-traced GI / RTX** — IBL + SSAO is the target; revisit only if WebGPU + path tracing becomes affordable. See [time-of-day spec — Out of scope](docs/superpowers/specs/2026-05-01-time-of-day-design.md#out-of-scope).

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin to stable per-asset URLs in manifest, audit periodically. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).
- **Bbox-derived footprints can be wrong** for off-floor anchors / non-uniform scale — documented in drop-folder README; revisit if it bites users. See [asset-population spec — Risks](docs/superpowers/specs/2026-04-26-asset-population-design.md#risks).

## Process
- Update this file every time a plan is designed or work is implemented (see `MEMORY.md` feedback rule).

## Floor plan editor (2026-05-30)
Shipped — a data-driven, editable apartment shell + 2D editor. All follow-ups
done: per-room floor+wall finishes for custom plans render live in 3D (C213),
the named plan library (`savedPlans`) persists, and Smart Start / the
auto-arranger / finishes all route through the active plan (C153/C157/C213).
Multi-storey plans are now in progress (F13 / ML phases — see TASKS.md).

## IKEA model import (2026-05-31)
- **Scraper (done)** — `python/scripts/` scrapes IKEA SG products into
  per-variant-group folders (`<group>/metadata.json` + `<finish>.glb`):
  geometry/footprint + per-component GLB palette (`glb_analysis.py`), functional
  category + placement semantics (`categorize.py`), colour/finish variant groups,
  and a category-rule compatibility model + runtime resolver (`compatibility.py`).
- **LOD KTX2 upgrade (wiring done; needs the binary)** — `optimize_glb_lod.mjs`
  now takes an opt-in **`--ktx2`** flag that switches `textureCompress` to
  `targetFormat: 'ktx2'` (ETC1S colour / UASTC data maps); it detects whether
  the `toktx` binary is on PATH and falls back to WebP with a notice if not.
  **Remaining work is just installing the encoder** to actually bake the KTX2
  siblings: KTX-Software (not in apt — use the official `.deb` release or
  `brew install ktx`), **staying on the 4.3.x line** since 4.4+ replaces `toktx`
  with the unified `ktx` CLI (our detector looks for `toktx`). The app already
  decodes KTX2 (drei auto-wires it). Note KTX2/Basis encoding is seconds/texture
  vs ms for WebP — a full `--ktx2` re-run is much slower. Related: the older
  asset-pipeline KTX2 TODO under §Assets.

## Multi-format model + texture import
- **KTX2 in-browser encode (scaffold only)** — the model dialog's *Maximum
  compression (KTX2)* toggle and `optimizeGlb`'s `ktx2` option are wired, but
  `src/lib/ktx2encode.ts` is a stub (`isKtx2EncodeAvailable()` → false) so it
  always falls back to WebP. To actually emit KTX2 in-browser, integrate a
  Basis-Universal WASM encoder (e.g. the KTX-Software `libktx` wasm build or a
  basis_encoder wasm) and have `encodeKtx2` produce UASTC/ETC1S payloads;
  `KHRTextureBasisu` is already added when an encode succeeds.
- **Standalone KTX2/DDS texture upload** ✓ SHIPPED (C274) — `decodeGpuTexture.ts`
  handles both formats: uncompressed KTX2 via pure-JS `ktx-parse`, Basis-compressed
  KTX2 via `KTX2Loader` + GPU readback, DDS via `DDSLoader` + GPU readback for
  compressed formats. Pipeline: `decodeImage` → `normalizeTextureFile` → WebP.

## Competitive-parity upgrade (2026-06-04)
Spec: [docs/superpowers/specs/2026-06-04-competitive-parity-upgrade-design.md](docs/superpowers/specs/2026-06-04-competitive-parity-upgrade-design.md).
Shipped: render-on-demand (A1), bookshelf instancing (A2), 2D furniture layout +
2D⇄3D `P` toggle (G), Smart Start (B), live IKEA SG pricing sidecar (C),
photo-trace backdrop (F), AI floor-plan recognition (E), AI photoreal export (D).
Deferred / follow-ups:
- **Instancing (A2)** — bookshelf books (~48→9 draw calls) and now the **crib**
  (all vertical slats — both long sides + slatted short ends — collapse into one
  `InstancedBoxes` draw call instead of ~36–72 meshes) use
  `primitives/InstancedBoxes.tsx`. Other repeat-geometry primitives can adopt it
  similarly if profiling justifies it; cross-item instancing was intentionally
  avoided (conflicts with per-item material/finish/selection).
- **AI features (D/E) are bring-your-own-key + experimental** — the live calls
  need a real key and may require a CORS proxy depending on provider (handled as
  a clear error). D defaults to Replicate img2img; E to an OpenAI-compatible
  vision endpoint. No key is ever bundled. Consider a dev proxy sidecar if CORS
  blocks common providers.
- **Live pricing (C) is dev-only** — Courts/HipVan/Castlery now join IKEA SG as
  `RETAILERS` entries in `price-server.mjs` (fuzzy top-hit name match, offers
  shown cheapest-first in the Shopping panel). **Deferred:** the Courts/HipVan/
  Castlery adapters were written offline against best-effort fixtures of each
  site's plausible search-response shape — they need a real-network verification
  pass (run `npm run price-server` on a connected machine, confirm/fix the URL +
  response shapes, refresh the fixtures in `price-server.test.mjs`).

## Pure-client improvement pipeline (2026-06-19 audit)

Refreshed backlog of high-value items that are **100% client-side** — no real GPU, no
network/backend dependency — so each is implementable AND verifiable headlessly in this
sandbox. Audited against `CHANGELOG.md` (latest: edge bevels, set-dressing decor pack,
auto-styling, drawing-set callouts, quote templates, parametric kitchen-run) +
`FEATURE_PARITY.md` + `FEATURE_FLAGS`; nothing here duplicates shipped work. Prioritised:
correctness/reliability first, then QOL/UX, then polish. Effort: S/M/L. Each item names the
files/areas it touches and the parity gap it fills.

### Correctness / reliability
- **PC-ARRAY-GAP** (M) — The array tool (`InspectorPanel.tsx` `duplicateRow`,
  `arrayPlacement.ts` `arrayOffsets`) only emits a single **row to the right** at a hardcoded
  step (`w + 0.12`, axis `'right'`) and silently drops any copy that fails `canPlace` — so a
  user asking for 6 chairs can get 3 with no feedback. Surface a count/got toast and expose the
  already-supported `axis` ('right'/'forward') + a spacing field; also add a 2D **grid array**
  (rows × cols) since `arrayOffsets` is row-only. Touches `furniture/arrayPlacement.ts`,
  `ui/inspector/InspectorPanel.tsx`. Gap: Coohom/SH3D step-and-repeat; current row-only tool is
  a partial. Verify via unit tests on offsets + a scenario asserting placed-count.
- **PC-DISTRIBUTE-OVERLAP** (S) — `distributeEvenGaps` (`layout/alignDistribute.ts`) computes
  `gap = (hi - lo - totalWidth)/(n-1)`; when the selection's combined footprint exceeds the
  span the gap goes **negative** and items are packed into overlaps with no guard. Clamp to ≥0
  (or fall back to even-centre spacing) and add a "won't fit" signal. Touches
  `layout/alignDistribute.ts` (+ test). Reliability/edge-case bug found during audit.
- **PC-MEASURE-UNITS** (S) — Confirm the tape/measure overlay (`ui/MeasurementOverlay.tsx`,
  `state/slices/measurementsSlice.ts`) renders its distance label through `formatLength(…, units)`
  (imperial support exists in `utils/measurement.ts` but several overlays may hardcode metres).
  Audit every distance/area readout (measure, drag HUD, wall dimension, room labels) for the unit
  toggle; fix any that bypass it. Touches `ui/MeasurementOverlay.tsx`, `ui/DragHud.tsx`,
  `ui/floorplan/editor/WallDimension.tsx`. Gap: SH3D metric+imperial everywhere.

### High-value QOL / UX
- **PC-WALL-NUMERIC** (M) — Live numeric **length + angle entry while drawing a wall** in the 2D
  editor (type "3.6" + Tab → angle, commit). FEATURE_PARITY flags this as a partial vs SH3D.
  Touches `ui/floorplan/FloorPlanEditor.tsx` (draw state), a small numeric-entry overlay, and the
  wall-commit path. Pure geometry + DOM input; verify via scenario typing a length.
- **PC-ARRAY-RADIAL** (M) — Add a **radial/polar array** (N copies around a centre at radius R,
  angular step) alongside the linear/grid array — common for dining chairs around a round table.
  Pure trig in `furniture/arrayPlacement.ts` (`radialOffsets`) + inspector controls; collision-
  checked per copy. Gap: Coohom/CAD-style array tooling. Unit-test the offsets.
- **PC-IES-LIGHT** (M) — Parse `.ies` photometric files into a spotlight intensity/cone profile
  for placed light fixtures (no GPU needed for the parse + cone-angle/intensity mapping; the
  visual is just standard three lights). FEATURE_PARITY lists IES import as a client-feasible
  Coohom gap. New `scene/lighting/iesParse.ts` (pure, unit-testable) + a fixture upload in the
  light inspector; gate behind a new `iesLights` pro flag. Verify parse with a sample `.ies`.
- **PC-GUIDE-SPACING** (S/M) — Extend `AlignmentGuides.tsx` (currently constant-X/Z centre lines)
  with **equal-spacing badges**: when the dragged item sits between two others, draw the two gaps
  and flag when they're equal (smart-guide "equal distance" cue). Pure 2D math from existing
  footprint OBBs; touches `scene/AlignmentGuides.tsx` + the drag-guide producer in
  `scene/DragController.tsx`. Gap: Figma/Coohom-grade smart guides. Verify via screenshot.
- **PC-NUDGE-UNDO** (S) — Audit that every furniture **nudge/array/align/distribute/mirror**
  pushes exactly one coalesced undo entry (rapid arrow-key nudges should collapse, not flood the
  history). Check `layout/selectionActions.ts` + `state/slices/historySlice.ts` interplay and add
  nudge-coalescing if missing. Reliability/QOL; unit-test the history depth after a nudge burst.
- **PC-CATALOG-FAVOURITES** (S) — A persisted **favourites/star** list in the catalog (separate
  from `recentSlice`) so users can pin go-to pieces. Touches `ui/catalog/*`, a small
  `favouritesSlice` + save schema field; `simple`-tier. Gap: every consumer planner has favourites;
  we only have "recent". Unit-test the slice + persistence.
- **PC-ROOM-AREA-ONPLAN** (S) — Verify the 2D plan shows each room's **live area + perimeter**
  label (SH3D shows area on-plan); if only dimensions show, add area via `roomCentroid.ts` +
  `floorplan/roomDetect.ts` polygon area, respecting the unit toggle. Touches
  `ui/floorplan/editor/*` room-label rendering. Quick, high-perceived-value.

### Aesthetic / polish
- **PC-RZ6-SEAMS** (M) — Carry the open RZ6 item: procedural **upholstery seam stitching +
  seeded fabric-wrinkle** normal variation on sofas/chairs (pure procedural geometry/normal map,
  no GPU tier needed for the base read on Performance). Touches `furniture/primitives/Sofa*.tsx`
  + a shared seam helper in `materials/`. Gap: photoreal soft goods. Verify via screenshot.
- **PC-DRAG-DIM** (S) — While dragging furniture, show a **live distance-to-nearest-wall** readout
  (the FFE/clearance value) in `DragHud.tsx`, not just position — turns the existing clearance
  data into an at-a-glance placement aid. Pure DOM overlay off existing collision distances.
- **PC-EMPTY-STATES** (S) — Polish empty/edge states across panels (no saved views, empty BOQ, no
  comments, empty room): consistent illustrative empty-state copy + a primary CTA, instead of blank
  panels. Touches the various `*Panel.tsx`. Aesthetic/onboarding polish; verify Simple + Pro modes.

## Pure-client improvement pipeline (2026-06-19 refresh #2)

Second refreshed backlog of high-value items that are **100% client-side** — no real GPU, no
network/backend dependency — so each is implementable AND headlessly verifiable in this sandbox
(SwiftShader WebGL works; a real GPU does not). Audited against `CHANGELOG.md` (top ~25: edge
bevels, set-dressing decor, auto-styling, drawing-set callouts, quote templates, parametric
kitchen-run, distribute-overlap fix, measure-unit audit, catalog favourites, numeric wall entry,
radial/linear/grid arrays, room area+perimeter labels, drag-HUD distance, undo coalescing,
equal-spacing guides, upholstery seams, shared EmptyState), plus `FEATURE_PARITY.md`,
`PHOTOREALISM.md`, and `FEATURE_FLAGS`. The prior audit's items (`## Pure-client improvement
pipeline (2026-06-19 audit)`) are all shipped except **PC-IES-LIGHT** (still in flight — do not
re-take here). Nothing below duplicates shipped or open work. Prioritised: correctness/reliability
→ photorealism levers → QOL/UX → polish. Effort: S/M/L. Each names the files/areas + the parity gap.

### High-value QOL / UX
- **PC2-CAM-DOF-LENS** (M) — Add **lens type + depth-of-field** controls to the render/snapshot camera
  (focal length / f-stop / focus distance). DoF partly exists in the HQ path tracer (`PhysicalCamera`);
  expose it as UI and apply a cheap post DoF on the High/Max raster tiers too. Touches the render-
  settings UI + `scene/pathtrace/*` + `scene/Effects.tsx`. Gap: SH3D fisheye/DoF lens row in
  `FEATURE_PARITY`. Wiring is headless-verifiable; the pixel pass is real-GPU-pending (mark it).
