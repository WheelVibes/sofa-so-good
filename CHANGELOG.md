# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit. The pre-C251 history (C1–C250) was
pruned from `main`; entries from C251 on (branch
`claude/codebase-analysis-optimization-ny3xm9`) are kept here. See `TASKS.md` for the backlog.

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

