# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (see CHANGELOG)

## Reliability / robustness
- [x] R1. React **ErrorBoundary** around app + scene. (CHANGELOG)
- [x] R2. **localStorage quota handling** — autosave failures now surface a deduped notification + auto-clear on recovery; prefs writers already guarded. (CHANGELOG)
- [x] R3. **"Auto-saved …" indicator** — lastSavedAt set on every successful save, shown in the Versions panel. (CHANGELOG)
- [x] R4. Guard against **non-finite transforms** on load (applySerialized filters NaN/Infinity). (CHANGELOG)

## Performance / scalability
- [ ] P1. Catalog drawer **virtualization** audit — ensure huge catalogs (thousands of IKEA/imported items) stay smooth (react-virtuoso already a dep).
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders.
- [ ] P3. More **instancing** for repeat-geometry primitives where profiling justifies.
- [x] P4. Layers panel hoisted per-room `roomShell` clip-geometry out of the
  `items`-keyed memo (was recomputed on every drag) to a module constant. (CHANGELOG)

## Bugs / correctness
- [x] B5. **CC0 texture-load failures isolated** — `SilentErrorBoundary` wraps
  every textured-finish loader (furniture materials, floors, walls) so a 404/CORS
  texture can't blank the scene. Unit-tested. (CHANGELOG)
- [x] B4. **GLB load failures isolated** — per-item `GltfErrorBoundary` renders a
  placeholder box instead of letting one bad model blank the whole app.
  Unit-tested. (CHANGELOG)
- [x] B3. **Marquee lasso overlap** — selects items whose footprint intersects
  the box, not only centre-in-box. Pure helper unit-tested. (CHANGELOG)
- [x] R5. Report `window.open` failed silently when pop-ups are blocked — now
  notifies the user (desktop + mobile). (CHANGELOG)
- [x] B1. Swept TODO/FIXME (all doc pointers, no bugs); fixed misleading "cannot be undone" reset confirms (resets are undoable). (CHANGELOG)
- [x] B2. Dispose audit — fixed leaked overlay geometries (SelectionOutline,
  HoverHighlight, AlignmentGuides, DragController snap, GridOverlay) + leaked
  EdgesGeometry source boxes via shared `scene/geometryUtil.ts`. (CHANGELOG)

## Bugs / correctness (cont.)
- [x] B6. Deleting a hidden item left a stale id in `hiddenItemIds` (Layers
  "(N hidden)" over-counted) — `deleteItem` now cleans it. Unit-tested. (CHANGELOG)
- [x] B7. Resets/presets (`resetToEmpty`/`resetToDefault`/`applyLayoutPreset`)
  didn't clear `hiddenItemIds` — now do. Unit-tested. (CHANGELOG)
- [x] B8. Loading/restoring a design left stale selection + hidden ids —
  `applySerialized` now resets both (covers restore/import/hydrate). Unit-tested. (CHANGELOG)

- [x] B9. Replaced blocking `window.alert` error dialogs (save/load failures,
  AI plan failure) with themed `notify` toasts. E2E-verified. (CHANGELOG)
- [x] B10. Replaced every `window.prompt` name-entry with an async `promptText`
  store action + themed focus-trapped `PromptModal` (save layout/version/view/
  style, scale calibration, AI key). E2E-verified. (CHANGELOG)
- [x] B11. Replaced `window.confirm` (reset-to-default / clear-all, desktop +
  mobile) with an async `confirmAction` + themed `ConfirmModal` (danger button,
  Cancel-default). Unit + E2E-verified. All native blocking dialogs now gone. (CHANGELOG)

## QOL / UX features (competitor parity: Planner5D, Coohom, Foyr, HomeByMe, IKEA Kreativ)
- [x] Q1. **Duplicate (Ctrl/Cmd+D)** — already fully wired (keyboard + context menu + inspector). No work needed.
- [x] Q2. **Recently used / recently placed** catalog row (clock chip, persisted). (CHANGELOG)
- [x] Q3. **Drag-and-drop placement** from catalog cards into the scene (desktop; reuses the ghost/validity pipeline; tap-to-place stays for touch). E2E-verified. (CHANGELOG)
- [x] Q4. **`?` opens Help & shortcuts** — wired the advertised-but-missing global binding. (CHANGELOG)
- [x] Q5. **Wall-length labels** on the 2D plan (+ Dims toggle). (CHANGELOG)
- [x] Q6. **Camera bookmarks / saved views** — save/apply (smooth fly)/delete, desktop View menu + mobile parity, persisted. (CHANGELOG)
- [ ] Q7. **Empty states & inline help** across panels.

## Realism
- [x] RE5. **Ceilings for custom plans** (`PlanRoomCeiling` — per-room
  downward-facing planes honouring the per-room height; culled in orbit, seen in
  walk). Completes N4b for custom plans. E2E-verified. (CHANGELOG)
- [ ] RE1. Window glass tint / curtains affecting light (TODO out-of-scope item).
- [ ] RE2. Inter-room light bleed through open doors (Phase 3 pending).
- [x] RE3. Basketweave parquet procedural floor (oak + walnut). (CHANGELOG)
- [x] RE4. Exposed-brick wall finishes (red/white-washed/charcoal). (CHANGELOG)

