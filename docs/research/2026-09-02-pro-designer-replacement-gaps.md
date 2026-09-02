# Gap analysis — "full professional interior designer replacement"

**Goal (user, 2026-09-02).** Sofa-So-Good should replace hiring an experienced
interior designer: full home customization, output fully to scale / measured /
detailed, credible both as realistic visualization AND as a precise contractor
reference.

**Session/worktree.** Researched by session `dev-1a` in worktree
`/Users/cwlroda/dev/sofa-pro-designer` (branch `research/pro-designer-gap-analysis`,
based on `a8022e1c` / v0.30.9.1). Peer session `dev-09` holds
`/Users/cwlroda/dev/sofa-so-good` (`fix/flat-geometry-and-wall-reveal`) and
`/Users/cwlroda/dev/sofa-graphics-realism` (`fix/graphics-realism-tiers`).

**Framing.** This is a DIFFERENT axis from `FEATURE_PARITY.md` (Coohom / Sweet
Home 3D parity) and from the 2026-07-18 contractor-handover round in `TODO.md`
(now largely shipped + re-reviewed). The lens here is: *what does a paid,
experienced ID actually deliver that this app still does not?* — construction
detailing, as-built site reality, engineering-grade specification, and the
designer's own judgment loop.

## Baseline — what already ships (verified in source)

- Master drawing set (`src/ui/drawingSet.ts`): Cover, Floor plan, Lighting plan,
  RCP, Dimensioned plan, Electrical plan, Plumbing plan, Finishes schedule,
  Demolition & new walls, FF&E schedule, Door & window schedule, per-wall
  Elevations, Section A–A, per-item Carpentry/joinery sheets.
- Trade packs (`src/ui/tradePacks.ts`): tiler, electrician, plumber, carpenter,
  aircon, curtains, painter — master sheet numbering preserved for cross-ref.
- Title block metadata (`src/export/drawingSetTemplate.ts`): project/client/
  address, drawn-by, checked-by, revision letter + note, A4–A1, orientation.
- Exports (`src/export/`): DXF, glTF/OBJ/STL/USDZ, BOQ (+xlsx), FF&E CSV, room
  schedule CSV, cost breakdown CSV, quote template, renovation ICS.
- Illuminance (`src/lighting2d/`): lumen-method room averages with ok/low/high
  status vs residential bands, spatial point-illuminance grid, lux gradient,
  inter-room doorway bleed.
- Analysis (`src/analysis/`): HDB compliance, accessibility, daylight, thermal,
  floor loading, aircon sizing/placement/trunking, electrical schedule, socket
  advisory, switch circuits, opening schedule, waterproofing, reno cost +
  timeline + allocator, handover checklist, design score.
- Plan geometry (`src/floorplan/`): arbitrary-shape rooms, arc walls, sloped
  walls/ceilings, multi-storey levels, dimension chains, auto-dimension,
  setting-out, fillets, grid/guide snap, numeric wall entry, permit notes.

## Confirmed gaps

### ✅ SHIPPED v0.31.5.254 — G1 — Exactly one section, hardcoded, with no cut marker on the plan
**Status: CONFIRMED in source.** `src/floorplan/section.ts` `buildSection()`
accepts an arbitrary `SectionCut { axis: 'x' | 'z', at: number }`, but
`src/ui/drawingSet.ts:621` calls it once with a hardcoded
`{ axis: 'z', at: plan.extent[1] / 2 }` and emits a single sheet literally named
`Section A–A` (`drawingSet.ts:634`).

Consequences for a real set:
- No longitudinal section (the perpendicular `axis: 'x'` cut) — so one of the
  two conventional cuts is simply absent.
- No user-placed cuts, so a section cannot be taken where it matters (through a
  wet area, a dropped ceiling, a stair, a tall joinery run).
- **No section cut-line marker on the Floor plan / Dimensioned plan sheet.** A
  contractor cannot locate where "A–A" was cut. This is a convention violation,
  not just a missing feature — the sheet asserts a cut location it never draws.
- The mid-plan cut may land on a corridor and produce a near-empty section
  (guarded only by `section.walls.length > 0`).

Approach: promote section cuts to plan entities (position, axis, direction of
view, mark letter), draw the standard cut line + arrowed cut markers on the plan
sheets, and emit one numbered sheet per cut (A–A, B–B, …). The core projector
already supports this; the work is entity + UI + sheet iteration.

### G2 — The setting-out plan silently omits diagonal and curved walls
**Status: CONFIRMED in source. Highest severity found so far — a correctness /
credibility issue, not a missing feature.**

