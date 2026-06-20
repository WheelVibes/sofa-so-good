# Coohom / Sweet Home 3D parity backlog — pure-client, headlessly-verifiable

Research pass: 2026-06-20. North-star parity targets: **Coohom** and **Sweet Home 3D**.
Scope constraint: every item below is **100% client-side and headlessly verifiable on
SwiftShader** (pure logic + DOM + scenario harness) — no real-GPU-pixel-only validation,
no server/proxy/backend, no licensed assets. Items that secretly need a real GPU or
backend are split out at the bottom so the orchestrator deprioritizes them.

**Cross-checked against** `CHANGELOG.md` (top ~170 lines), `FEATURE_PARITY.md`,
`docs/ARCHITECTURE.md`, `TODO.md`, and `src/` source. Nothing here duplicates shipped
work. Notably **already done** (excluded): SH3D walls+rooms import (PARITY-SH3D), procedural
sky 1–5 (RD-412), camera DoF/lens (PC2-CAM-DOF-LENS), IES lights (PC-IES-LIGHT),
linear/grid/radial arrays, numeric wall entry, curved/sloped walls, dimension lines / text
notes / polylines on the 2D plan, video flythrough (PARITY-VIDEO), batch render, scene
3D export, replace-with-similar, furniture groups (3D), surface-drop magnetism, copy/paste
of the 3D selection.

---

## Method & key source findings

Three source sweeps drove the ranking:

1. **SH3D importer is geometry-only.** `floorplan/import/sh3d.ts` parses each
   `<pieceOfFurniture>` into a full descriptor — `position [px,pz]`, `rotation` (radians,
   plan sense), `width/depth/height` (cm→m), and a best-effort `category` — into
   `result.items` (sh3d.ts:324-343). But `ui/openSh3dImport.ts:30-45` calls
   `s.setItems([])` and **never places those descriptors**; they only feed a
   "N of M recognised" toast. Likewise `importResultToFloorPlan` emits
   `openings: []` (sh3d.ts:355) — **doors/windows are dropped entirely** (SH3D models them
   as furniture pieces, so they need a wall-association pass). This is the single biggest
   functional gap: the marquee SH3D-import feature visibly imports an *empty* furnished
   home.

2. **The 2D plan editor is wall-centric; furniture is near-read-only there.** In
   `ui/floorplan/FloorPlanEditor.tsx`, walls have rich editing (vertex drag, rotate ring,
   split/join, multi-select via Shift, numeric entry) but furniture footprints are
   **single-select + grid-snapped move only**: no rotate handle, no numeric W/D/H, no
   multi-select, no marquee/rubber-band, no align/distribute. `PlanInspector.tsx`
   (lines 216-1224) handles walls/rooms/openings/notes/dimensions/polylines but **not
   furniture** — you must dive into the 3D per-room editor to rotate or resize a piece.
   SH3D lets you do all of this on the plan. This is a cluster of high-value, pure-DOM/geometry,
   headlessly-verifiable wins.

3. **Large files flagged for modularization** (>1000 lines): `FloorPlanEditor.tsx`
   (3236), `furniture/defs/decor.ts` (1309), `PlanInspector.tsx` (1300),
   `MobileToolbar.tsx` (1204), `furnitureMaterials.ts` (1152),
   `inspector/InspectorPanel.tsx` (1091), `layout/autoArrange.ts` (1005). The editor +
   inspector pair dominate; several backlog items below should land their new logic in
   **new pure modules** rather than growing these files (and `MOD-FURNMAT-LOGIC` from
   `TODO.md` is still open for `furnitureMaterials.ts`).

---

## Ranked backlog (highest value first)

