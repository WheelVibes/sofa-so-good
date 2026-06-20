# 2026-06-20 follow-up audit — correctness, performance, dead-code, modularization

Fresh audit of the interior-design improvement branch at **v0.3.0.4**, focused on the
most-recently-changed code (SH3D import, procedural sky, camera lens/DoF, material-logic
extraction, FloorPlanEditor geometry extraction) and the largest files. Pure-client,
headlessly-verifiable findings only. CONFIRMED = traced to evidence; SUSPECTED = plausible, needs a
repro.

Method: read the four named recent pure modules + their wiring directly; dispatched parallel
sub-agents for (a) autoArrange/floorPlanSlice/itemsSlice correctness, (b)
furnitureMaterials/InspectorPanel perf+correctness, (c) FloorPlanEditor split plan, (d) `npm run
deadcode` (knip) reconciliation. Every headline finding below was re-verified against source by the
orchestrator.

---

## Top findings (ranked, highest value first)

### AUD-001 — HIGH — multi-level (F13) violation: auto-arrange / furnish / decor skip upper storeys (CONFIRMED)

The recurring ground-only-`plan.rooms` bug class, present in **three** files on the custom-plan
furnish/tidy path. On a multi-storey custom plan (HDB Executive Maisonette, condo penthouse, terrace
+ mezzanine — real `upperLevels`), every upper-floor room is silently left untidied/unfurnished, and
in one path upper items are *mislaid against ground-floor geometry*.

Evidence:
- `src/layout/autoArrange.ts:961` — `for (const room of plan.rooms)` in `arrangeAllRoomsForPlan`
  iterates **ground-floor rooms only** (`plan.rooms` is ground per `floorplan/CLAUDE.md` +
  `levels.ts`). Upper storeys never arranged.
- `src/layout/autoArrange.ts:932` — `const room = plan.rooms.find((r) => r.id === roomId)` in
  `arrangePlanRoom`: an upper-storey `roomId` is not found → returns items unchanged → per-room
  "Tidy up room" is a **silent no-op** on upper floors (room ids are plan-unique across storeys, so
  the id is valid, just absent from `plan.rooms`).
- `src/layout/autoArrange.ts:900` — `inRoom = (i) => pointInPlanRoom(room, i.position[0],
  i.position[1])` has **no `levelId` gate**. `duplicateLevel` clones upper storeys at *identical*
  origin/width/depth, so an upper-floor item shares `[x,z]` with a ground room → `arrangeCore`
  classifies it as a ground-room item and repositions it against ground walls/keepout (collision in
  `placement.ts` is level-gated, so the upper item is only checked against ground obstacles — a real
  cross-level mislayout, not just a skip).
- `src/furniture/furnishPlan.ts:207` — `for (const room of plan.rooms)` seeds kits ground-only;
  `:212` then calls the same `arrangeAllRoomsForPlan`.
- `src/furniture/layout/decorStyling.ts:445` — `plan.rooms.forEach(...)` in
  `applyDecorStylingForPlan`, ground-only.
- Downstream: `autoArrange.ts:855/858` `windowCentres`/`inferFocal` read ground-only
  `plan.openings`/`plan.walls`, so even fixed upper living rooms get wrong focal inference.

Reachable from production entry points (all pass the full multi-level item list + plan):
- `src/layout/tidyHome.ts:15` "Tidy home"
- `src/ui/FinishPicker.tsx:84` per-room "Tidy up room"
- `src/furniture/furnishPlan.ts:212` Smart Start furnish (`furnishPlanItems`)
- `src/state/storage/bootstrap.ts:221` first-run bootstrap

Root cause: the plan furnish/arrange/decor path predates / wasn't updated for F13; the geometry +
collision layer (`itemsCollide`, `findWallClipsByLevel`, `placement.ts:165`, `surfaceDrop.ts`) was
correctly level-gated, leaving this path the outlier.

Fix direction (M, agent-sized):
- `arrangeAllRoomsForPlan`: iterate `planLevels(plan)` and, per level, build `walls`/`keepOut`/
  `windows` from `levelAsPlan(plan, level)` and arrange that level's rooms; OR iterate
  `allPlanRooms(plan)` and resolve each room's level. Add a `levelId` gate to `inRoom`:
  `(i) => (i.levelId ?? 'ground') === levelIdOfThisRoom && pointInPlanRoom(...)`.
- `arrangePlanRoom`: resolve the room across storeys (`levelOfRoom(plan, roomId)`) and derive
  walls/keepOut/windows from that level's `levelAsPlan`.
- `furnishPlanItems` + `applyDecorStylingForPlan`: iterate `allPlanRooms(plan)`; seed/decorate each
  room tagged with its `levelId`.