`src/floorplan/settingOut.ts` derives the datum-referenced running dimensions a
contractor actually builds partitions from. But it handles **axis-aligned walls
only**:
- line 41 — arc walls "have no simple planar face and are skipped";
- line 183 — "A diagonal wall (neither) is skipped — no single axis-aligned face."

Meanwhile the modeler *does* support both: `wallArc.ts` ships arc walls, and
`0bd45250` ("Let a room be any shape, and close the floor gaps it was hiding")
ships arbitrary room shapes. So the geometry engine accepts shapes the primary
contractor deliverable cannot dimension.

Worse, **the omission is undisclosed.** The drawing set already establishes the
honest-disclosure convention for exactly this situation — `drawingSet.ts:978` and
`:1002` print "N minor walls omitted (no items or openings)" for elevation
sheets. No equivalent note exists for setting-out. A contractor therefore
receives a setting-out plan that *looks* complete while some partitions carry no
dimension at all, and nothing on the sheet says so.

Approach, in two independent steps:
1. **Disclose now (S).** Count skipped walls and print the same style of note the
   elevation sheets already use. Cheap, matches an existing in-repo convention,
   and removes the silent-failure mode immediately.
2. **Dimension them properly (M).** A diagonal wall is set out by its two
   endpoints' running X and Z offsets from the datum plus its angle; an arc wall
   by chord endpoints + radius (or rise). Both are standard practice and both
   need no new geometry — just a second dimension strategy per wall kind.

### G3 — Scale ladder stops at 1:20, so construction details are inexpressible
**Status: CONFIRMED in source.** `src/floorplan/drawingScale.ts:15` —
`STANDARD_SCALE_RATIOS = [20, 25, 50, 75, 100, 125, 150, 200]`, documented as
"1:20 is the most detailed/largest drawing".

Every junction detail a professional issues is drawn at 1:10, 1:5 or 1:2:
skirting/cornice profile, false-ceiling drop + shadow gap, shower kerb and
waterproofing upstand height, worktop edge/nosing, door jamb/architrave, window
sill/reveal. At 1:20 a 12 mm shadow gap prints 0.6 mm — unreadable and
unbuildable. There is also no `Detail` sheet type in the master sheet list
(`drawingSet.ts` emits Cover, Floor, Lighting, RCP, Dimensioned, Electrical,
Plumbing, Finishes, Demolition, FF&E, Door/Window, Elevations, Section A–A,
Carpentry — no details).

This is the single largest structural gap versus a professional set: the app
documents *what* goes where, never *how* anything is built at the junction.
Note this depends on real profile data (skirting height/profile, ceiling drop,
kerb dimensions) — some of which the model may not carry yet, so scoping should
check what is knowable before drawing.

### G4 — Illuminance IS modelled; the gaps are photometric fidelity and task-plane/uniformity metrics
**Status: CORRECTED 2026-09-02.** An earlier pass of this document claimed the app
"cannot answer whether a room hits its illuminance target". **That was wrong** — the
grep behind it covered `src/lighting/` and `src/analysis/` but missed
`src/lighting2d/` entirely. Corrected finding below; the surviving gap is real but
much narrower.

**What actually ships.** `src/lighting2d/` is a genuine illuminance model:
- `roomLux.ts` — per-room average via the classic lumen method
  (E = Φ × UF / A), classified per room kind and compared against recommended
  residential bands to yield an **ok / low / high status per room**. Consumed by
  the Drawings panel, the report *and* the drawing set.
- `luxGrid.ts` — a spatial point-illuminance grid: inverse-square with cosine
  incidence (E = I·h / (h² + r²)^(3/2)), an indirect term calibrated up to the
  lumen-method average, and a near-window daylight wash. Feeds the 3D floor
  heatmap (`scene/LuxOverlay.tsx`).
- `luxColor.ts` — a labelled lux gradient (Unlit / Dim / Ambient 150 / Living 300
  / Task 500 / Bright 750), `doorwayBleed.ts` — inter-room contribution through
  open doors, `lightingPlan.ts` — the plan-side emitter model.

So the "is it bright enough?" question is answered, per room, and it reaches the
handover documents. What remains are four precision gaps, each of which the model
already holds the input data for:

1. **The IES distribution is not used in the lux math.** `roomLux.ts` documents
   `LUMENS_PER_CANDELA = 4π` — an explicitly isotropic point-source integral,
   because "the emitter registry stores a single peak candela per fixture (no
   distribution curve)" — and `luxGrid.ts` states it uses the same calibrated
   candela, "no new photometry". Meanwhile `src/lighting/ies/` holds real IES
   profiles, used for *rendering* only. A 24° narrow-beam downlight and a bare
   bulb of equal peak candela deliver wildly different floor illuminance; the
   current model cannot distinguish them, so the more carefully a user selects
   real fixtures, the more the lux figure diverges from the render.
