# src/ui — UI / overlay rules

Area rules for DOM overlays. Component map in `docs/ARCHITECTURE.md`.

- **No hardcoded colour.** Use the token class vocabulary from `src/styles/`
  (`.panel`/`.btn`/`.toolbar`/`.menu-item`/`.seg`/`.swatch`/`.cmdk`/`.ctx-menu`/`.toast`/…),
  never Tailwind colour utilities or literal hex. Every surface must read correctly in
  light + dark across all 5 themes.
- **Form controls are custom, never native `<select>`/`<input type=color>`.** Use the shared
  `ui/controls/Select.tsx` (themed dropdown — `.input`-styled trigger → anchored `Popover` on
  desktop / `Modal` sheet on mobile, listbox keyboard + ARIA) and `ui/controls/ColorPicker.tsx`
  (swatch trigger → SV pad + hue bar + hex + `ThemeColorRows` + recents; HSV math in the pure
  `ui/controls/colorConvert.ts`, hex via `materials/colorHarmony` `normalizeHex`). Native phone
  dropdown/colour UIs are off-brand and small native fields trigger the iOS focus-zoom. Text inputs
  keep their normal small size on mobile — the iOS focus-zoom is suppressed by
  `controls/iosZoomGuard.ts`, which sets a **permanent, iOS-only** viewport
  `maximum-scale=1` once at boot (iOS ≥10 still allows user pinch-zoom because Safari
  ignores `maximum-scale` for pinch; other platforms are left untouched). Installed
  once in `main.tsx`; do **not** re-add a blanket `font-size:16px` rule, and do **not**
  revert to toggling the viewport on `focusin`/`focusout` — rewriting the meta after
  focus caused a zoom-in-then-out flicker on every tap.
- **A control with 3+ states is a `controls/Segmented` (or a `Select` where space is tight),
  never a click-to-cycle button** (TB-8): a cycle hides the state space. `Segmented` renders
  the `.seg` token classes (`accent`/`fit` variants) with radiogroup semantics + a roving
  tabindex (arrow keys move AND select); inside the mobile sheet, `.m-detail .seg` rules make
  segments full-width with ≥44px touch targets. Consumers: the desktop toolbar Lights cluster
  (`.tool-seg` = icon + group) and the mobile Scene Lights / Edit Grid-size rows; the desktop
  grid size is a compact `Select` (`.tool-select`) since 6 segments would crowd the island.
  Two-state toggles stay plain toggle buttons. Grid labels come from
  `toolbar/gridSizeLabel.ts:formatGridSize`.
- **Buttons use the `<Button>` primitive** (`controls/Button.tsx`): pass
  `variant`/`size`/`block`/`icon`/`loading` instead of hand-writing `.btn-*`
  class strings. The `.btn-*` classes stay the source of truth — `Button` only
  composes them. New buttons use it; the raw classes remain valid for legacy
  call sites being migrated.
- **Docked side sidebars (desktop).** The scene, toolbar and canvas HUDs live inside `.stage-area`
  (in `App.tsx`); the inspector/finish panels carry a `dock-panel` class and the **catalog** a
  `dock-panel-left` class (it's a sibling of `.stage-area`, not a child, so the rail can shrink the
  canvas). On desktop (≥641px), `.app-shell:has(.dock-panel)` opens a `--right-rail` and
  `:has(.dock-panel-left)` a `--left-rail`, so `.stage-area` shrinks from that side (canvas reflows,
  the `left:50%` toolbar re-centres over the remaining space) and the panel docks full-height. Pure
  CSS keyed on the panel's *presence* (panels mount only when open) — no JS open-state. A new panel
  that should reflow the canvas just needs the right `dock-panel`/`dock-panel-left` class; mobile
  (≤640px) keeps bottom-sheets (the dock rules are gated to ≥641px). (The 2D floor-plan editor's
  `.plan-screen` also reads `--left-rail` (screens.css) so the docked catalog shrinks the plan
  viewport the same way — the SVG's `ResizeObserver`-backed `usePlanViewport` re-fits on the
  resulting resize, no JS wiring needed.) **The catalog dock is user-resizable** (`catalogResize` flag,
  simple tier, desktop only): `CatalogResizeHandle` (a `col-resize` grab handle on the panel's right
  edge) pointer-drags to set `--catalog-w` on the root, which drives BOTH `--left-rail` and the
  panel `width` (default 320px, clamped 260–560px). Width persists per-device to localStorage
  (`hdb_catalog_width`, guarded — like favourites, not the save schema) and restores on mount;
  ←/→ nudge by 16px. The handle isn't rendered under `body.mobile`.
