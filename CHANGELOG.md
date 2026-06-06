# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit on
`claude/codebase-analysis-optimization-QKCK6`. See `TASKS.md` for the backlog.

## [U1] Metric / imperial measurement units

Commercial-parity feature: a **metric ⇄ imperial** units toggle in the Graphics
(settings) panel (mobile-parity via the accordion), persisted per-device in
`editorPrefs`. Metric stays the canonical/editing unit (Singapore HDB context);
imperial reformats all read-outs — feet-and-inches lengths (`8′ 6″`, carrying
12″ up to the next foot) and square feet. `utils/measurement.ts` is now the
single formatting source (`formatLength`/`formatArea`/`formatDims`/
`formatRoomSize`, each taking an optional `UnitSystem` that defaults to metric
for back-compat), routed through every read-only display: the room-measurement
overlay, tape measure, drag clearance HUD, catalog-card footprints, finish-picker
room area, and the floor-plan editor's area/length/draft labels + inspector. The
plan editor's numeric input fields stay in metres (precise drafting unit).
Formatters unit-tested (metric + imperial, incl. inch-carry + non-finite).
Verified: imperial overlay renders `17′ 9″ · 262 ft²` / `Ceiling 8′ 6″` cleanly
and the panel toggle reflects state.

## [Q23] Catalog sort control

The catalog grid gains a browse-time **Sort** dropdown — **Featured** (the
curated built-ins-then-CC0 order), **Name (A–Z)**, and **Size (small→large)**
(by footprint area; un-downloaded CC0 entries, which carry no footprint, sort
last). `sortCards` is pure and never mutates the source list; it's applied only
to real-category browsing — fuzzy search keeps its relevance ranking, and the
favourites/recent pseudo-categories keep their meaningful order. Changing the
sort resets to page 1. Verified: seating sorts 2-seat → 3-seat → Armchair →
Bar stool → Bench → Chaise lounge under A–Z.

## [Q22] Budget target with over/under indicator

The Shopping panel gains an optional **budget target** (SGD): type a goal and a
progress bar fills toward it, with a live read-out — "$X left · Y% of $target"
under budget (accent), or "Over by $X" over budget (red). State lives in
`featuresSlice.budgetTarget` and is persisted per-device via a new
`storage/budgetPrefs.ts` (wired into the bootstrap, fail-soft); it's not part of
a saved design. Clearing the field removes the target. Verified: a $3,000 target
against the $23k default flat shows "Over by $20,080" with a full red bar.

## [U1b] Units: cover the inspector + printable report

Follow-up to U1 so no surface shows mixed units. Added `formatDimsShort`
(compact furniture dimensions — centimetres in metric "60 × 45 cm", whole
inches in imperial "24″ × 18″") and routed it through the inspector's
footprint read-outs (parametric W×D×H + GLB/IKEA scale dimensions). The
printable report's per-room + total areas now respect the unit preference
(`buildReportHtml` takes an optional `UnitSystem`, passed from both the
desktop Tools menu and the mobile toolbar). Formatter unit-tested.

## [N4b] Per-room ceiling height

Architectural realism: the floor-plan editor's room inspector now has a
**per-room ceiling height** control (clamped 2.2–4 m) with a **"Match home"**
reset that drops the override. It models a dropped/false ceiling — walls stay
full height, exactly like the built-in 2.4 m bathrooms. `Ceiling.tsx` and
`MeasurementOverlay.tsx` now read the **live** per-room override from the
editable `floorPlan.rooms` (falling back to the `ROOMS` constant, then the
global height) instead of only the static `ROOMS` constants, so an edit takes
effect on the default flat immediately; the measurement overlay also surfaces
each room's height as a third label line. Verified: setting Living/Dining to
4.00 m renders that height in the overlay with no artifacts.

## [Q15c] No gizmo/outline over a hidden+selected item

Polish for the hide feature: a piece that's both selected and hidden no longer
shows its rotate gizmo or selection outline floating over the empty spot —
`RotateGizmo` and `SelectionOutline` now skip hidden items. Verified.

## [Q21b] Floor-plan editor: middle-drag panning

Completes canvas navigation on the open grid: **middle-mouse drag pans** the
canvas (alongside scroll + Ctrl/⌘-wheel zoom). The SVG pointer handler now also
ignores right-click (only the left button draws/selects), fixing a stray
right-click-draws quirk. Verified: a middle-drag scrolls the canvas by the drag
delta.

## [Q21] Floor-plan editor zoom