2. **A stylised-intensity calibration constant sits in the physics.**
   `SCENE_INTENSITY_CALIBRATION = 12` exists because registry intensities are
   "stylised night-scene values, roughly an order of magnitude below real
   luminaires". It is honestly documented and well-reasoned, but it means the lux
   output is anchored to the renderer's artistic intensity scale rather than to a
   specified lumen package. A designer specifies "1350 lm, 3000 K, 36° beam".
3. **Illuminance is evaluated on the floor, not the task plane.** Standards
   specify the work plane — ~0.75 m at a desk, ~0.85 m at a kitchen worktop —
   and that is where the 300–500 lx targets apply. `luxGrid.ts` samples the room
   *floor*; grep for a work-plane height in `src/lighting2d/` returns nothing.
4. **No uniformity or glare metric.** Grep for `uniformity` across
   `src/lighting2d/` returns zero hits. A professional specifies Emin/Eavg
   uniformity alongside the average, plus a glare limit — an average that passes
   can still be a room with hotspots under each downlight and dark corners, which
   is exactly what `luxGrid.ts` is designed to reveal but never scores.

Approach (M, and still favourable): feed the existing IES profile into both
estimators in place of the 4π assumption; let a fixture carry a real lumen/CCT/beam
package so the calibration constant can be retired for specified fixtures; sample
at a per-room-kind work-plane height; and score Emin/Eavg from the grid that is
already computed. Also worth doing: derive the utilisation factor from the room's
actual finish reflectances — the app knows every surface finish
(`floorplan/roomFinishes.ts`, `finishSchedule.ts`) but `roomLux.ts` uses a single
global `UTILISATION_FACTOR = 0.45` for every room.

### G5 — Tile setting-out exists as a render, never as a drawing
**Status: CONFIRMED in source.** True tile scale and coursing anchor are
implemented — but entirely in `src/materials/` (`procedural/tileSurface.ts`,
`procedural/patterns/tile.ts`, `worldUv.ts`, `tileSize.ts`, `pomFloor.ts`), i.e.
as a *shading* concern. Nothing in `src/floorplan/` or `src/export/` emits a tile
setting-out layout, and `floorplan/settingOut.ts` is about wall faces, not tiles.

The tiler trade pack (`tradePacks.ts:116`) therefore bundles a dimensioned /
setting-out plan but no coursing information: no grout-line origin, no cut-tile
positions or minimum acceptable cut width, no floor-to-wall joint alignment, no
feature-wall coursing on the elevations. Tile setting-out is one of the most
common sources of expensive on-site rework, and it is precisely what a designer's
tiling layout drawing prevents.

Same shape as G4: **the data already exists in the renderer** (true tile size +
anchor per surface), only the deliverable is missing — draw the coursing the
renderer is already computing onto the plan and the wall elevations, with the
origin dimensioned from the datum.

### ✅ SHIPPED v0.31.5.253 — G6 — The revision table holds exactly one row
**Status: CONFIRMED in source.** `drawingSet.ts:1005` renders the cover sheet's
Revisions table with a single hardcoded `<tr>` built from `template.revision` +
`template.revisionNote`; `DrawingSetTemplate` carries one `revision` letter and
one `revisionNote` string.

Consequences: a set reissued at Rev C shows only "C" with no record of A or B, so
the revision table — whose whole professional purpose is the audit trail proving
which sheet is current and what changed — cannot serve that purpose. Related and
also absent: per-sheet revision letters (every sheet carries the same global
`Rev X` via `drawingSet.ts:1060`, though in practice sheets revise
independently), revision clouds/deltas marking *what* changed on a sheet, and any
issue register / transmittal record of what was issued to whom and when.

Approach: make `revision` an append-only array of `{ letter, date, note, sheets }`
(S–M), render all rows, and derive each sheet's own current letter from the last
revision that touched it.

## Re-scoped rather than confirmed

- **C3 — As-built site capture and reconciliation. PARTIALLY RESOLVED.** A plan
  *trace backdrop* does ship (`ui/floorplan/editor/backdropPlacement.ts`: upload a
  scanned/measured plan up to 25 MB, scale it by metres-per-pixel, trace over it),
  so a user can reproduce a real home's plan. Import is otherwise SH3D-only
  (`floorplan/import/` = `sh3d.ts`, `sh3dPlacement.ts`) — no survey, LiDAR or
  point-cloud path. What remains genuinely missing is **measurement
  reconciliation**: no way to record a site-measured dimension against a modeled
  one, no deviation/tolerance report, and — per G2 — non-orthogonal reality is
  modelable but not dimensionable. Worth re-scoping as a tolerance feature rather
  than an import feature.