Headless verify: build a 2-storey plan via `addLevel`/`addRoom` (mirror the `setAllWallFinish`
FIN-ALLROOMS regression test in the finishes slice test), place an item in an upper room, run
`arrangeAllRoomsForPlan` and assert the upper item moved (currently unchanged) and that an upper item
at a ground room's `[x,z]` is NOT yanked to the ground room's wall. Unit-test `furnishPlanItems` on a
2-storey plan asserts upper rooms get seeded items with the right `levelId`.

This is the same class as the shipped FIN-ALLROOMS fix (`setAll*Finish` → `allPlanRooms`,
v0.2.0.56) — apply the identical remedy here.

---

### AUD-002 — MEDIUM — furniture-material caches never evict/dispose → session GPU ratchet (CONFIRMED)

`src/materials/furnitureMaterials.ts` keeps three module-level caches with **no clear/evict/dispose
path anywhere in `src/`**:
- `:497` `const cache = new Map<string, MeshStandardMaterial>()`
- `:769` `const furnitureRepeatCache = new Map<string, MeshStandardMaterial>()`
- `:445` `const patternTex = new Map<string, Texture>()`

Keys embed user-controllable inputs: e.g. `:851` `wood:${color}:${repeat}:${rough.toFixed(2)}`,
`:938` `solid:${color}:${roughness.toFixed(2)}:${metalness.toFixed(2)}`, plus glass/metal variants.
`color` is a free hex from the inspector colour picker; `rough`/`sheen` are slider-driven
(quantised by `.toFixed(2)` to ~100 buckets each). Each distinct combination mints a new
`MeshStandard`/`MeshPhysicalMaterial`, and for wood/stone/concrete/metal/rattan also **clones
albedo+normal+roughness textures** (`:857-859`, `getFurnitureMatWithRepeat` `:783-797`). None are
ever disposed.

Severity MEDIUM (not HIGH): `.toFixed(2)` quantisation bounds the practical entry count to
hundreds, and it only grows under sustained colour/shine slider sweeping — not a quick crash, but a
monotonic VRAM climb over a long editing session, which on lower-end GPUs trends toward the same
context-loss failure mode the project already guards elsewhere.

Precedent for the fix already exists: `materials/cache.ts:193` `disposeCachedMaterial` (disposes
material + all maps) for the `mat:<id>` DLC cache, and `evictGltfAsset` (PERF-001) for GLB assets.
The furniture solid/wood/glass/metal caches are the unguarded gap.

Fix direction (M): add an LRU cap (e.g. ~256 entries) over `cache` + `furnitureRepeatCache` that
disposes the material **and its cloned maps** on eviction; expose a `disposeFurnitureMaterials()`
for teardown symmetry. Keep the *neutral source singletons* (`woodMaps`, `marbleMaps`,
`fabricNormal`, `brushedMetalMaps`, …) as intentional process-lifetime singletons — they are a
fixed finite set, correctly built-once.

Headless verify: drive `getSolidMaterial`/`getFurnitureMaterial` with N distinct colours past the
LRU cap in a unit test; assert `cache.size` stays ≤ cap and that an evicted material had `.dispose`
called (spy). GPU-pixel quality is irrelevant — this is a CPU-side bookkeeping test.

---

### AUD-003 — LOW — array-tool "didn't fit" toast denominator off-by-one (CONFIRMED)

`src/ui/inspector/InspectorPanel.tsx:371` —
`title: \`Placed ${placed} of ${total + 1} — ${dropped} didn't fit\``. `total = placements.length`
(`:355`) is the number of **copies** (source excluded, per `arrayOffsets`/`gridArrayPlacements`
contracts), and by construction `placed + dropped === total`. Adding `+ 1` counts the source as a
copy, so the message reads e.g. "Placed 5 of 8 — 2 didn't fit" (5+2=7≠8). Placement itself is
correct; only the readout lies.

Fix (S, inline): drop the `+ 1` — use `${total}`.

Headless verify: it's a string; a unit test on the toast title, or just visual — trivial.

---

## Recently-added code reviewed and found CORRECT (do not re-investigate)

These were the prime suspects per the task brief; all clean:

- **`floorplan/import/sh3d.ts`** — robust parser. Soft failures → `warnings` (never drops); hard
  failures → `Sh3dParseError`. Coordinate frame, cm→m, origin-anchoring, bbox/extent,
  finite/sane guards (`finiteAndSane`, `clampCoord`), door/window detection (`<doorOrWindow>` tag OR
  `doorOrWindow="true"` attr), category keyword map — all sound. Note: SH3D is single-level by
  construction, so emitting openings onto `plan.openings` (ground) and `importResultToFloorPlan`
  building a flat plan is correct, not an F13 violation.
