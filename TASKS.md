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
- [x] P1. Catalog drawer **virtualization** audit — verified the drawer paginates
  (12/page) over the merged list, so the DOM never holds more than a page of
  cards regardless of catalog size. No virtualization needed (see "More researched items").
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders.
  - [x] P2a. Always-mounted aux panels (Clearance, History) gated their heavy
    catalog-merge + door-swing / timeline work on `open`, so a closed panel no
    longer recomputes on every furniture drag. (CHANGELOG [P-aux])
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
- [x] Q7. **Empty states** verified comprehensive across all panels (Budget, Layers, Versions, SavedViews, RemoteBrowse, catalog favourites/recent). (audit)

## Realism
- [x] RE5. **Ceilings for custom plans** (`PlanRoomCeiling` — per-room
  downward-facing planes honouring the per-room height; culled in orbit, seen in
  walk). Completes N4b for custom plans. E2E-verified. (CHANGELOG)
- [x] RE1. **Window glass tints by time of day** (clear day → dark night, via
  fixtureGlow signal; safe material-only change). E2E day/night renders clean. (CHANGELOG)
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
- [~] T2. Crown molding revisit / ~~herringbone floor~~ / kitchen-bath templates
  polish. **Herringbone floor shipped** (T2a — oak + walnut procedural finishes,
  seamless 45° interlocking planks; CHANGELOG). Crown molding + templates remain.
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
- [x] Q28. **Catalog max-price filter** (beside Sort; CC0 free entries always
  pass; controls keyed to unfiltered category size). E2E-verified. (CHANGELOG)
  extends the Sort control; pairs with `furniturePrices.ts`.
- [x] Q29. **Focus catalog/layers search with `/`** — opens the drawer + focuses
  the search/filter input; in Help list. E2E-verified. (CHANGELOG)
  typing) — quick-find power-user shortcut.
- [x] Q30. **Undo/redo history panel** — labelled timeline (diff-derived labels,
  no per-caller threading), jump-to-step via `jumpHistory`, Undo/Redo/Clear;
  Tools menu + ⌘K + mobile (Pro-gated). 13 tests; desktop+mobile verified. (CHANGELOG)
- [ ] Q31. **Drag a material swatch onto a surface in 3D** to apply a finish
  (reuses `getSurfaceMaterial` / finish DLC); today it's picker-only.
- [x] Q32. **Saved-view thumbnails** — preview per camera bookmark (desktop +
  mobile); also fixed a missed mobile window.prompt. E2E-verified. (CHANGELOG)
  bookmark (mirror `slotThumbs`).
- [x] Q33. **Area/rectangle measure** mode (tape Distance/Area toggle, amber
  fill + W×D·area label). Unit + E2E-verified. (CHANGELOG)
  tape) — drag a rect, show area in the active unit.
- [x] A3. **Cycle 3D selection with `[`/`]`** (prev/next, wrapping; orbit, not
  typing/editor). In Help list. E2E-verified. (CHANGELOG)
  nudge) — extend the existing roving-grid pattern to the scene.
- [x] RE6. **Curtains** — verified a `Curtain` parametric primitive already
  exists (`primitives/Curtain.tsx`), so window treatments are already covered.
- [x] P5. Audited hot R3F paths — `FurnitureLayer` already uses memoised children
  + by-reference defs (P4 fixed the one real waste, the Layers room-shell memo);
  no further change justified without profiling on real hardware.
- [x] Q34. **Remember catalog category + sort** (per-device localStorage, safe
  fallback). E2E-verified. (CHANGELOG)

## Competitor research (2026-06-06, web)
Checked the app against current Planner 5D / Coohom / Homestyler feature sets.
Confirmed parity on: 2D⇄3D dual view, drag-and-drop, AI auto-furnish (Smart
Start ≈ Smart Wizard), photoreal export, precise room drawing, large unified
catalog, units, budget. Genuinely-larger gaps remaining (big future items, not
quick wins):
- [ ] K1. **Parametric kitchen/bath cabinet engine** — millimetre-customisable
  cabinets with smart countertop/toe-kick/cornice generation (Coohom parity).
  Large; would build on the parametric system + auto-arrange.