- **C6 — Specification writing.** Finishes + FF&E schedules exist; a pro also
  issues a written spec (products, substrates, workmanship standards, tolerances,
  exclusions). Verify what `quoteTemplate.ts` / `permitNotes.ts` already cover.
- **C7 — Designer judgment loop.** `analysis/designScore.ts` scores; a pro
  proposes alternatives, argues trade-offs, and revises to a brief and budget.
  Verify how far `furniture/briefParser.ts` + `analysis/suggestions.ts` go.
- **C8 — Structural / M&E coordination clash checking.** Verify whether aircon
  trunking, ceiling drops, joinery, and lighting are clash-checked in 3D against
  each other and against beams.

### G7 — No written specification, only schedules
**Status: CONFIRMED in source.** The two documents that might have carried a
spec do not: `floorplan/permitNotes.ts` is housing-type-conditional *regulatory
approval* text (HDB permit vs MCST vs BCA-direct), and `export/quoteTemplate.ts`
is *commercial* branding/tax/markup settings for the BOQ. Neither is a
specification.

A professional issues a written spec alongside the drawings, and it is what
actually protects the homeowner in a dispute: for each element, the product and
substrate, the workmanship standard, the tolerance, the preparation required, and
the explicit exclusions. Today the finishes and FF&E schedules say *which
product* goes *where*; nothing says *to what standard, on what substrate, within
what tolerance*. A contractor can install the specified tile badly and still be
fully compliant with the handover package.

Note `socketAdvisory.ts` already models this honesty well — it states in its own
header that it is "an INDICATIVE planning aid, not a certified electrical
design… no notion of circuits, RCD/MCB sizing or cable runs." A spec module
should carry the same explicit scope limits.

### G8 — Suggestions are a decorator wizard, not a designer's judgment loop
**Status: CONFIRMED in source.** `analysis/suggestions.ts` is self-described as
"Magic design suggestions (feature F16) — rule-based, no ML", producing
"contextual 'what to add' hints" from a room's name, area, and the furniture
*category strings* already placed in it. Categories are treated as "opaque
tags". `analysis/designScore.ts` scores a finished design.

So the loop is: *you* design, the app scores it and names missing categories.
What an experienced designer sells is the opposite direction — they take a brief
and a budget, generate two or three genuinely different schemes, argue the
trade-offs, and revise. Missing: alternative scheme generation, layout critique
(circulation, sightlines, focal points, proportion) rather than category
presence, and reconciliation against a stated budget and brief. Because
categories are opaque tags, the current rules cannot reason about *this* sofa's
size or style at all — only that "seating" exists.

### ✅ SHIPPED v0.31.5.252 — G9 — No cross-discipline coordination check
**Status: CONFIRMED in source.** `src/collision/` (`obb.ts`, `broadphase.ts`,
`placement.ts`, `clearanceGap.ts`, `furnitureBlock.ts`) is furniture-vs-
furniture/wall placement only. MEP points feed schedules, the RCP and trade packs
(`analysis/electricalSchedule.ts`, `floorplan/rcp.ts`, `ui/tradePacks.ts`) but
are never checked spatially against anything. `floorplan/ceilingClearance.ts` is
consumed only by `rcp.ts` / `rcpSvg.ts` — i.e. for drawing, not for validation.
`analysis/socketAdvisory.ts` is purely a per-room *count* target and explicitly
disclaims spatial reasoning.

Unflagged failure modes that a designer catches by coordinating drawings:
- a socket or switch placed behind a full-height wardrobe — installed, paid for,
  unusable;
- a downlight positioned inside a bulkhead / dropped-ceiling zone, or directly
  above a tall cabinet;
- an aircon trunking route (`analysis/airconTrunking.ts`) crossing a joinery run;
- a tall wardrobe specified taller than the dropped ceiling above it.

Each of these is cheap to detect — the geometry for both sides is already in the
model, and `src/collision/obb.ts` already implements the intersection test. The
gap is purely that no one runs it across disciplines.

### ✅ SHIPPED v0.31.5.251 — G10 — Dimensions are labelled in decimal metres at 10 mm resolution, never in millimetres
**Status: CONFIRMED in source.** This one goes directly at the user's "fully to
scale, measured" requirement, and it affects *every* dimensioned sheet.

`src/utils/measurement.ts` offers exactly two unit systems —
`type UnitSystem = 'metric' | 'imperial'` (line 3) — and `formatLength` (line 11)
renders metric as `` `${metres.toFixed(2)} m` `` (line 25), i.e. **two decimal
places of a metre = 10 mm resolution**. Imperial rounds to the nearest **inch**
(25.4 mm). There is no millimetre mode.

