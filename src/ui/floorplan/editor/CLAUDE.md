# src/ui/floorplan/editor — 2D plan-editor support modules

Helpers and sub-components factored out of the large `FloorPlanEditor.tsx` so it
stays a thin dispatcher. Two kinds of file live here:

- **Pure logic modules** (`floorPlanGeometry.ts`, `snapToWalls.ts`,
  `snapWallAngle.ts`, `planLabelDisplay.ts`, `planConstants.ts`,
  `toolDraftReducer.ts`, …): side-effect-free, **free of React / DOM / store /
  three**. Every function is **parameterised on its inputs** (walls / rooms /
  points / a `snap` fn passed in explicitly) — never read editor or component
  state, never call `useStore`. This is what makes each one unit-testable in
  isolation.
- **Sub-components** (`GridLines.tsx`, `WallDimension.tsx`,
  `WallNumericEntry.tsx`, `PlanMenu.tsx`, …): presentational overlays driven by
  props from the editor.

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