## Security
- [x] S1. BYO-key audit done (keys localStorage-only, not logged/in-schema) + Replicate poll-URL host guard against key exfiltration. (CHANGELOG)
- [x] S2. Verified: GLB upload validation enforces 25MB cap + glTF magic bytes + rejects external-URI glTF (SSRF) — covered by validate.test.ts. No change needed.
- [x] S3. Dev-gating audit — verified: `visiblePacks`/`activeProviderIds`/`PROD_PROVIDER_IDS` gate all licensed/non-CORS sources out of prod; already covered by registry.test.ts + integration.test.tsx. No leak.
- [x] S4. **`.sofa.json` import size cap** (50 MB, checked before reading) — DoS guard on design-file import. Unit-tested. (CHANGELOG)

## TODO.md clearable
- [ ] T1. Curated "furniture materials" one-tap finish shortlist (oak/walnut/teak/marble).
- [ ] T2. Crown molding revisit / herringbone floor / kitchen-bath templates polish.
- [ ] T3. Per-LOD multi-tier generation for uploads (deferred).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.

## File / portability
- [x] F1. Export/import a design as a `.sofa.json` file (Versions panel). (CHANGELOG)

## Bulk editing
- [x] Q8. "Apply style to all of this type" context-menu bulk restyle. (CHANGELOG)
- [x] C1. PWA manifest + theme-color + social/Apple meta tags. (CHANGELOG)

## Accessibility
- [x] A1. Modal dialog role + aria-modal + aria-label + focus-in/restore (shared primitive). (CHANGELOG)
- [x] A2. Modal focus trap (Tab/Shift+Tab cycle within the dialog). (CHANGELOG)
- [x] Q7. Empty states — verified BudgetPanel/LayersPanel/VersionsPanel already have them.

## Bulk editing (cont.)
- [x] Q9. Ctrl/⌘+A select-all. (CHANGELOG)

## More researched items
- [x] P1. Catalog scalability — verified: drawer paginates (12/page) over the
  merged list, so thousands of imported items never all render. No virtualization
  needed.
- [x] Q10. **Per-room cost breakdown** in the printable report (pure
  `reportData.furnitureCostByRoom`, unit-tested). (CHANGELOG)
- [x] Q11. **Flush-to-wall drag snapping** (`collision/wallSnap.ts`, corner-
  capable, grid-gated, door-aware). Unit-tested + E2E-verified. (CHANGELOG)
- [x] Q12. **"Straighten" context-menu action** — snap an off-axis piece to the
  nearest 90° (collision-checked, shown only when askew). (CHANGELOG)
- [x] Q13. **Point-to-point tape measure** (`scene/TapeMeasure.tsx`, Tools menu,
  desktop + mobile). Slice unit-tested + E2E-verified. (CHANGELOG)
- [x] Q14. **"Select all of this type"** context action (bulk-select same def,
  shown when >1 exists). E2E-verified. (CHANGELOG)
- [x] N4. **Adjustable ceiling height** — `floorPlan.ceilingHeight` (already
  persisted + honoured by custom plans) now drives the default-flat render path
  (WallSegment/Ceiling/RoomShell/MeasurementOverlay) too, with a clamped editor
  control. Bathrooms keep their dropped-ceiling override. (CHANGELOG)
  Follow-up: a per-room height control (UI) if desired — the data model already
  supports per-room `ceilingHeight`.

## Catalog UX
- [x] Q23. **Catalog sort** (Featured / Name / Size) for category browsing; pure
  `sortCards`, bypassed during fuzzy search. E2E-verified. (CHANGELOG)
- [x] Q24. **Layers panel name filter** (drops empty groups, force-expands while
  filtering, "N of M" footer). E2E-verified. (CHANGELOG)
- [x] Q26. **Per-room hide/show** eye toggle in Layers group headers
  (`setItemsHidden` bulk action). Unit + E2E-verified. (CHANGELOG)
- [x] Q27. **Ctrl/⌘-click multi-select** in the Layers panel (matches 3D scene).
  E2E-verified. (CHANGELOG)
- [x] Q25. **Rename objects** — custom per-item `label` (inspector Name field,
  shown in title + Layers tree + filter), persisted in schema. Unit + E2E. (CHANGELOG)

## Shopping / budget
- [x] Q22. **Budget target** with over/under progress indicator (Shopping panel,
  persisted per-device via `budgetPrefs`). E2E-verified. (CHANGELOG)

## Units / internationalization
- [x] U1. **Metric/imperial measurement units** toggle (Graphics panel, persisted)
  — centralized unit-aware formatters (`utils/measurement.ts`) routed through all
  read-only displays; plan-editor inputs stay metric. Unit-tested + E2E-verified.
  (CHANGELOG)

