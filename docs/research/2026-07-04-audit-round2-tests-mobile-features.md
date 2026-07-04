# Audit round 2 — test coverage, mobile/touch robustness, fresh features (2026-07-04)

Second-pass backlog refill, focused on the three axes the first deep audit
(`2026-07-04-deep-audit-and-opportunities.md`) under-covered. Every item is
**pure-client-doable** in this frontend repo and **verified absent** from `CHANGELOG.md`,
`TODO.md`, `TASKS.md`, and the first audit doc (shipped/tracked work is called out, not
re-logged). Each finding is grounded in a real `path:function` citation or a real competitor
capability. Ranked by value ÷ effort within each axis.

Scope note: the app is exceptionally mature — **607 test files / 984 source files**, **140
feature flags**. The first audit's BUG-1..7, SEC-1, PERF-A/B/C/D, REAL-1, FEAT-1 are shipped
or in-flight and their fixes each carry a regression test (BUG-3 `baselinePlan`, BUG-5
`groupId`, BUG-6 `moveLevel`, BUG-2 `preserveUnresolvedItems` all verified tested). So the
gaps below are the genuinely-remaining few, not broad-and-shallow filler.

---

## Top 5 by value ÷ effort (across all axes)

1. **MOBILE-1** — Rotate/Resize/Tilt gizmos have **no `pointerId` gating** (the exact BUG-1
   multi-touch class the scene `CLAUDE.md` says they *must* follow). Confirmed bug, core-loop, S–M.
2. **TEST-1** — `state/storage/hydrateAssets.ts` (196 lines, **0 tests**): boot-time restore of
   every user-uploaded model + material from IDB. Silent-data-loss surface, cheap with
   `fake-indexeddb`. S–M.
3. **TEST-2** — `apartment/floor/floorRects.ts` `computeRoomFloorRects`/`rectMinus` (**0 tests**):
   pure rectangle-subtraction that decides which room's finish paints each floor region of the
   **default move-in 4-room HDB**. S.
4. **FEAT-A** — Frame / zoom-to-selection camera (the universal "F" of 3D tools) — genuinely absent
   (`resetView`=H resets to overview, but nothing fits the *selection*). S.
5. **FEAT-B** — Alt/Option-drag to duplicate a placed item (SketchUp/Figma/Coohom staple) — absent
   (`altKey` is only read for group-select, never drag-clone). M.

---

## Axis 1 — Test-coverage gaps (highest priority)

Ranked; each cites the file, what's untested, and the concrete test to add.

### TEST-1 — `state/storage/hydrateAssets.ts` has zero tests · S–M · value: HIGH
**What's untested.** The entire boot-time rehydration of user assets (`hydrateUserAssets`,
`resolveIkeaRuntimeUrls`). It runs on **every app boot before first catalog paint** and reconstructs
`UserGltfDef`s + `TexturedMaterialDef`s from raw IDB records with dense branching, none exercised:
- record-kind routing / skips: `meta.source==='pack'`, `meta.role==='lod'`, `meta.role==='ikea-image'`
  are each `continue`d (`:87,:91,:142`) — a regression here would surface pack/LOD/thumbnail blobs as
  phantom "user uploads".
- footprint validation fallback (`:103-110`): a stored footprint with a non-finite/≤0 dim must fall
  back to `1×1×1`, else collision is wrong before the GLB loads.
- material-channel grouping (`:139-153,:157-194`): textures are grouped by `matId`; a material with
  **no albedo channel is dropped** (`:158`), identity fields (name/category/swatch/uvScale) are read
  back from the **albedo channel's meta with back-compat defaults** (BUG-003 path) — legacy records
  that predate those fields must still load.
- LOD sibling re-registration (`:133-138`) and `safeParse` resilience to a corrupt meta string
  (`:15-22`) — a corrupt entry must not abort hydration of the rest.
**Concrete test.** New `hydrateAssets.test.ts` using `fake-indexeddb` (already a dep — pattern in
`catalog/remote/cache/db.test.ts`): seed `IdbAssetStore` with mixed records and assert
`useStore.getState().userFurniture`/`userMaterials` after `hydrateUserAssets()`. Cases: pack/lod/
ikea-image skipped; invalid stored footprint → `1×1×1`; channels missing albedo → material dropped;
legacy meta (no name/swatch) → defaults; corrupt meta string → surrounding assets still load.
**Why cheap+valuable.** Pure store side-effect, no R3F, `fake-indexeddb` already available; a silent
regression here loses/mis-restores the user's own uploads on reload.

