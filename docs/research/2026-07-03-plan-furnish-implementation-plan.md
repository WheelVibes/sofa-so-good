# PLAN-FURNISH — add & drag furniture in the 2D plan editor

**Status:** Phase 1 (desktop click-to-place) **shipped** — see the "Phase 1 — implemented"
addendum at the end of this doc for what landed vs. what's still open. Phases 2–4 remain
implementation plan / risk assessment only (no code written for them yet).
**Date:** 2026-07-03 · **Baseline build:** `APP_VERSION` `0.12.0.13`.
**Source item:** `TODO.md` → "Core-loop parity gaps (2026-07-03 audit)" → **PLAN-FURNISH** (L, architectural, risk: high).

> Goal: let a user drop catalog items straight onto the 2D plan (the signature Sweet Home 3D /
> Planner 5D / Floorplanner "plan-first" loop), instead of having to enter the 3D per-room editor
> to place. Move / rotate / scale of *already-placed* items **already works in 2D** — the gap is
> **adding new items** (a catalog surface + a 2D placement ghost + a commit path).

---

## 1. Current architecture (precise)

### 1.1 The 2D plan editor
- **`src/ui/floorplan/FloorPlanEditor.tsx`** (~2800 lines) — lazy-mounted (`App.tsx:1134`, behind
  `Suspense`) as a full-screen overlay over the persistent 3D `<Canvas>` when
  `visualScene.floorPlan` is active. It is a dispatcher over pure helpers in
  `src/ui/floorplan/editor/*` and SVG render layers in `editor/layers/*` (see
  `editor/CLAUDE.md`). The plan surface is an **SVG**, not a canvas.
- **Coordinate mapping already exists** (this is the plan-space↔world-space bridge the task says to
  leverage):
  - `toPx(m)` (from `usePlanViewport`) — world metres → screen px.
  - `pointerGrid(e)` (`:501`) — pointer → grid-snapped world metres (`snap` + guide snap).
  - `pointerPlanRaw(e)` (`:515`) — pointer → raw (unsnapped) world metres.
  - `pointerWorld(e, excludeWallId?, snapEdges?)` (`:522`) — grid + wall vertex/edge snap.
  - The plan axes map **world x→x, world z→plan y** (2D screen y). Confirmed in the item-rotate
    branch comment (`:965` "Plan world coords map x→x, z→z").
- **Placed-item interaction in 2D is fully implemented** and reuses the same pure placement/
  collision code as 3D:
  - Move: `movingItem` state + `onMove` branch (`:1014`) → validates with
    `canPlace(..., { others, defs, doors, walls: placementWalls(st, it.levelId) })` then
    `st.moveItem`. Multi-select rigid drag at `:1025`.
  - Rotate: `rotatingItem` (`:957`) reusing `scene/selection/rotateGizmoMath`
    (`pointerAngle`/`computeRotation`); multi-rotate `rotatingMulti` (`:887`).
  - Scale: `scalingMulti` (`:922`) reusing `scene/selection/resizeGizmoMath`.
  - Undo: each grab calls `st.pushHistory()`; `onUp` calls `st.dropRedundantHistory()` (`:1120`)
    to drop a no-op grab (BUG-016 pattern).
- **`editor/layers/FurnitureLayer.tsx`** — renders each item's top-down footprint
  (`itemFootprint(it, def)` → `obbCorners` → `toPx`), category glyph, selection highlight, the
  multi-select bounding box + rotation ring + corner scale handles, and name/price labels. Its
  `onPointerDown` selects + calls `beginElementDrag` + `setMovingItem`. **It already renders
  furniture in the plan** — the render half of PLAN-FURNISH is done.
- **Furniture is HIDDEN by default in the plan editor** — `showFurniture` state (`:314`, default
  `false`), toggled by the toolbar "Furniture" button. The `FurnitureLayer` mount and the
  marquee candidate set (`:1151`) are both gated on it. Placement must force this on.