| Rank | ID | One-line | Parity ref | Sev/Impact | Eff | Conflict-group |
|---|---|---|---|---|---|---|
| 1 | **PARITY-SH3D-FURN** | Place parsed SH3D furniture as collision-checked scene items | SH3D import | HIGH (feature is half-broken) | M | `cg-sh3d` |
| 2 | **PARITY-SH3D-OPENINGS** | Map SH3D door/window pieces to wall openings | SH3D import | HIGH | M | `cg-sh3d` |
| 3 | **PARITY-PLAN-FURN-ROTATE** | Rotate furniture in the 2D plan (drag ring + numeric) | SH3D plan ergonomics | HIGH | M | `cg-planeditor` |
| 4 | **PARITY-PLAN-FURN-INSPECT** | Furniture inspector in the 2D plan (name/W·D·H/rotation/finish) | SH3D plan dialog | HIGH | M | `cg-planinspector` |
| 5 | **PARITY-PLAN-MARQUEE** | Rubber-band marquee multi-select (furniture + walls) in 2D | SH3D/Coohom selection | HIGH | M | `cg-planeditor` |
| 6 | **PARITY-PLAN-ALIGN** | Align / distribute / mirror selected furniture in the 2D plan | Coohom/SH3D | MED | M | `cg-planinspector` |
| 7 | **PARITY-DUP-PATH** | Duplicate-along-path (place N copies along a drawn polyline) | Coohom array tooling | MED | M | `cg-arrayplace` |
| 8 | **MOD-FPE-SPLIT** | Extract pointer/tool reducers out of `FloorPlanEditor.tsx` (3236 ln) | maintainability | MED (debt) | L | `cg-planeditor` |
| 9 | **PARITY-PLAN-ROOM-DUP** | Duplicate a room (polygon + finishes + boundary walls) in 2D | SH3D | LOW/MED | S | `cg-planinspector` |
| 10 | **PARITY-SNAP-ROTATE** | Snap furniture rotation to a neighbour's axis while rotating | Coohom smart-snap | LOW/MED | S | `cg-rotategizmo` |
| 11 | **MOD-FURNMAT-LOGIC** | Extract pure helpers from `furnitureMaterials.ts` (1152 ln) | maintainability | LOW (debt) | S | `cg-furnmat` |
| 12 | **PARITY-SH3F** | Import `.sh3f` furniture libraries (zip of models + metadata) | SH3D | LOW | L | `cg-sh3d` |
| 13 | **PARITY-I18N** | i18n scaffold + string extraction | SH3D 20+ langs | LOW | L | `cg-i18n` |