### TEST-2 — `apartment/floor/floorRects.ts` `computeRoomFloorRects` / `rectMinus` untested · S · value: HIGH
**What's untested.** A fully pure, deterministic geometry module (reads only the `ROOMS` constant) that
computes the non-overlapping floor rectangles each room renders in the fixed apartment — i.e. it
decides **which room's finish paints every square metre of the default 4-room HDB floor** (the move-in
default the whole app opens on). `rectMinus` (`:34-47`) is edge-case-heavy (rectangle subtraction into
up to 4 sub-rects, `1e-6` epsilon, `[a]` on no-overlap); `computeRoomFloorRects` (`:55-84`) resolves
overlaps by smaller-area-wins with a ROOMS-order tiebreak.
**Concrete test.** New `floorRects.test.ts` (zero-dep unit): `rectMinus` returns `[a]` on disjoint,
≤4 sub-rects on partial overlap, `[]` on full cover; each room's returned pieces are pairwise
non-overlapping and never intrude on a strictly-smaller-area room's rect; sum of all pieces' areas ≤
the union of raw room rects (no double-paint); equal-area rooms break ties by ROOMS key order. A bug
here = z-fighting / a bedroom's finish bleeding across the corridor on the default plan.

### TEST-3 — `state/storage/IdbAssetStore.ts` untested · S · value: MED-HIGH
**What's untested.** The foundation of **all** user-asset persistence — `put`/`get`/`list`/`delete`/
`usage` (`:77-105`, 107 lines, 0 tests). Every upload, LOD, material channel, and IKEA blob flows
through it, yet the round-trip contract is unverified.
**Concrete test.** New `IdbAssetStore.test.ts` with `fake-indexeddb`: `put`→`get` round-trips the blob
+ meta; `get` of a missing id → `null`; `list` returns `AssetMeta[]` **without** the blob payload;
`delete` removes only the target; `usage` sums byte sizes + counts. Underpins TEST-1's reliability.

### TEST-4 — No `HistorySnapshot`-completeness guard test (BUG-3 class prevention) · S–M · value: MED-HIGH
**What's untested.** `src/state/CLAUDE.md` explicitly records that — unlike `autosave.test.ts`'s
derived guard that fails if `serialize()` emits a key not in the watch-list — **there is no analogous
guard for `historySlice.ts:snapshot()`**. BUG-3 (`baselinePlan`) and its noted siblings
(`masterPalette`/`roomPalettes`) were exactly "a field changed under a `pushHistory()` but omitted from
the snapshot", and each got a *point* test, but nothing structurally prevents the next such omission.
**Concrete test.** Add to `historySlice.test.ts`: assert `snapshot()` captures the full set of
history-relevant top-level store keys (an explicit allow-list mirroring `HistorySnapshot`), and a
round-trip test — mutate each snapshotted field, `undo()`, assert it reverts — so adding a field to
`HistorySnapshot` without wiring `snapshot()`/`snapshotMatchesState()` fails loudly. Not a perfect
derived guard (push sites don't name fields), but converts a hand-audit rule into a failing test.

### TEST-5 — `state/slices/remoteCatalogSlice.ts` orchestration untested · S–M · value: MED
**What's untested.** 184 lines, **0 tests referencing it**. The underlying cache (`cache/db`,
`cache/lru`, `resolver`, `providers`) is well-tested, but the slice's own orchestration edge cases are
not: the **7-day `STALE_AFTER` re-fetch decision** (`:94-96`), the **in-flight promise de-dupe**
(`inFlight` map, `:61,:138-139,:169-172` — concurrent `resolveRemoteAsset` for the same key must share
one promise), the already-resolved short-circuit (`:135`), and the `error` status transitions
(`:123-130,:165-167`).
**Concrete test.** New `remoteCatalogSlice.test.ts` with stubbed `PROVIDERS`/cache: two concurrent
`resolveRemoteAsset` calls invoke `fetchAsset` once; a cached index newer than `STALE_AFTER` skips
`refreshProviderIndex`; a throwing `fetchIndex`/`fetchAsset` lands `status:'error'` / `remoteFetches`
error without unhandled rejection. (Lower reach — remote furniture surfaces nothing in prod today —
hence MED not HIGH.)