That formatter is what the contractor-facing sheets use:
`floorplan/autoDimensionSvg.ts:25` imports `formatLength`, and the setting-out
running distances are labelled with it at lines 229 and 240–241. Related
coarseness: `formatDimsShort` (line 56) rounds item dimensions to whole
**centimetres** (`Math.round(m * 100)`), and `formatArea` to 1 dp.

Five distinct problems, in rough order of severity:

1. **It quietly defeats `settingOut.ts`'s entire purpose.** That module exists
   because "a contractor does not build from cumulative wall-to-wall dimensions
   (each error compounds down the chain)" — so it computes every partition face
   as a running distance from a fixed datum. Then each of those distances is
   printed rounded to the nearest 10 mm. The compounding error is solved and a
   ±5 mm quantisation is reintroduced at the last step.
2. **Wrong unit convention.** Architectural and interior drawings in Singapore
   (and in most of the metric world) are dimensioned in **integer millimetres** —
   "2745", not "2.75 m". Decimal metres on a plan reads as non-professional and
   invites genuine misreading.
3. **Insufficient resolution for the trades the app already serves.** Carpentry
   and joinery are built to the millimetre; the app ships per-item Carpentry
   sheets and a carpenter trade pack, so it is already addressing a trade whose
   tolerance is finer than its own display resolution. A 2745 mm wardrobe run
   prints as "2.75 m" — 5 mm out, and worse once a run is subdivided.
4. **The sheets are internally inconsistent about units.** The dimensioned plan's
   own legend reads "FFL n = finished floor level vs datum **(mm)**"
   (`autoDimensionSvg.ts:395`), so a single sheet mixes millimetre levels with
   decimal-metre plan dimensions.
5. **Imperial is worse, silently.** An international user switching to imperial
   gets drawings dimensioned to the nearest inch — a 25.4 mm quantisation on a
   construction reference, with no warning that the export just got coarser.

There is also a legible symptom already documented in the code:
`autoDimensionSvg.ts:260` describes labels colliding into `"4.854.95 m"` — the
unit suffix repeated on every label is part of what makes the run crowded, and mm
integers ("4850", "4950") are both shorter and conventionally suffix-free.

**Known but not tracked.** `TODO.md` mentions this only as a parenthetical
ride-along under the contractor-handover section — "*(Precision substrate,
ride-along: mm display precision option in `measurement.ts`…)*" — not as a task
with an owner. Given it touches every dimensioned deliverable, it deserves to be
tracked in its own right.

Approach (S–M): add `'mm'` to `UnitSystem` (or better, separate *drawing* units
from *UI display* units, since "2.60 m" is the friendlier reading in the
inspector while "2600" is the correct one on a sheet), format as integer mm with
no suffix and a single "ALL DIMENSIONS IN MILLIMETRES" note in the title block —
the standard convention, which also resolves the label-collision crowding. Keep
the underlying model in metres; this is a presentation change, so it is low-risk
and independently testable.

### ✅ SHIPPED v0.31.5.250 — G11 — Plan sheets draw every item as a rectangle, using the coarse footprint resolver while collision uses the accurate one
**Status: CONFIRMED in source.** The app maintains **two** footprint resolvers in
`src/collision/placement.ts`:
- `itemFootprint(item, def): OBB` (line 74) — one coarse oriented bounding box;
- `itemFootprintParts(item, def): OBB[]` (line 134) — documented at line 126 as
  "a convex decomposition of a non-rectangular shape", resolved from the def's
  `footprintParts` spec.

Collision and placement use the accurate one, with dedicated tests for it
(`collision/roundOvalFootprint.test.ts`, `collision/granularFootprint.test.ts`).
The drawing set uses the coarse one: `ui/drawingSet.ts:408` is
`obbCorners(itemFootprint(it, def))`.

So on the GA floor plan a round dining table, an oval coffee table, an L-shaped
sectional, a chaise and a corner desk are all drawn as plain rectangles — while
the app's own collision model knows their real shape, and
`furniture/footprintShapes.ts` already approximates ellipses as OBB unions
precisely so that "the bbox corners a round/oval table never actually occupies"
are opened up.

Why it matters for this goal:
1. **The drawing misrepresents the design.** A round table reads as square. On the
   sheet a client signs off and a contractor works from, furniture shape is simply
   wrong — and it is the same sheet that carries the room's dimensions, so it
   invites being measured off.
2. **Clearance reads tighter than reality.** A rectangle claims the corner area
   the item does not occupy, so circulation around a round table looks pinched on
   the plan even where the app's own accessibility check (which uses the accurate
   parts) passes. The two disagree, and the drawing is the one the user shows a
   contractor.
