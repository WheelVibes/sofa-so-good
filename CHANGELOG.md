# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit on
`claude/codebase-analysis-optimization-QKCK6`. See `TASKS.md` for the backlog.

## [N7b] Roving arrow-key navigation in the catalog grid

Completes catalog keyboard access (after N7a made cards focusable + activatable):
the grid now handles **arrow keys to move focus between cards** — ←/→ by one,
↑/↓ by a row. The column count is read from the live layout (cards sharing the
first row's `offsetTop`), so it adapts to the responsive 1/2/3-column
breakpoints rather than hard-coding 2. Only acts when a card itself holds focus,
leaving the nested heart/delete buttons' Tab order intact. Verified in the
harness (0 →→ 1 →↓ 3 →← 2 →↑ 0 with a 2-column layout).

## [Q12] "Straighten" context-menu action

A natural complement to the rotate gizmo's free (Shift-drag) rotation: the
right-click menu now offers **Straighten**, snapping a freely-turned piece to the
nearest right angle (square to the walls). It appears **only when the item is
off-axis** (rotation not a multiple of 90°) to avoid clutter, and is
collision-checked like the Rotate 90° action (a straighten that would overlap is
rejected). Verified in the harness (a rug at 0.5 rad snaps to 0; an off-axis
sofa whose straighten would collide is correctly left untouched).

## [Q11] Flush-to-wall snapping while dragging

A hallmark of pro planners (Planner5D/Coohom): furniture dragged near a wall now
**snaps flush** to it. New pure `collision/wallSnap.ts` (`wallSnapOffset`)
computes the per-axis offset to seat a footprint AABB against the nearest wall
face within ~12 cm — independently on X and Z, so dragging into a corner snaps to
both walls at once. Wired into `DragController`'s single-item drag after the
existing item-alignment snap, gated off when grid-snap is on (a deliberate
precise mode) and skipped for group drags. Uses the same door-aware collision
walls (won't snap across a doorway). Unit-tested (5 cases: face sides, radius
cutoff, corner, out-of-span, nearest-of-many) + verified end-to-end (a nightstand
dragged toward the bedroom wall lands flush, left edge on the wall face).

## [Q10] Per-room cost breakdown in the design report

The printable report grouped furniture only by category, so a client couldn't
see where the budget goes spatially. Added a **"Cost by room"** section: each
placed item is attributed to the plan room containing its footprint centre
(`pointInRoom`), summing item count + estimated cost per room, with an
"Unassigned" bucket for anything outside every room. The aggregation lives in a
pure, unit-tested `reportData.ts` (`furnitureCostByRoom`) and renders into the
existing report table styles; the section is omitted when nothing is placed.
Verified: 6 unit tests (attribution, Unassigned ordering, unknown-def skip, empty
layout, + a `buildReportHtml` integration assertion) and a live report render in
the harness.

## [N7a] Keyboard-accessible catalog cards

Catalog cards were `<div onClick>` — invisible to keyboard + screen-reader users
(no focus, no role, no key activation). Both `CatalogCard` and `RemoteCard` now
carry `role="button"`, `tabIndex={0}`, an `aria-label` ("Place …" / "Add …"),
and Enter/Space activation (arming placement / downloading), plus a
`:focus-visible` accent ring. `usePlacementDrag` accepts an optional event so a
keyboard activation (no cursor) arms the ghost at the viewport centre to follow
the next move. Mouse behaviour unchanged; verified in the harness (Tab focus →
Enter arms placement; focus ring renders).

## [N5] Persist the floor-plan trace backdrop

The reference photo/scan you trace walls over lived only in a session object URL
— lost on closing the editor *or* reloading. Now the **blob + calibration**
(scale `mPerPx`, opacity, world offset) persist to IDB (`backdropPersist.ts`, one
fixed slot via the existing `IdbAssetStore`) and **rehydrate when the editor
opens**, so a traced backdrop survives both. Loading a new image replaces the
slot; the ✕ button clears it; calibration edits are debounced before write; all
storage calls are fail-soft (never break the editor). The rehydrate effect is
gated on `editing` (the editor is always-mounted) and only loads when no
backdrop is present, avoiding duplicate object URLs. Persistence unit-tested (5
cases, fake-indexeddb); verified end-to-end in the harness (a backdrop written
as a "prior session" rehydrates on open — scale/opacity/clear controls appear).

## [B2] Dispose audit — fix leaked overlay geometries

Several scene overlays built three.js geometries with `new` inside `useMemo`
without disposing the replaced buffer. Unlike JSX `<boxGeometry/>` (which R3F
auto-disposes), these leak GPU memory every time their dependencies change —
**hot paths**: `SelectionOutline` (per selected item, on every resize/rotate),
`HoverHighlight` (every hover target), `AlignmentGuides` (every frame mid-drag),
the `DragController` snap highlight, and `GridOverlay` (on grid/plan change).
Each `EdgesGeometry(new BoxGeometry(...))` also leaked the throw-away source box
immediately. Added a shared `scene/geometryUtil.ts` (`boxEdges` — builds edges +
disposes the source box; `useDisposeGeometry` — disposes on dep-change/unmount)
and wired it through all five components. Visually verified the outline, hover,
rotate ring, and snap grid still render with no artifacts.

## [S4] Size cap on `.sofa.json` design import (DoS guard)

`importDesignFromFile` validated content (JSON parse → migrate → zod) but read
any file fully into memory first — a multi-GB or pathological file would block
the tab before validation. Added a **50 MB cap** (`MAX_DESIGN_FILE_BYTES`,
generously above any real design) checked **before** `file.text()`, throwing the
same friendly `DesignFileError`. Unit-tested (rejects oversized without reading).

## [N3+] Rotate gizmo extended to multi-selection (group rotate)

Generalised the rotate gizmo into one unified gesture over a *target set*: a
single item still spins about its own axis (snapping to absolute 15° marks),
while a **multi-selection** now shows one ring enclosing the whole group and
rotates every member **rigidly about the group centroid** — positions orbit the
pivot (`rotatePointAround`, mirrors the store's `groupRotate`) and each piece's
heading advances by the same snapped delta, with a signed degree readout. The
collision check ignores intra-selection pairs (rigid rotation preserves their
spacing) and tests against the rest + walls; an invalid release reverts the
whole set. Three new pure helpers (`rotatePointAround`, `snapDelta`,
`enclosingRadius`) are unit-tested (14 cases total). Verified end-to-end via
synthetic pointer drags: a single rug spins in place (0°→45°, position fixed),
and a two-item group orbits its centroid (both → 45°, positions rotated about
the pivot) and commits.

## [N3] Touch-friendly drag-to-rotate gizmo

Rotating a piece previously meant the keyboard-only <kbd>R</kbd> key (90° /
Shift+R 15°) — unusable on touch and coarse for fine angles. Added a
`RotateGizmo` drawn on the floor around the single selected item (orbit camera +
**select** tool, unlocked): a blue ring + front knob you **drag to spin** the
piece about its vertical axis, snapping to **15°** steps (hold Shift for free).
A live degree read-out follows the knob, the ring tints green/red via the same
`canPlace` check the item-drag uses, and an invalid release reverts to the
pre-gesture angle. The ring/knob meshes patch their `raycast` so the
always-on-top handle wins the pointer pick over taller furniture. Pure rotation
math (`rotateGizmoMath.ts`: relative-angle + snap, radius, degree wrap) is
extracted and unit-tested (8 cases); mounted in both the main and room-editor
scenes. Verified end-to-end in the harness by driving synthetic pointer events
(grab → live `MID 45` → committed `AFTER 45` on a noClip rug; collision revert
on a wall-blocked sofa) plus a clean idle 3/4 render.

## [R3] "Auto-saved …" indicator

Users had no signal their work was being persisted. Added `lastSavedAt` to the UI
slice, set on every successful auto-save (`autosave.ts`), and surfaced as a
reassuring **"Auto-saved just now / Xm ago"** line on the Versions panel's
current-layout card (with a compact relative-time formatter). Visually verified.

## [N9b] Board-and-batten panelling wall finishes

A popular modern wall treatment. Added a `batten` procedural pattern (flat
painted panel + evenly-spaced vertical raised battens with bevelled edges in the
height map; seamless) and three finishes — **Board & batten white / sage /
navy**. Wired into both `ProceduralPattern` unions + `PATTERN_FN`. Visually
verified (clear raised battens catching light, seamless across walls).

## [N2] Duplicate-in-array (row of copies)

A pro "array/clone" tool: the single-item inspector now has a **"Duplicate a row
of N"** control that places N−1 copies to the item's right (local +X), spaced by
its width, each collision-checked (stops at the first blocked slot). The original
+ copies share one groupId and commit in a single undo step. Verified
end-to-end (66→68 placing a row of 3 with two open slots).

## [N9] Microcement / concrete accent wall finishes

Polished-concrete (microcement) walls are a staple of modern interiors. Added
three wall finishes — **Microcement light / grey / charcoal** — reusing the
existing `concrete` procedural generator at a large (3 m) wall tiling scale.
Pure catalog data (no new generator). Visually verified.

## [N10] Inspector "Reset" props to defaults

Customised a parametric item (size/form/finish/colour) and want it back to
stock? The Properties section header now shows a **Reset** pill (only when the
item's props differ from the def's defaults) that restores
`defaultParamProps(def)` in one undoable step. Visually verified.

## [N1] Apply finish to all rooms

Re-finishing every room one-by-one is tedious. Added `setAllFloorFinish(id)` /
`setAllWallFinish(id)` store actions (apply one finish to every interior room,
skipping external spaces like the AC ledge, one undo step) and two
**"Apply floor/walls to all rooms"** buttons in the FinishPicker that propagate
the current room's finish. Unit-tested + visually verified.

## [Q9] Ctrl/⌘+A select-all

A basic editor expectation that was missing. A global Ctrl/⌘+A now selects every
placed item (orbit mode only, skipped while typing or in the room editor),
surfacing the multi-select align/distribute/group/delete panel. Added to the Help
modal shortcut list. Verified (selects 66/66 default items).

## [A2] Modal focus trap

Completes the Modal accessibility story (A1): Tab / Shift+Tab now cycle within
the dialog instead of escaping to the inert background, wrapping at the first/last
focusable element (and falling back to the panel when there are none). Esc-close
and the dialog role/focus behaviour are unchanged. Unit-tested.

## [RE4] Exposed-brick accent wall finishes

Exposed brick is a staple of interior-design tools and was missing. Added a
`brick` procedural pattern (`generators.ts`): running-bond rows offset by half a
brick, recessed mortar joints, per-brick value/warmth variation + fine speckle —
seamless (column count divides the tile, even row count so the half-offset
wraps). Three wall finishes: **Exposed brick** (red), **White-washed brick**,
**Charcoal brick**. Added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified — convincing brick with clean mortar joints, no seams.

## [A1] Modal accessibility — dialog role + focus management

The shared `Modal` primitive (used by Help, Share, Swap, Compass, Credits, …)
had ESC + backdrop close but no ARIA semantics or focus management. Added
`role="dialog"` + `aria-modal="true"` + `aria-label` (the title), and on open it
moves focus into the dialog, restoring it to the previously-focused element on
close — so keyboard/screen-reader users aren't stranded behind the modal. One
change improves every modal. Unit-tested.

## [B1] Fix misleading "cannot be undone" reset confirms

The File menu's "Empty" / "Default" reset confirmations warned the action
"cannot be undone" / "will be lost", but both `resetToEmpty` and `resetToDefault`
call `pushHistory()` first — they're fully undoable with Ctrl/⌘+Z. Corrected the
confirm copy in both the desktop FileMenu and the mobile toolbar to say so, so
users aren't scared off a reversible action.

## [C1] PWA manifest + theme-color + social/Apple meta

Commercial-readiness polish for `index.html`:
- A base-agnostic `public/manifest.webmanifest` (relative `start_url`/icon URLs so
  it works under the `/sofa-so-good/` deploy base) → the app is installable
  ("Add to Home Screen") with name, description, standalone display, and theme
  colour. No service worker (avoids offline-caching complexity/risk).
- `theme-color` meta (light/dark via `prefers-color-scheme`) tints the mobile
  browser/OS chrome to the Clay palette.
- Apple `mobile-web-app` meta (capable, title, status-bar) for iOS home-screen.
- Open Graph + Twitter `summary` meta so shared links (the app has a Share
  feature) get a proper title/description preview.
- Verified via `npm run build`: Vite rewrites the manifest/icon links to the base
  path and copies the manifest into `dist/`.

## [Q8] "Apply style to all of this type" (bulk restyle)

Styling each of N identical chairs by hand is tedious; pro tools (Coohom, Foyr)
let you propagate a material. Added an `applyStyleToAll(id)` store action that
copies one item's props (finish / colour / material / form) to every other
placed item of the same `defId` (skipping locked ones, one undo step, returns the
count). Surfaced as an **"Apply style to all of this type"** context-menu row
(shown only when ≥2 of that type exist) with a success toast. Unit-tested +
visually verified.

## [R4] Drop non-finite item transforms on load

`z.number()` admits `NaN`/`Infinity`, so a corrupt or hand-edited save (or any
future bug that wrote a bad transform) could feed `NaN` straight into the
Three.js matrices — broken/disappearing geometry, potentially a crash-loop on
reload. `applySerialized` now filters out items whose `position`/`rotation` isn't
finite (fixing the layout rather than discarding it wholesale). Unit-tested.

## [F1] Export / import a design as a file (portability + backup)

localStorage save slots are device- and browser-bound, so a design could never
leave the machine it was made on. Added **Export file** / **Import file** to the
Versions panel:

- `state/storage/designFile.ts` — `exportDesignToFile` serializes the current
  state and downloads a pretty-printed `.sofa.json` (filename-sanitized);
  `importDesignFromFile` reads + `migrate`s + `SerializedStateZ`-validates the
  file, throwing a typed `DesignFileError` with friendly messages (bad JSON,
  unsupported version, not-a-design). Same serialized shape as save slots, so it
  round-trips and older files migrate.
- Wired two buttons + a hidden file input in `VersionsPanel`; import applies the
  state, clears history, and toasts success/failure. Re-selecting the same file
  works (input value reset).
- Unit-tested (round-trip, error cases, download filename) + visually verified.

## [Q5] Wall-length labels on the 2D floor plan

Every pro floor planner annotates walls with their length; the editor only had
room-area labels + a transient draw readout. Added persistent per-wall length
labels (metres, at each wall midpoint nudged to its outward side, hidden for
sub-0.4 m stubs, accent-coloured when the wall is selected) plus a **Dims**
toggle in the editor header (default on). Visually verified — every wall now
shows its length alongside the room areas.

## [S1] BYO-key security audit + AI key-exfiltration guard

Audited bring-your-own-key storage (AI keys, Poly Pizza pack key). Findings:
keys live only in `localStorage`, are sent only to their configured provider via
request headers, are never logged to the console, and never enter the save
schema / autosave / export — clean. One defense-in-depth gap fixed: the Replicate
poll loop attached the API key to a URL taken from the provider response
(`pred.urls.get`); a tampered response could have sent the key to an arbitrary
host. Added `safePollUrl`, which only trusts a poll URL whose origin matches
`api.replicate.com` and otherwise falls back to the canonical URL. Unit-tested.

## [Q4] Wire the `?` keyboard shortcut to open Help

The Help & shortcuts modal advertised `?` as its open binding, but no global
handler existed — pressing `?` did nothing. Added a global `?` (Shift+/) handler
in `App.tsx` alongside the ⌘K one: toggles the Help modal, guarded by
`isEditableTarget` so it never hijacks a literal "?" typed into an input, and
ignores modifier combos. Visually verified (pressing `?` opens the modal).

## [RE3] Basketweave parquet floor finish

A premium floor look common in interior-design tools, missing here (only straight
planks existed). Added a `parquet` procedural pattern
(`materials/procedural/generators.ts`): a seamless grid of square blocks each
holding 4 parallel wood planks, with block orientation alternating like a
checkerboard — the classic basketweave parquet. Reuses the wood shading (warped
latewood bands, per-board tint, recessed plank/block grooves), oriented per
block. Two catalog finishes — **Oak parquet** + **Walnut parquet** (`floor-parquet-*`,
tiling at 0.5 m). Pattern added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified (renders as a convincing basketweave, seamless across rooms).
Also cleaned a pre-existing `noAssignInExpressions` lint finding in the same file.

## [Q6] Saved camera views (bookmarks)

A flagship navigation QOL feature from pro tools (SketchUp scenes, Coohom
viewpoints): bookmark a favourite angle of the flat and fly back to it.

- `state/slices/cameraViewsSlice.ts` — named `SavedView` (pos + look-at target),
  capped (12), persisted to `localStorage` (`hdb_camera_views`, device-global,
  out of the save schema). `saveCurrentView` snapshots the live pose; `applyView`
  bumps `applyViewNonce`/`pendingViewPose` and forces orbit mode; plus
  delete/rename.
- The live orbit pose is published each frame into a `cameraPose` singleton
  (`scene/cameras/cameraForward.ts`) by `<OrbitCamera>`, which also consumes
  `applyViewNonce` to **smoothly fly** (0.6 s smoothstep) to a saved pose.
- UI: a modular `SavedViewsSection` in the desktop **View** menu (Save current
  view + per-view go/delete rows) and full **mobile** parity in the View
  accordion (44px touch targets, delete buttons). Themed via new
  `.saved-view-*` / `.m-saved-view-*` CSS.
- Unit-tested (slice) + visually verified: saved two views, snapped to top-down,
  applied a saved view and watched the camera fly back to the 3/4 overview.

## [Q2] "Recent" catalog row for fast re-placement

A staple of every mainstream interior-design app (Planner5D, Coohom, IKEA
Kreativ) — quick access to the items you just used. Added:

- `state/slices/recentSlice.ts` — an ordered, deduped, capped (24) list of
  recently-placed catalog ids, persisted to `localStorage` (`hdb_recent_items`),
  kept out of the save schema/autosave (per-device convenience).
- Hooked from `itemsSlice.addItem`, the single path real user placements,
  duplicates and pastes flow through — the boot seed + set drops use `setItems`,
  so the list stays meaningfully "recently used".
- A **clock "Recent" chip** in `CategoryTabs` (shown only when non-empty, right
  after favourites) and a resolved `recent` list on `useUnifiedCatalog`
  (local-def-only, newest first, orphans dropped). Empty-state copy added.
- Unit-tested; visually verified in the running app (placing an armchair + side
  table surfaces them newest-first under the Recent chip).

## [R2] Surface auto-save failures (localStorage quota)

Auto-save errors were caught but silently swallowed — a user whose browser
storage filled up could keep editing and lose everything on reload with no
warning. Now:

- `startAutosave` gained an `onRecover` hook (fires when a write succeeds after a
  prior failure) alongside the existing `onError`.
- `bootstrap.ts` wires both to a single deduped error notification ("Couldn't
  auto-save", with a quota-specific message) that auto-clears once saving resumes.
- Confirmed the appearance/quality/editor/user-style pref writers already guard
  their `setItem` calls, so no silent throw escapes a store subscriber.
- New `autosave.test.ts` covers the error → recover flow.

## [R1] React error boundary — no more white-screen crashes

A render/lifecycle throw anywhere in the React tree previously blanked the whole
app. Added a modular `src/ui/ErrorBoundary.tsx`:

- **Top-level boundary** (in `main.tsx`) wraps the entire app with a themed
  recovery card (Try again / Reload / Reset layout & reload), collapsible
  technical details, and console diagnostics (no remote telemetry).
- **Scene-scoped boundary** wraps `<Scene>`/`<RoomEditorScene>` so a 3D/WebGL
  render crash keeps the toolbar and panels usable instead of taking the page down.
- The "Reset layout & reload" escape-hatch clears only the boot-restored
  `sofa-so-good:save:autosave` slot (named saves + appearance/onboarding prefs
  are preserved), so a corrupt autosave can't crash-loop the app.
- Supports a custom `fallback` renderer for embedding in other surfaces.
- Unit-tested (`ErrorBoundary.test.tsx`): renders children, catches throws,
  shows scope + details, custom fallback, reset callback.