## Researched backlog (next iterations — competitor parity / polish)
- [x] N1. **Apply finish to all rooms** — setAll{Floor,Wall}Finish + FinishPicker buttons. (CHANGELOG)
- [x] N2. **Duplicate-in-array** — inspector "Duplicate a row of N", collision-checked, grouped. (CHANGELOG)
- [x] N3. **3D rotate handle/gizmo** — touch-friendly floor ring + knob,
  drag-to-rotate with 15° snap (Shift = free), live degree readout, collision
  tint + revert, raycast-priority pick. Pure math unit-tested. **Extended to
  multi-selection** (group rotate about centroid, signed delta readout). (CHANGELOG)
- [x] N4b. **Per-room ceiling height** UI (architectural realism) — PlanInspector
  room control + "Match home" reset; `Ceiling`/`MeasurementOverlay` read the live
  per-room override from `floorPlan.rooms` (dropped/false ceiling, walls stay
  full height). E2E-verified (Living/Dining → 4.00 m). (CHANGELOG)
- [x] N5. **Persist photo-trace backdrop** (blob + calibration) to IDB —
  survives editor close + reload, rehydrated on open, fail-soft, unit-tested.
  (Measurements are derived room-size labels — nothing user-created to persist.)
  (CHANGELOG)
- [ ] N6. **RE1/RE2** — window glass tint + inter-room light bleed (complex
  lighting; needs a focused session).
- [x] N7. **a11y beyond modals** — IconButton aria-labels verified; catalog cards
  keyboard-operable (N7a) + **roving arrow-key grid navigation** (N7b). (CHANGELOG)
- [x] N8. **Bundle code-splitting** — `FloorPlanEditor` is now `React.lazy` +
  conditionally mounted (separate ~31 kB chunk, ~30 kB off the initial entry).
  Build-verified. (CHANGELOG) Further AI-surface splitting possible if profiling
  warrants.
- [x] N9. Microcement/concrete accent wall finishes (light/grey/charcoal). (CHANGELOG)
- [x] N9b. Board-and-batten panelling wall finishes (white/sage/navy). (CHANGELOG)
  (procedural, prod-safe).
- [x] N10. Inspector "Reset" props to defaults (parametric items). (CHANGELOG)

## QOL (cont.)
- [x] Q15. **Per-item hide/show** in the Layers panel (eye toggle + Show all),
  visual + session-only via `selectionSlice.hiddenItemIds`. E2E-verified. (CHANGELOG)
- [x] Q16. **Export shopping list as CSV** (Budget panel) — pure RFC-4180 builder
  `shoppingCsv.ts`, unit-tested + E2E-verified. (CHANGELOG)
- [x] Q15b. **"Isolate" (hide others)** context action + Show-all restore
  (`selectionSlice.isolateItems`). E2E-verified. (CHANGELOG)
- [x] Q17. **Resizable imports** — GLB/IKEA inspector Scale shows real cm
  dimensions + widened 0.25–3× range. E2E-verified. (CHANGELOG)
- [x] Q18. **"Centre in room"** context action (collision-checked, plan-aware).
  E2E-verified. (CHANGELOG)
- [x] Q19. **Export 2D floor plan as PNG** (`exportPlanPng.ts`, CSS-var
  resolution + backdrop strip). Pipeline-verified. (CHANGELOG)
- [x] Q20. **Open pannable grid canvas** (plan centred + large grid margin) +
  **export cropped to plan bounds + padding**. E2E-verified. (user feedback)
- [x] Q21. **Floor-plan editor zoom** (± buttons + Ctrl/⌘-wheel around cursor,
  single PX multiplier). E2E-verified. (CHANGELOG)

## Next-iteration candidates (researched competitor-parity backlog, 2026-06-06)
Refilled after clearing the QOL/reliability backlog. Prioritised; each is its
own commit, dev-gate anything licensed.
- [ ] L1. **Lighting realism** (RE1/RE2) — window-glass tint colouring the sun
  shaft + inter-room light bleed through open doors. Complex multi-file scene
  change; do as a focused pass. (TODO.md "Time of Day Phase 3".)
- [ ] Q28. **Catalog price + size filters** (range chips) on the unified grid —
  extends the Sort control; pairs with `furniturePrices.ts`.
- [x] Q29. **Focus catalog/layers search with `/`** — opens the drawer + focuses
  the search/filter input; in Help list. E2E-verified. (CHANGELOG)
  typing) — quick-find power-user shortcut.
- [ ] Q30. **Undo/redo history panel** — list past steps with labels (the
  history slice already coalesces); jump-to-step.
- [ ] Q31. **Drag a material swatch onto a surface in 3D** to apply a finish
  (reuses `getSurfaceMaterial` / finish DLC); today it's picker-only.
- [ ] Q32. **Saved-view thumbnails** — render a small preview per camera
  bookmark (mirror `slotThumbs`).
- [ ] Q33. **Measurement: area/rectangle measure** mode (beyond point-to-point
  tape) — drag a rect, show area in the active unit.
- [ ] A3. **Full keyboard nav of the 3D selection** (Tab cycles items, arrows
  nudge) — extend the existing roving-grid pattern to the scene.
- [ ] RE6. **Curtains/blinds** as a mounted decor primitive over windows
  (procedural, prod-safe; do NOT over-index on assets per the goal).
- [ ] P5. **Memoization audit** of hot R3F components (FurnitureLayer item
  memo, selectors) — profile first; only change what profiling justifies.