### TEST-6 — Gizmo multi-touch gating tests (pairs with MOBILE-1) · S once fixed · value: HIGH
**What's untested.** The gizmo *math* is well-covered (`rotateGizmoMath`/`resizeGizmoMath`/
`tiltGizmoMath` tests), but there is **no test for the pointer-stream gating** because it isn't
implemented (see MOBILE-1). When MOBILE-1 lands, mirror `dragHelpers.test.ts`'s
`isActiveDragPointer` describe block for each gizmo's grab→move→up path (a foreign `pointerId` is a
no-op; only the initiating pointer commits/reverts).

### TEST-7 — `DragController.tsx` has no integration test for the BUG-1 wiring · M · value: MED
**What's untested.** The pure helpers (`dragHelpers.ts:isActiveDragPointer`/`snapAxis`,
`collision/equalSpacing`) are tested, but the **component that wires them** has no test
(`DragController.test` does not exist). Untested orchestration: the `isActiveDragPointer` gate on the
window `pointermove`/`pointerup`/`pointercancel` listeners (`:564`), the invalid-release revert, and
`setDragGuides` publishing the alignment/equal-spacing guides (`:250`). Effort M (needs a store +
stubbed camera/`project`), hence ranked below the pure-logic wins — but this is the mobile core-loop
gesture and its regression cost is high.

### TEST-8 — `ui/paletteFromPhoto.ts` nearest-finish mapping untested · M · value: MED-LOW
**What's untested.** `analysis/imagePalette.ts` (`extractPalette`/`nearestColor`) is tested, but
`paletteFromPhoto.ts`'s `finishCandidates()` (builds the floor+wall candidate set from
`BUILTIN_MATERIALS_BY_CATEGORY` with `hexToRgb` swatches) and the extracted-palette → nearest-builtin-
finish mapping are not. Extract the pure `finishCandidates`/nearest-match glue from the canvas-bound
`imageToPixels` and unit-test it (canvas decode stays out of scope). Lower value — a mis-map degrades a
suggestion, not correctness.

---

## Axis 2 — Mobile / touch robustness

### MOBILE-1 — Rotate/Resize/Tilt gizmos lack `pointerId` gating → multi-touch hijack (CONFIRMED BUG) · S–M · risk: high
**Confirmed against source.** `src/scene/CLAUDE.md` states verbatim: *"Any new in-canvas drag/gizmo
gesture that adds its own window-level pointermove/up listeners (see RotateGizmo/ResizeGizmo) should
follow the same [BUG-1 `pointerId`] pattern."* None of the three do:
- `RotateGizmo.tsx` `onGrab` (`:284-311`) never records `e.nativeEvent.pointerId`; window `onMove`
  (`:198`) / `onUp` (`:222`) filter on nothing (`:269-271`).
- `ResizeGizmo.tsx` `onGrab` (`:242-260`), `onMove` (`:123`), `onUp` (`:181`) — same, no pointerId
  (`:219-221`).
- `TiltGizmo.tsx` `onGrab` (`:146-161`) records `startX/startY` but **not** `pointerId`; `onMove`
  (`:87`)/`onUp` (`:100`) ungated (`:122-124`).

**Failure scenario.** On a phone: select an item, press-drag the rotate ring (or a resize corner /
tilt ball) with one finger, then rest/move a second finger (the instinctive pinch). `setRotatingGizmo(true)`
disables OrbitControls (`OrbitCamera.tsx:99` `controlsEnabled = !draggingItemId && !rotatingGizmo &&
!placingActive`), so there's **no pinch-zoom fight — but the second finger's independent `pointermove`
still reaches the ungated window listener** and drives `project()`+`apply()`, so the selection snaps to
/ oscillates toward the second finger. The **first `pointerup` from *either* finger** ends the gesture
and commits the (wrong) transform via `setPendingEdit`. Identical UX to the pre-fix furniture-drag bug,
on the arrange step users hit most on touch.
**Fix.** Mirror BUG-1 exactly: capture `e.nativeEvent.pointerId` into each gesture object in `onGrab`;
in `onMove`/`onUp` early-return unless `isActiveDragPointer(gesture.pointerId, ev.pointerId)`
(reuse `scene/dragHelpers.ts`). Add the tests in TEST-6. One shared change across the three files.