- **Interaction modes:** `editMode: 'view' | 'edit'` (`:310`, default `view` on mobile, `edit` on
  desktop). `beginElementDrag` (`:574`) refuses to move in view mode / on unselected touch items.
  `tool` state (`select`/`wall`/`room`/`door`/…) — there is **no furniture-placement tool** today.

### 1.2 How furniture placement works in 3D today
- Catalog card arms placement → `placementSlice.setActiveDefId(defId)` (or `startStamp`).
- **`scene/PlacementGhost.tsx`** — a 3D scene component: raycasts the cursor onto a floor plane
  each frame, runs `canPlace(...)`, tints the footprint green/red, and writes
  `setGhostWorld([x,z], valid)`. **Gated on `canEditScene`** (`:39`) — returns null and does
  nothing outside the per-room editor.
- **`ui/catalog/usePlacementController.ts`** — mounted once at `App.tsx:147`. Global window
  listeners; commits on canvas click / touch lift / HTML5 drop. Its `doCommit(keepArmed)` reads
  `ghostWorld`/`ghostValid`, calls `addItem({ defId, position: ghostWorld, rotation, props })`,
  `beginDrop(newId)`, and sets `pendingEdit` (the tick/cross **Apply change?** confirm bar).
  **Every commit path is gated on `ev.target instanceof HTMLCanvasElement`** (`:139`, `:206`) — a
  drop on the plan editor's SVG never reaches it.
- **Placement slice** (`state/slices/placementSlice.ts`): `activeDefId`, `stampMode`, `ghostWorld`,
  `ghostValid`, `ghostRotation` (`rotateGhost`), `pendingEdit`, `reopenCatalogAfterPlace`
  (mobile long-press hides the catalog, restored on confirm/cancel: `:184`, `:212`, `:227`).
- **`store.addItem`** (`state/slices/itemsSlice.ts:79`) is **NOT gated on `canEditScene`** — it
  pushes history itself and assigns `levelId` from `roomEditor` when active, else honours an
  explicit `levelId`. Callable from anywhere (the 2D editor already calls `moveItem`/`rotateItem`
  directly).
- **`CatalogDrawer`** (`ui/catalog/CatalogDrawer.tsx:203`) returns null unless
  `open && cameraMode === 'orbit' && roomEditorActive` — i.e. only in the per-room editor. It docks
  as a left-rail sibling of `.stage-area` on desktop (`dock-panel-left`), bottom sheet on mobile.

### 1.3 What `canEditScene` / VIEW-EDIT-SPLIT gates, and why
- `state/editing.ts:canEditScene(s) = s.roomEditor.active && s.cameraMode === 'orbit'`. Documented
  as "the single rule for whether **scene** editing is enabled" — orbit-overview + walk are
  view-only; all **3D-scene** selection/drag/rotate/placement/finish happens only in the per-room
  editor (`state/CLAUDE.md:93`, `docs/ARCHITECTURE.md` "View / edit split").
