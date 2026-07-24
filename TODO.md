# TODO

Deferred-work log — **open items only**. `CHANGELOG.md` is the source of truth for what shipped;
when an item ships it is **removed from this file entirely**. Maintainability refactors live in
`TASKS.md`.

## New default floor plan (v0.23.1.0, 2026-07-23)
- [ ] **`socialLounge` preset: TV cluster sits over the L/D east window.** The new plan put the
  main window band on the L/D east wall; every other preset moved its media wall to the solid
  west partition, but socialLounge's windowless wall is fully occupied by its conversation
  grouping, so its wall-mounted TV was left on the (now windowed) east wall as a documented
  judgment call. Visually review in 3D and either restage the grouping or accept as a
  feature-panel look.
- [ ] **Default-plan interior windows not modeled.** The source plan (`assets/floor_plan/
  default.png`) shows two small glazed panels on the service-yard/kitchen partition flanking
  the SY door; skipped in the constants rewrite (internal windows are supported by the plan
  model — add if the kitchen reads too closed off).
- [ ] **Per-room skirting nuance (SNV spec, deferred from v0.23.1.5).** The spec sheet gives
  vinyl rooms a laminated UPVC skirting (rendered — the existing white strip is a fine stand-in),
  a TILE skirting at the service yard, and NO skirting in the wall-tiled kitchen/baths (wall
  tiles run to the floor). `Skirting.tsx` is wall-based, not room-aware, so all walls currently
  get the UPVC strip; making it room-aware (drop strips on bath/kitchen faces, tile-look at the
  SY) needs a wall-face→room resolution pass — small visual payoff, deferred.
- [ ] **Plan's discrete black structural COLUMNS not modeled.** Only `wall-ext-S`'s full-run 300 mm
  thickening (kitchen/SY south band) is in. The official plan also shows discrete black structural
  patches at several corners/jogs (NE corner, NE notch, the SE jog) that read as columns, not a
  thickened wall run — these are still modeled at the flat's normal 200 mm gauge. Needs a real
  column primitive (or a short thick wall-stub pass at each patch) rather than another whole-wall
  `thicknessM` override.

## Mobile audit round (2026-07-19)
> Mobile-depth UX audit at 390×844 + `SHOT_TOUCH`. Full report + shots:
> `docs/research/2026-07-19-mobile-audit.md`. P1=0, P2=3 (1 fixed inline), P3=4.
> No breakage; no horizontal scroll leak anywhere. RM3/RM4 confirmed fixed the
> desktop audit's P2-3 (default now scores 76/100, Clearance 100, 0 BLOCKING).
- [x] **MOB-P2-1 — mobile tap-target pass 2 for editing bottom-sheets (DONE).** Extended
  the `.m-detail` 44px lift via shared token rules in `responsive.css` (all `body.mobile`-
  scoped): `.seg button { min-height:44px }` covers finish Floor/Walls/Ceiling, share
  Post/Square/Story, drawings Elevations/Lighting + the 26 wrapped Wall N chips; catalog
  chrome (`.catalog .chip/.tab/.pager button/.cat-search .input/.cat-foot .btn`) lifted
  too. Verified by touch sweeps (`tap-pass-verify.json`, SHOT_TOUCH, 390×844): catalog
  chips/tabs/pager/search all gone from the sub-44px list; finish/share tabs gone;
  drawings sweep clean ("all ≥44px"). Desktop unchanged (chip 32/tab 36/pager 25/search 36).
- [x] **MOB-P2-2 — 2D plan-editor toolbar sub-44px on mobile (DONE).** `body.mobile`
  rules: `.seg button` (View/Edit + Undo/Redo → 44px tall), `.plan-header .btn` (Done/
  Furnish), `.level-menu > .btn` (Floors), and a `.plan-header .brand-dot::after`
  inset:-6px hit-expander (Return-to-orbit 32→44). Undo/Redo lifted by HEIGHT only (no
  overlapping horizontal expanders between the two adjacent icons, per the GLB-designer
  caveat). Sweep after fix: only the one-time InfoCallout dismiss X remains sub-44.
- [x] **MOB-P2-3 — Handover/DLP checklist tap targets (FIXED INLINE).** `body.mobile
  .ho-check` → 44px rows + 22px checkbox (`responsive.css`). Was ~20px rows / 15px native
  checkbox for a 79-item tick-off-on-collection-day list. Verified `60-handover-checklist-44px.png`.
- [x] **MOB-P3-1 — Scene MOOD row clips "Romantic"→"Roman…" (DONE).** Root cause: the
  mobile `SceneSection` mood `Segmented` was missing the `mood-seg` class the desktop
  Scene menu carries, so `.m-detail .seg button { flex:1 1 0 }` forced equal 1/5 widths +
  `.seg.fit` ellipsis. Fix: added `className="mood-seg"` + a `body.mobile
  .m-detail .mood-seg button { flex:1 1 auto }` rule (content-width basis, then grow, wraps
  if needed). Full word "Romantic" now shows; all 5 chips ≥44px both dims. Desktop
  unchanged (label kept as "Romantic", no shortLabel change).
- [ ] **MOB-P3-2 — MEP socket marker overlaps room label** at phone zoom (= desktop P2-1,
  MepLayer `+16` vs RoomsLayer 3-line block; needs the coordinated two-layer fix). Socket
  captions themselves ARE legible on mobile. Shot: `06-25-plan-mep-point.png`.
- [x] **MOB-P3-3 — hackability overlay IS reachable on mobile (VERIFIED, no code change).**
  It lives in Plan tools sheet → **View** (Eye rail) section, rendered by the same shared
  `PlanViewMenuActions` fragment as the desktop "View ▾" menu (flag-gated `fHackability`,
  Pro tier). The audit's `06-55-plan-tools-menu.png` only showed the Plan rail section; the
  toggle is one rail tap away under Eye. Confirmed visually (`13-plan-tools-view-hackability.png`
  shows the "Hackability" button beside Labels/Dims/Furniture/MEP/Skeleton/Export PNG).
- [ ] **MOB-P3-4 — Handover "Key collection / TOP date" still native `<input type=date>`**
  (US mm/dd/yyyy in US-locale browser; mitigated by a "Format:" caption). Move to the custom
  control per ui/CLAUDE.md. (= desktop P3-6, partially addressed.) Shot: `08-37-handover-dlp.png`.

## Active — SG-authentic presets, defaults & room categories (user request 2026-07-19)
> User directive: (1) default layouts + presets must truly reflect modern SG homes;
> (2) placement must be sound — orientation, grouping, never obstructing doors/windows/
> fittings; (3) room-appropriate furniture types, styles, colours, customizations per preset
> theme; (4) rooms get explicit CATEGORIES (living/dining, bedroom, toilet, kitchen, …),
> USER-SETTABLE per room in the floor-plan editor, consumed by presets for furniture +
> placement suggestions. Plan: `docs/research/2026-07-19-sg-presets-room-categories-plan.md`
> — implement in rounds: RM1 room-category model + editor UI; RM2 preset refresh (SG themes,
> per-room sets); RM3 placement soundness hardening; RM4 default-layout refresh.
- [x] **RM1 — room categories (foundation).** `PlanRoom.category?`/`RoomCategory` (13 values) +
  `floorplan/roomCategory.ts` resolver (`roomCategory`/`roomCategoryFromName`/`toRoomKind`/
  `toArrangeKind`) + `RoomInspector` "Room type" Select + migrated consumers (CatalogDrawer
  room-aware landing, EmptyRoomHint starters, `furnishPlan.kitForRoom`, `autoArrange`
  room-kind resolution) + seeded HDB/condo templates. See `docs/ARCHITECTURE.md`. **RM1-tail
  DONE:** the five deferred consumers (suggestions, roomLux, planStatistics, handoverChecklist,
  electricalSchedule) + designChatContext + resetSlice now resolve through `roomCategory` too —
  byte-identical name inference, explicit category honoured, and suggestions maps
  serviceYard/storeroom to a local `'utility'` kind (no more bogus "add outdoor seating" for a
  household shelter).
- [x] **RM2 — preset refresh** (v0.22.2.65: SG 2025-26 theme gallery incl. Modern Luxe/Quiet
  Luxury + Peranakan Accent, per-category kits incl. serviceYard/foyer/storeroom,
  `LayoutPreset.categoryStyle`/`kits`/`paletteId`, palette linking on apply).
- [x] **RM3 — placement soundness** (v0.22.2.66-67: window-sill keep-out + balcony-slider hard
  keep-out, bed headboard/foot-to-door scoring, armchair grouping, dining↔kitchen adjacency,
  door APPROACH strips both sides + keep-outs for fixed-kind defs, all-templates
  `placementSoundness.test.ts` property test 19/19).