- [ ] R10. **Faster built-in PBR render path** — a one-click high-quality still
  (the AI photoreal is BYO-key; a local accumulation/denoise still would match
  Coohom's "render in seconds"). Investigate progressive path-trace via the
  existing showcase AccumulativeShadows + a higher-sample pass.
Sources: capterra.com/compare Planner-5D-vs-Coohom; coohom.com/article
best-online-room-planner-2026; saasworthy.com Planner-5D.

## Session 2 audit findings (2026-06-06, shipped + remaining)
Shipped this session (see CHANGELOG): per-room ceiling, custom-plan ceilings,
metric/imperial units everywhere, time-of-day glass tint + scrub slider, budget
target, catalog sort/max-price-filter/clear/remembered-state, Layers
filter/multi-select/per-room-hide/lock-all, context Hide, rename objects, area
measure, saved-view thumbnails, `/` search, `[`/`]` cycling, design notes,
report (cost-per-area + finishes-by-room + 2D plan SVG + notes), Share export
hub (PNG/PDF/file + honest app link), 8 reliability/bug fixes (stale-ids, all
native dialogs → themed modals/toasts, 2 lying-UI stubs, a regression + edge
guard), Help completeness, save/load/export feedback toasts, perf P4 + tested
catalog-browse extraction.
Remaining (larger / focused-session):
- [x] V1. **Version compare** — per-version Compare shows gained/lost item types vs current (pure diffVersionItems, unit-tested). E2E-verified. (CHANGELOG)
  types + budget delta vs current (the count-delta Q42 is the lightweight start).
- [ ] K1. Parametric kitchen/bath **cabinet-run engine** (Coohom parity).
- [ ] RE2/L1. Shadowed inter-room light bleed (conflicts with the deliberate
  no-shadow fixture-light perf design — needs a perf-aware approach).

## Session 2 (cont.) — shipped
- [x] N20. **Lighting mood presets** (Daylight/Golden hour/Cosy evening/Night) —
  bundle sun-time + fixture mode; Scene menu (desktop) + mobile accordion + ⌘K.
  Modular `lightingScenes.ts`, unit-tested, E2E-verified. (CHANGELOG)
- [x] Q43/Q43b. **Multi-select duplicate** (Ctrl+D + panel button), pure
  `planDuplicates` helper, unit-tested. (CHANGELOG)
- [x] B15–B17, B9–B11. Undo for plan edits; copy/paste flip preservation;
  onboarding consistency; all native dialogs → themed modals/toasts. (CHANGELOG)
- [x] V1, Q41, Q42. Version compare; 2D plan SVG in report; version count-delta.
- [x] Confirmed-existing (verified, not stubs): catalog price filter, sun-study
  "play day" time-lapse, multi-select delete/rotate/flip/nudge, Help shortcuts.

## Session 2 (cont. 2) — shipped substantial features
- [x] N20/N20b/N20c. **Lighting mood presets** (Scene menu + ⌘K + mobile) + time presets in ⌘K. (CHANGELOG)
- [x] B18. Persist `lightsMode` with the design; B19. autosave flush on pagehide. (CHANGELOG)
- [x] N21. **Persistent dimension annotations** — pin a tape measurement; render (AnnotationsOverlay, slate, line/rect) + per-pin × + Clear-pins bulk + persistence + drawn on the report's plan SVG + shown in room editor. Unit + E2E. (CHANGELOG)
- [x] Q46. **Saved camera views capture lighting** (shot = angle + ambiance). (CHANGELOG)
- [x] N22. **Walk-mode minimap** (plan outline + live player marker, rAF). (CHANGELOG)
- [x] Q43/Q43b. Multi-select duplicate (helper + button). Q44 budget spend-breakdown. Q45 Scene-in-walk.
- Lint backlog reduced (isFinite, implicit-any-let cleared); remaining are intentional idiom/test stubs.
- [x] B20. **Fixed duplicate walk-mode minimaps** — removed the redundant N22
  `WalkMinimap` (overlapped NavCluster's richer `Minimap`) and wired the
  always-designed-but-unused current-room highlight + name into the real
  `Minimap`, using the tested `roomPathD` helper for accurate L/polygon rooms.
  E2E-verified. (CHANGELOG)
- [x] N23. **Walk minimap shows doorways + windows** — `openingSegments` (pure,
  unit-tested) resolves wall openings; doors render as gaps, windows as accent
  ticks. E2E-verified. (CHANGELOG)
- [x] P6. **Minimap room-label legibility** — halo + stronger fill + centred. (CHANGELOG)
- [x] N24. **Material palette in the report** — `designPalette` (pure,
  unit-tested) → colour chips of distinct floor/wall finishes; verified by
  rendering the real report HTML. (CHANGELOG)
- [x] B21. **Report finishes-by-room follows the active plan** — was iterating
  the default ROOMS constant (broken for custom plans); now uses plan.rooms.
  Default output unchanged (verified); custom plans fixed. Unit-tested. (CHANGELOG)
- [x] N25. **Scale bar on the report floor plan** — `scaleBarChoice` (pure,
  unit-tested) picks a round metric/imperial length; drawn bottom-left. Verified
  by rendering the real report. (CHANGELOG)
- [x] B22. **Layers tree groups by the active plan** — was using default-apartment
  room shells (custom plans → all "Unassigned"); now `pointInRoom` over
  plan.rooms. Default unchanged (E2E-verified); custom plans fixed. (CHANGELOG)
- [x] B23. **Measurement overlay follows the active plan** — was iterating default
  ROOMS at default centroids; now plan.rooms + polygon/rect centroid + planRoomArea.
  Default unchanged (E2E-verified); custom plans fixed. (CHANGELOG)
- [x] B24. **Gate per-room editor to the default plan** — `enterRoomEditor` declines
  (toast) on custom plans + hid the View/mobile entries; default unchanged. (CHANGELOG)
- [x] RE6/big. **Per-room editor is now plan-aware** (RE6.1/.2/.3 shipped + E2E-verified). Old note: (roomShell from plan.rooms)
  so custom plans can isolate a room too. Larger follow-up.
- [x] N26. **Pinned dimensions in the 2D editor** + fixed drei `<Html>` overlay
  leaking over the editor (AnnotationsOverlay/MeasurementOverlay hide while
  editing). E2E-verified. (CHANGELOG)
- [x] Q48. **⌘K: Design report + Floor plan editor** added to the palette. (CHANGELOG)
- [x] B25. **Reject degenerate dimension annotations** — addAnnotation guards non-finite/zero spans. Unit-tested. (CHANGELOG)
- [x] Q49. **Selected-item name label in the 2D editor** — haloed name on the selected footprint; only the selection, so no clutter. E2E-verified. (CHANGELOG)
- [x] B26. **"Reset to HDB" undoable** — resetFloorPlan now pushes history first (was silent data loss of a custom plan). Unit-tested. (CHANGELOG)
- [x] B27. **Loading a saved plan undoable** — loadSavedPlan pushes history first. Unit-tested. (CHANGELOG)
- [x] B28. **Layout preset = single undo step** — applyLayoutPreset batches finishes into one set (was ~9 history entries via per-room setters). Unit-tested + E2E. (CHANGELOG)
- [x] B29. **Clear undo history on every design load** — version restore + desktop/mobile Load now clearHistory like import (no Ctrl+Z across designs). (CHANGELOG)
- [x] B30. **2D editor delete furniture + typing guard** — Delete removes a selected furniture item (parity with 3D); handler skips input/textarea/select focus so field edits arent hijacked. E2E-verified. (CHANGELOG)
- [x] P7. **DRY editor typing guards** — P + Delete handlers use shared isEditableTarget (was 3 inline copies; hardens P to include <select>). (CHANGELOG)

## RE6 — plan-aware per-room editor (in progress)
- [x] RE6.1. **Pure `planRoomShell` builder** + tests (footprint/clipped walls/openings; rect+L+polygon). (CHANGELOG)
- [x] RE6.2. **`PlanRoomShell.tsx` renderer** (DONE — floors/clipped walls/reveal/openings; placed openings in planRoomShell). (CHANGELOG)
- [ ] RE6.2-old. ~~renderer~~ — clipped plan walls (camera-facing reveal like RoomShell), per-room floor from `PlanRoom.floor` (reuse `PlanRoomFloor`), plan openings as wall cut-outs. Walls have no per-room wall-finish on custom plans — use a neutral/default wall material.
- [x] RE6.3. (DONE — E2E-verified custom + default; CHANGELOG)  ~~todo~~  **Wire `RoomEditorScene`** to use `planRoomShell`+`PlanRoomShell` when `!isDefaultPlan`; ungate the View/Mobile "Edit a room" entries + room-switcher dropdowns to iterate `plan.rooms` (filter external only on default). Walk collision from plan walls. E2E-verify on a custom plan.
- [x] Q50. **⌘K "Edit a room"** — enters the active plan's first room (default/custom). (CHANGELOG)
- [x] Q51. **"Edit in 3D" from the 2D room inspector** — jumps a selected plan room into the per-room editor (leverages RE6). E2E-verified. (CHANGELOG)
- [x] Q52. **Room name+size caption in the per-room editor** (works default + custom plans). E2E-verified. (CHANGELOG)
- [x] P8. **Room-editor caption mobile polish** — size-only on mobile (name is in the bar). Verified 390px. (CHANGELOG)
- [x] Q53. **Richer report header** — room count + total area in the subheader. Verified. (CHANGELOG)
- [x] Q53b. **Share "Copy summary" room count** — consistent with the report header. (CHANGELOG)
- [x] B31. **Plan-aware camera framing** (reset/top/room-exit frame the active plan) + fixed the RE6.3 camera-reset-on-plan-edit regression (plan read fresh in effects). E2E-verified. (CHANGELOG)
- [x] B32. **Walk spawn inside custom plans** — was the default flat coords (outside custom plans); now the largest room, looking across. E2E-verified. (CHANGELOG)
- [x] B33. **City backdrop centres on the active plan** (was default-flat-only). Default offset proven (0,0); custom verified. (CHANGELOG)
- [ ] B34/minor. **Lighting shadow frustum** is centred on the default apartment (`Lighting.tsx` CENTER) + fixed 9.5m half-extent — covers typical near-origin custom plans but a far-offset/oversized custom plan could miss sun shadows (Medium+ tiers only; default tier has none). Make CENTER+half-extent plan-aware; needs a real-GPU shadow-coverage check.

## User-requested revamp (2026-06-07)
- [x] VE1. **View/edit split** — orbit + walk are view-only; all selection/
  picking/editing/customization moved into the per-room editor; removed the
  select-vs-rotate `editorTool`; camera frozen only during drag/gizmo;
  Edit-a-room button + click-a-room-floor entry; toolbars (desktop + mobile)
  restructured into overview / editor / walk states; catalog gated to the editor;
  2D plan editor untouched. Desktop + mobile verified. (CHANGELOG)
- [x] VE1b. **Guard room editor against a stale/unknown room id** — getRoomEditorShell
  returns null instead of crashing on ROOMS[id].origin. Unit-tested. (CHANGELOG)
- [x] VE1c. **Room-floor hover affordance** in the overview — pointer cursor +
  soft highlight ("click to edit"), default-plan overview only. Verified. (CHANGELOG)
- [x] VE1d. **Prominent "Edit a room" accent CTA** in the overview toolbar. (CHANGELOG)
- [x] VE2. **Furniture count** in the room-editor caption (pointInRoom). (CHANGELOG)
- [x] VE3. **Click-to-edit + hover on custom plans** — PlanRoomFloor click-to-enter
  + generalized RoomHoverHighlight (roomPolygon, any plan). Verified default + custom. (CHANGELOG)
- [x] VE4. **Fix global keyboard shortcuts for the split** — Ctrl+A / `[` `]` / `/`
  now editor-only + room-scoped (roomScopedItemIds). Verified. (CHANGELOG)
- [x] VE5. **Close ⌘K placement bypass** — Add-furniture commands enter a room
  first; PlacementGhost gated on canEditScene (no placement in the overview). Verified. (CHANGELOG)

## User-requested features (2026-06-07)
- [x] N27. **Selectable 3D backdrops** (City/Park/Hills/Studio) — Scene menu + mobile, persisted. Replaces the "cluttered/boring" buildings-only backdrop. E2E-verified. (CHANGELOG)
- [x] N28. **Simple/Pro UI mode toggle** — Simple hides Tools menu + floor-plan editor; Appearance popover toggle, persisted; default Pro. E2E-verified. (CHANGELOG)
- [x] T4. **editorPrefs persistence test** — round-trip incl. backdrop+uiMode, invalid-value fallbacks, corrupt-blob guard. 4 tests. (CHANGELOG)
- [x] Q55. **Frame the design on load/restore/import** — requestHomeView (plan-aware) after each load path so the design lands centred (esp. custom plans). 860 tests. (CHANGELOG)
- [x] B35. **Dispose backdrop GPU objects on unmount** — useDisposeOnUnmount for City/Park/Hills/Studio geometries+materials(+City textures); no leak when switching backdrops. Verified. (CHANGELOG)
- [x] T5. **useDisposeOnUnmount test** — dispose-once-on-unmount / not-on-rerender / null-tolerant. Locks in B35. (CHANGELOG)
- [x] N28c. **Simple mode gates advanced options/fields** — Scene sun-direction, View saved-views+edit-room, File record, Inspector transform+duplicate-row, Graphics asset+overrides+FPS. E2E-verified. (CHANGELOG)
- [x] N29. **Collapsible inspector sections** — reusable InspectorSection (chevron header); Properties + Transform; collapsed by default in Simple, open in Pro. E2E-verified. (CHANGELOG)
- [x] N28d. **Floor-plan editor available in Simple** (crucial; reconciles N28c over-gating). (CHANGELOG)
- [x] N30. **Guided product tour** — 8-step spotlight walkthrough in build-workflow order; onboarding/Help/⌘K launch; aria-label targets + centred fallback; mobile-safe. E2E-verified. (CHANGELOG)
- [x] N30b. **Tour auto-starts on first visit** (gated hdb_tour_done; supersedes onboarding carousel) + replay from Help + ⌘K. E2E-verified. (CHANGELOG)
- [x] N30c. **Tour scrolls target into view** — scrollIntoView once per step (narrow-desktop toolbar scroll); no listener loop. Verified 980px. (CHANGELOG)
- [x] N30d. **Tour spotlights hamburger on mobile** — menu-step targets fall back to ☰ when hidden; no-target steps centre. Verified 390px. (CHANGELOG)
- [x] N28e. **Hide catalog Packs tab in Simple** — Catalog/Layers only; Pro keeps Packs. (uiMode hook above the early return.) E2E-verified. (CHANGELOG)
- [x] R6. **Enable useHookAtTopLevel lint rule** (error) — catches hook-after-return/conditional-hook bugs (the N28e class) at lint/pre-commit; codebase passes clean (593 files). (CHANGELOG)
- [x] R7. **Clear last useExhaustiveDependencies finding** — `useOverlayLifecycle` had an inert eslint-disable; replaced with the correct Biome directive. (CHANGELOG)
- [x] R8. **Remove noAssignInExpressions in catalog.ts** — extracted a `bucket()` helper for the category grouping. (CHANGELOG)
- [x] R9. **Clear final lint error** (noUselessSwitchCase in `applianceFinish`) — `biome check src/` now exits 0. (CHANGELOG)
- [x] R10. **Clear scripts/ lint errors + make CI lint blocking** — repo at 0 lint errors; CI Lint step flipped from continue-on-error to blocking so regressions can't reland. (CHANGELOG)