- **`floorplan/import/sh3dPlacement.ts`** — `defForCategory` orientation-agnostic footprint match,
  `resolveFurniture` collision-filters via `placeNonOverlapping` and reports the dropped count,
  `associateOpenings` clamps offset into `[0, span-width]`, `openingHeights` sane defaults. Pure,
  warning-complete. Limitations are documented (one rep def per category, name-heuristic door/window,
  sill from height) and are scoped follow-ups, not bugs.
- **`scene/lighting/skyGradient.ts`** — analytic Preetham with proper clamps (`perez` guards
  `1/cosTheta`, `xyYtoLinearRGB` guards `y→0`, night factor, ground-tint lower hemisphere). Pure,
  no allocation-in-loop hazard beyond the unavoidable per-pixel bake. Correct.
- **`scene/lighting/skyRebuild.ts`** — `shouldRebuildSky` threshold predicate is correct; cumulative
  sub-threshold drift still eventually fires because each candidate compares to the last *actual
  bake* (`lastBaked.current`), not the previous frame.
- **`scene/SceneBackdrop.tsx`** — both backdrop effects dispose textures and restore the prior
  `scene.background` on cleanup; `SkyBackdrop` debounces re-bakes and disposes the old texture each
  swap. No GPU leak. Background-only (never `scene.environment`) per the RD-409 lock-step rule.
- **`scene/cameras/cameraLensSettings.ts`** + DoF wiring — clamps (`clampFocalMm`/`clampFStop`/
  `clampFocusDistance`), `mmToFov`/`fovToMm` round-trip, `rasterDofParams` monotonic. Wired into the
  HQ path tracer (`hqRenderSession.ts`) and a raster `<DepthOfField>` on High/Max only
  (`Effects.tsx:27` gated on `quality.dof && cameraDof && dofFStop>0`). Lens/DoF settings persist via
  **qualityPrefs** (per-device), correctly NOT in the autosave/serialize design-data path — no
  lock-step gap. `HqRenderModal` reads the store model consistently.
- **`materials/furnitureMaterialLogic.ts`** — `hash01`/`sheenRough`/`applianceFinish`/
  `liftedSheenRgb` correct; `furnitureMaterials.ts` re-exports `applianceFinish` and uses the others
  with no divergent duplicate logic left behind. (One minor stylistic note: `getGradientFabricMaterial`
  hand-rolls its sheen colour instead of `liftedSheenColor` — defensible since its tint is in the
  gradient map; not a bug.)
- **`ui/floorplan/editor/floorPlanGeometry.ts`** — `planCenter`/`nearestWall`/`alongWall` pure,
  curved-wall-aware, zero-length-guarded. Correct.
- **`state/storage/autosave.ts`** — watch-list ⊇ serialize() invariant is intact and guarded by
  `autosave.test.ts`; `pagehide`/`visibilitychange` flush covered. No new serialize() field is
  unwatched.
- **floorPlanSlice / itemsSlice** — all level-aware actions route through
  `withLevelGeometry`/`levelAsPlan`/`levelOfRoom`; `duplicateLevel`/`removeLevel` remap items +
  finishes correctly; undo granularity is correct (batch actions push once, `moveItem`/`rotateItem`/
  `setItems` never push, coalesced setters use stable keys). Verified by sub-agent, spot-checked.
- **InspectorPanel array/duplicate** — undo pushes once per batch then `setItems`; Zustand handlers
  re-read fresh state via `getState()` (no stale-closure); array offset math correct. Only the
  cosmetic AUD-003 toast bug.

---

## Dead code (knip) — low priority

`npm run deadcode`: **0 unused files**, 91 unused exports + 91 unused exported types, 1 duplicate
export, 2 unused devDeps (`@playwright/test`, `playwright`). The "unlisted dependencies" list is
inflated by knip scanning sibling `.claude/worktrees/*` copies — scan noise, not real.

Sub-agent verified the 182 flagged symbols: **178 genuinely dead** (only self-references), **4 LIVE
false positives** (do NOT remove):
- `PROD_PROVIDER_IDS` (`catalog/remote/providers/index.ts:14`) — used by tests.
- `FlagDef`, `FlagOverrides` (`features/featureFlags.ts:26` re-exports) — used by `flags/registry.ts`
  + `flags/resolve.ts`.
- `ArrangeRole` (`layout/autoArrange.ts:14` re-export) — re-exported from `arrangeRoles.ts`.

Verdict: the 178 dead exports are mostly **over-exports of live internals** (the symbol's
*implementation* is used; only the `export` keyword is unnecessary). Deleting them is low-value churn
with real regression risk (several are re-export lines whose underlying source is live —
`mix`/`HORIZON_Y`/`PRESET_HOURS`/`CameraMode`/`TimePreset`). **Recommendation: do not bulk-remove.**
Two concrete safe wins only: drop the unused `@playwright/test`+`playwright` devDeps if Playwright is
truly unused, and de-duplicate the `safeUrl.ts` duplicate export. Otherwise leave knip noise alone or
tune `knip.json` to ignore worktree copies + treat barrel re-exports as used.

