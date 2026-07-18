# G1 — First-class MEP layer: implementation plan (2026-07-18)

> Design for TODO G1 (contractor-handover goal): persisted, editable electrical/plumbing
> points replacing the export-time furniture heuristic. Companion research:
> `2026-07-18-contractor-handover-research.md`. Steps are PR-sized, each independently green.

## Design decisions (with codebase precedent)

1. **Model — top-level, level-tagged FloorPlan arrays.** `electricalPoints?` /
   `plumbingPoints?` as optional arrays on `FloorPlan`, `levelId?` (absent = ground) — the
   `notes`/`dimensions`/`polylines` annotation-class precedent, NOT per-`PlanUpperLevel`.
   **Free XZ, not wall-anchored** (a `{wallId, offset}` binding would need re-homing on
   splitWall/removeWall/filletCorner like openings do); wall attachment is a **placement-time
   snap** (nearest wall face within ~0.25 m via `editor/floorPlanGeometry.ts`). Persistent
   anchoring = follow-up. **Kind enums reused verbatim** (`ElectricalKind` 7 kinds,
   `PlumbingKind` 5) — MOVED into `floorplan/types.ts` and type-only re-exported from
   `electricalPlan.ts`/`plumbingPlan.ts` to avoid an import cycle.
2. **Point shape**: `{ id, x, z, kind, mountHeightMm?, label?, levelId? }` per family.
   `mountHeightMm` = AFFL; per-kind defaults in new pure `src/floorplan/mepPoints.ts`
   (`ELECTRICAL_MOUNT_DEFAULTS_MM`: socket 300, switch 1200, tv 400, aircon 2400, heater 1800;
   `PLUMBING_MOUNT_DEFAULTS_MM`: water-point 600, floor-trap/soil-pipe 0) + `isDuplicateMepPoint`
   (same kind + storey within 0.3 m — dedupe for Suggest). IDs via `planId('ep')`/`planId('pp')`.
3. **Editor UX**: ONE new `Tool` `'mep'` + editor-local `mepKind` (default `'socket'`); a 4th
   `DrawToolPalette` `PlanMenu` group "MEP" (12 kinds under Electrical/Plumbing sub-headers);
   place on `onDown` (grid+guide snapped, then wall-face snap via new pure
   `editor/mepPlacement.ts`), tool stays armed like door/window. Drag via `layers/MepLayer.tsx`
   (a `NotesLayer` clone; `beginElementDrag` + coalesced update). Delete-key + inspector
   `DeleteBtn`. `PlanSelection` += `{ type:'mep', family:'electrical'|'plumbing', id }`.
   Inspector case: within-family kind Select, mount-height `Num` (step 50, placeholder =
   default) + preset chips (300/1050/1200/2400), label input. `showMep` session toggle in
   `PlanViewMenuActions`. Mobile parity per `PlanToolsSheet` 44px rules.
4. **Suggest points**: move `deriveElectricalPoints`/`derivePlumbingPoints` from
   `openDrawingSet.ts` into pure tested `src/furniture/mepSuggest.ts` (furniture types can't be
   imported by `src/floorplan` — precedent `furnishPlan.ts`); `openDrawingSet` keeps importing
   for the fallback (zero behaviour change). Store action
   `floorPlanSlice.suggestMepPoints()` → derive, drop `isDuplicateMepPoint` hits, assign
   ids+default heights, ONE `pushHistory`, `forkIfDefault`; Plan ▾ menu entry + toast
   ("Added N electrical + M plumbing — drag to refine"). No auto-migration for old designs.
5. **Rendering**: editor symbols share the sheet `SYM_TEXT` maps (export as
   `ELEC_SYM_TEXT`/`PLUMB_SYM_TEXT` — one symbol vocabulary). Sheets prefer persisted points
   when non-empty per family, else heuristic; provenance note "Points as designed — heights
   AFFL" vs "Indicative — derived from furniture layout; verify on site". `@1200` mm suffix
   beside symbol labels + "Heights in mm AFFL" legend line.
6. **Flag**: new `mepEditor` (pro, default true) gates tool/layer/inspector/Suggest; the
   existing `electricalPlan`/`plumbingPlan` flags keep gating the SHEETS.
7. **Persistence**: zod arrays on `FloorPlanZ` (optional+additive, no version bump — schema
   precedent comments). Autosave/history/share-links free (plan already watched) PROVIDED
   every action replaces the plan object AND calls `forkIfDefault` — `serialize()` drops the
   plan when `isDefaultPlan`, so a non-forking add (like today's `addNote` quirk — don't copy)
   silently loses points.

## Ordered steps

- **PR 1 — model+persistence (pure)**: types.ts (kind unions moved + 2 interfaces + 2 fields),
  electricalPlan/plumbingPlan re-exports, mepPoints.ts(+test), schema.ts zod, round-trip +
  back-compat + enum-reject + dedupe tests.
- **PR 2 — flag + store actions**: `mepEditor` flag; PlanSelection member; add/update/remove
  ×2 families (coalesced updates, remove clears selection, forkIfDefault tested, one undo step).
- **PR 3 — editor**: Tool `'mep'`, mepPlacement.ts(+snap tests), DrawToolPalette group,
  MepLayer.tsx, FloorPlanEditor branches (~60 lines, decisions stay in pure modules),
  PlanInspector case, showMep toggle, SYM_TEXT exports, mobile. Scenario `plan-mep.json`.
- **PR 4 — Suggest**: mepSuggest.ts move(+tests: desk→double-socket+data, door→switch,
  WC→soil+water, level tagging, dedupe rerun=0, one-undo), suggestMepPoints action, menu entry
  + toast. Scenario `plan-mep-suggest.json`.
- **PR 5 — sheets**: carry `mountHeightMm` through build loops, `@mm` suffix + AFFL legend,
  persisted-preferred routing, `mepSource` provenance param (bundle as `{points, source}`
  objects — `buildDrawingSetHtml` already has 12 positional params), per-source note tests.
  Scenario asserting "as designed" + `@1200` in captured HTML.

**Follow-ups**: G6b DXF ELECTRICAL/PLUMBING layers (unblocked after PR 5), circuits/loads,
persistent wall anchoring, counter-relative heights, 3D visualization, RCP integration.

## Risks

1. Default-plan fork (risk #1): every MEP action must `forkIfDefault` or points vanish from
   share links on the untouched default plan.
2. FloorPlanEditor.tsx bloat (2835 lines) — keep additions to dispatcher branches.
3. Kind-union relocation — type-only re-exports, verify with existing plan-module tests.
4. Heuristic drift — one derivation source (`mepSuggest.ts`) for both fallback and Suggest.
5. `water-heater` exists in BOTH kind unions — `family` discriminant keeps it unambiguous;
   inspector Select stays within-family.