> **Conflict-group rule:** items sharing a `cg-*` tag touch the same file(s) and **must
> serialize**; differing tags run in parallel. `cg-sh3d` (#1,#2,#12) all touch the importer
> + `openSh3dImport.ts`. `cg-planeditor` (#3,#5,#8) all touch `FloorPlanEditor.tsx`.
> `cg-planinspector` (#4,#6,#9) all touch `PlanInspector.tsx`. **Recommended first parallel
> batch (no shared cg): #1 + #3 + #4 + #7** — then #2 after #1, #5/#8 after #3, #6/#9 after #4.

---

## Per-item detail

### 1. PARITY-SH3D-FURN — place imported SH3D furniture (HIGH, M, `cg-sh3d`)
**Why it matters.** SH3D's whole value is "open a plan and see the furnished home." We parse
every piece with full transform + dimensions + a category guess but then call `setItems([])`
and throw them away (`ui/openSh3dImport.ts:36`). The marquee importer ships a **visibly empty
result** — the toast even says "12 of 18 recognised" while placing zero. This is the highest
ROI: the parse work is already done.

**Approach.** Add a pure mapper `floorplan/import/sh3dItems.ts`
(`sh3dItemsToFurniture(result, catalog, getDef)`): for each `Sh3dImportItem` with a non-null
`category`, resolve a catalog def in that category whose `defaultFootprint` best matches the
imported `width × depth` (reuse the nearest-footprint ranking already written for
`furniture/similarItems.ts`), build a `FurnitureItem` at `position`/`rotation`, run it through
`collision/placement.ts canPlace` against the imported walls + already-placed pieces, and skip
+ warn on hard overlaps. Replace the `setItems([])` line with `setItems(placed)` in
`applySh3dResult`. Pure mapper = unit-testable; placement is collision-safe and storey-aware
(all ground for a flat SH3D import).

**Files.** `floorplan/import/sh3dItems.ts` (new, pure), `floorplan/import/sh3d.ts` (export the
descriptor type if needed), `ui/openSh3dImport.ts` (wire `setItems`). `+ sh3dItems.test.ts`.

**Headless verify.** Unit test: a fixture result with 3 mapped + 1 unmapped piece →
`sh3dItemsToFurniture` returns 3 items at correct positions/rotations, drops the unmapped.
Scenario: feed a small synthetic `.sh3d` (build the XML+zip in-test via fflate), import via
`importSh3dFile`, assert `__store.items.length > 0` and positions land inside imported rooms.

---

### 2. PARITY-SH3D-OPENINGS — import SH3D doors/windows as wall openings (HIGH, M, `cg-sh3d`)
**Why it matters.** `importResultToFloorPlan` hard-codes `openings: []` (sh3d.ts:355), so every
imported plan is a sealed box — no doorways, no windows. SH3D models doors/windows as furniture
pieces with a `doorOrWindow` flag; we already read that flag during parse but discard it.

**Approach.** New pure `floorplan/import/sh3dOpenings.ts`: for each piece flagged
`doorOrWindow`, find the nearest plan wall (reuse `ui/floorplan/editor/floorPlanGeometry.ts
nearestWall`), project the piece centre onto that wall to get the `along` offset + width, and
emit a `PlanOpening` (door vs window by SH3D piece category / height-off-floor heuristic).
Serialize into `result.plan.openings`. Must run **after** walls exist and skip pieces too far
from any wall (warn).

**Files.** `floorplan/import/sh3dOpenings.ts` (new, pure), `floorplan/import/sh3d.ts`
(separate the door/window pieces from regular furniture before the items map; today they fall
into `rawItems`). `+ test`. **Serialize after #1** (both touch the importer item/opening split).

**Headless verify.** Unit: a fixture with a door piece centred on a wall → one `PlanOpening`
on that wall at the right `along`/width; a piece 2 m off any wall → warning, no opening.

---

### 3. PARITY-PLAN-FURN-ROTATE — rotate furniture in the 2D plan (HIGH, M, `cg-planeditor`)
**Why it matters.** Today you can drag a furniture footprint in the 2D plan but **cannot
rotate it there** — you must enter the 3D per-room editor. SH3D and Coohom both rotate on the
plan via a corner handle. Walls already have a rotate ring in the editor
(`FloorPlanEditor.tsx` rotation-ring code ~2862-2897); furniture has none.

**Approach.** Add a rotation handle to the selected furniture footprint (mirror the wall
rotate-ring gesture + the 3D `rotateGizmoMath.ts` 15°-snap-with-Shift-bypass), writing through
the existing `itemsSlice.rotateItem` (one undo step). Pure angle math → reuse
`rotateGizmoMath.ts`. This naturally pairs with a numeric rotation field from #4.

**Files.** `ui/floorplan/FloorPlanEditor.tsx` (new gesture + handle render), reuse
`selection/rotateGizmoMath.ts`. Keep new pure math in a small helper if it grows.

**Headless verify.** Scenario: select a plan furniture item, drag the rotate handle, assert
`__store.items[i].rotation` changed and snapped to 15°; Shift-drag → free angle. Plan-PNG
screenshot to confirm the footprint orientation visually.

---

### 4. PARITY-PLAN-FURN-INSPECT — furniture inspector on the 2D plan (HIGH, M, `cg-planinspector`)
**Why it matters.** `PlanInspector.tsx` edits walls/rooms/openings/notes/dimensions but **not
furniture** — selecting a piece on the plan gives you no property panel. SH3D's furniture
modify dialog (name, X/Y, angle, width/depth/height, mirror, visible, color) is a core plan
workflow. We have all the setters already (`itemsSlice` rename/move/rotate; parametric
resize via def props) — they're just not surfaced in the 2D context.

**Approach.** Add a furniture branch to `PlanInspector` (or a sibling
`PlanFurnitureInspector.tsx` to avoid growing the 1300-line file): Name (rename), numeric
X/Z position, rotation (drives + driven by #3), and W·D·H for parametric/resizable defs (reuse
the inspector's existing DimField + `defaultParamProps` clamp path from
`inspector/InspectorPanel.tsx`), plus the finish drop target the Layers rows already use.
Gate purely on selection type; no new flag (plan editing is always available).

**Files.** `ui/floorplan/PlanFurnitureInspector.tsx` (new, preferred), wired from
`PlanInspector.tsx`; reuse `ui/inspector/` DimField + finish controls + `itemsSlice`.

**Headless verify.** Scenario: select a plan furniture item → assert the inspector renders;
type a new name → `__store.items[i].label`; set rotation 90 → `rotation`; resize a parametric
shelf → footprint changes. Unit-test any extracted pure clamp/commit helper. Test in Simple +
Pro (must appear in both — plan editing is mode-independent).

---

### 5. PARITY-PLAN-MARQUEE — rubber-band multi-select in 2D (HIGH, M, `cg-planeditor`)
**Why it matters.** No marquee/rubber-band selection exists anywhere (walls or furniture);
furniture has **no multi-select at all** in the plan (walls have Shift-click only). Every
serious plan editor (SH3D, Coohom, Figma) drag-boxes to select. This unlocks bulk move /
align / delete on the plan.

**Approach.** Add a `marquee` draft state to `FloorPlanEditor` (drag on empty canvas →
rect), pure `ui/floorplan/editor/marqueeSelect.ts` returns the item ids + wall ids whose
footprint/segment intersects the rect (AABB test in plan coords). Feed furniture hits into a
new multi-item plan selection (mirror the existing `selectedWallIds` session set) and wall
hits into `selectedWallIds`. Pure intersection = unit-testable.

**Files.** `ui/floorplan/editor/marqueeSelect.ts` (new, pure), `FloorPlanEditor.tsx`
(gesture + draft render + a `selectedItemIds` session set). **Serialize after #3** (shared
file). Pairs with #6 (which consumes the multi-selection).

**Headless verify.** Unit: a marquee rect over 2 of 3 footprints returns exactly those 2 ids.
Scenario: drag a box over two items, assert selection count = 2; press ⌫, assert both removed
in one undo step.

---

### 6. PARITY-PLAN-ALIGN — align / distribute / mirror on the 2D plan (MED, M, `cg-planinspector`)
**Why it matters.** The 3D editor has align/distribute/mirror (`layout/alignDistribute.ts`,
`layout/mirrorRoom.ts`) but the 2D plan has none — once #5 lands a multi-selection, exposing
the existing pure ops on the plan is cheap parity with Coohom's plan toolbar.

**Approach.** Reuse `layout/alignDistribute.ts` + `mirrorItemX` directly (they operate on
items, not a view); add an N-selected action group to the plan inspector (Align H/V,
Distribute, Mirror). No new geometry — pure wiring + one undo step each.

**Files.** `PlanFurnitureInspector.tsx` (multi-select panel), reuse `layout/alignDistribute.ts`,
`layout/selectionActions.ts`. **Serialize after #4** (shared inspector). **Depends on #5**
(needs a plan multi-selection).

**Headless verify.** Scenario: marquee-select 3 items, Align V → assert equal Z; Distribute →
equal gaps; one undo step each. Unit coverage already exists for the pure ops.

---

### 7. PARITY-DUP-PATH — duplicate-along-path (MED, M, `cg-arrayplace`)
**Why it matters.** We have linear/grid/radial arrays but **no path/polyline duplication** —
place N copies along a drawn curve (fence posts, a row of pendant lights tracing a counter,
chairs along an L). Coohom/CAD array tooling includes path arrays; the polyline primitive
already exists (`floorplan/polyline.ts`) so the input path is free.

**Approach.** Pure `furniture/pathArray.ts pathArrayOffsets(points, count, {align})`: sample N
equally-spaced positions along a polyline (arc-length param) with optional tangent-facing yaw.
Collision-check each copy via `canPlace`. Expose in the inspector array section next to the
linear/grid/radial controls (gate behind the existing `radialArray` pro flag, or a new
`pathArray` pro flag — array tooling is a pro surface).

**Files.** `furniture/pathArray.ts` (new, pure), `ui/inspector/InspectorPanel.tsx` (array
controls), `features/flags/registry.ts` (flag if new). `+ test`. Independent file — runs in
the first parallel batch.

**Headless verify.** Unit: `pathArrayOffsets` along a 2-segment polyline, count 5 → 5 evenly
arc-spaced offsets, tangent yaw correct at the bend. Scenario: assert placed count = requested
(minus collisions, with a toast).

---

### 8. MOD-FPE-SPLIT — modularize `FloorPlanEditor.tsx` (MED debt, L, `cg-planeditor`)
**Why it matters.** At **3236 lines** it's the largest file in the repo and the bottleneck for
items #3/#5 (every plan-editor feature serializes on it). The CLAUDE.md hard rule is "no
monolithic files." `MOD-FPE-GEO` already extracted the geometry helpers; the next layer is the
pointer/tool state machine.

**Approach.** Extract the tool reducers (wall-draw, room-draw, polyroom, autoroom, dimension,
text, polyline draft state + their pointer-down/move/up transitions) into pure, parameterized
modules under `ui/floorplan/editor/` (e.g. `wallDrawReducer.ts`, `draftState.ts`), keeping the
React component as a thin dispatcher. Pure move — identical behaviour — but each reducer
becomes unit-testable and the file shrinks substantially.

**Files.** new `ui/floorplan/editor/*Reducer.ts` modules, `FloorPlanEditor.tsx`. **Serialize
with #3/#5** (same file) — ideally do the extraction *first* so #3/#5 land in small modules.

**Headless verify.** Reducer unit tests (transitions are pure); existing editor scenarios must
stay green (behaviour-preserving refactor). tsc/biome/full-suite.

---

### 9. PARITY-PLAN-ROOM-DUP — duplicate a room on the 2D plan (LOW/MED, S, `cg-planinspector`)
**Why it matters.** Walls + openings have a `duplicate` action in `PlanInspector` but **rooms
don't** (the explore pass confirmed no duplicate button in the room inspector). Duplicating a
bedroom layout is a common plan task.

**Approach.** Add `duplicateRoom` to `floorPlanSlice` (clone polygon + floor/wall finishes +
offset origin; re-run `assignRoomWallNames` so boundary walls/openings get fresh names) +
a button in the room branch of `PlanInspector`. Pure clone helper in `floorplan/`.

**Files.** `state/slices/floorPlanSlice.ts`, `floorplan/` (pure clone), `PlanInspector.tsx`.
**Serialize after #4** (shared inspector). `+ test`.

**Headless verify.** Unit: duplicate a room → new room with offset polygon, copied finishes,
unique id, re-flowed names. Scenario: click Duplicate, assert room count +1, one undo step.

---

### 10. PARITY-SNAP-ROTATE — snap rotation to a neighbour's axis (LOW/MED, S, `cg-rotategizmo`)
**Why it matters.** Rotation snaps only to fixed 15° increments; there's no "align to the
sofa next to it" snap. Coohom-grade smart rotation snaps to nearby items' axes. Cheap pure
math on top of the existing gizmo.

**Approach.** In `rotateGizmoMath.ts`, when within a small threshold of a neighbour item's yaw
(or wall direction), snap to it; surface a faint guide. Pure angle comparison.

**Files.** `selection/rotateGizmoMath.ts` (+ test), `selection/RotateGizmo.tsx` (guide). Touches
the gizmo only — independent of the plan-editor lane.

**Headless verify.** Unit: a target yaw within threshold of a neighbour's yaw snaps to it;
outside threshold falls back to 15°.

---

### 11. MOD-FURNMAT-LOGIC — extract pure helpers from `furnitureMaterials.ts` (LOW debt, S, `cg-furnmat`)
Carried open from `TODO.md`. Extract `hash01`/`sheenRough`/`applianceFinish`/
`metalFinishPreset`/`liftedSheenColor` from the 1152-line `furnitureMaterials.ts` into a tested
`materials/furnitureMaterialLogic.ts`. Pure move; +unit tests. Independent file.
**Verify:** unit tests on the extracted helpers; tsc/biome/full-suite green.

---

### 12. PARITY-SH3F — import `.sh3f` furniture libraries (LOW, L, `cg-sh3d`)
SH3D ships reusable furniture libraries as `.sh3f` zips (model files + a `PluginFurniture`
properties manifest). Parse the zip → convert each model (we already have OBJ/DAE→GLB via
`furniture/convert/`) → register as user assets. Large; lower near-term value than the plan
import. **Serialize on `cg-sh3d`.** Verify: unit-parse a synthetic `.sh3f`, assert N defs.

---

### 13. PARITY-I18N — i18n scaffold (LOW, L, `cg-i18n`)
SH3D supports 20+ languages. Add an i18n framework + string extraction. Pure-client but large
and low near-term value for an HDB/SG-focused app (English/Chinese plausibly the only near-term
locales). Listed for completeness; do not prioritize.

---

## Flagged: NOT cleanly headless-verifiable here (deprioritize / split)

These appear in `FEATURE_PARITY.md` as open but need a **real GPU** or **backend/BYO-key** —
the *wiring* is headless but the payoff isn't, so split or defer:

- **8K+ tiled still render** / **fast rasterized preview tier** (Coohom): tile loop +
  dimensions are headless-verifiable, but the *quality* payoff is real-GPU-only.
- **Day-to-night animated render clip** (RD-423): hour interpolation is headless; the final
  encoded clip quality is real-GPU.
- **Procedural sky IBL** (RD-412 steps 6-7): touches tuned lighting/PMREM — real-GPU.
- **RD-406** tile break-up + triplanar, **RD-409** colour-temperature falloff, **RD-410** VSM:
  pixel passes, real-GPU.
- **AI floor-plan generation** / **AI opening+scale detection** / **AI matting**: BYO-key
  cloud model — backend-shaped.
- **Massive hosted library / branded catalogs / cloud accounts / e-commerce**: backend, out of
  scope per the no-backend design.

---

## New reference tool to add to `REFERENCES.md` (not edited here — flag for orchestrator)

No genuinely new competitor surfaced this pass that isn't already in `REFERENCES.md`
(Arcadium 3D, D5 Render, Coohom, SH3D/SweetHome3DJS are all present). One worth a deeper note
when next editing `REFERENCES.md`: **SweetHome3DJS's `PieceOfFurniture` / `PluginFurniture`
model** (already linked) is the authoritative schema for #1/#2/#12 — the `doorOrWindow`,
`mirrored`, `dropOnTopElevation`, and `sashes` fields define how SH3D associates a door piece
with a wall, which directly informs PARITY-SH3D-OPENINGS.

---

## Recommended dispatch (first parallel batch — no shared conflict-group)

Run concurrently: **#1 PARITY-SH3D-FURN**, **#3 PARITY-PLAN-FURN-ROTATE**,
**#4 PARITY-PLAN-FURN-INSPECT**, **#7 PARITY-DUP-PATH**.
Then second wave: **#2** (after #1), **#5 + #8** (after #3, on `FloorPlanEditor.tsx`),
**#6 + #9** (after #4, on the inspector). Independent singletons #10, #11 can slot into
either wave.