- It gates: the 3D interaction handlers in `App.tsx` (`:283`, `:299`, `:320`, `:651`, `:822`,
  `:895`), `PlacementGhost`, `DragController`/gizmos, `usePlacementController`'s effect, and the
  visibility of `CatalogDrawer` / `InspectorPanel` / `FinishPicker` (`ui/CLAUDE.md` "Editing UI …
  gate on `canEditScene`").
- **Crucial nuance for this task:** the 2D plan editor is a **separate, already-existing editing
  surface that does NOT run through `canEditScene`.** It edits `store.items` directly (move/rotate/
  scale, delete, marquee) with its own gating (`editMode`, `tool === 'select'`, `showFurniture`).
  In floor-plan mode `roomEditor.active` is false, so `canEditScene` is false and the 3D placement
  stack (PlacementGhost / usePlacementController) stays inert behind the overlay. **PLAN-FURNISH
  therefore does not modify or bypass `canEditScene`** — it extends the parallel 2D surface. This
  is the key de-risking insight: the invariant "no 3D-scene editing outside the room editor" is
  untouched.

---

## 2. What must change (reuse vs new)

### Reuse (already present — do not rebuild)
| Capability | Source |
| --- | --- |
| Plan↔world coordinate mapping | `FloorPlanEditor` `pointerWorld`/`pointerGrid`/`toPx` |
| Footprint geometry + render | `collision/placement.itemFootprint`, `collision/obb.obbCorners`, `FurnitureLayer` |
| Collision / clearance / wall bounds | `collision/placement.canPlace`, `collision/placementWalls.placementWalls` |
| New-item defaults | `defaultProps(def)` (dup'd in `PlacementGhost`/`usePlacementController` — factor out) |
| Commit + drop-in + confirm | `store.addItem`, `scene/placementDrop.beginDrop`, `placementSlice.pendingEdit` + `EditConfirmBar` |
| Ghost rotation before drop | `placementSlice.ghostRotation` / `rotateGhost` (R key) |
| Armed-def state | `placementSlice.activeDefId` / `setActiveDefId` / `cancelPlacement` |
| Catalog grid, search, favourites | `ui/catalog/CatalogDrawer` + `useUnifiedCatalog` |
| Mobile long-press → hide/restore catalog | `reopenCatalogAfterPlace` |
| Undo granularity | `pushHistory` / `dropRedundantHistory` |

### Genuinely new
1. **A catalog surface reachable from the plan editor.** Options: (a) relax `CatalogDrawer`'s gate
   (`:203`) to also allow `visualScene.floorPlan` and dock it in the plan editor's layout (the plan
   editor "has its own layout — not docked yet", `ui/CLAUDE.md`), or (b) a lightweight
   plan-scoped catalog panel. Recommend (a) — reuse the full grid/search; add a plan-editor dock
   slot. Biggest UI/layout task.
2. **An SVG placement ghost layer** — new `editor/layers/PlacementGhostLayer.tsx`: a footprint
   polygon following the cursor in plan space (reusing `itemFootprint` on a synthetic ghost item +
   `obbCorners` + `toPx`), tinted green/red by `canPlace` against `placementWalls(st, levelId)`,
   honouring `ghostRotation`. This is the 2D analog of `scene/PlacementGhost.tsx` but SVG, driven
   by `onMove`'s existing pointer plumbing (no per-frame raycast needed).
3. **A commit path in `FloorPlanEditor` pointer dispatch.** When `activeDefId` is set: `onMove`
   updates the ghost world point; a click/tap (or drop) commits via `addItem({ defId, position:
   pointerWorld(e), rotation: (def.defaultRotation ?? 0) + ghostRotation, props: defaultProps(def),
   levelId })` → `beginDrop` → `pendingEdit`. Must pass the **active storey `levelId`** explicitly
   (multi-level plans; `addItem` won't infer it outside the room editor).
4. **Force `showFurniture` on while a placement is armed**, so the just-placed piece is visible and
   selectable (today it defaults off).
5. **Selection / inspector interplay.** The 2D `PlanFurnitureInspector` already edits a selected
   item; on commit, select the new id so its inspector opens (parity with 3D `pendingEdit` flow).
6. **Window-bound fixtures** (curtains/blinds/grilles): 3D routes these through
   `snapToNearestWindow` + `windowFixtureProps` (bypassing floor collision). The 2D commit must
   mirror that branch or exclude window-bound defs from the first slice.
7. **Feature flag + tier** (see §4).

### Deferred / lower priority
- **Drag-from-catalog (HTML5 DnD) onto the SVG.** `ui/CLAUDE.md`: "drop zones must be a `<div>`"
  and "2D room polygons are SVG, so the … drop-zone rule needs a workaround" (same friction logged
  for the deferred 2D-plan finish DnD). Click-to-arm-then-click-to-place is the safe first
  gesture; DnD is a later phase.
- **Live wall-hugging slide during drag** (already a deferred item in `TODO.md`).

---

## 3. Risk assessment (concrete)

1. **VIEW-EDIT-SPLIT / `canEditScene` regression (High → mitigated).** The documented invariant is
   "no 3D-scene editing outside the per-room editor." The safe design keeps *all* new placement
   logic inside the 2D editor and its own `placementSlice` reads — **never relaxing `canEditScene`
   itself.** Danger zone: if the new plan ghost/commit accidentally reuses `usePlacementController`
   or `PlacementGhost` (both `canEditScene`/canvas-bound), or if the catalog is surfaced by
   loosening `canEditScene` rather than by adding a `visualScene.floorPlan` branch, the 3D
   placement stack could start firing behind the plan overlay. **Mitigation:** a dedicated 2D ghost
   layer + a `visualScene.floorPlan`-specific catalog gate; add a regression test asserting
   `canEditScene` is still false in plan mode and `PlacementGhost` renders null.
2. **Double-editing surfaces staying in sync (Medium).** Both editors now write the same
   `store.items` via the same `addItem`/`canPlace`/`placementWalls`. This is already true for
   move/rotate, so the risk is contained — but `pendingEdit`/`EditConfirmBar` is currently wired to
   the 3D confirm flow; reusing it from the plan editor must not leave a pending edit dangling when
   the user switches surfaces (`startDrag` already auto-confirms a stale pending edit — verify the
   plan path does too). Level assignment is the sharp edge: a wrong/omitted `levelId` places the
   item on the ground storey of a multi-level plan.
3. **Catalog-in-plan layout + mobile (Medium).** The plan editor has a bespoke (non-docked) layout;
   inserting the left-rail catalog without breaking the SVG viewport/pan/pinch (`usePlanViewport`)
   and the mobile "Tools" sheet is non-trivial. Mobile placement (long-press → `reopenCatalog`,
   tap-to-place, view-vs-edit mode) roughly doubles the interaction test matrix.
4. **Feature-flag / tier discipline (Low, but mandatory).** Must add a `FEATURE_FLAGS` entry gated
   in React (`useFeature`) and the ⌘K `COMMAND_FLAGS` map if a command is added; pure-code +
   CC0-safe so `default: true`. **Tier: `pro`** — placement-in-plan is an advanced/authoring
   surface; Simple stays the minimal furnish-in-3D loop. Must unit-test **both** modes
   (`resolveFlags(..., 'simple')` hides it, `'pro'` shows it) per the hard rule.
5. **Verification burden (Medium).** Headless drag-drop is "fiddly to verify" (`TODO.md`). A
   click-to-place gesture is scenario-testable via `scripts/shot.mjs --scenario` (arm via
   `window.__store.setActiveDefId`, click the SVG, screenshot). Visual verification required
   (playbook) — footprint ghost tint, drop-in, collision reject.
6. **Invariants that could regress:** the `showFurniture`-off default (marquee/selection gate must
   stay honest); `dropRedundantHistory` (a placement is a real add, not a no-op — must not be
   dropped); autosave lock-step (no new persisted field — `addItem` already round-trips through
   `items`); the "editing UI mounts only in room editor" rule in `ui/CLAUDE.md` (this plan
   deliberately widens it for the catalog only, in the plan editor — document the exception).

---

## 4. Phased approach (each phase independently shippable + flag-gated)

New flag **`planFurnish`** (`features/flags/types.ts` union + `features/flags/registry.ts` entry
`{ label: 'Furnish in plan', description: 'Add furniture directly on the 2D floor plan',
default: true, tier: 'pro' }`) + `features/flags/planFurnish.test.ts` (tier=pro, on in Pro, off in
Simple), mirroring `stampPlace.test.ts`. All phases sit behind it.

| Phase | Scope | Reuses | New | Effort | Ship? |
| --- | --- | --- | --- | --- | --- |
| **1. Click-to-place (desktop core)** | Surface catalog in plan editor; arm a def; SVG ghost follows cursor with green/red `canPlace`; left-click commits on active storey → `addItem` + `beginDrop` + `pendingEdit`; R rotates ghost; Esc/right-click cancels; auto-show furniture; select new item. Exclude window-bound defs. | coord mapping, `canPlace`, `placementWalls`, `itemFootprint`, `addItem`, `beginDrop`, `pendingEdit`, `ghostRotation`, CatalogDrawer grid | `PlacementGhostLayer.tsx`; commit branch in `onDown`/`onUp`; `visualScene.floorPlan` catalog gate + plan dock slot; `planFurnish` flag; factor out shared `defaultProps` | **M–L (4–6 d)** | **Yes — start here** |
| **2. Mobile + polish** | Touch tap-to-place + long-press-from-card (`reopenCatalogAfterPlace`); view/edit-mode interplay; mobile Tools-sheet catalog entry; grid snap; stamp-mode reuse (`stampPlace`) for repeat drops. | `reopenCatalogAfterPlace`, `stampMode`, snap | mobile gesture wiring in plan dispatch | **M (3–4 d)** | Yes |
| **3. Window-bound fixtures + variants** | Route curtains/blinds/grilles through `snapToNearestWindow`/`windowFixtureProps` on drop; carry pre-place variant/tint if CATALOG-VARIANT ships. | `windowSnap`, `windowFixtureProps` | 2D window-bound commit branch | **S–M (2–3 d)** | Yes |
| **4. Drag-from-catalog (HTML5 DnD)** | Native drag a card onto the SVG plan; ghost tracks `dragover`; drop commits. | Phase-1 ghost/commit | SVG drop-zone workaround (the logged `<div>`-vs-SVG issue) | **M (3 d)** | Defer until Phases 1–2 proven; DnD adds cross-browser/touch friction for marginal reach |

**Sequencing note:** run heavy verification phases sequentially per the hard rules (never a full
test suite + a screenshot harness at once).

---

## 5. Recommendation

**Proceed — start with Phase 1.** The risk label "high" is driven by the fear of touching
`canEditScene`, but the investigation shows the 2D editor is **already a parallel editing surface**
that mutates `store.items` through the same pure `canPlace`/`addItem`/`placementWalls` code —
move/rotate/scale of placed items works today. PLAN-FURNISH only adds the **missing "add" verb** to
that surface; it need not (and must not) relax `canEditScene` or reuse the canvas-bound 3D
placement stack. That keeps the VIEW-EDIT-SPLIT invariant intact and makes the core slice a bounded
"catalog surface + SVG ghost + commit branch" job, not an architectural rewrite.

**First phase:** Phase 1 (click-to-place, desktop), **~4–6 dev-days**, behind a new `pro`-tier
`planFurnish` flag, tested in both Simple (hidden) and Pro (shown) modes, with a regression test
asserting `canEditScene`/`PlacementGhost` stay inert in plan mode, and visual verification of the
footprint ghost + drop-in + collision reject.

**Top 3 risks:** (1) accidentally reactivating the 3D placement stack behind the plan overlay by
loosening `canEditScene` instead of adding a `visualScene.floorPlan` gate; (2) `levelId` /
`pendingEdit` sync across the two editing surfaces on multi-level plans; (3) catalog-in-plan layout
+ mobile gesture matrix.

**Defer:** Phase 4 (HTML5 drag-from-catalog) until Phases 1–2 are proven — the SVG drop-zone
friction (`ui/CLAUDE.md`) and cross-browser/touch cost outweigh its marginal reach over
click-to-place.

---

## Phase 1 — implemented (this cycle)

Shipped as scoped: desktop click-to-place, `planFurnish` flag (pro tier, default on). Matches
the plan above closely, with a few implementation notes worth recording:

- **Catalog surfacing (§2, option a)** — `CatalogDrawer`'s gate became `!open || cameraMode !==
  'orbit' || !(roomEditorActive || (floorPlanEditing && planFurnish && !isMobile))`. Docked via
  the existing `dock-panel-left` CSS, plus a new `.catalog-in-plan` modifier class bumping its
  z-index (31) above the plan's full-screen overlay (`.plan-screen`, z-30) — the two live in
  different stacking contexts and the catalog would otherwise render invisibly underneath. A
  desktop-only **"Furnish"** toolbar button opens it (and force-shows furniture footprints).
  **Known simplification, not fixed this phase:** the catalog floats *over* the plan rather than
  shrinking its viewport the way `.stage-area` does in 3D (`--left-rail` isn't wired into
  `.plan-screen`'s layout) — logged in `TODO.md` as low-risk polish.
- **Ghost + commit** — a new pure module `ui/floorplan/editor/planFurnishPlacement.ts`
  (`buildPlanGhostItem`/`isPlanPlaceable`/`planGhostValid`/`decidePlanCommit`) plus a new SVG
  layer `editor/layers/PlacementGhostLayer.tsx`, exactly per §2.2. `FloorPlanEditor`'s `onDown`
  gained a placement-commit branch (checked before the existing tool dispatch) and `onMove` gained
  a ghost-tracking branch — both early-return, so no existing tool/drag state can be active
  simultaneously. Local component state (`planGhostWorld`) holds the ghost's world point rather
  than writing into the shared 3D `ghostWorld`/`ghostValid` fields — a deliberate extra
  de-risking of §3 risk #1 (those 3D fields stay untouched by the plan editor; only
  `activeDefId`/`ghostRotation` are shared, matching the plan's reuse table).
  `furniture/placement/defaultItemProps.ts` factors out the previously-duplicated `defaultProps`
  from the 3D ghost + controller, per §2, item 4.
- **R-rotate / Escape / right-click-cancel came free** — the existing global
  `usePlacementController` `window` keydown/contextmenu listeners already key off the shared
  `activeDefId`/`ghostRotation` state and aren't canvas-gated for those paths, so no new key
  handling was needed in the plan editor. One fix was needed: the plan editor's OWN Escape handler
  (registered earlier, since it mounts before a def gets armed) would otherwise run first on the
  same keydown and exit the whole editor — it now checks for an armed placement first and cancels
  that instead (`FloorPlanEditor.tsx`'s `onKey` effect).
- **A real §3 risk #2 instance, found via visual verification, not foreseen in the plan:**
  `EditConfirmBar`'s "abandon a pending edit on leaving the room editor" effect
  (`!roomEditorActive && pending → confirm()`) auto-confirmed a plan-origin `pendingEdit` the
  instant it appeared, because `roomEditorActive` is never true during a plan placement — the tick/
  cross bar never had a chance to show. Fixed by keying that effect off
  `!roomEditorActive && !floorPlanEditing` instead, so it only fires on leaving *both* editing
  surfaces (regression test: `EditConfirmBar.planFurnish.test.tsx`).
- **Window-bound fixtures (curtains/blinds/grilles)** are excluded via `isPlanPlaceable` — arming
  one in the plan shows a toast ("can only be placed from the 3D room editor for now") and
  auto-disarms, rather than showing a ghost that could never validly commit. Deferred to Phase 3.
- **Visual verification**: `scripts/scenarios/plan-furnish-simple.json` — Simple-mode gate (no
  "Furnish" button) → Pro mode → open catalog in plan → arm `sofa-3seat` → ghost follows cursor,
  green over open floor / probed for a collision-free spot in the pre-furnished default flat →
  click commits → item selected with the "Place item?" confirm bar showing → confirm → close plan
  → item confirmed present and correctly sized/named in the 3D scene.
- **Not done this phase** (see the phase table above, unchanged): mobile tap-to-place (Phase 2),
  window-bound fixtures in the plan (Phase 3), HTML5 drag-from-catalog (Phase 4).
- **Update 2026-07-10: Phase 2 SHIPPED (v0.18.6.19)** — mobile tap-to-place + long-press-from-card
  + stamp reuse, with the user-decided option-1 layout (arming auto-closes the catalog sheet,
  mirroring 3D `placeConfirm`; cancel/confirm reopen it). Phases 3–4 remain open (TODO.md).