Completes the open-canvas rework: the editor now **zooms** via **− / +** buttons
(with a clickable % reset) and **Ctrl/⌘ + wheel** (zooms around the cursor, plain
wheel still pans). Zoom is a single `PX = basePX × zoom` multiplier, so every
coordinate (toPx + its inverse) stays consistent. Verified: + scales the canvas
3100→3720px at 120% with the plan intact.

## [Q20c] Reliable plan centring on editor open

The scroll-centre ran on a single rAF which could fire before the SVG laid out at
full size, leaving the plan scrolled off to the top-left. Now it retries each
frame until the canvas content exceeds the viewport, then centres — so the plan
is dependably centred when the editor opens. Verified (scroll lands on the plan
centre, not 0,0).

## [Q20b] Floor-plan editor: mobile canvas + bottom-sheet inspector

Follow-up to the open canvas (Q20): on mobile the inspector had an inline
`position: static` that defeated the responsive bottom-sheet CSS, so it sat as a
fixed 256px column squeezing the (now-large) canvas to a sliver. Made that inline
position **desktop-only** (`useIsMobile`) so on mobile the inspector becomes the
bottom sheet and the canvas spans full width with the plan visible/pannable.
Desktop column layout unchanged. Verified on a 390px viewport.

## [Q20] Open pannable grid canvas + cropped plan export

Two fixes from feedback: (1) the floor-plan editor was a tight square sized to
the plan, clipping anything drawn outside the current bounds — it's now an
**open, pannable grid canvas** (the plan sits centred with a large grid margin
on every side; `.plan-canvas` scrolls from top-left and the editor scroll-centres
the plan on open, with the SVG forced to its full size so CSS can't shrink it).
(2) **Export PNG** now crops to the plan's **bounding box + ~1 m padding** (a
viewBox window into the open canvas) so the image is just the plan, not the empty
grid. Verified: the full plan (incl. the previously-clipped Living/Dining) is
centred + reachable, and the export is a tight, styled plan image.

## [Q19] Export the 2D floor plan as a PNG

**Export PNG** in the floor-plan editor downloads the plan (walls, rooms, areas,
dimension labels) as an image to share/print. The SVG styles fills/strokes with
CSS custom properties that don't resolve in an `<img>`-rendered SVG, so
`exportPlanPng.ts` serializes the SVG, substitutes each `var(--…)` with its
resolved value, strips the trace backdrop, and rasterises to a 2× PNG on a
paper-filled canvas. Verified the full pipeline (serialize → vars resolved →
rasterise 820×620 → 178 KB PNG); fail-soft with a notification.

## [Q18] "Centre in room" context action

Right-click → **Centre in room** moves the piece to the centre of the room it's
in (handy for rugs, ceiling lights, dining tables) — using the active plan's
rooms (polygon centroid for free-form rooms, rect centre otherwise),
collision-checked (declines with a notice if the centre is occupied), shown only
when the piece is inside a room. Verified: a bedroom rug snaps to the room centre.

## [Q17] Resizable imports with real-world dimensions

GLB / uploaded / IKEA items' inspector **Scale** control now shows the resulting
footprint in **centimetres** (via `itemFootprint`, not a bare multiplier) and its
range is widened to **0.25×–3×** so a badly-scaled upload or IKEA import can be
corrected (was capped at ±50%). Verified: a 7ft pool table reads "≈ 213 × 118 cm".

## [Q16] Export the shopping list as CSV

Commercial procurement aid: the Budget panel gains an **Export CSV** button that
downloads the shopping list (Category, Item, Quantity, Unit price SGD, Line total
SGD + a grand-total footer) for a spreadsheet or to send to a supplier — honouring
the live-price toggle when on. The CSV builder is a pure, RFC-4180-escaping
module (`shoppingCsv.ts`, unit-tested incl. comma/quote escaping + SGD rounding);
verified in the harness (the default flat exports a 45-line CSV).

## [Q3] Drag-and-drop placement from the catalog (desktop)

Catalog cards are now **draggable straight into the 3D scene** (the headline
placement interaction in Planner5D/Coohom/Roomstyler). `onDragStart` arms
placement, `dragover` drives the live ghost (the same preview + red/green
validity the tap-to-place flow uses), and the drop commits at the ghost position
— declining + disarming on an invalid spot or a drop outside the canvas. It
**reuses the entire existing placement pipeline** (no parallel commit path);
the tap-to-place flow stays as the touch/fallback path (HTML5 drag is desktop
only). Verified end-to-end: a valid drop adds the item (66→67), an invalid one
declines.

## [Q15b] "Isolate" (hide others) context action