- **Edits confirm before they commit (`EditConfirmBar`).** A furniture move / rotate / placement
  resolves to a `placementSlice.pendingEdit` and the floating tick/cross **Apply change?** bar
  (`src/ui/EditConfirmBar.tsx`): ✓ / Enter commits, ✗ / Esc reverts (restores the pre-edit `items`
  ref for a transform, removes the just-placed item for a placement). Stamp/Shift placement keeps the
  old rapid no-confirm path. A new gesture auto-commits any still-pending edit.
  Placement already gives immediate optimistic feedback: drag arms the live `PlacementGhost`
  (follows the cursor during `dragover`) and drop applies the item instantly into a
  `pendingEdit` reconciled by the ✓/✗ bar — there is no separate optimistic/reconcile layer
  to add. **Mobile placement is explicit-confirm (`placeConfirm`, bugs #2/#5):** a catalog
  tap/long-press arms the ghost, closes the catalog, and shows a "Place item?" `EditConfirmBar`
  pill BEFORE anything is placed — the ghost stays freely draggable and a finger lift /
  `pointercancel` NEVER commits or aborts (that's what stops the old lost-selection + reopened-
  catalog bug). ✓ commits via the `placementConfirmCommit` module signal (registered by
  `usePlacementController`, so the pill runs the same add/variant/drop-in path); ✗ =
  `cancelPlacement`. ✓ is disabled while the ghost is invalid (red). Commit keeps the just-placed
  item selected (inspector opens) and does NOT reopen the catalog — cancel is the path back to it.
  A **rotate** gesture that lands invalid now resolves to the same `blocked` pending pill instead
  of snapping back (bug #10), matching the item-drag invalid-drop.
- **Viewport-responsive + touch parity.** Support desktop **and** mobile: `body.mobile`
  bottom-sheets at ≤640px (`useIsMobile`), controls inside `env(safe-area-inset-*)`, and
  mobile-toolbar/accordion parity for any new desktop action. Drag-and-drop drop zones must
  be a `<div>` (a `<button>` mishandles native drops).
- **Polished + pixel-perfect.** Use the standard spacing scale for margins/padding (no
  ad-hoc one-off gaps); align to existing components so layouts stay cohesive with the
  theme. Verify any new surface in light + dark across all 5 themes before shipping.
- **Destructive-action policy.** Deleting a placed item is **confirm + Undo**
  (bug report #2): it routes through `inspector/itemTransforms.ts:confirmDeleteItem`
  → `confirmAction({ danger: true })` (a clear "Delete item?" prompt, deliberately
  distinct from the transform "Apply change?" `EditConfirmBar` pill), then
  `deleteItem` (which still offers an Undo toast as a backstop). Reachable from the
  inspector's red `.act.danger` Delete button AND a red `.icon-btn.danger` trash in
  the `InspectorHeader` icon row, so a mobile bottom-sheet user can delete without
  expanding the panel. Locked items never delete (never even prompt). (Earlier this
  was immediate-delete + Undo toast with no confirm; users asked for the explicit
  prompt.) **Bulk clears** (`clearRoom`) stay confirm **+** Undo by design: a
  confirm gate against fat-finger wipes, then a summary toast with Undo — don't
  "simplify" either away. Irreversible actions
  (delete a saved version/slot, delete a saved view, reset/replace the whole
  design) MUST gate on `confirmAction({ title, message, confirmLabel, danger })`
  (`promptSlice`, rendered by `ConfirmModal`) and bail on `false`. Never a
  blocking `window.confirm`; never silent irreversible deletion.
- **Empty states use the shared `EmptyState`** (`src/ui/EmptyState.tsx`): icon (from the
  `Icon` set) + title + optional one-line description + optional CTA, on the `.empty-mini`
  token vocabulary. Any panel/list that can be empty must render it (don't hand-roll inline
  "No … yet" text). Keep copy concise + friendly; use distinct copy for search-no-results
  vs truly-empty; only wire a CTA to a real existing handler.
- **Screen transitions (P6):** orbit↔walk and room-editor enter/exit are already crossfaded by
  `LoadingOverlay` (they fire `showLoading`); the floor-plan editor (`.plan-screen`) crossfades on
  mount via `screenFadeIn` (`--dur-2`/`--ease-out`, fill `backwards`) against the persistent 3D
  canvas. Don't add a competing fade to walk/room transitions. Exit is an instant reveal — no
  leaving-state machine.
- **Progressive-disclosure hints use `InfoCallout`** (`src/ui/InfoCallout.tsx`): a one-line,
  flag-gated (`infoCallouts`) hint banner with a stable `id`, dismissed per-id + persisted to
  localStorage (`calloutsSlice`) so it never re-appears. Never a modal — keep copy to one
  concise, accurate line (verify against the screen's real controls) and mount it inside the
  screen it hints at (room editor / floor-plan editor / walk mode).
- **The Simple→Pro upsell is a single ⌘K-footer hint** (`ProUpsellHint`, flag
  `proUpsell`, `simple` tier) — the Tools menu is Pro-only so it can't host a Simple
  affordance; the hint opens the Appearance popover where the Simple↔Pro toggle
  lives, and renders null in Pro.
- **Ambient effects (P7) go through `useAmbientFx()`** (`src/ui/useAmbientFx.ts`) — the single
  gate: flag `ambientFx` AND `qualityTier !== 'performance'` AND not reduced-motion; **dormant in
  the default Performance tier** (so it costs nothing until a user opts into a heavier tier). Every
  ambient effect consumes it and renders nothing when false. **Continuously-animating effects** (the
  HQ border-beam `.beam`) mount only while the work is active *and* the gate is on, and
  IntersectionObserver-pause off-screen (`.beam.paused { animation-play-state: paused }`). The
  **catalog radial gradient** (`.cat-card`, `--mx`/`--my`) is pointermove-driven
  (CatalogDrawer's gated grid handler writes the vars via `setProperty`) — event-driven, no continuous
  animation, so no IntersectionObserver; inert (centred) when the gate is off. Accent-only via
  `color-mix(in oklch, var(--accent) …)` — no colour literals; animation fills `backwards`, never
  `both`. (A parallel `.preset-card` mirror in `flows.css` for a "Layout presets" picker that was
  never built this way — the picker shipped as `SmartStartWizard`'s `.ss-card` grid instead — was
  pruned as dead in the 2026-07-03 cycle-2 audit; don't re-add it without a real consumer.)
  **Two P7 effects were DROPPED** (recorded so they aren't re-proposed): the multi-circle
  **hotspot pulse** (`.er-ring`/`.er-hot`/`@keyframes erpulse` in `flows.css`) has **zero TSX
  consumers** — reviving orphaned CSS for an unconsumed effect violates YAGNI (the orphaned CSS is
  left untouched, out of scope to delete here); and **toolbar dock magnification** needs a
  continuously-running rAF spring integrator driven by every toolbar `pointermove`, contradicting the
  Performance-tier/IO-pause mandate for low value on a productivity tool (the `.tool-btn:hover`
  treatment stays).
- **"New" badges on a recently-shipped entry use `newFlag` (P27), not a hand-rolled dot.**
  `MenuItem` (`toolbar/ToolbarMenu.tsx`, desktop) and `Item` (`toolbar/mobile/parts.tsx`, mobile
  sheet) both take `newFlag?: FeatureFlag` — wire the same flag on BOTH a feature's desktop
  `MenuItem` row and its mobile `Item` row for parity; add the same prop to `IconButton` if the
  representative entry is a toolbar icon instead (one integration point per entry, not more).
  The pulsing `.new-dot` shows via `useNewBadge(flag)` (`src/ui/newBadges.ts`) only while
  `newBadges` is on, the target flag is on, the flag has a `NEW_BADGES` entry, and that entry is
  still within its recency window (same `major.minor.patch` as `APP_VERSION`, ≤25 builds) and
  unseen — dismissed on first click, persisted per-flag (`badgesSlice`, `hdb_seen_badges`). Add
  an entry to `NEW_BADGES` only for a feature with a real, verified toolbar/menu row (desktop
  `styleQuiz` in `ToolsMenu.tsx`; desktop+mobile `parallelProjection` in `ViewMenu.tsx` +
  `ViewSection.tsx`); retire it by deleting the entry once it's no longer worth calling out (no
  need to wait for it to age out — both current entries are already past their recency window
  and are kept only as wiring examples).
- **Editing UI** (Catalog/Inspector/FinishPicker) only mounts in the per-room editor —
  gate on `canEditScene`; leaving the editor clears the selection. **One documented exception:**
  `CatalogDrawer` also mounts inside the 2D floor-plan editor, behind `roomEditorActive ||
  (floorPlanEditing && planFurnish)` (PLAN-FURNISH; Phase 2 dropped the old `!isMobile` gate) —
  the plan editor is its own parallel editing surface that was already mutating `items` directly
  (move/rotate/scale) before this, so surfacing the catalog there doesn't touch
  `canEditScene`/the VIEW-EDIT-SPLIT invariant. Don't extend this pattern to
  Inspector/FinishPicker without the same justification. **Mobile plan placement mirrors the 3D
  `placeConfirm` grammar:** arming from a card AUTO-CLOSES the catalog bottom-sheet (the sheet
  covers ~72% of a phone plan; `reopenCatalogAfterPlace` brings it back on cancel/confirm), the
  plan tap commits through Phase 1's `onDown` → `pendingEdit` → "Place item?" ✓/✗ bar, and the 3D
  `usePlacementController` touch handlers stand down while `floorPlanEditing` (they raced the
  plan's own commit and cancelled armed stamps). Long-press-from-card drags via window-level
  pointer events (`planFurnishPlacement.ts` pure helpers). **Window-bound fixtures place in the
  plan too (Phase 3):** the ghost + commit snap to the EDITED level's nearest window via
  `planFurnishPlacement.ts:buildPlanWindowGhostItem` (the same `windowSnap.ts` pair as 3D,
  window-sized props, raw unsnapped drop point so wall magnetism can't flip the facing); a level
  with no window toasts "No window to place on" + disarms on arming
  (scenario: `plan-furnish-windows.json`).
- **"Fits this room" catalog cue (CATALOG-FITS)** reuses the room's real geometry, never a
  parallel one: `ui/catalog/useCatalogRoomFit.ts` resolves the active room's free-space rects via
  `scene/roomEditorShell.ts:getRoomEditorShell` (the same shell the camera + room-filter already
  use), and the pure `catalog/roomFit.ts:itemFitsRoom` compares those against a def's
  `defaultFootprint` using the shared `CLEARANCE` margins. `CatalogCard` shows the result as a
  `.pr.warn` "Won't fit"/"Tight fit" note (+ a `.no-fit` dim for won't-fit) gated by the `catalogFits`
  flag (simple tier — a passive help cue is core-loop, not analytical); the `catalogFitsFilter`
  flag (pro tier) adds a "Fits only" browse checkbox (`catalogBrowse.ts:filterByFits`). A `null`
  rects (no room being edited, or an unresolved room id) or a degenerate footprint always resolves
  to `'unknown'` — never a false "won't fit". Scoped to `CatalogCard` only, not `RemoteCard`/
  `SharedCard` (unresolved remote/shared footprints stay un-flagged and are never hidden by the
  filter).
- **Catalog cards carry no per-card action buttons except the favourite ♥.** The earlier per-card
  finish-picker popover (CATALOG-VARIANT, `Icon.Palette`) and sticky-**stamp** button (`Icon.Copy`)
  were **removed** — both were broken on touch and duplicated the inspector (finish → inspector
  FinishPicker/QuickFinishes; duplicate → inspector Duplicate action + the minimized-header copy
  icon). Do **not** re-add card action buttons; changing the finish and duplicating are inspector
  jobs. Stamp mode still exists behind `stampPlace` but is armed only from ⌘K. The favourite button
  (`.fav-btn`) shows a solid **red** heart (`Icon.HeartFilled`, `.fav-btn.on { color: var(--danger) }`)
  when saved and the outline `Icon.Heart` otherwise. The one card action besides ♥ is the
  removal **"×"** (`.coll-x`): shown for a `source:'user'` upload **or** a `source:'ikea'`
  imported/shared def (aria-label "Remove uploaded/downloaded asset"), it frees the def's
  IndexedDB blobs and un-hides its "Download" `SharedCard`. It routes through
  `catalog/removeImportedDef.ts:confirmAndRemoveDef`, which prompts via `confirmAction` **only
  when the def has placed instances** (which get wiped with it) — otherwise removal is immediate.
  A `source:'ikea'` card ALSO carries a **refresh** "↻" (`.coll-refresh`, aria-label "Re-download
  asset from library") that re-fetches the group from R2 and rebuilds its GLB/thumbnail **in place**
  (`addSharedGroup(group)` → `replaceUserFurniture`, keeping placed instances). The drawer maps the
  def's `groupKey` → manifest folder slug via `catalog/sharedGroupForDef.ts` and only passes
  `onRefresh` when re-downloadable (admin + `sharedLibrary` + `hasBackend()` + a matching manifest
  item), so a dev-scrape/non-admin def shows no refresh control. No dedicated flag — reuses the
  `sharedLibrary` gate.
- **Room-aware catalog default (CATALOG-ROOMAWARE)** keys only the **initial landing category** on
  the room being edited, never the tab order or a subsequent pick. The pure mapping is
  `ui/catalog/roomAwareCategories.ts` (`relevantCategoriesForRoomKind` / `orderCategoriesForRoomKind`
  / `defaultCategoryForRoomKind`), reusing the existing `analysis/suggestions.ts` `RoomKind` +
  `furniture/types.ts` `FurnitureCategory` (do **not** invent new room-kind/category types).
  `CatalogDrawer` applies it in a `useEffect` keyed on `roomEditor.roomId` via a `roomEntryKeyRef`,
  so it fires ONLY on the room-entry transition — a manual category pick mid-session must stick
  (don't fight the user), and an unmapped kind / whole-flat view keeps the persisted default.
  Gated by the `catalogRoomAware` flag (simple tier — a default-landing convenience is core-loop,
  not analytical); flag off restores today's behaviour. Unit-test the mapping + BOTH modes.
- **Recently-placed quick-add strip (CATALOG-RECENTS, `catalogRecents` flag, simple tier)** — the
  automatic, item-level "the thing I just used" complement to the deliberate Favourites star.
  `recentSlice` (state) records a defId on every `addItem` commit, newest-first / deduped / capped
  24, self-persisted per-device to `localStorage` (`hdb_recent_items`, out of the save schema like
  favourites); `useUnifiedCatalog.ts` resolves those ids to a `recent: GridItem[]` (local defs only,
  unresolvable/pets-gated entries dropped like clipboard paste). Two surfaces, both gated by the one
  flag: the fuller **"Recent" pseudo-category tab** (`CategoryTabs`, chip hidden when count 0) and a
  thin **`RecentStrip`** row (`ui/catalog/RecentStrip.tsx`, capped `RECENT_STRIP_MAX`=8) rendered atop
  the browse grid in `CatalogDrawer` — shown only in a real browse category (not search / the
  favourites+recent tabs) and hidden when empty (no dead strip). Both the strip chips and the full
  `CatalogCard` share ONE place path via **`useCatalogPlacement(def)`** (extracted from `CatalogCard`
  — desktop click-to-arm + native drag, mobile explicit-confirm `placeConfirm` + 2D-plan
  tap-to-place); don't re-implement the placement grammar per surface. Test the flag in BOTH modes
  (simple-tier → on in both).
- **Stable catalog order across download (STABLE-CATALOG-ORDER)** lives in `useUnifiedCatalog.ts`:
  each category is a leading local block → remote CC0 block → shared-library block, and a card must
  NOT change block when it's downloaded. A resolved remote entry renders its local def AT the remote
  slot, and an imported shared item (`ikea-<groupKey>` def exists) renders its local def AT the shared
  slot — both EXCLUDED from the leading block — so the grid index is preserved instead of the card
  jumping to the top. Relocation happens ONLY when the remote/shared entry is present in the merge
  input, so `includeRemote=false`/`includeShared=false` (Simple, non-admin, shared lib not loaded)
  keeps the resolved/imported def in the leading block exactly as before. Don't reintroduce a
  "hide the entry, let the def fall into the local block" dedup — that's the jump this fixes.
- **Catalog filter control (`catalogFilters` flag, simple tier)** — the funnel `Icon.Filter` button
  in the catalog panel header opens `CatalogFilterButton` (Popover desktop / Modal sheet mobile) with
  Availability (only shown when the grid holds remote/shared cards) · Source (Built-in / My items /
  CC0 library, via `catalogBrowse.ts:cardSource`) · Favourites-only. Pure filtering is
  `catalogBrowse.ts:filterCatalog`; `CatalogDrawer` applies it after the price/fits filters. Filter
  state is **component-local + ephemeral** — never persisted, never in the save schema (like the
  Max $/Fits-only browse controls). Active state → an accent dot on the button + a "Reset to All"
  row; an all-filtered-out grid uses the shared `EmptyState`. Test BOTH modes (simple-tier → on in
  both). Don't route the source buckets through anything but the real `def.source`/card kind.
- **Remote CC0 catalog is flag-gated by content kind.** Browsable remote *models*
  (`RemoteCard`s in the catalog grid) ride the **`remoteFurniture`** flag (pro, default on) —
  **no provider currently supplies furniture models (Poly Haven is materials/HDRIs only), so this
  surfaces nothing today**; browsable remote *materials* (FinishPicker Browse tab, Poly Haven +
  ambientCG) ride **`remoteMaterials`** (pro). Pass the
  flag into `useUnifiedCatalog(includeRemote)` (via `useFeature('remoteFurniture')`) — never merge
  remote entries ungated. Only bootstrap the provider index when at least one of the two is on
  (`bootstrapRemoteCatalog()` fetches both kinds), so Simple mode (both forced off) hits no network.
  Gating is **browse/add only**: a placed/resolved remote def still merges into `useCatalog`
  (`buildMergedCatalog`) and renders with the flag off — don't gate the render/merge path.
- **Shared R2 library cards merge into the grid behind `sharedLibrary` (simple tier) + the admin
  role.** Signed-in **admins** (`isAdminUser`) see every R2 library product as a `shared` `GridItem`
  via `useUnifiedCatalog(includeRemote, includeShared)` (pass `useFeature('sharedLibrary') &&
  isAdmin`); `SharedCard` mirrors `RemoteCard` (lazy `loading="lazy"` proxy thumbnail,
  import-on-click via `addSharedGroup`). Deduped against imported `ikea-<groupKey>` defs.
  `CatalogDrawer` bootstraps the manifest once on open when admin + flag on + `hasBackend()`.
- **Shortcut chips** come from `controls/keybindings.ts` (via `shortcuts.ts`) — never
  hardcode a key label. Tooltips + menus render through `Popover` (portal) so the
  scrollable toolbar can't clip them.
- **Menu shortcut combos go through `MenuItem`'s `kbd` prop** (`toolbar/ToolbarMenu.tsx`),
  which renders the right-aligned `.mi-kbd` chip — never inline the combo text in `label`.
- **Modal widths use the `--modal-sm`/`-md`/`-lg` tokens**: pass the token string to
  `Modal`'s `width` prop (`width="var(--modal-md)"`), not an ad-hoc `min(…px, …)` literal.
- **Keyboard focus treatment is `var(--focus-ring)`** (`box-shadow` on `:focus-visible`) —
  no ad-hoc focus rings/outlines on a new control.
- **Borders.** `--border` is the default hairline (panels, rows, cards, dividers, inputs at
  rest). `--border-2` is the *stronger* border — use it only to signal emphasis or
  hover/active state (`.clr-item:hover { border-color: var(--border-2) }`, left accent bars,
  hovered share options). Never a colour literal; never a third ad-hoc border alpha. Accent
  borders (`border-color: var(--accent)`) mark selection/focus, not mere hover.
- **Hover.** Fills step up one surface level: rest → `--surface-2`, hover → `--surface-3`
  (rows, chips, ghost buttons). Interactive **cards** use the shared `.liftable` class
  (`translateY(-2px)` + `--shadow-pop` rise) — don't hand-roll a per-card `transform`/
  `box-shadow`. **Row actions** that appear on hover (`.lyr-acts` pattern) MUST also reveal on
  `:focus-within` and stay always-visible under `body.mobile` (touch has no hover). Hover
  transitions use `var(--dur) var(--ease)`; larger entrances use the `--dur-1/-2/-3` +
  `--ease-out` scale. `.stagger-in` entrance containers (`components.css`) use fill-mode
  `backwards` on the child animation — never `both`, which pins the animation's `to` values
  (`opacity:1; transform:none`) forever and silently blocks later hover-lift transforms
  (`.liftable`) or state-driven opacity changes (e.g. `.lyr-row.hidden`) on the same element.
  The nth-child `--i` fallback only covers the first 12 children — lists that can render more
  than 12 items must set `--i` inline per item rather than relying on the fallback. A container
  that renders an **arbitrary, variable** number of direct children it doesn't control (e.g. the
  `ToolbarMenu` `.pop-panel`, whose rows come from each menu) must **not** use `.stagger-in` at all:
  it can't set `--i` inline, so >12-row menus (File/Tools in Pro) gave every row past the 12th a
  `--i` of 0 → zero delay → those rows appeared instantly at the bottom while rows 6–12 were still
  mid-cascade, leaving a transient vertical VOID between the clusters (TOOLBAR-MENU-VOID). Such
  panels rely on their own whole-panel entrance (`.pop-panel`'s `pop` keyframe) instead.
- **Type hierarchy** — one ladder, from the `--t-*` scale: page/hero title `--t-xl` (20px)
  weight 800 `--lh-tight`; panel title `--t-lg` (16px) weight 800 `--lh-tight`; section header
  (`.sec-h`, `.lyr-ghead`, `.menu-label`) `--t-2xs` (10px) weight 700 UPPERCASE +
  `letter-spacing: 0.06–0.08em` + `--text-3`; body/item label `--t-base`/`--t-sm` weight
  500–600 `--text`/`--text-2`; caption/meta `--t-xs`/`--t-2xs` weight 600 `--text-3`. Multiline
  reading copy (descriptions, empty states, onboarding) uses `--lh-body` (1.5); single-line
  titles/labels use `--lh-tight` (1.25). Numeric readouts add
  `font-variant-numeric: tabular-nums` (or `.mono`).
- Labelled sliders use `controls/SliderField` (label + `.slider` + a `tabular-nums` readout) —
  don't hand-pair a bare `.slider` with a separate value span; raw `.slider` stays valid for
  legacy call sites being migrated.
- **A live value can BE the slider's label instead of a separate readout** — don't render the
  same concept/value twice on one control. `TimeOfDaySlider` (`ui/scene/TimeOfDaySlider.tsx`,
  shared by the desktop Scene menu + mobile sheet) sits under a `.scene-row-head` that already
  names the section ("Time of day"), so the `SliderField` below it passes the live formatted
  clock as `label` (with `ariaLabel="Time of day"` to keep the accessible name stable) and
  `hideReadout` to suppress the normal `.val` — one line: `[time] [slider]`. The header keeps
  only its section label (no separate clock span — that was a duplicate of the row's own label).
  `.tod .fld .lbl` (`features.css`) sizes the label to its content (`flex: none`, `white-space:
  nowrap`, mono/tabular-nums) so the slider (`.fld .slider`, `flex: 1.2`) takes the rest of the
  row and the widest time string ("12:58 PM") never wraps or pushes the slider off-row.
- Self-managed collapsible sections use `controls/Disclosure` over the `.compose` `<details>`
  idiom (FinishPicker/MaterialComposer). Layers group-collapse stays bespoke — it is
  store-persisted (`layersCollapsed`) and force-expands under an active filter.
- **P18 primitive audit — three candidates dropped as unconsumed abstractions** (recorded here
  so they aren't re-proposed without a real consumer): **Badge dot/tonal variants** — `.badge`
  already ships `.err`/`.warn`/`.ok`/`.neutral` tonal variants, and dot affordances already exist
  as `.nub` (count) and `.new-dot` (P27); a new variant has no consumer. **Breadcrumb** — no
  navigated Room→Wall→Surface trail exists; room switching is `RoomSwitcher`'s `Select`, and the
  elevation view is a render target, not a nav surface. **ButtonGroup** — `Modal` already exposes
  a `footer` prop; footers are 1–3 buttons in a flex row that differ per modal, so a `ButtonGroup`
  over a plain flex row saves nothing.
- **Untrusted URLs → `safeUrl` (`src/utils/safeUrl.ts`).** Any URL that originates from
  imported / user-supplied / scraped data (def `sourceUrl`, IKEA `productInfo` image/document
  URLs, retailer-offer links, …) MUST pass through `safeUrl()`/`safeHref()` before it reaches an
  `href`/`src` — render the link only when it returns a value, else fall back to inert text (a
  `javascript:`/`data:` URL would otherwise execute on click, SEC-001). It allows only
  `http:`/`https:`/`mailto:` + relative/protocol-relative URLs. The schema also neutralizes these
  fields on import, but the render sink is the defense-in-depth backstop.
- **Live notification cards (P32).** A progress/success toast can carry `onActivate` (a body
  click that jumps to the result — the whole card body is the affordance, distinct from the
  trailing `actionLabel`/`onAction` button); a failed job uses `notify.error(id, msg, undefined,
  retry)` to swap in the standard "Retry" action. Toasts update in place via `notify.update` and
  de-dupe on `kind+title+message` (progress toasts never de-dupe). **De-dupe drops the incoming
  call's `onAction` closure**, keeping only the FIRST toast's — fine when every de-duped call's
  action is equivalent (e.g. re-surfacing "This area is already a room" repeatedly), but wrong for
  an Undo whose target moves each time it fires (BUG-4: `itemsSlice.deleteItem`'s "Item deleted"
  toast — two deletes ≥500ms apart each push their OWN undo-able history entry yet still de-dupe
  into one visible toast, so a plain `() => get().undo()` only popped the newest one). A toast
  whose action must fire once per de-duped call passes `undoRepeat: <count>` to `notify.start`
  (computed by the caller as the cumulative count, NOT a delta): `start()` wraps `onAction` to
  re-read the count off the LIVE notification (by id) at click time and invoke the underlying
  action that many times, and a later de-dupe overwrites the stored count with the new call's
  value. `itemsSlice.deleteItem` only passes an incremented count when this delete's push both (a)
  landed as a genuinely NEW history entry (not merged into the prior one within the 500ms
  coalesce window) and (b) immediately followed another `'delete'`-keyed push with nothing else
  in between — so an unrelated action sitting between two deletes starts a fresh chain of 1
  instead of reaching past it, and a chain whose earlier toast already auto-dismissed can't be
  reached either. Reuse this mechanism for any future toast with the same "de-dupe must not drop
  an earlier action" shape, rather than special-casing dedupe again.
- Modals portal to `document.body`; reuse the shared `Modal` primitive. While any modal is
  open, global hotkeys are suppressed via `controls/modalGuard.ts` — `Modal` registers
  automatically; any modal-style overlay that does **not** build on `Modal` (custom
  `.modal-overlay`, upload dialogs, …) must call `useModalGuard(open)` itself. Escape is
  each modal's own listener; ⌘K/undo are suppressed while a modal is open (the ⌘K palette
  is not a `Modal` and keeps its own keyboard handling).
- **Focus management (A11Y-MODAL-MENU).** `Modal` moves focus into the dialog on open, traps
  Tab within it, and restores focus to whatever was previously focused on close/unmount — the
  shared selector + wrap logic live in `controls/focusTrap.ts` (`FOCUSABLE_SELECTOR`,
  `trapTabKey`); reuse them rather than hand-rolling another copy. `ToolbarMenu`'s dropdown
  panel does the same (move-focus-on-open + Tab-trap) because `Popover` portals the panel to
  `document.body`, putting it outside the trigger button's natural tab order — without this a
  keyboard user who opens a menu with Enter/Space had no way to Tab into its rows at all.
  Escape-closes-and-restores-focus-to-the-trigger is `Popover`'s own job (already covers every
  `Popover` consumer, including `ToolbarMenu`). Deliberately NOT added: arrow-key/Home-End/
  type-ahead roving focus on `ToolbarMenu` rows — its panels mix real `menuitem` buttons with
  native range sliders (`TimeOfDaySlider`) and `Select` combobox triggers (which own their own
  Up/Down handling), so a panel-wide arrow-key interceptor would fight a focused slider's
  native Left/Right value-adjustment; Tab-based navigation is the correct, lower-risk fit for
  that heterogeneous content. `Popover` itself stays free of any generic focus-move/trap — some
  consumers (`Select`, the combobox pattern) deliberately keep DOM focus on the trigger and
  drive a *virtual* active option via their own keydown handler, so a generic trap there would
  fight that pattern; add trapping consumer-side (as `ToolbarMenu` and `upload/ConfirmDialog`
  do) when a specific `Popover` payload is real Tab-navigable content.
