# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit on
`claude/codebase-analysis-optimization-QKCK6`. See `TASKS.md` for the backlog.

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
