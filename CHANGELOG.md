# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit. The pre-C251 history (C1–C250) was
pruned from `main`; entries from C251 on (branch
`claude/codebase-analysis-optimization-ny3xm9`) are kept here. See `TASKS.md` for the backlog.

## TESTS: cover the door-aware collision wall builder (v0.9.0.38)

- `collision/wallsFromState.ts` `buildCollisionWalls(doorState)` — shared by first-person camera +
  placement collision to decide "what's solid right now" — was untested. Added `wallsFromState.test.ts`
  (6 cases): produces segments for the built-in flat, every segment has positive length + thickness,
  opening doors removes wall span (less solid length than all-closed, but walls don't vanish),
  a single open door only shortens, output is deterministic, and an empty door-state falls back to
  each door's `defaultOpen`.
- No bug found — regression safety for core collision infrastructure.

## TESTS: cover the plan geometry helpers in floorplan/types.ts (v0.9.0.37)

- Robustness/coverage pass. `src/floorplan/types.ts` holds 10 pure geometry helpers used app-wide
  (room detection, area labels, furniture-in-room, floor render, plan bounds) but had **no test
  file**. Added `types.test.ts` — 21 cases covering `polygonArea` (degenerate/winding/triangle),
  `pointInPolygon` (inside/outside/concave-notch), `roomPolygon` (explicit/rect), `planRoomArea`
  (rect, non-overlapping L, and the **BUG-004 overlapping-extension invariant** — union 28, not
  double-counted 32), `planRoomPerimeter`, `pointInRoom` (boundary-inclusive rect, extension,
  explicit polygon), `planTotalArea`, `wallLength`, `planBounds` (walls + explicit polygon), and
  `rectUnionOutline` (adjacent merge, overlap union, empty).
- No bug found — the geometry is correct; this is regression safety for previously-untested,
  app-critical pure functions.

## A11Y: mobile menu sheet closes on Escape + guards hotkeys (v0.9.0.36)

- Last item from the keyboard/SR audit: the `MobileToolbar` menu sheet was the only overlay with no
  Escape handler and no `useModalGuard`. Added both — Escape closes it, and app-wide hotkeys are
  suppressed while it's open, matching every other overlay. (Keyboard-on-mobile is rare, but this
  closes the consistency gap.)
- Test: new `MobileToolbar.test.tsx` — open via the Menu button, Escape closes the sheet.

## A11Y: Popover returns focus to its trigger on Escape (v0.9.0.35)

- The toolbar `Popover` (View / Scene / Arrange / File menus, and other anchored menus) closed on
  Escape but never restored focus — a keyboard user who opened a menu and pressed Escape was left
  with focus orphaned on `<body>`, having to re-tab to their place. Now Escape returns focus to the
  trigger (`anchorRef`), the standard menu-button pattern. Only on Escape — an outside pointer-down
  deliberately does not yank focus back.
- Test: added a focus-restore case to `Popover.test.tsx` (Escape → `activeElement === trigger`).

## A11Y/CHORE: rebuild CreditsModal on the shared Modal primitive (v0.9.0.34)

- `CreditsModal` was a bare `.modal-overlay` with no Escape, no focus trap/restore, no
  `role="dialog"`/`aria-modal`, and no `useModalGuard` — violating the `ui/CLAUDE.md` rule that any
  modal-style overlay not built on `Modal` must at least call `useModalGuard`. Rebuilt on the shared
  `Modal` primitive, which supplies all of the above for free; dropped the redundant footer Close
  (Modal's header × + Escape + backdrop cover it). **Note:** the component is not currently mounted
  anywhere (only a per-item attribution surface in the inspector is wired) — so this is code hygiene
  + a11y-correctness + test coverage, latent until it's wired up (candidate recorded in TODO).
- Tests: extended `CreditsModal.test.tsx` — dialog role + title present, closes on Escape, closes on
  the header Close button (in addition to the existing fetch/display + closed-renders-null cases).

## A11Y: consistent keyboard focus ring across all controls (v0.9.0.33)

- New area — keyboard/screen-reader accessibility (chosen via a grep-verified audit). WCAG 2.4.7
  Focus Visible: the app had themed focus styling only on text inputs (`.input`/`.num` box-shadow)
  and catalog cards (`.cat-card` outline) — every other interactive control (`.btn`, `.icon-btn`,
  `.tool-btn`, chips, inspector action tiles, segmented toggles, menu/context items, custom
  Select/Color triggers, swatches, …) fell back to the inconsistent browser-default ring.
- Added one low-specificity `:where(button, [role=button], [role=menuitem], [role=menuitemcheckbox],
  [role=option], [role=tab], summary, [tabindex='0']):focus-visible` rule → a 2px accent outline
  (offset 2px). `:where()` keeps specificity 0 so the richer input/card focus styles still win;
  `:focus-visible` shows it for keyboard/AT focus only, never on mouse click. One rule covers the
  whole control vocabulary + future controls.
- Verified in-browser: Tab moves focus through `.tool-btn`s, each showing `outline: 2px solid`
  in the accent colour. (CSS `:focus-visible` cascade isn't reproducible in happy-dom, so browser
  verification is the check, as with the prior CSS a11y fixes.)

## FIX: Layers-panel group hide/lock eyes unreachable on mobile (v0.9.0.32)

- Same hover-reveal trap as v0.9.0.31, swept for across the CSS: the Layers panel's group-header
  **hide-all** / **lock-all** eyes (`.lyr-geye`) are `opacity: 0` until `.lyr-ghead-row:hover`. On
  touch (no hover) you can't turn a group hidden/locked in the first place — and only the resulting
  `.on` state is visible, so it's a chicken-and-egg like the catalog heart. Shown always + enlarged
  to 30px on mobile. Verified 30×30, `opacity: 1`, eyes visible on the group header at 390px.
- Audit of the remaining `:hover`→`opacity:1` reveals: the per-item row actions (`.lyr-acts`) already
  have a `.sel` (tap-to-select) fallback, and the rest (`.tip`, `.mi-help`, `.ci-help`) are
  non-essential help hints appropriately hidden on touch — no further action.

## FIX: catalog favourite/stamp buttons unreachable on mobile (v0.9.0.31)

- Real mobile bug found during the deep-dive: the catalog card's **favourite ♥** and **stamp**
  buttons (`.fav-btn`/`.stamp-btn`) are `opacity: 0`, revealed only on `.cat-card:hover` — but
  touch has **no hover**, so on a phone the favourite button was invisible and you couldn't
  favourite an item from the catalog at all (a chicken-and-egg: `.on` forces it visible, but you
  can't reach the un-favourited state to toggle it on). Now shown always on mobile
  (`body.mobile .fav-btn/.stamp-btn { opacity: 1 }`), enlarged 24 → 32px for touch, with the stamp
  button dropped below the favourite so their hit areas don't overlap.
- Verified in-browser: `.fav-btn` renders at 32×32 with `opacity: 1` at 390px; hearts appear on
  every card, cleanly positioned. Desktop keeps the hover-reveal.

## A11Y: larger, touch-friendly finish swatches on mobile (v0.9.0.30)

- Follow-on to the mobile deep-dive (the candidate deferred in v0.9.0.29). The compact `.swatch`
  tiles (finish-picker Floor/Walls/Ceiling groups + designer-picks rows + the accent-wall picker)
  were 26px — awkward to tap and a small texture preview on a phone. Bumped to **40px on mobile
  only** (`body.mobile .swatches .swatch`); desktop keeps 26px. These live in a dense wrap grid, so
  the invisible-`::after` hit-area trick can't apply (adjacent hit areas would overlap) — enlarging
  the tile itself is the correct fix. The large `.swatch-lg` finish grid was already touch-sized.
- Verified in-browser: swatches measure 40×40, ~7 per row at 390px, no horizontal overflow; Floor /
  Walls / Ceiling sections all read cleanly. Desktop unaffected (rule is `body.mobile`-scoped).

## A11Y: 44px touch targets for modal, toast & bulk-tint close buttons (v0.9.0.28)

- Mobile touch-target sweep (chosen focus: mobile/touch deep-dive). The existing MOBILE-TAP-TARGETS
  system expands small 26px `.icon-btn`s to a 44px hit area (an invisible `::after`, inset −9px) —
  but only for an *enumerated* set of docked-panel headers. That left three isolated, whole-app
  surfaces below the 44px minimum on mobile:
  - **Modal close/back buttons** (`.modal-overlay .panel-head .icon-btn`) — every modal (Swap, quote
    template, pano tour, GLB designer, style quiz, notification details, …). 26 → 44px.
  - **Toast dismiss ×** (`.toast .icon-btn`, a 22px control) → 44px (inset −11px).
  - The **multi-select "Clear tint" ×** added in v0.9.0.25 (`.ms-appearance .icon-btn`) → 44px.
  All three are isolated at a container edge, so the padded hit areas can't overlap a neighbour
  (why the original rule was scoped rather than global). Verified in-browser via computed `::after`
  geometry (toast 22 + 2×11, modal 26 + 2×9). No visual change; a wider mobile audit found the core
  flows (overview, room editor, inspector, finish picker, multi-select, menu, catalog placement)
  already render correctly at 390px and 320px with no horizontal overflow.

## DOCS: correct stale TODO candidate — toast pause-on-hover already shipped (v0.9.0.27)

- Verified `NotificationContainer` already implements WCAG 2.2.1 pause-on-hover/focus; marked the
  stale TODO audit note as already-shipped so future iterations don't rebuild it.

## POLISH: clear bulk tint even for mixed selections (v0.9.0.26)

- Follow-up to v0.9.0.25 (found during a mobile-parity verification pass — the three new surfaces
  this session all render correctly in the mobile bottom-sheets; no mobile bug). The multi-select
  "Clear tint" button previously appeared only when the selection *shared* one tint, so a selection
  with **mixed** tints had no way to reset. It now shows whenever **any** selected item is tinted
  (new `anyTinted` check), clearing them all in one undo step.
- Tests: added mixed-tint clear + nothing-tinted-hidden cases to `MultiSelectPanel.bulkTint.test.tsx`.

## FEATURE: bulk recolour on multi-select (v0.9.0.25)

- Customizability: the multi-select panel now has an **Appearance › Tint all** colour picker that
  recolours **every selected item at once** ("make all these chairs burgundy") — one action, vs the
  previous copy-one-item's-appearance → paste-to-rest dance. A reset button clears the tint from all
  when the selection shares one. The picker's swatch reflects the selection's shared tint (or blank
  when they differ). Matches the bulk material/colour editors in Coohom / Planner 5D / IKEA Kreativ.
- Store: new **`updateManyItemProps(ids, props)`** batch action (`itemsSlice`) — merges props into
  every listed item in ONE undo step (`pushHistory` once + a single `set`), the idiomatic batch
  pattern (align/distribute push once then mutate many). Reusable for future bulk appearance edits.
- Flag: **`bulkAppearance`** (`simple`, default on — a fast common re-skin; on in both modes).
- Tests: `updateManyItemProps` unit tests (batch merge, single-undo, clear-with-'', empty-list
  no-op) + `MultiSelectPanel.bulkTint.test.tsx` (section shows when on / hidden when off, both-mode
  flag, clear affordance appears once the selection shares a tint). Visually verified the picker +
  recolour in the room editor.

## FIX: gate remaining ungated feature surfaces (v0.9.0.24)

- Hard-rule compliance sweep (follow-up to v0.9.0.23; found via an audit of every surface mounted
  in `App.tsx`). Three more user-facing feature surfaces rendered guarded only by internal state,
  not by their feature flag — so a persisted/stray state could leak the surface after the feature
  was disabled (notably a `pro` feature surfacing in Simple mode). Each now also checks its flag:
  - **`BudgetHud`** (the spend pill) → `useFeature('budget')` (was: only `budgetTarget != null`).
  - **`TapeModeToggle`** (tape line/area mode pill) → `useFeature('measure')` (was: only `tapeMode`).
  - **`PresentationMode`** (full-screen saved-views slideshow, `pro`) → `useFeature('presentation')`
    (was: only `presenting`). The menu entry that *opens* each was already gated; this closes the
    render surface itself. Default on-states unchanged.
- Audit outcome: every other App.tsx surface is either correctly gated (self- or mount-gated) or is
  intrinsic chrome (toolbar, selection outline, drag HUD, nav cluster, error boundaries, …).
- Tests: `BudgetHud.test.tsx`, `TapeModeToggle.test.tsx`, `PresentationMode.gate.test.tsx` — each
  renders the surface with its flag on (present) and off (null), plus the `presentation` pro-tier
  both-mode resolution (off in Simple, on in Pro).

## FIX: gate the accent-wall picker behind a feature flag (v0.9.0.23)

- Hard-rule compliance ("no feature ships ungated"): the `WallAccentPicker` — the panel that paints
  one wall face a different finish from the rest of the room (a feature/accent wall), opened by
  clicking a wall in the room editor — shipped with **no feature flag at all**. Added the
  **`wallAccentPicker`** flag (`simple`, default on — a common casual design move) and gated both
  ends: the panel mounts only when the flag is on, and the wall-face click that selects a wall is
  a no-op when off (the face also drops its clickable cursor, so nothing hints at an unavailable
  action). Behaviour is unchanged in the default on-state.
- Tests: `WallAccentPicker.test.tsx` — flag is simple + on in BOTH modes; panel mounts on
  wall-select when on, renders nothing when off (even with a wall selected) or when no wall is
  selected.

## FEATURE: ceiling finish in the per-room picker — wire a dead flag (v0.9.0.22)

- Customizability: the per-room `FinishPicker` (shown when a room is selected) now has a **Ceiling**
  section alongside Floor and Walls — a swatch grid (from the wall/paint pool, since a ceiling is
  painted like a wall), an "Apply ceiling to all rooms" bulk button, a "Reset ceiling to white"
  action (the default is plain white = unset), and a ceiling `MaterialComposer`. This makes the
  FinishPicker the **unified per-room surface panel** (floor + wall + ceiling) — closing the
  scattered-pickers gap without a parallel new panel.
- **Dead-flag fix**: the `ceilingFinish` flag (`simple`, default *on*) has shipped since its
  introduction with **no UI behind it** — `setCeilingFinish`/`clearCeilingFinish`/`setAllCeilingFinish`
  actions and the `apartment/Ceiling.tsx` render path all existed, but nothing exposed them. The new
  section is gated on `useFeature('ceilingFinish')`, so the flag now controls a real surface.
- "Copy finishes to…" now also carries the ceiling (only when the source room actually has one, so it
  never paints a ceiling the source lacked). Browse-online maps a ceiling context to the wall
  material category.
- Tests: `FinishPicker.ceiling.test.tsx` — flag is simple + on in BOTH modes; the section renders when
  on and is hidden when off (Floor/Walls still render); apply persists + surfaces a reset; apply-all
  disabled + reset hidden until a ceiling is chosen. (Mocks `proceduralThumbnailDataUrl` per the
  established swatch-in-jsdom pattern.) Visually verified the section in the room editor.

## FEATURE: live dimension readout while group-resizing (v0.9.0.21)

- Customizability: the multi-select `ResizeGizmo` (2+ items, orbit + select) now shows a live
  **width × depth** pill (bottom-centre `.hud-pill`) as you drag a corner handle, so a block of
  furniture can be scaled to a target size — the group-resize gesture previously gave no numeric
  size feedback (single items already show metres in the inspector's Size section, so this is
  scoped to the group case). Respects the user's unit system (metric "3.60 × 3.40 m" / imperial
  "11′ 10″ × 11′ 2″" via `formatDims`).
- Plumbing: `scene/selection/resizeReadoutSignal.ts` — a module-level `useSyncExternalStore` signal
  (same rationale as `finishDragSignal`: a resize fires many `pointermove` ticks/sec; routing each
  through the store would wake the RenderPump per event). `ResizeGizmo` publishes the live box W×D
  (unioning every selected member's footprint PARTS — matches the true-geometry gizmo box) on each
  move and clears on release/unmount; `ui/ResizeHud.tsx` reads it.
- Flag: **`itemDimensionReadout`** (`simple`, default on — a core sizing affordance; enabled in
  BOTH Simple and Pro). Self-gated via `useFeature`.
- Tests: signal unit test (publish/clear/notify/dedup) + `ResizeHud` render test (hidden when
  idle, hidden when flag off, metric + imperial dims) + flag both-mode test. Visually verified the
  pill (metric + imperial) via a temporary signal hook, then reverted the hook.

## POLISH: shortcut hints on inspector action buttons (v0.9.0.20)

- Discoverability: the inspector's action buttons (Rotate / Flip H / Flip V / Duplicate / Delete)
  now carry `title` tooltips that spell out their keyboard shortcuts — "Rotate 90° (R · Shift for
  15°)", "Flip left–right (F)", "Duplicate (Ctrl D)", etc. — sourced from `KEYBINDINGS` via
  `shortcutLabel` so they never drift. Complements the v0.9.0.18 "?" overlay (surfacing shortcuts
  right where the action is), and matches the existing descriptive tooltips already on Face-room /
  Centre. An affordance enhancement to existing buttons (like their neighbours' titles) — no new
  flag. Verified: DOM-probed every action button's rendered `title`.

## FEATURE: reveal "search by room" with a results caption (v0.9.0.19)

- Discoverability: catalog search already understood room/use intent (`searchSynonyms.ts` —
  "bedroom" → bed/wardrobe/nightstand, "office" → desk/office chair/bookshelf), but that was
  **invisible** — a user would never guess to type a room name. Now, when a query names a room/use,
  a subtle caption reads **"Showing <room> furniture"** above the results, revealing the capability.
- New pure `matchedIntents(query)` (the room/use intents a query expresses, longest-match-first,
  de-duped) drives the caption in `CatalogDrawer` (`.catalog-search-hint`, themed `--text-2`/`--t-xs`).
  Verified live: typing "bedroom"/"office" surfaces the caption + the right items (DOM-probed the
  rendered caption text + bounding box — visible, themed).
- Tests: +3 (`searchSynonyms.test.ts` — intent detection, empty for plain/blank queries, no
  substring-shadowed duplicates). (Audit follow-up: the synonym search + "No matches" empty state
  the audit flagged as "silent" were already shipped — this closes the remaining invisible-intent gap.)

## FEATURE: keyboard-shortcuts help overlay (discoverability) (v0.9.0.18)

- Closes the verified discoverability gap: shortcuts lived only in `KEYBINDINGS` + piecemeal ⌘K
  hints/tooltips, with no single reference. A **"?" overlay** now lists every shortcut grouped by
  task (Move & arrange / Edit / View / Panels & tools / Walk mode) with themed `<kbd>` chips.
- Opens with **Shift+/** (`?`) or the ⌘K **"Keyboard shortcuts"** command (replacing the old
  mislabelled "Appearance & help" entry that just opened Appearance). Feature-flagged
  (`shortcutsHelp`, **pro**, default on — a power-user aid, hidden in Simple); the `?` handler +
  the ⌘K command both gate on it.
- Single-key labels are sourced from `KEYBINDINGS` via the pure `controls/shortcutHelp.ts`, so the
  overlay can't drift from the real bindings; modifiers/Shift variants are in the descriptions.
  Reuses the shared `.kbd-grid`/`<kbd>` token vocabulary — themed, light + dark verified.
- Tests: +13 (`shortcutHelp.test.ts` list integrity + KEYBINDINGS sync; `shortcutsHelp.test.ts`
  flag both-mode; `ShortcutsModal.test.tsx` render — dialog + every group + exact kbd-chip count).
  Visually verified in light + dark (via a direct-import mount — see the new playbook note that
  React.lazy modals don't resolve headlessly).

## FEATURE: soft push-apart on drop (physics leg) (v0.9.0.17)

- **Physics leg** (light touch). A single-item drag that ends on an *overlapping* spot no longer
  hard-snaps back to where it started — it's **nudged out of the collision** to the nearest valid
  spot (a gentle slide off the obstacle), the "soft collision nudge rather than hard block" behaviour
  requested. **Bounded** (≤ 0.4 m), so a deep overlap with nowhere near to go still reverts, and it
  stays predictable — the design tool never teleports a piece across the room.
- New pure SAT `collision/obb.ts:obbMtv` (minimum translation vector — unit separation axis + depth)
  + `collision/placement.ts:nudgeToValid`, which uses the MTV only to pick a *push direction* then
  steps outward (with a small ± fan to round corners) verifying each candidate with **`canPlace`** —
  so validity (height spans, group/rug/mounted exemptions, doors, walls) is always the real rule, not
  a duplicated approximation. Wired into `DragController`'s invalid-release branch; a soft-land
  resolves to a confirmable tick/cross edit. Group drags keep the hard-revert (resolving many at
  once would fight the user).
- Tests: +7 (`pushApart.test.ts` — MTV null-when-apart / shallow-axis separation / direction sign /
  applying it clears the overlap; nudge already-valid passthrough / pushes an overlap to a valid
  adjacent spot / returns null beyond `maxStep`). Verified end-to-end: a shallow overlap soft-lands
  clear of its neighbour with a pending edit; a deep overlap reverts.

## FEATURE: selection scale-in micro-interaction (v0.9.0.16)

- **Animations leg.** Selecting an item now eases its outline + floor tint up from slightly smaller
  (0.9→1 over 130 ms, ease-out) instead of popping in hard — a subtle focus cue (Coohom / Planner 5D
  do similar). Plays once when the item enters the selection; a no-op thereafter.
- Localized to `SelectionOutline`'s `ItemOutline` (only the handful of selected nodes get a
  `useFrame`), driving the root group's scale from the pure `scene/selection/selectionAppear.ts`
  (`appearEase` / `appearScale`). At rest the scale is exactly 1 — no change to the settled outline.
  Short enough to finish inside the demand-mode settle tail; invalidates while ramping to be safe.
- Tests: +4 (`selectionAppear.test.ts` — ease endpoints/clamp, scale starts at 0.9 and settles at
  exactly 1, monotonic within bounds). Verified live: sampled the outline group's scale mid-appear
  (observed sub-1 scaling easing to 1) and confirmed the outline renders cleanly, no glitch.

## FEATURE: placement drop-in easing (v0.9.0.15)

- **Animations leg.** A freshly placed piece now eases DOWN onto its resting spot from a small
  height (~0.16 m, 300 ms, ease-out) — tactile feedback that reads as "placed", not teleported.
- Respects the `Furniture` **no per-item `useFrame`** perf rule via a **central animator**:
  `scene/placementDrop.ts` (pure timing: `dropEase` / `dropOffsetY`, + a small module registry) —
  the commit calls `beginDrop(id)`, each item registers its root group (`registerDropGroup`), and
  one mounted `<PlacementDropAnimator>` mutates only the dropping groups' Y each frame, holding the
  demand-mode pump open (`registerAnimatedSource`) until the drop lands. Idle = one `Map.size` check.
- Wired at the single-item placement commit (`usePlacementController`), so catalog click/drag drops
  animate; window-bound fixtures (curtains/blinds) and bulk/boot adds don't drop-in (no jank).
- Tests: +7 (`placementDrop.test.ts` — ease endpoints/clamp, offset monotonic + lands at 0, and the
  full tick lifecycle: lifts a group Y = rest+offset, snaps to rest + releases the pump hold at the
  end, and ends cleanly if the group unmounts mid-drop). Verified end-to-end in the room editor
  (sampled the live group Y through a real placement: lifts to ~0.10 m, eases to rest).

## FEATURE: selection / resize box is the true minimum spanning box (v0.9.0.14)

- Follow-up to the granular-footprint work. The selection **bounding box + resize handles** used
  the enclosing `itemFootprint` OBB, which for the L-sofa is the **depth-only 2.6×0.95 m** rectangle
  — so the box cut straight through the chaise instead of spanning the true ~2.6×1.95 m geometry.
  Now both the `SelectionOutline` brackets and the multi-select `ResizeGizmo` use the **minimum
  spanning box of the footprint parts**, so the box tightly bounds the real shape.
- New pure helper `collision/placement.ts:itemFootprintSpanLocal` (unions the convex parts in the
  item's local frame, relative to the OBB centre); `ResizeGizmo` unions every part's `obbCorners`.
  Single-part pieces are unchanged (the span equals the enclosing OBB). +4 tests.
- **Placement-ghost green/red verified** (already correct, no change): the tint is driven by
  `canPlace` → `ghostValid`, which uses the true-shape parts — confirmed headlessly that the ghost
  is green on open floor and flips to red (invalid) when moved over an existing item.

## FEATURE: selection + placement tint follows the granular collision polygon (v0.9.0.13)

- Closes the consistency gap the granular-collision work opened: collision became shape-aware
  (`footprintParts`) but the **selection floor-tint** (`SelectionOutline`) and the **placement
  ghost** (`PlacementGhost`) still painted a single enclosing rectangle. An L-sofa / corner cabinet
  now tints its **true L** — the concave notch reads as open floor, matching exactly where a piece
  may actually go.
- New pure helper `collision/placement.ts:itemFootprintPartsLocal` returns the footprint parts in
  the item's **local** frame (offset + half-extents + part-rotation), so a renderer drops one plane
  per part into a group already carrying the world position + yaw. A non-composite def yields a
  single centred part — **pixel-identical** to the old rectangle, so plain pieces are unchanged.
- The placement ghost's tint now also **rotates with the previewed orientation** (it previously
  stayed axis-aligned — a latent bug for rotated non-square pieces), via an inner yaw group.
- The **enclosing-box outline brackets + hover outline stay on the bbox** — they're the
  selection/resize-handle affordance; it's the colored *fill* that should hug the shape.
- Tests: +4 (`granularFootprint.test.ts` — local single-part = centred footprint, yaw-independence,
  L-sofa 2-part offsets, scale applied). Visually verified (`scenarios/granular-tint.json`): the
  L-sofa tints its L cleanly with no z-fighting; the notch is not filled.

## FEATURE: eased camera transitions for focus / top / reset views (v0.9.0.12)

- **Animations leg** of the deeper-interaction directive. Every camera retarget now *glides*
  instead of teleporting: double-click **focus**, the **top-down** view and **reset/home** all
  route through the same eased fly that saved-views already used, rather than an instant
  `controls.update()` snap. (The focus path's comment always promised "smoothly re-target" — now
  it actually does.)
- New pure-math core `scene/cameras/cameraTween.ts` (no three/React → unit-testable): `smoothstep`
  ease + `flyDurationFor`, a **distance-aware** duration (a short hop snaps at `FLY_MIN_SECONDS`,
  a long jump across the flat glides up to `FLY_MAX_SECONDS`). `OrbitCamera` holds one `startFly`
  helper that all four retargets call; the per-frame tween uses the fly's own `dur`.
- The fly self-pumps the demand-mode renderer via OrbitControls' `change` event on each
  `update()`, so no new RenderPump input was needed.
- Tests: +10 (`cameraTween.test.ts` — smoothstep endpoints/clamp/monotonicity, duration bounds /
  monotonic scaling / 3-D travel / non-finite fallback). Visually verified (`scenarios/eased-camera.json`):
  start → mid-flight → settled frames confirm a genuine interpolation that lands on the correct pose.

## FIX: granular-footprint broadphase superset + L-sofa preset wall clip (v0.9.0.11)

- Two latent bugs from the v0.9.0.9 granular-collision work, both surfaced by the full test suite:
  - **Broadphase AABB no longer enclosed the collision shape.** `itemAabbBox` boxed the single
    `itemFootprint` OBB, but for the L-sofa that OBB is read from the `depth` prop (the main-run
    depth only, ~0.95 m) while the true main-run+chaise shape is ~1.95 m deep. The broadphase grid
    is required to be a **superset** of the narrowphase; a too-small box could prune a real
    chaise-vs-neighbour overlap (missed by the clearance/score scans + auto-arrange). `itemAabbBox`
    now **unions every part's AABB** (identical for single-part pieces). +3 regression tests.
  - **`open-lounge` / `entertainer` presets clipped the west partition.** Authored against the old
    *shallow* (depth-only) footprint, the L-sectional's true 1.95 m-deep back run poked ~0.12 m
    through the wall at x≈9.05. Nudged both to x=10.2 so the back clears the wall (coffee table is
    separated in Z, so the small east shift is safe). The `layoutPresets` collision test passes.
- No render/feature change — collision correctness only.
## FEATURE: eased camera transitions for focus / top / reset views (v0.9.0.11)

- **Animations leg** of the deeper-interaction directive. Every camera retarget now *glides*
  instead of teleporting: double-click **focus**, the **top-down** view and **reset/home** all
  route through the same eased fly that saved-views already used, rather than an instant
  `controls.update()` snap. (The focus path's comment always promised "smoothly re-target" — now
  it actually does.)
- New pure-math core `scene/cameras/cameraTween.ts` (no three/React → unit-testable): `smoothstep`
  ease + `flyDurationFor`, a **distance-aware** duration (a short hop snaps at `FLY_MIN_SECONDS`,
  a long jump across the flat glides up to `FLY_MAX_SECONDS`). `OrbitCamera` holds one `startFly`
  helper that all four retargets call; the per-frame tween uses the fly's own `dur`.
- The fly self-pumps the demand-mode renderer via OrbitControls' `change` event on each
  `update()`, so no new RenderPump input was needed.
- Tests: +10 (`cameraTween.test.ts` — smoothstep endpoints/clamp/monotonicity, duration bounds /
  monotonic scaling / 3-D travel / non-finite fallback). Visually verified (`scenarios/eased-camera.json`):
  start → mid-flight → settled frames confirm a genuine interpolation that lands on the correct pose.

## FEATURE: granular footprint for the L-shaped corner base cabinet (v0.9.0.10)

- Applied the v0.9.0.9 `footprintParts` infra to the **corner base cabinet** (`cabinet-corner`):
  its two perpendicular runs (back along X + left along Z, minus the shared corner) are now the
  collision shape, leaving the inner +X/+Z quadrant open. An adjacent base cabinet can butt against
  a leg in a kitchen corner without the empty inner corner reading as solid. Param-driven from
  `width`/`depth`, matching the `CabinetCorner` primitive geometry.
- Tests: +3 (`granularFootprint.test.ts` — 2-run decomposition, inner-corner-free vs.
  bounding-box-would-block, both legs still block); 13 in that file, full collision suite green.
  Same collision path as v0.9.0.9 (visually verified there); render unchanged.

## FEATURE: granular shape-aware furniture collision (composite footprints) (v0.9.0.9)

- **Collision is no longer bounding-box-only.** A `FurnitureDef` can now declare `footprintParts`
  — a convex decomposition of a non-rectangular plan shape (a list of local-space oriented
  sub-rects), either static or a **function of the item's live props** for parametric pieces
  whose shape varies. `collision/placement.ts` gained `itemFootprintParts(item, def)` which maps
  each part into world space (item scale + rotation applied; honours a GLB's off-origin offset),
  and `canPlace` (walls + furniture), `itemsCollide`, `findItemOverlaps` and `findWallClips` now
  test **any-part-vs-any-part** (SAT). The broadphase still uses the single enclosing OBB
  (`itemFootprint`) — a valid superset, so it stays O(n) with identical results. Absent
  `footprintParts` → unchanged single-OBB behaviour (fully backward compatible).
- **L-shaped sectional decomposed** into its main run + perpendicular chaise (param-driven from
  `width`/`depth`/`chaise`/`chaiseSide`), so the concave notch reads as open floor: a side table,
  stool, plant, etc. can now sit in the L instead of being falsely blocked by the 2.5×1.95 box.
- Tests: 10 new (`collision/granularFootprint.test.ts` — single-OBB back-compat, L-sofa
  decomposition, notch-is-free vs. chaise/main-run-blocked, left/right mirror, `findItemOverlaps`
  in the notch, static-parts array, scale + rotation of parts) + the full 124-test collision suite
  still green. Visually verified in-app: a bar-stool placed in the L-sofa's open notch coexists
  cleanly (no clip), camera-framed at noon.
- First step of the **deeper core-interaction** direction (granular collision → animations →
  physics); the `footprintParts` infra is reusable for other non-rectangular pieces (corner
  cabinets, U-sofas, corner desks) — tracked in `TODO.md`.

## FEATURE: configurable price-rule library for the quote & estimate (v0.9.0.8)

- **Contractor-editable rate card** (`priceRules`, pro flag) — the BOQ quote and the renovation
  estimate previously priced everything from a fixed built-in table (`RENO_RATES` + a hardcoded
  `CARPENTRY_RATE = 320`). They now read a user-configurable `PriceRules` card: per-bucket $/m²
  floor rates (tiles / stone / timber / vinyl / other), per-bucket $/m² wall rates (paint / tiles /
  wallpaper / other) and the carpentry $/linear-metre. Defaults reproduce the built-in SG table
  exactly, so output is unchanged until a rate is edited. Closes the second half of parity gap
  **M#2** (quote templates shipped earlier; this adds the price-rule library).
- **One source of truth** — `analysis/renovationCost.ts` owns the model (`PriceRules`,
  `DEFAULT_PRICE_RULES`, `mergePriceRules`/`isNonDefaultPriceRules`, `floorRateFor`/`wallRateFor`);
  `estimateRenovation` takes an optional `rules` param (defaults to the built-in table — fully
  backward compatible). The quote (`assembleBoqInput`), the printable report (`buildReportHtml`)
  and the cost-breakdown CSV (`buildCostBreakdown`) all thread `store.priceRules` through, so the
  three deliverables price identically.
- **Editor** lives in the existing **Quote template** dialog under a new "Price rules (rates)"
  section, gated by `useFeature('priceRules')` (the section, plus a "Reset rates" affordance).
  Rate edits push a single undo step and are undoable (added `priceRules` to the history snapshot).
- **Persistence** — the rate card travels with the design (Zod `PriceRulesZ` + autosave watch-list +
  `serialize`/`applySerialized`), persisted only when non-default; `mergePriceRules` sanitises any
  corrupt/negative/NaN rate back to the default on load.
- Tests: rate-card helpers, `estimateRenovation` honouring a custom card, the slice (set/reset +
  single-undo revert), schema round-trip (non-default persist + corrupt-clamp), and the `priceRules`
  flag in **both** Simple (off) and Pro (on) modes. Visually verified the dialog via the
  quote-template scenario (19/19; edit→undo round-trip 420→320).

## QOL+FIX: Undo affordance on style apply + single-undo fix (v0.9.0.7)

- **"Undo" button on the style-applied toast** (style transfer + style quiz) — applying a whole-home
  style is a big change, so the success toast now carries an inline **Undo** action (reusing the
  notification `actionLabel`/`onAction` from v0.9.0.1) and stays up 8s. One tap reverts it.
- **Fixed a latent undo-granularity bug:** applying a style used to push **two** history entries
  (`applyHomeStyle` + `setMasterPalette`), and since the master palette isn't in the history snapshot,
  a single undo reverted *nothing visible* — the finishes stayed changed (it took two undos). Folded
  the palette into `applyHomeStyle(floorId, wallId, palette?)`'s single `pushHistory` (palette set
  inline, no second entry), so applying a style is now **one** undo step that cleanly reverts the
  finishes. `cleanPalette` is now exported from `colorPaletteSlice` for reuse.
- Tests: new `finishesSlice` test asserts applyHomeStyle pushes exactly one history entry, sets
  floor+wall+palette, and that a single undo reverts it. `style-transfer-simple.json` extended to
  click the toast's Undo and assert the floor finish round-trips to its original. Visually verified
  the Undo toast.

## FEATURE: style quiz — find & apply your interior style (v0.9.0.6)

- **New `styleQuiz` (pro) feature** — a short 4-question personality quiz that recommends one of the
  curated styles (Scandinavian/Japandi/Industrial/Coastal/Warm-minimal) and applies it whole-home in
  one tap (reusing `applyHomeStyle` + `setMasterPalette`). Consumer onboarding parity
  (Decor8/Havenly/Decoratly style quizzes), fully client-side.
- **Modular + tested:** pure `ui/styling/styleQuiz.ts` — weighted `STYLE_QUIZ` data + `scoreQuiz`
  (answers → winning style, deterministic tiebreak by preset order, always returns a valid id) with
  7 unit tests including a guard that every option weights only real `STYLE_PRESETS` ids.
  `ui/StyleQuizModal.tsx` is a presentational stepper (one question per screen, Back, then a result
  card with palette swatches + Apply / Retake).
- **Wired + gated:** `styleQuiz` flag (pro, prod-safe; hidden in Simple — both-mode test), store
  `styleQuizOpen` + setter, Tools menu + mobile ToolsSection, ⌘K command, lazy-loaded modal. New
  `style-quiz-simple.json` IXT scenario (gate → stepper → asserts the Scandinavian recommendation →
  apply → finish + palette change). Visually verified: result card + restyled scene.

## FEATURE: in-engine one-tap style transfer (v0.9.0.5)

- **New `styleTransfer` (pro) feature** — a curated library of interior styles (Scandinavian, Japandi,
  Industrial, Coastal, Warm minimal); one tap restyles **every room's** floor + wall finish and sets
  the master colour palette. All finishes are builtin procedural/CC0 → no downloads, prod-safe. The
  consumer front-of-funnel "instant restyle" (Decor8/Havenly/Spoak parity), fully client-side.
- **Single-undo apply:** new `finishesSlice.applyHomeStyle(floorId, wallId)` sets floor + wall for
  every interior room across all storeys in **one** history entry (vs the two `setAll*` would push),
  honouring "one logical action = one undo." Palette via `setMasterPalette`.
- **Modular + tested:** pure `ui/styling/styleTransfer.ts` (`STYLE_PRESETS` data + `planStyleApply`)
  with 6 unit tests, including a guard that every preset's floor/wall id exists in
  `BUILTIN_MATERIALS` (catches typo'd ids). `ui/StyleTransferModal.tsx` is a presentational card grid.
- **Wired + gated:** `styleTransfer` flag (pro, prod-safe; hidden in Simple — both-mode test), store
  `styleTransferOpen` + setter, Tools menu + mobile ToolsSection entries (useFeature gated), ⌘K
  command, lazy-loaded modal. New `style-transfer-simple.json` IXT scenario (Simple-hidden →
  Pro-shown gate, apply → finish + palette change). Visually verified: the card grid renders and the
  scene restyles. (Fixed a render bug found in visual review — cards used `.panel` which is
  `position:absolute`, collapsing the grid; replaced with token-based inline styles.)

## FEATURE: before/after staging reveal (empty vs furnished) (v0.9.0.4)

- **New `stagingReveal` (pro) feature** — a consumer-staging "before/after" reveal slider
  (Decor8/Havenly/ReimagineHome front-of-funnel parity). Captures the room twice from the **same
  camera** — the furnished design, then the empty room (all furniture transiently hidden via the
  visual-only `hiddenItemIds` set, no persisted/undo impact) — and presents them on a draggable
  vertical divider (mouse + touch).
- **Modular + tested:** capture orchestration lives in the pure, injected-dependency
  `ui/staging/stagingReveal.ts` (5 unit tests — capture order, hidden-set restore incl. on failure,
  no-furniture + view-closed guards); `ui/StagingRevealModal.tsx` owns only React state + the drag UI
  and reuses `renderCompare/compareState.ts` `clampDivider`.
- **Fully wired + gated:** `stagingReveal` flag (pro, prod-safe pure code; hidden in Simple — both-mode
  test added), store `stagingRevealOpen` + setter, File menu + mobile FileSection entries (useFeature
  gated), ⌘K command (`COMMAND_FLAGS`), lazy-loaded modal. New `staging-reveal-simple.json` IXT scenario
  (Simple-hidden → Pro-shown gate, capture, both frames present). Visually verified: empty-left /
  furnished-right, pixel-aligned across the divider, theme-cohesive, no artifacts.

## A11Y: toast auto-dismiss pauses on hover/focus (WCAG 2.2.1) (v0.9.0.3)

- **Toasts no longer vanish mid-read.** `NotificationContainer` paused auto-dismiss while a toast is
  hovered or keyboard-focused (`onMouseEnter`/`onFocus` pause, `onMouseLeave`/`onBlur` resume),
  satisfying WCAG 2.2.1 ("Enough Time"). The dismiss timer was reworked from a naive
  `createdAt`-derived countdown to a self-managed per-toast **remaining-ms budget**
  (`remainingRef`/`startedAtRef`): each running interval banks only the time it actually consumed, so
  while paused the budget freezes and resumes exactly where it left off — correct across pauses,
  progress ticks, and new-toast re-renders. Appearance is unchanged. Verified with a fake-timer unit
  test (hover freezes a 3 s timer through +5 s, then resumes and dismisses after the remaining ~2 s).
- Logged a vetted set of client-feasible, headless-verifiable next-iteration candidates in `TODO.md`
  (live-price IXT scenario, shareable design card, before/after staging reveal) to feed the loop.

## RELIABILITY: live-price client coverage + parity-doc reconcile (v0.9.0.2)

- **Hardened the live-price sidecar client** (`catalog/pricing/livePrice.ts`) with 8 new
  deterministic tests for the previously-untested paths of this external-data client: successful-result
  caching (same key never re-fetches), failed-lookup null-caching (no retry storms), network-throw →
  cached null, per-retailer cache keying, concurrent in-flight dedup (one shared fetch), `/health`
  probe caching + reset-forces-reprobe, sidecar-down on `/health` throw, and default-retailer fallback
  when `/health` omits the list. All green — regression protection for the untrusted retailer-offer
  path (offer URLs already render through `safeUrl` in `BudgetPanel`, SEC-001).
- **Reconciled `FEATURE_PARITY.md` drift:** removed the stale "keyboard wall-length entry while
  drawing" gap row — it shipped as `wallNumericEntry` (flag + `floorplan/wallNumericEntry.ts` +
  editor overlay + tests) — folding it into the SH3D parity summary and dropping it from the roadmap.
- Verified (and rejected) a flagged `formatLength` "banker's-rounding" bug — JS `Math.round` rounds
  halves toward +∞, so the imperial formatter is correct; no change. Docs/tests-only (no app code).

## PWA-UPDATE: confirm-to-update flow with progress feedback (v0.9.0.1)

- **Checks on open + confirms before reloading.** Switched `vite-plugin-pwa` from `registerType:
  'autoUpdate'` (which reloaded the page behind the user) to **`'prompt'`**. `swUpdate.ts` now checks
  for a new build **on open** (plus the existing hourly + foreground checks); a found build installs
  but **waits**, and `onNeedRefresh` surfaces a single de-duped **"Update available"** toast with an
  **Update** button. `applyUpdate()` calls `updateSW(true)` (skipWaiting + reload) only on click —
  no surprise reloads. On-open/background checks are silent unless an update exists; the manual
  **"Check for updates"** still gives full feedback (checking spinner → up-to-date / Update prompt /
  error).
- **Fixed the static "Checking for updates…" bar.** Progress toasts now spin their icon and, when
  `progress` is `null`, render an **indeterminate animated bar** instead of a frozen 0%
  (`notificationsSlice` `progress?: number | null`; `@keyframes toastspin`/`toastindet` in
  `features.css`, both honoured by the app-wide reduced-motion clamp).
- **Notifications can carry an action + icon override.** New optional `actionLabel`/`onAction` (renders
  the existing `.toast-act` button) and `icon` fields on the notifications slice; the update prompt uses
  them (Update button + Versions glyph).
- Tests: `swUpdate.test.ts` (check results, on-find prompt, de-dupe, up-to-date, error), slice + container
  tests for indeterminate progress and the action button. New `update-check-toast.json` IXT scenario
  (checking spinner → Update-available prompt → up-to-date). Full suite + tsc + biome green; visually
  verified all three toast states.

## Release: clear-backlog-gpu → main (v0.9.0.0)

Minor bump for the multi-feature backlog-clearing line (v0.8.0.25–.49): the full **SLOT product
configurator** (model/compose/products/build/GLB-bake/flag/dialog/⌘K/re-editable/docs), **PHOTO-KTX2**
in-browser encoder, **PHOTO-PBR** full-PBR bundled finishes, **RD-408** wall-art auto-styling, **F4**
HDRI A/B compare, both monolithic-UI refactors (**MobileToolbar** 1140→259, **PlanInspector**
1441→524), **IO-001…010** import/export robustness, **PARITY-AILAYOUT** inline-key + **PARITY-TILT**
2D indicator, 3 new **IXT-SUITES** scenarios, and a large docs prune (TODO/TASKS/FEATURE_PARITY/
PHOTOREALISM + 10 fully-shipped research docs). See the per-build entries below.

## IO-002: clear over-limit message for converted models (v0.8.0.49)

- `bulkImport.prepareGlb` now checks the **post-optimize** GLB size against `MAX_GLB_BYTES` and throws
  a clear, conversion-aware message ("Converted model is X MB — over the 25 MB limit even after
  optimization…") instead of letting `persistUserGlb`'s generic "file too large" fire at the end of
  the pipeline. Checking the final (post-shrink) size means a compressible model that optimizes under
  the cap is never wrongly rejected. tsc + the bulk-import suite green (no happy-path regression).

## SLOT-204: re-editable configured products (v0.8.0.48)

- A baked configured product now carries its recipe (`UserGltfDef.slotSpec` — JSON `ConfiguredSpec`)
  so it can be re-opened in the configurator and re-baked. Round-trips through the existing channels
  (additive, back-compat): `persistUserGlb` stores it in IDB meta + on the def, `hydrateAssets`
  restores it, `schema` serializes it. `saveConfiguredAsset` sets it. The dialog seeds its product +
  selections from a store `configuratorEditSpec` on open (cleared on close — not in the open-effect,
  which React StrictMode double-invokes, a bug caught + fixed in visual verification), and `GltfBody`
  shows an **"Edit configuration"** button on a placed configured product (gated by
  `productConfigurator`). Save-side recipe assertion + full round-trip tests pass; the seeded dialog
  is screenshot-verified (a modular-sofa recipe re-opens on the right product with the right options).
  Closes the SLOT-204 fast-follow.

## IXT-SUITES: configurator interaction scenario (v0.8.0.47)

- Added `scripts/scenarios/configurator-simple.json` — asserts `productConfigurator` is ON in both
  Simple and Pro (simple tier), `setConfiguratorOpen` mounts the `.configurator-dialog` with the
  "Configure a product" title, and closing unmounts it. 12/12 steps pass. Extends IXT coverage to the
  SLOT configurator shipped this line.

## SLOT-301: configurator module docs (v0.8.0.46)

- Added `src/furniture/configurator/CLAUDE.md` (area rules: base+slots model, `clampConfig`
  discipline, pure `composeProduct`, GLB-designer bake channel, flag-gating, open fast-follows) and
  trimmed the `TASKS.md` SLOT entry to its remaining fast-follows (203 GLB-options / 204 re-edit) now
  that the core (model/compose/products/build/bake/flag/dialog) has shipped end-to-end.

## SLOT-105: configurator dialog + ⌘K entry (v0.8.0.45)

- `ui/configurator/ConfiguratorDialog.tsx` + `ConfiguratorPreview.tsx` — a structural clone of the
  parametric dialog: product tabs (mattress-on-frame / modular sofa), one slot row per slot with
  option pickers (optional slots get a "None"), a live `<Canvas>` preview (reuses
  `buildConfiguredObject` so it can't drift from the bake), a running "Configured price" (gated by
  `budget`), and Add-to-room / Save-to-catalog (bakes via `saveConfiguredAsset`, arms placement).
  Selections are clamped on every change so constraints resolve live. Store `configuratorOpen` +
  `setConfiguratorOpen`; lazy-mounted in `App`; ⌘K "Configure a product" command gated by
  `productConfigurator` (COMMAND_FLAGS). GPU-verified: both products assemble correctly (the bed's
  mattress rests on the frame with the headboard behind; the sofa's left-chaise L-shape with the
  mutex auto-emptying the corner). SLOT is now functionally complete end-to-end; GLB-sub-asset
  options (203), re-editable placed items (204), and the docs/scenario ladder (301) are fast-follows.

## SLOT-102/103/104: configurator object-builder + bake + feature flag (v0.8.0.44)

- `buildObject.ts` (`buildConfiguredObject`) maps the composed part list to a three.js `Group` of
  box meshes, reusing `getSurfaceMaterial`; parts sharing a `finishKey` get one cloned, key-named
  material so the baked GLB's finish targets are discoverable by the existing override channel.
- `saveConfigured.ts` (`saveConfiguredAsset`) bakes the assembly through the GLB-designer pipeline
  (`exportGlb` → `persistUserGlb`) with the composed footprint, summed price, and finish targets — a
  configured product becomes a regular `UserGltfDef` (no new persistence path). Wiring unit-tested.
- New **`productConfigurator`** feature flag (simple tier, default on, prod-safe); both-modes test
  asserts it's on in Simple and Pro and not devOnly. (The dialog/⌘K UI — SLOT-105 — lands next.)

## SLOT-101/201/202: configurable-product core + two products (v0.8.0.43)

- New pure `src/furniture/configurator/` foundation for the slot-based product configurator (base +
  named anchor slots + per-slot options): `model.ts` (typed `ConfigurableProduct`/`ConfiguredSpec` +
  `clampConfig` — the single never-throws defence, with mutex/requires/excludes constraints resolved
  left-wins) and `compose.ts` (`transformPart` quarter-turn anchor transform + `composeProduct` →
  assembled part list, unioned footprint, summed price, re-skin finish-target keys). Two authored
  all-procedural products in `products.ts`: **mattress-on-frame** (mattress + optional headboard
  slots) and **modular-sofa** (left/right-end + corner slots with mutex/excludes). 14 unit tests
  (clamping, constraints, transform math, composition counts/bounds/price/finish-keys). Pure +
  render-agnostic; the object-builder, save (`persistUserGlb` bake) and dialog land next. No UI wired
  yet (nothing user-reachable ships ungated).

## IXT-SUITES: wall-art auto-styling interaction scenario (v0.8.0.42)

- Added `scripts/scenarios/wall-art-decor-simple.json` — asserts the move-in furnished flat
  auto-hangs ≥1 framed `wall-art` piece (RD408-008) and that every such piece is wall-mounted
  (carries a `mountHeight`, no floor `elevation`). 5/5 steps pass against the dev server. Extends
  IXT-SUITES coverage to the wall-art decor pass shipped this line.

## IXT-SUITES: HDRI environment-lighting interaction scenario (v0.8.0.41)

- Added `scripts/scenarios/hdri-environment-simple.json` — covers the HDRI environment-lighting
  feature end-to-end: asserts `hdriEnvironment` is OFF in Simple / ON in Pro, `hdriId` defaults to
  null (procedural probe), selecting a curated CC0 HDRI (`venice_sunset`) sets `state.hdriId`,
  Procedural resets it to null, and the picker hides again back in Simple. All 15 steps pass against
  the dev server (screenshot captured at Medium tier). Extends IXT-SUITES coverage to the lighting
  feature shipped this line.

## PARITY-TILT: 2D-plan tilt indicator (v0.8.0.40)

- The 2D floor-plan editor's furniture overlay now draws a small tilt badge (a circled diagonal
  double-arrow) on the corner of any footprint whose item is pitched/rolled out of plane, so the
  plan view carries the same tilt the 3D view + inspector show. Gated by the same `tiltFurniture`
  pro flag as the tilt controls; pure additive SVG with token colours; renders only when
  `pitch || roll` is set. (The draggable 3D pitch/roll gizmo handle remains the open half of
  PARITY-TILT; tilt is editable today via the inspector sliders.)

## PARITY-AILAYOUT: inline key prompt + endpoint security gate for ⌘K auto-furnish (v0.8.0.39)

- The ⌘K **AI auto-furnish** flow now prompts for + persists the BYO vision-model API key inline when
  it's missing (mirroring the AI floor-plan-recognition flow) instead of dead-ending on an "add a key
  first" error, and applies the same endpoint security gate (refuse plaintext; require explicit host
  confirmation before the bearer key goes to an untrusted server) — reusing `getVisionKey`/
  `setVisionKey`/`classifyVisionEndpoint`. With the engine + collision-safe placement + BYO-key
  settings already shipped, this closes the practical AILAYOUT gap. (A dedicated brief panel and
  routing through autoArrange were considered and dropped — the latter would override the AI's
  intended positions, defeating the point.)

## F4: HDRI environment per side in the render-compare modal (v0.8.0.38)

- The A/B render-compare modal now lets each side pick its own **HDRI environment** (or Procedural)
  alongside the render preset, so users can compare lighting environments — not just presets — on the
  same camera view. `capturePreset` takes an optional `hdriId` (undefined = leave current, string =
  set that env, null = procedural), applying it before the raster capture and restoring it after
  (joining the existing time/tone/exposure/lights restore). `compareState` gains `hdriA`/`hdriB`
  (+ `setHdriA`/`setHdriB`, swapped by `swapAB`); two themed env `Select`s sit beside the preset
  pickers in the footer. Pure-state + swap unit-tested; modal screenshot-verified (Pro). Closes the
  F4 HDRI-compare tail.

## RD408-008: auto-hang wall art behind wall-flushed furniture (v0.8.0.37)

- The decor auto-styling pass (`layout/decorStyling.ts`) now hangs one framed `wall-art` piece on the
  wall **behind** each wall-flushed host (`WALL_ART_HOSTS`: 3/2-seat sofas, queen/king/double beds,
  sideboard, console — L-shape sofas excluded). The art sits at the host's back edge facing the room,
  sized `widthFrac`×host width (clamped), self-lifting to its def `mountHeight`. Artifact-safe by
  construction: the host already occupies a clear wall span, so the art never overlaps a door/window.
  `wall-art` def gains `noClip` (wall-mounted → no floor collision); seeded art tint keeps rooms
  distinct; excluded from the surface-prop budget/cap. GPU-verified (the move-in flat now hangs 3
  pieces; one screenshot-checked as correctly mounted at eye height). New unit tests + existing decor
  suite green (26). Closes the last open RD-408 item (the wall pass).

## IO-004 + IO-005: import blob-URL + scene-graph cleanup (v0.8.0.36)

- **IO-004** — `furniture/upload/persist.ts` now wraps the base + LOD object-URL creation through the
  store commit in a try/catch: if anything throws after the URLs are created (e.g. `addUserFurniture`
  failing), it revokes them and drops the LOD-registry mapping before re-throwing, instead of orphaning
  multi-MB blob URLs for the page lifetime. (Ownership is handed off only once the def commits.)
  Unit-tested (forced commit failure → all created URLs revoked).
- **IO-005** — `furniture/convert/convertModel.ts` disposes the intermediate three.js scene graph (a
  new tested `disposeObject3D`: geometry + materials + their textures) in a `finally` after the GLB is
  exported, so a bulk import of thousands of models releases CPU buffers/decoded textures
  deterministically instead of leaving them for GC. Unit-tested with dispose spies.

## MOD-PLANINSPECTOR-SPLIT: split the monolithic plan inspector (v0.8.0.35)

- Behaviour-preserving refactor of `ui/floorplan/PlanInspector.tsx` (**1441 → 524 lines**): extracted
  the room / wall / opening selection branches into `ui/floorplan/editor/inspector/RoomInspector.tsx`,
  `WallInspector.tsx`, `OpeningInspector.tsx`, with the shared helpers (`Num`, `CeilingControls`,
  `DeleteBtn`, `NameField`, `ActBtn`) in `editor/inspector/shared.tsx`. `PlanInspector` stays the thin
  dispatcher (selection resolution, defaults/multi-wall/note/dim/polyline branches, minimize/footer
  chrome) and renders the three extracted components; `Num` is re-exported so existing imports keep
  working. Verbatim markup/store-calls/flag-gates — verified: tsc + biome clean, 131 floorplan tests
  pass, and the wall + room inspector panels render identically (screenshot-verified in the 2D editor,
  Pro mode). Closes MOD-PLANINSPECTOR-SPLIT — both monolithic-UI splits in TASKS are now done.

## IO-008: optimize worker `messageerror` handler (v0.8.0.34)

- `furniture/optimize/runOptimize.ts` now sets `worker.onmessageerror` (alongside `onerror`) to fail
  every in-flight call to the direct fallback and retire the worker. A reply that can't be
  structured-cloned fires `messageerror` (not `error`); without this handler that call's pending
  promise never resolved — hanging the import and wedging a bulk-import pool slot forever.

## IO-009 + IO-010: model-import format detection + multi-MTL (v0.8.0.33)

- **IO-009** — `convert/formats.ts` `detectModelFormat` now recognises **ASCII FBX** (the `; FBX`
  comment header), so a mis-extensioned ASCII FBX routes to the FBX loader instead of throwing an
  opaque parse error in the wrong loader. (Zip/XML magics confirm a family but can't disambiguate
  3mf-vs-usdz or dae-vs-gltf, so the extension stays authoritative there.)
- **IO-010** — OBJ import now resolves **every** `mtllib` reference, not just the first token of the
  first line: pure `parseMtllibNames` collects all files across all `mtllib` lines (de-duped,
  basename-lowercased) and `loadToObject` loads + merges their material definitions, so an OBJ that
  splits materials across multiple `.mtl` files keeps them all instead of silently rendering grey.
- Unit tests for both (ASCII-FBX-as-.obj detection; multi-line/multi-file/de-dup mtllib parsing).

## IO-001 + IO-003: import/export robustness (v0.8.0.32)

- **IO-001** — `materials/upload/persist.ts` now gates the **source** file size against
  `MAX_IMAGE_BYTES` (16 MB) **before** `normalizeTextureFile` runs the full decode + WebP re-encode,
  so an oversized source (e.g. a 150 MB TIFF, or a 4096² EXR → ~268 MB of intermediate floats) is
  rejected up front instead of after the allocation the cap exists to prevent. Unit-tested (a >16 MB
  source is rejected and `normalizeTextureFile` is never called).
- **IO-003** — `ui/openSceneExport.ts` + `ui/viewInAr.ts` now schedule `URL.revokeObjectURL` in a
  `finally`, so an anchor `click()`/DOM exception can't leak the export/AR blob (a multi-MB GLB/USDZ)
  for the page lifetime.

## MOD-MOBILETOOLBAR-SPLIT: split the monolithic mobile toolbar (v0.8.0.31)

- Behaviour-preserving refactor of `ui/toolbar/MobileToolbar.tsx` (**1140 → 259 lines**): extracted
  each menu section into its own component under `ui/toolbar/mobile/` (View/File/Scene/Tools/Arrange/
  Design/Edit/Appearance/EditHome `Section.tsx`). `MobileToolbar` is now a thin rail/sheet shell that
  owns the local UI state + effects and picks the active section; each section reads its own
  store/feature-flag values (same selectors, same gates) and takes only the few shell-owned values as
  props. Same markup/classNames/labels/`data-tour`/flag gates — verified: tsc + biome clean, 25 toolbar
  tests pass, and the mobile sheet renders identically (View + Scene sections screenshot-verified in
  Simple mode). Closes MOD-MOBILETOOLBAR-SPLIT.

## docs: reconcile RD-405 + RD-411 as shipped (v0.8.0.30)

- Verified against code that two items surfaced during the research-doc audit had already shipped:
  **RD-405** cheap-glass Fresnel + sky reflection (`getGlassMaterial` cheap branch sets `ior` +
  `envMapIntensity`, explicit `(RD-405)` comment) and **RD-411 / PHOTO-SSAA-EXPORT** (the PNG export
  in `ScreenshotController` already renders at 2× and box-downsamples via `ssaaDownsample.ts`).
  Removed both from `TASKS.md` and deleted the now-fully-shipped `rd405-glass-fresnel-plan.md`.
  Trimmed RD-408 to its one genuinely-open piece (wall-art / gallery clusters).

## docs: prune fully-shipped research docs; unify open items into TASKS (v0.8.0.29)

- Deleted 9 `docs/research/` audit/plan docs whose every actionable item shipped (verified
  against CHANGELOG + code): correctness-bug-hunt (BUG-001…014), security-review (SEC-001…003),
  recent-work-code-review (REV-001…006), mobile-a11y-ux-audit (UX-001…009), material-microdetail-plan
  (MAT-001…006b), pc2-cam-dof-lens-plan (PC2-CAM-DOF-LENS + raster DoF), cc0-model-catalog-integration-plan
  (remoteFurniture flag + footprint seed), coohom-sh3d-parity-backlog (all shipped bar SH3F/i18n,
  tracked in FEATURE_PARITY), rd412-sky-ibl-plan (procedural sky + HDRI IBL both ship). Surfaced the
  genuinely-open items from the *kept* docs (RD-405 glass fresnel, RD-408 decor tail, RD-411 SSAA
  export, IO-pipeline robustness, SLOT configurator, MOD-* splits) into `TASKS.md` so the backlog is
  unified. Kept docs with real open work + the 4 reference docs (floor-plan specs, competitive analysis).

## docs: prune shipped/on-parity items from FEATURE_PARITY.md + PHOTOREALISM.md (v0.8.0.28)

- Per user instruction, removed all shipped/at-parity rows from the living parity matrices.
  **FEATURE_PARITY.md:** deleted the shipped gap-table rows (walkthrough video, AR, 8K render,
  IES, DoF lens, curved/slanting walls, sloping ceilings, baseboards, label rotation, batch
  render, scene export) and folded them into the "Already at parity (✅)" summaries; SH3D import
  row updated to partial (`.sh3d` ships, `.sh3f`/legacy open); roadmap trimmed to open gaps only.
  **PHOTOREALISM.md:** moved PHOTO-HDRI + PHOTO-KTX2 + PHOTO-PBR-MAPS(core) to the Shipped
  section, refreshed the stale pipeline-audit lines (HDRI IBL + KTX2 + bundled PBR now ship), and
  trimmed PHOTO-DETAIL-PROPS / PHOTO-BEVELS / PHOTO-PBR-MAPS / PHOTO-HDRI-PT to their open tails.

## PHOTO-PBR: upgrade bundled CC0 finishes to full PBR (v0.8.0.27)

- The 6 bundled Poly Haven finishes that shipped **albedo-only** (and so read flat) —
  `floor-carpet`, `floor-parquet`, `wall-beige`, `wall-brick`, `wall-plaster`,
  `wall-stone-brick` — now carry real CC0 **normal + roughness** maps (fetched from the Poly
  Haven CDN at 2K, resized to 1024² JPG to match the existing bundled maps). Sidecars +
  `index-assets` regenerated `generatedCatalog.ts`; all 12 bundled material finishes are now
  full-PBR. GPU-verified in walk mode: the brick/stone-brick walls show real block relief, the
  parquet shows plank detail, plaster stays correctly smooth — no z-fighting/seam/normal
  artifacts. (The runtime Poly Haven catalog already fetches 2K PBR materials in prod, and the
  procedural patterns remain the instant-load fallback — this closes the flat-finish gap.)

## docs: prune TODO.md + TASKS.md to open items only (v0.8.0.26)

- Per user instruction, removed every shipped/historical/reconciliation entry from `TODO.md`
  (402 → 52 lines) and `TASKS.md` (225 → 60 lines) — both now list only genuinely-open work, the
  environment-blocked items that can't be done in a pure-client repo, and a short risk/process
  note. `CHANGELOG.md` remains the source of truth for what shipped.

## PHOTO-KTX2: real in-browser KTX2/UASTC texture encoder (v0.8.0.25)

- Un-stubbed `lib/ktx2encode.ts` — the model-optimize path now actually emits GPU-compressed
  KTX2/UASTC textures (Zstd-supercompressed, mipmapped) when the import dialog's *Maximum
  compression (KTX2)* toggle is on, the biggest runtime-VRAM win on integrated GPUs. Encoder is
  the Basis Universal WASM build from `ktx2-encoder`; its glue + wasm are **self-hosted** under
  `public/basis/` (vendored by `scripts/copy-decoders.mjs` alongside the Draco/transcoder, and the
  explicit `jsUrl`/`wasmUrl` keep it off the package's default upstream CDN — fully offline,
  prod-safe). `isKtx2EncodeAvailable()` now returns `true`, so `optimizeGlb`'s `ktx2` opt-in
  re-encodes textures instead of falling back to WebP; degenerate input still falls back cleanly.
  End-to-end tested (raw RGBA8 → valid KTX2 magic) + guard tests. Tail: per-channel tuning
  (normal maps want `isNormalMap`/no perceptual transfer — currently every map is perceptual UASTC,
  high-quality lossy and visually safe).

## F3/R-HDRI · PHOTO-HDRI: CC0 HDRI environment lighting (v0.8.0.24)

- Curated CC0 HDRI library (`scene/lighting/hdriCatalog.ts`, 5 Poly Haven `.hdr` served
  CORS-direct from the Poly Haven CDN — neutral/warm studio, clear sky, golden hour, soft
  dawn). Selecting one (Scene menu → **Environment lighting**, desktop + mobile) swaps the
  procedural Lightformer probe for the captured HDRI as `scene.environment` IBL via drei
  `<Environment files>`; the default (`hdriId === null`) keeps the exact procedural look, so
  there's **no out-of-box change**. State `hdriId` + `setHdri` (uiSlice, persisted in editorPrefs),
  `hdriEnvironment` pro flag, Medium+ (needs IBL). GPU-verified: the venice_sunset HDRI loads
  over the network and lights the flat. Catalog + flag + slice tests (both modes). Closes F3/R-HDRI
  + PHOTO-HDRI; F4's HDRI-compare coupling is now an optional follow-up.

## PARITY-8K: 8K still-render preset (v0.8.0.23)

- Added an **8K · 7680×4320** preset to `HqRenderModal` resolutions. The HQ path-tracer
  already renders tile-by-tile (`hqRenderSession` `tracer.tiles`, scaled to resolution) and
  takes arbitrary dimensions, so 8K renders responsively (real GPU + patience). Closes PARITY-8K.

## PHOTO-PT-TUNE complete (stableNoise) + render-pipeline reconciliation (v0.8.0.22)

- **PHOTO-PT-TUNE** finished: added `stableNoise: true` to `HqTracerConfig` + applied it in
  `hqRenderSession` so the progressive still's speckle pattern doesn't swim as it converges
  (the rest — bounces/transmissiveBounces/filterGlossyFactor/MIS/minSamples — were already
  tuned). Removed from the backlog.
- Verified-shipped reconciliations: **PARITY-DENOISE** ships via the edge-preserving
  `DenoiseMaterial` bilateral pass on the HQ blit (PHOTO-DENOISE downgraded to a [~] OIDN-upgrade
  nicety); **PARITY-8K** — the HQ render is already tiled (`tracer.tiles`) and takes arbitrary
  dimensions, so only an 8K preset in `HqRenderModal` remains ([~]).

## Reconcile shipped GPU-lighting items: RZ7 + RZ2 transmission (v0.8.0.18)

- **RZ7** (PCF/penumbra soft shadows on Medium+) verified shipped & removed: the main
  Canvas uses `PCFSoftShadowMap` with `shadow-radius` penumbra (`SOFT_SHADOW`) and a
  per-tier `shadowMapSize` (0 on Performance, >0 on Medium+) — the complete feature.
- **RZ2** glass transmission verified shipped: `getGlassMaterial` sets `transmission`/
  `ior`/`thickness` on the transmission tiers (High/Max); the Maximum-tier render is
  healthy on the real GPU. Trimmed RZ2's tail to the lone remaining bit (room-editor glass).

## MAT-006b: triplanar (world-scaled) UVs on sloped walls (v0.8.0.17)

- New pure `materials/triplanar.ts` (`dominantAxis`/`projectUv`/`triplanarUv`) —
  per-triangle dominant-axis world projection so a tiled finish on non-planar wall
  geometry reads at a constant world scale with no stretch (6 tests).
- Wired into `PlanShell` `SlopedWallMesh` behind a new `triplanarWalls` pro flag:
  the sloped-wall prism now carries world-scaled UVs (it previously had none), making
  it correctly texture-ready. The current solid-colour fallback ignores UVs, so this is
  a non-regressing texture-readiness change (closes RD-406's remaining triplanar half).
  Flag tested in both Simple & Pro.

## Backlog reconciliation: verified-shipped photoreal items removed (v0.8.0.15)

Cross-checked three "open" TODO table rows against the code and confirmed they
already ship in the product (removed from the backlog):
- **RD-402** (roughness/AO/normal micro-variation for stone/tile/concrete/plaster +
  brushed-metal) = the shipped MAT-001…004 surfaces (`stoneSurface`/`tileSurface`/
  `plasterSurface`/`metalBrush`) wired through `patterns/*` + `furnitureMaterials.ts`,
  plus CONCRETE-PORES + BRUSH-AXIS.
- **RD-406** tile-repetition break-up ships (`worldUv.ts` `breakRepetitionPlane`,
  `tileBreakup` flag); its remaining half (triplanar) is tracked as the still-open MAT-006b.
- **RD-409** ships: fixture point lights use `decay={2}` (physically-correct inverse-square
  falloff) and per-fixture warm colour-temperature hexes (`lightEmitters.ts`).

## GAP-SUGGEST: one-click "Nudge apart" to widen narrow walkways (v0.8.0.14)

- `nudgeGapApart(aId, bId, currentGap, required=0.9)` (itemsSlice) uses the pure
  `layout/gapFix.ts` `gapFixVector` to compute the minimal widen to reach the ideal
  90 cm walkway, then splits it across both items (half each) along their
  centre-to-centre axis — one undo step; a no-op when the gap already clears.
- Clearance-checks panel now shows a **Nudge apart** action on each item↔item narrow
  gap (pro `gapSuggest` flag; not shown for wall gaps). Slice + pure-core + flag tests
  (both Simple & Pro).

## 2D plan-editor parity: ruler guides, chained dimensions, corner fillet/bevel (v0.8.0.13)

Three SweetHome3D/Coohom-style authoring aids for the 2D floor-plan editor, all
pro-tier (hidden in Simple), surfaced in the **Plan ▾** menu (desktop + mobile Tools):

- **PARITY-PLAN-GUIDES** — persistent ruler guides (`plan.guides:{axis,pos}[]`,
  additive schema). Pure `floorplan/snapToGuides.ts` snaps points per-axis within a
  threshold; the editor applies it in `pointerGrid` (a guide beats the grid) and renders
  dashed accent lines (click to remove). Store: `addPlanGuide`/`removePlanGuide`/
  `clearPlanGuides`. `planGuides` flag.
- **PARITY-DIM-CHAIN** — `floorplan/dimensionChain.ts` (chain/running/total). Store
  `addChainDimensions(levelId)` drops a row of dimension strings along the level's bottom +
  left baselines, one per wall-vertex position (ground dims untagged). `dimensionChain` flag.
- **PARITY-CORNER-FILLET** — `floorplan/cornerFillet.ts` (tangent/bisector geometry) +
  `floorplan/filletWalls.ts` `applyWallFillet` trims two connected walls to their tangent/
  setback points and inserts a curved (round) or straight (bevel) connecting wall. Store
  `filletCorner`; editor shows **Round/Bevel corner** when exactly two connected walls are
  selected. `cornerFillet` flag.

55 pure-geometry tests + slice/flag tests (both Simple & Pro). GPU-verified in the editor
(rounded corner + chain dimension strings render correctly). Also adds Vite dev `watch.ignored`
for large non-app trees (ikea/dataset/graphify-out/python) to stay under the inotify limit.

## Harness: real-GPU verification mode + backlog reconciliation (v0.8.0.12)

- **`SHOT_GPU=1`** in `scripts/shot.mjs` routes WebGL to the **real hardware GPU**
  (ANGLE `gl-egl` over the WSL D3D12 `/dev/dxg` passthrough — renderer confirmed
  `D3D12 (Intel(R) UHD Graphics)`) instead of the default SwiftShader, so GPU-only
  effects (DoF/bloom/soft-shadows/glass/HDRI/path-trace) can be visually verified.
  Documented in `docs/visual-verification-playbook.md` (new "Real-GPU mode" section).
- **Backlog reconciliation:** removed all completed items from `TODO.md` / `TASKS.md`
  (verified against this changelog) — the entire high-priority bug/perf block
  (BUG-001…014, PERF-001/002/004/005, UX-001/006, RD-403/411, all shipped PC2-*) plus
  the `[x]` parity/realism items. Kept only genuinely-open work (`[ ]`/`[~]`); caught
  an RD-409 ID-collision (the colour-temperature feature is still deferred, distinct
  from the shipped milky-render fix that reused the ID).

## Full user-docs audit — fix stale facts across the whole guide (v0.8.0.11)

- Audited every `docs/user/*.md` file against the current code (not just this branch's
  features) and corrected each factual error found:
  - **`importing-models.md`**: added `.3ds` to the convertible-format list (it's in
    `convert/formats.ts`).
  - **`importing-textures.md`**: added **KTX2** and **DDS** to supported formats, and corrected
    the decode-and-re-encode list (KTX2/DDS are the true exotic cases; BMP decodes natively).
  - **`design-tools.md`**: Budget panel tab is **Saved** (not "Saved collections"); removed the
    stale **sample-quality** step from Render compare (the modal is now a near-instant raster
    capture with no samples picker).
  - **`room-editor.md`**: the exit button is labelled **"Exit room"**, not the room name (the
    room name lives in the adjacent dropdown).
  - **`tips-and-faq.md`**: **five** themes, not four (`THEME_NAMES` has 5).
  - **`lighting-and-time.md`** / **`walkthrough-and-sun-study.md`**: marked the **sun-direction
    compass** and **Sun study** as **Pro** (both are pro-tier and hidden in Simple mode).
- The remaining docs (`finishes-and-materials.md`, `navigating.md`, `getting-started.md`,
  `index.md`, `themes-and-appearance.md`) verified fully accurate, with all internal doc links
  resolving.

## User-docs sweep — sync guide to the Canva-feature work (v0.8.0.10)

- Full audit of `docs/user/*.md` against current code; fixed every stale/wrong claim left over
  from the multi-select / floor-plan editor work. **`floor-plan-editor.md`**: removed the
  defunct **Room finishes** dropdowns (finishes are per-room-3D-editor only now) → renamed the
  section to *Room name & label position*; rewrote **Levels (storeys)** from the old header
  tab-strip to the new bottom-left **floor dropdown** (topmost-first; rename/reorder/add/
  duplicate/remove); documented the **Labels** view toggle, the now-**editable** dimensions
  (endpoint handles + Length/A/B fields + delete), the right-click **context menu**, the
  multi-select **bounding box + rotation ring + corner resize handles**, the canvas **compass +
  dynamic scale bar**, the desktop-**expanded** Properties panel, and dropped the stale "levels"
  reference from the phone Tools sheet.
- **`keyboard-shortcuts.md`**: undo/redo are now **always active** (per-room editor, 2D plan
  editor and overview share one history) — moved to *General* with a note, out of the
  per-room-only *Editing a selection* table. **`placing-furniture.md`**: added the layer-order
  context-menu moves (Bring to front/forward, Send backward/to back) and the 2+ selection
  **corner resize handles** (shared with the 2D editor).

## Floor selector → bottom-left dropdown, renamable + reorderable (v0.8.0.9)

- Replaced the toolbar's level-tab strip with a single **floor dropdown pinned to the canvas
  bottom-left** (`editor/LevelMenu.tsx`). It opens **upward** and lists floors **topmost-first**
  (shopping-mall directory / lift-panel order): switch, inline **rename**, **reorder** ▲▼,
  add, duplicate, and remove (upper storeys). The active floor shows on the trigger.
- New model/actions: `plan.groundName` (so the ground floor is renamable too), `renameLevel`
  (coalesced) and `moveLevel` (reorders an upper storey and re-stacks every elevation). Both
  round-trip through the schema; covered by new slice tests. Removed the now-unused `LevelTabs`.

## Condensed floor-plan editor toolbar — single row (v0.8.0.8)

- Reworked the desktop toolbar so it never spills to two rows: **Select** is a pointer icon,
  **Wall**/**Split** stay direct buttons, and the rest collapse into labelled dropdowns —
  **Room ▾** (Rectangle / Polygon / Auto), **Opening ▾** (Door / Window), **Markup ▾** (Text /
  Dimension / Polyline). Dropped the redundant "Floor plan" title, shrank the name field, made
  the `Total` readout `nowrap`, and set the bar to `flex-nowrap` with a horizontal-scroll fallback
  so it stays one row at any width. Verified one row (53px, no overflow at 1600px).

## Group resize in the 3D per-room editor (v0.8.0.7)

- **`ResizeGizmo`** mirrors the 2D corner-resize into the 3D editor: floor-plane corner handles
  around a 2+ selection (beside the rotation ring), dragging one scales every selected item
  uniformly about the opposite corner, collision-tinted, reverting via the pre-gesture snapshot
  on an invalid release (same `pendingEdit`/confirm-bar UX as `RotateGizmo`). Mounted in both the
  main and room-editor scenes.
- Extracted the scale math to a pure, unit-tested `scene/selection/resizeGizmoMath.ts`
  (`groupResizeFactor` + `resizedTransform`), now shared by the 2D editor and the 3D gizmo.
- Verified the 3D gizmo renders (bounding box + 4 corner handles + ring). Note: the headless
  harness cannot trigger an R3F gizmo *grab* — confirmed the existing rotate-ring knob is equally
  un-draggable headlessly — so the resize *behaviour* is covered by the shared unit tests + the
  behaviourally-verified 2D path that uses the identical helper.

## Group resize for the 2D multi-selection (v0.8.0.6)

- **Corner resize handles** on the unified multi-select bounding box (`scalingMulti`): dragging a
  corner scales **every** selected item uniformly by the same factor (`props.scale`/`scaleX/Y/Z`)
  and repositions them about the **opposite corner**, so the whole selection grows/shrinks as a
  block (Canva parity). Collision-checked all-or-nothing; locked items skipped; one undo step.
  Verified headlessly: a corner drag scaled both items by `×2.162` and spread their separation by
  the same `×2.162`.

## Mobile compass/scale-bar to bottom-right + multi-select verification (v0.8.0.5)

- **Mobile compass + scale bar moved to the canvas bottom-right** (same as desktop) — the
  expanded inspector bottom-sheet may overlap them, which is acceptable.
- Added `scripts/scenarios/plan-multiselect-transform.json` — a headless journey that shows
  furniture, selects two items, group-drags them into open floor, then rotates them via the ring
  handle, asserting both move/rotate by an identical delta. Verified: multi-drag `Δ=[0,9.35]` on
  both, multi-rotate `Δ=-1.8326 rad` on both (equal), with collision rejection all-or-nothing.

## 2D plan multi-select transforms + unified handles (v0.8.0.3)

Brings the 2D floor-plan editor up to the 3D editor's multi-select parity (Canva-style):

- **Multi-drag**: dragging any item that's part of a multi-selection now moves the whole
  selection rigidly by the same delta (collision-checked as a group; locked items skipped),
  mirroring the 3D `DragController`. Clicking an item already in the selection no longer
  collapses the selection to just that item.
- **Unified selection border + rotation ring**: when 2+ furniture items are selected, a single
  dashed bounding box encloses them all and a rotation ring with a top handle rotates the whole
  selection about its centroid (`rotatingMulti`, reusing the unit-tested `rotateGizmoMath`
  `enclosingRadius` / `rotatePointAround` / `computeRotation`).
- **Flip / rotate all** already apply to the whole selection in 3D (keyboard F / R) and now also
  via the dynamic context menu in both editors.

## Wall-lock connected components, editable dimensions, movable room outlines (v0.8.0.2)

- **Locking respects wall connectivity.** A locked wall is now pinned: `moveWallVertex`
  / `moveWallTo` no-op on a locked target and never drag a locked wall's endpoints even
  when a connected wall is moved — the moved wall detaches from the locked corner instead.
  Covered by new slice tests.
- **Dimensions are editable.** New `updateDimension` action + draggable A/B endpoint
  handles on the selected dimension, and an inspector with editable Length + A/B endpoint
  fields (in addition to the existing select + delete).
- **Room outlines move correctly.** Dragging a free-form (polygon) room now translates its
  absolute polygon points along with the origin, so the whole outline moves (previously only
  the origin shifted, leaving the polygon behind).

## Always-active undo/redo, dynamic context menu, z-order (v0.8.0.1)

- **Undo/redo keyboard shortcuts are always active** — moved Cmd/Ctrl+Z and
  Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y from the room-editor-scoped handler into the
  always-on global handler, so they now work in the 2D floor-plan editor and the
  overview too (suppressed only behind a modal or while typing). Verified an
  add-wall → undo → redo cycle in the plan editor.
- **Dynamic right-click context menu** (`contextMenu` flag) — `ContextMenu` is now
  target-aware: it rebuilds its actions from what was right-clicked + the current
  selection. The 2D plan editor wires a canvas `onContextMenu` that overrides the
  browser menu and opens operations for the selected element — walls (reverse /
  split / join / duplicate / lock / delete), rooms (duplicate / delete), openings,
  dimensions / notes / polylines (delete) — and furniture keeps its rich menu.
- **Layer order / z-order** (`layerOrder` flag) — `reorderItems(ids, move)` +
  pure `state/zorder.ts` `reorderByIds` give Canva-style Bring to front / Bring
  forward / Send backward / Send to back for the selection (render order = array
  order), surfaced in the furniture context menu.

## Floor-plan editor fixes — labels, finishes, naming, inspector, scale bar (v0.8.0.0)

First wave of the Canva-style editor parity work:

- **Labels toggle now controls room name + dimensions.** Added a "Labels" toggle to the floor-plan
  editor's View menu (`showRoomLabels`, on by default); room name + area/perimeter callouts were
  previously drawn unconditionally (sized only by room area) and ignored every toggle. Off now hides
  them everywhere, even for the selected room.
- **No finishes in the floor-plan editor.** Removed the Floor / Wall / Ceiling **finish** pickers from
  the room properties in `PlanInspector` — material choices belong to the per-room editor only, so the
  plan stays a structural/layout view. Ceiling **height** (geometry) stays.
- **New walls/windows/doors are auto-named by their room + a unique id.** `roomWallNames.ts` gains
  `roomForWall`/`newWallName`/`newOpeningName`; `floorPlanSlice.addWall`/`addOpening` now stamp
  `<room> wall <id>` / `<room> door|window <id>` when the element lands on a room boundary (a
  caller-supplied name still wins; free-standing elements keep the generic default).
- **Properties inspector opens expanded on desktop** when clicking a wall/window/door (it still starts
  minimized on mobile to avoid covering the plan).
- **Compass pinned to the canvas, with a dynamic scale bar below it.** The compass HUD now lives in a
  relative canvas-column wrapper (bottom-right of the canvas viewport, not the whole editor frame over
  the docked inspector). A new zoom-aware scale bar (`editor/scaleBar.ts` `chooseScaleBar`, pure +
  unit-tested) sits beneath it as a real-world reference.

## Catalog/inspector text polish (v0.7.1.1)

Small consistency fixes from a screenshot review:

- Removed the redundant **"Drag onto the floor · R rotates"** hint from the catalog footer; the
  footer's action buttons (Custom size / Design / Upload) now align to the right (`.cat-foot`).
- Fixed the oversized inspector array **section titles** (Linear / Radial / Path array, Fill room):
  their intended small-label rule (`.act-array > span`) only matched a direct child, but each title
  span is nested in the header's flex row, so it fell back to the base font size. Extended the rule
  (`.act-array > div:first-child > span`) so all four titles use the intended `--t-xs` size,
  harmonising the panel text.

## Mobile input polish — no focus-zoom, themed dropdown + colour picker (v0.7.1.0)

Replaces the off-brand native phone controls and fixes the oversized mobile field text:

- **iOS focus-zoom fix without the 16px bump.** Removed the mobile `font-size: 16px` rule (which made
  fields look huge) and added `src/controls/iosZoomGuard.ts` — it toggles viewport `maximum-scale=1`
  only while a text field is focused (restored on blur), so iOS no longer zooms in on focus yet
  pinch-zoom stays available the rest of the time. Fields render at their normal small size again.
- **Custom `Select`** (`src/ui/controls/Select.tsx`) replaces every native `<select>` (~33 sites):
  an `.input`-styled trigger that opens an anchored `Popover` on desktop / a titled `Modal` sheet on
  mobile, with full listbox keyboard + ARIA. No OS dropdown wheel; small fields no longer trigger the
  focus-zoom.
- **Custom `ColorPicker`** (`src/ui/controls/ColorPicker.tsx`) replaces every native
  `<input type="color">` (~22 sites): a swatch trigger opening a saturation/brightness pad + hue bar +
  hex field, plus the shared theme/recommended swatch rows and a recent-colours row. Conversions use
  the pure `colorConvert` (HSV) + `materials/colorHarmony` (`normalizeHex`) helpers.

## Editor UI interaction fixes — confirm-to-commit, left catalog dock, room-scoped grid/measure (v0.7.0.0)

A batch of per-room-editor and floor-plan-editor interaction fixes:

- **Tick/cross confirmation for edits.** Moving, rotating or placing furniture now resolves to a
  pending change with a floating **Apply change?** bar (✓ commit / ✗ cancel; Enter / Esc). New
  `placementSlice` `pendingEdit` state + `EditConfirmBar` (`src/ui/EditConfirmBar.tsx`). A cancel
  restores the pre-edit `items` reference (transform) or removes the just-placed item (placement)
  and drops the dead history step. `DragController`/`RotateGizmo` raise a pending edit on a valid
  change; `usePlacementController` does so on a commit (stamp/shift keep the old rapid path).
- **Mobile long-press to place.** Press-and-hold a catalog card on touch → arms placement, hides the
  catalog, and the ghost follows the finger; the lift commits to the tick/cross confirmation and the
  catalog reappears once the placement resolves (committed / cancelled / aborted).
- **Desktop catalog is a persistent left sidebar** (mirrors the right-docked inspector): a
  `dock-panel-left` opens a `--left-rail` so the canvas takes the remaining width and the centred
  toolbar re-centres over it; the catalog only closes via its ✕ / the catalog button.
- **Blank-space click deselects** (3D `onPointerMissed` + 2D editor empty-canvas tap), closing the
  inspector / finish-picker; the catalog stays open.
- **Per-room editor grid** fades in only while moving/rotating/placing and is masked to the room
  (its polygon, else its footprint rects) instead of the whole apartment floor.
- **Furniture is bounded to the room** while dragging (clamped to the room rects, IKEA-style).
- **Measurements are room-scoped** in the editor (room label + pinned callouts), and the measurement
  `<Html>` overlays drop to a canvas-level z-index so panels/toolbars sit above them.
- An orbit-drag on a room floor no longer triggers the "Enter room?" confirm (click-vs-drag guard).
- Mobile inspector drag-handle swipe-down collapses the panel; the light **Brightness** slider now
  uses the shared `.slider` style.

## Curtains & blinds get an opacity / light-blocking axis — sheer → blackout (v0.6.0.27)

Curtains and blinds gain an **Opacity** control, separate from the weave (any fabric can be loose or
blackout-lined): `Sheer` (translucent, daylight diffuses through), `Light-filtering`, `Room-darkening`
(default), or `Blackout`. It drives **both** the rendered transparency of the cloth **and** how much
daylight it actually blocks — a drawn **blackout** curtain now blocks essentially all light (≈0.02
transmission) where the old model floored at 0.05, while a sheer only softens it (≈0.45). A new pure
`materials/draperyOpacity.ts` maps each level to a visual opacity + a daylight-transmission floor,
shared by the primitives and the lighting model; `windowLightModifiers.windowAttenuationFactor` now
blocks per-treatment (stacked layers combine multiplicatively) instead of the old binary opaque/sheer
blend. `Sheer` was removed from the **weave** enum (it's now an opacity, not a weave); the legacy
`material: 'sheer'` weave still maps to the sheer opacity for back-compat. Verified: four same-colour
curtains from sheer (see-through) to blackout (solid) render distinctly.

## Curtains & blinds are customizable fabric surfaces — weave + pattern + colour (v0.6.0.26)

Curtains and blinds can now be customized like surfaces, but **fabric-only** (drapery is cloth, so
wood/stone/metal never apply) while reusing the shared procedural **pattern** set:

- A new **Fabric** weave control on both — `Cotton` (default), `Linen` (matter/coarser), `Sheer`
  (translucent — it now renders see-through AND drives the window light-filtering via
  `windowLightModifiers`), or `Velvet` (sheen-rich pile).
- **Pattern** (Plain / Striped / Herringbone / Checkered / Plaid / Dots) now applies to **blinds**
  too (previously curtains-only), reusing the existing tone-on-tone fabric patterns; the curtain
  pattern control was relabelled `Pattern` and its colour `Colour` (was the ambiguous "Fabric").
- A shared `materials/furnitureMaterials.ts:getDraperyMaterial(kind, color, pattern, doubleSided)`
  centralizes the fabric-only mapping; `getFabricMaterial` gained an `opacity` arg (sheer) and
  `getVelvetMaterial` a `doubleSided` arg (draped velvet seen from both sides) — both cache-keyed,
  existing callers byte-identical.

Verified: a row of curtains in cotton-stripe, linen-plaid, translucent sheer, and velvet renders
distinctly, plus a dotted roller blind — all fabric, patterns reused.

## Per-room editor walls fade like orbit mode (translucent reveal) (v0.6.0.25)

The per-room editor's walls now use the **same camera-facing wall reveal as orbit mode** instead of a
binary show/hide: a wall fronting the camera (between you and the room) **fades to translucent** so you
always see into the room, while far walls stay opaque and grazing walls go partially translucent —
matching the main scene exactly (it reuses the pure `wallRevealFactor` + the `wallRevealMode` /
`wallReveal` quality settings, so it's translucent by default). A new shared `useWallReveal` hook drives
both `RoomShell` (default flat) and `PlanRoomShell` (custom plans); because every wall of an isolated
room shares one finish material, it fades via a **per-mesh material clone** (restored when opaque) so
only the correct walls fade, and it publishes each wall's opacity (`setWallOpacity`) so the room's
windows/doors fade with their wall. The old binary `wallFacing` helper (+ test) is removed. Verified:
entering a room shows the furniture through faded near walls.

## Curtain length toggle — floor-to-ceiling or sill-length (v0.6.0.24)

Curtains gain a **Length** control: `Floor-to-ceiling` (default, hem to the floor) or `Sill length`
(hem stops just below the window sill). Both hang from the same rod (the `height`); sill-length uses
the placement-stored window sill (`sillY`, set by `windowFixtureProps`) to place the hem, falling back
to a typical ~0.9 m sill for a hand-placed curtain. Verified side-by-side: the sill curtain floats above
the floor (floor visible beneath) while the floor-to-ceiling one reaches the floor.

## Realistic curtains (wavy, floor-to-ceiling) + raise/lower blinds, window-sized (v0.6.0.23)

Reworked the window treatments so they look and behave like the real thing:

- **Curtains** are now **soft draped fabric with wavy vertical folds** (a displaced sheet, gathered
  tighter at the rod and fuller at the hem) instead of a flat board, hang **floor-to-ceiling**, and
  **open fully clear of the window** — the two panels gather into narrow bunches at the ends (centre
  exposed) and meet in the middle when drawn, easing smoothly between via `drawAmount`. The fabric is
  double-sided so it reads from inside the room and through the glass.
- **Roller / venetian blinds** now **raise and lower with a smooth animation** (new `lower` control,
  0 = rolled up / window exposed, 1 = lowered / covered); the fabric panel (or slat stack) eases its
  drop each frame, and a lowered blind attenuates window light like a drawn curtain.
- **Placement sizes each fixture to its window** (`windowFixtureProps`): curtains span **wider than the
  glass** and **floor-to-ceiling** (to the room's ceiling height); blinds size **slightly wider than the
  window** with a drop that covers it — so a snapped treatment fits the opening instead of a fixed
  catalog size.

Verified (orbit + top views): a drawn curtain covers the window with visible folds floor-to-ceiling; an
open one bunches to two side gathers leaving the centre clear; a blind lowers to cover and rolls up to
expose the window. Unit tests cover `windowFixtureProps` sizing (wider-than-glass, floor-to-ceiling,
clamp, blind drop, non-fixture → no-op).

## Window fixtures snap onto the nearest window on placement (v0.6.0.22)

Window-bound fixtures (curtains, roller blinds) now **place only on windows** (WINDOW-FIXTURE). A new
pure helper `furniture/placement/windowSnap.ts:snapToNearestWindow(walls, openings, dropPos)` resolves a
dropped fixture onto the nearest window opening — landing it flush on the wall, centred on the window,
facing the room side dropped toward (the wall normal toward the drop point); it returns `null` when the
plan has no window. The placement controller (`usePlacementController`) snaps both the click- and
drop-commit (`windowBound` defs bypass the floor-collision gate and snap; no window → an info toast and
no add), and the `PlacementGhost` preview snaps the ghost transform onto the window while keeping the raw
drop point in `ghostWorld` so the commit re-derives the same snap (incl. facing). Window *grilles* remain
a customizable window opening `style` (`grille`/`louvre`), so no redundant grille fixture is added.
Verified: a curtain dragged from the catalog lands on the window, oriented into the room. (Unit:
`windowSnap.test.ts` — centre/facing/nearest-pick/no-window cases.)

## Window fixtures are static (no move/rotate/flip) (v0.6.0.21)

Window-bound fixtures (curtains, roller blinds) are now flagged `windowBound` and treated as **statically
placed**: the inspector hides the Transform section and the Rotate / Flip H / Flip V actions, and
dragging them in the scene is blocked (they stay selectable — for customising size/colour/texture/draw —
and keep Duplicate / Lock / Delete). Verified: the curtains inspector shows Properties (incl. the Draw
slider) + Size + Duplicate/Lock/Delete only, no transform controls. (Still to come: constraining *new*
placement to snap onto a window — today they're flagged + non-movable once placed.)

## Curtains draw with a smooth animation + graduated light filtering (v0.6.0.20)

Curtains now **draw open/closed with a smooth animation** and let exterior light **filter in as they
open**. A continuous `drawAmount` (0 = open/tied-back, 1 = drawn/closed) replaces the old binary
open/drawn toggle: the `Curtain` primitive eases its pleats between an evenly-gathered cover and two
bunched side panels each frame (holding the demand render-loop open only while moving), and the
window-light attenuation is now **graduated by the same value** (`curtainDrawAmount`) — a half-drawn
curtain dims half, a fully open one lets all the daylight through. Legacy `style: 'open'|'drawn'` maps
to drawAmount 0/1 for back-compat. Verified: closed spreads across the window, open bunches at the ends
with the centre clear.

## Orbit "dollhouse" lighting in daytime (v0.6.0.19)

Orbit view removes the ceiling, so simulating the exterior sun there (hard shadows, day/night exposure
grading, bloom) is inaccurate — light pours straight in from above. Now, in **orbit + daytime + interior
lights not forced on**, the view renders as a flat, uniform **dollhouse**: even bright fill, no
directional sun, no sun shadow, no bloom, neutral exposure. The full simulation is reserved for **walk
mode** (proper interior view) and **orbit at night** (interior fixtures light the rooms as before).
Material quality is untouched — IBL reflections, sheen/gloss and PBR detail keep working in orbit per
the graphics tier, so a glossy sofa still reads glossy. Pure predicate `isDollhouseLighting` (unit-tested)
drives `Lighting` (sun/fill/exposure) + `EffectsImpl` (bloom). Verified: orbit-day flat & uniform,
orbit-night interior-lit, walk-day full sim with ceiling + sun.

## Theme-palette swatches on the remaining colour pickers (v0.6.0.18)

Completes the master-palette coverage so **every** design colour picker offers the apartment theme +
recommended-blend rows: the floor-plan editor's cove-light colour and per-wall baseboard colour, the
mobile plan wall colour, the parametric-furniture custom-colour control (bookshelf/wardrobe/kitchen),
the GLB designer's per-shape colour, and the material-upload swatch. (The GLB designer's per-mesh
recolour *list* keeps a plain picker — two swatch rows per mesh would clutter that authoring list.)
Also confirmed the 2D floor-plan editor already uses the docked-sidebar layout (a flex row: canvas
`flex-1` + a full-height `PlanInspector` column), so it needed no change — only the 3D per-room editor
had the floating panel that v0.6.0.17 docked.

## Docked inspector sidebar + canvas reflow (desktop) (v0.6.0.17)

On desktop the right-hand inspector / finish picker is now a **full-height docked sidebar** instead of
a floating panel: when it's open the **3D canvas reflows** to fill the remaining space to its left
(rather than being overlaid), and the **top toolbar re-centres** over the canvas area — centred over
the full width when no panel is open, centred over the canvas when it is. The nav cluster + HUDs ride
the canvas edge too. It's pure CSS: the scene, toolbar and HUDs live in a `.stage-area` that shrinks
by a `--right-rail` width, opened purely by `:has(.dock-panel)` (the panels mount only when open, so
no JS state). Mobile is untouched — the panels stay bottom-sheets (the dock rules are gated to
≥ 641px). Verified in all three desktop states (no panel / finish docked / inspector docked) + mobile.

## Universal resize for parametric furniture (v0.6.0.16)

Every built-in (parametric) furniture piece can now be **freely resized** — closing the last size gap
(previously only GLB/uploaded models had a scale, and only some parametric items exposed width/depth).
The inspector gains a **Size** section for parametric items mirroring the GLB one: a uniform scale
slider, per-axis Width/Height/Depth sliders (uncheck "Keep proportions"), and exact metre W/D/H entry
that back-solves the scale. The scale rides `props.scale`/`scaleX/Y/Z`, applied as a render-group
scale in `Furniture` about the floor-anchored, footprint-centred origin — and `itemFootprint` already
folds the same props into collision, so the rendered size and the collision footprint stay in lock-step
(no wrapper at 1×, byte-identical to before). Verified: a room's pieces scale to 1.6× and 0.5× cleanly,
staying on the floor.

## Apartment master colour palette + harmony blends on every picker (v0.6.0.15)

Set an overall **master colour palette** for the home (up to 5 colours) — every colour picker then
shows it as an **"Apartment theme"** swatch row, plus a **"Recommended"** row of up to 10 harmony
colours derived programmatically from the palette (complementary, analogous, triadic companions +
tints/shades/neutrals). The palette has a **per-room override**, and the recommended blends
**recompute live** whenever the master palette or a room override changes.

- Pure, deterministic harmony engine `materials/colorHarmony.ts` (hex↔HSL + `recommendedBlends`),
  unit-tested.
- `colorPaletteSlice` holds `masterPalette` + per-room `roomPalettes`; it's design data — persisted
  in the save schema + autosave watch-list (back-compat optional) and undoable. `effectivePalette`
  resolves override → master.
- Shared `ThemeColorRows` (the two swatch rows) is wired into every colour picker: the material
  composer, custom-colour picker, parametric `ColorField`, per-wall / door-leaf / window-tint and
  whole-plan wall colour, furniture/IKEA tint, item light colour, and the accent-wall picker. A
  `MasterPaletteEditor` (up to 5 slots + per-room override toggle + a live recommended preview) lives
  at the top of the finish picker.
- New `masterPalette` flag (Simple tier, default on); tested in both modes. Verified: a 3-colour
  palette renders the editor + a 10-colour harmony row, both updating live.

## Material editor: gloss/roughness parameter + rename materials (v0.6.0.14)

Closes the two deferred follow-ups from the custom material editor:

- **Gloss/sheen slider** — the composer gains a matte→glossy control (the
  material's roughness scalar, 5–100%). It rides the finish id as an optional
  `~<rough>` suffix (`compose:<pattern>:<#hex>@<scale>~<rough>`, omitted at the
  default for back-compat) and is applied in `buildMaterial` over any roughness
  map, so the same texture+colour can read flat or polished. Works for composed
  and tinted finishes.
- **Rename any user material** — an inline pencil on every user/saved finish
  tile renames it. Saved (composed/tinted) materials rename via the
  savedMaterials slice; uploaded image-map materials rename in memory **and**
  write the new name back to their IndexedDB channel meta (`renameUserMaterial` →
  `renameUserMaterialBlobs`) so it survives a reload. New `Icon.Edit` line glyph.

The full editor now covers texture, colour, scale, gloss, save-with-a-name,
reuse, edit, rename, and remove for both composed and uploaded materials.

## Custom material editor: save named materials + scale parameter (v0.6.0.13)

The "Compose your own" finish tool becomes a real **custom material editor**: build a look from a
texture/pattern + colour, **tune the tile scale** with a new slider (0.25×–4×), then **name it and
Save** as your own reusable material. Saved materials appear in the floor/wall picker grids with a
"mine" badge, persist per-device (localStorage, like favourites), and can be **re-applied across
rooms, edited (the composer re-seeds from any saved/applied finish so you can tweak and re-save), and
removed** (the X on the tile). Applying one writes the underlying self-describing finish id to the
room, so the design still renders even where the saved name isn't present.

- `savedMaterialsSlice` (per-device): `saveMaterial`/`removeSavedMaterial`/`renameSavedMaterial`.
- The scale rides the finish id itself — `compose:<pattern>:<#hex>@<scale>` /
  `tint:<base>:<#hex>@<scale>` (suffix omitted at 1× → byte-identical to old ids, fully back-compat),
  parsed/clamped in `composeMaterial.ts` and multiplied into the resolved `uvScale`.
- `useMaterials` synthesises a named def for each saved entry (resolving a tint's base from the
  catalog) so it shows in the picker; the composer's Save/Update reflects the *current* composition.
- New `saveMaterials` flag (Simple tier, default on); tested in both modes. Verified in a room: a
  saved hexagon composition and a saved fine-scaled blue tile both apply and render correctly.
- (Deferred follow-ups: roughness/sheen parameters for procedural finishes, and renaming uploaded
  image-map materials.)

## Per-room ceiling finish (v0.6.0.12)

Ceilings were the one surface with no colour/texture control — always plain white. Now every room's
ceiling can be **painted or textured** from the room inspector (a "Ceiling finish" picker beside
Floor finish and Wall finish), choosing any catalog material — paint colour, wood, plaster, concrete,
tile, or a CC0 texture. It works on the **default move-in flat** (`apartment/Ceiling.tsx` →
`RoomCeilingTile`) and **custom plans** (`PlanShell` → `PlanRoomCeiling`), stored per-room in the
finishes slice (`finishes.ceiling`, write-through to the plan's `room.ceilingFinish`), resolved by
`resolvePlanRoomCeiling` exactly like floor/wall. The finished plane reuses the cached catalog
material directly (no clone/mutation, so the procedural worker's texture hot-swap stays safe) and
faces down so it reads from below and stays culled from the orbit/dollhouse view. Gated by the new
`ceilingFinish` flag (Simple tier, default on); tested in both modes. (A *designed* tray/coffered
ceiling keeps the plain treatment for now — the flat ceiling every room has by default carries the
finish.) Verified in walk mode: a brick-red and a walnut-fluted ceiling both render correctly.

## Per-item opacity + hide-in-view (v0.6.0.11)

Any placed item can now be made **semi-transparent** or **hidden** from the 3D view — useful for
seeing behind a tall wardrobe, ghosting a piece while arranging around it, or temporarily removing
clutter without deleting. The inspector gains an **opacity slider** (15 %–100 %) and a **"Hide in 3D
view"** checkbox (gated by the `itemOpacity` Pro flag, default on). Opacity is applied safely by
cloning each rendered mesh's material per-item (so the shared/cached material other items reuse is
never mutated) and setting `transparent`/`opacity`/`depthWrite=false`; the original material is
captured per-mesh (`userData.__opacityOrig`) and restored when opacity returns to 100 % or the item
unmounts, and a short rAF window re-applies to async-loaded GLB meshes. Verified: a room's pieces
ghost to 30 % then restore cleanly to fully opaque with no leaked/disposed-material artifacts.

## Per-part CC0 material library for placed models (v0.6.0.10)

The per-part finish picker (Part finishes) now offers, besides a colour and the eight generic textures,
the whole **catalog material library** as a "Material library" option group — any `mat:<id>` finish
(oak, walnut, marble tile, terrazzo, concrete, carpet, …). Selecting one writes `finish:<part> =
mat:<id>`; the existing `FurnitureMaterialLoader` (which scans item prop values) auto-builds the
material and `getSurfaceMaterial` resolves + re-tiles it for furniture — so no loader change was needed.
Verified: a built-in pool table's parts re-skinned with `mat:floor-tile-marble` render the marble.

## Polygon rooms: add / remove vertices (v0.6.0.9)

A polygon (non-rectangular) room could already have its vertices **dragged**; now its shape is fully
editable in the 2D plan editor. Each edge gets a hollow **midpoint handle** — click it to insert a new
vertex there and immediately drag it (grow a rectangle into an L / bay). **Double-click** a vertex
handle to remove it (kept ≥ 3 so the room stays a polygon). Both reuse the existing
`rectFromVerts` + `updateRoom` commit path that keeps the room's bbox (origin/width/depth) in sync with
the polygon. Verified in the editor — a selected room shows its corner + midpoint handles.

## Openings on sloped walls (v0.6.0.8)

Doors and windows can now sit on **sloped** (shed/mono-pitch) walls — previously the editor refused them
and a sloped wall rendered as a solid prism. A sloped wall is now drawn as a rectangular **lower band**
(capped at its lower top height, via `wallBoxes` like a flat wall, so it cuts openings cleanly) plus the
triangular **upper wedge** above (the prism now takes a `baseY` so it starts at that min height — no
double-draw). `PlanShell` renders the door leaf / window glass on sloped walls, the editor places
openings on them (clamping head/sill into the lower band), and the 2D door-swing symbol + collision
gaps work too. (Curved walls already supported openings end-to-end.) Unit-tested (`wallBoxes` emits a
band capped at min-top and cuts the door gap) + render verified.

## Door & window styles (panel/flush/glazed · plain/grille/louvre) (v0.6.0.7)

Doors and windows were a single hardcoded type. Add a **Style** picker per opening (`openingStyles`,
simple tier) in the plan inspector: doors choose **Panelled** (default recessed panels) / **Flush**
(plain slab) / **Glazed** (frosted upper vision panel); windows choose **Plain glass** (default) /
**Safety grille** (vertical bars, HDB-standard) / **Louvre** (horizontal slats). New optional `style`
on `PlanOpening` (round-tripped through the save schema); rendered as pure procedural geometry by
`PlanDoorLeaf` (panel/glaze branches) and `PlanShell`'s `FadeWindow` (grille/louvre bars). Verified in
3D — perimeter windows show grille bars; tested in both Simple + Pro + schema round-trip.

## Furniture: precise rotation + numeric elevation entry (v0.6.0.6)

Rounds out the *position* axis. The Transform rotation field stepped in 15° jumps — now 1° (any whole
angle; the Rotate-90 button stays for quick turns). The elevation (off-floor height) control was a
slider with a read-only value — the value is now an editable metre field (clamped to floor→ceiling), so
a wall shelf / floating console can be placed at an exact height, not only dragged.

## Furniture: per-part texture/material (not just colour) + clear-revert fix (v0.6.0.5)

Extends the per-part GLB finish from colour-only to **textures**: each named part of a model can now be
re-skinned with Wood / Marble / Stone / Metal / Rattan / Concrete / Painted / Gloss (via
`getSurfaceMaterial`), or a flat colour — chosen from a per-part dropdown + swatch in the inspector
("Part finishes"). `getSurfaceMaterial` gained a `metal` branch (brushed satin) so the menu's metal
option isn't silently wood. The `finishOverrides` apply path in `GltfModel` now treats a value as a
hex colour (retint the part's own material, keeping its maps) or a material token (swap in the surface
material), and — fixing a latent bug — **captures each touched part's original material and restores it
each pass**, so clearing one finish among several reverts that part cleanly instead of leaving it on a
just-disposed clone. Verified end-to-end: a built-in pool table → all parts Marble (renders as marble),
then Clear → back to the original green felt + timber frame.

## Per-element colour: walls, doors & window glass (v0.6.0.4)

Extends the customizability push to the architecture (`elementColors`, simple tier, default on). Walls,
doors and windows had no colour control of their own — only a single plan-wide wall colour, and
hardcoded timber doors / cool glass. Now the 2D plan inspector exposes, per selected element:
**Wall colour** (overrides the plan-wide colour for that wall, with reset), door **Leaf colour** (the
recessed panels derive a darker shade), and window **Glass tint**. New optional `color` fields on
`PlanWall` + `PlanOpening` (round-tripped through the save schema); rendered by `PlanShell` (per-wall
`FadeWall`/`SlopedWallMesh`, glass-tint in `FadeWindow`) and `PlanDoorLeaf`. Because the first plan edit
forks the default home to a live plan, these reach every home. Verified: recolouring the interior walls
repaints them in the 3D top view. Tested in both Simple + Pro (simple-tier, on in both) + schema
round-trip.

## Furniture: per-part recolour for any GLB model (v0.6.0.3)

Continues the customizability push (colour/texture for custom uploads + 3D models). Built-in,
uploaded and Poly Haven GLB models could only be **tinted as a whole**; you couldn't repaint just the
legs or seat. Now the inspector lists each of a model's named material/mesh groups under **Recolour
parts**, with a swatch + clear per part. Plumbing: `GltfModel` caches a model's finish targets
(`listFinishTargets`, previously dead code) keyed by base url once it loads, with a subscribe notifier
so the inspector shows the pickers the moment a freshly placed model is ready (`getCachedFinishTargets`
/ `subscribeFinishTargets`). `selectGltfRender` now reads per-item `finish:<material>` overrides for
**every** GLB kind (not just IKEA variants), merging them over any def-level overrides and dropping
blanks so a cleared swatch can't paint a part black. Verified end-to-end: a built-in pool table exposes
its 13 materials and recolouring one repaints just that part in 3D. The whole-model **Tint (all)** stays.

## Furniture: exact numeric W×D×H size entry (v0.6.0.2)

First step of the "everything is customizable" push (size). Furniture could only be resized with
scale-multiplier sliders (0.25–3×), so a user thinking in real dimensions couldn't size a sofa to
"1.8 m". Now: GLTF/builtin/upload/remote items show an **Exact size (m)** row with editable W/D/H
fields that back-solve the axis scale from the model's base bounding box (proportions-locked → any
field rescales uniformly; unlocked → per-axis), and parametric items' dimension params (`NumberField`)
gain an inline numeric box beside the slider so an exact value can be typed, not only dragged. Both
clamp to sane ranges; the coarse sliders stay. Pure UI over the existing scale/param props — no render
changes.

## Scrollable Tools menu (sticky headers) + aligned ⌘K shortcut column (v0.6.0.1)

Two polish fixes for the toolbar. (1) The Tools dropdown was capped at `72vh` with overflow scroll but
gave no scroll affordance, so a long menu just looked cut off — the `.menu-label` section headers
(Analyse / Review & tour / Export & document) are now **sticky** within the scroll region (opaque
`--surface-solid` background), so the group name pins to the top while scrolling and the menu reads
clearly as scrollable. (2) The ⌘K palette's keyboard-shortcut `<kbd>` chips didn't line up: a row with
a docs "?" reserved a 22px slot on the right, pushing its `<kbd>` left of rows without one. Rows now
always render a matching `.ci-help-spacer`, so every shortcut chip sits in one consistent right-hand
column.

## Data-driven tool-action registry — single source for Tools across all 3 surfaces (v0.6.0.0)

The analytical **Tools** cluster (the Analyse + Review panels) is now defined once in a declarative
registry, `src/ui/actions/toolActions.tsx`, and the three surfaces that used to hand-build those rows
in their own JSX — the desktop **Tools menu**, the **mobile** bottom-sheet, and the **⌘K palette** —
all render from it. Each `ToolAction` carries its gating `flag` (which already encodes Simple/Pro),
its `docs` deep-link key, which `surfaces` it appears on, an `isActive` predicate, and a `run(store)`
that performs the close-siblings-then-toggle behaviour the three surfaces previously duplicated. This
removes the triplication that caused drift and is enforced by `toolActions.test.ts` (registry
invariants — real flags / icons / docs keys / unique ids — plus Simple-vs-Pro visibility resolution
and the per-surface projection). Behaviour is preserved on desktop + palette; the mobile rows pick up
the desktop labels + descriptions and the same section headers (a consistency win). The export cluster
(BOQ / CSV / 3D / drawing-set) and the local-state Sun-study toggle remain hand-rendered — they
diverge per surface and aren't store-backed — so they're intentionally out of the registry for now.

## Mobile sheet: docs links + section headers + distinct icons (v0.5.0.8)

Brings the mobile bottom-sheet to full parity with the desktop menus for the DOCS-DEEPLINK work.
The `Item` row gains an optional `docs?: DocKey` that renders an always-visible **"?" (`Icon.Help`)**
sibling control (touch has no hover) wired with `stopPropagation` so it neither runs the row nor
closes the sheet — added to every analytical/export item in the Tools section (Budget, Checks,
Drawings, Daylight, Design score, Accessibility, Measure, Comments, History, Versions, Share, Sun
study, Walkthrough, Report) and the File section (360° panorama, 360° tour, Render compare, Shopping
list, Import Sweet Home 3D). A new `SubHeader` (`.m-sec-h`) groups the Tools section under the same
**Analyse / Review & tour / Export & document** headers as desktop, each visibility-guarded.
Two **distinct line-icons** added to `icons.tsx` to end icon reuse: `Accessibility` (universal-access
figure, was sharing the shield `Checks` glyph) and `Daylight` (window casting light rays, was sharing
the `SunStudy` sun) — applied across the Tools menu, mobile sheet, and ⌘K palette.

## File/Edit menu sections + docs links (v0.5.0.7)

The File menu's long top block is now headed **Save & export**, and its two hand-rolled headers are
unified onto the shared `.menu-label` token (**Load & reset**, **App**) — consistent with the Tools
menu. Docs "?" links added to File items (360° panorama, 360° tour, Render compare, Shopping list,
Import Sweet Home 3D) and the Edit menu (Edit a room, Floor-plan editor). Continues the DOCS-DEEPLINK
+ menu-organization work.

## Declutter the Tools menu into sections (v0.5.0.6)

The Tools menu was a flat 15–20-item dump mixing analytical panels, review/tour, and six export
formats. It's now grouped under three scannable section headers — **Analyse** (Budget, Checks,
Drawings, Daylight, Design score, Accessibility, Measure, Comments), **Review & tour** (History,
Versions, Sun study, Walkthrough), and **Export & document** (Share, Moodboard, Report, Reno .ics,
Quote/BOQ, DXF/SVG, 3D exports, AR, Drawing set, Sheet callouts) — reusing the existing `.menu-label`
token; each header is visibility-guarded so it never shows over an all-flagged-off group. `ToolbarMenu`
panels now cap at `72vh` with overflow scroll so a long menu can't run off-screen.

## Contextual docs deep-links: command palette + Tools menu (v0.5.0.5)

Extends DOCS-DEEPLINK to two more surfaces. `MenuItem` gains an optional `docs?: DocKey` that
renders a hover/focus **"?" (`Icon.Help`)** — a sibling control with `stopPropagation` so it neither
runs the row nor closes the menu — wired into every analytical item in the **Tools menu** (budget,
checks, drawings, daylight, design score, accessibility, measure, comments, history, versions, share,
sun study, walkthrough, report, sheet callouts). The **command palette** rows now show the same "?"
when a command maps (via its gating flag) to a documented feature, opening that section of the guide.
Tokenised CSS (`.mi-help` / `.ci-help`), accessible (real focusable control, aria-labelled). Together
with the aux-panel headers, contextual help now reaches the panels, the palette, and the menus.

## Contextual docs deep-links: helper + aux-panel headers (v0.5.0.4)

First slice of the discoverability work (DOCS-DEEPLINK). `src/ui/docsUrl.ts` gains a `FEATURE_DOCS`
registry (`DocKey` = `FeatureFlag` + a few non-flag tool keys) with `docsUrlFor(key)`/`openToolDocs(key)`
that build `${DOCS_URL}<slug>#<anchor>` deep-links — anchors are the **real generated heading ids**
grepped from the built `dist/docs/<slug>.html` (so they don't 404), `encodeURI`'d for the few unicode
ones. A new shared `src/ui/AuxPanelHead.tsx` renders the standard panel header (title + sub + Close)
plus a contextual **"?" (`Icon.Help`)** that opens that panel's guide section; the ten aux panels
(Budget, Clearance, Design score, Accessibility, Daylight, Drawings, Comments, History, Versions,
Sheet callouts) now use it. Unit tests cover `docsUrlFor` (URL shape, no-anchor, unicode encoding,
fallback) + a page-slug integrity guard. Groundwork for the action-registry migration that wires the
same `docs` links into the command palette, toolbar menus, and tooltips.

## Polygon-room tool discoverability (v0.5.0.3)

Non-rectangular / L-shaped rooms were already drawable via the `polyroom` tool, but it was just
labelled "Polygon" (ambiguous next to "Polyline") and the close-gesture wasn't obvious, so users
allocating rooms didn't find it. `FloorPlanEditor.tsx`: relabel the tool to **"Polygon room"**,
expand its tooltip (draw an L-shaped room — click each corner, click the first / press Enter to
close, Esc cancels), and show a live **`.plan-draw-hint`** chip in the rail while the Polygon-room
(or Polyline) tool is active. No behaviour/geometry change. Verified with
`scripts/scenarios/polyroom-verify.json` (draw vertices → Enter → a room with a ≥3-vertex polygon).

## Style themes reachable from the overview (v0.5.0.2)

The **Arrange** menu — Smart Start + the layout/theme presets (Scandinavian, Minimalist, Japandi,
…) + finish styles, all *whole-apartment* actions — was only rendered inside the per-room editor, so
from the main overview the themes were unreachable except via ⌘K ("apartment presets not
available"). `Toolbar.tsx` now also renders `<ArrangeMenu />` in the overview view-mode cluster
(`orbit && !roomEditorActive`); the actions (`applyLayoutPreset`/`tidyHome`/`applyStyle`/set-drops)
already act on the whole flat and aren't editor-gated. Verified: the Arrange menu shows in the
overview and applying "Scandi Calm" restyles the flat.

## Composer: tint existing materials, incl. Poly Haven (v0.5.0.1)

The finish composer's source dropdown now has a **"Tint a material"** group listing the
surface's catalog materials alongside the procedural patterns. Picking one + a colour applies a
`tint:<baseId>:<#hex>` finish, resolved in `useMaterial.ts` by cloning the base def with the new
`swatch` — which recolours procedural materials AND multiplies the albedo of **textured CC0 / Poly
Haven** materials (their `m.color` = `swatch`). New pure `tintMaterialId`/`parseTintMaterialId`/
`tintedMaterialDef` helpers in `composeMaterial.ts` (+ unit tests). Verified: a red tint over the
oak-plank floor shows the grain through the colour.

## Design-tool bug sweep + composable finishes + midday-lighting fix (v0.5.0.0)

A batch of reported design-tool fixes plus one major finish feature and a lighting fix:

- **Compose finishes from texture + colour (MAT-COMPOSE, `materialComposer` flag, simple).** A new
  pure `materials/composeMaterial.ts` encodes a finish as `compose:<pattern>:<#hex>` and synthesises a
  `ProceduralMaterialDef` on the fly (resolved in `useMaterial.ts`, mirroring the raw-`#hex`
  custom-colour path) — so ANY of 17 texture families can pair with ANY colour without a catalog
  entry. New `ui/finish/MaterialComposer.tsx` collapsible per surface in the FinishPicker (live tiled
  preview + texture dropdown + colour). Renders through the existing procedural pipeline on floors +
  walls; serialises as a plain string. Unit-tested.
- **Smart Start palette swatches** now resolve the real floor/wall colours (`BUILTIN_MATERIALS[id].swatch`)
  instead of undefined `--swatch-*` CSS vars (which fell back to grey).
- **Catalog category rail scrolls horizontally on desktop** — a vertical mouse-wheel over `.cat-rail`
  is translated to horizontal scroll (`CategoryTabs` `onWheel`); trackpads/touch untouched.
- **Inspector auto-expands on desktop** — `useInspectorMinimize` defaults to expanded on desktop and
  minimised only on mobile (`useIsMobile`), instead of always minimised.
- **Wardrobe / Toilet (and any later catalog item) thumbnails render** — the single-Canvas thumbnail
  host now has a watchdog so one stalled def (e.g. a remote GLB whose fetch hangs under `<Suspense>`)
  can't block every queued item behind it; `handleReady` is memoised to stop rAF-capture churn.
- **Checkered / plaid / dots patterns show on the Rug** — `Rug.tsx` now routes those patterns through
  `getFabricMaterial` (which already supports them), not just striped/herringbone.
- **A/B render compare no longer hangs the browser** — `RenderCompareModal` captures the live RASTER
  frame (`captureCanvasPng`) after applying each preset instead of spinning up two heavy path-trace
  sessions; the "Capturing B…" overlay no longer overlaps the rendered image A.
- **Midday "washed out on Maximum" fix (LIGHT-IBL-OVERLAP).** On IBL tiers the procedural environment
  added ambient bounce on top of the analytical hemisphere+ambient fill (tuned as the sole fill for the
  flat tier), and the broad sunlit surfaces then exceeded the bloom threshold → milky veil. `look.ts`
  `iblFillScale` scales the analytical fill down with the day level when IBL is active, and
  `bloomIntensityForDay` ramps bloom strength to ~0 at midday (full at night, threshold unchanged so
  the `fixtureGlow` lock-step + night glow are preserved). Both pure + unit-tested.

Verified: undo/redo (move/rename/redo) work; condominium presets (incl. penthouse) load from the 2D
editor's Template picker; whole-house finishes apply via the FinishPicker's "Apply to all rooms".

## Feature: per-face brushed-metal anisotropy rotation (BRUSH-AXIS) (v0.4.0.0)

Brushed-metal surfaces now orient their anisotropic highlight per face instead of using one global
brush direction. A new pure `materials/brushAxis.ts` `anisotropyRotationForNormal(normal)` maps a
face normal to an `anisotropyRotation` so the streak runs consistently across each surface, and
`getMetalMaterial(color, finish, repeat, faceNormal?)` threads it through the LRU cache key
(rotation-tagged) so distinct orientations stay cached independently. With no `faceNormal` supplied
the result is **byte-identical** to the previous material (default rotation 0). 9 unit tests
(axis mapping, default-identity, determinism).

## Feature: concrete pinhole-pore roughness micro-variation (CONCRETE-PORES) (v0.4.0.0)

Procedural concrete reads less uniformly flat: `materials/procedural/stoneSurface.ts`
`makePinholePores(seed, pores)` layers sparse high-frequency pinhole pores (freq 110, seed offset
+137, threshold 0.8, max roughness lift +0.16, clamped [0,1]) onto the `concreteFields` roughness
channel in `procedural/patterns/stone.ts`. The change is **roughness-only** — no normal/displacement,
so it cannot z-fight or clip — and `DEFAULT_CONCRETE_SURFACE_PARAMS` keeps it tunable. 39 pixel-stats
unit tests (pore density, roughness bounds, determinism, channel isolation).

## Feature: UV repetition break-up for large tiled surfaces (MAT-006a) (v0.3.0.47)

Large tiled floors no longer read as an "obvious repeating grid". A new pure, deterministic
`materials/worldUv.ts` `cellUvTransform`/`breakRepetitionPlane` subdivides a rectangular floor on the
tile-size grid and re-phases each cell's UVs with a hashed quarter-turn (90/180/270°) + a sub-tile
offset — **no shader, no second UV set, no extra texture**. The offset is quantised to {0, 0.5} so a
gridded ceramic tile stays **grout-continuous** (boundaries land on grout, no cracks) while
non-gridded stone/marble/wood de-correlates tile-to-tile; rotation is rigid (no UV stretch) and cells
share boundary positions + Y (no geometry seam, no z-fighting). Wired into the rect floor build sites
(`RoomFloor`/`PlanRoomFloor`) behind a new `tileBreakup` flag (`tier:'pro'`, default on, prod-safe
pure code; off → byte-identical to the previous plane). 29 unit tests (period-breaking, determinism,
no UV NaN, grout-continuity, both-mode gating); flat-texture-verified ON-vs-OFF on gridded tile +
marble, and re-confirmed seam/z-fighting-free on the integrated tree.

## Perf: brushed-metal legs/frames via getMetalMaterial (METAL-LEGS) (v0.3.0.46)

The shared anisotropic brushed-metal material (`getMetalMaterial`, previously wired only into the 8
appliance bodies) now also dresses furniture **legs / frames / rails / posts / gas-lifts / taps** via
a new `primitives/shared.tsx` `metalLeg(color?, finish?, repeat?)` helper, routed through 8 primitives
(BarCart, OfficeChair, BarStool, Sideboard, TowelLadder, DryingRack, Desk, KitchenIsland). It inherits
`getMetalMaterial`'s `pbrSurfaces` gate — a `MeshPhysicalMaterial` with brush normal/roughness-streak +
anisotropy on High/Max, an identical-to-before plain `MeshStandardMaterial` on Performance (the flat
path is byte-for-byte unchanged). Geometry is untouched (legs stay floor-anchored, inside the
footprint); painted/plastic/wood/fabric parts and small hardware are left alone. 6 tests (both tiers);
verified HQ (metal reads correctly, structurally sound, no z-fighting) + Performance (unchanged).

## Perf: broadphase the auto-arrange collision scans (ARRANGE-GRID) (v0.3.0.45)

The auto-arrange ("Tidy") pass ran `canPlace` per candidate position against the **full** item list.
It now restricts each placement's neighbour set via the existing `collision/broadphase.ts`
`buildGrid`/`queryRect` (the proven PERF-003 drag-path pattern) — a new `broadphaseNeighbours` +
reused `itemAabbBox` in `collision/placement.ts`, consumed by `layout/autoArrange.ts` `tryPlace`. A
position×rotation **equivalence sweep** over a dense scene asserts the broadphase-restricted result is
**identical** to the full scan, and the existing `autoArrange` collision-validity tests pass unchanged
— so it's a pure speedup at scale with no behaviour change.

## Perf: zero-allocation wall camera-facing reveal (SHELLPERF) (v0.3.0.44)

`RoomShell`/`PlanRoomShell` allocated a `new Vector2` every frame, per clipped wall, inside `useFrame`
(steady GC pressure in the isolated-room editor). The per-frame camera-facing test is now a pure
`apartment/wallFacing.ts` `wallFacesAway(camX, camZ, midX, midZ, normal, threshold)` called with
scalars — **zero allocation** on the hot path, byte-identical visibility result. 8 unit tests
(faces-away/toward, threshold boundary, equivalence to the prior `Vector2.dot`).

## Feature: angle-snap when dragging an existing wall endpoint (PARITY-PLAN-VERTEX-ANGLESNAP) (v0.3.0.42)

Dragging a wall's endpoint handle in the 2D editor now **snaps to 15° increments** (horizontal /
vertical / 45°…) about the wall's other, fixed end — the same ortho/angle snap that *drawing* a new
wall already used (`snapWallAngle`), so an existing wall squares up cleanly instead of landing a
fraction of a degree off; **Shift** bypasses it for a free drag. Previously only freshly-drawn walls
got the snap — `moveWallVertex` received the raw cursor. The decision is a new pure
`vertexDragTarget(start, end, which, cursor, bypass)` in `ui/floorplan/editor/snapWallAngle.ts`
(picks the fixed anchor = the *other* endpoint, applies `snapWallAngle` unless bypassed); the editor's
`moveWallVertex` still applies its own corner/wall-join snap afterwards (order: angle → wall-snap,
matching the draw path). 5 new unit tests (anchor selection per dragged end, near-90° snap, Shift
bypass, custom step); the `plan-editor-tools-journey` scenario stays green (behaviour-preserving for
every other gesture). This is an inline orchestrator fix — the editor file is too churned this
session to delegate to a fork-from-base worktree agent.

## Feature: indicative electrical-points schedule in the design report (PARITY-ELECTRICAL-SCHED) (v0.3.0.41)

The report gains an **Electrical points (indicative)** section — a rough per-room socket/point count
an electrician can quote against. Pure `analysis/electricalSchedule.ts` (`buildElectricalSchedule(plan,
items, catalog)`) counts per room: **lighting points** (reusing `furniture/lightEmitters.ts`
`isItemEmitter` — the exact predicate the lighting plan uses, so the two reports never disagree on
what a light is) and **power points** inferred from powered furniture categories present
(`SOCKETS_PER_CATEGORY`: kitchen 2, appliances/electronics/laundry/other 1; lighting excluded), with a
per-room-kind minimum floor (`MIN_SOCKETS_BY_KIND`: living/kitchen 4, study 3, dining/bedroom 2, …) so a
sparsely-powered room still reads as wired, plus per-room and grand totals. Explicitly labelled
indicative (no circuits/loads/cable runs). Rides the `report` flag (no new flag). 12 unit tests +
report-render coverage; empty plan → zeroed (no NaN), strays → an "Unassigned" row, multi-storey summed.

## Feature: combined cost-breakdown CSV export (PARITY-COST-BREAKDOWN-CSV) (v0.3.0.40)

A single exportable **cost breakdown CSV** consolidating what the report shows separately. Pure
`export/costBreakdownCsv.ts` (`buildCostBreakdown`/`buildCostBreakdownCsv`) emits sectioned rows —
Furniture by category (qty + subtotal), Finishes/renovation lines (floor/wall area × rate), and a
**reconciling GRAND TOTAL** (`grandTotal === furnitureSubtotal + renovationSubtotal`, asserted in
tests) — reusing the existing pricing (`itemPrice`, `floorAreaByFinish`/`wallAreaByFinish`,
`estimateRenovation` with `RENO_RATES`); RFC-4180 + injection guard + UTF-8 BOM. `ui/openCostBreakdownCsv.ts`
downloads `<plan>-costs.csv`. File menu + mobile + ⌘K under `shopExport` (no new flag). 9 unit tests.

## Feature: move-in / handover checklist in the design report (PARITY-MOVEIN-CHECKLIST) (v0.3.0.39)

The report gains a **Move-in checklist** — a derived handover punch-list for the SG reno handover.
Pure `analysis/handoverChecklist.ts` (`buildHandoverChecklist(plan, items, catalog)`) groups by room:
common snag rules + per-`RoomKind` rules (via `roomKindFromName`, unrecognised → generic bucket), an
appliance/utility-activation group for the appliance categories actually present (kitchen/appliances/
laundry/electronics), and an always-present keys/meters/documents group (empty plan → just that).
Deterministic (no clocks/random). Rides the `report` flag (no new flag). 9 unit tests + report-render.

## Feature: design-suggestions section in the design report (PARITY-SUGGESTIONS-SECTION) (v0.3.0.38)

The per-room "what to add / improve" tips from the existing `analysis/suggestions.ts buildSuggestions`
(previously panel-only) are now also a **report section** — derives each room's furniture categories
via `pointInRoom` and renders the grouped suggestions, omitted when no rule fires. No new analysis
code, no new flag (rides `report`). Report-render tests for the furnished, empty-room, and no-suggestion
cases.

## Feature: FF&E schedule CSV export (PARITY-FFE-CSV) (v0.3.0.37)

The FF&E (furniture, fixtures & equipment) schedule that the design report already renders as HTML is
now also a **machine-readable CSV** — the missing third export alongside the furniture-list and
room-schedule CSVs. Pure `export/ffeCsv.ts` (`buildFfeCsv(rows, units, opts?)`) runs over the existing
`buildFfeSchedule` rows (no recompute): Room / Item / Source / SKU / Size (W×D×H, unit-aware) / Qty /
Unit price / Line total, RFC-4180-quoted with the OWASP injection guard (`utils/csv`), a UTF-8 BOM and
a grand-total footer; prices are blanked when the `budget` feature is off (the gate lives in the
download glue, keeping the builder pure). `ui/openFfeCsv.ts` downloads `<plan>-ffe.csv`. File menu +
mobile + ⌘K, under the existing `shopExport` flag (no new flag). 6 unit tests (metric/imperial,
injection-neutralised, footer, prices-off, empty plan).

## Feature: door & window schedule in the design report (PARITY-OPENING-SCHED) (v0.3.0.36)

The printable report gains an **Openings schedule** — a standard CAD/SH3D door & window schedule. Pure
`analysis/openingSchedule.ts` (`buildOpeningSchedule(plan)`) walks `plan.openings` across all storeys,
resolves each opening's bordering room(s) via a wall-midpoint probe, and groups openings with identical
(kind, width, head−sill) into **typed marks** (D1/D2…/W1/W2…) with a count, per-mark size (W×H), sill,
door swing/hinge, and the rooms each mark appears in (a "door type D1 ×4" schedule). Openings off any
wall/room fall into an "Unassigned" bucket (no crash); doors sort before windows; section omitted when
there are no openings. Rides the existing `report` flag. 15 unit tests + report-render coverage.

## Feature: daylight & ventilation section in the design report (PARITY-DAYLIGHT-DIGEST) (v0.3.0.35)

The daylight/ventilation analysis (`analysis/daylight.ts buildDaylightReport`) that powered only the
in-app panel is now also a **printable report section**: per-room glazing % + openable % with PASS/FAIL
against the module's `DAYLIGHT_MIN_RATIO` (10% glazing) / `VENT_MIN_RATIO` (5% openable) thresholds, a
pass-count summary, and a disclaimer; omitted when no room has a window. No new analysis code, no new
flag (rides `report`) — closes an obvious gap (the report already had accessibility + thermal but not
daylight). Report-render tests for the windowed + bare-shell cases.

## Feature: inset / outset a room polygon by a signed distance (PARITY-ROOM-INSET) (v0.3.0.33)

A Pro action **insets** (shrink — dropped soffit / set-down) or **outsets** (grow — setback) a
room's outline by a signed distance, a common Coohom/CAD offset-polygon op. Pure
`floorplan/insetRoom.ts` (`insetPolygon(points, dist)`) offsets every edge and re-intersects
adjacent offset edges — convex AND simple concave (L-shape) rooms, winding auto-detected — and
returns **`null`** on a degenerate result (an edge reverses, the winding sign flips, or the area
collapses to ~0) rather than a self-intersecting polygon. `insetRoom(id, dist)` /
`insetSelectedRoom(dist)` slice actions write the result back as an explicit `polygon`, re-flow the
room's boundary wall/opening names, push one undo step, and **reject a collapse with an error toast**
(no fork, no history). Triggers: ⌘K "Inset room (−0.1 m)" / "Grow room (+0.1 m)" (shown only with a
room selected) **and** Inset/Grow buttons in the PlanInspector room branch. New `roomInset` flag
(`tier:'pro'`, default on). 19 unit + slice/flag tests (square inset shrinks area predictably,
inset>half-width → null, outset grows, L-shape concave, double-inset composes, both modes).
Documented limitation: boundary walls aren't re-traced, so openings keep their wall offsets.

## Feature: indicative thermal-envelope digest in the design report (PARITY-THERMAL) (v0.3.0.32)

The printable report gains a **Thermal envelope** section — an indicative (not certified) building-
science estimate. Pure `analysis/thermalAnalysis.ts` (`buildThermalReport(plan, finishes?)`) sums
the exterior opaque wall area (`thickness==='external'` walls × storey height across all storeys via
`planLevels`/`wallLength`) and the glazing area (window openings on those walls), maps each surface to
a representative Singapore U-value via a documented `U_VALUES` table (RC wall 2.0, brick 1.7,
lightweight 1.0, cladding 0.6 W/m²K; single glazing 5.7, double 2.8, low-E 1.8), and returns total
envelope area, area-weighted average U, glazing ratio, and a conductive heat-transfer index
`Σ area×U` (W/K). Explicitly labelled indicative — excludes roof/floor slabs, thermal bridging, solar
gain, infiltration, shading and orientation. Edge cases: bare-shell/all-interior plan → zeroed digest
(no NaN), window on an interior wall ignored, unrecognised finish → documented RC default, multi-storey
summed with per-level ceiling override. Rides the existing `report` flag (no new flag — matches the
Plan-statistics / Renovation-timeline sections). 13 unit tests + report-render coverage.

## Feature: snap the whole plan to a grid (PARITY-GRID-SNAP) (v0.3.0.31)

A Pro **"Snap to grid"** Plan-menu action tidies a traced/imported plan by rounding every
coordinate to a grid. Pure `floorplan/gridSnap.ts` (`snapPlanToGrid(plan, items, gridM=0.05, opts?)`,
modelled on `rescalePlan`/`mirrorPlanRegion`) rounds wall endpoints, room origins/size/polygon/
labelOffset, opening offset+width, notes/dims/polylines, every upper storey (+ `elevation`/`extent`)
via `Math.round(v/gridM)*gridM`; openings are re-threaded (offset snapped + clamped to
`[0, wallLen−width]`) so they stay on their snapped wall, and a wall that would collapse to zero
length is left unsnapped. Idempotent (`snap∘snap === snap`); `gridM ≤ 0`/NaN/∞ throws; furniture
positions snap only with `{snapFurniture}` (sizes preserved). `snapFloorPlanToGrid(gridM?, opts?)`
slice action defaults the grid to the editor's `gridSize` (else 0.05 m), one undo step, forks the
default plan. New `planGridSnap` flag (`tier:'pro'`, default on). 19 unit + slice tests; visually
verified (off-grid plan → P 18.00 m, walls still join, door swing intact, no z-fighting).

## Feature: renovation-timeline .ics calendar export (PARITY-RENO-ICS) (v0.3.0.30)

The renovation timeline (`analysis/renoTimeline.ts`) can now be exported as an **`.ics` calendar**
(Tools / mobile / ⌘K, under the existing `report` flag) so a homeowner can drop the reno phases into
their calendar app. Pure `export/renoIcs.ts` (`buildRenoIcs(phases, startDate[, now])`) emits an
RFC-5545 VCALENDAR with one all-day VEVENT per phase (`DTSTART;VALUE=DATE`/exclusive `DTEND`), CRLF
line endings, TEXT escaping, a stable per-phase UID, PRODID + DTSTAMP — clock-free (dates passed in)
so it's deterministic + unit-testable; an empty timeline yields a valid empty VCALENDAR.
`ui/openRenoIcs.ts` is the Blob-download glue (starts "today", toasts when there are no phases).
18 tests incl. an integration test against the real `buildRenoTimeline`.

## Feature: plan-statistics digest in the design report (PARITY-PLAN-STATS) (v0.3.0.29)

The printable design report gains a **Plan statistics** section: total GFA (summed across all
storeys), room count + per-kind mix, average room size, total room perimeter, total wall length, and
a net-vs-circulation split. Pure `analysis/planStatistics.ts` (`buildPlanStatistics(plan)`) reuses
`allPlanRooms`/`planLevels`/`planRoomArea`/`planRoomPerimeter`/`wallLength`/`roomKindFromName`; an
empty/bare-shell plan yields a fully-zeroed digest (never NaN), unknown room kinds bucket as `other`.
Rides the existing `report` flag (no new flag). 12 unit tests + a report-render test.

## Feature: mirror a whole plan region about an axis (PARITY-PLAN-MIRROR-REGION) (v0.3.0.27)

A **"Mirror plan"** action (Plan menu, Pro) reflects the entire plan region — every storey's walls,
rooms, openings, notes/dimensions/polylines, **and** furniture — across a vertical axis, for
mirror-image HDB stacks / condo pairs. Pure `floorplan/mirrorPlanRegion.ts`
(`mirrorPlanRegion(plan, items, axisX)`) maps `x → 2·axisX − x` (Z untouched); being
orientation-reversing it also flips handedness — opening `hinge` (start↔end) + `swing` (left↔right),
wall `arc` sign, room `labelAngle` sign, furniture yaw (`rotation → −rotation`) + `flipX` — while
preserving all lengths/areas/sizes (it's an isometry). The `mirrorFloorPlan(axisX?)` slice action
defaults the axis to the plan's centre-X, commits plan+items in one undo step, and forks the default
plan on first edit. New `planMirrorRegion` flag (`tier:'pro'`, default on, prod-safe). 26 unit +
slice tests (coords reflect, areas preserved, hinge/swing/arc/yaw flips, multi-level, double-mirror =
identity, non-finite axis throws) + flag-gating both modes; visually verified on the integrated tree
(4-Room HDB mirrored left↔right, door swings flipped, 92.6 m²·11 rooms preserved, double-mirror
pixel-identical to the original — no z-fighting/overlap).

## Fix: clear pending object-URL revoke timer on RecordController unmount (BUG-RECORD-TIMER-LEAK) (v0.3.0.26)

`scene/RecordController.tsx` scheduled `setTimeout(() => URL.revokeObjectURL(url), 2000)` in
`rec.onstop` without tracking the handle, so unmounting within that 2 s window left the timer to fire
on a dead context. Each pending handle is now held in a `useRef(new Set<…>())` (self-pruning when the
timer fires), and a mount-once effect `clearTimeout`s all still-pending handles on unmount. The
normal still-mounted path is byte-identical (revoke still fires at 2 s); multiple recordings in one
session each track their own handle without clobbering.

## Fix: PathArraySection infinite render loop when no polyline is drawn (BUG-PATHARRAY-LOOP) (v0.3.0.24)

`ui/inspector/PathArraySection.tsx` subscribed with `useStore((s) => s.floorPlan.polylines ?? [])`
— the `?? []` **inside the selector** returns a brand-new array reference on every render whenever
`polylines` is undefined (the default — no polyline drawn yet), which Zustand compares by identity,
driving an infinite update loop ("Maximum update depth exceeded") that the error boundary then
caught. Because the section renders for any single furniture item in Pro mode, the inspector crashed
on the common no-polyline case — a latent regression from PARITY-DUP-PATH (v0.3.0.12) that its own
scenario masked by always drawing a polyline first. Surfaced by **integration visual verification**
(the scatter-fill scenario selects a plain item with no polyline, mounting `PathArraySection`
alongside the new `ScatterFillSection`). Fixed by selecting the raw value (stable `undefined` or
stable array reference) and falling back with optional chaining in the render body instead of in the
selector. Re-verified: the scatter scenario completes and the inspector renders the array sections
cleanly with the room filled.

## Feature: scatter-fill a room with N collision-safe copies (PARITY-SCATTER-ROOM) (v0.3.0.23)

A new Pro inspector action **"Fill room"** evenly packs a room's free floor with N copies of the
selected item (dining chairs, downlight grids, planter rows). Pure `layout/scatterInRoom.ts`
(`scatterInRoom(roomPolygon, footprint, count, {existing, defs, doors, walls, clearance, rotation,
levelId, seed, defId})`) lays a footprint+clearance-pitched grid over the room bbox, keeps cells
whose whole (rotation-aware) footprint is inside via the reused `pointInPolygon`, visits them in a
seeded Fisher–Yates order (`mulberry32` — deterministic) and accepts each that passes the reused
`collision/placement.ts canPlace` against existing + already-placed copies, capping at `count` and
reporting the shortfall. `ui/inspector/ScatterFillSection.tsx` resolves the selected item's room
(`allPlanRooms`+`levelOfRoom`+`pointInRoom`), commits all copies in one undo step, and toasts
"placed N of M" on a cap. New `scatterFill` flag (`tier:'pro'`, default on, prod-safe) — hidden in
Simple, present in Pro, tested both ways. 13 unit tests (all-inside, no-overlap, deterministic-by-
seed, even spacing, over-count cap, degenerate/concave-L room, footprint-bigger-than-room, existing-
item respect, rotation carry) + scenario; visually verified (12 chairs evenly spread, upright, no
clip/z-fighting, one-step undo, mobile bottom-sheet).

## Feature: sticky stamp placement mode (PARITY-STAMP-PLACE) (v0.3.0.22)

A Floorplanner-style **stamp** mode: arm a catalog item, then click-place it repeatedly without
re-selecting (chairs, downlights, plants), each drop a single undo step, until Escape / Done / a
different item disarms it. `placementSlice` gains `stampMode` (the armed def stays `activeDefId`;
`stampMode` only decides whether a commit re-arms or disarms); `usePlacementController` keeps
placement armed while stamping (guarded by `isFeatureEnabled('stampPlace')`); a per-card stamp
button (accent ring on the armed card) + a `StampBanner` cue ("Stamping <item> — click the floor to
drop copies" + Done) + a `stamp-mode` ⌘K command. New `stampPlace` flag (`tier:'pro'`, default on,
prod-safe) — Simple keeps the classic one-click-commits-once behaviour. 11 tests; visually verified
(arm → place distinct copies, mode persists; Esc disarms keeping copies; hidden in Simple; mobile
full-width banner).

## Feature: rescale a plan to a factor or target dimension (PARITY-PLAN-SCALE) (v0.3.0.21)

"Scale the walls to a target dimension" (Sweet Home 3D / RoomSketcher parity) — fix a wrong-scale
traced/imported plan or resize a template to a known room length in one action. Pure
`floorplan/rescalePlan.ts` (`rescalePlan(plan, factor | {anchorWallId, targetLength}, items?, opts?)`)
scales every wall endpoint (+ thickness/arc/topHeight/baseboard), room origin/size/polygon/label/
ceiling, opening offset+width+sill+head, notes/dimensions/polylines and **every upper storey** about
an anchor (origin, or the anchor wall's start for the target-length form), plus furniture positions —
**sizes preserved by default** (a wrong-scale plan corrected around real-size furniture), opt-in
`scaleFurnitureSize` for a whole-design rescale. `rescaleFloorPlan` slice action validates first
(clean throw, no state change), commits plan+items in one undo step, and treats factor 1 as a true
no-op. `ScalePlanModal` (By-factor / To-a-length, "Also resize furniture", live area preview) +
Plan/Tools trigger. New `planScale` flag (`tier:'pro'`, default on). 26 unit + store tests
(lengths ×factor, areas ×factor², openings proportional, target-length exact, multi-level,
double-scale composes, factor≤0/NaN/Inf rejected, no-mutation).

## Feature: room-schedule CSV export (PARITY-ROOM-CSV) (v0.3.0.20)

A machine-readable **room schedule** export complements the existing furniture-list CSV. Pure
`export/roomScheduleCsv.ts` (`buildRoomScheduleCsv(plan, finishes, nameOf, units)`) emits one row
per room across **all storeys** (Storey / Room / Area / Perimeter / Floor finish / Wall finish /
Ceiling height) + a grand-total footer, reusing `planRoomArea`/`planRoomPerimeter`/
`resolvePlanRoomFloor`/`resolvePlanRoomWall` + `allPlanRooms`/`levelOfRoom`, unit-aware
(`formatArea`/`formatLength`) and RFC-4180-quoted via `utils/csv` (with the OWASP injection guard).
Download glue `ui/openRoomScheduleCsv.ts` wired into File menu, mobile Tools, and ⌘K under the
existing `shopExport` flag (no new flag). 10 unit tests (row-per-room across storeys, callouts,
imperial formatting, RFC-4180 + injection neutralisation, grand-total, empty plan).

## Fix: treat a near-2π sweep as a full-circle radial array (BUG-RADIAL-FULLCIRCLE) (v0.3.0.19)

A radial array dragged to "almost a full circle" (`rawSweep = 2π − ε`) fell to the partial-spacing
formula `sweep/(n−1)` and **double-upped at the seam** (the first and last copies overlapping). The
full-circle test (`Math.abs(sweep − 2π) < 1e-9`) was too strict for a dragged value. Now a sweep
`>= 2π − RADIAL_SEAM_EPS` (`1e-3` rad ≈ 0.057°, below any draggable/perceptible resolution and wide
enough to absorb float drift) is treated as a full circle (exclusive seam, `step = 2π/n`); smaller
sweeps keep the inclusive-both-ends partial formula. Unit test added for `2π − 1e-4` → no seam
duplicate.

## Feature: align/distribute/mirror multi-selected furniture in the 2D plan (PARITY-PLAN-ALIGN) (v0.3.0.18)

Selecting **2+ placed pieces** on the 2D plan (e.g. via the new marquee) now swaps the inspector
for a **multi-select action panel** (`ui/floorplan/PlanMultiSelectActions.tsx`): Align centres
(X/Z), Align edges (Left/Right/Top/Bottom), Distribute evenly (Across X/Z) and Mirror. It's pure
**wiring** of the same render-agnostic ops the 3D `MultiSelectPanel` already uses
(`layout/alignDistribute.ts` `alignCenter`/`alignEdge`/`distributeEvenGaps`/`obbAxisHalf` +
`layout/selectionActions.ts` `mirrorSelectionX`) — no geometry reimplemented, since plan positions
are world XZ the ops apply unchanged. Each action is one `pushHistory` undo step, `canPlace`-checked
per item, locked items skipped, with the same over-wide-distribute clamp toast as the 3D panel.
`PlanInspector` shows it whenever `selectedItemIds.length > 1`. Ungated core (no flag — consistent
with the ungated 3D align/distribute; shown in both Simple and Pro and tested in both). 8 component
tests + a `plan-align-distribute-mirror` scenario; visually verified (Align X → single column at
distinct Z, Distribute Z → even gaps, Mirror → reflected across the selection centre; clean mobile
bottom-sheet, one undo each, no overlap/z-fighting).

## Refactor: extract tool draft reducers from FloorPlanEditor (MOD-FPE-SPLIT) (v0.3.0.17)

Behaviour-preserving modularization of the repo's largest file (`ui/floorplan/FloorPlanEditor.tsx`,
~3300 lines, violating the "no monolithic files" rule). The wall/room/dimension/scale-calibration/
polygon-vertex/wall-rotate **draft transitions** are now a pure, parameterized
`ui/floorplan/editor/toolDraftReducer.ts` (`wallCommit`/`wallTapCommits`/`roomCommit`/`rectFromDraft`/
`dimensionCommit`/`scaleCommits`/`polygonClick`/`rectFromVerts`/`rotateWallTransform`/`draftLength`),
with the React component reduced to a thin dispatcher that holds state and delegates the math. The
live element-drag bodies + item-rotate path stay in the component (tight store-read/`canPlace` loops,
not pure draft math) and are byte-identical — the PARITY-PLAN-FURN-ROTATE handle and wall rotate ring
are fully preserved. 23 new reducer unit tests; the existing editor scenarios (wall/room/polyroom/
autoroom/dimension/text/split-join/wall-rotate) + the just-merged marquee all stay green on the
integrated tree (a path-scoped `ui/floorplan/editor/CLAUDE.md` documents the pure/tested module
convention). A pre-existing `plan-furniture-rotate` scenario step-20 flake (reproduces on baseline)
is noted for the PARITY-PLAN-FURN-ROTATE owner — not a regression.

## Feature: rubber-band marquee multi-select in the 2D plan editor (PARITY-PLAN-MARQUEE) (v0.3.0.15)

The 2D plan editor gains **drag-box (marquee) multi-select**, matching Sweet Home 3D / Coohom.
Dragging from empty canvas with the select tool draws a dashed-accent rectangle (token vocabulary,
no hardcoded colour); on release every furniture footprint and wall segment that **intersects** the
box is selected (intersection, not full-containment — the SH3D/Coohom convention). The hit-test is a
new pure `ui/floorplan/editor/marqueeSelect.ts` that reuses the existing `collision/obb.ts`
`obbVsObb`/`obbVsSegment` SAT helpers, so rotated footprints test against their true OBB. A new
`setPlanMarqueeSelection(itemIds, wallIds)` slice action sets `selectedItemIds` + `selectedWallIds`
atomically; multi-selected footprints highlight in accent. Delete/Backspace bulk-removes the
selected furniture in **one** coalesced undo step. Zero-area drags fall through to normal click
selection, so existing single-click/select/draw tools are unaffected. Works with touch drag on
mobile. No feature flag — plan editing is a core loop (Simple + Pro), consistent with the existing
ungated wall Shift-click multi-select. 14 unit tests (incl. the rotated-footprint corner case) + a
desktop/mobile scenario; visually verified.

## Feature: duplicate a room on the 2D plan (PARITY-PLAN-ROOM-DUP) (v0.3.0.14)

Rooms now have a **Duplicate** action on the 2D plan (walls + openings already did). A new pure
`floorplan/duplicateRoom.ts` clones the room polygon with a 0.5 m origin offset, copies its floor +
wall finishes, assigns a fresh unique id + "… copy" name, and re-runs
`assignRoomWallNames`/`assignRoomOpeningNames` so boundary walls/openings get non-colliding names.
Crucially it gives the copy its **own** fresh offset boundary walls (matched to the source by the
same collinearity test the namer uses) + clones of their openings, so walls shared with neighbours
are never mutated; a floating room with no matching walls just clones the polygon + finishes (no
crash). The `duplicateRoom` slice action pushes one undo step, selects the new room, and resolves the
room's storey via `levelOfRoom` so multi-level plans stay on the correct level. A thin "Duplicate
room" button in the `PlanInspector` room branch (no flag — matches the ungated `duplicateWall`/
`duplicateOpening`, shows in Simple + Pro). 11 unit tests + scenario; visually verified
(11→12 rooms, shape + finishes preserved, clean single-step undo).

## Feature: smart rotation snap to a neighbour's axis (PARITY-SNAP-ROTATE) (v0.3.0.13)

Rotating furniture now **snaps to a nearby item's (or wall's) axis** when within 5° — Coohom-grade
"align to the sofa next to it" — falling back to the existing 15° grid otherwise (Shift still
bypasses all snapping). New pure helpers in `scene/selection/rotateGizmoMath.ts`
(`smartSnapRotation`, `neighbourAxes`, `offsetToNeighbourAxis`, `NEIGHBOUR_SNAP_THRESHOLD`): the
snap is **mod-90°** (parallel or perpendicular both read as aligned), the nearest neighbour wins on
ties (strict `<` boundaries → no flicker), and the 5° threshold sits well inside one 15° step so no
hysteresis is needed. `RotateGizmo` feeds the free candidate yaw through the helper and draws a
faint diametric alignment guide (`depthTest:false` + 1 mm lift → no z-fighting) only while a
neighbour-snap is active. Gated behind a new `smartRotateSnap` flag (`tier: 'pro'`, `default: true`)
so Simple users keep the familiar 15°-only behaviour (the gizmo gathers no reference axes when the
flag is off → byte-identical fallback). 17 unit tests + both-mode flag tests.

## Feature: duplicate-along-path array tool (PARITY-DUP-PATH) (v0.3.0.12)

Coohom-style array tooling now includes **duplicate-along-path**: place N copies of the selected
furniture along a drawn plan polyline, each oriented to the path's local tangent. The math lives
in a new pure `furniture/pathArray.ts` (`pathArrayPlacements(points, opts)`): arc-length
re-sampling of the polyline with optional tangent yaw (`align`), `count` or `spacing` modes, open
or closed loops, capped at `PATH_ARRAY_MAX_COUNT` (200), and full edge-case handling (<2 points,
zero-length segments, count<1, spacing≤0, spacing longer than the path). The UI is a sibling
`ui/inspector/PathArraySection.tsx` (not bolted onto the 1300-line `InspectorPanel.tsx` — it gets
only an import + a gated 3-line render block) that `canPlace`-validates each copy, skips + reports
collisions via the standard toast, and commits in a single undo step (`setItems`). Gated behind a
new `pathArray` feature flag (`tier: 'pro'`, `default: true`, pure-code so not `devOnly`) — forced
off in Simple mode by `resolveFlags`, present in Pro; unit-tested in **both** modes. 21 unit tests
for the sampler + a Simple/Pro gating test + a `path-array-simple.json` scenario. Visually verified
on an L-shaped polyline: copies land at exact arc-length steps across the bend with correct
per-copy yaw, flush on the floor (no float/sink/z-fighting), desktop + mobile bottom-sheet.

## Fix: correct array "didn't fit" toast count (AUD-003) (v0.3.0.11)

The inspector's array "N of M didn't fit" toast (`ui/inspector/InspectorPanel.tsx`) used
`${total + 1}` for the denominator, but `total` (= `placements.length` from
`arrayOffsets`/`gridArrayPlacements`) already **excludes** the source cell. The `+ 1` wrongly
folded the source back in, so the count never added up (`placed + dropped === total`, not
`total + 1`). Changed to `${total}`. Surgical one-line fix.

## Fix: bound + dispose furniture material caches (AUD-002) (v0.3.0.10)

The three in-memory furniture caches in `materials/furnitureMaterials.ts` (`cache`,
`furnitureRepeatCache`, `patternTex`) were unbounded `Map`s keyed on free-hex colours + cloned
textures, so a long editing session ratcheted GPU/VRAM upward without ever releasing the
`MeshStandardMaterial`s (and their cloned `map`/`normalMap`/`roughnessMap`) they held. Replaced
all three with a small reusable bounded **LRU** (`materials/materialLru.ts` — insertion-order
`Map`, recency-refresh on `get`/`set`) that disposes the GPU resources of evicted entries. Bounds:
`cache` 256, `furnitureRepeatCache` 128, `patternTex` 16 — each far above the count of *distinct
materials simultaneously on screen*, so an evicted LRU entry is virtually certain to be orphaned,
and the dispose is deferred one frame (`requestAnimationFrame`, mirroring `GltfModel`'s
`afterUnmount`) so any still-mounted mesh has unmounted first. Crucially, the cached materials mix
**exclusively-owned cloned textures** with **shared 256² singletons** (fabric/leather/velvet/paint/
rattan normals + the pattern textures) referenced by many live materials; an `OWNED_TEXTURES`
`WeakSet` tags only the per-material clones/`CanvasTexture`s so `disposeOwnedMaterial` frees those
and the material itself but never a shared singleton (which would corrupt every other material that
uses it). New unit tests cover LRU bound/eviction-order/dispose-on-evict and the owned-vs-shared
texture split.

## Feature: 2D plan furniture rotate handle (PARITY-PLAN-FURN-ROTATE) (v0.3.0.8)

The selected furniture footprint in the 2D plan editor now carries an on-canvas **rotate handle**
— a dashed accent ring + facing spoke/knob around the piece, mirroring the wall rotate ring's
visual language. Dragging the ring/knob spins the piece about its centre, reusing the 3D
RotateGizmo's math (`scene/selection/rotateGizmoMath.ts` `pointerAngle`/`computeRotation`) so it
snaps to 15° marks (hold Shift for free rotation), and every frame is `canPlace`-validated against
walls + other items (an invalid angle is skipped, leaving the last valid orientation). One undo
step per drag (`pushHistory` on grab → `rotateItem`). Single-selection, edit mode + select tool,
unlocked pieces — sharing the existing `beginElementDrag`/`onMove` plumbing the wall rotate ring
uses. No new flag (rides the editor's `floorPlanEditor` gate; works in Simple + Pro). 3 unit tests
+ a verification scenario; the handle render was screenshot-verified. (This completes an
implementation-agent's work that was left uncommitted in its worktree on a stale base; ported onto
the current branch.)

## Fix: multi-level (F13) tidy / furnish / decor now reach every storey (AUD-001) (v0.3.0.7)

The custom-plan layout paths iterated the GROUND-floor-only `plan.rooms`, so on a multi-storey
plan "Tidy home" / per-room Tidy / Smart Start / decor styling silently skipped upper-storey
rooms — and one path arranged upper items against ground geometry, mislaying them. Same bug class
as FIN-ALLROOMS. Now every entry point walks `planLevels(plan)` and uses each level's own geometry
via `levelAsPlan(plan, level)`, with a `(levelId ?? 'ground')` gate so a ground item under an upper
room's x/z is never treated as that room's host:
- `autoArrange.ts` — `arrangeAllRoomsForPlan` loops per level; `arrangePlanRoom` resolves the room's
  level via `levelOfRoom`; `arrangeOnePlanRoom` takes a `levelId` and gates `inRoom`.
- `furnishPlan.ts` — `furnishPlanItems` seeds every level's rooms, tagging each placed item's `levelId`.
- `decorStyling.ts` — `applyDecorStylingForPlan` walks all storeys and tags each upper-level room's
  decor with that level's id (decor items carry no `levelId` of their own, so they'd otherwise render
  on the ground floor).
Single-storey behaviour is byte-identical (`levelAsPlan` returns the plan itself; ground is level 0,
same rooms/order). 8 regression tests added (autoArrange ×3, furnishPlan ×4, decor ×1) on 2-storey
plans whose upper rooms share the ground rooms' x/z, verified red without the fix.

## Feature: 2D plan furniture inspector (PARITY-PLAN-FURN-INSPECT) (v0.3.0.6)

Selecting a placed furniture item in the 2D plan editor now opens a focused property sheet
(`ui/floorplan/PlanFurnitureInspector.tsx`, rendered by `PlanInspector` when the plan selection
resolves to a furniture item): rename, numeric X/Z, angle, parametric width/depth, a W×D×H size
readout, lock, delete, and "Edit in 3D". Edits route through the same `itemsSlice` actions as the
3D inspector — moves/rotations are `canPlace`-checked and push one undo step; resize coalesces via
`updateItemProps`. Item- vs plan-element selection is now **mutually exclusive** (`selectItem` clears
`planSelection`; `setPlanSelection` clears `selectedItemId`/`selectedItemIds`) so the two inspectors
never co-render. No new flag — plan editing is a core loop, so it shows in **both Simple and Pro**
(rides the existing `floorPlanEditor` gate); verified desktop + mobile bottom-sheet. `Num` is now
exported from `PlanInspector` for reuse. Matches Coohom / Sweet Home 3D plan-side editing.

## Refactor: extract pure rect/edge geometry from autoArrange (MOD-ARRANGE-GEO) (v0.3.0.4)

Pulled the pure rectangle/edge geometry primitives (`Rect`/`Edge` types, `rectsOverlap`, `inward`,
`clamp`, `nearestEdge`, `cornersOf`, `opposite`, `planRoomRect`) out of the 1005-line
`layout/autoArrange.ts` into a new `layout/arrangeGeometry.ts` — free of furniture/apartment/collision
deps (the proven `arrangeRoles.ts`/`floorPlanGeometry.ts` pattern). Adds `arrangeGeometry.test.ts`
(18 tests: overlap/touching edges, edge-facing rotations, clamp bounds, nearest-edge tie-break,
corner insets, opposite-edge involution, room-rect inset incl. degenerate). Pure refactor — the
existing `autoArrange.test.ts` passes unchanged.

## Feature: SH3D furniture + openings import, material-logic extraction, parity research (v0.3.0.3)

Three parallel-agent integrations:

- **PARITY-SH3D-FURN + OPENINGS** — the Sweet Home 3D importer now **places** parsed furniture as
  collision-safe scene items and converts doors/windows to wall **openings**, all in one undoable
  step with a counts toast (walls / rooms / furniture placed / openings / unmatched). New pure
  `floorplan/import/sh3dPlacement.ts` (`resolveSh3dImport` → `resolveFurniture` category→def
  footprint-best-match + `placeNonOverlapping`, `associateOpenings` nearest-wall via
  `floorPlanGeometry`, centre→offset clamp, sill/head from piece height) with 21 unit tests; parser
  gains an `opening` flag + `openingKindForName` (6 more tests). Limitations: category→def picks one
  representative def per category (no per-product identity); door-vs-window is a name heuristic; sill
  from piece height (SH3D `elevation` not yet captured); openings associate within 0.6 m of a
  straight wall (curved/sloped walls don't render openings this version).
- **MOD-FURNMAT-LOGIC** — extracted the pure three-free helpers (`hash01`, `sheenRough`,
  `applianceFinish`, `liftedSheenRgb`) out of `materials/furnitureMaterials.ts` into a tested
  `materials/furnitureMaterialLogic.ts` (21 tests); `furnitureMaterials.ts` re-exports `applianceFinish`
  so the appliance primitives keep their import path. Byte-identical behaviour (the MAT-004
  brushed-metal block stays in `furnitureMaterials.ts`).
- **Research** — added `docs/research/2026-06-20-coohom-sh3d-parity-backlog.md`, a ranked
  headlessly-verifiable Coohom/Sweet Home 3D parity backlog driving the next dispatch waves
  (2D-plan furniture rotate/inspect, duplicate-along-path, plan marquee, FloorPlanEditor split).

## Fix: 2D plan inspector finish pickers read the durable finishes map (FIN-DEFAULT-FORK) (v0.3.0.2)

The 2D plan inspector's floor + wall finish `<select>`s displayed `room.floor`/`room.wall` straight
off the plan room. On the **seeded default flat** `serialize()` deliberately drops the whole `floorPlan`
(it's rebuilt from constants), so the plan's own `room.floor` is not persisted — only the `finishes`
map round-trips. After a reload, the picker therefore reverted to the template default while the
rendered surface (driven by the persisted `finishes` map) kept the user's actual pick — a silent
picker↔render desync on the default plan. Both pickers now read through the canonical
`resolvePlanRoomFloor`/`resolvePlanRoomWall` resolvers (finishes map → plan room → app default), so the
control always matches what's rendered. Painting a finish still does **not** fork the default plan into
a custom one (forking changes structural-plan semantics — `<Apartment/>`, walkway, design score). Added
a `schema.test.ts` round-trip guard: paint floor+wall on the default plan, serialize→deserialize, and
assert the resolver recovers both picks against the freshly-regenerated default room.

## Feature: import Sweet Home 3D `.sh3d` plans + extract FloorPlanEditor geometry (v0.3.0.1)

Two parallel-agent integrations:

- **PARITY-SH3D** — import a Sweet Home 3D `.sh3d` plan (walls + rooms, first slice). New pure
  parser core `floorplan/import/sh3d.ts` (`parseSh3d`/`parseHomeXml`/`importResultToFloorPlan`/
  `categoryForPieceName`; fflate unzip + DOMParser, cm→m ÷100, bbox origin-anchoring, room
  polygons, best-effort furniture name→category) with 20 unit tests covering scale/axis,
  polygons, malformed-input warnings and hard failures. New `ui/openSh3dImport.ts` DOM glue
  (file picker → parse → undoable `setFloorPlan`, toasts geometry summary + warnings). Behind
  the `importSh3d` flag (`tier: 'pro'`, default on, prod-safe pure code), wired into the File
  menu, mobile File sheet, and ⌘K (`import-sh3d`). First slice imports walls + rooms; furniture
  is parsed + reported (placement) and openings (doors/windows) are deferred follow-ups.
- **MOD-FPE-GEO** — extracted the pure plan-geometry helpers (`planCenter`, `nearestWall`,
  `alongWall`) out of the ~3.1k-line `FloorPlanEditor.tsx` into a new tested
  `ui/floorplan/editor/floorPlanGeometry.ts` (parameterised on walls/rooms/points, no
  React/DOM/store/three), with 25 unit tests (ties, empty/degenerate input, on-vertex,
  beyond-segment clamping, curved arcs). Pure refactor — identical behaviour.

## Feature: sun-driven procedural sky backdrop (RD-412 steps 1–5) (v0.2.0.58)

Adds an analytic Preetham sky as a walk-mode backdrop that tracks the sun across the day —
blue noon (brighter zenith, warm horizon band), golden low sun at sunset, washed-out hazy
noon (turbidity), near-black night. New pure, headless-verifiable core: `scene/lighting/
skyGradient.ts` (analytic `skyRadiance`/`paintSkyEquirect`/`equirectDir`, no three/canvas)
+ `scene/lighting/skyRebuild.ts` (`shouldRebuildSky` threshold predicate). A new `sky`
`BackdropKind` mounts via `SceneBackdrop.tsx` gated on the `proceduralSky` flag (`tier: 'pro'`,
default on, prod-safe pure code), bakes a `CanvasTexture` into **`scene.background` only**,
rebuilds debounced when the sun crosses the threshold (disposing the old texture), and is wired
into the Scene menu, mobile toolbar, and ⌘K palette. `rotateY` was deduped out of `Sky.tsx`
into `lighting/sunPosition.ts`. The IBL/PMREM/bloom/exposure path is deliberately **untouched**
(the bloom-threshold lock-step, RD-409); steps 6–7 (HDR IBL probe) remain deferred. Tests in
both Simple (hidden) and Pro (present) modes. Visual note: headless pointer-lock can't rotate
the first-person camera to frame the sky through a window, so the in-window framing is
interaction-pending; the pure equirect bakes were PNG-verified.

## Fix: "apply finish to all rooms" now reaches upper storeys (FIN-ALLROOMS) (v0.2.0.56)

`setAllFloorFinish`/`setAllWallFinish` iterated `floorPlan.rooms` — which is **ground-floor-only** by the
project's level invariant — so on a multi-storey plan (F13) the bulk "apply to every room" silently left
every upper-level room at its default, in both the `finishes` map and the plan objects. Swapped both to
`allPlanRooms(plan)` (already imported + used elsewhere in the slice; `planWithRoomFinish` already resolves
each room's own level). Found by a backlog-audit agent; regression-tested (an upper-level room added via
`addLevel`/`addRoom` now receives the bulk floor + wall finish in both the finishes map and
`upperLevels[].rooms`). Single-level plans (the default) are unaffected.

## Realism: "Decor tray" hero decor primitive (RD-408) (v0.2.0.55)

A second RD-408 hero prop — a shallow rectangular **styled tray** (wooden base + four low rim walls)
holding 2–3 small index-seeded objects (pillar candle, recessed bowl, folded-book pair, coaster stack), a
common Coohom/SH3D vignette staple. New `primitives/DecorTray.tsx` (floor-anchored to `surfaceHeight`,
deterministic per-slot objects — no RNG, objects sit on the base inset from the rim, base lifted just
above the surface). `style` (`mixed`/`candles`/`minimal`) + `fullness` vary the set. Registered in
`primitives/index.ts` + `PrimitiveKind`; new `decor-tray` `ParametricDef` (noClip, surfaceHeight + style/
fullness/colour controls); leads the auto-furnish list on `coffee-table`/`ottoman`, secondary on
`console-table`/`sideboard`. Price entry + decor-styling test + a verification scenario added. No feature
flag (enriches auto-furnish). Implemented by a parallel opus worktree agent; verified here (renders as a
styled tray on a surface, no clipping/z-fighting; full suite + 23 decor tests green).

## Refactor: extract auto-arrange role classification into a tested module (v0.2.0.54)

Pulled the arrange-role classification (`ArrangeRole` type, the `ROLE` def→role map, `roleForCategory`,
`roleOf`) out of the 1135-line `autoArrange.ts` into a new pure `src/layout/arrangeRoles.ts` — pure leaf
logic, no geometry/`Ctx`, so it's now independently unit-testable. `autoArrange` imports + re-exports them
for back-compat (existing importers unchanged). Added `arrangeRoles.test.ts` (roleForCategory per category
+ fallback, roleOf explicit-map / unknown / mounted / noClip-rug / category-fallback / mounted-priority).
Part of the modularization sweep. tsc/biome/full-suite green (3227 tests).

## Feature: camera lens + depth-of-field controls (PC2-CAM-DOF-LENS) (v0.2.0.53)

Photographic camera controls for the render/snapshot camera — **focal length** (mm), **aperture** (f-stop)
and **focus distance** — behind a new `cameraDof` flag (pro, default on). New pure
`scene/cameras/cameraLensSettings.ts` (focal presets + clamps, `mmToFov`/`fovToMm` for a 24 mm sensor,
`rasterDofParams` mapping f-stop → bokeh + world focus range; unit-tested). Wired into the HQ path tracer
(`hqRenderSession` `PhysicalCamera` — focal mm→FOV, manual focus overrides the centre-screen auto-focus)
and a raster `<DepthOfField>` pass on **High/Maximum only** (`QualitySettings.dof`, world-space focus,
half-res, gated by `dof && cameraDof && f-stop>0`; the Maximum tier description that falsely claimed "lens
defocus" is now true). The HqRenderModal shows the lens/aperture/focus controls in Pro and keeps the
simple DoF dropdown as the Simple-mode fallback; lens/DoF prefs persist via `qualityPrefs` (back-compat
defaults). Both-mode + store/persistence/HQ-option/UI presence unit-tested (controls present in Pro,
hidden in Simple); the actual bokeh pixels are real-GPU-pending. Implemented by a parallel opus worktree
agent; integrated here (resolved flag/quality/qualityPrefs/EffectsImpl conflicts against the newer
tone-mapping API), full suite green (3219 tests).

## Refactor: extract DragController's pure helpers into a tested module (v0.2.0.52)

Moved the six pure, module-level helpers out of the `DragController` R3F component into a new
`src/scene/dragHelpers.ts` (`wallFaces`, `halfExtents`, `staticAabbs`, `snapAxis`, `pointInFootprint`,
`snapBase` + the `ALIGN_TH` constant). Pure move — identical behaviour — but it slims the controller and,
crucially, makes the snapping/footprint/broadphase maths **unit-testable** (the component itself can't be).
Added `dragHelpers.test.ts` (14 cases: rotated half-extents + parametric overrides, centre/edge snap +
threshold, OBB containment, wall→face descriptors, static-AABB exclusion of moved/defless items,
IKEA-only snug-stack). Part of the ongoing modularization sweep. tsc/biome/full-suite green.

## Realism: "Trailing plant" hero decor primitive (RD-408) (v0.2.0.51)

A new parametric decor primitive — a raised ceramic pot with an upright crown tuft plus 4–6 vines that
arch out of the crown and **cascade down over the rim and below** — giving auto-furnished open shelving a
richer, distinct set-dressing read (clearly different from the upright `DeskPlant`). New
`primitives/TrailingPlant.tsx` (floor-anchored to `surfaceHeight`, footprint-centred, real metres, real
three materials; each vine is a deterministic index-seeded polyline of continuous stem segments with
paired oval leaves + seeded leaf-shade/length variety — no RNG, structurally connected to the crown).
Registered in `primitives/index.ts` + the `PrimitiveKind` union; new `trailing-plant` `ParametricDef`
(`noClip`, `surfaceHeight` param, `fullness`/`potColor`/`leafColor`/`potFinish` controls, drape-aware
footprint/verticalSpan); leads the auto-furnish prop list on `bookshelf`/`cube-shelf` (so it's placed even
at budget 1, where a cascade over open shelving reads best) and is a secondary option on
`console-table`/`sideboard`. Price entry + a decor-styling test added. No feature flag (enriches the
existing auto-furnish surface). Implemented by a parallel worktree agent; verified here (renders with
draping foliage over a surface, no clipping/z-fighting; full suite + 22 decor tests green).

## Photoreal: supersampled (SSAA) PNG export for crisp reference stills (PC2-SSAA-EXPORT / RD-411) (v0.2.0.49)

The hi-fi PNG export now renders at **2× the target resolution and box-downsamples** back to size, so
reference stills come out anti-aliased instead of jagged. New pure, unit-tested `src/scene/ssaaDownsample.ts`
`boxDownsample(src, factor)` (averages factor×factor RGBA blocks incl. alpha; output = floor(src/factor);
factor=1 identity; 9 tests). `ScreenshotController.renderHiFiPng` temporarily raises the renderer pixelRatio
by the SSAA factor (CSS size untouched), renders, reads the large frame into an offscreen 2D canvas →
`boxDownsample` → re-encodes at target dims; the exact prior size + pixelRatio are restored in a `finally`
(the 2× buffer is never presented — no visible flash) with a graceful fallback to the raw frame. No feature
flag — a transparent quality bump to the existing export. Verified headlessly: the exported PNG decodes at
the **target** dimensions (1600×1000, not 3200×2000) and the drawing buffer/pixelRatio are restored after
export (proving the downsample path ran); pixel-level AA quality is real-GPU-pending (SwiftShader headless).
Implemented in a parallel worktree agent and integrated here.

## Fix: 2D plan-editor grab-without-move no longer pollutes undo (BUG-016 follow-up) (v0.2.0.47)

The floor-plan editor's moving gestures (item / wall / vertex / opening / bulge / room-label / tour-stop
/ note drags) push an undo snapshot when the grab begins; grabbing then releasing without moving left a
dead undo step, like BUG-016 in the 3D scene. Added a single `dropRedundantHistory()` call at the top of
the editor's `onUp` — it covers every moving gesture at once and is a no-op when a real edit changed a
store reference (or when the grab never pushed). Completes the BUG-016 sweep across the drag, rotate, and
2D-editor gesture paths.

## Fix: rotate-gizmo grab without a turn no longer pollutes undo (BUG-016 follow-up) (v0.2.0.46)

The rotate gizmo's `onGrab` pushes an undo snapshot the same way `startDrag` does, so grabbing the ring
and releasing without rotating left a dead undo step. Applied the same fix: its release handler now calls
`dropRedundantHistory()` after the gesture settles, so a grab-without-turn is clean while a real rotation
(which changed an item reference) keeps its undo step. Reuses the action + tests added for BUG-016.

## Fix: clicking furniture no longer pollutes undo history (BUG-016) (v0.2.0.45)

`Furniture.onPointerDown` starts a drag (and `startDrag` eagerly pushes an undo snapshot) on every press
— so a plain click-to-select pushed a snapshot identical to the current state, and the user's *first*
undo afterwards did nothing (it popped the dead entry). `startDrag`'s push is load-bearing for real
drags, so the fix drops the redundant entry at drop time: new `dropRedundantHistory()` history action
pops the newest `past` entry only when it's reference-identical to the live state (sound because every
mutating slice replaces, never mutates, its array/object). `DragController.onUp` calls it after
`endDrag`, so a no-op click is clean while a real move/rotate/surface-snap (which changed an array
reference) keeps its undo step. Verified: a no-op click leaves `past` unchanged; a real drag still adds
one entry. +4 unit tests.

## Fix: surface-drop must respect storeys (PC2-SURFACE-DROP follow-up) (v0.2.0.44)

The surface-drop resolver shipped in v0.2.0.42 iterated every item regardless of level, so on a
multi-storey design (F13) a ground-floor decor item dropped under a table on the floor *above* would
snap to that upper table's height. Added a `levelId` filter (matching the level-aware collision
convention in `placement.ts` — `(it.levelId ?? 'ground')`), so only same-storey supports capture a
drop. `DragController` passes the dragged item's `levelId`. Caught by a self-audit of the new code
against the multi-level feature; +1 unit test (a table on `L1` is ignored for a ground drop but
captures an `L1` drop). Single-level designs (the default) are unaffected.

## QOL: surface-drop magnetism — decor snaps onto tables/shelves (PC2-SURFACE-DROP) (v0.2.0.42)

Dragging a surface item (a vase, lamp, bowl, books — anything that rests on a surface, identified by a
numeric `surfaceHeight` prop) onto a table or shelf now snaps its rest height onto that surface's top,
instead of keeping a stale height from wherever it came from (so it no longer floats above / clips into
the new surface). New pure `collision/surfaceDrop.ts` `resolveSurfaceDropHeight` finds the topmost
support under the drop point — items in the `tables`/`storage` categories, excluding soft seating/beds
and the dragged item itself — wired into `DragController.onUp`'s valid single-item commit, which updates
`props.surfaceHeight` via `setItems` so it rides the drag's single undo step. `surfaceHeight` lifts both
parametric self-lift primitives and GLB models, so one mechanism handles every surface item. Dropping
over open floor leaves the height untouched (no surprise yank). Resolver unit-tested (8 cases:
table/shelf hit, floor miss, soft-seating excluded, highest-of-overlapping wins, support elevation,
self-exclusion, footprint edge); integration verified end-to-end — a book stack dropped on the coffee
table snapped from 0 to 0.42 m.

## Feature gating: furniture groups behind a flag + ⌘K command (PC2-FURN-GROUP) (v0.2.0.41)

Audited furniture grouping against the backlog: the whole feature was **already built** — store
`groupsSlice` (groupItems / ungroup / groupRotate / addToGroup), group-aware drag (DragController),
group-mate-exempt collision, group-aware selection (selectItemGrouped / activeGroupId), exposed via the
multi-select inspector panel + the right-click context menu. The real gap was a hard-rule violation: it
shipped with **no feature flag**. Added the `furnitureGroups` flag (tier pro, default on per the
Simple-stays-minimal rule) and gated the panel's Group/Ungroup buttons, the context-menu items, and a
new Group/Ungroup ⌘K command (via `COMMAND_FLAGS`). Tested in both modes — resolver unit test plus a
live check confirming Group appears in Pro and is hidden in Simple while the sibling Mirror tool still
shows (so only grouping is affected). No behaviour change for Pro users; Simple's minimal core loop no
longer surfaces the advanced authoring tool.

## Fix: wall-finish preview now uses accurate Neutral tone-mapping (PC2-TONEMAP-EXPOSURE-CTX) (v0.2.0.40)

Context-aware tone-mapping (Neutral for accurate product colour while previewing a finish, filmic for
the everyday scene) shipped as RD-404, but the per-frame wiring only flagged "finish preview" when a
**room** was selected — selecting a **wall** to change its finish (the wall FinishPicker) was missed, so
wall colours were judged under the filmic look instead of the accurate Neutral one. Extracted a pure,
unit-tested `toneContextFromState` that flags finish preview for a selected room **or wall**, and wired
`Lighting` through it. (`photoMode` stays off — the only photographic context, the HQ-render modal,
renders in its own surface, not the live canvas.) Closes the PC2-TONEMAP-EXPOSURE-CTX backlog item
(largely already delivered by RD-404). Resolver + ctx-builder unit-tested (room/wall/none → Neutral/
filmic).

## Photoreal: contact-shadow decal under surface decor (PC2-CONTACT-AO-DECOR) (v0.2.0.39)

Small decor resting on a table/shelf (vases, bowls, books, plants, candles, frames, sculptures) had no
contact grounding, so it read pasted-on — the biggest cheap "is-it-really-sitting-there" realism gap on
the default flat tier. Each qualifying prop now renders a faint, soft contact-shadow decal at the host
surface height (reusing `scene/ContactShadow.tsx`, which gained `opacity` + `scale` params — the decal
is fainter/tighter than a floor blob). Qualification is pure + unit-tested (`furniture/surfaceDecal.ts`:
small `noClip` parametric decor carrying a numeric `surfaceHeight`; rugs, large pieces, GLB and
floor-standing items excluded — and `noClip` guarantees the floor-shadow path already skipped it, so no
double shadow). It's a cheap alpha quad (no render pass), gated by the existing `contactShadows` flag +
quality so it follows the same tiering as floor blobs. Verified: a candle cluster sits grounded on a
table with a soft shadow, no z-fighting; the floor lamp (no `surfaceHeight`) correctly gets none.

## Fix: auto-furnish decor double-lifted above its host surface (BUG-015) (v0.2.0.38)

Auto-furnish decor (cushions, throws, fruit bowls, books, plants, frames, sculptures, candles — the
`decorStyling` props on custom-plan furnish) floated at **~2× the host surface height** instead of
sitting on it. Every decor primitive self-lifts to its `surfaceHeight` in local space (like the built-in
tabletop defaults, which set `surfaceHeight` only), but `decorStyling` *also* set `elevation: topHeight`
on the item — and the render group adds `elevation` for parametric items, so the prop got lifted twice
(a book stack meant for a 0.42 m coffee table rendered at 0.84 m). Fixed by dropping the redundant
`elevation` (decor now carries `surfaceHeight` only, matching the proven-correct defaults pattern); no
collision impact since decor is `noClip`. Confirmed: a book stack with `elevation+surfaceHeight` visibly
floats twice as high as one with `surfaceHeight` only. Updated the two `decorStyling` tests that had
encoded the buggy `elevation == top` expectation. Found while scoping PC2-CONTACT-AO-DECOR.

## Perf: broadphase the furniture-drag collision/snug scans (PERF-003) (v0.2.0.37)

`DragController.onMove` ran two O(n) scene scans per pointermove — the snug-stack candidate search and
the `canPlace` collision check both walked every item. At scale (a full flat, 80+ items) that's wasted
work each frame of a drag. Now a **spatial grid of the static (non-moving) items is built once per drag**
(keyed by the moved-id signature, cleared on drop, since the un-dragged items don't move during a
gesture) and reused across moves to restrict both scans to the dragged item's neighbourhood: the
snug-stack uses a point query, `canPlace` a moved-AABB query. Alignment-snap deliberately keeps the
full scan (lining up with a distant item across the room is intended behaviour). The result is
**equivalent** — an item whose footprint AABB doesn't overlap the moved item's can't have an overlapping
OBB — proven by a new test sweeping the dragged item across 667 lattice positions and asserting the
broadphase-restricted `canPlace` matches the full-scene scan at every spot (both outcomes exercised),
plus a far-item-pruned check. Completes PERF-003 (the v0.2.0.15 wall-build dedup was the first half).
Smoke-verified: the room editor mounts + renders cleanly with the rewired controller.

## Reliability: harden align/distribute for rotated footprints (PC2-DISTRIBUTE-AXIS) (v0.2.0.36)

Audited the multi-select align/distribute path against the backlog concern (does it pick the right
axis + handle rotated footprints?). Findings: the axis is **explicit** — the inspector's Distribute/
Align-H vs -V buttons pass it, there's no fragile auto-inference to get wrong; rotated footprints
already project through `obbAxisHalf` (OBB→axis-aligned half) in `MultiSelectPanel` before reaching
`distributeEvenGaps`/`alignEdge`; and n<3 returns empty (graceful). No code bug. Closed the documented
gap by hardening the **OBB→distribute/align integration** with tests: a turned board distributes with
even edge gaps and aligns by its real projected extent (not a raw unrotated half), plus `obbAxisHalf`
sign-independence (±yaw) and π-periodicity. Test-only.

## Photoreal: per-board wood grain-direction flow (PC2-WOOD-GRAIN-FLOW) (v0.2.0.35)

Procedural wood floors (planks, parquet, herringbone) already varied each board's value/warmth/phase,
but every board's cathedral grain ran in the *same* direction — so a large floor read repetitive. Each
board now gets a tiny, deterministic grain **lean** (~±2.6°, a shear of the across-coordinate about the
board mid-length), so the figure flows board-to-board like real timber cut from different parts of the
log. New pure `procedural/woodPlank.ts` (`plankHash` — the stateless hash the parquet/herringbone
painters already used inline, now shared; `grainLean`; `shearAcross`), so the lean is derived from a
hash **independent of** the painters' existing tint stream — no regression to the tuned look, only the
new shear. Subtle by design (a larger angle reads as warped laminate). 14 unit tests (determinism,
bounded range, board-to-board variation, pivot symmetry); verified by painting the flat texture in the
browser — the six planks show grain leaning at distinct gentle per-board angles, no warping.

## UX: angle-snap walls while drawing in the 2D plan (PC2-PLAN-ANGLE-SNAP) (v0.2.0.34)

Freehand wall-drawing in the 2D editor produced walls a fraction of a degree off true (a parity gap vs
Sweet Home 3D / Coohom, whose walls snap to clean angles). Wall drafts now snap to **15° increments**
(covering 30/45/90°): the cursor distance is kept, only the direction rotates onto the nearest
increment. **Hold Shift** to draw at any angle. Order is grid → angle → wall-snap, so a join to a real
corner/edge still wins near existing geometry, and the live readout now shows the current **length +
angle**. Applies to desktop drag and mobile tap-to-place chaining. New pure `snapWallAngle` helper
(8 unit tests: horizontal/vertical/45°/30°, distance preserved, non-origin anchor, sub-min no-op,
custom increment); the editor splits `pointerGrid` out of `pointerWorld` to insert the angle step.
Verified in the editor: a ~3.6°-off drag committed at exactly **0.000°**, a ~41°-off drag at exactly
**30.000°**, both rendering as clean straight walls.

## Realism/UX: top-down furniture glyphs in the 2D plan (PC2-PLAN-FURN-ICONS) (v0.2.0.33)

The 2D plan editor's furniture footprints were plain category-coloured rectangles — hard to read at a
glance (a SH3D/Coohom parity gap). Each footprint now also shows the matching top-down **category
glyph** (reusing the existing `CategoryIcon`, currentColor), centred + sized to the footprint and
hidden when too small (<9px). It shows only when no text label covers the centre (labels off + not
selected), so it complements rather than clashes with the name/price labels. Beds, sofas, toilets/
sinks, kitchen appliances, tables, lamps and storage now read instantly. Verified in the editor (61
glyphs render correctly across every category, well-sized, no overflow/clutter). Additive SVG —
pointer-events off, so it never interferes with selection/drag.

## QOL: favourite finishes/materials (PC2-FAVOURITE-MATERIALS) (v0.2.0.32)

Favourites now extend to finishes, mirroring the furniture star. `favouritesSlice` gains a **separate**
`favouriteFinishIds` list (`toggleFinishFavourite`/`isFinishFavourite`, persisted to `hdb_fav_finishes`)
so finish ids never leak into the catalog "Favourites" tab. The FinishPicker swatches show a heart
toggle (reusing the proven `fav-btn` pattern, gated on the existing `catalogFavourites` flag) and
favourited finishes sort to the front of each surface group — on desktop (grid + heart per swatch) and
mobile (dropdown `★` prefix + a heart by the preview). Adds slice tests (separate list, add/remove/
dedupe, order); verified in the editor: 2 favourited floor finishes render filled + sorted ahead of the
rest.

## docs: reconcile the stale TODO master queue (v0.2.0.31)

The `TODO.md` "MASTER EXECUTION QUEUE" index listed many items as open that shipped in earlier
sessions (it was never struck through). Added an authoritative banner pointing to `CHANGELOG.md` as the
source of truth and enumerating what's SHIPPED (all BUG/REV/UX/MAT, PERF-001/002/004/005/007/008, most
RD) vs genuinely OPEN (PERF-003 broadphase half, RD-406/411/412 + other real-GPU items, the larger
PC2-* features) — so the next session doesn't re-do completed work. Docs-only.

## QOL: copy/paste a multi-selection as a group (PC2-MULTI-DUP-PASTE) (v0.2.0.30)

⌘C/⌘V previously copied only the primary selected item (duplicate ⌘D already handled multi). The
clipboard now holds the **whole selection** (one entry per item, each with its position), so ⌘C on a
multi-select then ⌘V pastes them all back as a group preserving the arrangement — reusing the proven
`planDuplicates` (shared-offset, collision-skipping) in one undo step, with the pasted copies selected.
`clipboard` is now `ClipboardEntry[] | null`; single copy is a one-element array (behaviour unchanged).
Adds a clipboard-slice test (array storage + deep copy + null/empty normalisation); verified end-to-end
in the room editor (2 selected → ⌘C → ⌘V → +2 copies, selected). Editing-gated like all copy/paste.

## Perf: short-circuit the SelectionOutline selector when nothing is selected (PERF-007) (v0.2.0.29)

`SelectionOutline`'s selector ran `s.items.filter(i => selectedItemIds.includes(i.id) && !hiddenItemIds
.includes(i.id))` on *every* store change (incl. each drag setter) — an O(n·m) scan even with no
selection. It now returns a stable empty array immediately when nothing is selected (the common case,
so an idle scene's store churn does no scan), and otherwise filters via `Set` lookups (O(n)). Same
result; existing selection tests stay green.

## a11y: UploadModelDialog dialog role + focus management (UX-003) (v0.2.0.28)

The model-upload dialog (a 560px custom flex panel with drag-drop zones, scan progress, and per-group
options) had `useModalGuard` + Escape but no `role="dialog"`/`aria-modal`, no focus trap, no focus
restore — keyboard users could Tab behind it and AT didn't announce a dialog. Rather than restructure
the complex layout onto the shared Modal, applied the same a11y wiring in place: the panel is now a
`role="dialog"` + `aria-modal` + `aria-labelledby` (the title), focus moves into it on open and restores
on close, and the existing key handler now also traps Tab/Shift+Tab within the panel. Layout unchanged.
This clears the last UX a11y item. (`border-blue-500` literal was already tokenised in v0.2.0.25.)

## a11y: UploadMaterialDialog → shared Modal (UX-009) (v0.2.0.27)

The material-upload dialog was a hand-rolled `.modal-overlay > .panel` that didn't even call
`useModalGuard` (global hotkeys fired behind it), with no `role="dialog"`/`aria-modal`, focus trap, or
focus restore. It now renders through the shared `Modal` (all of those for free), keeping the channel
slots / name / category / tile-size / swatch form and the Cancel/Save footer. Close (X / Escape /
backdrop / Cancel) routes through one `close()` that resets the form. Dev-only path; no behaviour change
beyond the a11y wiring.

## Realism: dress more host surfaces in auto-decor (RD-408) (v0.2.0.26)

Under-dressed rooms are the #1 "fake" tell. The decor-styling pass now also dresses three common
surfaces it previously skipped: **tv-console** (frames / sculpture / plant / books), **ottoman** and
**bench** (a folded throw / stray cushion) — added to `HOST_PROPS`/`HOST_MAX`/fallback maps with their
real top-surface heights. (`vanity` is intentionally skipped — its footprint height includes the
mirror, so decor would float.) Unit test asserts each new host gets ≥1 prop sitting at its real top
(no floating). Uses the existing, already-verified prop primitives + placement pipeline.

## tokens: add `--ok` success token; drop hardcoded colour literals (UX-005) (v0.2.0.25)

Adds a theme-tracking `--ok` success token (paired with `--danger`) to all 10 theme blocks in
`tokens.css` — a success green that respects light/dark + the 5 themes' contrast like every other
token. Replaces the hardcoded `text-green-600` "ready" status pill in the remote Browse tab with
`text-[var(--ok)]`, and clears the other stray colour literals the audit flagged in dev paths
(`accent-blue-500` / `border-blue-500` / `hover:bg-blue-50` in IkeaBody, GltfBody, UploadModelDialog →
`--accent`/`--accent-soft`). No `-green-/-blue-/-red-` literals remain under `src/ui` (non-test).
Build validates the new oklch token.

## a11y: import-errors detail dialog → shared Modal (UX-008) (v0.2.0.24)

`NotificationDetailsModal` (the "N items could not be imported" dialog) was a hand-rolled
`.modal-overlay > .panel` with no `role="dialog"`/`aria-modal`, no focus trap, no focus restore. It now
renders through the shared `Modal` (all of those for free), keeping the same title/list/Close-footer
content. Adds an RTL test that opens the dialog from a failed-import toast and asserts the `dialog` role
+ the failed-item list render. Drops the now-unused `createPortal` import.

## a11y: toolbar tooltips reveal on keyboard focus (UX-007) (v0.2.0.23)

Toolbar tooltips opened on `onPointerEnter` only, so a keyboard user tabbing to an icon button never
saw the label + shortcut hint (the accessible name was present, but no on-screen chip). `Tooltip` now
also opens on `onFocus` (immediately, no hover delay) and hides on `onBlur`, guarded by a `pointerFocus`
ref so the focus a *click* leaves on a button doesn't pop the tooltip — only keyboard focus does. Adds
RTL tests for the focus-shows / click-suppresses / blur-hides paths.

## a11y: CompassModal → shared Modal + keyboard-operable dial (UX-004) (v0.2.0.22)

The "Sun direction" dial was a hand-rolled `.modal-overlay` with no `role="dialog"`, no focus
trap/restore, and no keyboard path to change the heading. It now renders through the shared `Modal`
(dialog role + aria-modal + focus trap + focus restore + Escape, all for free), and the dial is a
focusable `role="slider"` (aria-valuemin/max/now/text) with arrow-key control — ←↓/→↑ nudge ±5° (±15°
with Shift), Home resets to 0° (north) — so keyboard users can set the sun. Drops the custom overlay,
`useModalGuard`, and the bespoke Escape listener (the Modal owns them). Adds an RTL test (dialog +
slider present, arrow/Home keys move `orientationDeg`); verified the dial renders cleanly in the Modal
on mobile.

## Realism: auto-decor cushion shape/fabric variety (RD-408 follow-up) (v0.2.0.21)

Extends the decor `VARIETY` system to also vary enum params, not just colour: auto-placed
throw-cushions now draw a seeded `shape` (mostly square, occasionally rectangular) and `pattern`
(mostly plain, occasionally striped) from weighted option lists, using the `ThrowCushion` primitive's
existing params — so a sofa's scatter reads as a real mix rather than stamped clones. Unit test asserts
cushions carry valid shape/pattern values; verified the default sofa still renders cleanly.

## Realism: auto-decor prop colour variety (RD-408) (v0.2.0.20)

Repeated soft goods and books from the auto-styling pass were identical clones — multiple cushions on
a sofa shared one fabric colour, books one spine colour. The clearest "auto-placed" tell.
`applyDecorStyling` now draws a seeded colour from a curated per-prop `VARIETY` palette
(throw-cushion/throw-blanket `color`, book-stack `spineColor`), offset by slot + a seeded start so
adjacent same-type props differ and hosts vary. Stays pure/seedable/deterministic. Unit test asserts a
3-seat sofa's cushions get ≥2 distinct colours (and the same seed reproduces them); verified the
default flat's sofa now shows a terracotta + a blue-grey cushion instead of clones.

## Realism: PHOTO-BEVELS on appliance bodies — RD-407 complete (v0.2.0.19)

Completes the bevel migration: all 8 appliance primitives (Refrigerator/WashingMachine/Dishwasher/
Oven/Microwave/WineCooler/Stove/RangeHood) now render their steel/painted bodies (and the proud door
panels on the dishwasher/oven, the stove cooktop, the range-hood canopy+duct) through `BeveledBox`
with a slightly rounder appliance-appropriate chamfer (~10–12 mm, auto-clamped) — real white goods
have radiused edges, so the hard 90° box read is gone. Glass doors, handles, controls, burners stay
sharp. Verified fridge/dishwasher/oven render as brushed-steel bodies with light-catching edges, no
artifacts. Also fixes `applianceBody.test.tsx`'s `featureFlags` mock to use `importOriginal` (the new
`BeveledBox → useDetail → store` transitive import needs `resolveFlags` preserved).

## Realism: finish PHOTO-BEVELS on case-good carcasses (RD-407) (v0.2.0.18)

Hard 90° edges are the clearest "primitive box" tell. The bevel migration (`BeveledBox` /
`safeBevelRadius`, auto-clamped ≤7 mm) was complete for tables/desks + Bookshelf + CabinetModule's
exterior, but **CabinetCorner was 100% sharp** and **Wardrobe** still had sharp interior panels. Now:
- **CabinetCorner** — carcasses, L-countertop slabs, doors, and toe-kicks render through `BeveledBox`
  (metal handles stay sharp — hardware reads better crisp).
- **Wardrobe** — interior shelves, drawer fronts, and the two-bay divider now bevel too (doors/sides/
  top/bottom already did).
Footprints are visually unchanged (chamfer ≤7 mm). Verified a corner cabinet + wardrobe close-up on
High: edges catch a soft highlight, no z-fighting or geometry breakage. (Appliance bodies share the
brushed-metal `applianceBody` path and are tracked separately for a later pass.)

## Realism: cheap window/glass fresnel + sky reflection on every tier (RD-405) (v0.2.0.17)

Real refractive transmission is High/Maximum only; on Performance/Medium the cheap glass path
(`getGlassMaterial` / `glassConfig`) was a flat transparent+opacity pane with no reflection. The cheap
glass now also carries an `ior` (1.5) — giving a physically-correct fresnel rim (brighter reflection
toward grazing angles) on any tier with lighting — and a faint `envMapIntensity` (0.6) so glassware /
cabinet panes catch the IBL sky probe on Medium. Both are inert on the IBL-less Performance tier, so
the flat default never regresses. Unit-tests assert the cheap-glass `ior`/`envMapIntensity`/roughness;
verified glassware (bar-cart shelves, floor vase) renders glassy on Medium with no artifacts.

## a11y: 44px close-button hit targets on bottom-sheet panels (UX-002) (v0.2.0.16)

On phones the catalog/inspector/finish-picker/plan-props and the `.aux` analysis panels (Budget,
Daylight, Clearance, …) dock as bottom sheets, but their header close **X** was a bare 26px
`.icon-btn` — under the 44px touch-target guideline (only the mobile *menu* sheet's X had the
treatment). Extended the existing invisible `::after` hit-area pattern to every docked-sheet
`.panel-head .icon-btn`, so the close control is a 44px tap target (26px + 2×9px) while keeping the
compact 26px visual. Measured the computed hit box at 390×844 (visual 26×26, hit 44px).

## Perf: de-duplicate the per-move wall build in the drag path (PERF-003, partial) (v0.2.0.15)

`DragController.onMove` built the placement-wall set twice per pointermove — once for the
flush-to-wall snap and again for the equal-spacing pass (identical
`placementWalls(state) ?? buildCollisionWalls(state.doors)`). Walls are immutable for the duration
of a drag, so it now resolves once (`dragWalls`) and feeds both passes — removing a full wall-build
per move on the hottest interactive path, with no behavioural change (the snap + spacing inputs are
byte-identical). The broadphase neighbour-restriction half of PERF-003 (bounding `others`/`canPlace`
to the dragged item's grid cell) is deferred — it changes the candidate set, so it needs a perf
harness + snap/validity-equivalence tests before shipping (tracked in `TODO.md`). Verified the
equal-spacing guides still render the same gaps via the `equal-spacing-guides` scenario.

## Fix: resumable-scraper edge cases (REV-002/003/004/005) (v0.2.0.14)

Hardens the dev-only Python scraper harness (`research/scrapers/`):
- **REV-002** — `Manifest.has`/`mark` now treat a falsy/empty key as never-done / never-persisted,
  so keyless items (a malformed search result with no id/url) no longer collapse onto one `""`
  manifest entry and silently skip each other on resume — they're reprocessed instead.
- **REV-003** — `Manifest._flush` `fsync`s the tmp ledger before the atomic rename, so a power-loss
  between write and rename can't leave a truncated `_manifest.json` and lose resume progress.
- **REV-004** — `download_file` retries the whole stream with backoff (a connection reset *mid-body*,
  after the 200, was previously unretried) and always unlinks the orphaned `.part` on failure.
- **REV-005** — `polyhaven_scraper` queries `?t=<type>` (the canonical param) instead of the `type=`
  alias, so a future API tightening can't yield an empty asset map.

## Fix: route baked-AO CanvasTextures through the anisotropy cap (REV-006) (v0.2.0.13)

The shared `CornerAO` corner-strip gradient and the `ContactShadow` radial blob were the two
`CanvasTexture`s created without `applyAnisotropy()`, against the RD-401 rule that routes *every*
CanvasTexture through the shared cap. Both are floor decals seen at grazing angles on the flat
(Performance) tier, where anisotropic filtering keeps the falloff crisp. Both now stamp the cap (and
register for the device-max re-apply on first render). Verified the flat-tier scene still renders the
grounding cues with no artifacts.

## Perf: lazy-load the Pro/analysis panels out of the boot bundle (PERF-004) (v0.2.0.12)

The eight Pro/analysis panels — Budget, Clearance, Daylight, DesignScore, Comments,
DrawingCallouts, Accessibility, Flags — were statically imported into `App.tsx`, so every first
paint (including the Simple-tier casual user who never opens them) downloaded + parsed them and
their pure cores (`designScore`/`accessibility`/`renovationCost`/`lighting2d`/SVG builders). They
now load through the existing `lazyComponents.tsx` `lazyWithRetry` pattern: each mounts behind a
`Suspense` boundary gated on its open flag (so the chunk leaves the entry bundle), and is added to
`preloadOnIdle.ts` so it's idle-warmed + offline-ready + instant-open like every other on-demand
chunk. `npm run build` confirms each panel + its analysis core split into its own async chunk.
Verified the Budget panel opens + renders correctly from its lazy chunk.

## Fix: two IDB cache hazards — meta race + transaction reuse (BUG-011/012) (v0.2.0.11)

- **BUG-011** — the remote-asset cache did `getMeta → mutate → setMeta` with awaits in between and
  no locking, so two *different* assets resolving concurrently (rapid clicks on two cards) could
  interleave and clobber each other's byte accounting (`remoteCacheBytes`/LRU drift). All meta
  read-modify-write cycles (`putAsset`/`getAsset`/`deleteAsset`/eviction) now run through one
  in-module promise chain (`withMetaLock`), and `evictUntilUnder` delegates to a new atomic
  `evictAssetsUntilUnder` that selects + accounts evictions in a single locked cycle. Adds a
  concurrent-put test asserting `totalBytes` equals the sum of both bundles.
- **BUG-012** — `putPanoCached` (and `evictPanoStop`) reused one IDB store handle across an `await`
  (put→getAll→delete), risking `TransactionInactiveError` once IDB auto-commits the transaction. Each
  now opens a fresh transaction per phase and issues the deletes without awaiting between them. Adds
  an over-cap eviction test that exercises the path without throwing.

## Fix: sloped walls honour per-wall + plan-wide thickness (BUG-009) (v0.2.0.10)

`slopedWallTriangles` derived its prism thickness from a hardcoded 0.2 m external / 0.1 m internal,
ignoring both the per-wall `thicknessM` override and the plan-wide `wallThickness` default that
`planWallThickness` honours for every flat wall — so a sloped wall with `thicknessM: 0.4` rendered
0.2 m thinner than its abutting flat neighbours. `slopedWallTriangles` now takes an optional resolved
`thicknessM` (falling back to the category default when omitted) and `PlanShell`'s `SlopedWallMesh`
passes `planWallThickness(wall, plan)`. Tests assert the prism cross-span matches an overridden 0.4 m
thickness and the 0.1 m default fallback.

## Fix: validate saved floor plans on load (BUG-014) (v0.2.0.9)

`loadFloorPlans` restored localStorage-persisted plans with only `JSON.parse` + `Array.isArray`
checks, casting parseable-but-malformed plans (e.g. missing `walls`/`rooms`) straight into the store
— unlike the autosave/designFile paths, which run Zod validation. That could feed bad geometry to the
renderer. It now runs each entry through the (newly exported) `FloorPlanZ` schema via `safeParse`,
dropping any that fail (the active plan falls back to the rebuilt default). Adds a unit test covering
valid restore, malformed-entry drop, malformed-active fallback, and corrupt JSON.

## Fix: strict angle parse + make "New apartment" undoable (BUG-010/013) (v0.2.0.8)

- **BUG-010** — `parseAngleInput` ran `parseFloat` on the raw string, so trailing garbage
  ("90xyz", "45 deg!", "90o", "3.5abc") silently parsed to a number instead of erroring. It now
  anchors an exact numeric regex (`^-?\d+(\.\d+)?$`) before parsing — matching `parseLengthInput`'s
  strictness — returning `NaN` for any unrecognised input so `validateAngle` can flag it.
- **BUG-013** — `newFloorPlan` replaced the whole plan without snapshotting history, so "New
  apartment" was not undoable and silently discarded the prior design. It now calls `pushHistory()`
  before swapping in the blank plan, so a single undo fully restores the prior plan.
- Tests: trailing-garbage rejection cases in `wallNumericEntry.test.ts`; an undo-restores-prior-plan
  case in `floorPlanSlice.history.test.ts`.

## Fix: catch failed remote-asset downloads in RemoteCard (BUG-005) (v0.2.0.7)

`resolveRemoteAsset` sets the card status to `'error'` (showing "Retry") and rethrows for its
in-flight integration consumers, but `RemoteCard.onClick` awaited it with no try/catch and the
call site discarded the promise (`void onClick()`) — so clicking a CC0 card while offline or on a
404 produced an unhandled promise rejection (console error / dev overlay), and `onResolved` could
wrongly fire. The await is now wrapped in try/catch that returns early on failure (the visual error
state is already handled by the slice). Adds a unit test asserting no `onResolved` on a rejected
download.

## Fix two resource leaks: wall-face geometry + thumbnail blob URLs (BUG-006/007) (v0.2.0.6)

- **BUG-006** — `WallSegment` FacePlane memoised `worldUvPlaneGeometry` but never disposed it,
  so editing ceiling height / wall thickness (which changes `segLen`/`segHeight`) or switching
  starter plans orphaned every wall-face plane geometry. Added `useDisposeGeometry(geometry)`
  (the same pattern RoomFloor/PlanRoomFloor already use). (`RoomFloor` was already covered by BUG-002.)
- **BUG-007** — `useThumbnail` (`catalog/remote/hooks.ts`) created a blob URL per CC0 thumbnail and
  never revoked it, leaking one URL per thumbnail viewed (drawer close / virtualised scroll). The
  URL is now tracked in a ref and revoked on **unmount only** — not in the main effect's cleanup,
  which re-runs on `url` change and would revoke the URL still being rendered. Adds a unit test
  asserting revoke-on-unmount + no-create-while-hidden.

## a11y: global prefers-reduced-motion handling (UX-006) (v0.2.0.5)

Only `.walk-hud` (and the loading overlay) honoured the OS "reduce motion" setting;
bottom-sheets, fades, popovers and toasts still animated. Added a global
`@media (prefers-reduced-motion: reduce)` reset in `app.css` that drops transition +
animation durations to 0.01ms app-wide (0.01ms — not 0 — so `transitionend`/`animationend`
keep firing for JS that waits on them), caps animation iterations, and disables smooth
scroll. CSS-only; the 3D render loop and JS camera tweens are unaffected, and users
without the setting see no change.

## Perf: defer + memoise catalog search ranking (PERF-005) (v0.2.0.4)

Typing in the catalog search re-ran the synonym-aware fuzzy ranking over the WHOLE
merged catalog (local + the large browsable CC0 index) on every keystroke, inside the
render body with no memoisation. `CatalogDrawer` now ranks against a `useDeferredValue`
of the query (the input updates instantly; the expensive rank runs in a non-blocking
deferred render) and wraps the result in `useMemo` keyed on the deferred query + the
memoised `useUnifiedCatalog` output + category/sort, so it only recomputes when those
actually change — not on unrelated re-renders (hover, etc.). Visible results are
identical (same ranking/order); existing catalog tests pass unchanged.

## Fix: make item rename undoable (BUG-008) (v0.2.0.3)

`renameItem` (`src/state/slices/itemsSlice.ts`) mutated the item label without a
`pushHistory()`, so renaming a piece could not be undone. It now snapshots history
before applying the change, with a no-op guard that skips the push (and the mutation)
when the trimmed label is unchanged — so undo reverts a rename in one step and a
redundant rename doesn't pollute the undo stack. Adds undo + no-op unit tests.

## Seed remote/CC0 GLB footprint from glTF accessor bounds (AI-INTEG-001b) (v0.2.0.2)

Remote (Poly Haven) furniture defs shipped `defaultFootprint:{w:1,d:1,h:1}` from
`bundleToFurnitureDef` (`src/catalog/remote/resolver.ts`) and only self-corrected
*after* `GltfModel` rendered — so pre-render placement, collision, catalog sizing,
and budget all used a wrong 1×1×1 m guess.

**Fix.** New pure helper `src/catalog/remote/gltfBounds.ts:gltfJsonFootprint(gltfJson)`
unions every POSITION accessor's `min`/`max` from the already-parsed glTF JSON the
provider hands us (mirrors the proven `src/catalog/packs/footprint.ts:glbFootprint`
*GLB-bytes* path, but for parsed JSON — no Three.js / GLTFLoader / render, runs in
Node + jsdom). `bundleToFurnitureDef` now seeds `defaultFootprint` from it, falling
back to the old 1×1×1 placeholder when bounds are unavailable or absurd. Edge cases:
multi-mesh union, near-flat axis clamped to 0.05 m, a metre sanity clamp that rejects
non-metre (cm/mm) scales, no POSITION accessor → fallback. The render-time
`GltfModel` bbox measurement stays authoritative and still self-corrects; this only
makes the *pre-render* value honest. Unit tests: `gltfBounds.test.ts` (bounds / union
/ clamp / fallback) + `resolver.test.ts` (seeded footprint ≠ 1×1×1; fallback case).
No version bump here (orchestrator does the consolidated bump at integration).

## Fix milky Maximum render + dark ground rectangle (RD-409/RD-410) (v0.2.0.1)

Two reported high-tier render bugs, root-caused at runtime via the scene graph + before/after
screenshots.

**RD-409 — washed-out / milky Maximum (and High) in daylight.** The post-stack Bloom
(`scene/EffectsImpl.tsx`) used `luminanceThreshold={1.05}` — low enough that broad sunlit
surfaces (white walls/ceilings under the day IBL probe at ~1.2 graded exposure) cleared it and
bloomed, smearing a milky white veil across the whole frame (confirmed: disabling the post
stack removed the veil; isolating bloom reproduced it). Raised the threshold to **1.35**
(above daytime diffuse, below the night fixtures), softened the knee (`luminanceSmoothing`
0.15→0.25) and trimmed `intensity` 0.6→0.45. Centralised as `look.BLOOM` (pure, unit-tested).
The light-fixture emissive peaks (`scene/lighting/fixtureGlow.ts`) were lifted in lock-step so
genuine emitters still bloom with margin (shade peak 1.33→~1.60, strip 1.66→~1.80, bulb
1.85→~2.05); a new test pins `BLOOM_LUMINANCE_THRESHOLD === look.BLOOM.luminanceThreshold` so
they can't drift apart. Verified: Maximum daytime is now crisp + saturated, Performance/Medium
unchanged, and a night scene still glows on the fixtures.

**RD-410 — large dark rectangle on the ground.** Runtime scene-graph traversal found a single
19.1 × 19.1 m `ShaderMaterial` plane at y≈0.01 (drei `SoftShadowMaterial`) — the
`AccumulativeShadows` ground catcher in `scene/ShowcaseController.tsx`
(`scale = max(W,D)*1.5 = 19.125`), which mounts at Medium+ when the camera parks. That
component assumes a single hero object floating over an empty floor; for a full apartment
(which has its own floor + real-time PCF sun shadows + contact-shadow blobs + corner AO) it
caught the building's own silhouette and rendered it as a dark rectangle larger than the
footprint. The capture paths (screenshot/panorama) only render one synchronous frame, which
never converges the accumulation, so it added the unconverged plane for no benefit. Retired
the accumulator: `showcase: false` on every quality preset, `ShowcaseController` renders
nothing (and pins `showcaseAccumulating=false`), the capture-path `showcase` overrides + the
Graphics "Showcase stills" toggle removed, and the now-dead `scene/showcase.ts` state machine
deleted. Legitimate grounding (contact shadows + corner AO + real sun shadows) is untouched.
Verified: no large ground plane remains in the scene graph and the rectangle is gone.

## Brushed/satin metal material + wired appliances (MAT-004/004b) (v0.1.0.48)

Appliance bodies (and any steel-bodied primitive) rendered as flat grey plastic — `applianceFinish('steel')`
was a scalar metalness/roughness with no directional brushing, so a fridge read like a painted box.

**MAT-004 — brushed-metal material.** New pure, deterministic, worker-safe helper
`src/materials/procedural/metalBrush.ts` (`buildBrushedMetalFields(size, seed, BrushParams)`)
bakes the one cue brushed steel always carries: **directional brush hairlines** running along U —
a fine value-noise lattice sampled WIDE across U and NARROW along V (with a slow drift warp so the
grain wavers, not ruled lines), returning a height field (→ baked normal) + a signed roughness
streak delta. Row-variance ≫ column-variance is the brush signature (unit-tested). New
`getMetalMaterial(color, finish, repeat)` in `furnitureMaterials.ts` returns, **under
`pbrSurfaces`**, a `MeshPhysicalMaterial` with the shared brush normal + roughness-streak maps
(one 256² singleton, cloned per material) and three.js `anisotropy` (the swept highlight,
`anisotropyRotation = 0` so the sweep follows the U hairlines); finishes `stainless` / `satin` /
`black-steel` pick the metalness/roughness + brush/anisotropy preset (tint from the caller). With
the flag **off** it returns a plain `MeshStandardMaterial` carrying just the finish's
metalness/roughness — the legacy flat steel look, no maps, no cost on the flat tier. Tasteful, not
chrome-mirror; cached per `(finish, color, repeat)`. Albedo/tint sRGB, normal/roughness linear.

**MAT-004b — wired appliances.** The 8 steel-bodied appliance primitives
(`Refrigerator`/`Oven`/`Stove`/`RangeHood`/`Dishwasher`/`Microwave`/`WashingMachine`/`WineCooler`)
route their body through the new `applianceBody(color, finish)` helper (`primitives/shared.tsx`):
steel → the shared brushed-metal material set on the body mesh's `material=` prop (one cached
instance reused across every body part + appliance); non-steel ('matte'/'gloss') keeps the legacy
`applianceFinish` props spread. Glass doors, control panels, handles, knobs are untouched.

Tier-gated via the existing `pbrSurfaces` flag (no new user flag — same gate as the other material
micro-normals). Tests: `metalBrush.test.ts` (directionality / determinism / range / streak:0
collapse), `metalMaterial.test.ts` (physical+anisotropy+maps on / plain off / cache identity /
black-steel vs stainless, BOTH flag states), `applianceBody.test.tsx` (steel→shared material,
non-steel→props, flat-tier fallback, all 8 primitives smoke-render). Scenarios
`scripts/scenarios/brushed-metal-appliances.json` + `brushed-metal-closeup.json`.

## Richer auto-decor — density budget + position spread + rotation jitter (RD408-001/002/003) (v0.1.0.47)

Auto-furnished (Smart Start / preset) rooms read sparse + obviously machine-placed: the
set-dressing pass (`src/furniture/layout/decorStyling.ts`) capped every host at **2 props**,
stacked them at one point on the X axis, and shipped them all at `rotation: 0`. RD-408's A-chain
core makes them read richer + more natural without clutter, collisions, or a perf blowup
(everything stays pure, seeded + deterministic so unit tests are stable; all props are still
`noClip` table-top decor — no collision math):

- **RD408-001 — density budget.** Replaced the flat `MAX_PER_HOST = 2` with a per-surface budget
  derived from the host's footprint **area** and a conservative **per-type ceiling**:
  `budget = clamp(round(area / AREA_PER_PROP=0.45), 1, HOST_MAX[type])`. A 3-seat sofa now gets up
  to 4 cushions/blankets, a dining table up to 3, while a nightstand stays ≤2 and a side table ≤1.
  A per-room total cap (`ROOM_DECOR_CAP = 10`, lowest-priority trimmed from the tail in
  `applyDecorStylingForPlan`) keeps density bounded for taste + perf.
- **RD408-002 — position spread.** Replaced the single-axis `offsetPos` with `slotPositions`, which
  lays props out across the host's **real footprint** (long axis run + alternating near/far short-axis
  row), **rotation-aware** (the local offset is rotated by the host's yaw into world X/Z so the spread
  aligns to a wall-flushed, rotated sofa/bed), with a small seeded jitter (`POS_JITTER = 0.04 m`).
  Offsets are clamped to the footprint half-extents so props never spill off the host edge.
- **RD408-003 — rotation jitter.** Each prop now gets a small seeded yaw around the host facing
  (`host.rotation ± ROT_JITTER`); soft goods (cushions/blankets ≈ ±20°) tilt more than precise
  objects (frames/sculptures ≈ ±8°), so nothing is dead-square. (The mesh already wired
  `item.rotation`; the pass simply stopped hardcoding `0`.)

No new feature flag — this enriches the existing auto-furnish surface. `decorStyling.test.ts`
extended: budget scales with area, per-room cap, in-footprint + non-overlapping spread,
rotation-aware spread, bounded non-zero + deterministic rotation jitter. Visual check (4-room HDB
furnished via a custom plan) confirmed sofas/dining tables/beds read richer with props spread +
slightly rotated, no clutter / floating / clipping.

## Plaster/concrete roller-nap roughness micro-detail (MAT-003) (v0.1.0.46)

Painted plaster / microcement walls rendered as a dead-flat matte colour — a single roughness
value with no surface life. New pure, deterministic, worker-safe helper
`src/materials/procedural/plasterSurface.ts` adds the one cue roller-applied paint always carries,
mirroring the stone/tile/upholstery pattern: a **roller-nap roughness drift**
(`makeRollerNap(seed, nap)` — a broad coverage drift, as the nap loads/unloads, plus a fine
nap-fibre stipple; signed, mean-preserving, ±~0.035 of the roughness). So the matte wall stops
reading as one flat specular value while staying clearly **matte** (never gloss — overdoing it
looks like stucco). Wired into both material paths:
- **Path A** (`procedural/patterns/wall.ts:plasterFields`): the previously-constant `0.92`
  roughness now drifts by the nap field (`clamp01(0.92 + nap)`). No flag, all tiers — the
  roller-nap rides every direct procedural plaster generation (and the normal it bakes is
  unchanged). The existing gentle orange-peel field still supplies the whisper of normal relief.
- **Path B** (`procedural/generators.ts:getPlasterNormal`/`getPlasterRoughness` → wired in
  `cache.ts`): the shared plaster singleton now also bakes a **roughness-drift map** from the SAME
  tile, **gated behind `pbrSurfaces`** (off → the legacy flat `roughness = 0.92` scalar, exact
  no-op). It's a tint-independent multiplier over the base scalar (like the shared normal), so
  every tinted wall colour reuses one 256² map for free — no per-colour generation. (The plan
  noted Path B "has no roughness map" — it does now, the same clean shared-singleton route MAT-001
  took for marble.)

Tasteful + bounded by default (`DEFAULT_PLASTER_SURFACE_PARAMS`; `nap` is a 0..1 intensity, `0`
cleanly drops the drift back to flat matte). Albedo stays sRGB, normal/roughness linear. Batten /
fluted / concrete-floor / terrazzo painters untouched. Unit-tested
(`procedural/plasterSurface.test.ts` + a MAT-003 block in `generators.test.ts`): drift present,
deterministic, seed-varying, intensity-linear, bounded by the tasteful amplitude, and — the whole
point — every drifted texel stays in the matte range. Visually verified at the maximum tier
(grazing morning light): walls read as real matte painted plaster, no stucco bumps, no tiling, no
z-fighting, no gloss creep; Performance tier stays flat per the tier rule.

## Cap live fixture lights in orbit mode (PERF-002) (v0.1.0.45)

Orbit mode rendered **every** light-emitting fixture as a real `pointLight`/`spotLight`,
bypassing the `maxFixtureLights` budget that walk mode respects — a furnished night home
reached 30–50 live lights, and Three.js evaluates every non-shadow light per fragment over
the whole framebuffer, so cost scaled linearly in the densest (default) view. Now both modes
obey the tier-aware budget via a new pure, unit-tested helper
`src/scene/lighting/chooseEmitters.ts`:
- **walk** (`firstPerson`) caps to the nearest `maxFixtureLights` (unchanged).
- **orbit** caps to the nearest `maxFixtureLights * ORBIT_BUDGET_MULTIPLIER` (×3) — a higher,
  still-bounded budget because the whole home is visible, instead of "show all". The dropped
  fixtures are the farthest from the camera, so ambient/fill + emissive materials keep the
  scene reading well-lit (verified before/after: identical-looking interior).
The existing nearest-N rank + camera-move/items gate are reused; the gate now also recomputes
on an orbit↔walk mode switch (the budget differs by mode). `chooseEmitters` is a no-op (returns
the same array) when under budget, and handles zero emitters / zero budget.
- **Verified (headless, night orbit, performance tier, 20 ceiling-light emitters):** live
  `pointLight` count dropped from **20 → 6** (`2 × 3`); scene-graph probe + before/after
  screenshots confirm no visible darkening or missing-light artifacts.

## Stone/marble micro-detail (MAT-001) + CreditsModal safeUrl (REV-001) (v0.1.0.44)

Polished stone/marble read as a flat specular plane. New pure, deterministic, worker-safe helper
`src/materials/procedural/stoneSurface.ts` adds the two cues real polished slabs carry, mirroring
the tile/upholstery pattern (`tileSurface.ts` / `upholsterySeams.ts`): a **vein normal-relief**
(`veinHeight(veinMask, veinRelief)` — a shallow, tunable height lift driven by the SAME vein mask
the painter already uses for the albedo, so the baked normal catches grazing light exactly where
the visible veins are) and a **polished roughness drift** (`makeRoughDrift(seed, roughDrift)` — a
broad, low-freq, signed roughness delta so the polish is non-uniform glossier/honed patches rather
than a dead-uniform mirror). Wired into both material paths:
- **Path A** (`procedural/patterns/stone.ts:marbleFields`): the inline `veinMask * 0.4` height is
  now routed through `veinHeight` (same value, but tunable + documented — no double-relief), and
  the broad polished drift is added to the existing micro-roughness break-up. Rides the existing
  procedural maps on all tiers (cheap, no new flag — like the RZ4 micro-detail).
- **Path B** (`furnitureMaterials.ts:getMarbleMaps`/`getStoneMaterial`): the shared marble
  singleton gains a **roughness drift map**, gated behind `pbrSurfaces` (the realism flag, same
  gate as the existing PR6 tonal cloud); when off, the legacy uniform polish (no rough map) is
  unchanged. The drift map is a multiplier clamped ≤ 1 so it only ever makes patches a touch
  glossier than the polished base — never matter (no regression). The vein normal-relief on the
  singleton already followed both visible vein networks and is left as-is.

Tasteful by default (`DEFAULT_STONE_SURFACE_PARAMS = { veinRelief: 1, roughDrift: 1 }`;
`veinRelief: 0` drops the relief, `roughDrift: 0` collapses the drift). Albedo stays sRGB;
normal/roughness linear. No geometry, so nothing to z-fight. Unit-tested: `stoneSurface.test.ts`
(vein-relief proportionality/intensity, drift determinism/bounds/±sign, clean `0` disable),
`generators.test.ts` (marble normal non-flat along veins, roughness spread, determinism),
`stoneRoughDrift.test.ts` (rough-map present under `pbrSurfaces`, absent when off — both modes).

## Gate remote CC0 furniture behind a `remoteFurniture` flag (pro tier) (AI-INTEG-001a) (v0.1.0.43)

Poly Haven (and any remote-provider) **3D models** were already surfacing in the catalog grid in
production with **no feature flag and no Simple/Pro tiering** — a rules violation (CLAUDE.md
requires every user-facing feature behind a `FEATURE_FLAGS` entry, and Simple mode must stay the
minimal core loop). Bring that path into compliance, mirroring the existing `remoteMaterials`
flag that gates the CC0 *material* browser.

- **New `remoteFurniture` flag** (`features/flags/registry.ts` + `types.ts`): `tier: 'pro'`,
  `default: true` (CORS-direct CC0 → prod-safe, no proxy / licence risk). Parity with
  `remoteMaterials`. Because it is `pro`, `resolveFlags` forces it **off in Simple mode**, so the
  existing `useFeature` gates hide remote models there automatically.
- **Browse gate:** `useUnifiedCatalog(includeRemote)` now takes the flag (`CatalogDrawer` passes
  `useFeature('remoteFurniture')`); when off, the un-downloaded remote-entry merge is skipped, so
  the grid shows only the curated builtin furnish loop and remote CC0 models do not surface
  (desktop + mobile share the same hook, so both are covered).
- **Bootstrap gate:** the drawer only kicks off `bootstrapRemoteCatalog()` when
  `remoteFurniture || remoteMaterials` is on — so with both off (e.g. Simple mode), the remote
  provider index is **never fetched** (no network).
- **Placed items unaffected:** the scene render path (`buildMergedCatalog` → `useCatalog`) merges
  resolved remote defs unconditionally, so a design saved with a remote model still renders when
  the flag is off — gating affects the **browse/add** path only, not already-placed items.
- **Tests (both modes + no-fetch):** `featureFlags.test.ts` asserts `remoteFurniture` is hidden in
  Simple / present in Pro (both build kinds) and mirrors `remoteMaterials`;
  `ui/catalog/remoteFurnitureGating.test.tsx` asserts the grid shows the remote card with
  `includeRemote=true`, hides it with `false`, and that a resolved (placed) def still merges +
  renders with browsing off; `ui/catalog/remoteFurnitureBootstrap.test.tsx` renders `CatalogDrawer`
  and asserts the provider `fetchIndex` is NOT called in Simple mode but IS in Pro. Scenario rung
  `scripts/scenarios/remote-furniture-gating.json`. Visual verification confirmed seating count
  11 (Pro, CC0 card + badge present) → 10 (Simple, no CC0 card/badge); the Packs tab + Design
  button are also correctly hidden in Simple.

## Tile/ceramic glaze micro-detail — orange-peel micro-normal + glaze↔grout roughness contrast (MAT-002) (v0.1.0.42)

Glazed tile/ceramic surfaces read flat. New pure, deterministic, worker-safe helper
`src/materials/procedural/tileSurface.ts` adds two cues that sell real fired ceramic, mirroring
the upholstery pattern (`upholsterySeams.ts`): a fine **orange-peel glaze micro-normal** on the
**tile face only** (`makeGlazePeel(seed, glaze)` — a signed, centred fbm height delta at a fine
integer pitch, tiny amplitude) and an explicit **glaze↔grout roughness contrast**
(`glazeRoughness(isGrout, grout, micro)` — glossy glaze ~0.16 vs matte cement grout ~0.92, with
the painter's existing per-texel micro break-up folded in). Wired into the three glossy-ceramic
Path-A painters in `procedural/patterns/tile.ts` — `tileFields`, `hexagonFields`, `subwayFields`
(checker/brick are not ceramic, untouched). Because the painter owns the grid and only *asks* the
helper for the face peel + contrasted roughness, the micro-normal and roughness **align with each
painter's visible grout** for free (square / honeycomb / running-bond), over any base/grout colour
or width. Tasteful by default (`DEFAULT_TILE_SURFACE_PARAMS = { glaze: 1, grout: 1 }`; `glaze: 0`
drops the orange-peel, `grout: 0` collapses the contrast). Albedo stays sRGB; normal/roughness
linear. Path-A micro-detail rides the existing procedural maps on all tiers (cheap, no new flag) —
on the default Performance/flat renderer the grout grid + matte/glaze split still read; the glaze
sheen lifts further on PBR tiers. Unit-tested: `tileSurface.test.ts` (peel determinism/bounds/
glaze-0 drop/linear-scale; roughness contrast/blend/clamp) + `generators.test.ts` (grout column
markedly rougher than a glaze-face column AND that band lands on the grid edge → alignment; face
normal non-flat; hex+subway carry the spread; deterministic).

## Flat-tier wall/floor corner-AO grounding decals (RD-403) (v0.1.0.41)

Cheap baked ambient-occlusion darkening where walls meet the floor, so corners
read grounded on the default flat **Performance** tier (and **Medium**) — which
have no SSAO. A new `scene/CornerAO.tsx` `WallFloorAO` renders one alpha-blended
floor quad along each interior wall-face base, textured with a single **shared**
1D gradient (dark at the skirting, fading into the room over `CORNER_AO_REACH`).
It mounts inside the wall's local frame in `WallSegment.tsx`, so it inherits the
wall's position/rotation and follows any wall edit for free; `depthWrite:false` +
a small `+Y` offset + `polygonOffset` keep it off the floor with no z-fighting.
- Pure sizing/tier-gating helpers in `scene/cornerAoMath.ts` (`cornerAoStripDims`,
  `cornerAoEnabledForTier`), unit-tested (`cornerAoMath.test.ts`).
- Tier-aware: new `cornerAo` `QualitySettings` flag — **on** for `performance`/
  `medium`, **off** for `high`/`maximum` (their post stack runs SSAO, so the baked
  strip would double-darken). `quality.test.ts` asserts the predicate ⇔ presets and
  that it never coexists with `postprocessing`.
- Gated behind a new **`cornerAo` feature flag** (`features/flags/registry.ts`) —
  **simple tier, default on** (pure code, no external assets → prod-safe). The wall
  segment ANDs the flag with the per-tier quality setting. Both-mode tested in
  `featureFlags.test.ts`.
- Complements the existing RZ1 under-furniture contact blobs (left unchanged); this
  is the corner-contact cue the deep-dive flagged as the biggest flat-tier weakness.
  Custom-plan (`PlanShell`) walls are a follow-up — the default apartment (the move-in
  flat) is covered.

## Asset-source scraper suite — 35 resumable, rate-limited downloaders (v0.1.0.40)

`research/scrapers/`: one `<source>_scraper.py` for every source in
`research/MODEL_LIBRARIES.html` that is scrapable / programmatically downloadable (35
sources + the shared `scraper_common.py` harness + `_retailer.py` sitemap-crawler +
`polyhaven_scraper.py` reference). Every script is **resumable** (JSON manifest, `.part`→
rename), **rate-limited** (`--rps` + 429-aware backoff), stdlib-first, and records per-item
license for downstream commercial filtering. Covers CC0/CC-BY APIs (Poly Haven, ambientCG,
Poly Pizza, Quaternius, Kenney, Google Scanned Objects, Redwood, Sketchfab, Smithsonian,
Thingiverse, OpenGameArt, Three D Scans), material/HDRI sites (cgbookcase, 3DTextures.me,
CGEES, HDRMaps, FreePBR), datasets (ABO, Objaverse 1.0/XL, ShapeNet, 3D-FUTURE, 3D-FRONT,
Pix3D, OmniObject3D), dev-only retailer AR (Wayfair API + Castlery/Crate&Barrel/Target/
Houzz/Article/West Elm/Amazon via `_retailer.py`), and marketplace/AI APIs (CGTrader,
Meshy, Tripo). `NOT_SCRAPABLE.md` documents auth/ToS/anti-bot-blocked sources. All 37 files
pass `py_compile` + `--help`. (IKEA excluded — already implemented.)

## Fix (security): neutralize CSV formula injection in exports (SEC-002)

The three CSV builders — `src/export/boq.ts` (`boqToCsv`), `src/ui/furnitureCsv.ts`, and
`src/ui/shoppingCsv.ts` — did RFC-4180 field quoting but never neutralized leading formula
characters, so attacker-controllable text (item/material/room names, quote-template branding) that
starts with `= + - @` (or TAB/CR) became a live formula when the CSV was opened in Excel / Google
Sheets / LibreOffice (`=HYPERLINK(...)` exfiltration, `=cmd|...` DDE). Added a shared
`src/utils/csv.ts` (`csvSafeField` + `csvNumberField`): `csvSafeField` prefixes a single quote `'`
when the first char (also when hidden behind a leading `"`) is a formula lead — the standard OWASP
CSV-injection defense — then applies RFC-4180 quoting; `csvNumberField` emits genuine numeric
columns verbatim so legitimate negative numbers stay numeric. All three builders now route every
user-controlled text field through `csvSafeField` and every numeric column through `csvNumberField`.
Normal values are unchanged. Unit-tested in `src/utils/csv.test.ts` plus formula-injection cases in
each exporter's test (the `.xlsx` export was already safe — inline strings).

## Fix (security): sanitize def URL schemes to block javascript:/data: XSS (SEC-001) (v0.1.0.38)

A crafted `.sofa.json` import could carry furniture defs whose `sourceUrl` / IKEA
`productInfo.documents[].url` / `mainImageUrl` were `javascript:…` or `data:text/html,…`; the
file-import path keeps `userFurniture` (incl. `source:'ikea'` defs and their URLs), and the
inspector rendered those straight into an `<a href>` / `<img src>` with no scheme check — so
clicking the "Source" / "(PDF)" link executed script in the app origin (XSS). Added a shared,
pure, unit-tested sanitizer `src/utils/safeUrl.ts` (`safeUrl`/`safeHref`/`sanitizeUrlField`):
a scheme **allowlist** (`http:`/`https:`/`mailto:` + scheme-less relative & protocol-relative
URLs) applied **after** stripping whitespace/control chars and lowercasing the scheme, so
` javascript:`, `JavaScript:`, and `java\tscript:` are all rejected; `data:`/`vbscript:`/
`file:`/any other scheme are dropped. Applied at every def-derived render sink — `SourceLine`
(`sourceUrl`), `IkeaBody` (document anchors fall back to inert text, image `<img src>`), and
`BudgetPanel` retailer offers (now also `rel="noopener noreferrer"`) — **and** hardened at the
trust boundary in `state/schema.ts` via a Zod transform that neutralizes the `sourceUrl` and
`productInfo` URL fields on import (set to `undefined`; import stays back-compatible, never
throws). The IKEA variant `url` sink was already covered by `shoplist.ts:sanitizeUrl`. Tests:
`safeUrl` (allow http/https/mailto/relative; reject obfuscated/cased javascript:/data:/vbscript:),
a schema-import test (a `.sofa.json` with `javascript:`/`data:` URLs imports with each URL
neutralized and the rest of the def intact), and a `SourceLine` inert-link test.

## Fix (a11y): announce toasts via ARIA live regions (UX-001)

The toast/notification stack (`src/ui/notifications/NotificationContainer.tsx`) was silent to
screen readers — its `.toast-host` container had no `aria-live`/`role`, so success/error/progress
toasts never reached assistive tech. Added two visually-hidden, always-mounted live regions: a
**polite** `role="status"` region for info/success/progress and an **assertive** `role="alert"`
region for errors (so errors interrupt). A `useToastAnnouncer` hook announces each toast exactly
once — keyed by toast id + kind — so progress *value* ticks never re-announce (no announcement
spam), while a progress toast resolving to success/error does re-announce. Each region holds only
the newest message (`aria-atomic`), so screen readers read it once. The visible stack stays in the
a11y tree (interactive Dismiss / View-details buttons remain reachable) but is **not** itself a live
region, so it can't double-announce. Empty state mounts the (empty) regions without stray noise.
Visual appearance/layout/animation unchanged (verified light + dark); CSS tokens untouched. New RTL
tests assert region roles/aria, error→assertive vs info→polite routing, no progress-tick spam, and
progress→success re-announcement.

## Fix: room area = rectilinear union polygon (BUG-004) (v0.1.0.34)

`planRoomArea` summed `main + extension` rectangles, double-counting the overlap
for L-shaped rooms whose extension overlaps the main rect (e.g. reporting 40 m²
where the true union is 36 m²) — disagreeing with the rendered floor polygon and
`planRoomPerimeter`, and propagating the inflated figure into the finishes
schedule, design score, daylight check, BOQ, and on-plan area labels. Now computes
`polygonArea(roomPolygon(r))` — the SAME rectilinear union outline used for the
floor render and perimeter — establishing the invariant
`planRoomArea(r) === polygonArea(roomPolygon(r))` for all room kinds (simple rect,
overlapping/non-overlapping L-extension, explicit polygon). Adds invariant unit
tests; full suite green (2957).

## Fix: persist uploaded-material name/category/uvScale/swatch (BUG-003, v0.1.0.31)

Uploaded materials lost their identity/appearance on reload. `persistUserMaterial`
(`materials/upload/persist.ts`) wrote only `{ matId, role }` into each channel's IDB meta,
so on boot `hydrateUserAssets` (`state/storage/hydrateAssets.ts`) had nothing to restore
from and fell back to hardcoded defaults — `name → matId.slice(0,8)`, `category → 'floor'`,
`swatch → '#cccccc'`, `uvScale → [1, 1]` — corrupting every user material's library entry.

- **Persist** the full identity/appearance on **every** channel record's meta: `name`,
  `category`, `swatch`, plus `uvScaleX`/`uvScaleY` (stored as two scalars because the
  open-ended IDB meta value type forbids arrays). The albedo channel is the one hydration
  reads, but stamping all channels keeps the data even if albedo were ever dropped.
- **Hydrate** reads those fields back with per-field type guards; partial/garbage `uvScale`
  (only one axis present) cleanly falls back to `[1, 1]` rather than producing `NaN`.
- **Back-compat (no schema bump needed):** the IDB store keeps its open-ended `meta` bag, so
  legacy records saved before this fix simply lack the new keys and hydrate with the original
  defaults — no migration, no crash.
- **Tests:** `state/storage/hydrateMaterials.test.ts` (round-trip of name/category/uvScale/
  swatch, legacy-record defaults, albedo-only, garbage uvScale, multiple materials) and
  `materials/upload/persist.test.ts` (real `persistUserMaterial` → `hydrateUserAssets`
  round-trip with mocked image decode).

## Fix: memoise + dispose plan-room floor/ceiling geometry — stop GPU leak (BUG-002)

The custom-plan room floor leaked a fresh `PlaneGeometry` on **every** render: the
rectangular path in `apartment/floor/PlanRoomFloor.tsx` called `worldUvPlaneGeometry`
inline with no `useMemo` and no disposal. R3F does **not** own a geometry passed via the
`geometry=` prop, so every re-render (and every plan edit) leaked a GPU buffer, ratcheting
toward WebGL context loss in a long editing session.

- **Rectangular floor** (`PlanRoomFloor.tsx`): extracted a dedicated `RectFloor` component
  whose geometry is `useMemo`-keyed on `width/depth/texScale/texAngle` and freed via the
  established `useDisposeGeometry` hook (`scene/geometryUtil.ts`) on change/unmount. Added a
  zero/negative-size guard (renders nothing instead of building a degenerate buffer).
- **Same anti-pattern fixed in the sibling floor components in that dir:** `PolygonFloor`
  (same file — already memoised, now also disposed), `RoomFloor.tsx` (the default-flat per-room
  floor), and `PlanRoomCeiling.tsx` (mirrors the floor footprint) all now call
  `useDisposeGeometry` on their memoised geometry.
- **Test** (`apartment/floor/PlanRoomFloor.test.tsx`): asserts the geometry is built once and
  reused across re-renders with stable props, disposed when dimensions/polygon change and on
  unmount, the degenerate-size guard builds nothing, and the polygon path behaves the same.
- **Visual verification**: default 4-room HDB renders correctly after 330 forced floor
  re-renders (finish toggles across all 11 rooms); `renderer.info.memory.geometries` held at
  **1197 → 1197 (delta 0)** — zero net geometry growth, confirming the leak is gone. Regression
  scenario added at `scripts/scenarios/floor-geometry-leak.json`.

## Evict GLTF + footprint caches on asset removal (PERF-001/008) (v0.1.0.29)

Fixed a GPU-memory leak that ratcheted toward WebGL context loss over a long
session: the drei `useGLTF` loader cache was **never** evicted, so a removed/
replaced/uninstalled GLB's parsed geometry + textures stayed resident on the GPU
for the rest of the session, and the module-level footprint/support-plane caches
in `GltfModel.tsx` grew unbounded.

- **`evictGltfAsset(url)`** (`src/furniture/GltfModel.tsx`): clears the drei
  `useGLTF` cache for the asset's base url **and every tier-variant url** it can be
  loaded under (`-low`/`-medium` siblings + registered upload blob variants, via the
  new `lodUrlsForBase` in `gltf/lod.ts`), disposes the original GLTF scene's
  geometries/materials/textures so the renderer actually frees the GPU memory (drei's
  `clear` only drops the cache entry — it does not dispose), and prunes the
  `FOOTPRINT_CACHE` / `SUPPORT_PLANE_CACHE` / `SUPPORT_PLANE_AUTH` entries for that
  base key. GPU disposal is deferred one frame (`requestAnimationFrame`) so it runs
  **after** React commits the unmount of the asset's placed instances — disposing a
  geometry a still-mounted clone references would break the render. Loaded scenes are
  tracked per base url at load time so disposal can reach them.
- **Wired into every removal/replace path**: `freeResource` in
  `src/state/slices/userAssetsSlice.ts` (so `removeUserFurniture` +
  `replaceUserFurniture` + `addManyUserFurniture`'s replaced-def cleanup all evict),
  and `markPackUninstalled` in `src/state/slices/installedPacksSlice.ts` for CC0/remote
  pack uninstall (which now also revokes the pack defs' `runtimeUrl`/`thumbUrl` blob
  URLs — a second small leak). The user/IKEA path runs eviction *before* it
  unregisters the LOD variants, while the registry still lists the tier urls to clear.
- **Over-eviction guard**: pack uninstall leaves placed items as orphans, so a pack
  def still referenced by a placed item is **not** evicted (its GPU resources + blob
  URLs are preserved). User/IKEA removal drops the def *and* all its placed items in
  the same `set`, and per-def URLs are never shared across defs, so its eviction is
  always safe. No-op for an asset that was never loaded.
- **Tests**: `GltfModel.test.ts` (spies `useGLTF.clear`: base + suffix + registered
  variant urls cleared, tier-url normalises to base, module caches pruned, other assets
  untouched, never-loaded no-op); `installedPacksSlice.test.ts` (uninstall evicts +
  revokes, skips a still-referenced orphan, only touches the uninstalled pack);
  `userAssetsSlice.test.ts` (removal prunes the footprint cache + revokes/deletes).
- **Verified** in-app via `renderer.info.memory`: placing two user GLBs then removing
  one drops `geometries` (e.g. 1199→605) while the still-placed asset stays in the
  scene and renders intact; no "geometry already disposed" GL errors.

## Autosave all persisted fields (BUG-001) (v0.1.0.27)

Fixed silent data loss: the autosave watch-list omitted four fields that
`serialize()` (`src/state/schema.ts`) persists, so editing only one of them never
scheduled a save and the edit was lost on reload (unless an unrelated watched field
also changed).

- **Closed the gap** in `src/state/storage/autosave.ts`: added `comments`,
  `drawingCallouts`, `panoTourStops`, and `quoteTemplate` to the `Persistent` watch
  set (`pickPersistent` + `shallowEqual`). These slices replace their array/object on
  every mutation, so the existing reference compare and 500 ms debounce are unchanged;
  no transient/non-persisted state was added.
- **Regression guard**: exported `PERSISTENT_WATCH_KEYS` and added a test
  (`autosave.test.ts`) that derives the field set `serialize()` emits and fails if any
  persisted field isn't watched — so adding a new persisted field to `serialize()`
  without watching it now breaks CI. Added per-field trigger tests (comments-only /
  drawingCallouts-only / panoTourStops-only / quoteTemplate-only each schedule a save)
  and a serialize() round-trip test for all four.

## Context-aware tone-mapping default (RD-404) (v0.1.0.26)

The tone-mapper now picks the right view transform for what you're doing, while
still honouring an explicit choice. New **Auto** setting (the default) in the
Graphics panel's Look segment:

- **New pure, unit-tested rule** (`src/scene/toneContext.ts`): `ToneMappingSetting`
  = the three operators + `'auto'`; `resolveToneMapping(setting, context)` returns
  the concrete operator. `'auto'` → **Neutral** while previewing finishes (truest
  product colour), **AgX** for a photo/render context, **filmic** otherwise (no
  regression). An explicit user pick (filmic/agx/neutral) always wins — context only
  drives the `'auto'` default; finish-preview takes priority over photo mode.
- **Thin renderer wiring** (`scene/lighting/Lighting.tsx`): resolves the operator each
  frame from `st.toneMapping` + `{ finishPreview: selectedRoomId != null }`, feeding
  the resolved mode to both `gl.toneMapping` and `toneExposureBias` so brightness holds
  steady across the switch (no flash). The HQ path tracer keeps its own ACES blit.
- **Store + prefs**: `uiSlice.toneMapping` is now `ToneMappingSetting` defaulting to
  `'auto'`; `qualityPrefs` round-trips it (a legacy explicit operator is preserved as a
  user pick). No new feature flag — this is a default-behaviour improvement to existing
  rendering, on every tier.
- **Graphics panel**: Look segment gains an **Auto** option (first) with a hint line.
- Tests: `src/scene/toneContext.test.ts` (auto→Neutral on finish preview, auto→AgX on
  photo, override wins, default case, `isAuto`). Visual verification confirmed Neutral
  (flatter, accurate) vs filmic in the live scene, restore on preview exit, and override.
- Deferred (noted, not scope-crept): the colour-temperature / exposure dial from the dossier.

## Clamp texture anisotropy to the device maximum (RD-401) (v0.1.0.25)

Sharper floors/walls/wood at grazing angles — the most visible "game-ish" blur
tell. Texture anisotropy was hardcoded (`furnitureMaterials.ts` `= 4`, `cache.ts`
+ `procedural/generators.ts` `= 8`) instead of the device limit (commonly 16 via
`renderer.capabilities.getMaxAnisotropy()`).

- **New shared source of truth** (`src/materials/anisotropy.ts`): a cached
  `maxAnisotropy` defaulting to 8 until the renderer is known, `getAnisotropy()`
  accessor, `applyAnisotropy(tex)` (stamps the cap + tracks the texture), and
  `setMaxAnisotropy(deviceMax)` which clamps to `max(1, deviceMax)` and re-applies
  to every already-created/cached texture (the module-load singletons + their
  per-repeat clones + the worker hot-swap maps), so textures built before the
  renderer existed still sharpen once the real max lands.
- **New R3F component** (`src/scene/AnisotropyController.tsx`) reads
  `gl.capabilities.getMaxAnisotropy()` on first render; mounted in both Canvases
  (main scene + room editor) so whichever renders first resolves the cap, and it
  re-clamps on a re-created context.
- Every CanvasTexture creation site (`furnitureMaterials.ts`, `cache.ts`,
  `procedural/generators.ts`) + every per-repeat `.clone()` now routes through
  `applyAnisotropy`. CanvasTextures keep mipmaps (LinearMipmapLinear), so the
  anisotropy is effective, not a no-op.
- Unit-tested (`anisotropy.test.ts`): default before set, raises to device max,
  clamps a low headless max, never exceeds the cap, floors garbage at 1,
  idempotent. Verified in-app via a scene-graph probe — `getMaxAnisotropy()` read
  as 16 and all 581 pipeline CanvasTextures sit at 16 (only GLB-loaded model
  textures, outside scope, keep the loader default).

## IES photometric light profiles for spotlights (PC-IES-LIGHT) (v0.1.0.23)

Coohom-parity advanced lighting: drive a light fixture with a real luminaire beam
shape parsed from an IESNA LM-63 `.ies` photometric file, instead of a uniform
omni glow.

- **New pure, render-agnostic lighting module** (`src/lighting/ies/`):
  - `parseIes.ts` — LM-63 (1986/1991/1995/2002) ASCII parser: optional `IESNA`
    magic line, `[KEYWORD]` headers, the `TILT=` line (incl. an inline
    `TILT=INCLUDE` block, read + skipped), the 10 photometric params + ballast/
    units line (robust to arbitrary whitespace/newline wrapping of the free-form
    number stream), vertical + horizontal angle arrays, and the candela grid with
    the candela multiplier applied. Handles photometry type C/B/A (C correct,
    others tolerated). Malformed/empty input throws a clear `IesParseError`.
  - `iesProfile.ts` — derives peak candela, beam angle (to 50 % of peak) and field
    angle (to 10 % of peak) from the principal vertical plane, interpolating
    between samples; degrades gracefully on a degenerate distribution.
  - `spotMapping.ts` — maps a profile to Three `SpotLight` params: `angle` =
    field half-angle (clamped 6°–80°), `penumbra` from the beam-vs-field ratio,
    `intensity` scaled from the fixture's base intensity by beam focus.
  - `sampleProfiles.ts` — two **self-authored, public-domain** bundled `.ies`
    profiles (narrow accent + wide general downlight) as LM-63 string literals,
    parsed lazily + cached → works out of the box, no network fetch.
  - `iesStore.ts` — session resolver/cache for bundled + uploaded profiles
    (`custom:<key>`); never throws on resolve (bad source → null → default cone).
- **Rendering** (`src/scene/lighting/FurnitureLights.tsx`): a lit item that
  references an IES profile (`props.iesProfile`) renders a downward-pointing
  `SpotLight` (target on the floor under the bulb) using the mapped cone/penumbra/
  intensity; otherwise the existing omni point light. Parsed + mapped once, cached.
- **Inspector UI** (`src/ui/inspector/IesProfilePicker.tsx`): in the Light section
  of an emitter, a "Photometry (IES)" picker — None / a bundled profile / upload
  your own `.ies` — gated by the `iesLights` feature.
- **Feature flag** `iesLights` (`tier: 'pro'`, `default: true`, prod-safe pure
  code): hidden in Simple mode, present in Pro. Unit-tested in both modes.

## Consistent, friendly empty states across panels (PC-EMPTY-STATES) (v0.1.0.22)

Every panel/list that can be empty now shows the same polished icon + title +
optional description + optional call-to-action, matching modern design tools.

- **New shared `EmptyState` component** (`src/ui/EmptyState.tsx`) — props: an icon
  from the shared `Icon` set, a short title, an optional one-line description, and
  an optional CTA (`{ label, onClick }`). Built on the existing `.empty-mini` token
  vocabulary (no hardcoded colour), centred, and viewport-responsive (renders well
  in desktop panels and the mobile bottom-sheet) across light + dark + all 5 themes.
- **Applied across the panels**, replacing ad-hoc/inline empty messages with
  consistent copy: comments ("No comments yet" + a "+ Add comment" CTA wired to the
  existing arm-placement action), history ("No edits yet"), versions ("No saved
  versions yet"), budget list + saved-items, layers (placed + filtered), the catalog
  grid (distinct copy for search-no-results / favourites / recent / price-filter /
  empty-category, with "Clear search"/"Clear max price" CTAs), remote browse
  (index-empty vs no-results), swap-modal alternatives, and the daylight /
  accessibility "nothing to check" states.
- Search-no-results vs truly-empty get distinct copy; CTAs only ever call real,
  existing handlers. Panel gating/behaviour is otherwise unchanged.
- Tests: `EmptyState.test.tsx` (title/description/CTA rendering + CTA fires) and
  `CommentsPanel.test.tsx` (asserts the empty state + CTA arms comment mode).

## Upholstery realism: procedural seam stitching + soft fabric wrinkle (RZ6) (v0.1.0.21)

Upholstered furniture (sofas, armchairs, ottomans, beds, benches, cushioned
dining chairs) read plasticky because the fabric normal was a flat woven grid.

- **New procedural generator** `src/materials/procedural/upholsterySeams.ts`
  (`buildUpholsteryHeight`) layers a fine woven micro-texture, a soft low-frequency
  fabric **wrinkle** (broad gathered creases), and a faint panel-**seam** channel +
  topstitch into one height field — pure, deterministic, and unit-tested
  (dimensions / determinism / seam-recess / channel toggles / color-space).
- **Wired into the fabric material** (`getFabricMaterial` → `getFabricNormal`): the
  richer height field bakes once into the shared 256² fabric normal singleton
  (cached + reused across every upholstered instance — no per-item cost, no new
  texture channel), behind the existing `pbrSurfaces` flag (off → the legacy clean
  weave). Albedo stays sRGB, the normal stays linear (PHOTO-COLORSPACE).
- **Tasteful by default**: gentle amplitudes + a fine thread pitch so light and
  dark upholstery read as soft cloth, not a quilted waffle; `seam`/`wrinkle`
  intensities are tunable (and `0`-disable-able) via `SeamParams`.
- Verified visually (High + the default Performance tier) on a blue sofa + rust /
  cream armchairs: subtle weave grain, no harsh tiling, no z-fighting (it is a
  material normal map only), reads as fabric over any base colour.

## Equal-spacing smart-guide badges while dragging (PC-GUIDE-SPACING) (v0.1.0.20)

Pro-tool (Coohom / Figma) equal-spacing hints layered onto the existing alignment
guides: while dragging, when the item forms a gap equal to gaps among nearby items
(or to a wall), matching distance badges + end-ticks are drawn so the user can land
on even spacing.

- **Pure detector** (`collision/equalSpacing.ts` `detectEqualSpacingAxis`, render-
  agnostic + unit-tested): given the dragged item's axis span, neighbour spans, and
  optional wall faces, it finds reference gaps (item↔item and item↔wall, skipping
  overlaps and gaps with an item in between), matches the gap(s) the drag forms
  against them within tolerance, picks the strongest match (most equal gaps, then
  tightest), de-dupes coincident spans, and returns the shared gap size + the spans
  to badge + a `snapCenter`. `relevantWallFaces` bounds wall candidates to the
  dragged row/column.
- **Wired into the drag** (`DragController`): runs per pointer-move for single-item
  drags only, restricted to neighbours within a band on the cross-axis (cheap in
  busy scenes). Snaps the drag to the equal-gap centre when grid-snap is off and the
  axis wasn't already claimed by a stronger edge/centre alignment snap, then
  re-detects at the final position so the badges read the post-snap gaps. New
  ephemeral store field `dragSpacings` (placement slice; cleared on `endDrag`).
- **Render** (`AlignmentGuides`): flat magenta bracket + end-ticks per equal gap
  (same hue as the alignment lines) plus a drei `Html` `.spacing-badge` showing the
  measured gap via `formatLength` (honours metric/imperial). Themed via tokens
  (`--surface-solid` + `--guide` fallback); light/dark/5 themes; mobile-verified.
- **No new flag** — rides under the existing always-on alignment-guides behaviour.
- Visual verification: 3 chairs in a row, drag one to an equal gap → two `1.04 m`
  (metric) / `3′ 5″` (imperial) badges at the gap midpoints, clean at 390×844 mobile
  (`scripts/scenarios/equal-spacing-guides.json`).

## Cleaner undo for nudge / array / align / mirror (PC-NUDGE-UNDO) (v0.1.0.19)

Multi-item edits now form the single, predictable undo step users expect from
Coohom / Sweet Home 3D.

- **Keyboard nudge coalesces into one step.** The arrow-key nudge now snapshots
  history under a stable `'nudge'` coalesce key (was a plain `pushHistory` per
  press). A *burst* of separate taps within the coalesce window — and a long
  press-and-hold — collapse into **one** undo entry; a deliberate pause starts a
  fresh step. A new `refreshCoalesce(key)` keeps the window alive across a long
  hold→re-tap (the per-frame `moveItem` doesn't touch the coalesce clock) and is a
  no-op for any other key, so a nudge never merges with an array / rotate / drag.
  The undoable guard now checks the whole selection (`selectedItemIds`), so a
  marquee / group nudge is undoable too (previously skipped when there was no
  single primary id).
- **Array / align / distribute / mirror / set-drop verified one entry each.** These
  already pushed history once and then mutated many items via
  `moveItem`/`rotateItem`/`flipItem`/`setItems` (which don't push), so each is a
  single undo that fully reverts — now covered by tests asserting the entry count
  (+1) and a full one-undo revert, including all-or-nothing mirror and no-op
  guards (empty / single selection).

## Drag HUD: live per-side distance-to-wall readout (v0.1.0.18)

While dragging a single item, the drag HUD already showed the single nearest-wall
gap; it now reads out the gap to the nearest wall on **each side** of the footprint
(left/right/back/front), so a piece can be placed to a precise clearance the way
Coohom / pro tools do. Each side is a small chip with a directional arrow and the
distance via `formatLength` (metric/imperial), and turns amber below the minimum
walkway clearance (`CLEARANCE.walkwayMin`). Rides under the existing drag HUD — no
new feature flag (an inline readout on an always-present editor surface).

- New pure, unit-tested `wallGapsPerSide(box, walls)` in `collision/clearanceGap.ts`
  returns `{ left, right, back, front }` (each `number | null`), reusing the existing
  axis-aligned `CollisionWall` segments + footprint AABB. The old `nearestWallGap` is
  now a thin wrapper over it (overall minimum), keeping its behaviour/back-compat.
- `DragController` precomputes the same walls it already validates against per move
  (`placementWalls` / door-aware `buildCollisionWalls`) and writes both the legacy
  `dragClearance` and the new `dragWallGaps` to the store each pointer-move — cheap
  per-frame point/segment distance, no geometry rebuilt.
- `DragHud` renders the per-side chips (themed via CSS tokens, wraps on narrow/mobile
  viewports), falling back to the single nearest-gap pill when no side faces a wall,
  and hiding entirely when there's no wall to measure to. Unit-tested in metric +
  imperial, group-drag hidden, warn styling, and the fallback path.
- Edge cases handled: flush/overlap clamps to 0 (touch), no-facing-wall leaves a side
  `null` (no chip), nearest of several walls per side wins, group drags suppress the
  readout.

## 2D plan: room perimeter on the live area label (v0.1.0.17)

The 2D editor already drew each room's name + floor area centred inside it, live
and unit-aware (`formatArea(planRoomArea(r), units)` at `roomLabelPosition`, with
`roomLabelDetail` thinning the figure out as the room shrinks). Added the room's
wall **perimeter** as a third line on the full-detail label (prefixed `P`), so a
layout reads its area *and* its run of wall at a glance — matching Coohom / Sweet
Home 3D's on-plan room readouts.

- New pure, unit-tested `planRoomPerimeter(r)` in `floorplan/types.ts` (outline
  edge sum via `roomPolygon`, so it's correct for rectangles, L-shape extensions,
  and explicit polygons). The report's private `roomPerimeter` (polygon/rect only,
  no L-shape) was replaced with this shared helper, so plan labels and the
  printable report now agree on a single perimeter figure.
- Honours the metric/imperial toggle (`formatLength`) and updates live; the
  perimeter rides under the existing full-detail tier (no new flag — room
  name/area labels are a core, always-on editor display).

## Configurable linear + grid array with placement feedback (PC-ARRAY-GAP) (v0.1.0.16)

Improve the linear array tool to match design-tool standards: axis/direction control,
explicit spacing, 2D grid (rows×cols), and a non-blocking toast when copies are dropped.

- **`arrayPlacement.ts` (`src/furniture/arrayPlacement.ts`):**
  - Extended `ArrayAxis` to include `'left'` (−X) and `'back'` (−Z) in addition to
    `'right'` and `'forward'`.
  - `arrayOffsets` now caps output at `ARRAY_MAX_COUNT` (200) for safety.
  - New `gridArrayPlacements(src, opts)` — pure, render-agnostic, unit-tested:
    given `cols × rows`, `colSpacing`, `rowSpacing`, `colAxis`, `rowAxis` (all relative
    to item Y-rotation), returns `GridPlacement[]` of additional positions (source cell
    skipped). Spacing clamped to ≥ 0.001 m; cols/rows clamped to ≥ 1; total capped at
    `ARRAY_MAX_COUNT`.
- **Unit tests** (`src/furniture/arrayPlacement.test.ts`): 18 tests — added left/back
  axis correctness, rotation-honouring for grids, 3×2 grid cell positions, col/row axis
  overrides, spacing clamping, and the ARRAY_MAX_COUNT cap.
- **UI** (`src/ui/inspector/InspectorPanel.tsx`):
  - The old single-line "Duplicate a row of N" is replaced by a full "Linear array" panel
    (pro mode) with: Columns count, Rows count, Col gap (m), Row gap (m), and a Direction
    selector (+X/−X/+Z/−Z). Gaps default to item footprint + 12 cm gap; user can override.
  - Dropped-copy feedback: when some copies fail `canPlace`, a non-blocking info toast
    appears: "Placed N of M — K didn't fit". If all copies fail: "Couldn't place any copies".
  - Grid mode activates automatically when Rows > 1 (uses `gridArrayPlacements`); 1D row
    (Rows=1) uses `arrayOffsets`. A **grid** skips blocked cells (an interior obstruction
    doesn't drop cells beyond it, like radial); a **1D row** stops at the first blocked slot
    so it stays contiguous and copies never tunnel through a wall into empty exterior space.
    Either way the toast reports the accurate dropped count.
  - Committed in a single `setItems` + `pushHistory` (same undo-step pattern as radial array).

## Radial/polar array (PC-ARRAY-RADIAL) (v0.1.0.15)

Place N copies of a selected item evenly around a circle — ideal for dining
chairs around a round table, conference chairs, or any radial furniture layout.

- **New pure helper** `src/furniture/radialArray.ts` (`radialArrayPlacements`):
  render-agnostic, no store import — given center, radius, count, startAngle,
  sweep (°), and a `faceCenter` flag, returns N `{ position, rotation }` placements.
  Full-circle (sweep=360°) uses exclusive seam spacing (last copy ≠ first);
  partial-sweep uses inclusive both-ends spacing. Edge cases: count<2 → [], radius
  clamped to 0.01 m, sweep≤0 → [], count capped at 36.
- **Facing convention**: `faceCenter=true` sets each copy's yaw using Three.js
  Y-rotation semantics: `atan2(-cos angle, -sin angle)` — makes the item's local +Z
  (its front) point toward the ring center. `faceCenter=false` keeps `baseRotation`.
- **19 unit tests** covering positions on circle, even spacing, non-zero center,
  startAngle, partial sweep, faceCenter yaw correctness, and all edge cases.
- **UI** added to `InspectorPanel` (`src/ui/inspector/InspectorPanel.tsx`) below
  the existing linear array row: count, radius, start angle, sweep, face-centre toggle.
  Copies are placed in a single batched `setItems` + `pushHistory` call (same path as
  linear array). Blocked positions are skipped (ring fills as many slots as possible,
  unlike linear which stops at the first blocked slot).
- **Feature flag** `radialArray` (`tier: 'pro'`, `default: true`) in
  `src/features/flags/registry.ts` + `types.ts`. Gated by `useFeature('radialArray') &&
  proMode` so it's hidden in Simple mode. Unit-tested in both Simple and Pro modes.

## PC-WALL-NUMERIC: live numeric length + angle entry while drawing a wall (v0.1.0.14)

Shows a small floating numeric-entry overlay (Length + Angle °) near the cursor while a
wall draft is active (start placed, user positioning the end). Matches Sweet Home 3D /
Arcadium 3D precision-drawing behaviour.

- **Overlay**: appears on pointer-down+move in Wall tool (desktop, Pro tier). Two text
  fields — Length (metric "m"/"cm" or imperial `3' 6"`) and Angle ° (0 = right, 90 = down).
  Positioned fixed near the cursor endpoint, clamped inside the viewport.
- **Keyboard**: Enter commits the wall at the typed length/angle; Tab moves Length → Angle;
  Escape cancels (clears the draft). No interaction with other global hotkeys (the
  `isEditableTarget` guard prevents double-handling).
- **Drag sync**: dragging updates the unowned fields live; typing an owned field drives
  the preview endpoint live (preview wall line updates as you type).
- **Chain drawing**: committing via Enter chains the next segment from the new endpoint
  (same as drag-commit), so walls can be drawn back-to-back without re-clicking.
- **Feature flag**: `wallNumericEntry` (tier: `pro`, default: `true`). Hidden in Simple
  mode; present in Pro. Unit-tested in both modes.
- **Pure helpers** in `src/floorplan/wallNumericEntry.ts`: `endpointFromLengthAngle`,
  `segmentLengthAngle`, `parseLengthInput`, `parseAngleInput`, `validateLength`,
  `validateAngle`. 30 unit tests; zero React/three imports.
- **Dim readout suppressed** during numeric entry (no duplication of length on canvas).
- Visual verification confirmed: overlay themed (CSS tokens, light mode), metric and
  imperial inputs working, committed wall visible on canvas.
- `tsc` + Biome zero errors; 356 test files / 2795 tests all pass (full suite).

## Catalog: persisted favourites / star list (PC-CATALOG-FAVOURITES) (v0.1.0.13)

Star any catalog card (heart button) to save it in a dedicated **Favourites** tab that
persists across reloads. Mirrors the existing Recent pattern with a dedicated
`favouritesSlice` that self-persists to `localStorage` (`hdb_favourites`). Gated by the
new `catalogFavourites` feature flag (tier: simple, default on — visible in both Simple and
Pro modes). Empty state shows a friendly hint. Star button accessible and keyboard-operable
on both local and remote CC0 catalog cards. Uninstalled items drop out of the list
gracefully. 15 unit tests covering toggle, dedup, order, clear, flag visibility in both
modes.

## PC-MEASURE-UNITS: route all distance/area readouts through unit formatters (v0.1.0.12)

Every user-facing distance and area display now honours the `metric`/`imperial` unit toggle
stored in `state.units`. Offenders fixed:

- **`ClearancePanel.tsx`** — narrow-gap distances (e.g. `Queen bed ↔ Wardrobe · 1′ 11″` in imperial)
- **`AccessibilityPanel.tsx`** — door widths, min span, subtitle thresholds (MIN_DOOR_CLEAR / TURN_CIRCLE)
- **`DaylightPanel.tsx`** — glazing area and floor area readouts
- **`MountHeightPresets.tsx`** — mount-height tooltip ("Set mount height to …")
- **`PanoTourModal.tsx`** — hotspot distance tooltip
- **`LevelTabs.tsx`** — storey elevation tooltip
- **`ViewMenu.tsx`** — storey elevation label in the View menu
- **`FloorPlanEditor.tsx`** — grid-size option labels (was `"50 cm"` hardcoded, now `"0.50 m"` / `"1′ 8″"`)
- **`autoDimension.ts`** — `buildDimensions` / `roomDimensions` accept `units` param; SVG labels use `formatLength`
- **`autoDimensionSvg.ts`** — `DimensionSvgOpts.units` threaded through to `buildDimensions`
- **`report.ts`** — narrow-gap text, door widths, room min span, hacking summary, accessibility thresholds

No internal geometry calculations were changed — only display formatting. New unit tests cover
`buildDimensions` in imperial (feet+inches labels) and `dimensionSvg` in imperial. Visual verification
confirmed: Clearance panel shows `1′ 11″` / `2′ 3″` etc. in imperial and `0.59 m` / `0.69 m` in metric.
`tsc` + Biome zero errors; full suite 354 files / 2749 tests all pass.

## Fix PC-DISTRIBUTE-OVERLAP: clamp distributeEvenGaps to prevent silent overlap (v0.1.0.11)

`distributeEvenGaps` in `src/layout/alignDistribute.ts` was computing a negative
gap when the combined footprint of selected items exceeded the span between the two
extremes, silently packing items into overlapping positions.

**Fix:** gap is clamped to 0 (flush/touching) when it would go negative. The
function now returns `{ positions: Map<string,number>, clamped: boolean }` instead
of a bare `Map`. `clamped: true` signals that items couldn't fit with positive gaps.
The UI (`src/ui/inspector/MultiSelectPanel.tsx`) reads `clamped` and fires a
non-blocking `info` toast: "Items touch — selection is too wide to fit with gaps".

New unit tests cover: negative-gap clamping (no overlap verified), the `clamped`
flag is set, the normal-fit regression (flag stays `false`), n<2 no-op, zero-width
items, and a four-box clamped case checking strict non-overlap for all adjacent pairs.
`tsc` + Biome zero errors; full suite 353 files / 2744 tests all pass.

## Auto-arrange decor styling pass (v0.1.0.9)

New `src/furniture/layout/decorStyling.ts` helper (pure, unit-tested, seedable) adds a
set-dressing pass to the auto-furnish flow: after `arrangeAllRoomsForPlan` places floor
furniture, `applyDecorStylingForPlan` iterates each plan room and places 1–2 `noClip` decor
props ON appropriate host surfaces (sofas → cushions/blanket; coffee/dining tables →
bowl/magazines/candles; beds → cushion/blanket; nightstands → desk-plant/candle; desks →
desk-plant/book-stack; sideboards/consoles → frames/sculpture/books; bookshelves →
books/sculpture/plant). Surface height is read from `defaultFootprint.h` so props always sit
at the correct elevation. A seedable mulberry32 PRNG keeps results deterministic for tests.
`furnishPlanItems` gains an optional `withDecor` flag (default `true`) so callers can skip the
pass. 12 new unit tests cover all edge cases (empty list, non-host items, determinism,
idempotency, surfaceHeight correctness, noClip contract). `tsc` + `biome` + full test suite
pass clean (77 test files, 599 tests).

## Parametric kitchen-cabinet run — geometry, controls, flag, tests, scenario ladder (v0.1.0.8)

The parametric furniture generator (`src/furniture/parametric/`) now supports the
`kitchen-run` type via `buildKitchenRun` in `buildParts.ts`. This completes the PF
subsystem (bookshelf / wardrobe / sideboard / desk / kitchen-run). Geometry: recessed
toe-kick plinth, carcass + per-bay dividers (1–6), per-bay door/drawer/open fronts with
handles, continuous worktop slab (0.04 m, front/side overhang, fronts proud → no
z-fighting), optional upper cabinets. Spec limits + `kitchenCabinets` flag (tier
`simple`, default `true`) gate the Kitchen-run tab; `KitchenControls` adds the sliders,
bay-count, uppers toggle, per-bay style pickers + finishes (responsive desktop + mobile).
Adds 29 `kitchen-run.test.ts` unit tests plus `parametric-kitchen-simple.json` /
`parametric-kitchen-journey.json` scenarios; refreshes `ARCHITECTURE.md`,
`src/furniture/CLAUDE.md`, and removes the stale `TODO.md` reference.

## User-editable quote templates (v0.1.0.7)

Introduces a `QuoteTemplate` settings model and authoring UI so designers can brand
BOQ exports with company details and control tax/markup/section layout.

- **`src/export/quoteTemplate.ts`** — pure `QuoteTemplate` interface + `DEFAULT_QUOTE_TEMPLATE`;
  `applyTemplate(boq, template)` filters sections by visibility flags and appends Markup /
  Discount / GST rows, recomputing the grand total; `templateCurrencyFormatter` + `escapeTemplateText`.
- **`src/state/slices/quoteTemplateSlice.ts`** — Zustand slice with `quoteTemplate`,
  `setQuoteTemplate` (+ undo push), `resetQuoteTemplate` (+ undo push).
- **`src/ui/QuoteTemplateModal.tsx`** — authoring panel: company name, contact line, header/footer
  notes, currency label, markup/discount/GST percents, section-visibility toggles. Gated by
  `quoteTemplate` feature flag (tier: `pro`).
- **`src/export/boq.ts`** — `boqToHtml` and `boqToCsv` now accept an optional `QuoteTemplate`;
  branding rows + currency label applied when provided; no change for existing callers.
- **`src/export/boqXlsx.ts`** — `boqRows` and `boqToXlsx` same optional-template pattern.
- **`src/state/schema.ts`** — `QuoteTemplateZ` Zod schema; serialised only when non-default.
- **`src/state/slices/historySlice.ts`** — `quoteTemplate` added to `HistorySnapshot` so
  template changes are part of the undo stack.
- Feature flag `quoteTemplate` (tier: `pro`, default `true`) wired into `FEATURE_FLAGS`,
  `COMMAND_FLAGS` (⌘K "Quote template"), and the Tools menu (nested under BOQ Export).
- `openBoq.ts` and `downloadBoqXlsx.ts` pull `quoteTemplate` from the store and apply it.
- 37 new unit tests covering all helpers, slice, Simple/Pro gating.

## Auto-style rooms with set-dressing decor props (v0.1.0.6)

Dresses the move-in default 4-room HDB flat with the 9 procedural decor props
shipped in C276 so rooms look believably styled on first load.

- **Living/Dining**: fruit bowl + magazine stack on the coffee table (surfaceHeight 0.42 m);
  2 × throw cushion + throw blanket on the sofa (surfaceHeight 0.46 m); candle cluster
  centrepiece on the dining table (surfaceHeight 0.74 m); small sculpture on the TV console
  (surfaceHeight 0.45 m).
- **Main bedroom**: desk plant on the nightstand (surfaceHeight 0.52 m); throw cushion +
  throw blanket on the bed (surfaceHeight 0.46 m).
- **Bedroom 2 (study)**: book stack + desk plant on the desk (surfaceHeight 0.74 m); photo
  frame cluster on the wall shelf (surfaceHeight 1.60 m).
- **Bedroom 3**: photo frame cluster on the nightstand (surfaceHeight 0.52 m); small sculpture
  on top of the bookshelf (surfaceHeight 1.60 m).
- All decor items carry `noClip: true` — they pass `canPlace` unconditionally and do not
  trigger collision failures. `defaultLayout.test.ts` passes with all items.
- Auto-arrange styling pass deferred (see TASKS.md); default-flat placement covers the primary
  styled-home value.

## Drawing-set sheet callouts (PARITY-LIGHTINGTEMPLATE-TEXT) (v0.1.0.5)

Free-text annotations that appear on specific construction drawing-set sheets when
exported via Tools → Drawing set (the second half of PARITY-LIGHTINGTEMPLATE-TEXT;
the finishes-schedule half shipped earlier).

- **Data model** (`state/slices/drawingCalloutsSlice.ts`): `DrawingCallout` record
  `{id, sheet: CalloutSheet, text, x, y, leaderX?, leaderY?}` with sheet-relative
  normalised [0,1] coords so callouts survive plan rescaling and different sheet sizes.
  `CalloutSheet` covers all 11 drawing-set sheet groups (cover, floor-plan, elevations,
  lighting, dimensions, section, electrical, plumbing, finishes, demolition, ffe).
  All four CRUD actions (`addDrawingCallout`, `updateDrawingCalloutText`,
  `moveDrawingCallout`, `deleteDrawingCallout`) call `pushHistory()` making them fully
  undoable. Rejects blank text and out-of-range positions.
- **Authoring UI** (`ui/DrawingCalloutsPanel.tsx`): `.aux` panel docked like Comments/History.
  "Add callout" opens a 4-step `promptText` chain (text → sheet number picker → x%/y%
  position → optional leader-line tip); each existing callout shows its sheet, position,
  and leader indicator with edit (text) and delete icon buttons. Mutual-exclusion wired via
  `closeAllAuxPanels`; accessible from ⌘K ("Sheet callouts") and Tools menu.
- **SVG rendering** (`ui/drawingSet.ts`): `buildCalloutsSvg()` injects an absolutely-positioned
  SVG overlay per sheet when callouts are present — dashed leader line + circle tip, white
  background rect (rounded, 88 % opacity), multi-line text via `<tspan dy>` elements. ViewBox
  100×100 so normalised coords map directly to percentages. XML-escaped via the existing
  `esc()` helper; hidden-layer callouts are omitted. Sheets carry a `calloutGroup` tag so
  matching is data-driven with no string fragility.
- **Persistence** (`state/schema.ts`): optional `drawingCallouts[]` in the save schema
  (Zod-validated on load, omitted when empty) so callouts travel with `.sofa.json` and
  `#/design/` links. Included in `HistorySnapshot` for full undo/redo coverage.
- **Feature flag**: `drawingCallouts` — `tier: 'pro'`, `default: true`; hidden in Simple
  mode automatically via `resolveFlags`.
- **Tests**: 17 slice unit tests + 7 `buildDrawingSetHtml` integration tests (no-callouts
  baseline, text render, XML escaping, leader line, sheet targeting, multi-line) + 3
  feature-flag tests (registry, hidden in Simple, visible in Pro).

## Set-dressing decor prop pack — 9 new styling props (v0.1.0.4)

Added a curated pack of 9 procedural decor primitives under `src/furniture/primitives/` to
fill the set-dressing gap (PHOTO-DETAIL). Each is a modular `.tsx` file registered in
`primitives/index.ts`, `PrimitiveKind`, `defs/decor.ts`, and `furniturePrices.ts`.
All use `noClip: true` for tabletop/shelf placement without collision rejection.

New props:
- **BookStack** (`book-stack`) — 4 horizontal stacked books + 2 leaning uprights on one end;
  beveled spines with page-edge detail. S$25.
- **ThrowCushion** (`throw-cushion`) — plump RoundedBox fabric pillow with woven flange border;
  square and rect shapes. S$45.
- **ThrowBlanket** (`throw-blanket`) — two-fold fabric drape with a draped corner for realism;
  plain/stripe/herringbone weave. S$55.
- **CandleCluster** (`candle-cluster`) — 3 pillar candles of different heights on a mirrored
  plate, with optional flame glow (emissive). S$35.
- **FruitBowl** (`fruit-bowl`) — wide ceramic/stoneware bowl with 5 coloured fruit spheres or
  empty; glazed/matte/stoneware finishes. S$40.
- **MagazineStack** (`magazine-stack`) — 5 thin magazines fanned at slight offsets with page-edge
  detail; large format distinct from BookStack. S$20.
- **SmallSculpture** (`small-sculpture`) — 3 abstract styles: twisted stacked prisms, minimal arch,
  and polished orb on ring stand; all on dark plinth. S$65.
- **DeskPlant** (`desk-plant`) — petite succulent rosette or trailing-stems plant in small ceramic
  pot; distinct from floor-scale PottedPlant. S$30.
- **PhotoFrameCluster** (`photo-frame-cluster`) — 3 tabletop frames (portrait, landscape, square)
  with mat + art fill and leaning support foot. S$50.

## Edge-bevel rollout: remaining box-built case goods and structural panels (v0.1.0.3)

Extended the `BeveledBox` chamfer (7 mm auto-clamped radius) to all remaining hard-edged,
box-built furniture primitives where a subtle bevel is physically realistic:
**KitchenCounter** (carcass, worktop slabs, drawer/door fronts),
**KitchenIsland** (base cabinet, door fronts, worktop),
**ShoeCabinet** (carcass, flip fronts, top lip),
**WallCabinet** (carcass, door fronts),
**Vanity** (tabletop, pedestal supports, aprons, drawer fronts, rect mirror frame, round mirror post),
**ChangingTable** (carcass, drawer fronts),
**WallShelf** (planks, two-tier end panels),
**Bench** (storage box and plinth, slim wood legs),
**Bed** (frame for standard/platform styles, non-upholstered headboard/footboard panels),
**ToddlerBed** (headboard, footboard, slatted base),
**BunkBed** (slat platforms, side rails, upper guardrail bar),
**Staircase** (tread and landing parts only — risers and railing posts left sharp).
Skipped: appliances (Refrigerator/Oven/Stove/Microwave/WashingMachine/Dishwasher/RangeHood — intentionally
crisp industrial edges), BarCart (cylindrical posts, thin glass shelves), Ottoman (already RoundedBox),
Bench upholstered/slat tops (already RoundedBox), CubeShelf/ToyStorage (use InstancedBoxes which has no
BeveledBox path), Crib (thin slats/posts — bevel would clip), upholstered/fabric forms, mirrors, screens.

## Floor-plan editor: binding edits, stray-element flags, skeleton view + touch fixes

A batch of floor-plan-editor fixes so plan edits are real, the apartment can be
made whole, and the editor behaves on touch.

- **Edits now bind to 3D.** Editing the seeded default flat used to leave orbit /
  walk showing the curated apartment, ignoring your wall/room/door changes — the
  scene only renders the live plan for *custom* plans. The first structural edit
  to the default plan now **forks it to a custom plan** (`forkIfDefault` in the
  floor-plan slice), so every wall/room/opening/level/meta edit shows up in orbit
  and walk. The default plan's geometry already reproduces the curated shell, so
  the switch is seamless (and undo restores the default).
- **Stray-element flags** (new `planIntegrity` Pro feature): walls joined to no
  other wall, rooms touching no other room, and doors/windows off any wall are
  drawn **red** in the editor, with a `⚠ N stray` count, so the whole apartment
  can be made connected. Doors/windows are part of their wall, so a wall with
  openings still encloses a room and **Auto room** works across it.
- **Skeleton view** toggle: draws every wall at one uniform thin stroke
  (ignoring thickness) so you can see whether wall ends actually meet to close a
  room. Openings stay drawn.
- **Auto room** no longer stacks a duplicate room when you click inside an area
  that's already a room — it flags it instead (and the toast de-dupes, below).
- **Room rename re-flows names.** Renaming a room now re-names its auto-named
  boundary walls **and** the doors/windows on them (`<room> wall/door/window ##`).
  Elements you renamed yourself keep their custom name (tracked via `nameAuto`,
  now also on openings) and are never overwritten.
- **Wall rotation is now a ring gizmo** (like furniture rotation): grab anywhere
  on the ring around a selected wall — not just a single small handle — to rotate.
- **Inspector**: while minimized, a selected wall/door/window shows quick **lock**
  + **delete** icons in the title bar; tapping the title bar toggles the panel
  (expand when minimized, minimize when open) everywhere except those icons.
- **Touch fixes**: two-finger **pinch-to-zoom** in the 2D editor; form fields no
  longer trigger iOS's focus-zoom (16px on mobile, so the page never zooms in and
  gets stuck); tapping empty canvas in select mode **deselects**, and opening /
  closing the editor clears the selection.
- **Notifications de-dupe**: repeating the same warning (e.g. tapping an
  already-roomed area) resurfaces the existing toast and restarts its timer
  instead of stacking duplicates.

## PWA: foreground/periodic update checks + manual "Check for updates"

- Installed Home-Screen PWAs (esp. iOS standalone, which has no reload UI and only
  looks for a new worker on a real launch) now pick up new builds reliably: we
  register the service worker ourselves (`src/pwa/swUpdate.ts`) and call
  `registration.update()` **hourly and whenever the app returns to the foreground**
  (visibility/focus, throttled). With `autoUpdate`, a found build still installs +
  reloads silently.
- Added a manual **"Check for updates"** action (File menu on desktop, Appearance &
  help on mobile) with toast feedback — *updating / up-to-date / unavailable* — for
  standalone users who have no browser refresh button.
- Vite PWA config: the plugin is always present with `disable: !pwaEnabled` (so
  `virtual:pwa-register` resolves even when the SW is off) and `injectRegister: null`
  (we own registration). SW generation is unchanged; verified the SW registers,
  activates, and `update()` resolves against the production base.

## Floor-plan editor: precise tap-to-place wall drawing on touch

- On a phone/tablet the **Wall** tool is now **tap-to-place**: tap to drop the
  start, tap to drop the end — each point snaps to the grid and to existing
  walls, so you place exact points instead of guessing where a drag lifts off
  under your fingertip. Walls **chain**: each new wall starts from the previous
  one's end, so a run of rooms goes tap-tap-tap; tap the last point again (or
  switch tools) to finish. A press-drag in one gesture still works too.
- Both platforms now draw **snap markers** on the wall being drawn — a filled
  dot at the start/anchor and a ring at the live end — so the precise snapped
  point is visible even under a finger. Desktop keeps drag-to-draw.

## Floor-plan editor: mobile tool picker is now a grid popover

- The mobile drawing-tool picker is no longer a native `<select>` dropdown — it's
  a **"‹current tool› ▾"** button that opens a tidy grid of labelled tool chips
  below it (`PlanToolMenu`, on the shared `Popover`), with the active tool
  highlighted. Every tool is visible at once with a big touch target and the
  current selection is obvious — matching how mobile floor-plan apps surface
  their tools, instead of a hidden two-step dropdown.

## Floor-plan editor: undo/redo in the mobile top bar

- Undo/redo (↶ ↷) now sit directly in the mobile editor's top bar — in both View
  and Edit — instead of being buried in the ☰ Menu, so the most-used action is
  always one tap away. They're no longer duplicated inside the menu (which keeps
  grid + zoom under **View**).

## Floor-plan editor: tidier mobile "Plan tools" sheet

- The mobile **☰ Menu** sheet is reorganised from one dense wall of buttons into
  labelled sections — **Plan** (name, levels, template/save, new/reset/reference),
  **View** (labels/dims/furniture/all-levels/export + undo-redo/grid/zoom),
  **Edit** (wall thickness + multi-select, when relevant) and **Defaults**
  (ceiling height, wall colour, area total) — each separated, so it reads as a
  tidy settings sheet.

## Floor-plan editor: decluttered desktop toolbar

- The desktop toolbar's secondary actions are grouped into two tidy dropdowns
  (a small `PlanMenu` built on the shared `Popover`): **Plan ▾** (New / Reset to
  HDB / Reference photo) and **View ▾** (Labels / Dims / Furniture / All levels /
  Export PNG). The View trigger lights up when any of its toggles is active.
- The core design loop stays inline — name, level tabs, View/Edit, the tool
  palette, Template/Save, multi-select, undo/redo, snap-grid, zoom, area total,
  Done — so the bar reads cleanly instead of one long wrapping row.
- Escape closes an open dropdown without also exiting the editor (a second
  Escape still leaves). The mobile **☰ Menu** modal is unchanged (it already
  consolidated these controls).

## Floor-plan editor: auto-name boundary walls on room allocation

- Creating a room (Room tool, Polygon, or **Auto room**) now names its boundary
  walls **`<room name> wall ##`** (2-digit, in boundary order) — so a freshly
  walled room reads as *Living wall 01 … 04* instead of anonymous hashes.
- A **user-set name takes absolute precedence** and is never overwritten: walls
  carry a `nameAuto` flag (set when allocation names them, cleared the moment you
  edit the name in the inspector), so re-allocating a room re-labels only the
  auto-named walls and leaves your custom names alone.
- Matching is a pure, unit-tested helper (`floorplan/roomWallNames.ts`): a wall
  belongs to a room when it lies along one of the room's boundary edges
  (collinear + overlapping, with a small tolerance for walls just off the
  interior rectangle).

## Floor-plan editor: multi-select walls (bulk lock / delete)

- **Select several walls at once** — Shift/⌘/Ctrl-click adds or removes a wall
  from the selection; on touch a new toolbar **Select+** toggle makes taps
  additive (the Shift-click equivalent). Every selected wall gets the accent
  halo.
- The inspector shows a **"N walls selected"** panel with **Lock all / Unlock
  all**, **Delete all** (skips locked walls), and **Clear selection**. ⌫/Delete
  removes the whole selection in one undoable step.
- State is session-only (`selectedWallIds` + `planWallMultiAdd`); a plain click
  clears the multi-selection, and ids are filtered to existing walls so
  deletes/merges leave nothing stale. New slice actions: `toggleWallSelection`,
  `removeWalls`, `setWallsLocked`.

## Floor-plan editor: wall / door / window inspector parity (name, lock, duplicate)

- The wall and door/window inspectors now mirror the **furniture inspector**: a
  **Name** field at the top (custom name with the generated default as
  placeholder), then an **action grid** of icon buttons —
  walls get *Reverse · Split · Join · Duplicate · Lock · Delete*; doors get
  *Flip hinge · Flip swing · Duplicate · Lock · Delete* (windows omit the door
  flips). Detailed fields (thickness, coordinates, swing, …) follow underneath.
- **Custom names** — walls/doors/windows carry an optional name. Unset, they show
  a stable generated default (`Wall 123456`, `Door …`, `Window …`); a custom name
  takes absolute precedence. (Schema is additive + back-compat; round-trips on
  save/load.)
- **Lock** — a locked wall/opening can still be *selected* but can't be dragged,
  reshaped, rotated, or deleted from the canvas (handles hidden; ⌫/Del ignored) —
  matching how furniture lock works.
- **Duplicate** — `duplicateWall` / `duplicateOpening` make an editable copy
  (offset so it's visible; the custom name + lock are not copied) and select it.

## Floor-plan editor: new walls snap to join existing ones

- **Drawing a wall snaps to existing geometry** so segments connect cleanly: an
  existing wall *endpoint* within ~0.3 m captures the cursor (corner join), and
  failing that the nearest point on a wall *span* within ~0.25 m captures it
  (a mid-wall T-junction). Dragging clearly past a wall stays free, so a new wall
  can still extend beyond the one it crosses — snapping only engages near
  existing walls. Vertex snap wins over edge snap when both are in range.
- The vertex+edge snapping is a pure, unit-tested helper (`editor/snapToWalls.ts`)
  shared by the editor's pointer→world mapping.

## Floor-plan editor: furniture toggle, undo/redo, grid sizes, centring, clearer selection

- **Furniture show/hide** (header "Furniture", **hidden by default**) so footprints
  don't get in the way of editing — while hidden they can't be selected or moved.
- **Undo/redo buttons** in the toolbar (the ⌘Z / ⇧⌘Z hotkeys already worked, but
  there was no on-screen control — essential on touch).
- **Configurable snap grid** — a header selector with finer steps (down to 2.5 cm,
  was a min of 10 cm) for precise placement.
- **Plan centres in the canvas on open** — vertically too. Centres on the plan's
  true bounding-box midpoint (top↔bottom, left↔right), measuring the SVG's real
  offset in the scroll content so padding / a non-zero plan origin can't bias it
  (it previously sat too low on tall mobile viewports).
- **Clearer selection** — selected walls and doors/windows now get a translucent
  accent halo (mirroring the furniture highlight), so what's selected is obvious.
- **Curved walls snap back to straight** — dragging a wall's curve midpoint within
  ~12 px of the straight chord flattens it (clears the arc), even off a grid line.
- **Live length while drawing** a wall is more legible (larger, with a halo).
- Mobile: the ☰ menu is available in both View and Edit (it holds furniture/undo/
  grid/labels/export, not just drawing tools).

## Floor-plan editor: View/Edit mode, orbit-like pan/zoom, decluttered dimensions, correct door swing

- **View/Edit mode toggle.** The 2D editor now has a header toggle. **View** (the
  default on touch) pans/zooms and taps to inspect only — a one-finger drag never
  shifts a wall or a sofa by accident. **Edit** reveals the tools and lets you
  move things; on touch you tap an item to select it first, then drag (a drag on
  anything unselected pans). Mouse drag-to-move is unchanged. Move handles
  (wall/room vertices, curve bulge) only show in Edit.
- **Pan/zoom feels like orbit.** Wheel/trackpad-pinch zooms to the cursor with no
  modifier (was Ctrl+wheel — and React's passive `onWheel` meant its
  `preventDefault` was ignored, so Ctrl+wheel zoomed the whole browser page);
  now a native non-passive listener. Right-drag pans too; zoom-to-cursor scroll
  is applied in a layout effect so it no longer clamps and "doesn't take".
- **Decluttered dimensions.** Dimensions render as architectural callouts —
  extension lines + arrowheads spanning the measured length, rotated text in a
  line gap, oriented outside the plan (`WallDimension`); door/window widths use
  the same marker. Default **off**; the "Dims" toggle enables them. Label fonts
  scale with zoom (clamped) and cull progressively by on-screen size / screen so
  the plan never becomes overlapping text (`planLabelDisplay`, unit-tested).
- **Door swing matches 3D for end-hinged doors.** The 2D arc (and clearance +
  report) drew the swing side from `swing` alone, ignoring the hinge jamb; the 3D
  leaf mirrors it for end-hinged doors. Bedroom 2 (the only end-hinged door in the
  default flat) swung outward in 2D but inward in orbit/walk — folded the hinge
  into `doorSwingGeometry`'s sign so all 2D consumers agree with 3D.
- **Harness:** `shot.mjs` auto-dismisses the onboarding carousel + location prompt
  by default (opt out with `SHOT_KEEP_FIRSTRUN=1` or per-scenario `keepFirstRun`).

## Offline: idle-preload feature chunks so nothing needs opening once

- Even though the service worker precaches every chunk, a user who opened a feature (e.g. the
  2D floor-plan editor) **before** going offline would still hit it un-warmed if they
  disconnected while the ~21 MB precache was mid-download — and every first-open paid a fetch +
  parse delay. Now `src/ui/app/preloadOnIdle.ts` idle-warms the on-demand feature chunks in the
  background after boot (2D editor first, then dialogs/panels), so they're cached and instant
  without the user opening each one once.
- `lazyWithRetry` now exposes a `preload()` (plain factory call — a failed warm never triggers
  the recovery reload). App's existing post-boot idle effect kicks off `preloadFeatureChunks()`;
  warming is one initial `requestIdleCallback` then sequential awaited imports (no thundering
  herd, no per-chunk idle stall). Since the SW already precaches these chunks, warming them is a
  cache hit — no extra network. Unit-tested (`preloadOnIdle.test.ts`, plus `preload()` cases in
  `lazyWithRetry.test.tsx`); verified headless that the editor + other chunks load with zero
  interaction (`scripts/preload-verify.mjs`).

## Offline: precache the user guide so it works from the first launch

- The VitePress **user guide** (`<base>/docs/`) is now **precached** into the service worker, so
  it's available offline from the very first launch — not just after a first online visit. The
  guide builds *before* the app so the PWA's build-time scan can include it: `npm run build:all`
  now runs `scripts/build-with-guide.mjs`, which (1) builds the guide into `dist/docs`, then
  (2) runs the app build with `VITE_KEEP_DIST=1` so `emptyOutDir` is off and the SW precache
  picks up `dist/docs`. Added a `docs/**/*.{png,jpg,jpeg,webp}` glob so the guide's screenshots
  precache too (the existing patterns already cover its html/js/css/woff2). The precache grows
  from 150 → 225 entries (~16 → ~21.5 MiB, a one-time background download). Verified headless:
  load online once → go offline → the guide home, a sub-page, and a screenshot all load from
  cache (`scripts/offline-guide-test.mjs`). The `StaleWhileRevalidate` `user-guide` runtime
  cache stays as a backstop.

## Offline: fix SW hijacking the user guide; verify every feature offline

- The Workbox SPA navigation fallback had **no denylist**, so once the service worker was
  active it served the **app shell** for `<base>/docs/` — "Open the user guide" showed the 3D
  app instead of the VitePress guide (wrong content, online *and* offline). Added
  `navigateFallbackDenylist: [/\/docs\//]` plus a `StaleWhileRevalidate` `user-guide` runtime
  cache so the guide loads correctly and works offline after one visit.
- Swept the full feature surface offline (production build behind the SW, network off) via the
  command palette: **29/29 non-exempt features open with no ErrorBoundary and no uncaught
  errors** (catalog, objects, measure, Smart Start, 3D asset designer, custom-size furniture,
  tidy, design score, accessibility, comments, versions, history, share/export, panorama, tour,
  HQ render, render compare, palette-from-photo, design report, furniture CSV, plan SVG, 3D
  model export, floor-plan editor, room edit, appearance, product tour, top/reset view, time of
  day). Exempt features (AI / remote catalog / external APIs / sidecars) degrade gracefully
  (clear message, no crash). New harnesses: `scripts/offline-features-test.mjs` +
  `scripts/offline-exempt-test.mjs`.
- Confirmed asset precache coverage is complete for everything loaded at runtime: all JS/CSS/
  WASM/woff2 chunks, the self-hosted fonts, Draco/Basis decoders, and bundled GLB/material
  textures (`assets/**`). Scene rendering is fully offline-safe — procedural IBL
  (`SceneEnvironment` Lightformers, no HDR fetch), procedurally-baked window backdrops, and
  precached materials/models (already wrapped in `GltfErrorBoundary`).

## Offline: recover from failed chunk loads instead of crashing the app

- Opening the floor-plan editor (or any lazy panel/tool) could crash-land the whole app on the
  top-level ErrorBoundary with **"Importing a module script failed"** — a failed dynamic
  `import()` of a code-split chunk. The build already precaches every chunk (verified: the
  editor opens fully offline from a clean build), so the trigger is a chunk the page can't
  fetch right now: a **stale hash after a redeploy** (the PWA's `cleanupOutdatedCaches` drops
  old chunks) or a **transient miss** before the service worker finished precaching on the
  first visit.
- Added `src/ui/app/lazyWithRetry.tsx`: a drop-in `React.lazy` replacement that retries a
  chunk `import()` with backoff and, if it still fails **while online**, reloads once (guarded
  against reload loops via a sessionStorage cooldown; never reloads while offline, where a
  reload can't help) to pull the fresh build + service worker. `main.tsx` installs a
  `vite:preloadError` handler (`installChunkErrorRecovery`) for `modulepreload` failures.
- Migrated every `React.lazy` call site to `lazyWithRetry` (`lazyComponents.tsx`, `Effects`,
  `MaybeXr`, `CatalogDrawer`, `FinishPicker`). Infrastructure, not a user-facing feature, so —
  like the service worker — it carries no `FEATURE_FLAGS` entry. Unit-tested
  (`lazyWithRetry.test.tsx`: error classification, retry-then-succeed, non-chunk pass-through,
  online reload, no-loop cooldown, offline reject).
- Added offline verification tooling: `scripts/static-serve.mjs` (serves `dist/` under the
  production base the way a static host does — `vite preview` doesn't honour `base` for assets
  in this sandbox) and `scripts/offline-test.mjs` (headless: precache → reload → offline →
  open the editor). Confirmed the editor opens offline with no error.

## Docs: reframe as an HDB + condo app; concise README

- The product is an interior-design app for Singapore **HDB flats AND condominiums**, not just a
  4-room HDB sandbox. Reframed the framing across the live docs + metadata — `README.md` title is
  now **Sofa So Good**, plus `CLAUDE.md`, root `ARCHITECTURE.md`, `docs/ARCHITECTURE.md`,
  `docs/developer/architecture.md`, the user guide (`docs/user/index.md`, `getting-started.md`,
  VitePress config), `index.html` (`<title>` + description + OG/Twitter), and
  `public/manifest.webmanifest`. The move-in default is still a furnished 4-room HDB.
- Rewrote `README.md` from ~340 verbose lines into a concise, scannable page: a highlights table
  that links out to the relevant user-guide pages for detail, trimmed dev/commands, and tidy
  documentation + licensing sections.

## Modularity: split the monolithic files into co-located modules

Broke up the largest files into focused, cohesive modules. Each is a behaviour-preserving
code-move — the public symbol stays at its original path (re-exporting / re-assembling from the
new modules) so no import sites changed — verified per split by `tsc` + the full test suite, and
the UI splits additionally by `scripts/shot.mjs` screenshots.

- `furniture/builtinCatalog.ts` (4,697 → registry) → per-category `furniture/defs/<category>.ts`;
  rebuilt via a brace-aware split and proved **deep-equal** to the original catalog (99 keys, zero
  value drift).
- `furniture/layoutPresets.ts` (1,561) → one file per preset under `furniture/presets/`.
- `floorplan/templates.ts` (1,123) → `templates/{hdb,condo,shared}.ts`.
- `features/featureFlags.ts` (761) → `features/flags/{types,registry,resolve}.ts`.
- `materials/procedural/generators.ts` (1,127) → pattern family files under `procedural/patterns/`
  over a shared `procedural/fieldKit.ts` (tile size threaded as a param — patterns are now pure).
- `ui/report.ts` → `report/reportStyles.ts` (print CSS) + `report/reportShared.ts` (palettes/helpers).
- `ui/inspector/InspectorPanel.tsx` (1,250) → `MultiSelectPanel`, `PosField`, `TiltControls`,
  `useInspectorMinimize` co-located files.
- `ui/FinishPicker.tsx` (900) → `ui/finish/swatches.tsx` (swatch grid + sub-components).
- `ui/toolbar/MobileToolbar.tsx` (1,253) → `toolbar/mobile/parts.tsx` (Item/Section parts).
- `src/App.tsx` (933) → `ui/app/lazyComponents.tsx` + `ui/app/roomScopedItemIds.ts` (lazy chunks
  preserved).
- `ui/floorplan/FloorPlanEditor.tsx` (2,455) → `floorplan/editor/{planConstants,GridLines,PlanLibrary}`.

## Fully offline: self-hosted fonts + decoders + PWA service worker

- The core app now needs **zero runtime network**. Replaced the Google Fonts CDN `@import`
  (`src/index.css`) with self-hosted `@fontsource` packages (Plus Jakarta Sans + JetBrains Mono)
  imported in `main.tsx`; family names match the existing `--font-ui`/`--font-mono` tokens.
- Self-hosted the Draco glTF decoder under `public/draco/` (copied from the installed `three` by
  `scripts/copy-decoders.mjs`, wired into `predev`/`prebuild`); `gltf/decoders.ts` now defaults
  `DRACO_DECODER_PATH` to the base-aware `withBase('/draco/')` instead of the gstatic CDN
  (`VITE_DRACO_DECODER_PATH` override kept). Fixed `decodeGpuTexture`'s bare `/basis/` transcoder
  path (404s under the prod sub-path) to `withBase('/basis/')`.
- Added `vite-plugin-pwa` (Workbox `generateSW`): precaches the build (JS/CSS/wasm/woff2 + bundled
  GLB/texture assets) so the app loads and runs offline after the first visit. `registerType`
  autoUpdate; keeps the existing `public/manifest.webmanifest` (`manifest:false`);
  `maximumFileSizeToCacheInBytes` raised to 8 MiB for the three/vendor chunks; CacheFirst runtime
  caching for optional cross-origin CC0 assets. Build-only (dev SW disabled so it never fights HMR
  or the dev proxies); opt out with `VITE_DISABLE_PWA=1`. The SW is infrastructure, not a UI
  surface, so it is intentionally **not** a `FEATURE_FLAGS` entry.
- Verified with a headless Puppeteer run against `npm run preview`: the built app boots offline
  (3D canvas renders, fonts present) with **no** requests to `fonts.googleapis.com` or
  `gstatic.com`.

## Cleanup: remove dead code, consolidate duplicate `formatBytes`, add knip

- Deleted unused components `HelpModal` and `Fixtures` (never imported), removed the never-called
  `readShadow` from the remote-cache shadow pointer, and dropped the dead `formatMeters` alias.
- Consolidated the duplicated `formatBytes()` (was copied in `catalog/remote/hooks.ts` and
  `furniture/modelInfo.ts`) into `utils/measurement.ts`; both call sites now import the shared
  helper.
- Added `knip` + `knip.json` + `npm run deadcode` for ongoing unused-file/export detection.

## Docs: drop parallel-agent / git-worktree workflow requirements

- The contributor docs assumed an agent fleet running in parallel git worktrees. That workflow is
  no longer used, so the **requirement** is gone: removed the "running as one of several parallel
  agents" test-worker / hardlink-copy block from `CLAUDE.md`, the "parallel worktree subagents"
  resume note from `TASKS.md`, and the "Parallel worktree agents fight over the dev server" section
  + parallel-agent asides from `docs/visual-verification-playbook.md`.
- Simplified the worktree-referencing **comments** in `vite.config.ts`, `vitest.config.ts`, and
  `scripts/shot.mjs`. The functional safeguards stay unchanged — `resolve.dedupe` (single
  React/three instance), the `.claude/**` Vitest exclude, and the `shot.mjs` `flock` mutex are all
  still correct and harmless; only the parallel-agent/worktree wording was trimmed.

## Floor-plan editor: one-row mobile toolbar (tool dropdown + Tools modal)

- On phones the floor-plan toolbar wrapped into ~5 cluttered rows (the "Auto room" button even
  wrapped to two lines). It now fits a **single row**: a **☰ Tools** button, a compact
  **drawing-tool dropdown** (`<select>` — no more wrapping palette), and **Done**. Everything else
  opens in a proper **"Plan tools" modal**: plan name, level tabs, New / Reset / Template / Save /
  Reference photo, Labels / Dims / All-levels / Export / zoom, the **plan defaults** (ceiling
  height + wall colour), and a **Help → user guide ↗** link (reuses `openDocs`). The secondary
  controls are shared fragments so desktop keeps its full inline toolbar unchanged.
- Because those defaults now live in the Tools modal, the **Properties panel is hidden on mobile
  when nothing is selected** (its resting view only repeated the defaults) — it appears
  (minimized, expandable) only when you select a wall/room/door/window to edit it. Desktop keeps
  the defaults panel.

## Editor UX: fit-to-view on load + plan-inspector minimize

- **Per-room editor** now frames the whole room to the viewport on load: the dollhouse
  camera uses the aspect-aware `fitDistance` (the same helper as the whole-plan dollhouse)
  instead of a fixed `radius × 1.5` multiple, so the room just fills the screen on any aspect
  ratio (portrait phones included) rather than being cropped or tiny.
- **Floor-plan editor** now fits the whole plan to the *actual* canvas viewport on open: the
  base scale is computed from the measured container size (via a `ResizeObserver`) instead of a
  fixed 940×620 assumption, so the plan no longer overflows / needs a manual zoom-out on
  small/mobile screens. Re-fits on resize.
- **Plan-inspector minimize** (PARITY with the 3D inspector): the floor-plan Properties panel
  gets a minimize/expand toggle in its header and starts **minimized whenever an element is
  selected** (so the sheet doesn't cover the plan, especially on mobile); deselecting expands
  the resting defaults/help view.
- Gated the **room-editor caption price** (`~$…`) behind the `budget` flag too (it was an
  unconditional price display missed in the price-gating pass).

## Curated launch feature set — re-tier + price-display gating

- Production feature curation. **Off by default now** (`default: false` in `FEATURE_FLAGS`):
  `budget` (shopping list + budget panel), `shopExport`, `boq`, `livePrices`, `clearanceChecks`,
  `textBrief` (describe-it brief) — none are production-ready yet. **Surfaced in the default
  (Simple) experience** by re-tiering `pro → simple` (so the existing `useFeature`/Simple-mode
  gate shows them): plan compass, wall thickness, wall baseboards, sloping + curved walls, plan
  polyline markup, plan labels, replace-with-similar, walk camera controls, 360° panorama + tour,
  HQ render, model upload, export 3D model, mount-height presets, copy appearance, custom-size
  furniture, custom kitchen cabinets, render-preset compare, item-as-light, measure, versions,
  edit history, floor-texture transform (24 flags).
- **Price displays were unconditional** in several surfaces; they now hide with the `budget`
  flag (off by default): catalog cards, the inspector (single-item + multi-select total), the
  catalog drawer's price sort option + max-price filter, the swap modal, the parametric
  estimate, and the floor-plan furniture labels. The budget/shopping-list menu entries were
  already `budget`/`shopExport`-gated.

## iOS standalone: status-bar tint tracks the time-of-day sky

- On an Add-to-Home-Screen iOS PWA the canvas is full-bleed under the notch, but the
  `<meta name="theme-color">` band was static Clay (`#ecdfce`/`#251f1b`), so the top edge showed
  a hard seam against the sky — which shifts colour across the day. New
  `scene/lighting/statusBarTint.ts` samples the **real top-centre canvas pixel** each frame
  (read back via the preserve-drawing-buffer the Export/Record features already require) and
  overrides every `theme-color` meta (both media-scoped tags) with it, so the chrome matches the
  scene *exactly* — tone-mapping, exposure and camera pitch included — not just an approximate
  sky colour. The analytic hemisphere sky tint (linear→sRGB) is the pre-first-frame fallback.
  `Lighting`'s frame loop drives it (`updateStatusBarTint`); the apply step dedups on an unchanged
  hex (cheap string compare), and since the read runs before r3f draws, the day/night settle edge
  fires one extra `invalidate()` so the final frame is the one sampled. Verified end-to-end: the
  applied tint equals the rendered top pixel at noon (`#f5f7f7`) and night (`#3b3734`).
  Colour-conversion + DOM-override + fallback logic unit-tested; interaction-test scenario added
  (`scripts/scenarios/status-bar-tint-simple.json`).

## Custom plans: crown molding fades with the wall (full floor-to-ceiling reveal)

- Crown molding (the wall–ceiling trim) was a static mesh in `PlanShell`, so a faded/hidden
  wall left an opaque band at the ceiling — the reveal wasn't truly floor-to-ceiling. It now
  fades/hides with its host wall via a new `FadeCrown`, sharing a `useTrimFade` hook with
  `FadeSkirting` (both driven by `planWallRevealTarget`). So body + skirting (floor) + crown
  (ceiling) reveal as one piece in every mode — translucent fades all to 0.15, **auto-hide
  removes all** (skirting + crown follow the same hide logic), opaque keeps all solid. Both
  interior and exterior trim fade with their wall. Verified by screenshot (translucent: uniform
  top-to-bottom; hidden: nothing left behind).

## Un-roomed flag: exact traced outline, red in the 2D editor + custom-plan skirting fade

- **Exact footprint.** Un-roomed detection now traces the plan's exterior wall centre-lines
  into a single ordered polygon (`footprint.ts` `traceBuildingOutline`, walking shared
  endpoints), replacing the grid sample — so the fill/flag has crisp edges and handles
  L/U/notched outlines. Rendered beneath the room floors/fills, so only walled-in floor with
  no room shows through.
- **Red moved to the 2D editor, shown in both modes.** The red un-roomed highlight now lives
  in the 2D plan editor (`FloorPlanEditor`, the traced polygon filled `--danger` beneath the
  rooms) — where you author — not the orbit view. `unroomedFlag` retiered `pro` → `simple` so a
  casual user sees it too. The 3D orbit keeps an unconditional **neutral** fallback ground over
  the same footprint (fills the void; no red there).
- **Custom-plan skirting fade.** Skirting strips now fade in lockstep with their host wall
  (new `FadeSkirting`, sharing `planWallRevealTarget` with `FadeWall`) — previously an opaque
  skirting band stayed at the floor when an interior wall went translucent. Verified by
  screenshot (2D red flag, 3D neutral fill, interior skirtings fading); footprint tracing
  unit-tested (square, L-shape, open/short loops).

## Custom plans: fallback ground for un-roomed floor + red flag

- After dropping the grounding slab, walled-in floor with no room over it would be a void.
  `PlanShell` now renders a **fallback ground** there — always (so there's never a hole),
  within the building footprint (not beyond the walls). It detects the enclosed area with a
  pure even-odd ray test over the exterior wall centre-lines (`floorplan/footprint.ts`
  `pointInBuilding` / `unroomedCells`, grid-sampled), so it's correct on L/U/notched outlines.
- The fallback turns **red** when the new pro `unroomedFlag` feature is on — flagging
  un-roomed gaps so the user adds a room there (it clears once a room covers it). Simple mode
  shows a neutral screed fill instead (no hole, no alarming red). Verified by screenshot in
  both modes (removed a bedroom → red in Pro, neutral in Simple) + unit tests for the footprint
  geometry.

## Custom plans: drop the grounding slab (rely on per-room floors)

- Removed `PlanShell`'s grounding slab — the bare grey pad that protruded ~0.25 m past the
  walls under a custom plan. Each room already draws its own floor (`PlanRoomFloor`, per-room
  catalog finish), so the slab only added an unfinished-looking base plate. The curated flat
  (`Apartment.tsx`) has had none since C-prior; custom plans now match. Verified by screenshot
  (clean low-angle base + full per-room floor coverage top-down, no holes).

## Wall thickness: seamless corners for any (override) thickness pairing

- Connecting walls now keep perfect, gap-free corners regardless of differing per-wall
  thicknesses (no notch or jutting). **Curated flat:** the abutment extension already reaches
  each neighbour's outer face (`wallEndAbutmentThickness`, override-aware), but `WallSegment`
  only re-rendered on its OWN override — so thickening wall A left neighbour B's corner stale.
  It now subscribes to the whole `floorPlan.walls` array, so both walls rebuild when either
  changes (verified: a clean NW corner after thickening the north wall). **Custom plans:**
  `wallBoxes` previously used centreline-length boxes (an outer-corner notch that grows with
  thickness); it now extends each end span by the abutting wall's half-thickness
  (`planWallEndAbutment`), mirroring the curated flat. Unit test for the extension; both paths
  verified by screenshot.

## Per-wall thickness overrides reach the curated flat too

- The per-wall thickness override (`PlanWall.thicknessM`) now also drives the **curated HDB
  flat**, not just custom plans. The default plan's wall ids match the curated `WALLS`
  (`buildDefaultPlan` copies `id`), so editing a wall's thickness in the 2D plan inspector
  flows to the 3D curated render with no new selection UI. `wallSegments.ts` gained a per-wall
  override map (`setFlatWallThicknessOverrides`, keyed by wall id, synced from `floorPlan.walls`
  by the store subscription); `wallThicknessMetres` consults override → global default →
  built-in. `WallSegment` resolves thickness reactively (per-wall override + global default)
  so a memoised wall rebuilds on edit; `Skirting`/`RoomShell` re-derive on `floorPlan.walls`
  changes. Verified by screenshot (two bedroom partitions thicken individually).

## Configurable wall thickness (global default + per-wall overrides)

- New pro `wallThickness` feature: a **plan-wide default** thickness per category
  (`FloorPlan.wallThickness?: { external?, internal? }`) plus an optional **per-wall
  override** (`PlanWall.thicknessM?`), both edited in the 2D plan inspector (plan-level
  controls + a "Thickness (m)" field on a selected wall with "Use plan default" reset).
  Replaces the previously hardcoded 0.2 m / 0.1 m.
- Custom plans resolve via `planGeometry.planWallThickness(wall, plan)` (override → plan
  default → built-in), so render + collision + 2D editor all agree. The curated flat honours
  the **global default** too: `wallSegments.ts` holds the active defaults in a module-level
  holder (`setFlatWallThicknessDefaults`), kept in sync with `floorPlan.wallThickness` by a
  store subscription, and `WallSegment`/`Skirting`/`RoomShell` re-render on change. Per-wall
  overrides don't apply to the curated flat (it has no per-wall editor).
- Schema fields are optional + additive (no version bump). Unit tests for both resolvers; the
  flag is `pro` so the generic Simple/Pro tiering test covers its gating. Global default
  verified live by screenshot (curated flat walls thicken 0.2 → 0.5 m).

## Wall reveal: fade near side/return walls (no awkward opaque fins)

- Edge-on "return"/side walls used to stay opaque when you faced an adjacent
  facade — e.g. bedroom 3's east wall stuck at ~0.94 opacity while looking at the
  north facade, an awkward fin (and east/south walls only fully hid when faced
  head-on, not at grazing angles). `wallRevealFactor` now combines the per-wall
  facing term with a **proximity** term: a wall clearly nearer the camera than the
  plan centre fades regardless of its normal, while walls past the centre (the far
  "back") keep their facing-based opacity — so near rooms open fully but the
  dollhouse still reads as a box. The facing ramp also widened so a perpendicular
  near wall (dot ≈ 0) fully fades. Centre is passed by `WallSegment` (flat),
  `PlanShell`, and `PlanDoorLeaf`; it's only a proximity reference (orientation is
  still the robust point-in-room probe, so off-centre facades are unaffected).
  Verified by state probe (the return wall drops 0.94 → 0.01 facing north, far
  walls stay ~0.96) + screenshots.

## Wall reveal: add scope (exterior only / exterior + interior)

- The wall-reveal control is now two axes: **mode** (`Fade translucent` (default) / `Fully hidden`
  / `Fully opaque`) **×** **scope** (`Exterior only` (default) / `Exterior + interior`). New
  session-only `wallRevealScope` store field + setters; the scope dropdown shows in the Scene
  menu (desktop + mobile) whenever the mode isn't fully opaque. Mode labels clarified.
- Interior partitions (rooms on both sides, so no single "outward") fade when the camera **faces**
  them via the new pure `cameraFacingNormal` helper; exterior walls keep the point-in-room
  outward probe. Interior walls' published opacity drives their doors (curated `Door` + custom
  `PlanDoorLeaf`) to fade/hide in sync; the value returns to 1 when scope flips back to exterior.
  Wired through `WallSegment` (fixed flat) and `PlanShell` `FadeWall`/`FadeWindow`/`PlanDoorLeaf`
  (custom plans) — the custom-plan path now also honours the mode (previously always translucent).
- `cameraFacingNormal` unit-tested; all four mode×scope combinations verified by headless
  screenshot.

## Wall body: single watertight extrusion (seamless translucent walls)

- With the walls now fading translucent, the wall **body** showed floor-to-ceiling vertical
  seams at every window/door edge: the body was built from separate abutting boxes (jambs +
  sill + header), and their internal end-cap faces became visible (and double-blended) once
  the boxes turned transparent. Replaced the per-segment boxes with **one extruded shape per
  wall** — the wall rectangle minus window holes / door notches — so the body is watertight
  with no internal faces and reads seamlessly when translucent. New pure, unit-tested
  `walls/wallBodyShape.ts` (`buildWallBodyOutline`: floor-reaching cutouts → bottom notches,
  floating cutouts → interior holes, heads clamped to the wall top, ends extended by the
  abutment for flush corners). The face planes (per-room finish), skirting, and crown still
  use the render segments, unchanged. Verified by headless screenshot (window edges seamless
  head-on and at an orbit angle).

## Wall reveal: the real fix — `needsUpdate` on the transparent toggle

- **Root cause of the bedroom-facade reveal bug.** The fade math was correct all along (the
  wall opacity provably dropped to 0.15 when faced), but the wall *rendered* opaque anyway:
  the wall body / window frames / door leaves / skirting are created **opaque**
  (`transparent: false`) and only flip `material.transparent = true` at runtime when fading.
  three.js bakes the transparent flag into the compiled program, so without a `needsUpdate`
  the alpha blend never engaged — "the opacity value decreases but the render doesn't update"
  (diagnosed from a live on-device overlay reading the real applied opacity). Custom plans
  (`PlanShell`) were unaffected because their materials are authored `transparent` from the
  start.
- **Fix:** set `material.needsUpdate = true` on the frame the `transparent` flag actually
  flips (not every frame — no needless recompiles) in `WallSegment`, `Window` (non-glass
  parts), `Door`, `Skirting`, and `PlanShell` `FadeWall`. The dollhouse reveal now renders
  genuinely translucent — **verified by headless screenshot** (the facade goes see-through,
  showing the bedrooms/furniture behind), which itself confirms this was a real material bug,
  not the previously-assumed headless-renderer limitation.

## Wall reveal: robust per-wall outward normal (fixes off-centre bedroom facade)

- The dollhouse wall-reveal fade now orients each wall's "outward" direction by **probing which
  side of the wall is a room** (`pointInRooms`) instead of "away from the bounding-box centre".
  On the curated flat the bedroom band sits on the north wall, which is offset from the apartment
  centre, so the old centre heuristic mis-judged it: a faced bedroom facade only partially faded
  (~0.5 opacity, "very slightly translucent") while the centred living/kitchen walls went almost
  clear. The new metric makes every faced exterior wall reach the same near-clear state — verified
  via state probe (`wall-ext-N` factor → 0, published opacity lerping to 0.15; E/S walls stay
  opaque). This is shape-independent, so it also works on non-rectangular / notched custom plans.
- New pure module `walls/wallRevealMath.ts` (`smoothstep`, `orientOutward`, `wallRevealFactor`,
  `pointInRooms`, `RoomRect`), fully unit-tested (`wallRevealMath.test.ts`, 12 tests incl. an
  L-shape case where the bbox centre lands in the notch). Integration test `wallReveal.flat.test.ts`
  (4 tests) locks in the real-`ROOMS`/`WALLS` bedroom-facade behaviour.
- Wired into `WallSegment` (fixed flat), `PlanShell` `FadeWall`/`FadeWindow`, and `PlanDoorLeaf`
  (custom plans) — each builds the room rectangles for its level and falls back to the plan-centre
  reference only when the probe is ambiguous (interior partitions stay solid).

## IXT-SUITES: interaction-test ladder for Design score

- Added `scripts/scenarios/design-score-simple.json` (18 steps, 2 screenshots) covering the `designScore`
  pro feature: asserts hidden in Simple / present in Pro, furnishes the flat, opens the panel
  (`#designScorePanel`, "Design score" with the grade dial + Clearance/Furnishing/Circulation/Daylight/
  Lighting breakdown + suggestions), checks the mobile bottom-sheet, closes, and confirms it's hidden
  again in Simple. Test coverage only — no app code changed.

## Catalog search: search by room / use-case intent

- Catalog search now understands **room/use intent** (Coohom-style): typing "bedroom", "office",
  "lighting", "storage", etc. surfaces the furniture that belongs there (bedroom → beds, nightstands,
  wardrobes, dressers) even though no item is literally named that. A `CATEGORY_INTENT` map + `expandIntent`
  feed the mapped item terms as discounted synonyms in `fuzzySearchSmart`. Item-level words ("bed") are
  deliberately NOT intent keys, so a single-item search isn't broadened unexpectedly.
- 4 unit tests (intent expansion + "bed doesn't broaden" guard); browser-verified ("bedroom" returns
  Nightstand/Wardrobe/Dressing table/etc. in the real catalog). Builds on PARITY-SEARCH.

## RZ5 (partial): beveled baseboard + crown-molding trim

- Baseboards and crown molding now build from the shared `BeveledBox` chamfer instead of hard
  `boxGeometry` in BOTH the fixed apartment (`WallSegment`) and custom plans (`PlanShell` skirting +
  crown), so the trim edges round slightly and catch a highlight rather than reading as flat slabs —
  matching the case-good bevel pass. The crown molding's `polygonOffset` (ceiling z-fight guard) is
  preserved on its material. Browser-verified on both the default flat (baseboards) and a template plan
  (skirting): trim renders cleanly along the floor/wall junction, no z-fighting or clipping. Skirting
  seam AO + painted-trim wear remain (TASKS RZ5).

## IXT-SUITES: interaction-test ladder for saved camera views

- Added `scripts/scenarios/saved-views-simple.json` (16 steps, 1 screenshot) covering saved camera views
  (simple-tier): asserts the flag is present in Simple, saves the current view (`saveCurrentView` →
  `savedViews.length === 1`), moves the camera away, applies the saved view (`applyView` bumps
  `applyViewNonce` + sets `pendingViewPose`, restoring the dollhouse pose — verified visually), then
  deletes it. Store-driven (the UI lives in the View menu). Test coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for the parametric furniture designer

- Added `scripts/scenarios/parametric-designer-simple.json` (18 steps, 2 screenshots) covering the
  custom-size (parametric) furniture designer (`parametricFurniture` pro): asserts hidden in Simple /
  present in Pro, opens the dialog (`.parametric-dialog`, "Custom-size furniture" with type tabs +
  dimension sliders + finish swatches + price + a live 3D preview), switches type Bookshelf → Wardrobe
  (preview + controls update), closes, and confirms it's hidden again in Simple. Test coverage only —
  no app code changed.

## IXT-SUITES: interaction-test ladder for the measure / tape tool

- Added `scripts/scenarios/measure-simple.json` (18 steps, 1 screenshot) covering the `measure` pro
  feature: asserts hidden in Simple / present in Pro, toggles tape mode, injects two points via the
  `addTapePoint` store action (sidestepping the headless canvas-raycast limit), and verifies a 3.00 m
  measured line with its drei-`Html` distance label renders in-scene, then that turning tape mode off
  clears the points. Test coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for presentation mode

- Added `scripts/scenarios/presentation-simple.json` (23 steps, 2 screenshots) covering the
  `presentation` pro feature (full-screen saved-views slideshow): asserts hidden in Simple / present in
  Pro, seeds two saved views, starts presenting (`setPresenting` → the slideshow mounts on "Presentation
  · 1 / 2" with the view caption), advances with Next ("2 / 2"), exits, and confirms it's hidden again in
  Simple. Test coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for "My sets"

- Added `scripts/scenarios/user-sets-simple.json` (15 steps, 1 screenshot) covering the `userSets` pro
  feature: asserts hidden in Simple / present in Pro, places + selects two items (`setSelectedItemIds`),
  saves the selection as a named set (`saveSelectionAsSet` → `userSets.length === 1`), then deletes it
  (`deleteUserSet`). Store-driven (the UI lives in the Arrange menu). Test coverage only — no app code
  changed.

## IXT-SUITES: interaction-test ladder for pinned comments

- Added `scripts/scenarios/comments-simple.json` (22 steps, 2 screenshots) covering the `comments` pro
  feature: asserts hidden in Simple / present in Pro, opens the panel (`#commentsPanel`, "Comments"),
  pins a note via `addComment` (rendered both as an in-scene pin and in the panel list), resolves it
  (`setCommentResolved`), checks the mobile bottom-sheet, closes, and confirms it's hidden again in
  Simple. Test coverage only — no app code changed.

## QOL: recent searches also captured on click-away

- Recent catalog searches are now remembered when the search field loses focus with a ≥2-char query
  (e.g. you searched then clicked a result), not only on Enter — capturing the common click-away case.
  `pushRecent` de-dupes so the Enter+blur paths are idempotent. Browser-verified (type "couch", blur →
  persisted recents `["couch"]`).

## IXT-SUITES: interaction-test ladder for the accessibility check

- Added `scripts/scenarios/accessibility-simple.json` (17 steps, 2 screenshots) covering the
  `accessibility` pro feature: asserts hidden in Simple / present in Pro, opens the panel
  (`#accessibilityPanel`, "Accessibility" with the per-door width checks + per-room 1.5 m turning-circle
  results + OK/NARROW/TIGHT badges), checks the mobile bottom-sheet, closes, and confirms it's hidden
  again in Simple. Test coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for the daylight & ventilation check

- Added `scripts/scenarios/daylight-simple.json` (17 steps, 2 screenshots) covering the `daylight` pro
  feature: asserts hidden in Simple / present in Pro, opens the panel (`#daylightPanel`, "Daylight &
  ventilation" with the per-room glazing/openable breakdown + PASS/FAIL badges + Daylight/Ventilation
  scores), checks the mobile bottom-sheet, closes, and confirms it's hidden again in Simple. Test
  coverage only — no app code changed.

## a11y: catalog search labels + live result count

- Accessibility pass on the catalog search: the input now carries an explicit `aria-label` (it was
  labelled only by its placeholder, which screen readers don't treat as a label), the result-count line
  is an `aria-live="polite"` region (so "N matches" is announced as the user types). The recent-search chips
  are already individually labelled buttons. Additive ARIA only — no behaviour or rendering change
  (tsc + full suite green).

## QOL: clear recent catalog searches

- The recent-searches chip row now ends with a **"Clear"** button that wipes the saved terms (calls the
  existing `clearRecent`), completing the feature. Browser-verified: clicking Clear removes the chips and
  empties the persisted list (localStorage key cleared).

## QOL: recent catalog searches

- The catalog search now remembers **recent search terms** (per-device, most-recent-first, de-duplicated,
  capped at 6) and shows them as clickable chips when the field is focused and empty — one tap re-runs a
  past search, like Coohom/modern catalogs. Terms are committed on Enter; chips use `onMouseDown`
  preventDefault so a click lands before the focus-blur hides them. New pure `recentSearches.ts`
  (load/add/cap/parse, storage-guarded) with 7 unit tests; browser-verified (search "armchair" then
  "sofa" → chips `["sofa","armchair"]`, click re-applies).

## QOL: catalog search result count

- The catalog search now shows a small "N matches" count under the field when a query has results
  (the empty-state already covers zero), giving quick feedback on how many items matched — like Coohom's
  search. Subtle muted text via theme tokens. Browser-verified ("sofa" → "8 matches").

## QOL: catalog search clear (×) button

- The catalog search field now shows a **clear (×) button** while a query is typed (reusing the themed
  `.icon-btn`), so a query can be cleared with one click — the universally-expected affordance that was
  previously only reachable via the Escape key. Positioned inside the field's right edge with the input
  gaining right padding so text never runs under it. Browser-verified: the × appears on input and clears
  the query on click (light/dark themed via tokens).

## Robustness: value-noise period guard (prevents NaN→black textures)

- Hardened `makeValueNoise` (the base of every procedural pattern) against a non-integer `period`: the
  lattice grid is sized and indexed by `period`, so a fractional value previously produced out-of-grid
  `undefined` reads → NaN → all-black textures (the trap that bit the concrete staining work). It now
  coerces to a valid positive integer — the **identity for every integer period in use today**, so all
  existing textures are byte-for-byte unchanged (the generator determinism tests confirm it). New
  `noise.test.ts` proves non-integer `period`/`baseFreq` now yield finite output and integer periods are
  unchanged.

## RZ4 extension: cloudy staining on concrete

- The `concrete` generator gains a low-frequency cloudy-staining layer — the broad water-mark /
  cure-blotch tonal variation real poured concrete has, on a larger scale than the existing mottle, with
  the stained patches reading a touch less rough (sealed sheen). Makes bare-concrete floors/walls read
  less like a flat slab. Browser-verified on a `floor-concrete` floor (grey with soft cloudy patches).
- A `generators.test.ts` variance+determinism guard was added first and **caught a NaN→black
  regression**: value-noise grid sizing requires an **integer** `baseFreq`, so the initial `2.4`
  produced `undefined` grid reads → NaN → all-black albedo; fixed to `3` (documented inline).

## RZ4 extension: aged mortar + roughness micro-detail on exposed brick

- Extended the RZ4 grout-aging treatment to the `brick` generator: mortar joints are now darkened
  unevenly by a low-frequency dirt fbm (dirtier patches read slightly rougher) instead of a near-uniform
  grey, and the brick clay face gains a faint high-frequency roughness break-up so it isn't a flat matte
  slab. Albedo change (visible on every tier) + roughness; seamless and deterministic per cache key.
- `generators.test.ts` asserts the mortar pixels span a range of darkness (aged). Browser-verified on a
  `wall-brick-red` accent wall: running-bond brick with varied mortar + per-brick colour, no artifacts.

## IXT-SUITES: interaction-test ladder for the per-room editor

- Added `scripts/scenarios/room-editor-simple.json` (21 steps, 3 screenshots) covering the per-room
  editor: `enterRoomEditor` isolates a room and the editing catalog mounts only there (`.panel.catalog`),
  an item placed in the editor persists, `exitRoomEditor` returns to the full scene and unmounts the
  catalog (the item still persists), and the catalog renders as a mobile bottom-sheet at 390×844. Test
  coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for Smart Start

- Added `scripts/scenarios/smart-start-simple.json` (20 steps, 3 screenshots) covering the Smart Start
  one-click furnish wizard (simple-tier): asserts it's present in Simple mode, opens the wizard modal
  (style grid: Move-in Default / Scandi Calm / Warm Industrial / Cozy Tropical / Japandi / Coastal +
  brief input), picks a style, clicks "Furnish my flat" and confirms an emptied flat is furnished
  (`state.items.length > 0`) with the modal closed, then checks the mobile modal at 390×844. Test
  coverage only — no app code changed.

## IXT-SUITES: interaction-test ladder for clearance checks

- Added `scripts/scenarios/clearance-checks-simple.json` (21 steps, 3 screenshots) covering the
  `clearanceChecks` pro feature: asserts it's hidden in Simple mode and present in Pro
  (`state.featureFlags.clearanceChecks`), opens the panel (`#clearancePanel`, "Clearance checks /
  HDB 90 cm walkways" with the blocking/overlap/in-wall/walkway/clear summary + per-issue fix hints),
  toggles the in-scene clearance overlay (`clearanceOn`), checks the mobile bottom-sheet at 390×844,
  closes the panel, and confirms it's hidden again back in Simple. No app code changed — test coverage
  only (IXT-SUITES backlog).

## Catalog search: plural queries now match singular names

- Fixed a search gap where a plural query returned no results: the fuzzy matcher is a subsequence test,
  so "sofas" scored 0 against "Sofa" (the trailing plural char broke the run) — typing "sofas",
  "chairs", "tables", etc. surfaced nothing. `fuzzySearchSmart` now also scores a **singularised** form
  of the query (strip trailing `s`/`es`) at full weight, and expands synonyms of the singular too
  ("couches" → Sofa). New `singularize` helper + 3 unit tests; browser-verified ("sofas" ranks the
  sofas first). Builds on PARITY-SEARCH.

## RZ2 tail: custom-plan window glass sky-catch (daylight day/night look)

- Custom/edited-plan windows (`PlanShell` `FadeWindow`) now match the fixed apartment's glass: a clear,
  sky-lit pane by day that goes dark and reflective at night, driven by the `getFixtureGlow` daylight
  signal — a cheap emissive sky-catch (`glassSkyCatchIntensity`, all tiers) plus a day→night colour
  (`#bcd4e6`→`#20272f`) and opacity blend (more opaque at night). Previously custom-plan glass was a
  static pale pane regardless of time of day.
- Browser-verified (`scripts/scenarios/plan-glass-skycatch.json`): glass reads clear/light by day and
  dark by night on a loaded template plan; full suite green. Room-editor glass + High+ transmission
  remain (TASKS RZ2).

## PARITY-NORTH: 3D nav compass now tracks scene North

- The on-canvas 3D nav compass (`NavCluster`) previously rotated its needle by the camera heading
  alone, ignoring the user-set North orientation — so once `orientationDeg` was changed it disagreed
  with the 2D plan compass and pointed the wrong way. The needle now rotates by `heading −
  orientationDeg`, so it points to **true scene North** and matches the 2D compass (which rotates by
  `-orientationDeg`); at `orientationDeg = 0` the behaviour is unchanged.
- Extracted the pure math to `ui/compassHeading.ts` (`forwardToHeadingDeg` + `compassNeedleDeg`) with
  4 unit tests. Browser-verified (`scripts/scenarios/compass-orientation.json`): rotating North +90°
  shifts the needle SVG transform by −90° (315°→225°). Completes PARITY-NORTH (2D compass already shipped).

## RZ3/PHOTO-BEVELS: beveled edges on parametric kitchen cabinets

- The parametric `CabinetModule` (base / wall / tall kitchen cabinets) now renders its body panels
  (carcass / toe-kick / cornice / doors / drawers / shelves) and the worktop/countertop through the
  shared `BeveledBox` helper instead of hard `boxGeometry`, so cabinet and counter edges carry the
  same small auto-clamped chamfer as the rest of the case goods. Handles, glass, shaker rails, sink
  and hob are left as-is (small/detail or non-box). Part positions/sizes/materials are unchanged —
  only the box-vs-rounded geometry differs.
- tsc + biome + full suite (incl. `cabinetModel`) green. Verification is by parity with the
  Bookshelf/Wardrobe `BeveledBox` swap visually confirmed earlier (identical helper + `safeBevelRadius`
  clamp, unit-tested) — CabinetModule is the user-generated parametric primitive with no builtin
  catalog def to place headlessly. ShoeCabinet/WallCabinet/CabinetCorner + appliances remain (TASKS RZ3).

## RZ3/PHOTO-BEVELS: beveled edges on Bookshelf + Wardrobe carcasses

- The Bookshelf (plinth, side panels, shelves, cabinet doors) and Wardrobe (closed body, hinged door
  panels, sliding aluminium frame + laminate inserts, open-carcass sides/top/bottom) now build from
  the shared `BeveledBox` helper instead of hard `boxGeometry` slabs, so their edges carry a tiny
  auto-clamped chamfer (≤7 mm, detail-scaled smoothness) that catches a highlight instead of reading as
  flat cardboard — matching the case goods already converted (Sideboard/Dresser/Nightstand/…).
- The chamfer is clamped by `safeBevelRadius` (≤40 % of the thinnest side) so thin panels never
  self-intersect; footprints/joins are visually unchanged. Browser-verified
  (`scripts/scenarios/case-good-bevels.json`): the wardrobe renders fully intact (doors + handles
  aligned, no clipping/z-fighting); edge light-catch itself is real-GPU-pending (flat tier has no
  specular). Cabinet modules + appliances remain (see TASKS RZ3).

## PARITY-SEARCH: synonym-aware catalog search across every source

- Catalog search now expands the query through a curated **synonym dictionary** (`couch`→sofa,
  `telly`→tv, `fridge`→refrigerator, `bedside table`→nightstand, …) before fuzzy-ranking, so
  alternate everyday terms surface the right item. Crucially this applies to the QUERY, so it works
  for **pack and user-uploaded items that have no hand-authored keywords** — previously a search for
  "couch" missed an uploaded model literally named "Sofa". Matches Coohom's forgiving search.
- New `ui/catalog/searchSynonyms.ts`: `SYNONYM_GROUPS` + `expandQuery` (substitutes a synonym inside a
  phrase — "leather couch" → "leather sofa", longest-term-first so "tv console" isn't shadowed by
  "tv") + `fuzzySearchSmart` (scores the query AND its synonym variants, variants discounted so a
  literal name match still ranks first). The generic `fuzzyScore`/`fuzzySearch` stays pure. Wired into
  `CatalogDrawer`'s search; existing per-item keywords still apply and the prior keyword test is
  unchanged.
- 7 unit tests (synonym-without-keywords, phrase substitution, literal-beats-synonym, typo tolerance,
  empty-query passthrough, non-match drop). Browser-verified (`scripts/scenarios/smart-search-synonyms.json`):
  typing "couch" ranks the 3-seat + 2-seat sofas first.

## Fix: custom-plan walls now turn translucent consistently in the dollhouse view

- **Bug:** in a custom/edited floor plan (`PlanShell`), orbiting to look into the home left near
  walls only partly translucent — a long facade wall split into segments by windows would have its
  middle fade while the ends stayed opaque, and near walls viewed off-axis stayed solid. Internal
  partitions also half-faded, giving a muddy patchwork.
- **Cause:** `FadeWall`/`FadeWindow`/`PlanDoorLeaf` decided the fade from a **position** test (the
  angle between *segment→camera* and *segment→centre*), which is evaluated per segment-centre — so
  segments of one wall disagreed, and off-axis near walls read as "far". It also faded every wall,
  including internal partitions.
- **Fix:** switched to the **orientation-based** metric the default flat already uses (`WallSegment`):
  a wall fades from its outward broad-face normal vs the camera→centre direction, which is identical
  for every segment of a wall, so the whole wall fades together regardless of where the camera sits.
  And, like the default, **only external/perimeter walls fade** — internal partitions stay solid so
  the layout still reads. Windows and door leaves follow their host wall's external flag.
- Verified on a custom template (`scripts/scenarios/wall-reveal-verify.json`): from a face-on angle
  the near external wall fully turns translucent (min opacity 0.12) while internal partitions stay
  opaque; no patchy per-segment reveal.

## RZ4: aged grout + roughness micro-detail on procedural surfaces

- **Grout joints now read as lived-in, not pristine.** The tile / hexagon / subway generators darken
  their grout/joint albedo unevenly via a low-frequency dirt fbm (down to ~74 % in the dirtiest
  patches, dirtier spots slightly rougher), so grout lines stop looking like a single flat printed
  tone. Visible on every tier including the flat Performance default (it's an albedo change).
- **Roughness micro-detail** added to wood, tile and marble faces — a faint high-frequency fbm break-up
  (±0.04–0.08) so varnished timber / glossy ceramic / polished marble don't read as a dead-uniform
  sheen under reflections (Medium+). Touches only the roughness map; albedo/normal unchanged on faces.
- All changes live in the shared `procedural/generators.ts` field functions, so both the sync and
  OffscreenCanvas-worker paths get them; fbm tiling preserves seamlessness, and outputs stay
  deterministic per `{id, pattern, swatch, size}` (cache-key safe). Tests in `generators.test.ts`
  assert determinism, that tile grout pixels span a range of darkness (aged), and that tile/marble
  roughness maps carry micro-detail. Visual: `scripts/scenarios/grout-aging-rz4.json` (tile/hex/marble
  floors render cleanly, no z-fighting/clipping).

## RZ1: contact-shadow grounding on the flat Performance tier

- Furniture now casts a **soft contact-shadow blob on every quality tier — including the default flat
  Performance tier**, which previously rendered with no grounding at all so pieces read as floating on
  weak GPUs / the software renderer. The cue is the existing cheap `scene/ContactShadow.tsx` (one shared
  radial-gradient texture + a transparent floor plane per item, `depthWrite` off at +0.006 m → no shadow
  map, no z-fighting), so the cost is just transparent overdraw. Implemented by flipping
  `QUALITY_PRESETS.performance.contactShadows` `false → true` (`scene/quality.ts`); Medium+ already had it.
- Gated behind a new **`contactShadows` feature flag** (`features/featureFlags.ts`) — **simple tier,
  default on, prod-safe** (pure code, no assets) so it shows in both Simple and Pro mode. `FurnitureLayer`
  ANDs the flag with the per-tier quality setting (`useFeature('contactShadows') && quality.contactShadows`),
  and the Graphics-panel per-setting override still applies independently.
- Tests: `quality.test.ts` asserts every tier (incl. performance) enables contact shadows; `featureFlags.test.ts`
  asserts the flag is simple-tier (on in Simple AND Pro). Visually verified on the Performance tier via
  `scripts/scenarios/contact-shadows-perf.json` — soft grounding halos under sofa + armchair with the flag on,
  bare floor with it off, no z-fighting/clipping.

## Template categories: housing type › project › apartment-type picker

- Floor-plan templates are now **categorised** by a three-level hierarchy — **housing type**
  (HDB / Condominium) › **project name** › **apartment type** — added as an optional
  `FloorPlan.category` ({housingType, projectName, apartmentType} in `floorplan/types.ts`). Every
  built-in `PLAN_TEMPLATES` entry carries one (grouped under Singapore developments, e.g. Serangoon
  North Vista, Tampines GreenVerge, Bishan Ridges, Sky Habitat, d'Leedon), and the **default plan is
  now HDB › Serangoon North Vista › 4-Room** (`defaultPlan.ts`).
- The old flat "Template…" dropdown is replaced by a **cascading picker**
  (`ui/floorplan/TemplatePicker.tsx`): pick housing type → project → apartment type, which loads that
  starter plan. The tree is derived by a pure `templateCategoryTree` helper (insertion order preserved,
  unique apartment types per project — unit-tested).
- **Saving** a plan to the library now opens `ui/floorplan/SaveTemplateModal.tsx`, which prompts for
  name + housing type + project + apartment type, so user-authored apartments are categorised like the
  built-ins. The project + apartment-type fields use a new **fuzzy-search combobox** (`ui/FuzzyCombo.tsx`,
  pure `comboRows` over `catalog/fuzzySearch`): typing ranks existing values best-first and always
  appends an **"Add …"** custom row last, so a brand-new project or unit type (e.g. "2-Room + Study")
  can be committed. `updateFloorPlanMeta` accepts `category`; it round-trips through `schema.ts`
  (optional + additive) and persists with saved plans. Verified with the `template-categories` and
  `template-fuzzy-combo` scenarios.

## PARITY-BASEBOARD: per-wall baseboard / skirting params — SweetHome3DJS parity

- Each editable wall gains an optional **baseboard override** (`PlanWall.baseboard`): skirting **height**
  (m), **colour** (hex), and a **hide** toggle, matching SweetHome3D's per-wall baseboard. The custom-plan
  shell's skirting (`PlanShell`) now builds per wall so each strip reads its wall's override (defaults
  unchanged: 0.09 m, off-white); hidden walls draw no skirting. Exposed as a "Baseboard / skirting"
  group in the Plan-inspector wall section (show toggle + height + colour + reset), behind a new
  `wallBaseboard` pro flag. Round-trips through `schema.ts` (optional + additive). (Custom plans only —
  the fixed HDB template still uses `Skirting.tsx`.) Verified with the `wall-baseboard-simple` scenario
  (tall tan baseboards visible in 3D); flag gated in both Simple/Pro tests.

## PARITY-ROOMLABEL-STYLE: room-name label rotation + font size — SweetHome3DJS parity

- Room-name labels in the 2D plan editor gain optional **rotation** (`PlanRoom.labelAngle`, radians →
  SVG `rotate` about the label anchor) and a **font-size multiplier** (`PlanRoom.labelFontScale`), so a
  label can be angled to follow a slanted room/wall and emphasised or shrunk — matching SweetHome3D's
  label angle/font controls. Both are exposed as "Label angle (°)" / "Label size (×)" fields in the
  Plan inspector (beside the existing drag-to-reposition), default to unset (horizontal, normal size),
  and round-trip through `schema.ts` (optional + additive — no version bump). Verified with the
  `room-label-style` scenario (label renders rotated 30°, 1.6× larger).

## PARITY-BATCHRENDER: batch-render every saved camera view to PNG — SweetHome3DJS parity

- The saved-views section of the View menu (desktop + mobile) gains a **"Render all views"** action
  (`batchRender` pro-tier flag) that flies the camera to each saved view in turn via `applyView`
  (restoring that view's captured lighting), waits for the ~0.6 s fly + a lighting settle, then grabs a
  hi-fi frame with the existing `captureCanvasPng` (a synchronous `gl.render` + readback, so each PNG is
  fresh at the view's final pose) and downloads it. Files are named `<plan>-NN-<view>.png` (zero-padded
  so they sort in saved-view order) and staggered so the browser doesn't coalesce rapid downloads.
  Pure client-side (no backend), mirroring SweetHome3DJS's "export to PNG for each stored point of view".
  New `ui/renderAllViews.ts` (pure `viewFileName` unit-tested); flag gated in both Simple/Pro tests;
  `render-all-views-simple` scenario verifies the menu item + progress/success toasts end-to-end.

## PARITY-3DSIMPORT: import legacy .3ds models — SweetHome3DJS Max3DSLoader parity

- The model-upload converter now ingests `.3ds` (3D Studio) files via three's `TDSLoader`, completing
  SweetHome3DJS's OBJ/DAE/3DS loader set — the converter already covered GLB/glTF/OBJ/FBX/STL/PLY/DAE/
  3MF/USDZ, so this fills the last literal gap. Added to `convert/formats.ts` (`ModelFormat` +
  extension/format maps + size ceiling), a `TDSLoader` case in `convert/loadToObject.ts` (sibling
  textures resolve through the loading manager like OBJ/DAE), and the upload dialog's format hint.
  Format detection unit-tested; sibling-resolution path shared with the other converters.

## PARITY-AR: "view in your room" AR launch — Coohom parity (no backend)

- New **"View in your room (AR)"** (Tools, `viewInAr` flag): places the live design in AR with no
  backend or heavy dependency. On **iOS** it exports USDZ and opens Apple **AR Quick Look** via an
  `<a rel="ar">` (with the required child `<img>` + the click's user gesture) straight from a blob URL;
  **elsewhere** it downloads an AR-ready GLB with a toast (Android Scene Viewer needs an https-hosted
  model, which isn't possible client-only — so we hand over the file). `ui/viewInAr.ts` reuses
  `buildExportRoot` + the USDZ/GLB exporters.
- Completes the bulk of F22. Flag gating unit-tested; the GLB-fallback path browser-verified via
  `scenarios/view-in-ar-simple.json` (iOS Quick Look needs a real device).

## PARITY-VIDEO: keyframed walkthrough-video export — Coohom/SweetHome3DJS parity

- New **"Record walkthrough video"** (View → Saved views, under the `walkthrough` flag): flies the
  saved-views cinematic tour while recording, and downloads a `.webm` when the tour ends. Reuses the
  whole existing path — the saved-views tour (OrbitCamera), `RecordController`'s canvas-stream
  MediaRecorder, and its auto-stop-on-tour-end download — so the only new code is `ui/recordViewTour.ts`
  (coordinates pace + record + tour start) and a user-controllable pace: `viewTourLegSeconds` on the
  camera slice (the tour's per-leg duration is now store-driven, not a constant), set from a requested
  total duration (~5 s per view).
- Pace + tour-start verified via `scenarios/walkthrough-video-simple.json` (two views → record →
  `touring='views'` with the computed pace); recording itself rides the already-proven turntable path.

## Fix: wall reveal froze mid-fade (frameloop="demand")

- The orbit wall-reveal opacity lerp runs in `useFrame`, but the canvas renders on-demand — so when
  the camera stopped, the loop halted **before the fade finished**, leaving walls stuck part-faded
  (measured one at 0.53 instead of 0.15). Most visible on windowed walls (the un-faded window overlay
  made the stall obvious). Now `WallSegment` + the custom-plan `FadeWall`/`FadeWindow` call
  `invalidate()` while `|opacity − target| > ε`, keeping frames coming until the fade settles. Probed
  across 8 orbit angles: near walls now reach 0.15–0.19, far walls 0.91–1.00.

## Tweak: stronger orbit wall reveal + a 2D-plan compass rose

- **Wider wall-fade threshold** (per request): the orbit dollhouse reveal now fades near walls *and*
  grazing/side walls that face the camera even slightly — `smoothstep(-0.4, -0.08, d)` →
  `smoothstep(-0.2, 0.25, d)` in `WallSegment` (default flat); the custom-plan `FadeWall`/`FadeWindow`
  switched from a binary "between camera & centre" test to the same normalized-dot smoothstep ramp
  (shared `revealFactor`). A wall at `d≈0` (edge-on) now fades to ~0.42 instead of staying opaque; only
  clearly far-side walls (`d≳0.25`) stay solid.
- **2D-plan North/compass rose** (`planCompass` flag, pro; SweetHome3DJS compass parity): a small
  compass pinned to the floor-plan editor frame whose needle rotates with `orientationDeg`.

## Fix: windows + doors didn't fade with their wall during the orbit reveal

- In orbit "dollhouse" mode, near external walls fade translucent, but a wall's **window** (frame +
  grille + glass) and **door** leaf stayed fully opaque and just snapped invisible at a 0.35 threshold —
  so a windowed wall read as "not becoming translucent." Now `WindowPane` + `DoorLeaf` (default flat)
  fade *every* mesh material's opacity by the host wall's reveal opacity (`getWallOpacity`), and the
  custom-plan window glass fades via a new `FadeWindow` (mirrors `FadeWall`'s camera-facing test). Glass
  keeps its day/night tint, scaled by the wall fade. Verified in orbit on the default flat (no opaque
  grilles poking through a translucent wall).

## PARITY-FLOORTEX: per-room floor-texture transform (scale + angle) — SweetHome3DJS parity

- A room's floor texture can be **scaled (tile size) and rotated** — SweetHome3D's per-surface texture
  scale/angle. New `PlanRoom.floorTexScale`/`floorTexAngle` are applied at geometry-build time by
  `materials/worldUv.ts` `applyUvTransform` (`uv' = c + Rot(angle)·((uv − c)/scale)` about the UV
  centre) inside `worldUvPlaneGeometry`/`worldUvShapeGeometry` — **no material cloning** (the shared
  material is untouched; only the per-room floor geometry's UVs change). `PlanShell` threads the
  transform to `PlanRoomFloor`; room-inspector tile-size + angle controls under a new `floorTexture`
  flag (pro); serialized in `schema.ts` (optional, back-compat).
- UV-transform unit-tested (identity no-op; scale halves the UV extent; rotation preserves it) + flag
  gating; browser-verified via `scenarios/floor-texture-simple.json` on a custom plan.

## PARITY-FURNLIGHT (v2): per-light colour + brightness — SweetHome3DJS parity

- Any light-emitting item (a registered fixture, or one flagged "Make a light source") now exposes an
  inspector **Light colour picker + brightness slider** — SweetHome3D's per-light power/colour. Stored
  as `props.lightColor` (hex) + `props.lightIntensity` (candela); `FurnitureLights` already read
  `lightColor` and now reads `lightIntensity` too (overriding the emitter-spec default). Controls show
  whenever `isItemEmitter` is true, defaulting to the resolved emitter's colour/intensity.
- Browser-verified via `scenarios/item-light-controls.json` (a table lamp emits a custom blue,
  high-intensity glow at night).

## PARITY-RESIZE: non-uniform furniture resize (W/D/H) — SweetHome3DJS parity

- GLB / IKEA models can now be resized **independently per axis** (width / height / depth), not just
  uniformly — the SweetHome3D "Modify furniture" resize with a **Keep proportions** toggle. Per-axis
  `props.scaleX/scaleY/scaleZ` (each falling back to the uniform `scale`) drive both the render group
  scale (`gltfRender.ts` `scale3` → `GltfModel` tuple scale) and the collision footprint
  (`collision/placement.ts` `itemFootprint` scales width by X, depth by Z). Inspector `GltfBody` shows a
  uniform Scale slider when proportions are locked, else Width/Height/Depth sliders. Stored in the
  free-form `props` bag (already serialized) — fully back-compatible (uniform `scale` still works).
- Per-axis footprint unit-tested; render is a one-line per-axis group scale.

## PARITY-ELEVATION: raise furniture off the floor — SweetHome3DJS parity

- New optional `FurnitureItem.elevation` (m): raise any piece off the floor (a floating console, a
  wall shelf at a custom height) — the SweetHome3D "Modify furniture → Elevation" field. Applied to the
  render group's Y in `Furniture.tsx`, shifted into the height-aware collision span
  (`collision/placement.ts` `verticalSpan`) so a raised piece clears floor items, and the floor contact
  shadow is dropped when elevated. Inspector elevation slider (0 → ceiling height) under the existing
  `mountHeights` flag; `itemsSlice.setItemElevation` (history-coalesced); serialized in `schema.ts`
  (optional, back-compat).
- Browser-verified via `scenarios/item-elevation-simple.json` (a lamp floats off the floor in 3D);
  collision span tests pass.

## PARITY-CURVEDWALL (v3): true circular arc

- Curved walls now follow a **true circular arc** through the endpoints (with the midpoint bulged by
  `arc`) instead of the earlier quadratic-Bézier approximation — `wallArc.ts` `arcCircle` computes the
  circle (centre/radius/sweep, picking the minor vs major arc by the bulge side); `wallArcPoints`
  samples it, `wallSvgPath` emits an SVG `A` arc. Everything downstream (chord sub-segments,
  collision, openings, arc-length positioning) is unchanged since it consumes the sampled points.
- Unit-tested that all sampled points are equidistant from one centre (a real circle); existing curved
  scenarios re-verified for no regression (2D arc + window-cut still render cleanly).

## PARITY-CURVEDWALL (v2): doors + windows on curved walls

- Curved walls now host **openings** (previously a flat v1 limitation). Openings are positioned by
  **arc-length** and cut **per-chord**: `wallBoxes`/`planCollisionWalls` map each opening's arc-length
  span onto the chord sub-segments and apply the usual solid/sill/header (and open-door collision-gap)
  logic, so a door/window cuts cleanly across however many chords it spans. New `wallArc.ts` helpers —
  `pointAtArcLength` (point + tangent), `wallArcLength`, `nearestArcLength` (arc hit-test + offset).
- `doorSwingGeometry`, the 3D window glass + `PlanDoorLeaf`, the 2D opening symbols/labels, and the
  editor's door/window placement (`nearestWall`) are all arc-aware now (jambs on the arc, normal from
  the local tangent). Sloped walls still don't host openings (solid prism). Browser-verified via
  `scenarios/curved-wall-opening.json` (a window cut into a bowed wall renders cleanly in 3D); per-chord
  cut + collision-gap unit-tested.

## PARITY-SLOPECEIL: sloped (pitched) ceilings — SweetHome3DJS parity

- New `sloped` `CeilingConfig` style (under the existing `ceilingDesign` flag): a per-room pitched
  ceiling plane that falls from the ceiling height down by a chosen `rise` along the X or Z axis —
  pairs with sloping walls (PARITY-SLOPEWALL) for a shed roof. Pure `ceilingModel.ts` emits a new
  `CeilingSlope` part (clamped so the low edge never dips below the min clearance); `RoomCeiling`
  renders it as a tilted `BackSide` plane (slant-length-corrected so its horizontal projection still
  fills the room). Per-room picker gains a **Sloped** option + fall/axis controls. Serialized in
  `schema.ts` (optional, back-compat).
- Pure model unit-tested (heights, clamping); render path smoke-verified on a custom plan via
  `scenarios/sloped-ceiling-simple.json`.

## PARITY-SLOPEWALL: sloping (variable-height) walls — SweetHome3DJS parity

- A wall can now have a **sloped top**: optional `PlanWall.topHeightEnd` ramps the top edge linearly
  from `topHeight` (or ceiling) at `start` to `topHeightEnd` at `end` — a shed/mono-pitch wall. Pure
  `floorplan/slopedWall.ts` builds the prism as a non-indexed triangle soup (unshared verts →
  crisp flat normals via `computeVertexNormals`, no rounded edges/z-fighting); `wallBoxes` skips sloped
  walls and `PlanShell` renders a `SlopedWallMesh` prism instead. Floor collision is unchanged (the
  slope only affects the top). Inspector start/end top-height fields behind a new `slopingWalls` flag
  (pro); openings disabled on sloped walls (guarded in `doorSwingGeometry` + PlanShell + the editor
  tool, like curved walls). Serialized in `schema.ts` (optional, back-compat).
- Pure prism geometry + flag gating unit-tested; browser-verified via
  `scenarios/sloping-walls-simple.json` (inspector fields render, a wall is sloped, the 3D prism draws
  without artifacts on a custom plan).

## PARITY-CURVEDWALL: curved / arc walls — SweetHome3DJS parity

- Walls can now be **bowed into curves**: select a wall in the 2D editor and drag its midpoint handle.
  `PlanWall.arc` (signed perpendicular bulge, m; absent/0 = straight, fully back-compat) drives a pure
  `floorplan/wallArc.ts` that models the curve as a quadratic Bézier and samples it into chord
  sub-segments. Those feed the **existing** `wallBoxes` (3D), `planCollisionWalls` (collision) and
  topological room detection unchanged — so a curved wall reuses all the proven geometry/collision code
  (3D = a strip of full-height boxes along the chords).
- 2D editor draws each wall as an SVG `<path>` (a quadratic when curved) + a draggable bulge handle for
  the selected wall; behind a new `curvedWalls` flag (pro). Openings (doors/windows) are **not** placed
  on curved walls in v1 — the door/window tool shows an info toast, and `doorSwingGeometry` / the
  PlanShell door+window renderers guard against curved walls so a stray opening can't render at the
  wrong spot. Serialized in `schema.ts` (optional, back-compat).
- Pure arc math + curved `wallBoxes`/`planCollisionWalls` + flag gating unit-tested; browser-verified
  via `scenarios/curved-walls-simple.json` (a synthetic handle drag bows the wall, confirmed in 2D).

## PARITY-MODELINFO: catalog model size + creator/licence tooltip — SweetHome3DJS parity

- Catalog cards now carry a hover tooltip with the model's **byte size** (so a user can weigh a heavy
  model against the memory budget) + its **creator/licence** — SweetHome3DJS `FurnitureTablePanel`
  parity. Pure `furniture/modelInfo.ts` `modelInfoText`/`formatBytes` builds the string; the card adds
  it as a `title` behind a new `catalogModelInfo` flag (pro). Returns null (no tooltip) for parametric
  primitives (generated geometry, no download/licence).
- User-upload byte size is captured at upload (`persistUserGlb` → `buf.byteLength` on the def + IDB
  meta, mirroring the `price` field) and rehydrated on boot; serialized in `schema.ts` (optional,
  back-compat). Licence/creator come from the existing def fields for bundled/remote/pack/IKEA models.
- Pure helper + flag-gating unit-tested in both modes. (No browser scenario — a hover-only `title`
  tooltip isn't meaningfully screenshot-verifiable headlessly; its content + gating are unit-covered.)

## PARITY-ROOMPOLY: reshape free-form rooms by dragging vertices — SweetHome3DJS parity

- A free-form (`polyroom`) room can now be **reshaped after creation**: select it in the 2D editor and
  drag any of its vertex handles. The handle's `pointerdown` snapshots the index, `onMove` rewrites
  that point in `PlanRoom.polygon` (and keeps `origin/width/depth` in sync as the polygon's bbox, so
  rect-reading consumers stay correct), `onUp` ends the drag — mirroring the existing wall-vertex drag
  pattern (`movingPolyVertex`). No new flag (an editing affordance on the already-flagged `polyroom`
  tool). Browser-verified via `scenarios/room-polygon-edit-simple.json` (handles render, a synthetic
  vertex drag grows the room 4.0 → 6.0 m²).

## PARITY-TILT: multi-axis furniture tilt (pitch / roll) — SweetHome3DJS parity

- Furniture can now be tilted off vertical, not just yawed: optional `pitch` (about local X) and
  `roll` (about local Z) on `FurnitureItem` (radians; absent = upright, so saves stay back-compatible
  and untilted items render byte-identically). New **Tilt** pitch/roll sliders (±45°) in the inspector
  under a `tiltFurniture` flag (pro tier); structural `Staircase` and locked items are excluded
  (mirrors how SweetHome3DJS locks doors/windows/stairs from tilting).
- Clean-room adaptation of SweetHome3DJS's yaw·pitch·roll matrix composition, optimized for our stack:
  instead of multiplying three matrices per vertex we hand the renderer one intrinsic Euler tuple
  `[pitch, yaw, roll, 'YXZ']` (`furniture/tiltRotation.ts` `itemRotation`) — one allocation, the GPU
  world matrix does the rest. The flat floor contact shadow is dropped while tilted (`isTilted`).
- `itemsSlice.tiltItem` (history-coalesced like a slider drag); serialized in `schema.ts` (optional,
  back-compat). Pure helper unit-tested (reduces to pure yaw; composes to the same orientation as the
  three-axis reference quaternion) + flag-gating in both modes. Browser-verified via
  `scenarios/tilt-furniture-simple.json` (flag off Simple / on Pro, tilt applied + rendered + reset).

## Q-3DEXPORT: whole-scene 3D export (glTF/GLB + OBJ + STL + USDZ) — SweetHome3DJS ObjWriter/glTF parity

- New **Export 3D model** feature (`sceneExport3d` flag, pro tier): exports the whole furnished home —
  floor, walls, ceiling, doors, windows, furniture, lights — to a binary `.glb` (material-complete),
  geometry-only `.obj`, `.stl` (3D printing / CAD), or `.usdz` (iOS AR Quick Look — "view in your
  room"), from Tools, the Share & export modal, the ⌘K palette and the mobile sheet (all gated on both
  desktop + mobile). Reuses the existing dynamic-imported `GLTFExporter` wrapper
  (`furniture/convert/toGlb.ts`); adds matching `OBJExporter` (`export/sceneObj.ts`), `STLExporter`
  (`export/sceneStl.ts`) + `USDZExporter` (`export/sceneUsdz.ts`) wrappers.
- Editor-only helpers never leak into the export: a pure, unit-tested extract/filter core
  (`export/sceneGltf.ts` `buildExportRoot`) drops any subtree tagged `userData.noExport` (a typed
  `noExportUserData`/`markNoExport` tagger modelled on `finishDropTarget`'s pattern, applied to the
  selection outline, rotate gizmo, hover highlight, grid/alignment/clearance/lux/measurement/annotation
  overlays, comment pins, sky and placement ghost) plus a structural fallback for three helper types +
  cameras. The live scene root is reached from DOM code via `scene/SceneExportController` +
  `scene/sceneExportAccess` (mirrors `ScreenshotController`/`captureCanvas`).
- The earlier "unverifiable headless" GLTFExporter concern is closed: `scenarios/scene-export-simple.json`
  drives the real browser end-to-end — verifies the flag is off in Simple / on in Pro, the Tools-menu
  items render, and the full pipeline (live scene → `buildExportRoot` → `GLTFExporter`) produces a GLB
  and fires the success toast. Pure-core + flag-gating unit tests in both modes. Docs + REFERENCES
  (SweetHome3DJS) + `docs/research/sweethome3djs-feature-analysis.md` updated.

## PARITY-QUOTEXLSX: export the bill of quantities as an Excel .xlsx

- Tools → **"Quote → Excel (.xlsx)"** downloads the bill of quantities as a real spreadsheet (the
  deliverable contractors/clients expect), alongside the existing HTML quote. Hand-built minimal OOXML
  (`export/boqXlsx.ts`, `boqToXlsx`) — a 5-part ZIP via `fflate` (already a dep), no SheetJS; text cells
  use inline strings, money/qty are numeric cells, descriptions are XML-escaped. Mirrors `boqToCsv`'s
  columns so the exports stay in lock-step.
- The HTML quote + the Excel export now share one `assembleBoqInput()` (extracted from `openBoq`) so
  they price identically. Desktop-only (the quote is a desktop export — no mobile-parity gap).
- Pure builder unit-tested by unzipping the result (valid ZIP magic, all required parts, header + a
  numeric amount cell, `FF&amp;E` escaping); the menu entry visually verified. Docs updated.

## PARITY-WALLDIM: edit a wall's exact length + angle in the 2D inspector

- The wall inspector's read-only "Length" line is now an **editable Length (m)** field, plus a new
  **Angle (°)** field (Sweet Home 3D's wall edit-dialog precision). Typing a length resizes the wall to
  exactly that (start fixed, direction preserved); typing an angle rotates it about its start (length
  preserved) — set a wall to exactly 3.2 m or rotate it to 45° instead of nudging X/Z by hand.
- Pure geometry in `floorplan/wallOps.ts` (`endForLength`, `endForAngle`, `wallAngleDeg`; compass
  bearing +X=0 → +Z=90), unit-tested incl. zero-length guards. Visually verified the field renders and
  a length edit resizes the wall on the canvas. Docs: ARCHITECTURE + user floor-plan guide.

## PHOTO-PT-TUNE: interior-tuned path tracer (no more black glass / fireflies)

- The HQ path-traced render now applies interior-appropriate quality settings (`hqTracerConfig.ts`,
  applied in `hqRenderSession.ts` right after the `WebGLPathTracer` is built): `bounces 10`,
  `transmissiveBounces 6` (so glass renders as glass, not black/opaque), `filterGlossyFactor 0.75`
  (suppresses sun-through-glass fireflies), and `multipleImportanceSampling` (faster convergence on lit
  surfaces). The library defaults left glass dark and let bright speckles through.
- Pure config + unit test (`hqTracerConfig.test.ts`: transmissive ≤ total bounces, glossy factor in
  [0,1], MIS on); applied behind a try/catch so a library API change can't break rendering. The sample
  count (`HqRenderModal`, 64–1024) remains the time↔quality dial. Pixel improvement is GPU-pending (the
  HQ tracer needs a real GPU; SwiftShader headless won't converge). Closes PHOTO-PT-TUNE; PHOTOREALISM.md
  updated (Shipped + roadmap converted to a bullet list so it no longer needs renumbering).

## PHOTO-COLORSPACE: fix wood-albedo colour space + lock texture colour management

- Audited every procedural texture path (`materials/procedural/generators.ts`, `furnitureMaterials.ts`,
  GLB-loader + upload) under three 0.184 (texture default `NoColorSpace`). All albedo/colour maps are
  `SRGBColorSpace` and data maps (normal/rough/metal/AO) stay linear — **except the wood albedo, which
  was missing the sRGB tag** and rendered its grain with linear-instead-of-sRGB gamma (wood is one of
  the most-used finishes). Fixed (one line), matching every other albedo map in the file.
- Added `furnitureMaterialColorSpace.test.ts` as a **regression guard**: asserts wood/stone/concrete/
  velvet materials tag their `map` sRGB and their `normalMap`/`roughnessMap` linear (a minimal canvas
  2D stub lets the generators run under happy-dom, which has no real canvas). Closes the #1
  photorealism roadmap item (PHOTOREALISM.md).

## PARITY-ROOMLABEL: drag-to-reposition room-name labels on the 2D plan

- Room-name labels can now be **dragged** off their centroid in the 2D editor (Sweet Home 3D movable
  labels) — grab the name with the Select tool and move it clear of furniture or a tight room. The
  nudge is a per-room `labelOffset` (metres from the centroid) that round-trips in the save schema
  (optional + additive) and is honoured by both the editor and the printed report / drawing-set plan
  (`roomLabelPosition` = centroid + offset, shared so they agree).
- Inspector: a hint plus a **Reset label position** button (shown only once a label has been moved).
  Drags coalesce into one undo step (`updateRoom` already uses `pushHistoryCoalesced`).
- Pure `roomLabelPosition` + schema round-trip + the offset path are unit-tested; visually verified the
  label moves off-centre and the inspector reset control appears. Docs: FEATURE_PARITY (folded into
  parity; row trimmed to label rotation/font), ARCHITECTURE, user floor-plan guide.

## PARITY-PLANTEXT: on-plan text notes carry onto the report + drawing-set sheets

- The 2D editor's free-text **notes** (Text tool, PARITY-DIMTEXT) now render on the **report** and
  **drawing-set** floor-plan sheets as amber text callouts with a locator dot — so a designer's on-plan
  annotations reach the printed deliverables (Coohom/SH3D drawing text callouts). Pure SVG in
  `reportPlanSvg` (`notesSvg`), shared by the report, the drawing set and the SVG plan export; blank
  notes are skipped and text is escaped.
- Multi-storey correctness: `levelAsPlan` now scopes `plan.notes` to the storey, so each per-level
  drawing sheet shows only that storey's notes (not every storey's).
- Unit-tested (note text present + escaped + amber ink + blank skipped; per-level note scoping; note on
  the drawing-set sheet). Pure string/data change — verified via assertions like the rest of the
  report/drawing output (these open in a separate print window).

## PARITY-DRAWLAYERS: choose which sheets the construction drawing set includes

- The **drawing set** export (Tools → Drawing set) now has an **"Include sheets"** checklist
  (RoomSketcher / Chief Architect "layers"): toggle Elevations, Lighting plan, Dimensioned plan,
  Cross-section, Electrical/Plumbing plans, Finishes schedule, Demolition plan and FF&E schedule on/off
  — e.g. a clean client copy with no electrical/plumbing/demolition, or a full builder copy. The floor
  plan is always the base sheet.
- Pure + back-compat: `buildDrawingSetHtml` takes an optional `layers` map (absent/empty = the full set,
  so existing callers are unchanged) and gates each sheet group through it. Layer list + types live in a
  dependency-light `ui/drawingLayers.ts` so the heavy sheet builder stays dynamically imported (P-CHUNK).
- Store: `drawingLayers` + `setDrawingLayer` (session-only, in `uiSlice`); `openDrawingSet` passes them.
  Desktop-only picker (the drawing set is a desktop export, so no mobile-parity gap). Unit-tested
  (filtering on/off + the slice toggle) and visually verified (checklist renders under the menu entry).
- Gated under the existing `drawings`/`report` surface (a configuration of an already-flagged export,
  like the render-preset dropdown). Docs: FEATURE_PARITY (folded into parity; remaining gap trimmed to a
  text-annotation layer), ARCHITECTURE, user design-tools guide.

## PARITY-POLYLINE: free-form polyline annotations on the 2D plan

- **New Polyline tool** in the 2D Floor Plan Editor (Sweet Home 3D parity): click to drop vertices,
  press **Enter** to finish as an open path, or click the first vertex (≥3) to **close the loop**;
  Escape cancels. Each polyline supports **dashed** stroke + an **end arrowhead** (open paths) and
  is level-tagged; the inspector shows its length / perimeter + point count and toggles closed /
  dashed / arrow. Pure geometry (`floorplan/polyline.ts`: `polylineLength` / `polylineBounds` /
  `polylinePointsAttr`) is render-agnostic + unit-tested.
- **Gated** behind the new `planPolyline` flag (**pro** tier — an advanced markup tool, hidden in
  Simple mode; tested in both modes). Round-trips through the save schema (`floorPlan.polylines`,
  additive/optional — no version bump). Store actions `addPolyline` / `updatePolyline` /
  `removePolyline` (one undo step each); slice + schema round-trip tested.
- **Docs** — `FEATURE_PARITY.md` polyline row folded into "already at parity"; the stale gap tables
  were pruned of all confirmed-shipped rows (replace-with-similar, smart search, sections, plumbing,
  denoiser, render presets, AI auto-furnish, CSV/SVG export, dimension/text objects, compass,
  FOV/eye-height, auto-room, light-source, lock, plan labels, split/join/reverse, all-levels +
  duplicate-level, turntable record) with a maintenance note to keep them pruned going forward.

## Plan labels preference persists across reloads

- The 2D-plan **furniture label mode** (`planLabels`: off / name / name+price) is now saved to
  `editorPrefs` (per-device, like backdrop/units/snap) so the user's choice survives a reload instead
  of resetting to off. Invalid stored values fall back to off. Tested round-trip in `editorPrefs.test.ts`.

## PARITY-AILAYOUT (cont.): collision-aware placement for AI auto-furnish

- **`placeNonOverlapping`** (pure, in `layout/aiLayoutApply.ts`) greedily accepts only the AI-proposed
  items that don't collide with the existing layout or each other (the model's coordinates are
  approximate), reusing the shared footprint collision test (`findItemOverlaps`). The ⌘K "AI
  auto-furnish" now filters through it and reports how many overlapping pieces were skipped.
- **Tests** — keeps a clear piece + drops one stacked on it (and the far one stays); drops a candidate
  colliding with an existing item.

## PARITY-AILAYOUT: AI auto-furnish from a text brief (BYO-key)

- **New ⌘K "AI auto-furnish (BYO key)"** — describe the home and an OpenAI-compatible LLM proposes a
  furniture layout, which is validated and placed (Coohom AI auto-layout parity). Reuses the existing
  vision-feature key/endpoint config (`floorPlanAi`); no key is bundled and the call degrades gracefully
  (clear error toast) without one. `aiLayout` flag (pro, experimental, prod-safe).
- **Pure engine `ai/autoLayoutAi.ts`** — `buildLayoutRequest` (rooms + allowed catalog ids + brief →
  chat body), `parseLayoutResponse` (tolerant of fences/prose; drops items with unknown defId/room or
  non-finite coords), and `requestAutoLayout` (key/endpoint guards mirroring `recognizeFloorPlan`).
- **Pure apply `layout/aiLayoutApply.ts`** — `aiLayoutToItems` resolves each placement's room by name,
  drops unknown rooms/defs, and **clamps the position into the room interior** (inset) so the model can't
  drop a piece outside its room; emits fresh-id `FurnitureItem`s (appended under one undo step).
- **Tests** — prompt embeds rooms/ids/brief; parser validation + tolerance; no-key guard rejects without
  network; apply clamps + drops invalids + fresh ids; `aiLayout` flag hidden in Simple / present in Pro.
  Verified the ⌘K command registers + renders (Pro). Follow-up: collision-aware placement via autoArrange.

## IXT-SUITES batch 3: 2D plan-editor tools interaction-test ladder

- **New committed scenario `scripts/scenarios/plan-editor-tools-journey.json`** (21 steps) — a
  re-runnable interaction-test journey exercising this push's 2D-editor features end-to-end: text notes,
  dimension lines, furniture plan labels (Pro), level duplication, and a wall split→join round-trip.
  Each mutation is asserted with a `waitFor` store predicate; documented in the visual-verification
  playbook (worked examples + gotchas). Pays down the per-feature ladder debt for PARITY-PLANLABELS /
  LEVELOPS / WALLOPS / DIMTEXT.

## PARITY-DIMTEXT (cont.): custom dimension lines on the 2D plan

- **New "Dimension" tool** — drag between two points to drop a custom dimension line; it renders with
  end ticks + the live measured length label, is click-selectable, and deletable in the inspector
  (DIMENSION section showing the length). Snaps endpoints to the grid; level-tagged. Completes
  PARITY-DIMTEXT (text notes + dimension lines → SH3D first-class dimension + text objects).
- **Persisted** in `plan.dimensions` (new optional `PlanDimension[]` on `FloorPlan`, additive — round-
  trips through `schema.ts`; rides into the exported plan PNG). New `addDimension`/`removeDimension`
  actions + a `'dim'` `PlanSelection` variant. The dimension tool reuses the wall/scale two-point draft
  (dashed live preview).
- **Tests** — slice add/remove (clears selection) + a `schema.test.ts` round-trip preserving dimensions.
  Verified end-to-end: the Dimension tool draws a line with a measured label; the inspector shows length
  + Delete.

## PARITY-DIMTEXT: free-text notes on the 2D plan

- **New "Text" tool in the 2D Floor Plan Editor** — click to drop a free-text note (prompts for text);
  notes render on the plan with a legibility halo, are **draggable** (select tool) and **editable +
  deletable** in the inspector (a NOTE section with a text field + Delete). Level-tagged so each storey
  shows only its own; selecting one highlights it.
- **Persisted** in `plan.notes` (new optional `PlanNote[]` on `FloorPlan`, additive — round-trips through
  `schema.ts`/`FloorPlanZ`, the saved design, share links and the plan library; no version bump). New
  `addNote`/`updateNote`/`removeNote` slice actions + a `'note'` `PlanSelection` variant; drags coalesce
  into one undo step. Notes ride into the exported plan PNG (they're part of the editor SVG).
- **Tests** — slice add/edit/drag/remove (clears selection) + a `schema.test.ts` round-trip preserving
  notes (incl. a level-tagged one). Verified end-to-end: Text tool places a note, it renders + selects,
  the inspector edits/deletes it.

## PARITY-LIGHTINGTEMPLATE-TEXT (material callouts): finishes schedule in the drawing set

- **New "Finishes schedule" sheet** in the printable drawing set — a per-room table of the resolved
  floor + wall **material names** (the finish callout a builder needs; Coohom/SH3D material callouts).
  Lists every room across storeys; reads the live finishes (slice → plan-room → app default via the
  shared `resolvePlanRoom*` resolvers); neutral-plaster rooms read "Plaster (neutral)".
- **Pure `floorplan/finishSchedule.ts`** (`buildFinishSchedule(plan, finishes, nameOf)`) — `nameOf`
  injected for testability; the drawing set resolves names via `BUILTIN_MATERIALS` (falls back to the
  id for user/DLC finishes). Wired into `drawingSet.ts` (+ `finishes` param) and `openDrawingSet.ts`.
- **Tests** — `finishSchedule.test.ts` (live-over-default precedence, plan-room + app-default fallback,
  neutral wall, cross-storey ordering, empty plan) + a `drawingSet.test.ts` case asserting the sheet
  appears only when finishes are supplied.

## PARITY-FURNLIGHT: turn any item into a night light source

- **Any placed item can now emit light** (Sweet Home 3D parity) — a light-bulb toggle in the inspector
  header (for items that aren't already light fixtures, `itemAsLight` flag, pro) sets `props.lightOn`,
  and the existing `FurnitureLights` system drives a warm point light from it at night, fading in with
  the sun like the registered fixtures.
- **`lightEmitters.ts`** gains `OVERRIDE_EMITTER` (a sensible fallback spec — bulb just above the item,
  warm, moderate intensity/range), an override-aware `isItemEmitter` (registered fixture OR `lightOn`),
  and `resolveEmitterSpec` (registry spec wins; else the override; else `null`). `FurnitureLights` now
  resolves per-item via `resolveEmitterSpec` instead of indexing the registry, so overrides + fixtures
  share one path.
- **Tests** — `lightEmitters.test.ts` covers the override (`isItemEmitter` with `lightOn`,
  `resolveEmitterSpec` fallback vs. registry-wins vs. gated-off fixture → null, `OVERRIDE_EMITTER`
  values + height). Verified: the inspector toggle renders for a non-fixture (sofa) in Pro and flipping
  it makes the item an emitter.

## PARITY-PLUMBING: plumbing plan sheet in the drawing set (mirrors electrical)

- **New plumbing layer in the printable drawing set** (Coohom parity) — points (water supply, drainage,
  floor traps, soil pipes, water heaters) are auto-derived from placed fixtures (WC → soil pipe + cistern
  water point; sinks/basins/dishwashers/bathtubs → water + drainage; showers → floor trap + water;
  washing machines → water + floor trap; water heaters → a heater point), then rendered as a per-storey
  plumbing-plan sheet with symbol glyphs + a per-kind schedule. Gated by a new `plumbingPlan` flag
  (pro, prod-safe).
- **Pure `floorplan/plumbingPlan.ts` + `plumbingPlanSvg.ts`** mirror the electrical pair exactly
  (validated/clamped builder + schedule; `PlumbingPlan → SVG` with XML-escaped labels and a
  wall-bounds viewBox). Wired into `drawingSet.ts` (per-plumbed-storey sheet + unified schedule) and
  `openDrawingSet.ts` (derive + gate).
- **Tests** — `plumbingPlan.test.ts` (validation, schedule order, malformed input, optional fields),
  `plumbingPlanSvg.test.ts` (symbol per point, escaping, empty-state, malformed plan), and a
  `drawingSet.test.ts` case asserting the plumbing sheet appears only when points are supplied.

## PARITY-WALLOPS: reverse + join wall commands in the 2D editor

- **Reverse** and **Join** buttons in the wall inspector (joining Split, which already existed → SH3D
  wall split/join/reverse parity is now complete). Reverse swaps a wall's start/end; Join merges the
  selected wall with a **collinear neighbour sharing an endpoint** into one wall (the inverse of Split)
  and selects the result. Both **keep every door/window physically in place** — Reverse re-measures the
  offset from the new start; Join projects each opening's world endpoints onto the merged wall (so it
  works regardless of either wall's direction).
- **Pure `floorplan/wallOps.ts`** (`reverseWallGeometry`, `joinAdjacentWalls`) — unit-tested for
  endpoint swap + opening re-measure, collinear-neighbour merge, reversed-neighbour handling, the
  not-collinear / disjoint no-op, and external-thickness preservation. Slice actions peek first so a
  no-op join (no neighbour) doesn't push an empty undo step.
- Verified end-to-end: split a wall → Reverse → Join merges it back (wall count round-trips); buttons
  render cleanly in the inspector.

## PARITY-LEVELOPS cont.: "All levels" dimmed underlay in the 2D editor

- The 2D Floor Plan Editor gains an **"All levels"** toggle (shown only on a multi-storey plan) that
  draws the **other storeys' walls as a faint, non-interactive underlay** beneath the active level — so
  you can stack walls and line up stairs/risers between floors (Sweet Home 3D parity). Local editor view
  state (like the Dims toggle), off by default. Verified: with an empty upper level active, the ground
  floor's walls show through dimmed. Completes PARITY-LEVELOPS (duplicate-level + all-levels underlay).

## PARITY-LEVELOPS: duplicate a storey (geometry + furniture + finishes)

- **New `duplicateLevel(sourceId)` store action** — clones a storey (ground or upper) into a new storey
  above the highest level: its walls/openings/rooms (with **fresh, plan-unique ids**, each opening
  re-pointed at its cloned wall), the furniture on that storey (fresh item ids, same positions), and the
  per-room floor/wall + per-wall accent finishes (re-keyed to the new room/wall ids). Undoable; returns
  the new level id (or `null` for an unknown source). Great for maisonettes / repeated floors.
- **Pure `cloneLevelGeometry`** in `floorplan/levels.ts` (deep-clone + id remap, returns the old→new
  wall/room id maps) — unit-tested for fresh non-colliding ids, opening→wall re-pointing, and deep clone.
- **UI** — a `⧉ Duplicate` button in the 2D editor's `LevelTabs` duplicates the active storey and selects
  the copy. Verified end-to-end: duplicating the default flat creates a "Ground floor copy" storey with
  all 11 rooms + walls + doors/windows + furniture.

## RZ2: window glass sky-catch — panes read as lit glass, not flat dark rectangles

- **Daylight-ramped emissive sky-catch on window glass** — `materialRealism.glassSkyCatchIntensity`
  (pure, unit-tested) drives a soft sky-blue emissive on the default-flat windows (`apartment/Window.tsx`)
  that is bright by day and fades to dark at night, so glass reads as catching the sky on **every tier**
  (including the flat Performance default, where it otherwise looked like a flat transparent pane). Kept
  below the bloom threshold so windows glow softly without blooming.
- Verified from outside at midday: panes carry a subtle sky tint and a far pane reads as a distinctly
  bright blue sky-catch; no z-fighting with the grille/frame, no blowout.
- **Tail (tracked in TASKS):** apply to `PlanRoomShell` glass (custom plans) and wire the already-built
  `glassConfig`/`transmissionTiers` real transmission on High/Max (real-GPU verify).

## PARITY-PLANLABELS: furniture name / price labels on the 2D plan (Sweet Home 3D parity)

- **New label layer in the 2D Floor Plan Editor** — a `Labels` toolbar toggle cycles **off → name →
  name + price**; when on, every furniture footprint on the active storey shows its name (and estimated
  SGD price via the canonical `itemPrice`) centred with a surface-stroke halo for legibility over the
  coloured footprints. When off, only the selected item is labelled (unchanged), so you can always tell
  what you clicked.
- **Pure `ui/floorplan/planLabels.ts`** — unit-tested `planLabelLines` (off/name/price, drops the price
  line for a free/unpriced item) + `nextPlanLabelMode` cycle + `PLAN_LABEL_TEXT`. State lives in
  `floorPlanSlice` (`planLabels` + `setPlanLabels`/`cyclePlanLabels`, session-only).
- **`planLabels` feature flag** (pro tier, prod-safe — pure code). Hidden in Simple, present in Pro;
  unit-tested in both modes.
- Verified in the plan editor: names + prices render on all footprints (e.g. "Queen bed $900",
  "Wardrobe $1,100"), legible with the halo, coexisting with wall-dimension labels; toggle works.

## PHOTO-BEVELS (RZ3) cont.: chamfered edges on freestanding case goods

- Extended the `BeveledBox` migration from tables to the **freestanding case goods**: `Sideboard`,
  `Dresser`, `TVConsole`, `Nightstand` — carcass boxes, drawer/door fronts, plinths and tapered/box legs
  now carry the same tiny auto-clamped chamfer so their large flat faces catch a highlight.
- **Panel-built frames left sharp on purpose** — the Nightstand `open`/`drawer-shelf` cubby (separate
  top/bottom/side/back panels that butt together) keeps square edges, because chamfering butting panels
  would leave visible notches at the joins. Only single-box carcasses + freestanding fronts/legs were
  beveled. Bookshelf/Wardrobe/cabinet modules (shelf/panel-built) remain for a careful follow-up.
- Same verification posture as the table batch: structural correctness (no gaps/z-fighting/clipping)
  holds since the pattern is identical to the verified tables; edge light-catch is real-GPU-pending.

## PHOTO-BEVELS (RZ3): edge chamfers on hard furniture so it stops reading as cardboard

- **New shared `furniture/primitives/BeveledBox.tsx`** — a drei `RoundedBox` drop-in for sharp
  `<mesh><boxGeometry/></mesh>` slabs, with a furniture-appropriate **auto-clamped chamfer** (pure,
  unit-tested `safeBevelRadius`: a ~7 mm target clamped to 40% of the thinnest side so `RoundedBox`
  never self-intersects on thin panels) and `geometryDetail`-scaled smoothness. The chamfer is tiny so
  footprints/joins are visually unchanged — it just gives hard edges a highlight.
- **Migrated the table + desk family** to it: `CoffeeTable`, `DiningTable` (rect tops/legs/aprons +
  oval/round trestle feet + stretchers), `ConsoleTable`, `Desk` (top + leg plate + drawer block + legs).
  Cylindrical tops were already round; only the flat box slabs changed.
- **Tests** — `BeveledBox.test.ts` covers the radius clamp (full target when thick, 40%-clamped on thin
  panels, custom target, never negative). Verified the migrated tables render with no gaps/z-fighting/
  clipping at joins; the edge light-catch on lit tiers is real-GPU-pending (`Verify G`). Case goods +
  appliances remain (tracked in TASKS as RZ3 in-progress).

## PHOTO-EMISSIVE: HDR self-lit fixtures + screens (lamps glow + bloom at night)

- **Centralised, tuned emissive ramp** — new `scene/lighting/fixtureGlow.ts` `fixtureEmissiveIntensity(role,
  glow)` (pure + unit-tested) drives every light fixture's night glow from one place, with per-role peaks
  (`shade` ~1.33, `bulb` ~1.85, `strip` ~1.66) deliberately **above the Bloom luminance threshold (~1.05)**
  so lit fixtures bloom on High/Max (like the cove strip + fireplace already did) AND read clearly
  self-lit on the flat Performance tier (the prod default, where emissive shows but bloom doesn't). Daylight
  stays dark so fixtures switch off in the sun.
- **Fixtures migrated** to the helper: `TableLamp`, `FloorLamp` (shade + bulb), `CeilingLight`,
  `WallSconce`, `CoveLight`, `CeilingFan` — replacing scattered sub-threshold magic numbers (shades capped
  ~0.76, sconce ~0.95, so they never bloomed and read flat).
- **Screens + vanity bulbs** bumped into HDR: `FlatscreenTV` 0.85→1.2, `Monitor` 0.8→1.15 (toneMapped off
  so the value reaches the bloom buffer), `Vanity` Hollywood bulbs 0.9→1.6 when switched on.
- **Tests** — `fixtureGlow.test.ts` asserts every role peaks above the bloom threshold at full darkness,
  stays dark in daylight, ramps monotonically, and a bare bulb out-glows a diffusing shade. Verified at
  night on the flat tier (fixtures read self-lit, no blowout); **bloom amount on High/Max is real-GPU-pending**.

## PHOTO-BACKDROP: walk-mode equirectangular photo surroundings (3D backdrops removed) + uploads

- **Surroundings are now a flat equirectangular photo** set as `scene.background` (a skybox — one
  texture, **zero per-frame draw calls**, seen correctly through every window, never blocking the sun),
  shown **in walk mode only** (per product decision the orbit dollhouse stays clean — surroundings aren't
  needed there). The legacy instanced 3D City/Park/Hills/Studio estates + their helpers (`Ground`,
  `backdropOffset`, `instancedBatch`) were **removed**.
- **Procedural presets** `city/dusk/park/hills` bake a 2048×1024 sky-gradient + horizon band in
  `scene/backdropEquirect.ts`, driven by pure, unit-tested generators in `scene/backdropHorizon.ts`
  (`buildSkylineBuildings`/`buildingWindows`, `buildTreeline`, `buildHillBands`/`hillRidgeY` — all
  seam-wrapped so the equirect tiles). `none` = plain procedural sky.
- **Upload your own photo** (`custom` backdrop): `ui/scene/BackdropUpload.tsx` validates + persists the
  image to IDB (`storage/walkBackdrop.ts`, hydrated on boot as a live object URL), selects it, and shows
  it through the windows. Desktop Scene menu + mobile toolbar parity; `customBackdrop` flag.
- **`SceneBackdrop.tsx`** sets/restores `scene.background` (bakes presets synchronously, loads the custom
  photo async; disposes + invalidates on change/exit); `isPhotoBackdropActive(kind, cameraMode, hasCustom)`
  gates it and `Sky.tsx` hides its DreiSky dome when active. New `backdrops` (relabelled) +
  `customBackdrop` flags (Simple tier, prod-safe).
- **Minimap** (`ui/Minimap.tsx`): background made translucent (token `color-mix`, all themes) and the
  apartment **centred on both axes** via a new tested `planContentBounds` (true wall/room box, not the
  padded extent).
- **Tests** — `backdropHorizon.test.ts` (generator determinism, in-bounds, seam-wrap tiling, dusk
  window-density, hill seam continuity), `SceneBackdrop.test.ts` (walk-only + custom gating, picker
  options, flag tiering in **both** Simple and Pro), `walkBackdrop.test.ts` (IDB round-trip, file
  validation, clear, hydrate), `minimapGeometry.test.ts` (+`planContentBounds`). Visual-verified via
  `scripts/scenarios/backdrop-walk-simple.json` (presets through windows, orbit clean, custom photo,
  translucent + centred minimap).

## Replace with similar (PARITY-REPLACE): one-click swap to a nearest-size catalog sibling

- **New pure core** `furniture/similarItems.ts` — `similarItems(defId, catalog, limit?)` ranks
  same-`FurnitureCategory` catalog defs by **nearest real footprint** (orientation-independent
  W×D from `defaultFootprint`), tie-broken by name then id; excludes the def itself and returns
  `[]` for an unknown def or a category with no siblings. Works across parametric, GLB and IKEA
  defs. Thoroughly unit-tested.
- **New store action** `itemsSlice.replaceItemDef(id, newDefId)` swaps a placed item's `defId`
  while keeping its **id / position / rotation / levelId / label / locked / groupId**, resetting
  def-specific `props` to the new def's defaults (`defaultParamProps` for parametric, else `{}`).
  One undo step; no-ops for a missing item/def or a same-def call.
- **UI** — the inspector's "Swap with similar" control is now **"Replace with similar…"** and
  opens a ranked picker (nearest-size first, fit badges) that commits through `replaceItemDef`;
  the right-click context-menu entry and a new ⌘K command `replace-similar` (single selection)
  open the same picker. The shared `SwapModal` mount gives desktop + mobile inspector parity.
- **Feature flag** — new `replaceSimilar` flag (tier `pro`, prod default on, prod-safe pure code).
  Gates the inspector control, the context-menu row and the ⌘K command (`COMMAND_FLAGS`), so the
  feature is hidden in Simple mode. Tested in both Simple and Pro.

## Cross-section drawing: furniture silhouettes beyond the cut + report integration (PARITY-SECTION)

- **Section now shows furniture beyond the cut in elevation.** Extended the pure `floorplan/section.ts`
  core with caller-supplied silhouette inputs (`SectionItemInput` = footprint corners + height) so a
  `Section` reports the pieces standing in the cut's room band, projected as elevation silhouettes
  (along-axis extent × height), tallest-first. Built via the new `ui/elevation/sectionFigure.ts`
  `sectionSilhouettes` (reusing the OBB footprint + `itemHeight` helpers) so the core stays free of the
  GLB/three-tied footprint code. `floorplan/sectionSvg.ts` draws them behind the cut walls with a
  palette `item` colour (falls back to `wall`).
- **Wired into both deliverables.** The "Section A–A" drawing-set sheet now passes ground-floor
  furniture silhouettes; `report.ts` gains a matching "Section A–A" block (between Wall elevations and
  Lighting). Both ride the existing `drawings` flag (pro) — no new flag. Degrades gracefully: a bare
  shell renders the cut walls/floor/ceiling with no silhouettes.
- Tests: silhouette projection/skip/sort/over-height/malformed-guard in `section.test.ts`, the items
  group in `sectionSvg.test.ts`, and furnished-vs-bare section assertions in `drawingSet.test.ts` +
  `report.test.ts`. Verified the rendered Section A–A sheet (cut walls, floor/ceiling, room bands, door/
  window gaps, dining-chair silhouettes) reads correctly with no clipping.

## Walk-mode observer camera controls — field-of-view + eye-height (PARITY-WALKCAM)

- **Adjustable first-person camera** (Sweet Home 3D parity). In walk mode you can now set the
  observer's **field of view** (50–100°, default 70°) and **eye height** (1.2–1.9 m, default 1.6 m)
  via two sliders in the walk HUD (`ui/walk/WalkCameraControls.tsx`, top-right, token-styled,
  desktop + touch). FOV widening/narrowing applies live to the camera; eye-height raises/lowers the
  viewpoint smoothly without re-spawning the walker. Eye-height respects the metric/imperial unit
  setting.
- Settings live on the camera slice (`walkFov`/`walkEyeHeight` + setters), are persisted per-device
  in `editorPrefs`, and clamp through pure tested helpers (`scene/cameras/walkCameraSettings.ts`).
- Gated by the new `walkCameraControls` feature flag (pro tier, prod-safe default on). Unit tests
  cover the clamp helpers and flag gating in both Simple and Pro modes.

## Export 2D plan to SVG (Sweet Home 3D parity)

- New `ui/openPlanSvg.ts` `downloadPlanSvg()` saves the active floor plan as a
  vector `.svg` — the sibling of the existing DXF export. It **reuses** the shared
  `reportPlanSvg` renderer (furnished footprints via the report's OBB-corner +
  category-tint helpers, plus pinned dimension annotations) and the pure
  `ui/planSvgExport.ts` `buildPlanSvgDocument()` wrapper, which turns the inline
  embed fragment into a standalone document (XML declaration + injected SVG
  namespace). The wrapper is unit-tested (namespace injection once, XML prolog,
  empty-input no-op).
- Wired into the Tools menu (next to Export DXF), the mobile Tools sheet, and a
  ⌘K command, all gated behind the existing `dxfExport` flag (its CAD-export
  sibling). A no-extent plan surfaces a toast instead of an empty file.

## Export furniture list to CSV (Sweet Home 3D parity)

- New pure `ui/furnitureCsv.ts` `buildFurnitureCsv(rows)` turns the existing FF&E
  schedule (`ffe/ffeSchedule.ts`) into a spreadsheet CSV — header + one row per
  (room, item, variant) with Room, Item, Source, SKU, Width/Depth/Height (mm),
  Qty, Unit price, Total, plus a grand-total footer. RFC-4180 escaping (quotes
  fields with comma/quote/CR/LF, doubles interior quotes); reuses the schedule's
  pricing/dims (no recompute). Dimensions emit as whole millimetres, prices as
  whole SGD. Thoroughly unit-tested (escaping, totals, units, IKEA SKU rows,
  empty design).
- `ui/openFurnitureCsv.ts` dynamic-imports the builder + merged catalog, builds the
  schedule from the live store, and triggers a UTF-8-BOM `.csv` download (Blob +
  anchor, like `designFile.ts`). Wired into the desktop **File** menu, the mobile
  File sheet, and a ⌘K command, all gated behind the existing `shopExport` flag
  (simple tier, prod-safe pure code).

## Security: validate report hero image URL (defence-in-depth)

- `ui/report.ts` now only embeds the hero render when it is a `data:image/` URL
  (and HTML-escapes it), mirroring `moodboard.renderHero`. The sole current
  caller passes `canvas.toDataURL(...)`, so this changes nothing today, but a
  future caller can no longer slip a `javascript:`/foreign URL or HTML-breaking
  string into the `<img src>`. Unit-tested for both the accept and reject paths.

## Security: reject image decompression bombs before decode (texture upload)

- `materials/convert/decodeImage.ts` now enforces a `MAX_DECODE_DIM` (4096²)
  pixel-dimension cap **before** allocating RGBA, closing a self-DoS where a
  few-KB upload declaring e.g. 30000×30000 would allocate gigabytes and OOM-crash
  the tab. Previously the only bound was the 16 MB file-size cap and a dimension
  check that ran *after* a full decode.
- New pure `readImageHeaderDims()` reads PNG IHDR / JPEG SOF dimensions from the
  header so native bitmaps are rejected before `createImageBitmap` decodes; the
  exotic paths (TGA/TIFF/EXR/HDR) assert dimensions before their heavy pixel
  decode/tonemap step. The cap matches the storage validator, so no previously
  accepted upload is lost. Covered by unit tests for both helpers.

## Auto-arrange: remove dead dining-chair distribution variable

- Removed a dead `half` local in `layout/autoArrange.ts` (a no-op ternary whose
  branches were identical, suppressed with `void half`) — a leftover from an
  earlier refactor of the dining-chair distribution. `nNorth` already drives the
  north/south split; behaviour is unchanged (25 auto-arrange tests still pass).

## Scene time/lighting overhaul: real location/date sun, slider-only time, independent lights

- **Time of day is now a single free-scrub slider** (no preset chips/checkpoints) shared by the
  desktop Scene menu + mobile sheet (`ui/scene/TimeOfDaySlider`). The sun position — and hence the
  light level — follows the real sun for the user's location (lat/lon) + today's date at the
  selected local hour, on a smooth gradient, so sunrise/midday/sunset land at the place's real
  times (e.g. a Singapore evening stays lit until ~19:10 rather than going dark at 18:00).
- **System time fix.** The "System time" control always shows the real wall-clock time now, not
  whatever manual time is currently selected.
- **Lights is a single off/on/auto toggle**, independent of the time of day (lights can be on in
  daytime). Removed the "lighting moods" (Daylight / Golden hour / …) bundle — the
  `lightingScenes` module + `lightingMoods` feature flag + ⌘K mood commands are gone.

## Help slimmed to a launcher; sign-in moved to the main menu; admin password → "admin"

- **Help modal** no longer embeds how-to tips (the user guide covers them). It's now a launcher:
  **Replay the guided tour** + **Open the user guide ↗**, plus a desktop-only **Keyboard
  shortcuts** button that opens the shortcut reference in its own modal (mobile has no hardware
  keyboard, so it's omitted there). New `Keyboard` icon.
- **Sign in / account** moved out of Help into the main menu: a persistent footer at the bottom of
  the mobile hamburger sheet, and the bottom of the desktop Appearance popover.
- **Admin dev-gate password** dev fallback is now `admin` (was `sofa-admin`).
- Mobile menu rail is icon-only (dropped the per-row chevron).

## Mobile menu → master-detail; tour spotlight genuinely click-through (desktop + mobile)

Two related fixes for the mobile menu + product tour:

**Spotlight wasn't clickable (the "can't click the Edit menu" bug).** The tour overlay root
(`.tour-root`, `position:fixed; inset:0`) had the default `pointer-events:auto`, so it swallowed
taps/clicks landing in the spotlight hole — the highlighted control never received them. Diagnosed
via `elementFromPoint` at the target centre returning `.tour-root`. Fixed by making the root
`pointer-events:none` and re-enabling it on the blocker panes and the card, so the hole truly
passes input to the real control. This was a latent bug on **desktop** too (action steps were never
exercised by a real click there); verified fixed on both with new real-click scenarios.

**Mobile menu redesigned to master-detail.** The accordion sheet got unwieldy with many items per
section. Replaced it with an icon-only left rail (each section shows its icon + a right chevron)
that opens the selected section's items in a right-hand detail pane under a sticky title
(`MobileToolbar.tsx`). The tour's mobile reveal now *selects* the target's section in the rail
(checked via `aria-current`) instead of expanding an accordion.

**Verification:** `scripts/scenarios/first-run-mobile-tour.json` now advances the action steps with
**real hit-tested clicks** on the spotlighted rail/detail controls; new
`scripts/scenarios/first-run-desktop-tour.json` does the same on desktop (Edit menu → Edit a room →
Catalog). Both pass end-to-end; docs updated.

## Tour: reorder so Scene precedes entering a room (spotlights on desktop + mobile)

The "Set the mood" (Scene) step ran after "Edit a room" entered the room editor — but the Scene
menu is `!roomEditorActive` on **both** desktop (`Toolbar.tsx`) and the mobile sheet, so the step
had no live target and fell back to a centred card on every platform. Moved Scene to right after
View (both are overview/environment controls), before the room-editor steps, and renumbered the
step titles. Scene now spotlights its real control everywhere. `first-run-mobile-tour.json` walks
the new order; `first-run.json`'s step-3 screenshot renamed to match.

## Fix: interactive guided tour on mobile (was falling through to the location prompt)

On a mobile viewport, picking "Take the guided tour" in the onboarding carousel set
`tourOpen = true`, but `ProductTour` immediately called `end()` (it was desktop-only and
bailed on mobile). That flipped `tourOpen` back to `false`, so `LocationPrompt` — suppressed
only while `onboardingOpen || tourOpen` — popped up instead of the tour.

The tour now runs **interactively on mobile**, mirroring desktop: it opens the hamburger sheet,
expands the right accordion section, and spotlights the real control for the user to tap.

**What changed:**
- `src/ui/tour/ProductTour.tsx` — removed the mobile self-`end()` effect and `isMobile`
  early-return. Before measuring each step on mobile, `revealMobile()` opens the sheet (the
  tour overlay's `--z-modal` sits above the sheet's `--z-overlay`, and the spotlight hole stays
  click-through) and expands the step's `mobile.section`; `findTarget()` then resolves the
  mobile selector. Steps with no mobile-reachable control centre as before. On unmount the tour
  closes any sheet it opened, so it doesn't linger behind the location prompt.
- `src/ui/tour/tourSteps.ts` — added `TourStepMobile` (`{ target, section? }`) and a `mobile`
  entry per step (View / Edit / Edit-a-room / Catalog / Appearance map to sheet headers + rows;
  Scene/customise/finishes centre).
- `src/ui/toolbar/MobileToolbar.tsx` — added `data-tour-section` to accordion headers and an
  optional `tourId` (`data-tour`) on rows; tagged the "Edit a room" and "Catalog" rows.

**Tests/verification:**
- `src/ui/tour/ProductTour.test.tsx` — new: tour renders + stays open on both desktop and a
  mobile (`matchMedia`) viewport (regression guard for the self-terminate bug).
- `scripts/scenarios/first-run-mobile-tour.json` — new IXT-SUITES rung: full interactive mobile
  journey (onboarding → guided tour → spotlight View → Edit → Edit a room → Catalog → centred
  steps → Appearance → Done → location prompt last). Verified with screenshots.

## [C274] Standalone KTX2/DDS texture upload decode

Extends the material-upload pipeline (`materials/convert/`) to decode `.ktx2` and `.dds` texture files
that users upload via `UploadMaterialDialog`. Previously only PNG/JPG/WebP/BMP/TGA/TIFF/EXR/HDR were decoded.

**What shipped (KTX2 + DDS, both enabled):**
- `src/materials/convert/decodeGpuTexture.ts` — new module with `decodeKtx2()` and `decodeDds()`:
  - **KTX2 uncompressed** (`VK_FORMAT_R8G8B8A8_SRGB/UNORM`, `R8G8_UNORM`, `R8_UNORM`): pure-JS decode via `ktx-parse` — no WebGL needed.
  - **KTX2 Basis-compressed** (`VK_FORMAT_UNDEFINED`, BasisLZ/UASTC): `KTX2Loader` + shared Basis transcoder (same singleton the GLB path uses, at `/basis/`) + `readRenderTargetPixels` GPU readback via a minimal offscreen `WebGLRenderer`.
  - **DDS uncompressed** (`RGBAFormat`): pure-JS via `DDSLoader.parse()` — no WebGL.
  - **DDS compressed** (DXT1/3/5, BC6H, BC7, ETC1): GPU readback via offscreen `WebGLRenderer`.
  - Graceful error on missing `OffscreenCanvas`/WebGL: friendly error toast, never a crash.
  - sRGB/linear not modified — raw RGBA8 bytes are passed to the re-encode pipeline; the runtime material loader assigns the correct `colorSpace`.
- `src/materials/convert/decodeImage.ts` — `.ktx2` and `.dds` added to `EXTRA_TEXTURE_EXTENSIONS` and routed to `decodeGpuTexture.ts`.
- `src/materials/upload/validate.ts` — `GPU_TEXTURE_EXTS` set (`{'.ktx2', '.dds'}`) skips `createImageBitmap` (which can't decode GPU formats); size cap still applies; dimension check deferred to post-normalize.
- `src/ui/upload/UploadMaterialDialog.tsx` — `accept` attribute and format-list text updated to include KTX2/DDS.
- `public/basis/` — Basis transcoder (`basis_transcoder.js` + `.wasm`) served at `/basis/` for `KTX2Loader`.
- `public/test-fixtures/solid-teal-4x4.ktx2` — CC0 fixture (generated from a solid-colour PNG by `ktx-parse`, no external tooling).
- `vite.config.ts` — `resolve.dedupe` extended with `react`, `react-dom`, `react/jsx-runtime`, `scheduler` to prevent duplicate-React errors in worktree environments with nested `node_modules`.
- `src/state/storage/bootstrap.ts` — `window.__persistUserMaterial` dev helper exposed (alongside `__store`, `__arrangeRoom`, etc.) for the scenario harness.
- `scripts/scenarios/texture-upload-simple.json` + `scripts/scenarios/evals/upload-ktx2-material.mjs` — interaction-test ladder: fetch `solid-teal-4x4.ktx2` from `/test-fixtures/`, decode via pipeline, assert in `userMaterials` store, apply to `livingDining` floor, assert `finishes.floor`.

**Tests:** `src/materials/convert/decodeGpuTexture.test.ts` (12 tests) — extension gate, pure-JS KTX2 decode (uncompressed RGBA8 fixture), pure-JS DDS decode (uncompressed ARGB fixture), error paths (corrupt input, empty buffer, OffscreenCanvas unavailable), Basis-compressed mock path routing. All 61 materials tests pass. TypeScript clean.

**Fixtures:** `solid-teal-4x4.ktx2` (4×4 teal, `VK_FORMAT_R8G8B8A8_SRGB`, no supercompression, 292 bytes) and `solid-orange-4x4.dds` (4×4 orange, uncompressed ARGB, 192 bytes) — both generated programmatically, CC0/no-license.

## [C275 / R-CURTAIN/L1] Window glass tint + curtain light attenuation

Two coupled window-light effects, both simple-tier, default on, zero per-frame cost at rest:

**Glass tint** — `glassTint: string` added to `AppearanceSlice`; `setGlassTint(hex)` stores a
hex colour applied as a component-wise RGB multiply to the directional sun light each frame via
`getWindowGlassTint()` in `Lighting.tsx`. Empty / `'#ffffff'` = neutral (no effect). Gated by
`windowGlassTint` feature flag.

**Curtain attenuation** — `CurtainLightController` subscribes to the Zustand store and
recomputes `sceneAttenuationFactor()` whenever `items` or `glassTint` changes; the result is
written to the `attenuation` module-level signal and applied to `sunRef.current.intensity`
each frame. Matching criteria: item `defId` = `'curtains'` or `'roller-blind'`; centre within
0.5 m of the wall; rotation within ±90° of the wall angle; 1-D projection overlaps the window
extent. `style='open'` (tied back) → no obstruction (factor 1.0). `style='drawn'` + opaque →
OPAQUE_MIN 0.05 per fully covered window; sheer (`material='sheer'`) → SHEER_MIN 0.40. Scene
factor = average over all windows. Gated by `curtainLightEffect` feature flag.

**Architecture:** three new files (`windowLightModifiers.ts` pure functions,
`windowLightSignal.ts` module-level signals, `CurtainLightController.tsx` store subscriber) +
five modified (`Lighting.tsx`, `featureFlags.ts`, `appearanceSlice.ts`, `Scene.tsx`). Demand
frameloop: `RenderPump` already calls `invalidate()` on every store change — no explicit call
needed in the controller.

**Tests:** `windowLightModifiers.test.ts` — 34 unit tests covering isCurtainItem / isCurtainOpen
/ hexToRgb01 / glassTintRgb / curtainWindowOverlap (null cases: non-curtain, wall distance,
angle, no overlap; + overlap fraction + sheer detection) / windowAttenuationFactor (open, drawn,
sheer, partial) / sceneAttenuationFactor (no windows, single window, multi-window average) /
computeWindowModifiers; feature flag tier assertions in both Simple and Pro modes. Full suite:
301 files, 2251 tests, all pass. `tsc` clean. Biome clean (3 pre-existing warnings unrelated).

**Scenario:** `scripts/scenarios/window-light-simple.json` — 26 steps on port 5216: baseline
sunlit room (no curtains), add 3 drawn curtains over bedroom windows (5 total windows → scene
factor ≈0.43), screenshot visibly dimmer, apply amber tint `#e8b860`, screenshot tinted,
open all curtains, clear tint, final screenshot.

## [C272] Interaction-test ladders for pro-tier analytical features (drawings, versions, history, pano tour, render compare)

Seven scenario files added to `scripts/scenarios/`, covering 5 pro-tier features:

- **`drawings-lighting-simple.json`** — `drawings` flag gate (Simple/Pro); opens ElevationPanel; Lighting tab; lux overlay toggle + store assertions; time scrub to hour 19.
- **`versions-simple.json`** — `versions` flag gate (Simple/Pro); opens VersionsPanel; mounts and closes.
- **`versions-journey.json`** — seeds a schema-valid saved version into `localStorage`; opens panel; mutates design (adds dining table); clicks Compare → asserts `.ver-diff`; clicks Restore → asserts item count round-trips to 1 sofa.
- **`history-simple.json`** — `history` flag gate (Simple/Pro); clears items + history; places sofa then armchair; pushes history twice; opens HistoryPanel; `jumpHistory(0)` → asserts 1 sofa (first push snapshot); jumps to latest.
- **`pano-tour-simple.json`** — `panoTour` flag gate (Simple/Pro); seeds 2 stops via `window.__store.setState`; opens tour modal; asserts stop tab buttons; opens 2D plan editor (`setFloorPlanEditing(true)`); asserts `circle` count ≥ 2 in `.plan-screen`.
- **`pano-tour-journey.json`** — multi-step tour flow (plan editor markers, modal stop switching) plus a **mobile viewport leg** at 390×844 asserting stop tabs visible on small screens.
- **`render-compare-simple.json`** — `renderCompare` flag gate (Simple/Pro); opens modal via `setRenderCompareOpen(true)`; asserts preset `<select>` elements visible.

All 7 scenarios pass (37/37, 30/30, 19/19, 27/27, 31/31, 30/30, 14/14 steps respectively).

**Docs:** `docs/visual-verification-playbook.md` — added worked-examples section for all 7 scenarios with step counts, key gotchas (`jumpHistory(0)` semantics, `addPanoTourStopHere` headless limitation, versions schema seed requirements).

## [C273 / GE3c tail] Per-part texture on combined-mesh (CSG) parts

CSG-combined mesh parts now preserve each source part's finish on its own face group.
Previously combining two parts with different textures produced a union that took only
the first part's material; now every source part's colour/finish/PBR is kept on its triangles.

**Approach:** `three-bvh-csg`'s `Evaluator` is set to `useGroups = true` with per-brush
proxy `MeshStandardMaterial` instances (colour-keyed so parts sharing the same
finish+colour naturally merge their groups). The result geometry carries one draw group
per distinct source material; the brush's `result.material` array is mapped back to
`GroupMaterialData` snapshots (serialisable POJOs) stored in `geometry.groups` /
`geometry.materials` on the `MeshGeometryData` spec. Back-compat: old specs without
these fields fall back to the single-material path unchanged.

**Serialisation round-trip:** `GroupMaterialData[]` is plain JSON — finish id, colour hex,
roughness, metalness, glow, opacity. `partGeometry` restores geometry groups from
`data.groups` on rebuild so Three.js applies the per-group material array. `partMaterials`
(new export, supersedes `partMaterial` for mesh kind) returns `MeshStandardMaterial[]`
built from the group configs; the live preview `PartMesh` and `buildEditedObject` both
use it. The GLTFExporter handles the multi-material mesh correctly (roughness/metalness
maps merged per group — confirmed by exporter warning in the headless run).

**UVs:** `boxProjectUvs` runs on the whole geometry (vertex-by-normal, group-agnostic) so
each group's finish tiles at physical metre scale — no per-group split needed.

**Inspector behaviour:** combined (`mesh` kind) parts with `geometry.materials` hide the
colour/finish/PBR slider controls — those surface-look fields are frozen per-group at
combine time. Position and rotation remain editable. The inspector note says "re-add the
parts and combine again to change finishes" — no face-picker UI needed.

**Tests:** +18 new unit tests (6 `meshPartFromGeometry` group-path cases, 7 `combineParts`
group/UV/serialise cases, 2 `partMaterials` array-return cases, 3 deduplication/round-trip).
Scenario `glb-csg-textures-simple.json` drives the full flow headless: open designer →
add box 1 (Oak finish) → add box 2 (Walnut finish) → Union → confirm "Combined" shape →
save to catalog → reopen designer. All 32 steps pass; GLTFExporter confirms multi-material
export via merged-texture warning; combined mesh renders in the preview.

## [C269 / IXT-SUITES batch 1] Interaction-test ladders for the Simple-mode core design loop

Eight scenario JSON files covering the five Simple-mode features — catalog/furnish,
finishes, budget/shopping, share, and view modes (orbit ↔ walk ↔ 2D plan):

| File | Rungs | Steps | Shots | Mobile leg |
|---|---|---|---|---|
| `catalog-furnish-simple.json` | simple | 28 | 5 | — |
| `catalog-furnish-journey.json` | journey | 34 | 5 | 390×844 |
| `finishes-simple.json` | simple | 25 | 5 | — |
| `finishes-journey.json` | journey | 31 | 4 | 390×844 |
| `budget-simple.json` | simple | 23 | 4 | — |
| `share-simple.json` | simple | 18 | 3 | — |
| `view-modes-simple.json` | simple | 24 | 6 | — |
| `view-modes-journey.json` | journey | 39 | 6 | 390×844 |

All scenarios: `waitFor` over blind `wait`, `store` steps for all store actions,
`setManualHour(13)` for reviewable frames, real `FurnitureItem` shapes
(`position:[x,z]`, `rotation`), in-room livingDining coordinates, `SHOT_URL`
env-overrideable URL. All 8 passed against the dev server at port 5220.

Bugs/oddities caught during authoring and verified correct in app:
- Builtin finish IDs have no `mat:` prefix: `floor-wood-oak`, `wall-paint-white`.
- `shopTab` valid values: `'list'` | `'saved'` (no `'rooms'` value).
- CatalogDrawer only mounts when `open && cameraMode==='orbit' && roomEditor.active`.
- `BudgetHud` only mounts when `budgetTarget` is non-null.
- `localStorage.setItem('hdb_onboarded','1')` in `dismiss-overlays` prevents the
  onboarding carousel from mounting after the eval step returns (store call alone is
  insufficient because the boot decision runs before React mounts).
- Multiple `eval` steps sharing page scope must use IIFEs to avoid `const` redeclarations.

Docs: playbook `worked-examples` section updated with all 8 scenarios, key gotchas,
and a run-all command block. `TASKS.md` IXT-SUITES entry updated.

## [C271 / PERF9 tail] OffscreenCanvas worker generation for procedural textures

Moves procedural PBR texture generation off the main thread to eliminate jank at boot
and finish-switch time. Three-file addition, two modified, all existing APIs and material
IDs unchanged.

**New files:**
- `src/materials/procedural/procedural.worker.ts` — Vite `?worker`-pattern module
  worker; receives `{id, pattern, swatch, size}`, generates fields via the pure
  `generateProceduralRaw()` function, renders each PBR map to an `OffscreenCanvas`,
  and returns three `ImageBitmap`s (zero-copy transferables) to the main thread.
- `src/materials/procedural/runProceduralWorker.ts` — main-thread façade with lazy
  worker init, request coalescing (same `{id,pattern,swatch,size}` key → one message),
  graceful degradation (`offscreenAvailable` feature-detect; `workerBroken` flag;
  `null` return → caller falls back), and test escape-hatches
  (`_setOffscreenAvailableForTest`, `_setWorkerFactoryForTest`, `_resetProceduralWorker`).
- `src/materials/proceduralSwapSignal.ts` — lightweight module-level signal
  (mirrors `finishDragSignal.ts` pattern) that fires when a worker result hot-swaps a
  material's textures, so the demand-mode canvas renders one extra frame.
- `src/materials/procedural/proceduralWorker.test.ts` — 12 unit tests covering:
  seed determinism (`generateProceduralRaw` is pixel-identical for same inputs, different
  for different ids), worker-key stability, fallback when unavailable, request coalescing
  (two concurrent same-key calls → one worker message), and ok:false fallback.

**Modified files:**
- `src/materials/procedural/generators.ts` — adds `generateProceduralRaw()` (pure,
  DOM-free pixel-array generation, deterministic given `{id,pattern,swatch,size}`) and
  `rawToTexture()` (main-thread helper to materialise worker-returned buffers).
- `src/materials/cache.ts` — `buildMaterial()` for procedural kinds now: (1) immediately
  builds a sync texture via the existing path (no first-paint delay), (2) fires
  `scheduleWorkerUpgrade()` off-thread, (3) on worker resolution hot-swaps the material's
  maps in-place, disposes the old GPU textures, and calls `notifyProceduralSwap()` to kick
  a demand-mode render frame. Fallback: if OffscreenCanvas is unavailable or the worker
  errors, the sync textures stay in place — identical behaviour to today.
- `src/scene/RenderPump.tsx` — subscribes to `subscribeProceduralSwap` so worker texture
  upgrades trigger `markDirty()` (a settle-tail render) without routing through the store.

**Sync-fallback + swap strategy:** `buildMaterial` immediately calls the existing
`generateProcedural()` (sync, DOM) for a fast first paint, caches the material, then
`scheduleWorkerUpgrade()` sends a worker request with the same key. The worker encodes
pixels into `ImageBitmap`s (OffscreenCanvas, zero-copy transfer). On resolution, the main
thread draws each bitmap to a `<canvas>`, wraps it in a `CanvasTexture`, and swaps the
material's `map`/`normalMap`/`roughnessMap` in-place, setting `needsUpdate`. The
`proceduralSwapSignal` then fires to kick a render frame.

**Determinism guarantee:** `generateProceduralRaw` uses `hashSeed(id+':'+pattern)` →
`mulberry32` PRNG, all seeded deterministically. Same inputs → pixel-identical output
across calls and threads.

**Scenario:** `scripts/scenarios/procedural-worker-simple.json` — boots to daylight,
screenshots the default flat (wood floors), switches living-room floor to hexagon tile,
waits for worker swap, screenshots result.

**Caveats:** OffscreenCanvas is unavailable in Node.js / headless Vitest (all unit tests
exercise the sync fallback path, which is correct and sufficient). Worker pixel-identity
with sync output is guaranteed by the shared `generateProceduralRaw` function (same
seeded RNG, same math). The upgrade is best-effort and invisible if the worker fails —
the sync texture stays.

## [C270] Parametric kitchen-run type — toe-kick, per-bay doors/drawers, worktop slab, optional uppers

**New parametric type `kitchen-run`** in the custom-size furniture dialog (PF2). Ships behind the `kitchenCabinets` feature flag (tier: `pro`, default on). Tab "Kitchen run" appears in the dialog when in Pro mode.

**Geometry (`buildParts.ts`):** `buildKitchenRun(spec)` builds:
- Toe-kick plinth: 0.1 m tall, recessed 0.05 m from front, full run width.
- Carcass sides (floor → worktop underside), back panel, top + bottom panels.
- Per-bay dividers (spec-driven count, not auto-sized by span).
- Per-bay fronts: hinged door leaves (each ≤ 0.6 m) with handle; stacked drawer fronts with horizontal pulls; or open with mid-height shelf.
- Worktop slab at spec.height: 0.04 m thick, 0.02 m front overhang, 0.01 m side overhang.
- Optional uppers (`hasUppers: true`): 0.35 m deep × 0.72 m tall wall-mounted carcass above the worktop (0.18 m gap), with full-width door leaves per bay.

**Dimension envelope:** width 0.6–3.6 m (default 1.8 m), worktop height 0.85–0.92 m (default 0.87 m), depth 0.55–0.65 m (default 0.6 m), bays 1–6 (default 3).

**spec.ts:** Added `bays` and `hasUppers` to all `ParametricSpec` entries in `DEFAULT_SPECS` (required by TypeScript); `clampSpec` clamps `bays` to 1–6 and validates `hasUppers`. `specLabel` returns `"Custom kitchen run N cm wide"` for kitchen-run. All existing non-kitchen defaults carry `bays: 1, hasUppers: false`.

**saveParametric.ts:** `TYPE_CATEGORY` maps `kitchen-run → 'kitchen'`.

**ParametricControls.tsx:** `KitchenControls` component for the kitchen-run tab: width/height/depth sliders, bays count slider (1–6), uppers toggle with description, per-bay style picker (Open / Door / Drawer) using the existing `BayStylePicker`, and finish swatches.

**Tests:** 29 new unit tests in `src/furniture/parametric/__tests__/kitchen-run.test.ts` covering dimension clamping, toe-kick geometry (y=0, height=0.1), worktop top face at spec.height, no floating members, per-bay door/drawer/open output, uppers part-count increase, price monotonicity (bays and width), and price reasonableness.

**Scenario:** `scripts/scenarios/parametric-kitchen-simple.json` — simple ladder: pro mode, open dialog, switch to Kitchen tab, toggle bay to drawers, screenshot.

## [C264 / PR6-tail] Default common furniture finishes to local CC0 `mat:` materials

**Categories updated (17 catalog entries):** `bed-single`, `bed-double`, `bed-queen`, `bed-king`,
`bunk-bed`, `crib`, `dining-table-4`, `desk`, `coffee-table`, `console-table`, `wardrobe-3door`,
`dresser`, `shoe-cabinet`, `bookshelf`, `sideboard`, `nightstand`, `floor-mirror` — all had
`default: 'wood'` on their primary wood finish field (`finish` or `frameFinish`); changed to
`default: 'mat:floor-wood-oak'`.

**Decision: NEW items only.** `mat:floor-wood-oak` applies to newly placed items (the catalog
schema default). Existing saved designs carry their stored props (`'wood'` or any explicit value)
untouched — `defaultParamProps` is only called on first placement, and the store merges on top,
so the user's explicit choice always wins. No migration of existing stored data.

**Per-furniture UV-scale / repeat support** (`furnitureMaterials.ts`): `getSurfaceMaterial` now
honours the `repeat` parameter for `mat:` finishes (previously ignored). Added
`getFurnitureMatWithRepeat` (private): clones the base material, individually clones+reassigns
`map`/`normalMap`/`roughnessMap` with the new repeat, caches per `(id, repeat)`. Repeat ≈ 1 returns
the base unchanged (no clone). Same pattern as `getWoodMaterial(color, repeat)` for procedural wood.

**Pre-warm on scene mount** (`FurnitureMaterialLoader.tsx`): `CATALOG_WOOD_DEFAULTS` (the five wood
variants: oak, walnut, teak, ash, ebony) are seeded into the `ids` set before items are scanned,
so the five most common finishes are built synchronously on the first render — no first-frame pop.
All are procedural (offline-safe); no remote fetch needed.

**Tests:** 6 new unit tests in `furnitureMaterialFinish.test.ts`: user override wins, key categories
default to `mat:floor-wood-oak`, fallback to procedural when mat: not in cache, repeat=1 identity,
repeat≠1 distinct clone (cached, stable), UV-scale clone preserves map repeat. Updated
`builtinCatalog.test.ts` enum-default validation to exempt `mat:` defaults.

**Scenario:** `scripts/scenarios/furniture-finishes-simple.json` — simple ladder verifying default
finish, sofa-level angle, bookshelf closeup, performance-tier regression.

## [C265 / T2] Crown-molding revisit + kitchen/bath template polish

**Crown molding (T2):** Adds decorative crown-molding strips at every wall–ceiling junction
in both the curated default flat (`WallSegment.tsx`) and user-authored plan shells
(`PlanShell.tsx`). The `crownMolding` feature flag (`tier: 'simple'`, default `true`) was
wired in the previous partial attempt; this commit completes the geometry with the same
abutment-extended span lengths used by skirting boards, so mitre corners close flush at
every wall junction with no gaps or overlaps. `polygonOffset` prevents z-fighting against
the ceiling plane. Applies to rectangular and polygon rooms; correct in the room editor and
multi-storey plans (PlanShell uses the same wall-box abutment logic as Baseboard).

**Kitchen template polish:** Counter back face moved flush to north wall (z≈6.85 = wall
inner + `CLEARANCE.wallGap`); fridge SW corner flush to west + south walls; stove + range
hood flush to south wall; washing machine in service yard flush to west + south walls;
microwave repositioned above the counter near the west end (away from the stove).

**Bathroom template polish:** Shower in Bath 1 flush to west + north walls; WC in both baths
repositioned flush to east + south walls with correct wall-gap clearances; basin repositioned
flush to east wall; all fixtures verified within room bounds.

**Tests:** `src/apartment/crownMolding.test.ts` — 18 tests covering the `atCeiling` predicate,
`wallEndAbutmentThickness` corner-extension regression, and template fixture bounds for kitchen,
bathrooms, and service yard (all pass).

**Scenario:** `scripts/scenarios/crown-molding-simple.json` — simple interaction-test ladder
(crown flag gated, renders, toggleable on/off, daytime lighting).

## [C268 / FIRST-RUN] Onboarding carousel fires first; product tour is opt-in from carousel choice

**Behaviour change:** on a clean profile the onboarding carousel now fires FIRST (welcome →
overview → "Where would you like to start?"). The product tour is no longer auto-started — it
only fires when the user explicitly selects **"Take the guided tour"** from the carousel's choice
step. Choosing any other option (Smart Start, Browse the catalog, Move-in demo, Start empty, or
"Enter sandbox") or clicking Skip closes the carousel without ever starting the tour.

**Location-prompt ordering:** the "Where are you?" sun-position modal is now suppressed while
EITHER the onboarding carousel OR the product tour is open (`onboardingOpen || tourOpen`), so
overlays never stack. It surfaces after both are fully dismissed.

**Migration behaviour:**
- `hdb_onboarded='1'` (already onboarded) + `hdb_tour_done` unset → **no re-onboarding**.
  The boot decision reads only `hdb_onboarded`; if set, nothing fires.
- `hdb_tour_done='1'` (old tour-first path) + `hdb_onboarded` unset → **carousel fires once**.
  These users saw the old auto-starting tour but never completed the new carousel, so the
  carousel shows once. After they dismiss it `markOnboarded()` sets `hdb_onboarded='1'` and
  future visits are silent.

**Code:** boot-decision logic extracted to pure `src/ui/bootDecision.ts` (injectable for unit
tests). `App.tsx` calls `resolveBootDecision()` instead of the old `hasSeenTour()`/`startTour()`
chain. `LocationPrompt.tsx` adds `onboardingOpen` to its suppression guard.

**Scenarios:** `scripts/scenarios/first-run.json` rewritten for the new flow (carousel first →
choose tour → tour steps → location prompt → final scene; port 5212). New scenario
`scripts/scenarios/first-run-no-tour.json` (carousel → "Enter sandbox" → assert tour === false →
location prompt → final scene).

**Tests:** `src/ui/bootDecision.test.ts` (7 tests: clean profile, returning user, tour not
auto-fired, and both migration edge cases). `src/ui/LocationPrompt.test.tsx` gains 2 new tests
(no-render while onboarding open; no-render while tour open).

**Docs:** `docs/visual-verification-playbook.md` — corrected the "tour comes BEFORE the onboarding
carousel" note to describe the new flow. `docs/user/getting-started.md` — updated first-run
description to reflect carousel-first + optional guided tour.

## [C267 / INTERACTION-HARNESS] Upgrade shot.mjs to a full interaction harness with scenario mode

`scripts/shot.mjs` gains a scenario mode (`--scenario <file.json|file.mjs> [--out-dir <dir>]`)
that drives complex multi-step user journeys headlessly in a single browser session.

**New files:** `scripts/lib/interact.mjs` (step engine), `scripts/lib/validate.mjs` (expanded
scenario schema, pure/node-testable), `scripts/lib/validate.test.mjs` (47 unit tests covering
all step types in both keyed and typed formats), `scripts/scenarios/first-run.json` (32-step
first-run scenario producing 9 named screenshots).

**Step types shipped:** `eval` (inline string or `{file}` ref), `waitFor` (css/text/store/
storeExists conditions with per-step timeout + failure message), `click` (by CSS selector or
visible text — finds deepest clickable match), `screenshot` (named, auto-numbered `NN-name.png`),
`store` (call any store action with args), `viewport` (resize for responsive testing), and all
legacy canvas actions reused as-is: `drag`/`rdrag`/`wheel`/`key`/`type`/`select`/`wait`.

**Structured step logging:** `STEP n/N <name> … OK (1.2s)` per step; failures dump
`failed-<name>.png` + recent console lines + exit non-zero.

**Timing fix documented:** legacy mode fires eval and waits a fixed offset — any async work
inside misses the screenshot. Scenario mode is strictly sequential; use `waitFor` to sync.
Both the gotcha and the fix are documented in the playbook.

**Backward-compatible:** legacy CLI (`node scripts/shot.mjs <out.png> [waitMs] …`) is unchanged.
Legacy mode seeds `sofa.helpHint.dismissed` by default (old behaviour preserved); scenario mode
starts with empty localStorage so first-run flows trigger naturally.

**first-run scenario results:** all 32 steps passed in ~150 s. 9 screenshots captured and
visually reviewed: product tour step 1 (welcome card + furnished flat), tour step 2 (View button
spotlighted, "Look around"), tour step 3 (Edit button spotlighted, "Enter room"), location prompt
dialog, post-tour furnished scene, and all 3 onboarding carousel screens. UI correct at every step
— no clipping, no missing buttons, correct dimmer/spotlight effect, correct choices on step 3.

**Key discovery:** on a clean profile the tour fires FIRST (not the onboarding carousel). The
carousel only appears if `hdb_tour_done='1'` but `hdb_onboarded` not set. Documented in the
playbook under "First-run flow: tour comes BEFORE the onboarding carousel".

**Docs:** `docs/visual-verification-playbook.md` rewritten — scenario mode is now the recommended
approach at the top; legacy mode documented separately; full step-type reference table; worked
example; timing pitfall section. `CLAUDE.md` and `docs/ARCHITECTURE.md` updated with new commands.
+47 unit tests (all passing).

## [C266 / P-720 tail] Presentation-mode tour inclusion
Optional "Include 360° tour" toggle in the presentation setup (View menu, saved-views section)
appends the 360° tour stops as panorama slides after the saved views when both `presentation`
and `panoTour` flags are on (both pro-tier). New `composeTourSlides()` in `slideLogic.ts` builds
the unified `Slide[]` deck (`ViewSlide | TourStopSlide`) — pure, no React, fully tested. Tour-stop
slides use the identical `capturePanorama({eye})` + `panoImageIdb` cache path as `PanoTourModal`
(IDB cache hit = instant; miss = live capture + IDB persist), and set `stopInitialYaw` on arrival
so the viewer faces the room centre. Auto-advance pauses on tour-stop slides (same as existing
`SavedView.pano` slides). Stops on hidden/other storeys are skipped via the `currentLevelId`
filter in `composeTourSlides`. The toggle is disabled (with hint) when the tour is empty. New
`PresentationSetup` component renders the toggle + "Present…" start button inline in
`SavedViewsSection` when both flags are on; falls back to the plain "Present…" menu item when
only the `presentation` flag is on. State: `presentationIncludeTour` / `setPresentationIncludeTour`
in `uiSlice`. Feature flag: uses existing `presentation` (pro) + `panoTour` (pro) — no new flag
needed. 36 unit tests in two new/extended test files cover slide-deck composition, storey filtering,
empty-tour no-op, auto-advance pause on tour slides, and both Simple and Pro mode flag gating.

## [C263 / F4] Render preset A/B compare modal
Adds an industry-standard before/after comparison view for render presets (F4 tail), gated by a
new `renderCompare` pro-tier feature flag. The modal (`src/ui/RenderCompareModal.tsx`) renders
both presets sequentially using the existing HQ path-traced pipeline (`hqRenderSession.ts` via
`capturePreset`), temporarily applying each preset's four levers (time/tone/exposure/lights) and
restoring the store state after capture. A Lightroom-style draggable vertical divider with a
circular drag handle clips the A image over the full B image using CSS `clipPath` — the two halves
are pixel-aligned at the divider with no offset or stretch at any position. Labels float in the
corners (A · left, B · right). Controls: two preset selectors, a swap button (⇄ exchanges images +
sample counts), a quality selector (32–256 samples), and a Render/Re-render button. In-progress
states show per-side sample progress. Touch drag is fully supported (`onTouchStart`/`onTouchMove`)
for mobile parity. Pure state logic lives in `src/ui/renderCompare/compareState.ts` (no React) —
`clampDivider`, `swapAB`, `setPresetA/B`, `isValidPresetId`. The `renderCompare` flag (pro, default
on, prod-safe) is wired into `FEATURE_FLAGS`, `COMMAND_FLAGS` (`render-compare` → ⌘K), File menu,
and MobileToolbar accordion. 10 unit tests cover all pure-state functions + flag visibility in both
Simple and Pro modes. HDRI coupling (F3) remains deferred.

## [C261 / P-720 tail] 360° tour follow-ups: IDB image cache, room-centre yaw, plan stop placement, share-link embedding
Four P-720 follow-ups shipped in one focused commit. **(1) IDB image cache**: new pure
`ui/panorama/panoImageIdb.ts` (`sofa-pano-cache` database, separate from the asset store to
avoid version-bump conflicts) stores captured panorama Blobs keyed `<stopId>:<designKey>` where
`designKey` is a djb2 hash of `{items, finishes, floorPlan, doors, userFurniture}` — revisiting
a stop skips the expensive re-render unless the room or furnishings changed; stale entries are
evicted on access; LRU cap of 30 entries; `evictPanoStop` called on stop removal / drag-end to
force a fresh capture from the new position. `PanoTourModal` now tries the IDB cache before
capturing live; Re-capture evicts then recaptures. **(2) Per-stop room-centre yaw**: new pure
`stopInitialYaw(stop, rooms)` in `panoTour.ts` uses the shape-aware `roomLabelPoint` centroid
(matching the plan-editor labels) and `yawToward` to compute the viewer yaw that faces the room
centre on arrival; the tour modal uses it for direct stop selections (hotspot jumps still face
the travel direction). **(3) Plan-based stop placement**: `FloorPlanEditor` now renders numbered
tour stop markers (ringed dot + number) on the 2D plan SVG when the `panoTour` flag is on; stops
are draggable in the select tool via a new `movingStop` state that mirrors the existing
`movingItem`/`movingVertex` pattern — drag-end evicts the IDB cache for the moved stop; upper-
storey stops render greyed and non-draggable (ground-level only for simplicity). **(4) Share-link
embedding**: `panoTourStops` added as an optional additive field in `schema.ts`
(`RawSerializedStateZ` + `serialize` + `applySerialized`) — old links without the field decode
to `[]` (backward-compatible); the design-share and plan-share codecs carry stops automatically
since both call `serialize`; images are NOT embedded (receivers capture live). +19 new unit tests:
`computeDesignKey` mutation coverage, IDB miss/hit/evict/clear, `stopInitialYaw` round-trip
(including outside-room and at-centre fallbacks), share-link round-trip with/without stops, old-
link compat, `applySerialized` restoration. Verified headless: tour-stop markers visible on the
2D plan as numbered circles with the stop labels offset; opening the tour with a stop places the
viewer facing the room centre; mobile 390×844 plan + tour modal both render correctly.

## [C262 / Q31 tail] Drop-target highlight + custom-plan overview wall-drop cue
Two polish items deferred from C251. (1) **Transient drop-target highlight**: while
a finish swatch is dragged over the 3D canvas a visible ring/tint overlay appears,
implemented as a pure DOM `<div>` (`FinishDragOverlay`) absolutely positioned over
the canvas, styled with `box-shadow: inset 0 0 0 3px var(--accent)` +
`background: var(--accent-soft)` — no hardcoded colours, works in light + dark +
all 5 themes. The overlay renders nothing when inactive, so frameloop-demand
frames are unaffected (zero GPU cost at rest). State is managed by a new
`finishDragSignal.ts` module-level singleton (`setFinishDragActive` /
`subscribeFinishDrag`) wired to `useSyncExternalStore` in the overlay component —
deliberately outside the Zustand store to avoid triggering `RenderPump`'s
`subscribe(markDirty)` on every dragover tick. `FinishDropSurface` drives the
signal: `dragenter` → active, `dragleave`/`drop` → inactive; a `window dragend`
listener also clears it (catches the "drag released outside the browser window"
case where the canvas never fires `dragleave`). (2) **Custom-plan overview wall
drop cue**: `PlanShell`'s `FadeWall` meshes carry no `finishTarget` userData (they
are unassociated boxes at the overview level), so drops on them previously silently
no-oped. New `hasUntaggedHits()` helper in `finishDropTarget.ts` distinguishes an
empty-sky miss (zero hits) from geometry-hit-but-unclassifiable (the overview-wall
case). When a drop lands on untagged geometry in the custom-plan overview (not in
the room editor), a 3 s info toast guides the user: "Open a room to finish its
walls". +18 tests (signal state machine: enter/over/leave/drop/dragend/cancel all
clear; idempotency; subscribe/unsubscribe; hasUntaggedHits: tagged/untagged/invisible
hits, ancestor-walk). `tsc` + full suite green.

## [C260 / LP6] Lux overlay — time-of-day scrub, auto-play, and per-fixture exclusion
Extends the static 3D lux floor heatmap (C256/LP5) with live time-of-day scrubbing and
per-fixture contribution isolation. `LuxOverlay.tsx` now reads `luxExcludedIds` from the
store and filters out excluded fixtures before recomputing grids; the memo already reacts
to `manualHour` via `useSunPosition` / `lightingFromAltitude`, so scrubbing the time-of-day
slider in either the Scene menu or the new inline slider updates the heatmap live (debounced
implicitly by the quantised fixture/daylight levels — sub-percent changes don't churn the memo).
A `luxPlaying` rAF loop auto-advances `manualHour` at 1 hr/s for a full-day preview. New
store state (`luxExcludedIds: string[]`, `luxPlaying: boolean`) + actions in `featuresSlice.ts`
— clearing on overlay-off; per-fixture toggle (`toggleLuxExcluded`), bulk set, play toggle.
`ElevationPanel.tsx` gains two new sections in the Lighting tab: (1) a compact time slider (reusing
`setManualHour` / `effectiveHour`) with a ▶/⏹ play button showing the current clock; (2) a
scrollable per-fixture checkbox list labelled "Fixture contributions — uncheck to isolate" with
struck-through dimmed text for excluded items — responsive on both desktop and mobile
bottom-sheet. Gated behind the same pro-tier `drawings` flag. 16 new unit tests: store slice
actions, per-fixture exclusion changes lux computation, time-input sensitivity, flag/mode gating.
Verified headless: 09:00 (warm orange/red pools, high fixture contribution), 13:00 (similar but
with higher daylight component), 20:00 night (deep blue/teal pools, no daylight), and with
3 fixtures excluded (reduced pool area); no z-fighting, no loading-screen artifacts on any shot.
Mobile panel (390 px) shows fixture list and slider cleanly. `drawings` flag off in Simple,
on in Pro.

## [C259 / PERF9] Per-pattern procedural texture size registry — GPU memory reduction
Added `PATTERN_SIZE_CAP` registry in `procedural/generators.ts` that declares the maximum useful
resolution for each of the 17 procedural patterns, and `effectivePatternSize(pattern)` which clamps
the global `BASE_SIZE` (256 on Performance, 512 on Medium+) to that cap. Smooth/noise-based patterns
(`carpet`, `concrete`, `marble`, `terrazzo`, `batten`, `fluted`, `plaster`) cap at 256² regardless
of tier — saving 75 % of their GPU texture memory on Medium/High/Maximum with no visible quality
difference at typical room-viewing distances. High-frequency geometric patterns (`wood`, `tile`,
`hexagon`, `checker`, `parquet`, `herringbone`, `subway`, `brick`, `grasscloth`, `stripe`) cap at
512² so their grain lines, grout, and mortar joints stay sharp on Medium+ tiers but still drop to
256 on Performance. Cache keys in `cache.ts` now use `effectivePatternSize` so tier changes correctly
invalidate only the patterns that actually resized; `getBuiltMaterial` probes both `@512` and `@256`
suffixes for backward-compatible furniture `mat:<id>` lookups. 5 new unit tests verify the registry
and clamping logic across both tiers. OffscreenCanvas worker generation remains deferred (PERF9 tail).
Visually verified at Performance/256 tier: smooth textures (plaster, carpet, concrete) look identical
to 512²; high-frequency textures (wood grain, tile grout) correctly receive 256 on Performance where
quality tradeoff is acceptable. `QualityController` already set `BASE_SIZE` per tier (unchanged).

## [C258 / PF2] Parametric furniture v2 — drawers, per-compartment config, desk type
Extends the PF1 generator with three new capabilities. (1) **Drawers**: a new
`CompartmentStyle = 'open' | 'door' | 'drawer'` drives `addDrawerFronts()` which emits stacked
`drawer-front` + `drawer-handle` parts at ~0.18 m per drawer, inset within the bay opening —
drawer handles are brushed metal via the furnitureMaterials cache. `price.ts` adds a DRAWER_ADDER
per front (drawer box + slides + handle). (2) **Per-compartment configuration**: each bay of a
wardrobe or sideboard can independently be set to open / door / drawer; `bayStyle(spec, b)` resolves
from the per-bay `compartments[]` override then falls back to the global `doors` toggle. A compact
`BayStylePicker` segmented control (Open / Door / Drawer per bay) appears in the dialog below the
Doors toggle for wardrobe and sideboard types. Changing the global toggle clears per-bay overrides
for a clean reset. (3) **Desk**: new `desk` type with real-metre HDB-sized limits (60–200 cm wide,
68–82 cm tall, 50–85 cm deep); two leg options — four-leg (square corner legs, floor-anchored) and
pedestal (right-side carcass with stacked drawers + two left legs). Desk saves to the `tables`
category. `saveParametric.ts` maps each type to its catalog category via `TYPE_CATEGORY`. 54 unit
tests across spec/buildParts/price/dialog — all passing; `tsc` and `biome` clean. Headless visual
verification: bookshelf 3D preview shows floor-anchored shelves; desk preview shows four-leg worktop
with correct proportions (120 × 75 cm default); mobile layout stacks preview above controls with
full-width dialog. No floating parts, z-fighting, or clipping observed.

## [C257 / PF1] Parametric furniture — dimension-driven shelving/wardrobe/sideboard generator
First milestone of the procedural-furniture subsystem (IKEA PAX/BILLY · Tylko configurator
parity). New pure `furniture/parametric/` module: a typed spec `{type, w, h, d, options}` is
clamped to sensible per-type min/max and emitted as a structurally-sound part list — sides reach
the floor, shelves span between sides with auto-spacing, a centre divider is auto-added past
~1.2 m so shelves never span unsupported, back panel inset, wardrobe doors split into ≤0.6 m
leaves, sideboard legs-vs-plinth — all built from real three materials (tintable wood +
`mat:<id>`). A responsive `ParametricDialog` offers type tabs (bookshelf / wardrobe / sideboard),
dimension sliders + option toggles, a live R3F preview, a material-volume price estimate, and an
"Add to room" action; each generate saves a NEW user catalog def (identical specs de-dupe by
content hash), so placement/collision/budget treat it like any other item and it survives
save/reload (additive schema field carries the def-level price). New `parametricFurniture` flag
(tier pro, default on, prod-safe pure code), gated in the catalog drawer, ⌘K (`COMMAND_FLAGS`),
and the mobile toolbar; both-modes tests. Verified headless: the bookshelf preview shows
evenly-spaced shelves with sides on the floor and the wardrobe splits into two handled doors —
both structurally clean, no floating parts or z-fighting. Deferred: drawers, per-compartment
config, more types.

## [C256 / LP5] 3D lux-coverage heatmap overlay on the floor
The lighting plan's illuminance can now be read in the actual scene, not just as 2D numbers.
New pure `lighting2d/luxGrid.ts` (per-room sample grids from fixtures + daylight) +
`luxColor.ts` (a perceptual blue→green→yellow→red ramp with residential lux breakpoints) feed
`scene/LuxOverlay.tsx`, which renders one translucent `DataTexture` plane per visible level's
rooms 5 mm above the floor (`depthWrite` off, transparent — no z-fighting) at the storey's
elevation. Toggled from the Drawings panel's Lighting tab (`luxOverlayOn`) with a colour→lux
legend, and gated by the same pro-tier `drawings` flag as the rest of the lighting plan
(LP1–LP4). Recompute rides the existing render-time memos on items/plan/level/daylight —
nothing per-frame; textures dispose on toggle-off. Edge cases handled: rooms with no samples
never emit NaN, polygon rooms supported. Verified headless at midday: per-room heatmaps hug the
floor with a smooth gradient that varies sensibly by room (brighter near windows), no shimmer.
+both-modes flag test. Deferred follow-up only.

## [C255 / GE3c] GLB designer per-part texture pick
Parts in the GLB designer can now take a real material/texture, not just a solid colour. The
part spec gains an optional `finish` (`mat:<id>`); `partMaterial` resolves it through the
existing furniture-material cache and returns a CLONE of the shared textured material (textures
stay shared, per-part glow/opacity still apply on top, roughness/metalness sliders hide because
the finish's own maps win). CSG-combined results get box-projected metre-scale UVs
(`boxProjectUvs`) so a tiling finish reads at the right physical scale instead of smearing one
texel. The ~900-line dialog's part inspector is extracted into a new `PartInspector.tsx` reusing
the inspector's finish dropdown + `QuickFinishes` swatch row (Oak/Walnut/Teak/Ash/Ebony/Marble).
The finish persists through the save-asset round trip (re-resolved at render, like solid colours).
Rides the existing GLB-designer flag — no new flag. Verified headless: clicking "Oak" sets the
part finish to `mat:floor-wood-oak` and the box renders with tiling wood grain (not flat/black),
no artifacts. Follow-up C273 completes the feature: per-part texture on combined-mesh parts.

## [C252 / P-720] Linked 720° panorama tour — multi-pano capture with room hotspots
Coohom "720° tour" parity. A tour is an ordered list of stops `{id, label, position:[x,z],
levelId?}` in the new `panoTourSlice`, persisted per-device to localStorage like saved camera
views (images are NOT stored — each stop is captured live + session-cached when viewed, so the
tour always reflects the current design, same model as the C237 presentation slides). Hotspots
are derived, never authored: pure `ui/panorama/panoTour.ts` computes yaw (`atan2(−dx,−dz)`,
matching the viewer's −Z-forward convention) + pitch toward every other stop, culling
coincident (guards the degenerate atan2), distant (>14 m) and cross-storey stops, with
room-derived labels + duplicate numbering and screen projection for the overlay pills. Capture
reuses the C217 pipeline with one additive extension — `capturePanorama({eye})` honours an
explicit eye at the stop position + level elevation. The viewer overlays clickable/tappable
hotspot pills (fade → fresh capture → arrive) plus a numbered stop strip; `PanoramaViewer`
gained generic optional `initialLook`/`onLook` props (stays chrome/store-free). New `panoTour`
flag (tier pro, default on, consistent with `panorama` — asserted by a test), gated in the File
menu (desktop AND mobile), two ⌘K commands, and an "Add to tour" button in the panorama modal.
+31 tests (pure math, slice, both-modes flag). Verified headless with real SwiftShader
captures: kitchen stop shows a geometrically-correct "Living / Dining" hotspot dead ahead,
clicking it lands in the living-room pano; mobile 390×844 modal clamps + strip scrolls.
Deferred: share-link/presentation embedding, plan-based stop placement UI, IDB image
persistence, per-stop initial yaw.

## [C251 / Q31 part 2] Drag finish swatches onto the 3D canvas — raycast drop
Dragging a swatch from the finish picker and releasing it over the 3D view now applies the
finish to whatever is under the cursor — room floor, wall, or furniture item — completing the
Q31 drag-to-apply program (part 1 shipped the pure payload/`resolveFinishDrop` core + Layers-row
drops). New pure classifier `scene/finishDropTarget.ts` walks the raycast hit list, skipping
invisible hits (the camera-facing wall reveal toggles `visible`, which three's Raycaster does
NOT skip) and untagged meshes (grid/gizmos/sky), and classifies via `userData` tags
(`itemId` on `Furniture` roots; `finishTarget {kind, roomId}` on floor meshes, wall interior
faces, and room-editor shells). `scene/FinishDropSurface.tsx` does the thin DOM wiring in BOTH
Canvases (main + room editor): native `dragover`/`drop` on the GL canvas (R3F's pointer system
never sees HTML5 drag events), `dropEffect='copy'` feedback, manual `Raycaster.setFromCamera`,
and it only claims events carrying the finish MIME — catalog-card placement and upload drops
untouched. Commits flow through the new shared `state/finishDropApply.ts` (now also used by the
Layers rows): exactly one undo step per drop, floor/wall recents, success toast — and it fixes a
latent part-1 bug by normalising raw catalog ids to `mat:<id>` on item drops (previously fell
back to generic wood). Part 1 had shipped ungated, so this adds the `finishDnd` flag
(`tier: 'simple'`, default on) gating picker dragstart + both drop surfaces. Touch keeps the
existing tap-to-apply flow (HTML5 DnD doesn't exist there). +18 tests (classifier, apply path,
both-modes flag). Visually verified headless: floor → checker, wall → navy, table → ebony in
one session with `past` 1→4, foreign-payload and sky drops no-ops; docs updated. Deferred:
custom-plan overview wall drops no-op (overview walls are unassociated fade boxes); transient
target highlight skipped under frameloop=demand.

## [C254 / PERF-FOLLOWUPS] History cap amortisation + frame-scoped overlap memo
Two backlog micro-optimisations. `historySlice.appendCapped` no longer slice-and-spreads the
whole past stack on every push once the 50-entry cap is hit: the stack grows into a 16-entry
headroom band and is trimmed back to the cap with ONE amortised slice, so steady-state pushes
stay a single spread copy; undo depth is always ≥ the cap and undo/redo/jump semantics are
unchanged (new tests pin the trim point, dropped-oldest order, and a full undo drain across a
trim). `collision/findItemOverlaps` gains a frame-scoped single-slot memo: same-task calls with
unchanged `items`/`defs` identities (several panels can scan in one render pass) return the
cached array allocation-free; it invalidates on identity change and self-expires on microtask
flush because OBBs read the mutable GLB-footprint cache. +6 tests; behaviour-preserving (full
suite green).

## [C253 / X-SHOP tail] SG retailer expansion in the dev price sidecar — Courts/HipVan/Castlery
The dev-only live-pricing sidecar (`scripts/price-server.mjs`) now has three retailer adapters
alongside IKEA SG: Courts (Magento GraphQL search), HipVan (Algolia-style hits), Castlery
(JSON-LD products in the search page HTML), each following the existing convention — pure
exported parser + URL builder, candidates re-ranked by fuzzy name match
(`scoreNameMatch`/`pickBestMatch` with the retailer's own top hit as fallback), all upstream
fetches timeboxed at 8 s, shape drift degrading to a 404 `no match` and network errors to a 502
`{error, retailer}` (never a crash). `/price` responses carry `retailerLabel`. Client:
`livePrice.ts` adopts the retailer list from `/health` (never hardcoded), fetches all retailers
per item in parallel with per-retailer failures dropping out, and returns offers
**cheapest-first**; the Budget panel prices each line/total by the cheapest offer and renders a
wrappable cheapest-first row of retailer buy links. Gating unchanged: the same devOnly pro-tier
`livePrices` flag, with a new test asserting it stays off in prod (Simple AND Pro). Verified
desktop 1600×1000 + mobile 390×844 with a stubbed sidecar: offers render cheapest-first, a 404
retailer drops silently, 4-offer rows wrap cleanly. The retailer URL/response shapes are
best-effort offline reconstructions — a real-network verification pass is tracked in TODO.md.
+15 tests.