No skipped/meaningless tests found in the audited areas; the test suite is healthy (3227+ tests per
CHANGELOG).

---

## Modularization — MOD-FPE-SPLIT concrete plan (`ui/floorplan/FloorPlanEditor.tsx`, 3236 lines)

Already partially extracted (`floorPlanGeometry`/`snapToWalls`/`snapWallAngle`/`planConstants`/
`planLabelDisplay` + several sub-components). The remaining bulk is one `FloorPlanEditor()` with ~22
`useState`, three giant pointer handlers (`onDown` 821–986, `onMove` 988–1163, `onUp` 1165–1319),
toolbar JSX fragment consts (1356–1758), and one ~1500-line SVG `return` with ~16 `.map` layers.

**Keep the three pointer handlers in the component** (they orchestrate ~15 setters + store writes) —
extract only the *pure math they call*.

### Phase A — pure seams, parallelizable, lowest risk (ship each with a co-located `*.test.ts`)
| New file (`ui/floorplan/editor/`) | Exports | ~lines | Risk | Source region |
|---|---|---|---|---|
| `wallHandlesGeometry.ts` | `wallHandleLayout` | 12 | S | 2813–2824 |
| `openingPlacement.ts` | `newOpeningOffset`, `dragOpeningOffset` | 12 | S | 936–940, 1097–1101 |
| `wallTransform.ts` | `translateWall`, `rotateWall` (wrap angle, clamp ±90°) | 35 | S | 1058–1089 |
| `draftCommit.ts` | `draftRect`, `draftLength`, `MIN_*` consts | 20 | S/M | 1238–1318 |
| `zoomMath.ts` | `anchoredScroll`, `clampZoom`, `wheelZoomFactor` | 25 (×3 sites) | M | 503–532, 602–622 |

These touch disjoint regions → safe to run in parallel. ~120 lines + dedup, and they isolate all the
testable math before any component split. **Recommended first wave** — matches the proven
`floorPlanGeometry.ts` pattern exactly.

### Phase B — `editor/useBackdrop.ts` hook (~140 lines, M/L): backdrop state + 3 effects + `runAiWalls` + `loadBackdrop` (302–440). Do alone (owns shared `backdrop` state).

### Phase C — SVG render layers → `editor/layers/` (serialize; each edits the one `return` tree & shares an evolving props contract): RoomsLayer (2048–2210), FurnitureLayer (2212–2326), AnnotationsLayer (2328–2496), WallsLayer (2497–2605), WallDims/OpeningDims (2606–2682, easiest — leans on extracted label helpers), PinnedAnnotations (2683–2746), TourStops (2747–2803, `panoTour` flag), WallHandles (2804–2900, **after** Phase A wallTransform + wallHandlesGeometry), OpeningsLayer (2902–3043), DraftLayer (3044–3179).

### Phase D — `editor/PlanToolbar.tsx` (~400 lines, M): toolbar fragment consts 1356–1758. Largest prop surface; do last.

Phase A+B alone removes ~240 lines and isolates the math; completing C+D brings the file to a
~600–800-line orchestrator. Pure refactor — no new feature, no `FEATURE_FLAGS` change; visual
verification required after C/D (DOM tree changes), Phase A/B are logic-preserving.

Other large-file candidates noted (not planned here): `PlanInspector.tsx` (1307, MOD-PLANINSP-CEILING
already in backlog), `MobileToolbar.tsx` (1204), `InspectorPanel.tsx` (1091), `autoArrange.ts` (1005 —
already had `arrangeRoles.ts` pulled out v0.2.0.54).

---

## Quick-fix vs agent-sized summary

**Inline (S) — fix directly:**
- AUD-003 — InspectorPanel.tsx:371 array toast denominator (`total + 1` → `total`).
- knip: remove `@playwright/test`/`playwright` devDeps (if Playwright unused) + de-dupe `safeUrl.ts`
  export. (Optional; low value.)

**Agent-sized (M/L) — dispatch:**
- AUD-001 (HIGH) — F13 multi-level fix across `autoArrange.ts` (`arrangeAllRoomsForPlan` +
  `arrangePlanRoom` + `inRoom` levelId gate + per-level geometry), `furnishPlan.ts`,
  `decorStyling.ts`. Conflict-group: `cg-autoarrange` / `cg-furnishplan` / `cg-decorstyling`. One
  agent (they interlock through `arrangeAllRoomsForPlan`). Regression-test on a 2-storey plan.
- AUD-002 (MED) — furniture-material cache LRU + dispose in `furnitureMaterials.ts`. Conflict-group:
  `cg-furnmat`. Independent of AUD-001.
- MOD-FPE-SPLIT Phase A (5 pure modules, parallel) then B/C/D. Conflict-group: `cg-fpe`.