- [x] **RM4 — default layout refresh** (modern SG 4-room BTO move-in default). Master =
  centred queen + 2 matching nightstands + sliding wardrobe; bedroom 2 = kids/guest (bed +
  nightstand + sliding wardrobe, no desk); bedroom 3 = study/flexi (daybed + desk + office
  chair + monitor + bookshelf); living/dining = sofa+ottoman lounge + 1.8 m TV console + living
  curtains, main-door→kitchen path kept clear; galley kitchen with washer already in the service
  yard; Modern Contemporary styling via the retuned `moveIn` preset (RM2). Reshaped the two
  template rooms the property test flagged as too shallow: `c3-master` → 3.7×2.7 m (fits a queen
  clear of the ensuite door) and `g3-bed3` → 3.0×2.4 m; both now furnish WITH a bed, pinned by
  new assertions in `placementSoundness.test.ts` (21/21).

## Active — SG catalog expansion (user request 2026-07-19; research-ranked)
> Research verdict: most SG staples already covered (shoe cabinet, ceiling fan, vinyl floor,
> terrazzo/checker, fluted panels, rattan, storage beds, WFH desks, bar pieces — verified, don't
> re-propose). Genuine gaps, cited (Qanvast/LemonFridge/RCS/Livspace 2026 trend sources):
- [x] **CAT-A materials round** (DONE 2026-07-19) — all procedural/CC0, unit-tested, visually verified:
  - [x] Peranakan/Nyonya majolica tile — new `pattern: 'peranakan'` (`patterns/tile.ts:peranakanFields`,
    matte encaustic) + jade/cobalt/rose floor + jade/cobalt wall-accent catalog entries.
  - [x] Bouclé fabric — `getBoucleMaterial` (nubby loop normal) + `getUpholsteryMaterial('boucle')`
    + seating `material` enum option.
  - [x] Sintered-stone worktop — `worktopFinish` enum option (kitchen island + counter) →
    `getSurfaceMaterial('sintered')` (satin stone).
  - [x] Brushed gold/brass — `brushed-brass` `MetalFinish` preset (mirrors `black-steel`) +
    `getSurfaceMaterial('brass')` + side-table top-finish option. Hardcoded brass hardware in the
    primitives (BarCart / TowelLadder / AltarCabinet / Vanity / Sideboard) re-routed through the
    `brass` helper — same warm-brass tone (done 2026-07-19, opening-variants round 2 ride-along).
  - [x] Heritage checkerboard jade/cobalt colourways (reuse `checker` painter).
  - [x] Limewash wall finish — VERIFY VERDICT: a microcement variant existed (`concrete` pattern) but
    no true limewash, so a dedicated `pattern: 'limewash'` (`patterns/wall.ts:limewashFields`, cloudy
    mineral wash) was added + white/greige/clay/terracotta colourways.
- [x] **CAT-B furniture round** (S/M) — shipped 2026-07-19:
  - [x] Extendable dining table — `leaf` enum on `dining-table-4` (rect only); the shared
    `diningLeafExtension` widens BOTH the rendered top (+ two centre-leaf seams) and the def's
    `footprintParts` in lock-step (round/oval never extend).
  - [x] Altar/prayer cabinet — new `AltarCabinet` primitive + `altar-cabinet` def (storage): two-tier
    (lower doors/drawers cabinet on a recessed plinth + raised open display shelf w/ canopy);
    keywords altar/prayer/ancestral/shrine/deity/joss.
  - [x] Banquette/built-in bench — new `Banquette` primitive + `banquette` def (seating): upholstered
    plinth + seat cushion + tufted backrest (wall side); `material` enum incl. bouclé.
  - [x] Hydraulic-lift storage bed — `baseStyle: 'hydraulic'` on all bed defs; legless ottoman base
    (floor plinth + inset lift deck reveal seam + satin gas-strut hint).
  - [x] Wall-mounted water heater — new `WaterHeater` primitive + `water-heater` def (bathroom,
    `mounted`): enamel box + temp dial + indicator + pipe drops; keywords water heater/geyser/joven.
  - [x] Fluted glass partition — new `FlutedPartition` primitive + `fluted-partition` def (decor):
    framed floor screen, translucent fluted (half-round glass ribs via `slatLayout` battens +
    `getGlassMaterial`).
  - Tests: `primitives/catBFurniture.test.tsx` (structural soundness + leaf-footprint maths);
    covered by the whole-catalog `structuralSoundness.test.tsx` too. Scenario:
    `scripts/scenarios/catb-furniture-r11.json` (product-shot ladder, visually reviewed).
- Skip rulings: undermount sink (prop variant not worth a primitive), KompacPlus branding
  (generic laminate covers it), brand ceiling fans, aircon (exists as MEP).
- [x] **Opening variants round 2** (DONE 2026-07-19) — two more SG door styles on `PlanOpening.style`:
  - [x] **Sliding** door — 3D leaf TRANSLATES along the wall (barn-door style, proud of the wall on
    the room side; parks over the roomier adjacent segment), no swing; 2D symbol = leaf bar + slide
    arrow, NO arc; keep-out = none (only the both-sides approach strip).
  - [x] **Double** door — two half-width leaves hinged at both jambs swinging the same side (mirror
    rotations); 2D symbol = two quarter-arcs; keep-out = a conservative full-width swing rect.
  - Shared 2D symbol builder `doorSwing.ts:doorPlanSymbol` consumed by `OpeningsLayer` + `reportPlanSvg`
    (DXF + door schedule stay style-agnostic, as before). `style` kept a free string in `types.ts` +
    `schema.ts` (documented value list in parity, no version bump). Inspector Style select + user doc +
    `src/floorplan/CLAUDE.md` updated. Tests: `doorSwing.test.ts` (predicates/symbol/keep-out) +
    `doorMaterial.test.ts` (sliding/double → painted). Scenarios: `opening-variants-r2-{sliding,double,
    plan2d}.json` — closed+open 3D + 2D editor symbols, reviewed on GPU.

## Active — contractor-handover accuracy & documentation (2026-07-18, user goal)
> The app's purpose: homeowners design/plan/customize themselves, then hand over DIRECTLY to
> contractors — so output must be dimensioned, to-scale, accurate, precise, detailed enough to
> build from, following professional designer→contractor practice. Research:
> `docs/research/2026-07-18-contractor-handover-research.md` (canonical drawing set, conventions,
> SG/HDB specifics). Audit verdict (2026-07-18): geometry engine + drawing-set scaffolding are
> ~70-80% there; gaps concentrated below, ranked by contractor credibility impact.
- *(Precision substrate, ride-along: mm display precision option in `measurement.ts`; bbox
  footprint caveat already tracked under Risks.)*
> Direction (user, 2026-07-01): prioritise the **core interior-design loop + its UX,
> discoverability, customizability** (furnish, arrange, finish, view) on desktop **and** mobile,
> researching `REFERENCES.md`; then reliability/edge-cases, a11y, and test-coverage hardening.
> Avoid pricing/quotes/analytics deliverables unless asked.

### Contractor re-review (2026-07-19)
> Full end-to-end re-review of the handover package (drawing set + DXF) on two non-default plans
> (single-storey HDB 5-Room + multi-storey Landed Terrace). Verdict: **ship it**. Schedule ↔
> on-plan marks ↔ DXF verified consistent single- AND multi-storey; 8 dimensions spot-checked
> numerically. Full write-up + screenshot refs: `docs/research/2026-07-19-contractor-re-review.md`.
- **[P1 — DONE 2026-07-19] Demolition sheet under-flagged rc-partition demolition.** Only
  `load-bearing` escalated to "NOT PERMITTED"; an `rc-partition` (RC partition) demolition rendered
  as a routine partition removal, contradicting the hackability overlay + wall-delete guard.
  Fixed: `demolitionPlanSvg.ts` now reuses `wallHackability.isDemolitionRestricted` so all three
  surfaces share one classifier; wording → "structural (load-bearing / RC)"; +regression test.
- **[P2 — DONE 2026-07-19] Main-entrance door resolves to "Unassigned" / single room.** Fixed in
  `analysis/openingSchedule.ts`: the room probe now reports how many sides resolved + whether the
  host wall is external, so a DOOR onto the outside reads as an entrance — "<Room> (entry)" when
  one interior room resolves (Terrace "ct-main" → "Service Yard (entry)"), "External (entry)" when
  no interior room resolves on a perimeter wall (5-Room main door, previously "Unassigned").
  Windows keep their existing single-room / "Unassigned" behaviour. Shared `openingRoomsLabel`
  renders the schedule sheet + report identically. +Regression tests (perimeter entry door,
  internal door, exterior window, fully-unresolvable opening).
