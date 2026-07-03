# src/ui/floorplan/editor — 2D plan-editor support modules

Helpers and sub-components factored out of the large `FloorPlanEditor.tsx` so it
stays a thin dispatcher. Two kinds of file live here:

- **Pure logic modules** (`floorPlanGeometry.ts`, `snapToWalls.ts`,
  `snapWallAngle.ts`, `planLabelDisplay.ts`, `planConstants.ts`,
  `toolDraftReducer.ts`, `backdropPlacement.ts`, `planFurnishPlacement.ts`, …): side-effect-free, **free of React / DOM / store /
  three**. Every function is **parameterised on its inputs** (walls / rooms /
  points / a `snap` fn passed in explicitly) — never read editor or component
  state, never call `useStore`. This is what makes each one unit-testable in
  isolation. `planFurnishPlacement.ts` (PLAN-FURNISH) is the pattern for a
  placement-adjacent module: it builds the synthetic ghost item, decides
  `canPlace` validity (excluding window-bound defs from Phase 1) and the
  commit decision — `FloorPlanEditor`'s `onDown`/`onMove` own the screen→world
  mapping (reusing the existing `pointerWorld`/`toPx`) and the store
  reads/writes, this module only decides what the ghost looks like and what a
  click should do with it.
- **Sub-components** (`GridLines.tsx`, `WallDimension.tsx`,
  `WallNumericEntry.tsx`, `PlanMenu.tsx`, …): presentational overlays driven by
  props from the editor. The per-storey **SVG render layers** live under
  `layers/` (`WallsLayer`, `RoomsLayer`, `OpeningsLayer`, `DimensionsLayer`,
  `NotesLayer`, `PolylinesLayer`, `TourStopsLayer`, `FurnitureLayer`,
  `FurnitureRotateHandle`, `WallHandlesLayer`, `DraftOverlayLayer`,
  `PlacementGhostLayer`): each is one
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