### MOBILE-2 — `MarqueeSelector` window `onMove` is ungated across pointers · S · risk: med-low
**Where.** `scene/selection/MarqueeSelector.tsx` — `onDown` (`:67`) records no `pointerId`; window
`onMove` (`:75,:167`) and `onUp` (`:96`) act on any pointer stream.
**Failure scenario.** Two-finger touch in select mode (orbit is *enabled* here — marquee coexists with
orbit until a `>4px` drag arms the rect): a second finger's `pointermove` retargets the marquee's `x1/y1`
to the wrong finger, and any `pointerup` closes the marquee, selecting an unintended region. Lower
severity than MOBILE-1 (it's a selection, not a committed transform; it resets on `draggingItemId`), but
the same one-line `pointerId`-capture-in-`onDown` + gate-in-`onMove/onUp` fix applies.

### MOBILE-3 — Catalog placement drag (`usePlacementController`) ghost follows any pointer · S · risk: low
**Where.** `ui/catalog/usePlacementController.ts:217` window `pointermove` (`onMove`) drives the
`PlacementGhost` during arm-to-place; no `pointerId` capture. `placingActive` disables orbit, so no
pinch fight, and the **commit** is a discrete tap/`pointerup` (not the moved pointer), so the blast
radius is cosmetic (a second finger jitters the ghost before the placing tap). Note-only — fold a
`pointerId` guard in if MOBILE-1/2 are done, for consistency, but it does not mis-commit on its own.

*(Audited clean: `PanoramaViewer.tsx` and `Toolbar.tsx` window pointer handlers are single-surface
look-around / slider drags with `touch-action:none` and no multi-item commit path — not the same hijack
class. Walk-mode joystick + plan-editor pinch already sit inside `touch-action:none` / safe-area
containers. No safe-area or iOS focus-zoom regressions found — `iosZoomGuard` + `env(safe-area-inset-*)`
are correctly applied.)*

---

## Axis 3 — Fresh value-add features (competitor parity)

The app already ships an enormous surface (140 flags: swap-with-similar `replaceSimilar`/`SwapModal`,
alignment guides `AlignmentGuides.tsx`, elevation/section views, mirror-region, arrays, measure,
moodboard, saved views, style quiz, time-of-day + turntable + auto-rotate, HDRI, DoF/lens…). The ideas
below were each grepped and **confirmed absent**, are pure-client, and are not in
`TODO.md`/`TASKS.md`/`FEATURE_PARITY.md`. Ranked by value ÷ effort.

### FEAT-A — Frame / zoom-to-selection camera ("F") · S · risk: low
**Absent.** `controls/keybindings.ts` has `resetView` (H → 3D overview) and `tidyHome` (L), but no
"fit the camera to the current selection". Grep for `frameSelect`/`zoomToFit`/`focusSelection` → nothing.
**Who has it.** Effectively universal in 3D tools — Blender (`.`/`F`), SketchUp (Zoom Selection),
Coohom/Live Home 3D "focus on object". A baseline expectation for anyone arranging a specific piece.
**Where it'd live.** A new pure `scene/cameras/frameSelection.ts` (selection footprint bounds →
target + distance from FOV), driven through the existing `cameras/cameraTween.ts`; a keybinding entry +
Arrange/View menu row + mobile parity. Pro tier (an advanced navigation aid). Reuses `itemFootprint`
already imported all over.
**Effort/risk.** S; low — camera-only, no mutation, tween infra exists.

