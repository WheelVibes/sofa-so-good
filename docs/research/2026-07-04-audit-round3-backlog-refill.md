# Audit round 3 — backlog refill (2026-07-04)

Third-pass backlog refill. The two prior 2026-07-04 audits
(`2026-07-04-deep-audit-and-opportunities.md`, `2026-07-04-audit-round2-tests-mobile-features.md`)
were thorough and most of their items have shipped (see `CHANGELOG.md`: BUG-1..7, PERF-A/B/D,
REAL-1, SEC-1, FEAT-1/2/A/B/C/D, TEST-1..8, MOBILE-1/2/3). This pass re-scanned for the
**genuinely-remaining** high-value, client-doable work, grounded in real `path:line` evidence and
**verified absent** from `CHANGELOG.md` / `TODO.md` / `TASKS.md` / `FEATURE_PARITY.md` and the two
prior audit docs.

Honest scope note: the app is extraordinarily mature (≈984 source / ≈607 test files, 140 feature
flags). A wide competitor-parity sweep this pass (undo history panel, shortcut cheat-sheet, room
area readout, catalog favourites/recents/search, copy-paste, arrow-nudge, room palette, item lock,
align/distribute) found **all of those already shipped**. So this refill is deliberately short —
seven evidence-based items, not speculative filler.

---

## Top 5 by value ÷ effort

1. **R3-TEST-1** — `floorplan/templates/shared.ts` geometry helpers (`perimeter`/`room`/`door`/
   `window`/`parapet`/`iwall`) have **zero tests** yet seed the shell of **every** starter plan
   (18+ HDB/condo templates) — the entry point of the design loop. The area's own `CLAUDE.md`
   mandates "Geometry stays pure + unit-tested here." **S · HIGH.**
2. **R3-TEST-2** — `state/slices/orientationSlice.ts` `normalize`/`setOrientationDeg` untested; it
   is the home's compass rotation driving sun/sky orientation + the compass HUD (the daylight/shadow
   sim). A bad wrap on a negative/≥360 input silently mis-rotates the whole scene's sun. **S · MED-HIGH.**
3. **R3-FEAT-1** — Persistent / cross-plan clipboard: `clipboardSlice` is session-only, so copy in
   one design and paste into another (or after reload) doesn't work. Mirror `favouritesSlice`'s
   localStorage self-persist. Coohom/Planner 5D "my items". **S · MED.**
4. **R3-FEAT-2** — Curated colour-palette preset gallery: the per-room/master palette *mechanism*
   exists (`colorPaletteSlice`) but there's no one-click curated theme. Static preset list + picker
   calling `setRoomPalette`/`setMasterPalette`. Coohom/Planner 5D style themes. **S · MED.**
5. **R3-REFAC-1** — `App.tsx` is 1163 lines with ~487 lines of inline keyboard/hotkey orchestration
   (three blocks). Extract to `controls/useAppHotkeys` (+ `useNudge`). Root `CLAUDE.md` forbids
   monolithic files; unflagged by both prior audits. **M · MED.**

---

## Axis 1 — Untested critical logic

### R3-TEST-1 — `floorplan/templates/shared.ts` geometry helpers untested · S · value: HIGH
**What's untested.** No test imports `templates/shared` (`templates.test.ts` asserts only coarse
whole-plan invariants — counts, positive areas, unique ids, opening→wall integrity — never the
coordinate math). Yet `hdb.ts` and `condo.ts` build every starter plan from these pure helpers:
- `perimeter(prefix, W, D)` (`shared.ts:8-20`) — four external walls inset by exactly `T=0.1`,
  ordered N/E/S/W, closing back to the start corner. An off-by-`T` inset or wrong corner order
  corrupts wall lengths / room fit on all 18+ templates.
- `room` (`:33-43`), `door`/`window` (`:26-31`, default widths + sill/head), `parapet` (`:48-50`,
  `topHeight=1.0`), `iwall` (`:22-24`).
**Why critical.** This is the geometry that seeds the shell of every new HDB/condo project — the
entry point of the design loop — and `src/floorplan/CLAUDE.md` explicitly mandates "Geometry stays
pure + unit-tested here." A silent regression here mis-shapes every starter plan.
**Concrete test.** New `templates/shared.test.ts` (zero-dep): `perimeter('p',4,3)` → 4 `external`
walls, first `{start:[0.1,0.1], end:[3.9,0.1]}`, last (`-w`) closes to `[0.1,0.1]`; `door`/`window`
carry the documented sill/head defaults; `parapet` sets `topHeight` + `internal`; `iwall` is
`internal`.