- **[P2 — DONE 2026-07-19] Grouped door mark spans many rooms across storeys.** Fixed
  (presentation only — grouping/marks unchanged): `OpeningMark.roomsByLevel` records the rooms
  per storey ground-first, and `openingRoomsLabel` groups a multi-storey mark's Rooms cell by
  storey ("Ground floor: … · Upper storey: …") on both the schedule sheet + report. Verified on
  the Terrace (D2 ×4 → "Ground floor: Living, Powder Room · Upper storey: Bedroom 2, Bedroom 3,
  Master Bedroom, Stair Landing"). +Regression test.
- **[P3 — DONE 2026-07-19] GA floor-plan label/furniture overlap.** `ui/reportPlanSvg.ts` room
  labels now ride a deterministic near-white backing plate (a text halo sized from the label's own
  text, drawn under the ink) so name/area read cleanly over indicative furniture footprints.
- **[P3 — DONE 2026-07-19] MEP/RCP symbols small at A4 1:100/1:125.** `drawingScale.ts`
  `symbolPrintScale` bumps the fixed-px electrical/plumbing/RCP symbols up to a
  `MIN_SYMBOL_PRINT_MM` printed floor at small formats (no-op on screen / larger paper). No
  `mepLabelLayout` declutter regression (targeted tests green).
- **[P3 — DONE 2026-07-19] Door swing on wall elevations.** `ui/elevation/elevationSvg.ts` now
  draws the conventional ELEVATION swing symbol — a dashed hinge-apex triangle (two, meeting
  mid-leaf, for a double door) — instead of the unconventional plan quarter-arc, and ONLY for
  swinging leaves (a slider gets none). +Regression test (marker present for panel, absent for
  sliding, ×2 for double).

## Active — graphics-tier performance optimization (2026-07-08, user goal)
Systematically speed up frame processing/rendering **without sacrificing visual quality**, focused
on the heavy **Maximum** tier (also opportunistic wins on other tiers). Shipped work lives in
`CHANGELOG.md` (PERF-MAX-* entries) — this section tracks only **open** items.

**Methodology.** (2026-07-11: the environment NOW HAS a real GPU — `SHOT_GPU=1` — so absolute
verification is possible; the notes below describe the original software-WebGL constraints.)
Sandbox had no GPU (Maximum never finishes warming under software WebGL), so
changes are validated by code analysis + software-WebGL relative harnesses — `scripts/perf-orbit.mjs`
(relative FPS) and `scripts/perf-drawcalls.mjs` (deterministic per-frame draw-call/triangle counts),
both driving a continuous autoRotate span at a pinned tier — never by absolute numbers. All shipped
changes so far are tier-independent, so day→night tint sampled from the live canvas at medium/high is
the representative regression check. Structural note: SSAO/bloom/DoF are **camera-dependent** (only
run when something moves — no idle waste to reclaim); shadows were the uniquely freezable per-frame
GPU-pass cost (shipped). Remaining Maximum costs (full-res N8AO, DPR 2, 12 fixture lights,
geometryDetail 1.8, envResolution 256) are deliberate quality knobs — reducing any sacrifices quality
(out of scope). The CPU-side per-frame waste (readbacks, redundant recomputes/allocations) + the
discrete-edit shadow re-render have all been reclaimed (PERF-MAX-1..5). **No open items** — the
zero-regression-risk frontier for this goal is reached; the parked findings below record what was
evaluated and deliberately not done, so we don't re-investigate.

**GPU-STARVE shipped (v0.23.1.13, 2026-07-24).** The "random white flashes while panning at
Maximum" report was the OS GPU watchdog (~2 s Windows TDR) resetting the driver on a >2 s pan
frame → WebGL context loss → blank-white canvas until restore. Fixed by (1) the interactive
resolution degrade (`interactiveDegrade` flag: half DPR during camera gestures + for 3 s after
any >250 ms frame, `scene/interactiveDegrade.ts`) and (2) the context-restore rebuild in
`ContextLossGuard` (shadow pulse + `contextRestoreSignal` env re-bake + frame-counted pump
hold). Known intended behaviour: on a GPU that genuinely can't render Maximum interactively,
the governor holds/oscillates at half resolution (a full-DPR frame is retried every 3 s) —
that IS the fix; don't "optimize" the oscillation away by pinning full DPR. Deferred: walk-mode
WASD motion has no gesture signal (covered only by the long-frame governor); wire
`FirstPersonCamera` movement into `cameraMotionSignal` if walk-mode flashes are ever reported.

### Investigated + parked (findings recorded so we don't re-investigate)
- **PERF6 tail — antialias/preserveDrawingBuffer context-attr toggle: REJECTED, no recreate
  (2026-07-11, real-GPU verified).** Both are hardcoded `true` in the Scene + RoomEditor Canvas
  `gl` props; never plumbed into `QualitySettings` and never UI-exposed (the "…+ antialiasing"
  toggle maps to `postprocessing`/SMAA, not the canvas attribute — no silent no-op bug exists).
  Real-GPU probe (ANGLE D3D12 Intel UHD) confirms the context is created ONCE (attributes
  identical across tiers → no runtime toggle without a context recreate/flash) and the default
  framebuffer is 4× MSAA at every tier. On Performance/Medium that MSAA is the *sole* AA
  (load-bearing); on High/Max the composer renders offscreen + SMAA so it's redundant — but
  reclaiming it needs a recreate flash on the Medium↔High boundary for a saving that measured
  UNDER the noise floor (`antialias:false` at Performance gave no FPS gain). `preserveDrawingBuffer`
  stays (Record, already BLOCKED above). Revisit only if tier switches ever remount the Canvas
  for another reason.
- **P2 memoization audit — CLEAN, no changes (2026-07-11).** Render-count probes on the 13 hot
  scene components across orbit/drag/time-scrub: orbit = 0 React re-renders (camera pose flows
  through `cameras/cameraForward.ts` signals, not the store); a furniture drag re-renders ONLY the
  moved `Furniture` instance (the memo comparator holds; `useCatalog` keeps `def` reference-stable
  across drags — documented prior fix); time scrub re-renders only the 4 sun-dependent components.
  Selector sweep found no unstable-object selectors on hot paths (the plain `s.items` subscribers
  are single-field = reference-stable; adding `useShallow` there would cost an 81-element compare
  for identical behaviour — leave them). Don't re-audit without new evidence of churn.
- **`preserveDrawingBuffer: true` always-on — BLOCKED by the Record feature.** The PNG export path
  (`ScreenshotController`) already renders on-demand + reads back synchronously, so it does NOT
  need it. But `RecordController` uses `captureStream(0)` + `track.requestFrame()` from a `useFrame`
  that runs BEFORE r3f's render, so it captures the *previous* frame's buffer — which is only
  reliable with the buffer preserved. A context attribute can't be toggled at runtime, so removing
  it safely needs a render-after-`requestFrame` refactor (positive `renderPriority` manual render),
  and `.webm` output can't be verified in headless swiftshader. Not worth the regression risk.
- **Skip the Bloom pass when its intensity is 0 — NOT a clean win.** `bloomIntensityForDay =
  intensity·(1−dayLevel)` is exactly 0 only at the solar-noon peak; it's a small nonzero for most
  of the day, so unmounting Bloom would change the image except in a narrow window (and the
  mount/unmount recompiles the EffectPass = a hitch). Rejected.
- **Dedup the per-wall `camera.getWorldDirection` in wall-reveal — NOT worth it.** Each wall
  segment's per-frame `useWallReveal`/`WallSegment` recomputes the camera world direction
  (`getWorldDirection(FWD)`), so a plan with ~20-40 walls repeats it 20-40×/frame; `cameraForward.ts`
  already publishes the camera forward once/frame. But `cameraForwardXZ` is pre-**normalised** (len 1)
  and `facingToward`'s `len < 0.15` top-down guard (keeps walls solid looking straight down) relies on
  the raw un-normalised XZ magnitude — feeding the normalised vector defeats the guard → walls fade at
  top-down (visual regression). Safe dedup would need `cameraForward` to also publish the raw XZ
  forward; the gain is a handful of cheap matrix reads/frame. Marginal value vs the added coupling —
  parked.

### R11 GPU-additions regression check (2026-07-19)
Relative draw-call/triangle sweep on this session's GPU-relevant additions (parametric roof,
staircase, zebra/roman blinds, invisible grilles, fluted partition, door leaves, hackability
overlay). Harness: `scripts/perf-drawcalls.mjs` (baseline) + a sibling isolation script driving
the Terrace template with pro flags on, clearing the move-in furniture so the plan+features are
the only variable; scene-graph mesh/instancedMesh tally alongside `gl.info` per-frame calls/tris.
Numbers at `high` tier (frozen-shadow autoRotate span), items cleared:
| state | meshes | instanced | calls/frame | tris/frame |
|---|---|---|---|---|
| Terrace shell, roof OFF | 254 | 0 | 21.6 | 5565 |
| Terrace shell, roof ON | 255 | 0 | 22.4 | 5745 |
| + staircase + zebra blind + fluted partition (before) | 343 | 3 | 33.1 | 7341 |
| + same 3 (after fluted-rib instancing) | 310 | 4 | 29.4 | 7203 |
(baseline furnished 4-room, 82 items: performance 1230 calls/287k tris; high 467.5 calls/127k tris.)

- **Roof = 1 mesh** (`Roof.tsx` `planesGeometry` fan-triangulates all pitched planes into ONE merged
  `BufferGeometry`; +1 mesh each per parapet/dormer). **Proportionate.**
- **Zebra blind** — 2 `InstancedBoxes` buckets + cassette/rail/cord (3 small meshes). **Roman** — 4
  `RoundedBox` folds + 1 panel. **Proportionate** (matches furniture/CLAUDE.md).