3. **It is a plumbing gap, not a capability gap.** `ui/reportPlanSvg.ts:239`
   already accepts arbitrary corner **polygons**
   (`footprints: { corners: [number, number][] }[]`) and renders them via
   `<polygon>` at line 278 — so the renderer is fully capable today. The accurate
   resolver is one identifier away from the call site, already tested.

Approach (S): call `itemFootprintParts` at `drawingSet.ts:408` and emit one
polygon per part (or the union outline where parts are contiguous). Worth checking
whether the elevations have the equivalent issue. The main judgement call is
whether an OBB-union staircase reads acceptably as a drawn outline at 1:50 — an
ellipse approximated by bands may want a true arc in the SVG, which
`reportPlanSvg` would need a small addition for.

This is the third instance of one pattern (with G4 and G5): **the app computes
something accurately for the renderer or the simulation, then hands the drawing a
coarser value.** That is now the single most reliable place to look for gaps in
this codebase.


## Implementation status (2026-09-02)

Shipped on `feat/drawing-accuracy-pro` (branched from `origin/staging`), newest
first — details in `CHANGELOG.md`, deferred remainders in `TODO.md`:

| Gap | Version | What shipped |
|---|---|---|
| G1 | v0.31.5.254 | Both conventional cuts (A cross / B longitudinal) at scored-informative positions, with view-direction cut marks on the plan. User-placed cuts deferred. |
| G6 | v0.31.5.253 | Append-only revision history + `issueRevision`. Per-sheet letters and revision clouds deferred (nothing can populate them yet). |
| G9 | v0.31.5.252 | MEP-behind-furniture and item-under-ceiling-drop checks, surfaced in the report. Trunking-vs-joinery deferred. |
| G10 | v0.31.5.251 | `formatDrawingLength` — integer mm on every dimension line, imperial to 1/8". DXF deliberately stays in metres. |
| G11 | v0.31.5.250 | Shared `planFootprints` using the shape-aware resolver; decomposed items draw as one silhouette. |

Still open: **G2** (setting-out omits diagonal/arc walls — the disclosure note is
the next-cheapest correctness win), **G4** (feed IES into the lux model, add
work-plane height + Emin/Eavg), **G5** (draw the tile coursing the renderer
computes), **G7** (written specification), **G3** and **G8** (both large).

## Ranked roadmap

Ordered by professional-credibility impact ÷ effort. The first group is unusually
favourable because in each case **the data already exists in the model and only
the deliverable or the check is missing.**