### R3-TEST-2 — `state/slices/orientationSlice.ts` `normalize`/`setOrientationDeg` untested · S · value: MED-HIGH
**What's untested.** No `orientationSlice.test.ts`. Every test touching this field sets the raw
`orientationDeg` via `setState` (`skyRebuild.test.ts`, `autosave.test.ts`) — the `setOrientationDeg`
action and its `normalize()` modulo-wrap (`orientationSlice.ts:9-12,20`) are never invoked.
**Why critical.** `orientationDeg` is the home's north/compass rotation, consumed by the compass HUD
(`ui/compassHeading.ts`) and the sun/sky rig (`scene/lighting/skyRebuild.ts`) — i.e. it drives the
daylight/shadow simulation, a core visual design loop. A wrong wrap on a negative or ≥360 input
silently rotates the whole scene's sun.
**Concrete test.** New `orientationSlice.test.ts`: drive `setOrientationDeg` on a store harness and
assert `-90 → 270`, `450 → 90`, `360 → 0`, `0 → 0`.

### R3-TEST-3 — `calloutsSlice.ts` / `badgesSlice.ts` localStorage guards untested · S · value: MED-LOW
**What's untested.** Neither slice has a test, and nothing references `dismissCallout`,
`markBadgeSeen`, `dismissedCallouts`, or `seenBadges`. The uncovered logic is real defensive code:
`loadDismissed`/`loadSeen` (`:19-28`) do `try/catch` + `Array.isArray` +
`.filter((x): x is string => typeof x === 'string')` against corrupt localStorage, plus a
dedup-before-persist guard bounding list growth (`:44-49`).
**Why critical (bounded).** Lower reach — these are per-device onboarding-dismissal lists, not saved
design data — but a corrupt-storage regression would silently reset or throw in the "NEW" badge /
info-callout system (which the UI/UX-polish program invested in). Cheap to lock down.
**Concrete test.** Seed `localStorage` with `'{"a":1}'` and `'["x",5,"y"]'` → `loadDismissed()`
returns `[]` / `['x','y']`; `dismissCallout('x')` twice persists a single `['x']`.

*(Verified already-covered, do NOT re-propose: `layout/autoArrange.ts`, `ui/report.ts` +
`ui/reportData.ts`, `features/planShare.ts`, `layout/alignDistribute.ts`, and the four
array-placement modules `duplicatePlacement`/`arrayPlacement`/`radialArray`/`pathArray` all have
colocated tests exercising their exports.)*

---

## Axis 2 — Refactor of a remaining monolith

### R3-REFAC-1 — `App.tsx` (1163 lines) holds ~487 lines of inline keyboard orchestration · M · value: MED · risk: low
**Why it matters.** Root `CLAUDE.md` forbids monolithic files. After the InspectorPanel (REFAC-1,
shipped) and FloorPlanEditor (REFAC-2/MOD-FPE-SPLIT, in progress) splits, `App.tsx` is the largest
remaining un-flagged monolith, and ~42% of it is keyboard/hotkey plumbing in three blocks:
- global ⌘K / undo-redo / `?`-shortcuts effect (`App.tsx:225-362`, ~137 lines),
- the editor-scoped `onKey` `useCallback` dispatched via `useKeyboard` (`:586-800`, ~214 lines) —
  camera-mode, time cycle, walk-interact, tool keys, copy/paste, duplicate, etc.,
- the arrow-key nudge `keydown` effect with its coalescing/hold logic (`:811-947`, ~136 lines).
**Where.** `src/App.tsx`.
**Fix.** Extract to `controls/useAppHotkeys.ts` (global + editor dispatch) and `controls/useNudge.ts`
(the nudge effect), leaving `App.tsx` to compose them — behaviour-preserving, incremental (one hook
per commit), and it makes the hotkey logic unit-testable in isolation (there is no `App.test`). The
`controls/` folder already owns `keybindings.ts`/`useKeyboard.ts`/`modalGuard.ts`, so this is the
natural home.
**Risk.** Low if each extraction is verified interactively (mirror the InspectorPanel/FloorPlanEditor
split discipline); watch the modal-guard + `isEditableTarget` gates and the `'nudge'` coalesce key.