Builds on the hide feature (Q15): right-click → **Isolate (hide others)** hides
every item except the current selection so you can focus on one piece/area in a
busy flat; a **Show all (N hidden)** entry appears in the same menu (and the
Layers footer) to restore. New `isolateItems(keepIds)` action in `selectionSlice`.
Verified: isolating the sofa hides the other 65 items (shell intact).

## [Q15] Per-item hide/show (declutter) in the Layers panel

A working-view convenience competitors offer: each row in the **Layers** (Objects)
panel now has an **eye toggle** to hide/show that piece, plus a **"Show all (N
hidden)"** affordance in the footer. Hidden items are skipped by `FurnitureLayer`
but stay placed (still in the data, collision and selectable from the list), so
it's a visual declutter — not a delete. State is `hiddenItemIds` in
`selectionSlice` (session-only, not persisted — it's a transient working view).
Verified end-to-end: hiding the sofa removes it from the scene while the rug /
table / chairs stay and the item count holds at 66.

## [B5] Isolate CC0 texture-load failures across floors / walls / materials

Same class of bug as B4 but for **textured (CC0 DLC) finishes**: floor, wall, and
furniture-material sub-trees loaded textures via bare `<Suspense>`, so a 404/CORS
texture failure threw to the app-level boundary and blanked the scene. Added a
reusable `scene/SilentErrorBoundary` (renders nothing — or an optional fallback —
on error, retries when its `resetKey` changes) and wrapped every textured-finish
loader: `FurnitureMaterialLoader`, `RoomFloor`, `PlanRoomFloor`, `RoomShell`
walls, and both `WallSegment` faces. A failed finish now simply doesn't apply
(furniture keeps its procedural fallback; a surface stays untextured) instead of
crashing. Unit-tested (pass-through, fallback-on-error, resetKey recovery); full
suite green and the default flat still boots all 66 items with floors/walls
rendered.

## [B4] Isolate GLB load failures (one bad model no longer blanks the app)

Each GLB item was wrapped only in `<Suspense>`, which catches the *loading*
promise but not a *rejected* one — so a corrupt user upload or a 404'd remote
model threw past Suspense to the app-level error boundary and **blanked the
whole app**. Added a per-item `GltfErrorBoundary` (R3F class boundary) around
each model: on failure it renders a neutral placeholder box at the item's
footprint (still selectable/movable) while the rest of the scene stays live, and
it retries when the item's model url changes. Unit-tested (throwing child →
placeholder, not a crash; passes children through when fine); full suite green
and the default flat still boots all 66 items.

## [B3] Marquee selection: lasso-style overlap (not centre-only)

Marquee selection tested only each item's projected **centre** against the rect,
so dragging a box over most of a large piece missed it unless the box caught its
exact centre (TODO "Marquee strictness"). Now it projects the footprint's 4
corners + centre and selects when that screen **bounding box intersects** the
marquee — the intuitive lasso behaviour. The hit test is extracted to a pure
`selection/marqueeHit.ts` (`marqueeHitsScreenPoints`) and unit-tested (5 cases:
centre-cover, edge-overlap-with-centre-outside, marquee-inside-big-item,
fully-outside, empty). Full suite green.

## [Q13b] Tape measure: corner snapping + clicks over furniture

Two improvements to the tape tool: (1) **fix** — the floor click-plane sat below
furniture/walls, so clicks over a piece hit the piece instead of registering a
measurement point; it now uses the shared **priority raycast** (extracted to
`scene/raycastPriority.ts`, also used by the rotate gizmo) so a click anywhere
drops a floor point. (2) **corner snapping** — a clicked point snaps to the
nearest furniture footprint corner or wall endpoint within 30 cm
(`scene/tapeSnap.ts` `snapToNearest`, candidates from `obbCorners`/collision
walls), so you can measure exact furniture-to-wall gaps. Both pure helpers
unit-tested; clicks-over-furniture confirmed firing in the harness.

## [N8] Code-split the floor-plan editor out of the initial bundle

The `FloorPlanEditor` (with its AI/template/room-detect deps) was statically
imported and always mounted (rendering null until opened), so its code shipped
in the initial bundle. Switched it to `React.lazy` + `Suspense`, mounted only
while `floorPlanEditing` — the production build now emits a separate
`FloorPlanEditor` chunk (~31 kB / 10.5 kB gzip) and the main entry chunk drops
by ~30 kB, loaded on demand when the user opens the editor. Conditional mounting
is safe (the backdrop rehydrate is gated on `editing` and re-reads IDB per open).
Verified: build splits the chunk, and the editor still opens + renders fully
(plan + ceiling-height control) on first open.

## [Q14] "Select all of this type" context action