- **Fluted partition (FIXED, 2026-07-19)** — the frame was already 1 `InstancedBoxes`, but the ribs
  rendered as **one `<mesh>` per rib** (~33 half-cylinders on a 1.6 m screen). Collapsed to ONE
  `InstancedCylinders` draw call (extended it with `thetaStart`/`thetaLength` for the half-round arc;
  additive, existing callers unchanged). AE=0 equivalence unit-tested (`InstancedBoxes.test.ts`:
  baked unit half-cylinder scaled `[ribR,innerH,ribR]` == old `cylinderGeometry(ribR,ribR,innerH,10,
  1,false,0,PI)` mesh, max vertex error < 1e-6). Measured: −33 meshes, −3.7 calls/frame. Visually
  verified (flutes render identically, no z-fighting).
- **Staircase (DONE, 2026-07-19)** — `staircaseModel.ts:staircaseInstanceBuckets` splits the ~40
  per-part meshes into `risers` (one surface material) + `metal` (post/rail/newel, one brushed-metal
  material) → **2 `InstancedBoxes` draw calls**; `treads`+`landings` stay as `BeveledBox` meshes (no
  instanced beveled primitive; instancing them would drop the light-catching chamfer on the most
  prominent surface — deliberately NOT done, the correct no-op). Rail pitch/roll rake bakes into the
  instance matrix as T·R·S, **AE<1e-6** vs. the old per-mesh `rotation={[pitch,rot,roll]}` across
  straight/spiral/L/U styles (`staircaseModel.test.ts`). Default straight 13-step (side rail): **40
  part-meshes → 13 tread meshes + 2 instanced** (−27 meshes, +2 instanced, −25 in-frustum draw
  calls). Fade-safe: the `Furniture.tsx` per-item ghost path clones each node's material, so it
  applies to the shared instanced material without mutating other staircases. Visual A/B
  (`staircase-r-verify`, GPU): straight close-up **pixel-identical**, L/U rake rails render correctly.