| # | Gap | Why now | Effort |
|---|---|---|---|
| 1 | **G10** — integer-mm drawing units | Affects every dimensioned sheet; the current 10 mm rounding quietly reintroduces the very quantisation `settingOut.ts` exists to avoid, and decimal metres is the wrong convention outright. Presentation-only, so low-risk. | S–M |
| 2 | **G11** — draw the accurate footprint polygons the collision model already resolves | One-identifier change at a call site whose renderer already supports polygons; removes a visible misrepresentation on the sheet a client signs. | S |
| 3 | **G2 disclosure** — note skipped diagonal/arc walls on the setting-out plan | Removes a silent-failure mode where a sheet looks complete but isn't. Reuses the disclosure convention already at `drawingSet.ts:978`. | S |
| 4 | **G6** — revision history array + per-sheet letters | The revision table currently cannot serve its only purpose. Contained, schema-local change. | S–M |
| 5 | **G9** — cross-discipline clash check | `obb.ts` intersection already exists; just run it MEP↔furniture↔ceiling. Catches expensive, embarrassing site errors. | M |
| 6 | **G1** — section cuts as plan entities, with cut markers | Fixes a live convention violation (a sheet names a cut it never locates) and unlocks B–B. Projector already supports arbitrary cuts. | M |
| 7 | **G4** — feed IES into the existing lux model; add work-plane height + Emin/Eavg | The lux model already ships and reaches the drawing set; these four fixes make its numbers photometrically defensible rather than calibrated to the renderer. | M |
| 8 | **G5** — draw the tile coursing the renderer already computes | Prevents one of the most common sources of costly on-site rework. | M |
| 9 | **G2 dimensioning** — set out diagonal (endpoints + angle) and arc (chord + radius) walls | Completes G2 properly; needs no new geometry. | M |
| 10 | **G7** — written specification module | Closes the "compliant but badly built" hole. Mostly content + template work. | M |
| 11 | **G3** — 1:10/1:5 detail scales + a Detail sheet type | The largest structural gap, but needs profile data the model may not yet carry (skirting profile, ceiling drop, kerb dims) — scope what is knowable first. | L |
| 12 | **G8** — brief/budget-driven alternative schemes + layout critique | Highest ceiling (this is the designer's actual craft) and the largest, least certain effort. Blocked in part by categories being opaque tags. | L |

**Observation worth carrying forward.** Seven of the twelve items are *deliverable*
gaps, not *capability* gaps — the app already computes true tile coursing, holds
IES photometry, supports arbitrary-shape and arc walls, models MEP points and
ceiling drops, and implements OBB intersection. Its geometry and physics are
ahead of its documentation and validation. The cheapest route toward
"professional replacement" is to surface what the model already knows, not to
build new modeling power.

### Resolved this pass
C1 → **G3** (confirmed). C2 → **G5** (confirmed). C4 → **G4** (confirmed).
C5 → **G6** (confirmed). C6 → **G7** (confirmed). C7 → **G8** (confirmed).
C4 → **G4**, but only after a **correction**: the first pass wrongly reported no lux
model at all, having grepped `src/lighting/` and `src/analysis/` while the model
lives in `src/lighting2d/`. Lesson for later passes: grep `src/` whole before
asserting an absence.
C8 → **G9** (confirmed). C3 → partially resolved, re-scoped above.
**All candidate axes from the first pass are now resolved against source.**

## Self-audit of the absence claims (2026-09-02)

The G4 error was a **scoping mistake in my own grep**, not a subtle judgement
call: I asserted an absence after searching two directories instead of `src/`.
Every other finding here rests on an absence claim too, so all eight were
re-tested against the whole of `src/`. All eight stand:

| Gap | Re-test | Result |
|---|---|---|
| G1 | `sectionMark\|cutLine\|sectionCut\|SectionCut` across `src/` | Only `furniture/carpentryElevation.ts:156` `pickSectionCut` — an internal joinery helper, unrelated to plan section markers. Stands. |
| G2 | (direct source read, not a grep) | `settingOut.ts:41`, `:183`. Stands. |
| G3 | `1:10\|1:5\|detailScale\|DetailSheet\|'detail'` across `src/` | One unrelated comment in `drawingScale.ts:102`. No detail scale, no detail sheet. Stands. |
| G5 | `groutOrigin\|tileLayout\|coursing\|cutTile\|tileSetOut` across `src/` | **Zero hits.** Stands. |
| G6 | `revisions\|revisionHistory\|RevisionRow` across `src/` | One unrelated hit (`state/schema.ts:972`, save-schema migration wording). Stands. |
| G7 | `specification\|workmanship\|tolerance` across `src/` | Hits are all the furniture-`spec` object and unrelated tolerance constants; no spec document, and no Specification sheet in the master list. Stands. |
| G8 | (direct source read) | `suggestions.ts` header. Stands. |
| G9 | `clash` across `src/` | Three hits, all meaning *identifier* collision (`finishDrop.ts:17`, `furnishPlan.ts:371`, `generatedCatalog.ts:6`). No spatial clash detection. Stands. |

Rule adopted for later passes: **grep `src/` whole before asserting an absence**,
and prefer reading the owning module over trusting a keyword.

## Cross-cutting: neither half of the goal is photometrically anchored

The user's goal has two halves — *accurate, realistic visualization* and
*measured, precise contractor reference*. G4 establishes that the measured half
runs on an isotropic 4π approximation with a renderer-derived calibration
constant rather than on the IES data the app already holds.

The visualization half is not photometrically anchored either, which matters here
because it removes the assumption that the renderer is a trustworthy reference the
lux model could be calibrated against.

**Verified by me** at this worktree's base commit:
`src/scene/pathtrace/hqRenderSession.ts:211` copies only lights flagged
`isDirectionalLight`/`isPointLight`/`isSpotLight` into the path-traced snapshot —
so `AmbientLight` and `HemisphereLight` are not carried over — and `:237`–`:238`
construct a `GradientEquirectTexture` with a hardcoded `topColor 0xbfd4e6`.

**Peer measurements, attributed to `dev-09` and not verified by me** (its
unpushed worktree; direct pose-matched comparisons, no baseline arithmetic):
- `store.hdriId` defaults to null, so the gradient branch is the default path for
  every HQ render — confirmed by its direct instrumentation.
- Zeroing the gradient drops the frame mean 112.7 → 38.4, so the gradient supplies
  the majority of interior light.
- The window wall renders +42.7 against the rasteriser with shading flattened ~7×
  (sd 11.6 → 1.7). Real, but **not attributable to the gradient** — see below.
- **The tracer already has a faithful sky and never looks at it.**
  `resolveTracerEnvironment` returns early when there is no HDRI url (the
  default), and even inside the HDRI branch tests only `scene.environment`,
  never `scene.background` — which holds an hour-aware equirect `CanvasTexture`.
  **Structurally verified by me** at this worktree's base: `hqRenderSession.ts:147`
  is the early return, `:148` tests only `live.environment`. So the hardcoded
  gradient is used *in preference to* a faithful sky in the same scene, not for
  want of one.
- **A null result, and it is the load-bearing one.** Converting that background
  canvas to a linear-float DataTexture and feeding it to the tracer does render,
  and moves the frame's largest error by **0.3 counts** against a patch sd of 1.6
  (window-wall-R: raster 70.0, gradient 105.8, converted sky 106.0). So the
  sky-blind wall's excess is **not** the environment, and after a wholesale
  substitution it remains **unexplained**. Per dev-09, (p) is therefore two
  faults: a plaster deficit the environment does explain (ceiling −14.4 → −4.2)
  and a sky-blind-wall excess nothing yet accounts for.
- Chroma is not fixed by the conversion — ceiling R−B goes 11.9 (raster) → 7.8
  (gradient) → 0.7 (converted sky), i.e. *cooler*, not warmer. The app's warmth is
  a white-balance tint on the hemisphere and ambient lights, and those are exactly
  the ones dropped from the snapshot. No environment can restore light that was
  never copied — so the dropped-lights finding is the half that survives every
  intervention tried.

Also corrected by dev-09 (`.326`): it had said `scene.background` "passes the
predicate outright". It does pass, and passing turns out **not to be sufficient** —
`EquirectHdrInfoUniform` builds its CDFs from `map.image.data`, which an
`HTMLCanvasElement` lacks, so a canvas-backed equirect passes
`isReusableEquirectEnvironment` and then silently yields zero samples and no
error. Unreachable today (only an `RGBELoader` DataTexture gets there), but the
predicate is weaker than its name implies.

The implication for *this* goal is unchanged by the retraction, because it never
depended on the redistribution figures: the lux model is calibrated to the
renderer (`SCENE_INTENSITY_CALIBRATION`'s own docstring says so), and the
renderer's dominant light source is a hardcoded gradient. So "reconcile the lux
model against the render" is the wrong direction — both halves need anchoring to
real photometry independently, and the already-parsed IES pipeline in
`src/lighting/ies/` is the natural anchor for both. If anything the retraction and the
subsequent null result strengthen it, and sharpen it into two claims that depend
on no ratio at all:

1. The render's dominant light source is hardcoded **in preference to** a faithful
   hour-aware sky sitting in the same scene — so the mis-calibration is not an
   oversight about an unavailable input.
2. Even after substituting that sky wholesale, one surface stays ~36 counts off
   with **no known cause**. A reference carrying an unexplained per-surface error
   of that size cannot anchor a lux model whatever the environment does.

Claim 2 is a null result, which is why it is the robust one: it has the property
(a direct comparison with no baseline arithmetic) that the retracted figures
lacked.

dev-09 also warns (item (u)) that the HQ tracer is nondeterministic between
discrete classes, now on firmer ground via a sign-reversal confirmation (class A
brighter than B under the normal grey gradient, 181.5 vs 115.2; darker under a dim
blue one, 6.8 vs 96.6). No measurement should be taken off an HQ still without
recording which class it came from. Both (p) and (u) await its user's decision and
are outside this document's scope; noted so this research does not build on a
moving reference.

## Coordination

**Resolved 2026-09-02 — no overlap.** `dev-09` confirmed it is working in
`/Users/cwlroda/dev/sofa-graphics-realism` on `fix/graphics-realism-tiers`, scoped
to the graphics-realism / photorealism arc (HQ path-tracer fidelity, rounds
.249–.324). It touches none of `drawingSet.ts`, `settingOut.ts`, `section.ts`,
`src/analysis/`, `src/lighting2d/` or `src/materials/` — in `src/` proper its whole
arc is one file, `src/scene/pathtrace/hqRenderSession.ts` + its test. G1 and G2,
the plausible overlaps given its flat-geometry work, are clear.

Its arc lives mostly in docs it owns: `scripts/dev-probes/light-distribution.mjs`,
`docs/research/2026-08-31-photoreal-shadow-depth.md`,
`docs/open-graphics-decisions.md` (items (n)–(v) are its additions),
`docs/hq-tracer-probe-notes.md`.

**Known unavoidable conflict.** The repo rule that every commit bumps
`src/version.ts` and logs in `CHANGELOG.md` means both files will conflict; dev-09
has 76 such commits (.249–.324) **unpushed in its worktree**, so they are absent
from `staging` and invisible from here. Whoever merges second rebases. Nothing
else on the nine-gap list should conflict.

All `dev-1a` work stays in `/Users/cwlroda/dev/sofa-pro-designer`
(`research/pro-designer-gap-analysis`, based `a8022e1c`). Per dev-09: basing there
misses nothing of its work, since nothing of its has landed since v0.31.5.248.