---

## Axis 3 — Competitor-parity features (client-doable, confirmed absent)

A broad parity sweep this pass found the app already ships almost every candidate (history panel
`ui/HistoryPanel.tsx` + `jumpHistory`; shortcut cheat-sheet `ui/ShortcutsModal.tsx` on `?`; room
area/perimeter `analysis/planStatistics.ts` + `RoomInspector`; favourites/recents/search in the
catalog; copy-paste `clipboardSlice`; arrow-nudge; room palette `colorPaletteSlice`; item lock
`item.locked`; align/distribute `layout/alignDistribute.ts`). Only these three genuine gaps remain.

### R3-FEAT-1 — Persistent / cross-plan clipboard paste · S · value: MED · risk: low
**Absent.** `state/slices/clipboardSlice.ts` is explicitly session-only ("Not persisted"). Copy
furniture in one saved design and paste into a different `.sofa.json` (or after a reload) does not
work — only within-session cross-room paste does.
**Who has it.** Coohom / Planner 5D keep a persistent "my items" clipboard across projects/sessions.
**Where it'd live.** Self-persist the `clipboard` entry array to localStorage, mirroring the
`favouritesSlice`/`recentSlice` self-persist pattern documented in `state/CLAUDE.md` (keys like
`hdb_recent_items`). Paste then resolves each entry's `defId` against the current catalog (already
guarded — unknown defs render inert). Pro tier.
**Risk.** Low — clipboard entries are already a serializable per-item array; just add
load-on-boot + write-on-copy. Keep it out of the save-schema/autosave watch-list (it's per-device
convenience state, like favourites).

### R3-FEAT-2 — Curated colour-palette preset gallery · S · value: MED · risk: low
**Absent.** The per-room/master palette *mechanism* is fully built (`colorPaletteSlice.ts`:
`masterPalette`, `roomPalettes`, `setRoomPalette`/`setMasterPalette`, `effectivePalette`), but there
is **no gallery of curated palettes to apply in one click** (no `preset` match in any `*palette*`
file). Users must hand-pick every swatch.
**Who has it.** Coohom / Planner 5D ship one-click "style/colour themes"; Decoratly/Spoak lean on
curated palettes as the fast styling path.
**Where it'd live.** A static curated preset list (e.g. `ui/palettePresets.ts` — Scandi, Muji-warm,
HDB-BTO-neutral, Peranakan-accent, …) surfaced as a picker in the existing colour-palette UI that
calls `setMasterPalette` / `setRoomPalette` (one undo step). No backend, no assets — pure data + a
picker. Pairs with the existing style-quiz onboarding. Pro tier.
**Risk.** Low — reuses the existing palette write path; palettes are just colour tuples.

### R3-FEAT-3 — Orthographic / isometric ("axonometric") camera view · M · value: MED · risk: med
**Absent.** `OrbitCamera.tsx:491` carries an explicit "Orthographic fallback — not currently used"
branch; grep for `isometric`/`axonometric`/`OrthographicCamera` finds no exposed feature. The app
only ever renders in perspective.
**Who has it.** SketchUp (Parallel Projection / iso views), Sweet Home 3D (aerial), Planner 5D — a
parallel-projection / isometric "dollhouse" view is a standard planner deliverable: true-scale,
no perspective distortion, ideal for clean presentation exports and reading a plan in 3D.
**Where it'd live.** A `orthoView` toggle that swaps the orbit camera to an `OrthographicCamera`
(or flips the existing R3F camera's `zoom`/frustum) and optionally snaps to a 45°/35.264° isometric
pose, alongside the existing `verticalLock`/DoF camera framing cluster (`scene/cameras/`). Persist
per-device via `qualityPrefs` like `verticalLock`. Pro tier.
**Risk.** Med — a projection swap needs a visual-verification pass (shadows, gizmo/marquee raycasting,
OrbitControls zoom semantics all differ under ortho); contain behind a toggle that falls back to
perspective, and reuse the FEAT-D verticalLock verification playbook.

---

## New reference apps
No genuinely-new *client-doable* reference app surfaced this pass beyond those already in
`REFERENCES.md`. The feature ideas above are grounded in apps already listed (Coohom, Planner 5D,
Sweet Home 3D) plus the universal SketchUp parallel-projection norm.
</content>