Complements the existing "Apply style to all of this type": right-clicking a
piece now offers **Select all of this type (N)** (shown when more than one
exists), selecting every item sharing the def so you can move/rotate/delete or
bulk-edit them together via the multi-select panel. Verified in the harness
(selecting one of three nightstands → all 3 selected).

## [Q13] Point-to-point tape measure tool

A staple of pro planners that was missing (the app only labelled room sizes).
New **Measure** mode (`scene/TapeMeasure.tsx` + `measurementsSlice`
`tapeMode`/`tapePoints`): toggled from the Tools menu (desktop + mobile parity),
it mounts a transparent floor plane that captures two clicks/taps and draws an
always-on-top amber ruler line with a live **distance label** and endpoint
markers; a rubber-band line follows the cursor after the first click, and a third
click starts a fresh measurement. Amber to stay distinct from the blue selection
UI. **Esc backs out of the tool** (before it falls through to deselect). Slice
logic unit-tested (toggle-clears, two-then-reset, clearTape); verified end-to-end
(a [2,2]→[5,6] measurement renders "5.00 m" on the ruler). Floor-plane only for
now (surface-snapping is a possible follow-up).

## [R5] Notify on a blocked report pop-up (no more silent failure)

Opening the printable report uses `window.open`; if a pop-up blocker intercepts
it, the call returned null and the action **failed silently** — the user clicked
Report and nothing happened. Both the desktop (`ToolsMenu`) and mobile
(`MobileToolbar`) report actions now surface an error notification ("Allow
pop-ups for this site, then open the report again.") instead.

## [N4] Adjustable ceiling height

`FloorPlan` already carried a persisted `ceilingHeight` (schema + custom-plan
`PlanShell` honoured it), but the **default flat** rendered from a fixed
`FLAT.ceilingHeight` constant, so the value was effectively unchangeable. Wired
the store's `floorPlan.ceilingHeight` into the default-flat render path —
`WallSegment` (wall extrusion), `Ceiling` (plane Y), `RoomShell` (room-editor
walls), and the `MeasurementOverlay` label height — and added a **Ceiling
height** control to the floor-plan editor's inspector (`updateFloorPlanMeta`,
clamped 2.2–4 m so glazing never clips). Per-room overrides (the dropped 2.4 m
bathroom ceilings) still win; the value persists with the design. Memoised
`WallSegment` re-renders correctly because its internal store subscription isn't
gated by the prop comparator. Verified end-to-end: default (2.6 m) unchanged,
raised to 3.2 m shows visibly taller walls meeting a risen ceiling with no gaps
or floating windows, and the inspector field round-trips the value.

## [N7b] Roving arrow-key navigation in the catalog grid

