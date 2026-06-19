# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit. The pre-C251 history (C1–C250) was
pruned from `main`; entries from C251 on (branch
`claude/codebase-analysis-optimization-ny3xm9`) are kept here. See `TASKS.md` for the backlog.

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

