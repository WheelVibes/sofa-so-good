# Ghost stencil (trace backdrop) — design

**Request:** let users upload a floor-plan image as a translucent "ghost stencil"
overlaid on the 2D floor-plan editor canvas so they can trace walls over it; scale
is calibrated by specifying the true length of a reference segment; opacity is
customizable; the stencil loads centered on the canvas.

## What already exists

The feature largely ships today as the **trace backdrop** ("Reference photo…" in
the plan editor's Plan menu):

- **Upload**: file picker + drag-drop onto the canvas
  (`FloorPlanEditor.tsx` `fileActions` block + canvas `onDrop`).
- **Translucent underlay**: an SVG `<image>` rendered first (bottom of the
  z-order, behind the grid), `pointer-events: none`, `opacity` from state
  (`FloorPlanEditor.tsx:2286`).
- **Scale calibration**: the `scale` tool — drag a line over a known dimension,
  type its real length in metres; `backdrop.mPerPx` rescales
  (`FloorPlanEditor.tsx:1229`, threshold in `toolDraftReducer.scaleCommits`).
- **Opacity**: a raw `<input type=range>` in the toolbar (0–1, step 0.05).
- **Persistence**: blob + `{w,h,opacity,mPerPx,ox,oz}` meta in IndexedDB
  (`backdropPersist.ts`), rehydrated on editor open, calibration writes
  debounced 400 ms (`usePlanBackdrop.ts`). Deliberately outside
  `FloorPlan`/undo history and the save schema.
- **Export hygiene**: `exportPlanPng.ts` strips the backdrop from exports.

## Gaps (the actual work)

1. **Not centered.** `loadBackdrop` seeds `ox/oz = 0` and `mPerPx = 0.01`, so the
   image's top-left pins to world origin at an arbitrary size — typically far
   off-view and tiny/huge relative to the plan.
2. **Calibration shifts the image.** Rescaling `mPerPx` scales the image about
   its top-left corner, so the very wall the user just measured slides away from
   where they drew the reference line.
3. **No re-center affordance** after panning/calibrating moves the image.
4. **No upload guardrails.** Non-image files are silently ignored; there is no
   size cap (the sibling `walkBackdrop.ts` caps at 25 MB) — a 100 MB scan goes
   straight into IndexedDB.
5. **Ships ungated**, violating the "every feature behind a feature flag" hard
   rule (only its `aiWalls` sub-button is gated).
6. **Raw range input** for opacity, contra the `SliderField` UI rule (no label,
   no readout).

## Design decisions

- **Placement on load** (new pure module `editor/backdropPlacement.ts`):
  uniform-fit the image inside the plan bounds at 90% of the tighter axis
  (`mPerPx = min(ew/imgW, ed/imgH) * 0.9`) and centre it on the plan centre
  `[ew/2, ed/2]`. The canvas grid margin is symmetric (`GRID_MARGIN` both
  sides), so plan-centre == canvas-centre. Fit-to-plan replaces the arbitrary
  `0.01` default so the stencil is immediately visible and roughly plan-sized
  before calibration.
- **Anchored recalibration**: when the scale tool commits, rescale about the
  **midpoint of the drawn reference segment** — the image feature the user just
  measured stays under their line (`rescaleBackdropAnchored`). The experimental
  `aiWalls` path is out of scope and unchanged.
- **Re-center button** in the backdrop toolbar segment: re-centres at the
  current scale (`centerBackdrop`), for after calibration/pan drift.
- **Guardrails**: reject non-images and files > 25 MB
  (`MAX_PLAN_BACKDROP_BYTES`, mirroring `walkBackdrop.ts`) with an error toast
  (`notify.start({ kind: 'error', … })`) instead of a silent no-op.
- **Feature flag `planTraceBackdrop`** (label "Plan trace image", `tier: 'pro'`,
  `default: true`): gates the Reference photo button, the backdrop control
  segment, the canvas drop handler, and the `<image>` render. Pro tier — plan
  authoring is beyond the Simple core loop, consistent with `planScale` /
  `planPolyline`. Unit-tested in both Simple and Pro modes.
- **Opacity slider → `SliderField`** with a percent readout ("Trace opacity",
  0.05–1 so it can't vanish entirely, `format: v => %`).
- **Persistence model unchanged**: session React state + IDB blob store, outside
  undo history and the save schema — calibration must not pollute plan undo.
- **Naming**: codebase keeps the "trace backdrop" term; user-facing copy keeps
  "Reference photo…" (docs already use it).

## Out of scope

- Rotating/free-transforming the stencil image.
- Dragging the image to reposition (re-center + calibration anchor cover the
  need; a move gesture would fight the drawing tools for pointer events).
- Multi-storey per-level backdrops (single backdrop today; unchanged).
- `aiWalls` recognition changes.

Implementation plan: `docs/superpowers/plans/2026-07-03-floorplan-ghost-stencil.md`.