### FEAT-B — Alt/Option-drag to duplicate a placed item · M · risk: med
**Absent.** `furniture/Furniture.tsx` reads `e.altKey` only for `selectItemGrouped({alt})` (`:81,:104`)
— never to clone on drag. No drag-clone path exists.
**Who has it.** SketchUp (Ctrl/Option+move copies), Figma (Alt-drag), Coohom/Planner 5D drag-duplicate —
the fastest way to lay out repeated pieces (dining chairs, a row of cabinets) short of the array tools.
**Where it'd live.** `scene/DragController.tsx` startDrag: if the initiating pointerdown had Alt/Option,
spawn a duplicate at the origin (reuse `furniture/duplicatePlacement.ts` + the single-undo commit path)
and drag the copy instead of the original. Mobile parity via a long-press "duplicate & drag" affordance.
Pro tier.
**Effort/risk.** M; med — must interoperate with the `pointerId`/`pendingEdit` gesture state and the
collision/guide pipeline; verify one-undo semantics.

### FEAT-C — Isolate / solo the selection (focus mode) · S–M · risk: low
**Absent.** No `isolateSelection`/`soloMode`/`hideOthers` anywhere. `itemOpacity` (hide individual
items) and Layers exist, but there is no one-tap "dim/hide everything except what I'm working on".
**Who has it.** Blender local-view, SketchUp Outliner isolate, most pro 3D editors — invaluable in a
dense furnished HDB where a piece is occluded by walls/neighbours.
**Where it'd live.** A derived inverse of the existing `hiddenItemIds` set (temporarily hide the
complement of the selection, or drop non-selected items to low opacity via the existing `itemOpacity`
render path) toggled from the inspector/context-menu, auto-cleared on selection change or exit. No new
persisted state (session-only, like the hidden set). Pro tier.
**Effort/risk.** S–M; low — reuses the hidden/opacity machinery, purely visual.

### FEAT-D — Two-point-perspective / vertical-line-lock camera · M · risk: med
**Absent.** `cameraDof` covers focal length + depth-of-field, but grep for `twoPoint`/`verticalShift`/
`tiltShift`/`keepVertical` → nothing. Camera pitch tilts verticals (converging walls), the classic
"amateur real-estate photo" tell.
**Who has it.** D5 Render and Enscape (both already in `REFERENCES.md` for their camera panels) and Live
Home 3D expose a "2-point perspective / keep verticals vertical" toggle — a real architectural-photo
quality lever, and a strong fit for shareable HDB "hero shots".
**Where it'd live.** Alongside the lens/DoF controls (`cameras/cameraLensSettings.ts` + the DoF UI):
either force the camera's up-axis and apply a projection/frustum vertical-shift so verticals stay
parallel, or level pitch and offset the sensor. Pure camera math, pro tier. Verify against the existing
`cameraDof` real-GPU path.
**Effort/risk.** M; med — projection-matrix work needs a visual-verification pass; contain to a toggle
that falls back to the normal perspective.

### FEAT-E — Grid-snap for furniture placement in 3D · S–M · risk: low
**Absent (in 3D).** `planGridSnap` snaps geometry in the **2D** editor; `DragController` in 3D snaps
only to *neighbouring furniture* edges/centres (`dragHelpers.snapAxis`, the alignment guides), never to
a fixed floor grid. So there's no way to place a row of items on tidy round-number coordinates in 3D.
**Who has it.** Planner 5D / Coohom offer grid snapping in both 2D and 3D placement.
**Where it'd live.** A `gridSnap3d` toggle feeding `DragController.onMove` a quantize-to-grid step
(reuse `floorplan/gridSnap.ts`'s snap math), composed with the existing neighbour snap (neighbour wins
within threshold, else grid). Pro tier. Lowest-ranked here because the alignment guides already deliver
most of the "tidy placement" value — this is complementary polish.

### New reference app surfaced
- **Home Planner** — https://www.homeplannerapp.com/ — 2D/3D web+mobile room planner with a very large
  **multi-brand** shoppable catalog (cited 400k+ items / 30k+ brands: IKEA, Wayfair, Ashley) + AR. Worth
  adding to `REFERENCES.md`, but its differentiator is **catalog scale + AR = backend/licensed-asset
  led**, so it mainly informs the already-tracked catalog-expansion / brand-importer work (F11), not a
  new client-doable feature. (No genuinely-new *client-doable* reference beyond the ones already
  listed surfaced this pass; the feature ideas above are grounded in apps already in `REFERENCES.md` —
  D5/Enscape/Live Home 3D/Coohom/Planner 5D — plus the universal SketchUp/Blender interaction norms.)
</content>
</invoke>
