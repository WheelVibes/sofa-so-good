# src/ui/floorplan/editor — 2D plan-editor support modules

Helpers and sub-components factored out of the large `FloorPlanEditor.tsx` so it
stays a thin dispatcher. Several kinds of file live here:

- **Pure logic modules** (`floorPlanGeometry.ts`, `snapToWalls.ts`,
  `snapWallAngle.ts`, `planLabelDisplay.ts`, `planConstants.ts`,
  `toolDraftReducer.ts`, `backdropPlacement.ts`, `planFurnishPlacement.ts`, …): side-effect-free, **free of React / DOM / store /
  three**. Every function is **parameterised on its inputs** (walls / rooms /
  points / a `snap` fn passed in explicitly) — never read editor or component
  state, never call `useStore`. This is what makes each one unit-testable in
  isolation. `planFurnishPlacement.ts` (PLAN-FURNISH) is the pattern for a
  placement-adjacent module: it builds the synthetic ghost item — floor defs
  validated by `canPlace`; window-bound defs (Phase 3) via
  `buildPlanWindowGhostItem`, which snaps to the EDITED level's nearest window
  using the exact 3D pure pair (`furniture/placement/windowSnap.ts`
  `snapToNearestWindow` + `windowFixtureProps`), with snap-existence as its
  validity and a RAW (unsnapped) drop point so wall magnetism can't corrupt
  the room-side facing — and the commit decision (`'ineligible'` = window-bound
  with no window on the level, toast + disarm) — `FloorPlanEditor`'s
  `onDown`/`onMove` own the screen→world mapping (reusing the existing
  `pointerWorld`/`pointerPlanRaw`/`toPx`) and the store reads/writes, this
  module only decides what the ghost looks like and what a click should do
  with it.
- **`planPointerMapping.ts`** (REFAC-2) sits one level up from the pure modules:
  `createPlanPointerMapping()` composes `floorPlanGeometry`/`snapToWalls`/
  `snapWallAngle` into the screen→world coordinate pipeline (grid/guide snap,
  wall magnetism, wall-draw angle-then-wall-snap) the pointer dispatcher calls
  into. It reads the live SVG rect off a passed-in `svgRef`, so it is **not**
  pure and has no `*.test.ts` — it's plain code-motion out of the component,
  recreated fresh every render exactly like the inline closures it replaced.
- **Sub-components** (`GridLines.tsx`, `WallDimension.tsx`,
  `WallNumericEntry.tsx`, `PlanMenu.tsx`, `PlanEditorHeader.tsx`,
  `PlanToolsSheet.tsx`, `EditModeToggle.tsx`, `DrawToolPalette.tsx`,
  `WallTypeToggle.tsx`, `UndoRedoButtons.tsx`, `GridZoomControls.tsx`,
  `PlanTotalLabel.tsx`, `PlanViewMenuActions.tsx`, `PlanDefaultsFields.tsx`, …):
  presentational overlays/toolbar fragments driven by props from the editor.
  `PlanEditorHeader` carries a `.plan-header` class: a flat full-width bar on
  desktop, and on mobile a rounded floating pill (surface/border/shadow +
  `BrandDot` + `env(safe-area-inset-top)`) matching the room-editor `.toolbar.mobilebar`
  so both editing surfaces read as one app (styling in `parts.css` +
  `responsive.css`, not inline). The canvas HUD offsets (compass / scale bar /
  `LevelMenu`) add `env(safe-area-inset-bottom|left)` so they clear the iOS home
  indicator. `PlanEditorHeader`/`PlanToolsSheet` (REFAC-2) are layout **shells**: most of
  their props are already-built `ReactNode` fragments the editor assembles
  from its own state (`viewToggle`, `toolPalette`, `fileActionsMenu`, …), not
  raw store values, so they stay a handful of primitives + node props rather
  than a "God component" bundling the editor's whole state surface. The "Plan
  ▾" menu's file/reference-photo actions (`fileActions`, ~230 lines of
  independent feature-flagged pieces) are deliberately **kept inline** in
  `FloorPlanEditor.tsx` rather than extracted the same way — bundling them
  needs a 40+ prop surface that a prior audit judged would hurt readability
  more than the current named-fragment const (see TASKS.md MOD-FPE-SPLIT
  history); don't re-attempt that specific extraction without solving the
  prop-surface problem first. The per-storey **SVG render layers** live under
  `layers/` (`WallsLayer`, `RoomsLayer`, `OpeningsLayer`, `DimensionsLayer`,
  `NotesLayer`, `PolylinesLayer`, `TourStopsLayer`, `FurnitureLayer`,
  `FurnitureRotateHandle`, `WallHandlesLayer`, `DraftOverlayLayer`,
  `PlacementGhostLayer`, `PlanGuidesLayer`, `OtherLevelsUnderlay`,
  `PersistentDimensionsLayer`, `AnnotationsLayer`): each is one
  cohesive slice of the plan `<svg>`, prop-driven, taking editor state + the
  drag/selection handlers as props (the editor stays the dispatcher). Add a new
  layer here rather than growing the render block in `FloorPlanEditor.tsx`.
  `PlacementGhostLayer` (PLAN-FURNISH) is mounted **last** (topmost, after
  `DraftOverlayLayer`) so the armed-def preview is never obscured; it's
  `pointer-events: none` throughout since the plan `<svg>`'s own
  `onPointerDown`/`onPointerMove` (not the layer) own the click that commits it.
- **Custom hooks** (`usePlanBackdrop.ts`, …): a cohesive, self-contained slice of
  editor **state + effects** (not core drawing/interaction state) lifted into a
  `use*` hook so the component shrinks. The editor still reads the returned
  state/handlers. Behaviour-preserving code-motion; gets its own `*.test.tsx`.

## Rules
- **Keep the editor thin.** When `FloorPlanEditor.tsx` grows new tool/pointer
  math, extract the *decision* (commit thresholds, transitions, geometry) into a
  pure module here and leave the component as the dispatcher that owns React
  state + store writes. Don't grow the monolith (CLAUDE.md "no monolithic files").
- **Pure means pure.** No store reads, no DOM, no three — take the data as
  arguments and return a plain description of what to do. A `snap`/projection fn
  the caller owns is passed in, not imported from a store.
- **Every pure module gets a `*.test.ts`** next to it covering its transitions +
  edge cases (degenerate input, threshold boundaries, clamps).
- **Behaviour-preserving extractions** (e.g. MOD-FPE-SPLIT's
  `toolDraftReducer.ts`) must not change a single user-visible gesture/output —
  prove it by keeping the existing editor unit tests + `scripts/scenarios/plan-*`
  green.
- General `src/ui` overlay rules (tokens / responsive / a11y) still apply — see
  `src/ui/CLAUDE.md`.