Completes catalog keyboard access (after N7a made cards focusable + activatable):
the grid now handles **arrow keys to move focus between cards** — ←/→ by one,
↑/↓ by a row. The column count is read from the live layout (cards sharing the
first row's `offsetTop`), so it adapts to the responsive 1/2/3-column
breakpoints rather than hard-coding 2. Only acts when a card itself holds focus,
leaving the nested heart/delete buttons' Tab order intact. Verified in the
harness (0 →→ 1 →↓ 3 →← 2 →↑ 0 with a 2-column layout).

## [Q12] "Straighten" context-menu action

A natural complement to the rotate gizmo's free (Shift-drag) rotation: the
right-click menu now offers **Straighten**, snapping a freely-turned piece to the
nearest right angle (square to the walls). It appears **only when the item is
off-axis** (rotation not a multiple of 90°) to avoid clutter, and is
collision-checked like the Rotate 90° action (a straighten that would overlap is
rejected). Verified in the harness (a rug at 0.5 rad snaps to 0; an off-axis
sofa whose straighten would collide is correctly left untouched).

## [Q11] Flush-to-wall snapping while dragging

A hallmark of pro planners (Planner5D/Coohom): furniture dragged near a wall now
**snaps flush** to it. New pure `collision/wallSnap.ts` (`wallSnapOffset`)
computes the per-axis offset to seat a footprint AABB against the nearest wall
face within ~12 cm — independently on X and Z, so dragging into a corner snaps to
both walls at once. Wired into `DragController`'s single-item drag after the
existing item-alignment snap, gated off when grid-snap is on (a deliberate
precise mode) and skipped for group drags. Uses the same door-aware collision
walls (won't snap across a doorway). Unit-tested (5 cases: face sides, radius
cutoff, corner, out-of-span, nearest-of-many) + verified end-to-end (a nightstand
dragged toward the bedroom wall lands flush, left edge on the wall face).

## [Q10] Per-room cost breakdown in the design report

The printable report grouped furniture only by category, so a client couldn't
see where the budget goes spatially. Added a **"Cost by room"** section: each
placed item is attributed to the plan room containing its footprint centre
(`pointInRoom`), summing item count + estimated cost per room, with an
"Unassigned" bucket for anything outside every room. The aggregation lives in a
pure, unit-tested `reportData.ts` (`furnitureCostByRoom`) and renders into the
existing report table styles; the section is omitted when nothing is placed.
Verified: 6 unit tests (attribution, Unassigned ordering, unknown-def skip, empty
layout, + a `buildReportHtml` integration assertion) and a live report render in
the harness.

## [N7a] Keyboard-accessible catalog cards

Catalog cards were `<div onClick>` — invisible to keyboard + screen-reader users
(no focus, no role, no key activation). Both `CatalogCard` and `RemoteCard` now
carry `role="button"`, `tabIndex={0}`, an `aria-label` ("Place …" / "Add …"),
and Enter/Space activation (arming placement / downloading), plus a
`:focus-visible` accent ring. `usePlacementDrag` accepts an optional event so a
keyboard activation (no cursor) arms the ghost at the viewport centre to follow
the next move. Mouse behaviour unchanged; verified in the harness (Tab focus →
Enter arms placement; focus ring renders).

## [N5] Persist the floor-plan trace backdrop

The reference photo/scan you trace walls over lived only in a session object URL
— lost on closing the editor *or* reloading. Now the **blob + calibration**
(scale `mPerPx`, opacity, world offset) persist to IDB (`backdropPersist.ts`, one
fixed slot via the existing `IdbAssetStore`) and **rehydrate when the editor
opens**, so a traced backdrop survives both. Loading a new image replaces the
slot; the ✕ button clears it; calibration edits are debounced before write; all
storage calls are fail-soft (never break the editor). The rehydrate effect is
gated on `editing` (the editor is always-mounted) and only loads when no
backdrop is present, avoiding duplicate object URLs. Persistence unit-tested (5
cases, fake-indexeddb); verified end-to-end in the harness (a backdrop written
as a "prior session" rehydrates on open — scale/opacity/clear controls appear).

## [B2] Dispose audit — fix leaked overlay geometries

Several scene overlays built three.js geometries with `new` inside `useMemo`
without disposing the replaced buffer. Unlike JSX `<boxGeometry/>` (which R3F
auto-disposes), these leak GPU memory every time their dependencies change —
**hot paths**: `SelectionOutline` (per selected item, on every resize/rotate),
`HoverHighlight` (every hover target), `AlignmentGuides` (every frame mid-drag),
the `DragController` snap highlight, and `GridOverlay` (on grid/plan change).
Each `EdgesGeometry(new BoxGeometry(...))` also leaked the throw-away source box
immediately. Added a shared `scene/geometryUtil.ts` (`boxEdges` — builds edges +
disposes the source box; `useDisposeGeometry` — disposes on dep-change/unmount)
and wired it through all five components. Visually verified the outline, hover,
rotate ring, and snap grid still render with no artifacts.

## [S4] Size cap on `.sofa.json` design import (DoS guard)

`importDesignFromFile` validated content (JSON parse → migrate → zod) but read
any file fully into memory first — a multi-GB or pathological file would block
the tab before validation. Added a **50 MB cap** (`MAX_DESIGN_FILE_BYTES`,
generously above any real design) checked **before** `file.text()`, throwing the
same friendly `DesignFileError`. Unit-tested (rejects oversized without reading).

## [N3+] Rotate gizmo extended to multi-selection (group rotate)

Generalised the rotate gizmo into one unified gesture over a *target set*: a
single item still spins about its own axis (snapping to absolute 15° marks),
while a **multi-selection** now shows one ring enclosing the whole group and
rotates every member **rigidly about the group centroid** — positions orbit the
pivot (`rotatePointAround`, mirrors the store's `groupRotate`) and each piece's
heading advances by the same snapped delta, with a signed degree readout. The
collision check ignores intra-selection pairs (rigid rotation preserves their
spacing) and tests against the rest + walls; an invalid release reverts the
whole set. Three new pure helpers (`rotatePointAround`, `snapDelta`,
`enclosingRadius`) are unit-tested (14 cases total). Verified end-to-end via
synthetic pointer drags: a single rug spins in place (0°→45°, position fixed),
and a two-item group orbits its centroid (both → 45°, positions rotated about
the pivot) and commits.

## [N3] Touch-friendly drag-to-rotate gizmo

Rotating a piece previously meant the keyboard-only <kbd>R</kbd> key (90° /
Shift+R 15°) — unusable on touch and coarse for fine angles. Added a
`RotateGizmo` drawn on the floor around the single selected item (orbit camera +
**select** tool, unlocked): a blue ring + front knob you **drag to spin** the
piece about its vertical axis, snapping to **15°** steps (hold Shift for free).
A live degree read-out follows the knob, the ring tints green/red via the same
`canPlace` check the item-drag uses, and an invalid release reverts to the
pre-gesture angle. The ring/knob meshes patch their `raycast` so the
always-on-top handle wins the pointer pick over taller furniture. Pure rotation
math (`rotateGizmoMath.ts`: relative-angle + snap, radius, degree wrap) is
extracted and unit-tested (8 cases); mounted in both the main and room-editor
scenes. Verified end-to-end in the harness by driving synthetic pointer events
(grab → live `MID 45` → committed `AFTER 45` on a noClip rug; collision revert
on a wall-blocked sofa) plus a clean idle 3/4 render.

## [R3] "Auto-saved …" indicator

Users had no signal their work was being persisted. Added `lastSavedAt` to the UI
slice, set on every successful auto-save (`autosave.ts`), and surfaced as a
reassuring **"Auto-saved just now / Xm ago"** line on the Versions panel's
current-layout card (with a compact relative-time formatter). Visually verified.

## [N9b] Board-and-batten panelling wall finishes

A popular modern wall treatment. Added a `batten` procedural pattern (flat
painted panel + evenly-spaced vertical raised battens with bevelled edges in the
height map; seamless) and three finishes — **Board & batten white / sage /
navy**. Wired into both `ProceduralPattern` unions + `PATTERN_FN`. Visually
verified (clear raised battens catching light, seamless across walls).

## [N2] Duplicate-in-array (row of copies)

A pro "array/clone" tool: the single-item inspector now has a **"Duplicate a row
of N"** control that places N−1 copies to the item's right (local +X), spaced by
its width, each collision-checked (stops at the first blocked slot). The original
+ copies share one groupId and commit in a single undo step. Verified
end-to-end (66→68 placing a row of 3 with two open slots).

## [N9] Microcement / concrete accent wall finishes

Polished-concrete (microcement) walls are a staple of modern interiors. Added
three wall finishes — **Microcement light / grey / charcoal** — reusing the
existing `concrete` procedural generator at a large (3 m) wall tiling scale.
Pure catalog data (no new generator). Visually verified.

## [N10] Inspector "Reset" props to defaults

Customised a parametric item (size/form/finish/colour) and want it back to
stock? The Properties section header now shows a **Reset** pill (only when the
item's props differ from the def's defaults) that restores
`defaultParamProps(def)` in one undoable step. Visually verified.

## [N1] Apply finish to all rooms

Re-finishing every room one-by-one is tedious. Added `setAllFloorFinish(id)` /
`setAllWallFinish(id)` store actions (apply one finish to every interior room,
skipping external spaces like the AC ledge, one undo step) and two
**"Apply floor/walls to all rooms"** buttons in the FinishPicker that propagate
the current room's finish. Unit-tested + visually verified.

## [Q9] Ctrl/⌘+A select-all

A basic editor expectation that was missing. A global Ctrl/⌘+A now selects every
placed item (orbit mode only, skipped while typing or in the room editor),
surfacing the multi-select align/distribute/group/delete panel. Added to the Help
modal shortcut list. Verified (selects 66/66 default items).

## [A2] Modal focus trap

Completes the Modal accessibility story (A1): Tab / Shift+Tab now cycle within
the dialog instead of escaping to the inert background, wrapping at the first/last
focusable element (and falling back to the panel when there are none). Esc-close
and the dialog role/focus behaviour are unchanged. Unit-tested.

## [RE4] Exposed-brick accent wall finishes

Exposed brick is a staple of interior-design tools and was missing. Added a
`brick` procedural pattern (`generators.ts`): running-bond rows offset by half a
brick, recessed mortar joints, per-brick value/warmth variation + fine speckle —
seamless (column count divides the tile, even row count so the half-offset
wraps). Three wall finishes: **Exposed brick** (red), **White-washed brick**,
**Charcoal brick**. Added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified — convincing brick with clean mortar joints, no seams.

## [A1] Modal accessibility — dialog role + focus management

The shared `Modal` primitive (used by Help, Share, Swap, Compass, Credits, …)
had ESC + backdrop close but no ARIA semantics or focus management. Added
`role="dialog"` + `aria-modal="true"` + `aria-label` (the title), and on open it
moves focus into the dialog, restoring it to the previously-focused element on
close — so keyboard/screen-reader users aren't stranded behind the modal. One
change improves every modal. Unit-tested.

## [B1] Fix misleading "cannot be undone" reset confirms

The File menu's "Empty" / "Default" reset confirmations warned the action
"cannot be undone" / "will be lost", but both `resetToEmpty` and `resetToDefault`
call `pushHistory()` first — they're fully undoable with Ctrl/⌘+Z. Corrected the
confirm copy in both the desktop FileMenu and the mobile toolbar to say so, so
users aren't scared off a reversible action.

## [C1] PWA manifest + theme-color + social/Apple meta

Commercial-readiness polish for `index.html`:
- A base-agnostic `public/manifest.webmanifest` (relative `start_url`/icon URLs so
  it works under the `/sofa-so-good/` deploy base) → the app is installable
  ("Add to Home Screen") with name, description, standalone display, and theme
  colour. No service worker (avoids offline-caching complexity/risk).
- `theme-color` meta (light/dark via `prefers-color-scheme`) tints the mobile
  browser/OS chrome to the Clay palette.
- Apple `mobile-web-app` meta (capable, title, status-bar) for iOS home-screen.
- Open Graph + Twitter `summary` meta so shared links (the app has a Share
  feature) get a proper title/description preview.
- Verified via `npm run build`: Vite rewrites the manifest/icon links to the base
  path and copies the manifest into `dist/`.

## [Q8] "Apply style to all of this type" (bulk restyle)

Styling each of N identical chairs by hand is tedious; pro tools (Coohom, Foyr)
let you propagate a material. Added an `applyStyleToAll(id)` store action that
copies one item's props (finish / colour / material / form) to every other
placed item of the same `defId` (skipping locked ones, one undo step, returns the
count). Surfaced as an **"Apply style to all of this type"** context-menu row
(shown only when ≥2 of that type exist) with a success toast. Unit-tested +
visually verified.

## [R4] Drop non-finite item transforms on load

`z.number()` admits `NaN`/`Infinity`, so a corrupt or hand-edited save (or any
future bug that wrote a bad transform) could feed `NaN` straight into the
Three.js matrices — broken/disappearing geometry, potentially a crash-loop on
reload. `applySerialized` now filters out items whose `position`/`rotation` isn't
finite (fixing the layout rather than discarding it wholesale). Unit-tested.

## [F1] Export / import a design as a file (portability + backup)

localStorage save slots are device- and browser-bound, so a design could never
leave the machine it was made on. Added **Export file** / **Import file** to the
Versions panel:

- `state/storage/designFile.ts` — `exportDesignToFile` serializes the current
  state and downloads a pretty-printed `.sofa.json` (filename-sanitized);
  `importDesignFromFile` reads + `migrate`s + `SerializedStateZ`-validates the
  file, throwing a typed `DesignFileError` with friendly messages (bad JSON,
  unsupported version, not-a-design). Same serialized shape as save slots, so it
  round-trips and older files migrate.
- Wired two buttons + a hidden file input in `VersionsPanel`; import applies the
  state, clears history, and toasts success/failure. Re-selecting the same file
  works (input value reset).
- Unit-tested (round-trip, error cases, download filename) + visually verified.

## [Q5] Wall-length labels on the 2D floor plan

Every pro floor planner annotates walls with their length; the editor only had
room-area labels + a transient draw readout. Added persistent per-wall length
labels (metres, at each wall midpoint nudged to its outward side, hidden for
sub-0.4 m stubs, accent-coloured when the wall is selected) plus a **Dims**
toggle in the editor header (default on). Visually verified — every wall now
shows its length alongside the room areas.

## [S1] BYO-key security audit + AI key-exfiltration guard

Audited bring-your-own-key storage (AI keys, Poly Pizza pack key). Findings:
keys live only in `localStorage`, are sent only to their configured provider via
request headers, are never logged to the console, and never enter the save
schema / autosave / export — clean. One defense-in-depth gap fixed: the Replicate
poll loop attached the API key to a URL taken from the provider response
(`pred.urls.get`); a tampered response could have sent the key to an arbitrary
host. Added `safePollUrl`, which only trusts a poll URL whose origin matches
`api.replicate.com` and otherwise falls back to the canonical URL. Unit-tested.

## [Q4] Wire the `?` keyboard shortcut to open Help

The Help & shortcuts modal advertised `?` as its open binding, but no global
handler existed — pressing `?` did nothing. Added a global `?` (Shift+/) handler
in `App.tsx` alongside the ⌘K one: toggles the Help modal, guarded by
`isEditableTarget` so it never hijacks a literal "?" typed into an input, and
ignores modifier combos. Visually verified (pressing `?` opens the modal).

## [RE3] Basketweave parquet floor finish

A premium floor look common in interior-design tools, missing here (only straight
planks existed). Added a `parquet` procedural pattern
(`materials/procedural/generators.ts`): a seamless grid of square blocks each
holding 4 parallel wood planks, with block orientation alternating like a
checkerboard — the classic basketweave parquet. Reuses the wood shading (warped
latewood bands, per-board tint, recessed plank/block grooves), oriented per
block. Two catalog finishes — **Oak parquet** + **Walnut parquet** (`floor-parquet-*`,
tiling at 0.5 m). Pattern added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified (renders as a convincing basketweave, seamless across rooms).
Also cleaned a pre-existing `noAssignInExpressions` lint finding in the same file.

## [Q6] Saved camera views (bookmarks)

A flagship navigation QOL feature from pro tools (SketchUp scenes, Coohom
viewpoints): bookmark a favourite angle of the flat and fly back to it.

- `state/slices/cameraViewsSlice.ts` — named `SavedView` (pos + look-at target),
  capped (12), persisted to `localStorage` (`hdb_camera_views`, device-global,
  out of the save schema). `saveCurrentView` snapshots the live pose; `applyView`
  bumps `applyViewNonce`/`pendingViewPose` and forces orbit mode; plus
  delete/rename.
- The live orbit pose is published each frame into a `cameraPose` singleton
  (`scene/cameras/cameraForward.ts`) by `<OrbitCamera>`, which also consumes
  `applyViewNonce` to **smoothly fly** (0.6 s smoothstep) to a saved pose.
- UI: a modular `SavedViewsSection` in the desktop **View** menu (Save current
  view + per-view go/delete rows) and full **mobile** parity in the View
  accordion (44px touch targets, delete buttons). Themed via new
  `.saved-view-*` / `.m-saved-view-*` CSS.
- Unit-tested (slice) + visually verified: saved two views, snapped to top-down,
  applied a saved view and watched the camera fly back to the 3/4 overview.

## [Q2] "Recent" catalog row for fast re-placement

A staple of every mainstream interior-design app (Planner5D, Coohom, IKEA
Kreativ) — quick access to the items you just used. Added:

- `state/slices/recentSlice.ts` — an ordered, deduped, capped (24) list of
  recently-placed catalog ids, persisted to `localStorage` (`hdb_recent_items`),
  kept out of the save schema/autosave (per-device convenience).
- Hooked from `itemsSlice.addItem`, the single path real user placements,
  duplicates and pastes flow through — the boot seed + set drops use `setItems`,
  so the list stays meaningfully "recently used".
- A **clock "Recent" chip** in `CategoryTabs` (shown only when non-empty, right
  after favourites) and a resolved `recent` list on `useUnifiedCatalog`
  (local-def-only, newest first, orphans dropped). Empty-state copy added.
- Unit-tested; visually verified in the running app (placing an armchair + side
  table surfaces them newest-first under the Recent chip).

## [R2] Surface auto-save failures (localStorage quota)

Auto-save errors were caught but silently swallowed — a user whose browser
storage filled up could keep editing and lose everything on reload with no
warning. Now:

- `startAutosave` gained an `onRecover` hook (fires when a write succeeds after a
  prior failure) alongside the existing `onError`.
- `bootstrap.ts` wires both to a single deduped error notification ("Couldn't
  auto-save", with a quota-specific message) that auto-clears once saving resumes.
- Confirmed the appearance/quality/editor/user-style pref writers already guard
  their `setItem` calls, so no silent throw escapes a store subscriber.
- New `autosave.test.ts` covers the error → recover flow.

## [R1] React error boundary — no more white-screen crashes

A render/lifecycle throw anywhere in the React tree previously blanked the whole
app. Added a modular `src/ui/ErrorBoundary.tsx`:

- **Top-level boundary** (in `main.tsx`) wraps the entire app with a themed
  recovery card (Try again / Reload / Reset layout & reload), collapsible
  technical details, and console diagnostics (no remote telemetry).
- **Scene-scoped boundary** wraps `<Scene>`/`<RoomEditorScene>` so a 3D/WebGL
  render crash keeps the toolbar and panels usable instead of taking the page down.
- The "Reset layout & reload" escape-hatch clears only the boot-restored
  `sofa-so-good:save:autosave` slot (named saves + appearance/onboarding prefs
  are preserved), so a corrupt autosave can't crash-loop the app.
- Supports a custom `fallback` renderer for embedding in other surfaces.
- Unit-tested (`ErrorBoundary.test.tsx`): renders children, catches throws,
  shows scope + details, custom fallback, reset callback.