- **Window grille / louvre / invisible-grille (DONE, 2026-07-19)** — each window's members collapse
  to ONE `InstancedMesh` per bucket via pure builders in `windowGrilleLayout.ts`:
  `grilleBarInstances`/`louvreSlatInstances` → one `InstancedBoxes`, `invisibleGrilleCableInstances`
  → one `InstancedCylinders(radialSegments=6)`; consumed by `PlanShell`'s `FadeWindow`. The audit's
  fade caution was resolved by reading the code: **the reveal fade only mutates the glass pane's
  material** (`FadeWindow`'s `ref`) — the bars/cables always had their OWN static materials and were
  **never** faded, so instancing them (one shared material per window, still un-faded) is byte-identical
  to the reveal behaviour. **AE<1e-6** vs. the old per-bar/cable geometry (`windowGrilleLayout.test.ts`).
  Measured (Terrace, items cleared, one grille + one invisible-grille window): the two windows'
  members (12 bars + 19 cables) collapse **31 meshes → 2 draw calls**. Visual A/B
  (`opening-variants-r11-openings`, faded-wall dollhouse, GPU): grille + faded walls render identically
  to the pre-change reference (the small front-wall translucency delta is fade-lerp capture timing,
  not from this change — no code path from grille instancing to wall/glass opacity).
  **Combined deterministic tally** (Terrace shell + staircase + 2 grille windows, items cleared, high
  tier): **336 mesh-nodes → 282** (58 collapsed members → 4 `InstancedMesh` draw-call nodes). Per-frame
  `gl.info` calls are frustum-culling-noisy under swiftshader (~33 calls/frame) — the scene-graph tally
  is the deterministic metric, per the audit methodology.
- **Hackability / MEP SVG overlays (step 5) — NO regression.** `HackabilityLayer`/`MepLayer` are
  gated (`fHackability && showHackability`, default OFF; `fMep && showMep`, a small point set), take
  stable `walls`/`toPx` props (`toPx` from `usePlanViewport`, unchanged across pointer moves), and are
  **not** memoized — but neither is ANY sibling plan layer, so they follow the established pattern and
  add no new per-pointermove re-render blast radius. (Memoizing the static plan layers is a
  pre-existing whole-editor opportunity, not an R11 regression.)

## Active — asset pipeline (2026-07-02, user goal)
See `docs/research/2026-07-02-local-asset-db-and-scraper-plan.md` for the full design.
- **Local dev asset DB (Part 1, in progress).** Drop GLBs in `local-assets/` → auto-loaded into
  the catalog with NO upload pipeline (convert/optimize/IDB). Dev-only Vite plugin
  (`scripts/vite-local-assets.mjs`) serving `/@local-assets/*`, `localAssets` devOnly flag,
  `localAssetsSlice` (`bootstrapLocalAssets`), `LocalGltfDef` source, merged in `catalog.ts`.
- **Scrapers (Part 3).** `research/scrapers/` has 35 working scrapers with complete enumeration;
  finalized tiering in the plan doc. **Poly Haven model fetcher SHIPPED (v0.22.0.6)** —
  `scripts/asset-pipeline/fetch-polyhaven-models.mjs` downloads CC0 gltf bundles and repacks
  self-contained GLBs into `local-assets/<category>/` (11-item curated furniture set fetched,
  verified loading + placing via the Part-1 plugin). **Kenney Furniture Kit fetcher SHIPPED
  (v0.22.2.36)** — `fetch-kenney-models.mjs` extracts 19 curated CC0 GLBs (already
  self-contained, KHR-unlit-preserving optimize pass) into `local-assets/` (30 GLBs total,
  verified in-catalog + placed). Notes: Kenney site search/category pages are useless for
  enumeration — go straight to known pack slugs; Poly Pizza needs an API key (auth gate, not
  rot); **Quaternius is the natural next batch** (CC0, same ZIP shape). Then: surface these in
  prod (`remoteFurniture` flag — needs a runtime fetch/repack path or pre-bundled assets, see
  the production-infra section).

## Open — UX research round 2 queue (2026-07-18)
Ranked by value÷effort; verified absent against registry + source this pass.
- [ ] **WebXR AR hit-test on Android Chrome** (M) — real `immersive-ar` with the in-memory scene
  (no hosted URL needed), closing the iOS-vs-rest asymmetry `viewInAr.ts` documents. **Blocked on
  real-device QA** — cannot be verified in this sandbox; keep the GLB-download fallback.
- [ ] **Voice dictation for the text brief** (S) — platform research DONE (2026-07-18, sourced:
  MDN/caniuse/WebKit/community): **GO, narrowly scoped**, but **DEFERRED until `textBrief` itself
  ships** (it's default-false "not production-ready" — a mic on a hidden feature is dead UI).
  When built: feature-detect `window.SpeechRecognition || webkitSpeechRecognition`, and
  **suppress on iOS standalone/PWA** (`navigator.standalone || matchMedia('(display-mode:
  standalone)')` — the API consistently fails there per multiple sources); Firefox effectively 0%
  (default-off pref); iOS Safari tabs: `continuous` is broken — use `interimResults` +
  silence-gap end detection, expect ~2-3 s post-permission warmup; Chrome/Android is server-based
  (needs network — disable offline; Chrome 139+ has an on-device path via
  `SpeechRecognition.available()`); locale: try `en-SG`, retry `en-GB` on
  `language-not-supported`. Privacy copy must say audio may go to the browser vendor's cloud.
  WASM Whisper fallback rejected for now (40-76 MB + mobile perf). Rides the `textBrief` flag.

- *(Flagged, needs product decision: `budget`/`clearanceChecks`/`textBrief` are simple-TIER but
  default-false "not production-ready" — ship or demote eventually.)*

## Open — UX research round 3 queue (2026-07-18)
Ranked by value÷effort; each verified absent against registry + source. Near-misses confirmed
already-shipped/ruled-out this round (don't re-propose): align/distribute, dollhouse view,
wardrobe configurator (generic parametric), 2D+3D split view (contradicts plan-stays-structural
ruling), AI photo→plan (= aiWalls), shelf-lift gesture (= surfaceDrop).
- [x] **Lighting mood presets** (M, simple) — one-tap Reading/Movie/Entertaining/Romantic row
  adjusting placed fixtures' intensity + colour temperature (Coohom precedent); distinct from
  sun-only sunStudy. Preset table over `itemAsLight`-tagged fixtures in `src/lighting/`.
  Shipped: `lighting/moodPresets.ts` (pure preset table + tint/multiplier), `lightMood` on
  `uiSlice` (persisted via schema/autosave, mirrors `lightsMode`), Scene-menu + mobile Mood row
  gated by the `lightMoodPresets` flag (simple tier), composed in `FurnitureLights.tsx` on top of
  `lightsMode`. Scenario `scripts/scenarios/light-moods-r11.json`.
- [x] **Real-photo paint visualizer** (M, simple) — upload a wall photo, drag a polygon mask,
  composite a finish swatch via canvas blend (no AI seg for v1; Behr/Dulux precedent). Pairs the
  customBackdrop upload path with swatch data. DONE: `paintVisualizer` flag (simple, default on);
  `ui/paintViz/PaintVizModal.tsx` + pure `ui/paintViz/composite.ts` (point-in-polygon + W3C "color"
  luminance-preserving blend); entry via the FinishPicker Walls tab "Try on my wall photo"; fully
  client-side (photo never uploaded); reuses `groups.wall` swatches. Scenario
  `scripts/scenarios/paint-visualizer-simple.json`.
- [x] **Parametric staircase generator** (M/L, pro) — real adjustable stairs (width/rise-run/
  landing/handrail; Homestyler v6 precedent) placed as furniture with a levelId span, feeding the
  existing stairConnectivity advisory. Straight / L / U / spiral `Staircase` primitive
  (`primitives/staircaseModel.ts`), honest L/U `footprintParts`, continuous sloped handrail,
  `parametricStairs` pro flag (hidden in Simple). `isStaircaseItem` recognises it by def id or
  primitive. Scenario `scripts/scenarios/staircase-r-verify.mjs`.
- [x] **Parametric roof + dormers** (L, pro) — roof slab from the outer wall polygon + pitch,
  dormer cutouts; only offered on Maisonette/terrace templates (Homestyler v6 / Live Home 3D).
  Shipped: `FloorPlan.roof` (`PlanRoof`) + pure `floorplan/roofModel.ts` (gable / hip /
  flat-parapet over the top-storey footprint AABB + gable dormers; `rise = halfSpan·tan(pitch)`,
  degenerate → fallback), rendered by `apartment/Roof.tsx` (world-space, fades out when orbiting
  down inside so the interior stays visible, DoubleSide underside in walk). `parametricRoof` pro
  flag; editor UI `ui/floorplan/RoofSettings.tsx` (shown only for landed / multi-level plans);
  Terrace + Maisonette seed a 30° gable. Scenario `scripts/scenarios/parametric-roof.json`. v1
  limitation: roofs the footprint bounding rectangle (documented in `roofModel.ts`).

## UX research round 4 queue (2026-07-19) — ✅ FULLY SHIPPED (R4-1…R4-8)
Ranked by value÷effort; each verified absent against the ~190-flag registry + the SG source
cited. Full write-up: `docs/research/2026-07-19-ux-research-round-4.md`. **Headline: the
competitor sweep found ZERO net-new client-doable features (near-total parity — see below);
all real value is SG-authentic advisories over data the app already holds.** Near-misses
confirmed already-shipped/covered this round (don't re-propose): reno timeline+ICS
(`renoTimeline.ts`), defect/handover checklist (`handoverChecklist.ts` — only DLP *dates*
net-new), wall structure classification + demolition sheet (`PlanWall.structure` +
`demolitionPlan.ts` — only the *live editor overlay* net-new), MEP electrical/plumbing point
placement (`mepEditor`/`electricalPlan`/`plumbingPlan` — only *count/DB advisory* net-new),
HDB/MCST/BCA permit paths (v0.22.2.60), gallery/photo/feature-wall (`wall-art` "Gallery"
variant + `photo-frame-cluster`), parametric K&B (`kitchenCabinets`), 720° tour (`panoTour`),
custom-furniture module (`glbDesigner`), camera-path video (`walkthrough`/`recordViewTour`/
`dayNightClip`), Smart Wizard (`smartStart`/`aiLayout`), 4K/16K render (local path tracer),
imperial/metric units, cover/legend/index sheet, finishes/FF&E/door-window schedules.
- [x] **R4-1 — SG aircon BTU sizing per room** (S, pro) — SHIPPED: `analysis/airconSizing.ts` +
  Cooling-load section in `DaylightPanel`, `airconSizing` flag. Per-room cooling-load badge from
  area × ~50-60 BTU/ft² + modifiers (W/E sun via `orientationDeg`, ceiling >3 m, open
  kitchen) → recommended system size + whole-flat total. Pure formula over existing area +
  orientation, shaped like `daylight.ts`. Absent: no `btu` anywhere.
- [x] **R4-2 — Ceiling-height & false-ceiling clearance validator** (S, pro) — SHIPPED:
  `floorplan/ceilingClearance.ts` + RCP-sheet zone warnings, `ceilingClearance` flag. Checks
  false-ceiling/bulkhead drops (`ceilingDesign`/RCP zones) against SG norms (2.6 m standard,
  ≥2.4 m finished clearance, cornices to 2.1 m) and warns/reports per-zone headroom. Pure
  logic over existing ceiling data. Absent: no ceiling-clearance check.
- [x] **R4-3 — BTO Optional Component Scheme (OCS) starter state** (S/M, simple) — SHIPPED:
  `furniture/ocsStarter.ts` (pure manifest: OCS floor finishes by room id/category + `OCS_BATH_KIT`),
  `resetSlice.applyOcsStarter` + `furnishPlan.furnishOcsItems`, "New BTO (with OCS)" in
  `SmartStartWizard` with the "chosen at booking, can't be added later" note, `ocsStarter` simple
  flag. Seeds the bare OCS handover state (vinyl bedrooms / porcelain living + bath fittings, no
  furniture). Absent: no OCS reference.
- [x] **R4-4 — Electrical points & DB-load advisory** (S, pro) — SHIPPED: `analysis/socketAdvisory.ts`
  + electrical-sheet notes block + MepLayer shortfall tags (reuses `electricalPlan`/`mepEditor`).
  Extends the existing MEP
  layer with per-room recommended socket/data counts (4-room ≈ 25-40) vs placed points +
  shortfall cue + DB 40 A/63 A note. Net-new advisory (placement already ships).
- [x] **R4-5 — Floor-loading / raised-platform advisory** (S, pro) — SHIPPED:
  `analysis/floorLoading.ts` (pure: static kg table for heavy suspects — bathtub/aquarium/stone
  tables/piano/loaded bookcases — density vs 150 kg/m² + raised-platform >50 mm check) + "Floor
  loading" advisory group in `ClearancePanel`, `floorLoading` pro flag. Absent.
- [x] **R4-6 — SG renovation-rules reference pack** (S, pro) — SHIPPED: `floorplan/renoRules.ts`
  (static cited data: 4 sections — wet-area 3-year tile rule, windows & grilles, working-hours/noise,
  permits/DRC checklist) + `RenoRulesPanel` (Tools → Reno rules), `renoRulesPack` pro flag. Dated
  "rules as of 2026". Absent.
- [x] **R4-7 — Live hackability overlay in the 2D plan editor** (S, pro) — SHIPPED:
  `floorplan/wallHackability.ts` + `HackabilityLayer` + View-menu toggle + load-bearing delete
  warning, `hackabilityOverlay` flag. Red/green wall
  tint + inline "NOT PERMITTED / permit required" shown live as the user tags walls, driven
  by the existing `PlanWall.structure`. Net-new editor UX over existing data (currently only
  reaches the demolition sheet).
- [x] **R4-8 — DLP / warranty date tracker** (S, low-med, pro) — SHIPPED:
  `analysis/handoverDates.ts` (pure date math: DLP +1yr, ceiling-leak +5yr, spalling +10yr,
  leap-year-clamped `addYears` + `daysUntil` countdown), extends `buildHandoverChecklist` with a
  "Warranty & defect dates" group, `HandoverPanel` (Tools → Handover & DLP) with a persisted
  `keyCollectionDate` input + countdowns (additive zod + autosave). Rides the `report` flag.

## Blank-slate journey queue (2026-07-19 goal) — ✅ FULLY SHIPPED (BSJ-1…BSJ-8)
> All eight ranked items shipped, including the BSJ-8 3D follow-up. Only the BSJ-2 3D
> trunking route follow-up remains open below — a deliberate deferral with an approach
> sentence; the near-misses list stays as a don't-re-propose record.
> Goal (product owner): serve new SG HDB/condo buyers designing their home fully from a
> blank slate WITHOUT an interior designer. Full walk of bare-handover → fully-designed
> journey + per-stage coverage verdicts + near-misses cleared:
> `docs/research/2026-07-19-blank-slate-gap-analysis.md`. Ranked by how badly each blocks
> the "no ID needed" promise. Each verified absent against the flag registry +
> `analysis/`/`floorplan/`/`furniture/defs/` this pass. All eight shipped (see items below).
- [x] **BSJ-1 — Whole-reno budget allocator (by trade/stage)** (M, simple) — DONE (v0.22.2.x):
  pure `analysis/renovationAllocator.ts` derives a full SG trade breakdown (hacking/tiling/flooring/
  carpentry/ceiling/painting/M&E/aircon/glass/fixtures + contingency + SG benchmark band) from the
  design's own quantities, reusing ONE `PriceRules` card (finish buckets + additive `trades`; BOQ/
  `estimateRenovation` unchanged). Surfaced as `RenovationBudgetPanel` in File → Budget & costs
  (`renoBudget` flag, simple, default on) with CSV export + budget-target compare; rates editable in
  the Quote-template price-rules section. Tests: `renovationAllocator.test.ts` + `renoBudget.test.ts`.
- [x] **BSJ-2 — Aircon SYSTEM planner** (M, pro) — DONE: pure `analysis/airconSystem.ts`
  (`buildAirconSystemPlan`) groups habitable rooms into common/private usage zones → System-2/3/4
  condenser proposals with connected-load %, cited nominal-capacity table + ~130% connection-ratio
  cap, per-system trunking note, two-condenser split (>4 FCUs) and ~110 kg HDB ledge-weight advisory.
  Pure `analysis/airconPlacement.ts` places a flush wall FCU (`aircon-unit`) per served room + the
  condenser(s) (new `aircon-condenser` def/`AirconCondenser` primitive) on the AC-ledge/yard/balcony;
  `resetSlice.planAircon` applies it suggest-then-apply (one undo step). "Aircon system" section +
  "Plan aircon" action in `DaylightPanel`, `airconSystem` pro flag. `renovationAllocator` aircon line
  reads placed FCUs when present, else the planner proposal. Tests: `airconSystem.test.ts`,
  `airconPlacement.test.ts`, `resetSlice.aircon.test.ts`, `features/airconSystem.test.ts` +
  allocator pin. Scenario `aircon-system-bsj2.json` (proposal panel + placed 3D, GPU-verified).
  Follow-up filed below (3D trunking route).
- [x] **BSJ-3 — Lighting & switching schematic** (M, pro) — DONE (`switchCircuits` flag):
  additive `PlanElectricalPoint.controls?`/`gang?`/`way?` (schema + types parity); pure
  `floorplan/switchCircuits.ts` (`buildSwitchCircuits` → deterministic S1/L1 tags, two-way pairs
  share a circuit → S1a/S1b; `suggestCircuitLinks` = door-nearest-switch heuristic; unswitched-
  light / empty-switch advisory counts). Inspector "Controls" section (room-grouped light list +
  two-way + gang) on a selected switch; on-plan dashed leader lines to controlled lights
  (`SwitchLinksLayer`); circuit tags + controlled-light markers + "Lighting circuits" legend on
  the electrical plan sheet (`electricalPlanSvg`) reusing `mepLabelLayout` declutter; DXF
  ELECTRICAL text suffixed with the same tag (sheet↔DXF consistent); "Suggest circuits" action
  (one undo step). All gated by `switchCircuits` (pro, default on, off in Simple).
- [x] **BSJ-4 — Bare-BTO & resale starting states** (M, simple) — DONE: pure
  `furniture/intakeStates.ts` (screed-dry floor map + retained-wet rule + absent internal-door-leaf
  ids + bare WC/basin plumbing provisions + strip-out fitting keep-set + the 4 `INTAKE_STATES`
  metadata) drives three new `resetSlice` actions (`applyBareBto`/`applyResaleAsIs`/
  `applyResaleStripout`) beside `applyOcsStarter`. New `floor-screed` material (honest grey cement).
  Absent door leaves are represented as `DoorState.leaf:'none'` (riding the existing `doors`
  persistence/history — no new persisted field), guarded in BOTH `Door.tsx` (fixed flat) +
  `PlanDoorLeaf.tsx` (custom plans); the 2D symbol keeps the opening. Each intake captures
  `baselinePlan` so the demolition/hacking diff is real (bare BTO → baseline == shell → no hacking
  line). Smart Start's OCS entry is now a 4-option "Starting state" group gated by the (relabelled)
  `ocsStarter` flag. Tests: `intakeStates.test.ts`, `resetSlice.intake.test.ts`,
  `renovationAllocator.intake.test.ts`, `features/flags/intakeStates.test.ts`, doors-leaf schema
  round-trip. Note: on the fixed default flat, seeded plumbing provisions are session-only (the
  default plan isn't serialized); screed floors + absent leaves persist.
- [x] **BSJ-5 — Per-trade handover packs** (M, pro) — DONE: `ui/tradePacks.ts` (pure) +
  `openTradePack.ts` (window.open flow) + `tradePacks` flag (pro, default on). Re-bundles the
  MASTER drawing set into 7 per-RECIPIENT packs (Tiler / Electrician / Plumber / Carpenter /
  Aircon / Curtains / Painter) — each a pack cover (recipient, scope, contact placeholder,
  title-block info, advisory tables) + the master sheets that recipient needs, selected by
  `calloutGroup` and keeping the MASTER sheet numbering (a contractor cross-references). Reuses
  the sheet builders via `drawingSet.ts`'s new `buildDrawingSheets`/`renderDrawingDocument` split
  (no fork); the finish schedule is narrowed to floors+walls (tiler) / walls (painter) via
  `finishScheduleHtml`'s new `kinds` param. Honest gaps: each pack lists what it EXCLUDES when
  data is missing (no electrical plan, no switching schematic + unlinked-light count, unplaced
  FCU/condenser positions, no window treatments, …). Advisory tables composed from the same pure
  builders the editor uses (socket advisory + mount-height conventions + DB note, aircon system
  proposal + ledge/trunking notes, window-treatment list, paint-area basis). File menu (desktop
  Disclosure + mobile section). The designed→ordered bridge.
- [x] **BSJ-6 — Wet-area & kitchen fit-out catalog gaps** (S, simple) — DONE (v0.22.2.x): three
  new procedural primitives + defs — `ShowerScreen` (framed clear/fluted glass panel + optional
  return wing, wall-flush, `shower-screen`), `BidetSpray` (wall-mounted health faucet, `bidet-spray`),
  `MixerTap` (standalone counter/basin mixer, `mixer-tap`) — following the floor-anchored/+Z/real-
  Material conventions; picked up by the structural-soundness sweep. Prices/keywords added; verified
  in `wet-area-catalog-bsj6.json`.
- [x] **BSJ-7 — Waterproofing-zone model** (S/M, pro) — DONE (`waterproofing` flag): pure
  `floorplan/waterproofing.ts` (`buildWaterproofingZones` → per wet/hard-service room, floor area +
  300 mm general / 1800 mm shower-wall upturn — shower localized from placed `shower`/`shower-screen`
  items, else full bath perimeter conservatively — + total membrane area). Fed to a diagonal wet-area
  hatch + zone table on the Dimensioned plan (`autoDimensionSvg.ts` overlay), the Tiler handover pack,
  an unconditional "waterproofing membrane below" note on the finish schedule's wet floor rows, and an
  additive `waterproofing` budget sub-line (`renovationAllocator.ts`, `trades.waterproofingPerM2`).
  Tests: `waterproofing.test.ts`, `renovationAllocator.waterproofing.test.ts`, both-modes flag test.
- [x] **BSJ-8 — Floor build-up / level & transition model** (S/M, pro) — DONE (`floorLevels` flag):
  additive `PlanRoom.floorLevelMm?` (schema ⇄ types parity, round-trip test) — DOCUMENTATION-level
  (does NOT move the 3D floor; 3D representation filed as a follow-up below). Pure
  `floorplan/floorLevels.ts` derives per-room FFL tags, doorway step/transition markers (between
  rooms at different levels), and a kerb/step advisory (wet room level with an adjacent dry room).
  Rendered as FFL pills + step diamonds + legend on the Dimensioned plan (same overlay) + Tiler pack;
  RoomInspector "Floor level (mm)" field (pro-gated). Intake states don't seed it (documented —
  default-flat mutations are session-only). Tests: `floorLevels.test.ts`, schema round-trip, both-modes.
- [x] **BSJ-8 follow-up — 3D floor-level representation** (M, pro) — DONE (`floorLevels` flag,
  reused). New pure `floorplan/floorLevels3d.ts` (`roomFloorOffsetM`, `wallBaseExtensionM`,
  `floorOffsetAtPoint`/`roomFloorOffsetsForLevel`/`roomAndOffsetAtPoint`, `buildThresholdRisers`
  reusing `floorLevels.ts:buildFloorTransitions` for the doorway pairing) computes per-room Y
  offsets + doorway riser specs; flag off ⇒ every offset is 0 (byte-identical to pre-BSJ-8
  render). **Floor + skirting**: `PlanRoomShell` (isolated room editor) offsets its floor +
  thresholds group by the room's own offset; `PlanShell` (whole-plan overview) offsets each
  room's floor group + resolves each skirting strip's offset from the room it fronts (probed a
  touch inside the room from the strip's face). **Wall-base gap**: plan wall boxes start at
  world Y=0 and are shared between rooms, so rather than duplicating wall geometry per adjacent
  room, a plain plinth box (`WallBasePlinth` in `PlanRoomShell`, inline in `PlanShell`) fills the
  gap from a lowered floor up to y=0 — exact for the isolated editor (one room per wall) and a
  harmless few-mm over-extension into a neighbour's differently-offset void on a shared
  partition in the overview (acceptable at the mm-scale steps this feature models; walls/ceiling
  themselves never move — an FFL change is a slab build-up, not a storey change). **Threshold
  risers**: `buildThresholdRisers` + a new `ThresholdRiser` mesh (vertical face + top nosing)
  render at each doorway transition `floorLevels.ts` already flags, so the 3D riser and the
  2D step marker can never disagree about where a step exists. **Furniture re-seat**: render-time
  only — `FurnitureLayer` composes a room-offset lookup (`pointInRoom` against the item's storey)
  with the existing per-storey elevation wrapper (whole-plan overview) or receives the isolated
  room's single offset as a `roomOffsetM` prop from `RoomEditorScene` (room editor); stored
  `item.position`/`FurnitureItem` gains no Y field, so session data stays level-agnostic exactly
  like the pre-existing multi-storey `levelId` elevation pattern. **Walk-mode**: `FirstPersonCamera`
  adds the walker's current room's offset (found via `pointInRoom` each frame, or resolved once
  for the isolated room editor) on top of the existing per-storey `floorElev` — a smooth Y follow
  (not a hard collision step), so standing height tracks a lowered/raised room continuously.
  The curated default flat (`RoomShell`/`Apartment.tsx`) is unchanged — it has no `floorLevelMm`
  concept (plan-room-only feature). Tests: `floorLevels3d.test.ts` (offset resolution incl. flag-off
  ⇒ 0, wall extension, point lookups across storeys, riser geometry + level-elevation composition).
- [ ] **BSJ-2 follow-up — 3D refrigerant-trunking route** (S/M, pro) — the aircon system planner
  (BSJ-2) currently emits a one-line trunking ADVISORY per system ("runs from the AC ledge along
  the corridor ceiling — confirm with installer") rather than a modeled route. Approach when built:
  a pure `analysis/airconTrunking.ts` that routes an orthogonal polyline from each served room's FCU
  to its condenser on the ledge, hugging the corridor ceiling (reuse `planRoomShell` walls +
  `roomCategory` to find the corridor spine + door thresholds to cross rooms), rendered as a thin
  ducted-trunking run in the 3D scene (a mounted `noClip` polyline mesh at ceiling height) and marked
  on the RCP/electrical sheet. Feeds a real pipe-length quantity into the aircon budget line. Pure
  client. Keep the advisory note as the fallback when the route can't be resolved.
- Near-misses CLEARED (verified covered, don't re-propose): full appliance catalog (fridge/
  washer/dishwasher/oven/microwave/hood/hob/wine-cooler/water-heater/aircon FCU); TV 43-75"
  sizes; curtains/roller/roman/zebra/drapery; carpentry (kitchen/wardrobe/feature-wall/study/
  shelter built-ins + dimensioned carpentry sheets); per-room aircon BTU (only SYSTEM grouping
  is the gap); MEP placement + socket/DB advisory + data points (only SWITCHING is the gap);
  false ceiling/cove/clearance/RCP; OCS intake (only bare/resale is the gap); reno sequencing +
  ICS (only trade BUDGET is the gap); finish/opening/electrical/plumbing schedules + setting-out
  + DXF + BOQ + FF&E + shop export (only per-TRADE re-bundling is the gap); skirting/accent walls/
  floor-texture transform (only floor build-up/transitions is the gap); floor loading, reno
  rules, hackability, DLP dates, permit paths.

## UX walkthrough audit round (2026-07-19)
First-time-user end-to-end walkthrough on the GPU harness. Full write-up + screenshot refs:
`docs/research/2026-07-19-ux-walkthrough-audit.md` (P1=0, P2=3, P3=7; one P3 already fixed inline).
- [x] **UXW-P2-1 — plan-editor room labels collide with the socket advisory.** FIXED: the socket
  count is now folded into `RoomsLayer`'s label block as a trailing line (respecting the label
  anchor + `labelOffset`), computed from a `socketShortfall` map `FloorPlanEditor` passes in
  (only when the MEP view is on). `MepLayer` no longer draws it. Verified: no overlap in the
  plan-editor shots.
- [x] **UXW-P2-2 — Smart Start "Styles" mixes palette themes and room-layout remodels.** FIXED:
  the gallery is now two `.sec-h` sections — "Design themes" (`group: 'theme'`) and "Layout ideas"
  (`group: 'layout'`). P3-7 footer token also fixed — "Theme: clay" now humanises via `THEME_META`
  ("Theme: Clay"). Verified in the SmartStart gallery shots.
- [x] **UXW-P2-3 — the shipped default + Smart-Start furnishing fails the app's own advisories.**
  FIXED. Root cause: the default flat furnishes from FIXED tables (`defaultLayout`/`buildPresetItems`),
  bypassing the arranger's door keep-outs that the RM3 property test covers — a bath2 basin sat in
  its door swing. Moved the bath2 basin+mirror to the west wall (clear of the door); moved the
  family-nursery floor lamp out of bedroom 3's door path. Also reconciled circulation SCORING
  (`designScore.ts`): `findNarrowGaps` is an inclusive advisory finder (per `layoutPresets.test`),
  so scoring now only fails on genuinely impassable pinches (<0.5 m between two large obstacles) and
  treats snug adjacencies as gently-capped advisories. Regression test:
  `defaultFlatClearance.test.ts`. Before→after: overall 59(F)→76(C); clearance 78→100 (BLOCKING
  1→0); circulation 0→58.
- [x] **UXW-P3 batch (polish):** DONE — clearance stat-tile labels ("Overlapping"→"Overlaps" +
  no-wrap label CSS); MOOD segmented uses compact `shortLabel`s (Movie/Party) at natural width, no
  ellipsis (wraps cleanly); desktop Scene-menu Ceiling-fixtures/Motion toggles got the mobile
  clarifying subtext (`.scene-field-sub`); Handover date shows an SG-readable "Collection day: 12 Jul
  2027" + format hint, and the move-in checklist rows are now tickable + persisted (`handoverChecked`,
  schema+autosave); Smart Start footer token humanised (see P2-2). (P3-1 tour copy + P3-5 elevation
  preview left as-is: P3-5 is the print thumbnail, out of this batch's scope.)

## E2E blank-slate journey validation (2026-07-19)
> New-owner end-to-end journey (bare shell → surfaces → theme/furnish → MEP/circuits/aircon →
> score/checks/budget/handover → drawing set + trade packs) driven as ONE GPU-harness session.
> Full write-up + 16 screenshot refs + root-cause probes:
> `docs/research/2026-07-19-e2e-journey-validation.md`. Verdict: the no-designer promise HOLDS as
> a connected flow (budget/waterproofing/FFL/handover all chain), with ONE broken bridge (circuits)
> + one collision bug. P1=1, P2=2, P3=3, 0 BLOCKING. Scenario:
> `scripts/scenarios/e2e-blank-slate-journey.json`.
- [x] **E2E-P1 — "Suggest circuits" links 0 switches → switching schematic never appears (FIXED
  2026-07-20).** Root cause was room-matching, not placement: `deriveElectricalPoints` correctly
  places switches ON the wall centreline (kept — that's right for the electrical-plan render, and
  `mepSuggest.test.ts:69`'s `{x:1.95,z:0}` pin stays), but `suggestCircuitLinks`'s `pointInRoom`
  never found a centreline switch inside any interior room rect. Fixed at the room-resolution level:
  `switchCircuits.ts` now resolves a switch's room by PROBING ~0.3 m perpendicular to its nearest
  wall (both sides) — mirroring the `openingProbe` the door schedule uses — with a 4-cardinal
  fallback for degenerate plans. Verified end-to-end via the e2e scenario: master drawing
  Electrical plan now carries the Lighting-circuits legend (S1→L1, S2→L2, S3→L3,L4) + on-plan
  L-marks, and the Electrician pack's "No switching schematic" exclusion is GONE (replaced by the
  circuit list). New tests: probe-into-room + a default-flat regression asserting `map.size ≥ 3`
  from realistic on-wall suggested switches (`switchCircuits.test.ts`). Shots `15`,`16`.
- [x] **E2E-P2-1 — Aircon planner places condensers onto existing outdoor furniture (FIXED
  2026-07-20).** `analysis/airconPlacement.ts:planAirconPlacements` now takes an optional collision
  context (existing items + defs + plan walls) and slides each condenser along the ledge (both
  ways, clamped inside the room rect) via `canPlace` until it clears existing furniture + walls +
  already-placed condensers; a condenser the ledge genuinely can't fit is DROPPED with an advisory
  ("second condenser needs bracket space — confirm with installer") rather than overlapped. Wired
  through `resetSlice.planAircon` (default flat → `canPlace`'s built-in walls; custom plan →
  `planCollisionWalls`). Clearance checks went 3 overlaps → 0; design score 42 → 54 (Clearance & fit
  40 → 88). Regression test: default flat + outdoor furniture ⇒ no condenser-involved overlaps.
  Shots `10` (0 overlaps), `06` (2 condensers placed clear).
- [x] **E2E-P2-2 — theme furnishing vs the app's own checks (GUARD ADDED 2026-07-20).**
  Investigation: measured every preset's score on the DEFAULT flat standalone — all themes already
  score overall ≥76, Clearance 100, Circulation 58, 0 blocked doors (only the layout-group
  wfh-studio dips to circ 38). The e2e's 42/100 was driven almost entirely by the P2-1 condenser
  overlaps, not the preset furnishing. Locked in with a `defaultFlatClearance.test.ts` guard: EVERY
  `group:'theme'` preset on the default flat ⇒ 0 blocked doors + circulation ≥40 + overall ≥65. (The
  residual live-e2e circulation/daylight/lighting reflect the bare+aircon+moved-sofa combination and
  the plan's own daylight/kitchen-bath-utility lighting, not a themed-placement bug.)
- [x] **E2E-P3 batch (DONE 2026-07-20).** (1) **Theme apply surfaces overwrite** — the wizard now
  states "Replaces any floors & walls you've already set on the living spaces" (the finishes slice
  can't cheaply distinguish user-set from default, so the honest confirm-line was chosen over a
  fragile merge). (2) **Aircon panel placed-state** — `DaylightPanel` detects placed
  `aircon-unit`/`aircon-condenser` items and flips the header "Proposed multi-split systems" →
  "Installed as planned" + the button "Plan aircon" → "Re-plan aircon" (shot `06`). (3)
  **Cooling-load non-cooled rooms** — the list now shows only habitable (FCU-served, mirrors
  `AIRCON_SERVED_CATEGORIES`) rooms with a "Show all rooms (+N non-cooled)" toggle (shot `06`).

## Open — UI/UX polish follow-ups
- [ ] **P37 List virtualization — DEFERRED (2026-07-03 ruling).** Not justified now: the
  catalog is already paginated (`PAGE_SIZE=12`, never renders >12 cards); history/layers
  realistically render <100 rows. Revisit with a lightweight slice-on-scroll window (NOT a new
  dependency) only if a single list is observed to exceed ~200 live DOM rows.

## ⛔ Production-infra-blocked — need a DEPLOYED host/backend, not app code
The dev paths already work (Vite reverse proxy, dev-gated providers); only the *production*
proxy/mirror/host is missing, and standing one up is a deployment task, not a code change here:
- **Runtime catalog CORS proxy** (ambientCG prod) — ambientCG's API/CDN send no CORS headers.
  The Docker image's nginx now ships `/acg`/`/acg-cdn`/`/kenney` proxies (self-hosted deploys
  covered), but the **GitHub Pages** deployment still needs a Cloudflare Worker / Vercel edge /
  hosted reverse-proxy. Until then ambientCG stays dev-gated there (Poly Haven works direct).
- **Kenney / Quaternius mirrors** — no CORS-friendly API, ship single ZIPs; need a build-time mirror
  or proxy worker + format conversion (FBX/OBJ → GLB) before adding to the runtime catalog.
- **Sketchfab** — REST + OAuth token + runtime fetch (auth/ToS friction).
- **Kenney zip extraction** — no CORS-friendly API, ships single ZIPs; still needs a mirror +
  format conversion. (The Poly Haven half of this item shipped as the DEV-side
  `fetch-polyhaven-models.mjs` repack pipeline, v0.22.0.6 — a *runtime/prod* fetcher would still
  need a proxy/host, same class as the ambientCG proxy above.)

## Assets — open pipeline deferrals
- **Standard asset set expansion** (~80 assets) + **per-LOD texture variants** + **lazy/streaming
  GLB loading** — manifest schema already supports these; expand when bundle size justifies it.

## Closure rulings (don't re-propose)
- **Thumbnail-clone GPU disposal — RESOLVED no-leak (2026-07-18, measured).**
  `scripts/scenarios/thumbnail-clone-gpu-probe.json` read `gl.info.memory` on the thumbnail
  canvas across 3 category cycles + a 3-concurrent compare-tray open: counts fluctuate and drop
  back to single digits (no monotonic growth; 0 contextlost on that canvas). Root cause of the
  non-leak: `SkeletonUtils.clone` shares the source `BufferGeometry`/`Material` with drei's
  `useGLTF` per-URL cache — the clone owns nothing disposable, and R3F correctly never disposes
  externally-supplied `<primitive>` objects. Resident GPU memory is the intentional per-URL
  loader cache (documented in `src/furniture/CLAUDE.md`). Don't re-investigate absent new
  evidence of monotonic growth.

## Risks tracked from specs
- **Asset source URL drift** (Poly Haven / ambientCG slug versioning) — pin stable per-asset URLs,
  audit periodically.
- **Bbox-derived footprints** can be wrong for off-floor anchors / non-uniform scale — revisit if
  it bites users.

## Time-of-day — out-of-scope deferrals (from the spec)
Auto-advancing in-world clock; window-glass tinting affecting shadow colour; localized per-room IBL
probes; real-time path-traced GI/RTX (revisit only with affordable WebGPU path tracing).
(Directional door-bleed weighting shipped v0.21.2.7 into the 2D lux model — the 3D render's bleed
was already physically correct via real lights.)

## Deferred candidates
- **Deeper transition-warmup: `renderer.compileAsync` + time-sliced mounts** (2026-07-03).
  v0.10.0.7 shipped compositor-proof overlay animation + readiness-based hide (throttled ~10 fps
  warm frames behind the overlay). The remaining lever if big scenes still block long: explicit
  `renderer.compileAsync(scene, camera)` (KHR_parallel_shader_compile) + `initTexture` during the
  overlay window, and batching FurnitureLayer mounts across frames so no single main-thread block
  exceeds ~50 ms. Only worth it if profiling shows first-frame blocks surviving the warm frames.
- **`livePrices` IXT scenario** — deferred (user, 2026-06-30): dev-only + network/sidecar-bound
  (lower value), and a headless scenario would need a new dev-only `window.__priceSidecarStub` lever
  in `livePrice.ts` purely for the test. Unit coverage already exercises the client logic; revisit
  only if the sidecar path regresses.

## Open — core interactions
- **Live slide during drag — PARKED (2026-07-12 evaluation, numeric evidence).** The specified
  per-move minimal-axis MTV slide (vs walls + furniture, reusing `nudgeToValid`) is provably
  unstable: ±0.02 m frame wobble, 0.39 m face-flip jumps circling an obstacle, and a 0.62 m
  teleport THROUGH a wall once penetration passes the midpoint. Also premise-corrected: there is
  no "hug on release" today (onUp's auto-nudge was deliberately removed — bug #6; `nudgeToValid`
  is test-only dead code), and `wallSnapOffset` already pulls flush within 0.12 m, so the residual
  value is low. **If revisited**: build a walls-only swept two-pass X/Z clamp
  (`collision/slideAlongWalls.ts` modelled on walk-mode `resolveMovement`, seeded from a
  lastValidPos ref, applied after all snaps, snap-off single-item drags only, noClip/windowBound
  excluded) — proven stable + tunnel-proof in the probe (maxJump 0.02 m, corner-stable, no
  tunnelling on a 2 m step); flag `liveSlideDrag` simple/default-OFF; REQUIRES real-device feel
  QA (headless can't measure pointer jitter/tug-of-war with the magnetic snap). Probe
  measurements in the 2026-07-12 session records. (Drag inertia: still skip.)

## Open — customizability / UX
- **Baseboard fold into FinishPicker — CLOSED as skip (2026-07-18 ruling).** Accent-wall
  *creation* shipped (v0.22.0.5, `materials/roomWalls.ts` + FinishPicker "Add accent wall…").
  Baseboard stays per-wall in the 2D-plan `WallInspector`: `wallBaseboard` is a genuinely
  per-wall `PlanWall` property (mixed heights/colours per room → any per-room control is lossy
  and clobbers variety), and the fixed apartment's 3D `WallSegment` has no per-wall baseboard
  data at all, so a picker control would have nothing to bind to for the default flat. Don't
  re-propose without a per-room aggregation design that handles both.
- **2D-plan finish drag-and-drop — CLOSED, no entry point (2026-07-18 investigation).** The
  proposed plan drop-zones would be dead UI: the ONLY finish drag source is the FinishPicker's
  `SwatchGroup` tiles (`ui/finish/swatches.tsx` → `encodeFinishDrag`), and the FinishPicker never
  mounts in the plan editor (needs `selectedRoomId`; the opaque `.plan-screen` z-30 overlay covers
  the right dock, which has no `z-index` bump like the catalog's `.catalog-in-plan`; and
  `ui/CLAUDE.md` + `editor/inspector/RoomInspector.tsx` deliberately keep finishes OUT of the plan
  editor — "the plan stays a structural/layout view"). Reviving this requires a product decision to
  surface a finish palette inside the plan editor first (contradicting that invariant), not a drop-
  zone implementation; the pure decision layer (`materials/finishDrop.ts` +
  `state/finishDropApply.ts`) is drop-surface-agnostic and would map cleanly if that ever happens.


## Core-loop parity gaps (2026-07-03 audit)
Ranked by value/effort. All pure-client, core-loop (furnish→arrange→finish→view→share) +
discoverability/customizability, desktop **and** mobile; none shipped or tracked above. (Verified
absent this pass; avoids the AI/backend/GPU gaps already logged in `FEATURE_PARITY.md`.)
- [ ] **PLAN-FURNISH — plan-editor furniture placement follow-ups.** Phases 1–3
  (desktop click-to-place `planFurnish` flag; mobile tap/long-press-from-card; window-bound
  fixture snap) have shipped — see `CHANGELOG.md` and
  `docs/research/2026-07-03-plan-furnish-implementation-plan.md` (marked done there). Remaining:
  - [ ] **Phase 4** — HTML5 drag-from-catalog onto the plan SVG. **Recommend keeping deferred
    (2026-07-11 assessment)**: desktop already places via click-to-arm→ghost→click and mobile via
    tap/long-press-drag (Phases 1–2), so this adds a third gesture purely for 3D-drag-habit
    parity; the `<div>`-vs-SVG drop-zone friction remains (workaround: transparent overlay div
    during drag). Revisit only on user demand.

## Process
- Update this file whenever work is planned/deferred; remove items entirely once shipped (they live
  in `CHANGELOG.md`).
