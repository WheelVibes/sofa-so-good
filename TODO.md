# TODO

Deferred-work log — **open items only**. `CHANGELOG.md` is the source of truth for what shipped;
when an item ships it is **removed from this file entirely**. Maintainability refactors live in
`TASKS.md`.

## ~~A door into a bedroom should be checkable~~ — the check is ILL-FORMED (v0.31.8.85)

v0.31.8.84 proposed it after having to correct a claim that two new service-band doors did not
open into a bedroom. Built the sweep: resolve the room 0.5 m either side of every interior door
and flag any that lands in a `bedroom` / `masterBedroom`, skipping doors whose other side is also
a bedroom or a bath (ensuite / between-bedrooms are a different question).

**It returns 20+ doors and almost all of them are CORRECT.** `jb-bed2 -> jb-bed2`,
`emu-master-door -> emu-master`, `h3-master -> h3-master` — these are bedrooms' own doors off a
corridor, which is exactly what a bedroom door should be. "A door opens into a bedroom" is the
normal case, not a defect.

**Nothing structurally distinguishes `h4-svc-door` from `jb-bed2`**: both are circulation into a
bedroom. What makes the service-band door objectionable is that the bedroom then sits on the ONLY
route between two halves of the flat — and that is precisely what
`src/floorplan/throughRooms.test.ts` measures. No new check is needed.

**Why `throughRooms` does not catch these two.** Its `rectIsTheRoom` gate requires all four edges
of a room's rectangle to have a wall within 0.15 m, and `tpl-hdb-4room`/`-5room`'s Bedroom 3 does
not qualify.

**CORRECTED in v0.31.8.87 — this does NOT land on the room-rectangle fix.** Classifying all 46
terminal rooms by why `rectIsTheRoom` rejects them: of the 22 rejected, only **6 fail by 0.20 m**
(a real rect shortfall the fix would recover), 1 by 0.40, and **15 have NO wall on the failing
side at all** (0.60-1.60 m). `tpl-hdb-4room/h4-cbath`'s rect is bounded by exactly one authored
wall. Those 15 are already recorded, from the other end, as
`templateEnclosure.test.ts`'s `KNOWN_SHARED_ENCLOSURES`, and its docstring already attributes them
to open-graphics item **(f)**. Snapping a rect edge to a wall face cannot help a rect with no face
to snap to. **The blocker here is (f), not the rects** — and (f) is not mine to decide.

## The walk -> orbit return holds its "Switching to overview..." splash past any settle

Found while adding `scripts/scenarios/window-backdrop-veil.json` (v0.31.8.50). Setting
`cameraMode` back to `orbit` from walk leaves the full-screen "Sofa So Good / Switching
to overview..." transition splash up for longer than the harness will wait — 6000 ms was
not enough.

**This is pre-existing and it is silently costing coverage.** The SHIPPED
`scripts/scenarios/backdrop-walk-simple.json` ends on `back-orbit` + 2000 ms +
`shot-orbit-again`, and that frame is the splash — so its last screenshot has been
verifying nothing. Reproduced on an unmodified build, so it is not the v0.31.8.50 glass
change.

Worth finding out whether the splash is waiting on a frame the headless harness never
delivers (invalidate-driven render loop + no rAF pressure) or genuinely takes that long
for a user. If the former, a `waitFor` on the splash clearing is the fix and
`backdrop-walk-simple`'s final assert comes back for free.

## Interior walls dropped at `performance` — ✅ FIXED (WALL-NO-COMPOSER, v0.31.5.67)

**Resolved 2026-08-29.** `Effects.tsx` no longer returns `null`: a composer mounts at every tier,
with `ao={false}` keeping `N8AO` off at `performance`. Discriminator `mainBedroom` yaw 2:
**150.7 -> 113.8** at `performance`, `medium` unchanged at 112.6. Capture still returns a real
image (1.45 MB / 100% non-black). Priced at `performance`: p50 4.1 ms / p90 4.4 ms / 59.9 fps
before AND after. Full write-up in `src/scene/CLAUDE.md`; `composerPlan()` pins the invariant.

## RETRACTED: `.75` FIRST-PAINT-ORBIT was an instrument artefact (v0.31.5.76)

**`.75` claimed the after-dark first paint is "89% near-black" and that
`ensureDaylightFirstPaint` "does not achieve" its stated goal. Both claims are WRONG. The guard
works. There is no defect here, and this is no longer an open item.**

**What the metric actually measured.** `.75` took the mean and near-black fraction over everything
OUTSIDE the modal card and toolbar. At 22:00 that region is dominated by the empty night background
around the dollhouse — correctly black at 10 pm. Worse, the card exclusion (x 20–43, y 9–30 of a
64x40 grid) removes the CENTRE of the frame, which in an unobstructed shot is exactly where the
flat is. So the figure measured the void and masked out the subject.

**Re-measured over the dollhouse region, no card exclusion:**

| wall clock | mid-tour | unobstructed |
| --- | --- | --- |
| 13:00 | mean 127.2, 0.0% near-black | mean 142.3, 0.0% near-black |
| 22:00 | mean **91.9**, 39.2% | mean **84.4**, 39.0% |

and the remaining near-black fraction is still mostly the background inside a rectangular sample of
a non-rectangular model.

**The frame settles it** (meta-rule v). `/tmp/fr-seq/22-4-unobstructed.png` shows a warmly lit,
fully legible dollhouse at 22:00 — kitchen, living room with the TV and floor lamp glowing,
bedrooms, the whole plan readable — against a black night background. That is precisely the
outcome `firstPaintDaylight.ts` was written to produce, and it produces it.

**What `.75` got right, and should be kept:** the first-run path had never been swept, `first-run.mjs`
is a genuinely new instrument, and the sequence sweep established two useful facts —
**`cameraMode` stays `orbit` through all 9 tour steps** (the tour never moves the camera, so the
`.56`–`.70` verdicts are not undermined by it), and the tour steps are UI-anchored tooltips rather
than camera moves.

**Lesson recorded in the playbook:** a region mask built to exclude chrome can exclude the SUBJECT.
Before quoting a masked statistic, render the mask and confirm it contains the thing being judged.

## `lightsMode` at boot — EXPLAINED, and it is a deliberate feature (v0.31.5.74)

**RETRACTION of `.73`'s framing.** `.73` called this "a regression of a shipped product decision —
the app is still doing the thing that was removed for being surprising". **That is wrong.** The
mechanism is `src/state/storage/firstPaintDaylight.ts` — `ensureDaylightFirstPaint()` — which is
deliberate, documented, unit-tested, and was added AFTER the `'auto'` removal, not in spite of it.

```
DAYLIGHT_START = 8, DAYLIGHT_END = 18
ensureDaylightFirstPaint(now = new Date()):
  if timeMode !== 'system'   -> no-op   (never overrides a real preference)
  if lightsMode !== 'off'    -> no-op
  if isDaylightHour(now)     -> no-op
  else setLightsMode('on')
```

Its own header explains the reasoning: `timeMode` defaults to `'system'`, so a brand-new visitor
opening the app after dark was shown a **pitch-black flat** — the move-in demo seeds 87 items and
every one is invisible, through onboarding, the whole 9-step tour and the location prompt (Chrome
audit 2026-08, boot at 20:00). It also records that overriding the CLOCK was tried first and
rejected, because it silently disagreed with the time shown in the Scene panel.

**The two are different behaviours.** The removed `'auto'` mode was CONTINUOUS follow-the-sun —
lights turning themselves on and off as time passed, which users found surprising. This is a
ONE-SHOT first-paint guard, fresh seed only, both settings still untouched. `.73` conflated them.

**Every observation now fits exactly**, including the one that looked like noise: `DAYLIGHT_END` is
18, so `.68` at 17:40 local was still inside daylight and read `off`.

| round | local time | daylight window? | `lightsMode` |
| --- | --- | --- | --- |
| `.54` | 10:04 | yes | `off` |
| `.62` | 14:20 | yes | `off` |
| `.68` | 17:40 | yes (just) | `off` |
| `.72` | 20:00 | no | `on` |
| `.73`/`.74` | 20:30+ | no | `on` |

**The falsifying arm passed** (meta-rule lxii): booting at 13:00 vs 22:00 and diffing the WHOLE
store, only **2 of 133 scalars** differ — `lastSavedAt` (the faked clock) and `lightsMode`. Same 87
items, no onboarding/callout/seed flag differs. So the clock is not selecting a different startup
path; the lights are the effect, not a symptom.

**What this means for open item (a) DEFAULT-GLOOM — it is now a much sharper question.** Outside
08:00–18:00 the app ALREADY does what `.54` proposed, and `firstPaintDaylight.ts` records the
measured opinion that a night render with lights on "is not just legible, it is the more inviting
first impression of the two". So the open decision is precisely: **should the first-paint guard
also apply during daylight hours?** That is a one-line change (`isDaylightHour` → always) with an
existing precedent, an existing test file, and `.54`'s 2.3–2.5x measurement as the daytime payoff.
Still the user's call — but it is no longer "change a default", it is "extend a guard that already
exists".

**RESOLVED — the user chose to extend it, SHIPPED in v0.31.5.86.** `ensureDaylightFirstPaint` now
fires at every hour; the `isDaylightHour` gate and the `DAYLIGHT_START`/`DAYLIGHT_END` constants are
gone (they had no other consumer). Verified by A/B at a faked SYSTEM clock: `lights-boot
FAKE_HOUR=13` reads `lightsMode=off` on the old guard and `on` on the new one, while `FAKE_HOUR=21`
stays `on` — so the daytime case flipped and the night case is untouched. Both preference guards
(`timeMode !== 'system'`, `lightsMode !== 'off'`) are unchanged, so a user who has ever expressed a
preference is still never overridden.

## Curtain cuts through the bedside lamps — RESOLVED as content (v0.31.5.61 -> v0.31.5.87)

**FIXED in v0.31.5.87, on the user's decision.** Taken in **x**, because the arithmetic says there
is no z solution: the curtain panel hangs at z 0.48-0.58 and the room's north interior wall is at
z 0.20, so a 0.40-deep nightstand against that wall always reaches z >= 0.60. Nor was there an x
solution at the old curtain width — 2.2 m spanned x 0.6-2.8, while the west wall forces the left
nightstand's centre to x >= 0.425 (max x >= 0.65). So BOTH had to move: the curtain narrowed
2.2 -> 1.9 (x 0.75-2.65, still overhanging the 0.8-2.6 glass on both sides) and the nightstands,
lamps and desk plant went outboard to x 0.475 / 2.925. Pinned by `defaults/mainBedroom.test.ts`,
which fails 4 of its 9 assertions on the old geometry. The original diagnosis is kept below.

### Original diagnosis (v0.31.5.61)

**Mechanism settled. The remaining question is a design choice, not a rendering one, so it is
listed with the other open product items rather than fixed unilaterally.**

Both `mainBedroom` bedside lamp shades render with a clean V-notch bitten out of the top edge,
curtain visible through the bite, at 13:00 and at 22:00 alike.

**Hypothesis A (transparency sort) is REFUTED.** Measured on the drawn materials, both the lamp
shade and the curtain are `transparent=false, opacity=1, depthWrite=true, depthTest=true,
renderOrder=0`. No transparency sorting is involved anywhere. This is not a render bug, and there
is nothing else in the flat sorting wrongly against the curtains.

**Hypothesis B (geometry) is CONFIRMED, with coordinates.** They simply interpenetrate:

| | world z span |
| --- | --- |
| lamp shade (`#f0e4c4`, 0.30 x 0.16 x 0.30, `side=2`) | **0.30 – 0.60** |
| curtain panel (`#c8bca8`, 0.10 deep) | **0.48 – 0.58** |

The curtain plane passes straight through the shade; the "notch" is an ordinary intersection,
correctly rendered. `side=2` (DoubleSide) is why the shade's inside is visible through the cut.
`defaults/mainBedroom.ts` puts the nightstands at `[0.67, 0.45]` / `[2.73, 0.45]` and the 2.2 m
curtain at `[1.7, 0.28]`, spanning x 0.6–2.8 — so both nightstands sit **under** the curtain.

**`CURTAIN_SILL_STANDOFF` is NOT the lever (meta-rule xvii-b).** Its 0.2 is derived in
`placement/windowSnap.ts`: the sill ledge projects ~0.14 past the centre-line and the fullest folds
dig 0.09 back, so `standoff >= 0.14 + 0.09 - 0.05`; 0.20 leaves 0.02 of margin, and the previous
0.16 read as the curtain embedded in the wall. Reducing it re-introduces a fixed bug.

**Three candidate fixes, all measured, none clean:**
1. **`length: 'sill'`** (a mode the `Curtain` primitive already supports). Hem lands at
   `sillY - 0.1 = 0.85` against a shade whose top is at **0.92** — reduces the overlap to 0.07 m
   but does NOT eliminate it, and restyles the room's only window.
2. **Move the nightstands out.** For a 0.30 m shade to clear a curtain ending at z 0.58 the
   nightstand centre needs z >= ~0.73, i.e. a 0.4 m nightstand standing 0.33 m off the wall. Looks
   wrong.
3. **Narrow the curtain to the glass** (x 0.8–2.6 instead of 0.6–2.8). The left nightstand spans
   x ~0.42–0.92, so it still overlaps. `CURTAIN_OVERHANG` is also deliberate (covers the window).

**Recommendation if the user wants it fixed:** (1) plus dropping the lamp a little, or accept that
a bedside table under a floor-length curtain is what the layout asks for. Note `bedroom2` has the
same arrangement 0.15 m further out and is only marginally better — this is not a `mainBedroom`
outlier.

## Wall mottle — the flat's largest surface — ✅ FIXED (PLASTER-STRETCH, v0.31.5.56)

**Resolved 2026-08-29.** The mottle was the orange-peel plaster normal stretched over 2.5 m;
`PLASTER_UV_SCALE` is now 0.6 and `generators.ts` no longer carries a second hardcoded copy of
the number. Microcontrast 0.442 -> 0.961 at the shipped state. Full write-up in
`src/materials/CLAUDE.md`. The candidate list below is kept because two of its three guesses were
WRONG and the reasoning is worth not repeating:


**Not yet diagnosed; recorded so the next round starts from evidence rather than from a hunch.**
The `.55` coverage re-run established that walls are **~45% of the walk view**, and the biggest
single class (`#f5f5f0`, ~31.5%, `normalMap + roughnessMap`, **no albedo `map`**) does not read
as painted plaster in the frames. Cropped in on `livingDining` from
`/tmp/surface-coverage/livingDining.png`, it shows broad soft grey blotches at roughly a
20–40 cm scale — closer to damp-stained concrete or stucco than to interior paint, which should
be near-flat with only a fine orange-peel grain.

This is the highest-coverage surface in the flat, so by meta-rule (viii) it outranks anything
else currently open. Candidate mechanisms, all falsifiable and none yet tested:

- the wall normal map's world-scale `repeat` is too low, so its noise octaves land at
  decimetre scale instead of millimetre;
- the drawn map is a stale low-res bake (PERF-C's 64² preview never swapped for this class) —
  `stale-gen.mjs` / `bath-tile-size.mjs` label textures by uuid against the cache's own builds
  and would settle it;
- the mottle is authored into the ROUGHNESS map and only reads as albedo variation under the
  current lighting.

Measure before changing anything: `surface-detail.mjs` with a `POINT` on the wall reports
microcontrast, which is the only metric here that can see a high-frequency vs low-frequency
difference. Note that `wall-detail.mjs` already swept what each wall CHANNEL is worth
(normalScale x6, normal removed, albedo mottle added) — check its recorded result before
proposing a channel change (meta-rule xvii-b).


## F13 schema migration — make the plan level-agnostic (user-authorised 2026-09-03)

> User: "I don't have any users, so we can migrate the schema fully." Removes the back-compat
> constraint that forced the ground-only design in the first place
> (`docs/research/multi-level-design.md`: "additive, no schema-version bump").
>
> **Why**: the ground-only invariant produced EIGHT silent bugs in one arc — three in new modules
> (v0.31.5.375) and five pre-existing (v0.31.5.376). Every one only misbehaved on a
> landed/maisonette plan, with no error. Two attempts at a lint guard failed (above).

**Target shape.** Split "the whole home" from "one storey's geometry" so the compiler forbids the
confusion:

```ts
interface LevelGeometry { rooms: PlanRoom[]; walls: PlanWall[]; openings: PlanOpening[] }
interface PlanLevel extends LevelGeometry { id; name; elevation; ceilingHeight? }
interface FloorPlan  { /* metadata only */ levels: PlanLevel[] }   // levels[0] = ground
type SingleLevelPlan = Omit<FloorPlan, 'levels'> & LevelGeometry   // what levelAsPlan returns
```

Single-level helpers then take `SingleLevelPlan` and their BODIES are unchanged (they still read
`.rooms`); whole-home consumers take `FloorPlan` and must go through `planLevels`/`allPlanRooms`.
Passing a `FloorPlan` where one storey is expected becomes a compile error.

**Measured blast radius (experiment run 2026-09-03, then reverted): removing the three fields from
`FloorPlan` yields 1368 `tsc` errors across 212 files** (149 non-test + 98 test). So this is
multi-tick and MUST be staged — a big bang would leave the repo uncompilable across tick boundaries.

**Staging, each stage its own green commit:**
1. `levels` becomes canonical; the legacy trio stays as a mirror of `levels[0]`, kept in sync at
   every plan constructor, plus a drift guard asserting reference equality. `planLevels` reads
   `levels`. Suite green throughout.
2. Migrate consumers in dependency order — `analysis` → `export` → `floorplan` → `state` → `ui` —
   annotating single-level helpers as `SingleLevelPlan` as they are touched.
3. Migrate test fixtures (98 files). A `makePlan({rooms, walls, openings})` helper keeps this
   mechanical.
4. Remove the legacy trio; add the schema migration and bump the save version. `tsc` is the
   worklist — the error count is the progress metric.

**Blast radius, measured properly at v0.31.5.387: 1279 errors across 205 files (503 non-test).**
The v0.31.5.386 claim of "135 errors, down 90%" was WRONG — the script removed the fields from
`PlanUpperLevel` instead of `FloorPlan`. There is no material reduction, and there was never going
to be: the deletion's cost is dominated by **legitimate single-level consumers** that correctly
take one storey and merely declare `plan: FloorPlan`. Those were never bugs, so the consumer
migration never touched them. The final stage is a mechanical sweep of their signatures to
`SingleLevelPlan`, largely orthogonal to the ~35 bugs already fixed.

**To re-measure (and do it this way):** split `types.ts` at `export interface FloorPlan {`, remove
the three fields only AFTER that point, `grep` to confirm the surviving `walls: PlanWall[]` line is
the `PlanLevelData` one, THEN run `tsc`. Printing and reading the edited lines is the step whose
absence produced the false number.

**The final stage is therefore a deliberate multi-session job, not a tick's work.** Shape
(unchanged, and confirmed to dev-09): `FloorPlan.levels: PlanLevelData[]` with ground at
`levels[0]`; `levelAsPlan` returns `SingleLevelPlan = Omit<FloorPlan,'levels'> & {walls, openings,
rooms, levelId, levelElevation}`. Order that keeps it tractable: (1) land `SingleLevelPlan` as an
alias of `FloorPlan` and migrate single-level consumer SIGNATURES to it with no behaviour change
and a green suite — this is the ~200-file bulk, splittable across many commits; (2) only then make
`SingleLevelPlan` a real distinct type and delete the fields, which by then is small.

**Revised staging (v0.31.5.377).** Stages 1-3 need NO schema change: `planLevels` already derives the
level list from the legacy fields, so consumers can move onto
`allPlanRooms`/`allPlanWalls`/`allPlanOpenings`/`levelAsPlan` with the suite green at every commit,
and only the final stage deletes the fields and bumps the version. The originally-recorded "add a
stored `levels` field and keep it in sync with the legacy trio" is WITHDRAWN — duplicate storage
with a sync obligation is a drift bug waiting to happen, and it buys nothing the derived read path
does not already give.

**The final stage MUST also migrate `scripts/dev-probes/` (dev-09, verified 2026-09-03).** Sixteen
probe scripts index `plan.openings`/`plan.walls`/`plan.rooms` directly off the live store —
including `light-distribution.mjs`, the primary instrument of the graphics-realism arc. Reading the
live store does NOT protect them: the field NAMES are the exposure. Worse, their `?? []` fallbacks
mean that with the fields gone every lookup silently finds nothing and the probe fails at "no window
matched", which reads as a scene bug rather than a schema change. `allPlanWalls`/`allPlanOpenings`
(added in .276) are the replacements. Either migrate them in the final commit or tell dev-09 the
exact commit so it can — do not leave it to be discovered.

- **[coverage gap I CREATED in v0.31.8.21] Wall-mounted load is checked by nothing.** `.21` stopped
  `floorLoading` counting `mounted` items as FLOOR load — correct, a wall shelf hangs off the wall —
  but it removed a wrong finding without leaving a right one. Measured: a `wall-shelf` now produces
  zero load findings from `floorLoading`, `designScore` (its only issues are daylight/lighting) and
  the layout critique. Before `.21` the user at least got a finding that was wrong in KIND but right
  in OBJECT; now there is silence.
  Researched figures if this is taken up: a 12 mm gypsum drywall partition with metal studs holds
  **~10 kg** using a toggle anchor through the board INTO a stud; a screw into bare gypsum holds
  only **2.2-4.5 kg**; solid walls "hold a TV almost anywhere", and HDB walls are concrete
  100-150 mm or drywall partitions 75-100 mm. A 200 kg loaded bookcase is two orders of magnitude
  past the drywall figure.
  **Why it is not built yet:** the check needs to know whether the wall behind the item is drywall
  or concrete, and `establishedWallStructure` resolves only EXTERNAL walls — internal partitions,
  exactly the ones shelves hang on, stay `'unknown'` (v0.31.8.4, deliberately). So the check would
  either fire unconditionally ("confirm the fixing", low value, and it cannot distinguish 200 kg
  from 2 kg usefully) or fire almost never. The honest version is probably a mounted-item SCHEDULE
  with estimated weights and the drywall figure quoted, like the lamp-spec IP advisory: state the
  limit, ask for confirmation, grant no approval. Needs a feature flag.
- **[tidy] The HDB 50 mm rule exists as TWO constants for one regulation.**
  `analysis/floorBuildUp.ts:HDB_MAX_BUILD_UP_MM` (50) and
  `analysis/floorLoading.ts:CONCRETE_RAISE_LIMIT_M` (0.05) are the same rule —
  "HDB does not permit raising of floor level exceeding 50mm (inclusive of floor
  finishes) using concrete" — reached from two directions (finish thickness vs
  added dead load; the sources give both justifications for the one limit).
  Verified 2026-09-04, not a discrepancy today, but two constants for one
  regulation can drift and a future change to HDB's figure would need both
  edited. Worth one shared constant with both rationales recorded on it.
- **[layout critique] A desk MONITOR has its own viewing-distance standard, and is currently
  unchecked.** The TV check selects screens by the authored `screenContent` capability, which is
  `{tv-wall, flatscreen-tv, monitor}`, and then deliberately excludes `monitor`: a 28" desk monitor
  is viewed at roughly arm's length, not at 1.2-1.6x its diagonal, so applying the TV band would
  replace one category error with another (it was NOT in scope before either — the old `/^tv/`
  regex never matched it). Adding it properly means researching the monitor figure (viewing
  distance and the ~15-20 degree vertical angle guidance) and giving it its own band. Small and
  well-defined; just not the same rule.

## Hexagon tile setting-out — NOT MODELLED, and deliberately not faked (v0.31.8.16)

Every other tile family now carries its researched product `moduleMm`, so the
setting-out sheet covers them. Hexagons carry none, because `moduleMm` is a
`[w, h]` RECTANGLE and hex does not work that way. Researched: "hexagonal grids
do NOT align with room walls the way square tiles do, so perimeter cuts will be
irregular"; the field is set out from the CENTRE of the most visible area
outward; each perimeter cut is measured individually from the last full tile; the
flat-top vs point-top orientation changes how those cuts fall; and the trade
allows ~15% waste against ~10% for square tile.

Measured the cost of faking it — a 200 mm across-flats hex on a 2.4 x 2.0 m room:
true count by area 138.6 tiles (160 with the 15% allowance), rectangular model
**120** (13.4% short before waste, 25% short of what a tiler would order), plus a
uniform 76.2 mm end cut that no hex perimeter has.

Doing it properly needs its own model: centre origin, half-tile row offset,
per-tile angled perimeter cuts, and its own waste factor. Until then the sheet
counts these rooms as OMITTED and says so, which is the honest state.

## Wall-tile setting-out — ✅ SHIPPED v0.31.5.391 (table). Two follow-ups remain:
- **Opening-aware field.** Openings are currently cut around a field set out over the full face.
  A genuinely opening-aware setting-out (where a balanced centre may sit elsewhere, and the
  courses above a door differ from those beside it) is a larger model.
- ~~**Corner coursing consistency.**~~ **RESOLVED v0.31.8.14 — the premise was wrong.** This said
  "faces are set out independently, so courses do not generally align around a corner" and called
  the fix a larger job needing a design decision about which face's balance to sacrifice. Measured:
  courses are struck from the TOP of each face down, and every face of a room shares the room's
  ceiling height and its single per-room wall finish, so **the course grid is identical on all four
  faces by construction.** Bath/WC 1, Bath/WC 2 and the Kitchen each have all four faces at one
  `(fullCourses, bottomCut)` pair. What varies per face is the END CUT (175-300 mm across those
  twelve faces) — vertical joints on perpendicular faces, which are not meant to continue round a
  corner anyway.
  The one real exception is a face with its own `topHeight` (a shower knee wall) whose tiled height
  is not a whole number of courses: verified that 1.2 m on a 600 mm module still aligns, while
  1.1 m puts that face's joint at 500 mm against 600 mm — a 100 mm step, exactly
  `(2400 - 1100) mod 600`. That case is now REPORTED (`cornerCourseSteps`) instead of asserted
  globally, and the sheet note — which used to print the false claim to contractors — states the
  truth. Four tests pin it, including one that fails if the reference face is picked by order
  rather than by majority.
- ~~**A drawn wall-tile elevation**~~ DONE v0.31.5.392 — the course grid is overlaid on the
  existing elevation sheets (no new sheet), joints struck from the end-cut offset and from the
  ceiling down, cut bands tinted, drawn under the furniture.

### Original scoping note (kept — it was right that this was not a small job)

`tileCoursing.ts` sets out FLOORS only. Two wall tiles declare a 300x600 module and **nothing
consumes it** (measured: wall `moduleMm` coverage 2/57). Wall tiling is where a bad cut is most
visible — it lands at eye level, not underfoot — so this is worth doing, but it is not "run
`planTileCoursing` on walls":

- a wall run is set out from a DATUM COURSE (typically full tiles at the top with the cut at the
  floor, or aligned to a sanitary fitting), not centred like a floor;
- the run is interrupted by openings, so the field is not a simple rectangle;
- the four walls of a wet room must course CONSISTENTLY around corners, which is a cross-wall
  constraint the floor model has no equivalent of.

It needs its own model. See `docs/research/2026-09-03-authored-data-coverage.md` Finding A.

## `PlanWall.structure` unauthored on all 19 templates — a CONTENT + SAFETY decision, not a bug

Measured **0/225**. Three pro features (hackability overlay, demolition-sheet structural
classification, 3D wall-types overlay) are inert on 19 of 20 shipped plans.

**Do not "fix" this by seeding values.** `structure` is user-declared and never verified; the
templates are plausible reference layouts, not surveyed drawings; and a confident wrong
classification — especially a confident *permitted* — is the one direction of error this feature
must never make. Three options are written up with their trade-offs in
`docs/research/2026-09-03-authored-data-coverage.md` Finding B, including why seeding external
walls alone is the WORST outcome unless the overlay legend changes with it.
`src/authoredDataCoverage.test.ts` pins the 0/225 fact so it cannot drift either way unnoticed.

## Paint quantities — ✅ SHIPPED v0.31.5.393; substrate now DERIVED (v0.31.5.394).

The follow-up below is done: `FloorPlan.intakeState` is persisted and
`paintQuantities.ts:substrateForIntake` maps it to the substrate. Original note kept for the
reasoning:

**Persist the intake state so the substrate is derived, not assumed.** `paintQuantities.ts` takes
`substrate: 'primed' | 'bare'` and defaults to `'primed'`, stating the assumption on the sheet. But
the app ALREADY KNOWS: Smart Start asks whether the flat is `bto-bare` / `bto-ocs` /
`resale-asis` / `resale-stripout` (`furniture/intakeStates.ts`), and a BTO handover IS bare plaster.
That answer is applied once and thrown away — nothing persists it. Adding
`FloorPlan.intakeState?: IntakeStateId` (additive, no version bump per `src/floorplan/CLAUDE.md`)
would let the paint quantity pick its own substrate, turning a stated assumption into a derived
fact. Caveat already documented in `intakeStates.ts`: the curated default flat is not serialised, so
it would be session-only there — which is fine for a live-computed schedule and only matters across
a reload.

## Lighting lamp spec — ✅ SHIPPED v0.31.5.398, surfaced v0.31.5.399 (`lampSpecChecks`).

Remaining, and both are CONTENT decisions for the owner rather than fixes:
- **The default flat has an IP20 ceiling light in Bath/WC 1**, so the app's own move-in default
  fails its own IP44 advisory. Options: ship a wet-rated fixture variant and use it in the wet
  rooms; or leave it, on the grounds that a check which fires on a real design is doing its job.
  Do NOT silence it by editing the advisory.
- ~~**A per-item CCT/IP override**~~ DONE v0.31.5.400 (`props.lampCct`/`props.lampIp`,
  `resolveLampSpec`, inspector "Specification" group). Note the deliberate separation from the
  RENDER overrides `lightColor`/`lightIntensity` on the same item — do not wire one to the other,
  and see the test that pins it.
- ~~A report section for the advisory~~ DONE v0.31.5.401 — it prints in the report's Lighting plan
  section. A COMPLIANCE finding that lives only in the app never reaches the contractor.
- **Open (yours):** should the DRAWING SET carry it too? It is the document a contractor is most
  likely to be handed, but the set is already 42 sheets — a judgement about sheet economy, not
  correctness.

### Original scoping note — NOTE its lumens claim was WRONG, see .297

`lighting2d/lightingPlan.ts`'s schedule rows carry `type/label/count/height/intensity`, where
`intensity` is a three.js unit. Missing, and measured **0/6 emitters** in
`furniture/lightEmitters.ts`:
- **lumens** (or W) to specify the lamp;
- **colour temperature (K)** — in SG, 3000 K living vs 4000 K kitchen is a spec, not a preference;
- **IP rating** — a bathroom fixture must be IP44+, which is COMPLIANCE, not just procurement.

Scope: extend `EmitterSpec` with the three fields (authored per emitter, six of them), add the
columns to the schedule, and add a wet-area IP check to the compliance/checks surface — a fixture
below IP44 in a `bath`/`powder`/`serviceYard` room is an advisory with a real basis.

**Do NOT derive CCT from `EmitterSpec.color`.** That hex is a render tint; converting it back to
Kelvin is deriving a specification from a rendering constant, the mistake `tileCoursing.ts`'s
header warns about. Author the figures from sources, as `.288` (tile modules) and `.292` (paint
coverage) did.

## Variation register — ✅ SHIPPED v0.31.5.408. Two follow-ups:

- ~~**Persist `tenderedSnapshot`**~~ DONE v0.31.5.409 — schema + `serialize` + `applySerialized`
  + `PERSISTENT_WATCH_KEYS` + the lock-step guard case, all in one commit. Absent hydrates to
  `null`, matching the slice's initial value.
- ~~**A printed register sheet**~~ DONE v0.31.5.410 — a "Variation register" sheet in the drawing
  set, naming the revision it varies from. Absent when nothing changed, because an empty variation
  sheet reads as "no changes since tender", a stronger claim than "nothing was compared".
- **CLOSED, deliberately NOT done (v0.31.5.411):** the seventeen-positional-argument signature on
  `buildDrawingSetHtml`. Do not "fix" this without reading the measurement:
  - `tsc` already catches a wrong argument COUNT (it caught the .309 near-miss immediately).
  - The only thing types cannot catch is a silent swap of two same-typed arguments — the three
    boolean sheet flags plus the two added in .309. **Swapping two of them in the signature fails
    four tests immediately** (measured, with the swap verified to have landed): every one of the
    five is individually pinned by an on/off test pair — `showSettingOut` at
    `drawingSet.test.ts:349`, `showCarpentry` at `:1087`/`:1128`, `showRcp` at `:1281`/`:1302`,
    and the two new ones by the `.309` sheet tests.
  - 102 call sites, of which only **22** reach the boolean tail. Smaller than it looks, and still
    the wrong trade: 22 hand-mapped edits through mostly-`undefined` placeholders, to prevent a
    fault tests already catch — where a slip in that very edit IS the silent swap being guarded
    against.

  **General rule:** a long positional signature is a smell, not a defect. Check whether each risky
  argument is already pinned before paying to restructure, and prefer a guard you can demonstrate
  in one experiment to a refactor you must get right in twenty-two places.

### Original scoping note (v0.31.5.407), kept — the three-part shape was the right call

A professional administering a renovation accounts for the delta between what was PRICED and what
is being built. In SG this is where disputes land: the contractor quoted from one drawing revision
and the finishes changed afterwards. **Nothing in the app tracks this.**

Most parts exist: `baselinePlan` (captured plan), drawing-set `revisions[]` + current letter, the
full cost model (`buildRenovationAllocation`, finish-area schedules, `itemPrice`), and `diffWalls`.

**The missing piece is a PRICED snapshot.** `baselinePlan` is a `FloorPlan` only — no finishes, no
items — so there is nothing to diff a cost against. Needs:
1. `tenderedSnapshot?: { plan, finishes, items, at, revision }` in state + `schema.ts` (additive).
2. A pure `buildVariationRegister(before, after)` diffing two `RenoAllocation`s per trade line, plus
   an FF&E delta, producing added / removed / changed lines with cost impact.
3. A surface: a report section and/or a drawing-set sheet, plus a "capture as tendered" action.

Do all three together — a core with no surface is the `.297` mistake, and this one is only useful
once a user can capture the snapshot.

## Audited-correct, do NOT "fix" these (v0.31.5.395, walls/openings added .295)

Sites that read `plan.rooms` and are RIGHT to:
- `ui/report.ts:181`, `ui/drawingSet.ts:1407` — the else branch of `multi ? levels… : plan.rooms`.
  On a single-storey plan `plan.rooms` IS the whole home.
- `floorplan/doorSwing.ts` room probes — its only caller passes a `levelAsPlan` result.
- `floorplan/rescalePlan.ts`, `gridSnap.ts`, `mirrorPlanRegion.ts` — whole-plan transforms that
  handle `upperLevels` separately and deliberately.
- `floorplan/autoDimensionSvg.ts:360` — a per-level sheet builder.
- The `opening.wallId → wall` pairs in `ui/reportPlanSvg.ts`, `layout/autoArrange.ts`,
  `lighting2d/luxGrid.ts`, `floorplan/planGeometry.ts`, `apartment/floor/planThresholdRects.ts` —
  internally consistent (a ground opening resolves to a ground wall) and every caller passes a
  per-level plan.
- `floorplan/rescalePlan.ts:87`'s `onGround` — named for what it is, part of the whole-plan
  transform.

**Items-side audit: CLEAN (v0.31.5.397).** Cross-item scans and whole-home `items` consumers were
swept and all are correct — `broadphase.ts` callers gate (`itemsCollide` / `walkway`'s own loop),
`floorLoading` is per-item so level-agnostic is right, `deliveryAccess`/`schemeOptions` are per-def,
and `cloneRoom`/`mirrorRoom`/`swapRooms` gate at the caller. Do not re-run this leg.

**RESOLVED v0.31.5.405 (was logged unresolved in .303).** The curtain-spec room resolution WAS the
probe argument; the apparent contradiction came from an arm-swap that never landed (biome had
reformatted the call across seven lines, so `str.replace` matched nothing). Measured with the swap
verified, the arms differ exactly as the frames did.

**Rule from it — an arm-swap is itself an intervention, and the one most likely to fail silently.**
A `str.replace` that matches nothing returns the original string and every downstream step still
succeeds. So: (a) assert the swap changed something, and (b) have the probe PRINT the state
actually in play beside its result. Both are cheap; the assertion is what caught this.

**USE `scripts/apply-edit.mjs` FOR SCRIPTED EDITS (v0.31.5.414).** It refuses to write
unless every edit matches the expected occurrence count, so the failure below cannot recur silently:

    echo '{"file":"src/x.ts","edits":[{"old":"a","new":"b"}]}' | node scripts/apply-edit.mjs

Original rule, kept for the history — **ALWAYS assert a scripted edit changed something (four
instances before the tool existed).** Every
`str.replace` in a helper script must be followed by an assertion, and every arm-swap must print the
state in play. Silent no-ops have now cost: the `.304` retraction (an arm-swap that never landed),
`.291` (a repair that matched nothing after biome reformatted), `.302`'s first sweep, and `.312`'s
rename. The pattern is always the same — the edit reports success, the result looks explicable, and
the conclusion is wrong. `tsc` catches some of these; nothing catches the ones inside a measurement.

**Sweep-pattern rule II (v0.31.5.403) — the one that actually bit.** `.294`/`.295` grepped
`plan.rooms.find(` and `floorPlan.rooms.find(`. **Every site in `.302` reads a LOCAL variable**
(`const rooms = allPlanRooms(plan)` … `rooms.find(...)`), so the pattern matched none of them and
the sweep reported the layer clean. Five real bugs. A pattern anchored on the RECEIVER
(`plan.rooms`) cannot see an aliased collection; anchor on the OPERATION instead —
`rooms.find((r) => pointInRoom` and friends — or better, don't rely on a grep at all.

dev-09's formulation is the durable version: **a regex over source is a SAMPLE, not an enumeration,
and its coverage is invisible in the result.** Two sweeps reported "clean" and neither could have
found these.

**Sweep-pattern rule (v0.31.5.397).** When grepping for "does this module know about levels",
the pattern MUST include `allPlanRooms|allPlanWalls|allPlanOpenings|upperLevels|levelById|
levelOfRoom` alongside the obvious `levelId|planLevels|levelAsPlan`. Omitting them reported 14
modules as level-unaware when only 6 were, i.e. an 8/14 false-positive rate — a sweep that
manufactures work rather than finding it.

**Fixture rule from .295, worth keeping:** for a LEVEL-GATING bug, place the storeys' geometry
APART — a fixture where both storeys' doors sit at the same offset makes the buggy and correct paths
agree, and four of six tests passed with the fix stashed. For the REVERSE bug (above/below
mis-attribution, e.g. `roomAtItem`) overlap is the right fixture. Which is stronger depends on which
direction the bug runs; decide before writing the fixture, and verify by stashing the fix.

**Remaining F13 follow-ups (v0.31.5.383).**
- ~~`elevation/projectElevation.ts` ground-only~~ FIXED in v0.31.5.384. The "dead export"
  claim in .282 was wrong — I grepped the doc-comment name (`allWallElevations`) rather than the
  real export (`projectAllElevations`), which three consumers use. Lesson: grep the SYMBOL, not
  the name you remember reading.
- Audited and found already level-correct, do not re-check: `daylight`, `airconSizing`,
  `openingSchedule`, `demolitionPlan`, `electricalPlan`, `plumbingPlan`, `settingOut`,
  `autoArrange`, `furnishPlan`, `Minimap` (via `minimapLevelView`), `rcp` (fanned out by
  `drawingSet`), `dxf` (ground-only BY DESIGN, documented in its header).
- Still unaudited: **`state/schema.ts`** and the **`apartment/*` render layer**. The render layer
  is lower risk than it looks — most of its `plan.*` reads sit INSIDE `PlanShell`'s per-level
  groups (each mounted at `level.elevation` with a `levelAsPlan` result), which is why none have
  surfaced. `schema.ts` is deliberately last: it is the serialisation boundary the FINAL migration
  stage rewrites, so touching it before then would mean doing that work twice.
  (`MeasurementOverlay`, `DesignScorePanel`, `suggestViews`, `usePlacementController` done in
  .284; `ElevationPanel` in .283.)

**A pattern worth naming, from .284.** Two consumers of the same overlay needed OPPOSITE answers
about elevation: the whole-plan overview must lift an upstairs room's markers by
`level.elevation` (it sits outside `PlanShell`'s per-level groups), while the per-room editor must
NOT (it draws the single room at ground level and applies no elevation). So "does this consumer
need the storey lift?" is a question about the RENDER TREE the consumer is mounted in, not about
the data — and it can only be answered by reading the mount site. Assuming one answer for both
would have floated the room-editor markers above the floor.

**Confirmed target shape (dev-09 asked, 2026-09-03).** The field IS `plan.levels: PlanLevel[]`
and the ground floor IS `levels[0]` — it does not stay separate. `levelAsPlan` keeps returning a
`SingleLevelPlan = Omit<FloorPlan, 'levels'> & LevelGeometry`.

**A consumer migrated AHEAD of the schema must be shape-tolerant, and the obvious form is not.**
`[plan, ...(plan.upperLevels ?? [])].flatMap((l) => l.walls ?? [])` reads the ground level as
`plan` ITSELF, so post-migration `[plan, ...]` contributes nothing and the consumer silently
returns the upper storeys alone — empty for a single-storey plan. Use
`const levelsOf = (p) => p.levels ?? [p, ...(p.upperLevels ?? [])]`, which takes the legacy branch
today and the new one after. This only applies OUTSIDE `src/` (the probes); inside `src/`, import
the `levels.ts` accessors and let them absorb the change in one place.

**Why a lint guard is not an alternative (the load-bearing justification, recorded here because it
gets lost once the diff is merged).** Grep cannot distinguish "whole plan" from "one storey" because
the difference lives at the CALL SITE, not in the text. `planTotalArea` is the proof: the plan
editor calls it per storey (correct) while three other sites passed the whole plan (wrong) — same
function, opposite verdicts, identical text. It is a TYPE question, and only the type split can
answer it. Two guard attempts were abandoned on this basis (see the entry above).

## Open — drawing accuracy (2026-09-02, pro-designer goal)
> Research + ranked gap list: `docs/research/2026-09-02-pro-designer-replacement-gaps.md`
> (11 gaps confirmed against source, G1-G11). Shipped work lives in `CHANGELOG.md`.
- **[G8 — ADDRESSED v0.31.5.369, one caveat open] `designScore` cannot rank genuinely different
  layouts.** Fixed by adding `analysis/layoutCritique.ts` as a SEPARATE measurement (TV distance,
  conversation range, coffee-table reach, sofa proportion — thresholds cited in
  `docs/research/2026-09-02-layout-critique-standards.md`), used as the tie-break above price. The
  three that tied at 83 now separate 89/85/79. **Sofa caveat CLOSED v0.31.5.370**: SG sources
  express sofa fit as an absolute width band (175-220 cm typical 3-seater, 190-210 cm for a 4-room
  HDB), not a ratio — so the derived 60%-of-span bar was replaced with the cited band, and it now
  flags the app's 2.60 m default sofa as genuinely over-scaled rather than restating that HDB rooms
  are small. Original note follows.
- **[superseded, kept for the reasoning] `designScore` cannot rank genuinely different layouts.** With the authored layouts wired in
  (v0.31.5.367), three substantively different arrangements (80/81/83 items, different furniture)
  score IDENTICALLY at 83 on every category, so the comparison falls through to the price tie-break.
  The categories are too coarse to express "this arrangement is better than that one". Adding the
  layout-critique dimensions G8 originally proposed — circulation route quality, sightlines to a
  focal point, conversation-grouping geometry, furniture-to-room proportion — is what would make the
  ranking mean something. Note this is a DIFFERENT problem from the circulation-saturation entry
  below: that one is a broken ruler, this one is a ruler that does not measure the thing.
- **[DIAGNOSED, not decided] The circulation score saturates at 0 for every auto-furnished layout,
  so 20% of the design score carries no signal.** Measured 2026-09-02 on the default 4-room plan:
  - hand-authored `defaultLayout()`: circulation **58** (0 impassable, 21 tight, 52 gaps) — the
    metric works;
  - every `furnishPlanItems` result, at layout seeds 0/1/2 and across presets: circulation **0**.
  **Scope narrowed v0.31.5.367**: the default flat now uses the authored layouts, which do NOT
  produce these pinches (circulation 58 there). This still applies to the CUSTOM-plan path, which
  goes through `furnishPlanItems` + the arranger.
  Cause is arithmetic, not a bug in the finder. `penalty = impassable x 20 + min(42, advisory x 3)`,
  so with the advisory term already at its 42 cap, just **3** impassable pinches reach 102 and clamp
  to zero. And the three found are all MARGINAL — `bed-single<->bed-single 0.44 m`,
  `wardrobe-3door<->armchair 0.47 m`, `desk<->sofa-3seat 0.44 m` — i.e. just under the 0.5 m bar,
  not catastrophically blocked routes. So the category cannot distinguish "tight in three spots"
  from "impassable throughout", and in the G8 scheme comparison every candidate scores 0, making
  circulation useless for ranking.
  **(a) DONE v0.31.8.3 on the maintainer's decision; (b) STILL OPEN; and a THIRD defect found.**
  Recalibrated against a 62-layout corpus (19 templates x 3 arranger seeds + 4 presets on the
  default plan + the authored flat). What the corpus showed was worse than the original diagnosis:
  **53 of 62 layouts hit `advisoryCap`, and for every one of those the score was exactly
  `58 - 20 x impassable`** — a 100-point category with five inputs behaving as a 4-valued function
  of one integer. Both terms saturated, not just one. Now: pinches graded by depth below the
  squeeze bar, advisory gaps charged by shortfall below the 0.9 m ideal, both capped so neither can
  zero the category. Corpus spread went 13 distinct scores -> 43, 8 floor-clamped layouts -> 0,
  median 58 -> 55.5. Circulation had NO unit tests before this; it has 8 now, two of which fail on
  the old arithmetic.
  **(b) is still the real problem and is NOT done** — the arranger still produces the pinches; the
  score has merely stopped lying about their severity.
- **[G7 — PARTLY DONE v0.31.8.4; the traced part CANNOT be done as asked] Template `PlanWall.structure`.**
  All 19 templates left `structure` unset on every wall, so the hacking plan reported an entire
  flat — facade included — as "Unclassified". `establishedWallStructure` now resolves an
  undeclared **external** wall to `'load-bearing'`, which is a documented HDB rule ("the external
  walls of your HDB flat belong to HDB and cannot be hacked") and matches what the curated default
  flat already declares and calls "deliberately conservative". It reads `thickness`, which is an
  authored DECLARATION that a wall is the envelope — not wall thickness in mm. Sources do say
  "structural walls are typically 150 mm or thicker, partition walls 75-100 mm", and that heuristic
  is deliberately NOT used: `structure`'s own docstring records why (a non-structural precast /
  Ferrolite partition and a load-bearing wall are identical on plan, a documented HDB
  hacking-plan failure mode), and it would manufacture confident wrong answers for precisely the
  walls people get hurt by getting wrong.
  **The maintainer chose "trace from official HDB plans", and that cannot be executed for
  templates.** A template is a flat-TYPE archetype, not a block: the structural layout of a 4-room
  flat differs by block and construction era, so an official per-block plan has no unique mapping
  onto a template. Internal partitions therefore stay `'unknown'`, which the sheet renders as
  "Unclassified" — correctly distinct from "removable with a permit". Two ways forward, both the
  maintainer's call:
  (a) add a `'shelter'` `RoomCategory` so household-shelter walls (universally RC in post-1997
      flats) can be established the same way. Blocked today only because there is no such category
      and recognising a shelter by NAME would be a guess about a taxonomy — the same mistake the
      rug-anchor regex made. Note the ripple cost: a new `RoomCategory` must update the union plus
      every exhaustive `Record<RoomCategory,…>` consumer (see the root `CLAUDE.md` rule);
  (b) let a user IMPORT their own block's official plan and classify against it, which is the only
      thing that can honestly resolve internal partitions for a real address.
- **[ATTEMPTED AND REVERTED v0.31.8.7 — read this before trying again] Reducing the arranger's
  bed-vs-storage pinches with a clearance-preferring placement does NOT work.** Four things were
  established; the first two are gaps worth fixing on their own terms, the last two are why the
  obvious fix fails.
  1. **`CLEARANCE.storageFront` (0.75 m) had ZERO consumers — now REPORTED (v0.31.8.8).** The
     Layout critique's new `storage-access` check measures the clear floor in front of each
     openable piece; the authored default flat passes and 17 of 20 auto-furnished templates warn,
     wardrobes at 0.00-0.37 m. Reported, not enforced — see item 4 for why enforcement fails.
     `bedSurround` is still only a soft scoring penalty and remains unenforced.
     ORIGINAL NOTE: `designRules.ts`'s header calls
     these constants "the single source of truth for furniture spacing" that the arranger "should
     reference rather than hard-coding gaps", and
     `docs/interior-design-guidelines.md` tabulates `storageFront` as a rule the app follows.
     Nothing enforces it anywhere. `bedSurround` fares slightly better — it appears only as a soft
     scoring penalty in `scoreBedroomEdges`, never as a constraint.
  2. **`snapToWall` tries exactly ONE along-wall position per edge** — the piece's seeded position
     clamped to fit — so a wall with room somewhere ELSE along it reads as full. The comment at the
     bedroom storage loop claims "Collision enforces door-swing gaps"; it does not. `canPlace`
     tests OVERLAP plus the ROOM's door keep-outs, and nothing reserves floor for a wardrobe's own
     doors.
  3. **Adding along-wall candidates clears 3 blocked windows and COSTS 3 pinches.** Measured over
     62 auto-furnished layouts: blocked windows 11 -> 8 (`g3-liv-win`, `jb-b4-win`, `jb-b5-win`),
     large-piece pinches 39 -> 42, bed-vs-storage 18 -> 20. **Item count is IDENTICAL** (4584
     items / 845 large pieces), so the extra pinches are NOT the side effect of placing more
     furniture — that confound was measured and excluded. A window blocked by a wardrobe is
     arguably worse than a 0.46 m gap, but that is a product trade, not a fix, so it was reverted
     rather than shipped. **The numbers are here if the maintainer wants the trade.**
     Worth keeping regardless: `windowSightline.test.ts` records that "the 11 that remain have no
     windowless wall with room", and that is WRONG for those 3 — there is room, just not at the
     seeded along-position.
  4. **A local per-item clearance objective cannot fix pairwise pinches in a greedy sequential
     placer.** Storage is placed after the bed, so buying clearance from the bed pushes it into the
     desk placed later. Scoring against every floor item made it worse still (18 -> 22) because the
     objective disagreed with the metric: a route pinch needs BOTH sides to be a large piece, so
     nightstands and plants were dragging the wardrobe around while contributing nothing.
     Restricting the objective to large pieces recovered 22 -> 20, still short of the 18 baseline.
     A real fix needs joint placement with backtracking, or deciding the bed's along-position with
     storage in mind, or a post-pass that nudges large pairs apart (the Checks panel's "Nudge
     apart" fix already does this interactively, so the mechanism exists).
- **[AUDITED v0.31.8.13] F13 whole-home sweep of `state/schema.ts` and `apartment/*` — 2 gaps, rest
  clean.** Checked all 163 direct readers of `plan.rooms`/`walls`/`openings`; a function called with
  `levelAsPlan` is correctly reading them, so only whole-plan callers matter. Clean:
  `accessibility`, `ffeSchedule`, `openingSchedule`, `daylight`, `rcp`, `plumbingPlan`,
  `state/schema.ts`, and `hdbCompliance`'s rules. Fixed: (a) `hdbCompliance`'s emptiness GATE read
  the raw plan, so a home with an empty ground floor and populated upper storeys had its whole
  compliance section silently skipped — the rules were F13-correct and the guard in front of them
  was not, which is the worse half; (b) `occluderRectsForPlan` gave upper storeys no shadow
  occluder while `PlanShell` rendered their ceilings, so sun poured through 18 rooms across three
  templates. The occluder `y` needed the level ELEVATION, not just all-levels iteration.
- **[FIXED v0.31.8.6] `findNarrowGaps` reported pinches THROUGH walls.** The item-item pass
  measured an edge-to-edge distance and never asked whether anything stood between the pair, so 22
  of 59 corpus pinches (37%) were gaps nobody can walk through — 18 in different rooms, 4 in the
  same room (L-shaped rooms and stub walls). Now rejected via `isLineOfSightBlocked` on per-storey
  walls: 59 -> 39 pinches, median corpus circulation 55.5 -> 68.5, shipped flat 56 -> 65. Doors are
  treated as OPEN for that test only (a doorway is a route, so a pinch across one is real); the
  item-wall pass keeps its closed-door walls. The corpus cannot distinguish the two door states, so
  a constructed fixture in `walkway.test.ts` pins it instead.
  **What is left is genuinely the arranger, and now visible:** of the 39 real pinches, **18 are a
  bed against storage** (`bed <-> wardrobe` 8, `bed-queen <-> dresser` 5, `bed-single <-> desk` 5)
  and bedrooms hold 19. That is a placement fix, not a scoring one, and it is the next piece of
  work on this thread.
- **[MEASURED; THE PROPOSED FIX IS REJECTED WITH NUMBERS — v0.31.8.51] `findNarrowGaps` is BLIND
  below `CLEARANCE.sofaToCoffee`, and the obvious fix makes the app worse.** `layout/walkway.ts`
  skips any item-item gap `<= 0.40 m` as "intentional close spacing", so two large obstacles jammed
  0.05 m apart produce no circulation finding (measured at 0.05 / 0.25 / 0.32 / 0.40, all silent;
  0.45 reports normally — pinned in `designScore.test.ts`).
  **This entry used to propose: make the skip conditional on the pair NOT being two circulation
  obstacles, "`CIRCULATION.obstacleArea` already draws that line — a coffee table is below it".
  That premise is FALSE in this catalog, and the fix was built, measured and reverted.**
  - `coffee-table` is **0.605 m²** against a 0.5 m² bar. So are `tv-console` (0.720),
    `armchair` (0.722), `desk` (0.840) and `dresser` (0.600). The bar separates
    lamps/plants/nightstands (0.18-0.20 m²) from everything else — it does **not** separate
    "defines a walkway" from "arm's reach", which is the distinction the fix needed.
  - Built and measured over the 19 templates: **259 item-item findings -> 364 (+105 below 0.40 m)**,
    led by `bed-single<->desk` (14), **`sofa-3seat<->armchair` (12)**, `bed-single<->wardrobe` (12),
    `bed-queen<->dresser` (7), **`sofa-3seat<->coffee-table` (6)** — i.e. the canonical arm's-reach
    pairs the floor exists for.
  - Circulation **median 68 -> 28, sum 1251 -> 600, min 32 -> 0**. Two templates back at a floored
    zero, which is precisely the saturation v0.31.8.3 was written to remove.
  **What is actually true.** Two pieces 0.05 m apart are not a route anyone walks, so silence is not
  obviously wrong. What the finder cannot do is tell *"jammed together, walk around"* from *"this
  pair seals the only way through"*. That is a **route/connectivity** question — does removing this
  pair reconnect the room? — and no gap threshold can answer it. A real fix needs a reachability
  pass over the room's free floor (the flood-fill the `circulation` overlay already implies), not a
  smaller number. **Do not re-propose the threshold change**; `walkway.test.ts` now pins the
  rejection with the catalog areas that kill it.
  Also still true and worth keeping: `CIRCULATION.gradedFloor` is 0.40 rather than an anthropometric
  figure because of this floor, and the corpus finding "every impassable gap measured 0.400-0.500 m"
  describes the FINDER's range, not the layouts' quality. Do not quote it as evidence that nothing
  is blocked.
- **[G8 — DONE, one open content call] Theme grounding audit complete: 17/17.** Full record with
  citations in `docs/research/2026-09-02-scheme-theme-grounding.md`. Ten style themes audited (nine
  accurate; Modern Luxe corrected), seven `layout`-group presets are researched by construction.
  **The open content call is RESOLVED (v0.31.8.2), on the maintainer's decision.** Coastal put
  sky-blue on every dry wall and Tropical Biophilic put sage on every dry wall, whereas the
  references treat both as an ACCENT or a single feature wall — and the coastal sources warn that a
  blue-and-white commitment "may feel cold or too nautical" and tips into cliché. The maintainer
  chose to research SG-specific treatments and implement, so both themes now use a warm neutral
  foundation (Oat / Warm cream) with the theme colour on ONE fluted feature wall, grounded in SG
  sources that call fluted panelling the most-specified local feature-wall treatment and say these
  shades "work best on a single feature wall". Sources added to
  `docs/research/2026-09-02-scheme-theme-grounding.md`.
  **Follow-up, and its claim is UNVERIFIED (v0.31.8.79).** The note said a `painted` `FeatureWall`
  renders its flutes INVISIBLY — `getPaintedMaterial` has no map or normal map, and at a 3.0 m
  width the batten radius is ~25 mm, giving no shading cue face-on in diffuse light. `painted` is
  a user-selectable option on the def (`wood` / `painted` / `gloss`), so it is reachable even
  though both shipped presets use tinted `wood`.
  **VERIFIED and REFINED in v0.31.8.80, with a fixture kept as
  `scripts/scenarios/feature-wall-finishes.json`.** Coastal preset's panel at (12.53, 2.45)
  rot -pi/2, camera at (11.0, 2.45) yaw -pi/2, crop the panel interior.
  **The claim holds, and it is specifically a FACE-ON failure.** In one frame the painted panel
  reads as flat wallpaper stripes across the head-on two-thirds and as properly rounded ribs
  across the oblique third — which is the physics: a diffuse material on a shallow curve lit
  frontally has no gradient to show.
  **The mechanism is the material, not the geometry.** The flutes are real half-round cylinders
  (`FeatureWall.tsx`) sitting at `backT + battenR*0.5`, so they already protrude ~1.5x their
  radius — deepening them would overshoot a real half-round dowel. `wood` reads face-on only
  because `getWoodMaterial`'s GRAIN varies per rib and gives the eye something; painted has no
  map at all.
  **Caveat on the numbers** (ripple/px: wood 4.817, painted 0.770, gloss 1.875): they conflate
  grain with form, precisely because wood's advantage is texture. Quote them as a proxy, not as a
  measure of how well the flutes read.
  **So the fix is a normal map (or a subtle per-rib roughness variation) on the painted finish**,
  not a geometry change and not a lighting change.
  **`sheen` is NOT the answer — tested and refuted in v0.31.8.81.** The def carries a `sheen`
  param defaulting to 0, and a specular crown is what makes a real painted flute read, so it was
  the cheap hypothesis. Swept 0 / 0.3 / 0.6 / 1 from the same fixture: ripple/px
  **0.770 / 0.743 / 0.884 / 1.157** against wood's 4.817. Even at sheen 1 — a value no one would
  choose — the head-on region still reads as flat stripes; the highlights appear only where the
  reflection angle happens to line up, which is off to the side, not face-on. No default worth
  changing. It needs a MAP, not a parameter.
  **Peranakan Accent especially** — it is the one culturally specific theme, so getting its tiles
  and colours wrong is more than an aesthetic miss.
- **[site measurements — recording UI COMPLETE v0.31.5.373]** `SiteMeasuredField` is on the wall,
  room and opening inspectors with inline deviation feedback, verified on desktop and at a true
  390px phone viewport. **Optional follow-up, not a gap:** wire the plan editor's existing measure
  tool so a tap-and-type records directly rather than going via the inspector — faster on site, but
  the inspector path is complete and usable as-is.
- **[F13] Three `planTotalArea` call sites pass the WHOLE plan and understate a two-storey home.**
  `planTotalArea` is a legitimate single-level helper — `FloorPlanEditor` calls it per storey, which
  is the correct deliberate use, and it lives in `types.ts` so it cannot import `levels.ts` without a
  cycle. But `ui/shareSummary.ts`, `ui/shareCard.ts` and `ui/floorplan/ScalePlanModal.tsx` pass the
  whole plan, so a maisonette's stated area is ground-floor only. Fix at the call sites by summing
  `planTotalArea(levelAsPlan(plan, l))` across `planLevels(plan)`, as `analysis/renoTimeline.ts` now
  does. The share ones are cosmetic; the scale modal shows an area the user may act on.
- **[F13] A grep guard for ground-only reads does NOT work AT ANY SCOPE — do not re-propose it.**
  Attempted twice. First over `src/floorplan`: flags ~20 legitimate single-level helpers whose callers
  pass `levelAsPlan`, because the correct/incorrect distinction lives at the CALL SITE.
  (`planTotalArea` is the proof — the plan editor calls it per storey, correctly, while three other
  sites pass the whole plan, wrongly. Same function, opposite verdicts.) Then narrowed to
  `src/analysis`, which I had argued was uniformly whole-home: it is NOT. That layer also contains
  functions taking a pre-flattened or single-level plan in a parameter named `plan`
  (`hdbCompliance`'s rule functions since v0.31.5.376, `daylight`'s per-level recursion), plus
  comments that mention the property names. Measured 46 hits, and every one inspected was a false
  positive.
  **The lesson: "is this identifier a whole plan or one storey?" is a TYPE question, and grep can
  never answer it.** Which is the argument for the schema migration below — a type split makes the
  bug unrepresentable, where no amount of text matching can even detect it.
- **[delivery access] Corridor turn + per-project route override UI.** v0.31.5.374 checks the three
  rectangular apertures (lift door, cabin, main door) against published SG typicals. Not done:
  (a) the CORRIDOR TURN from lift lobby to front door — the sources say measure it before ordering
  anything over 1.5 m, but a turn is not a rectangular aperture and modelling it needs lobby geometry
  the app does not have; (b) a UI to enter the user's ACTUAL measured route, which the sources are
  emphatic matters ("even a difference of 5 to 10 centimeters"). The core already takes a `route`
  argument, so (b) is a form plus a persisted field — and it should reuse the `SiteMeasuredField`
  pattern from v0.31.5.372/.272 rather than inventing a second measurement surface.
- ~~**[layout critique] Add a walkway-width check using the SG figure, not the generic one.**~~
  **DONE v0.31.8.18 — and this entry's premise was WRONG.** It said the standards "disagree: 91 cm
  generic vs 'at least 70-80 cm' in SG guidance" and instructed a future check to "use the SG figure
  for this app". Re-researched: HDB's own renovation guidance is a **900 mm** minimum internal
  corridor width "to ensure free and safe movement" — the same bar as the generic 36". The 70–80 cm
  figure came from generic decor copy, not HDB, and following this entry as written would have made
  the app **more permissive than HDB's own guideline**. `CLEARANCE.walkwayIdeal` was already 0.9, so
  the constant was right and the note was wrong.
  Implemented as `accessibility.ts:MIN_WALKABLE_WIDTH` (0.9), a stricter tier than the 1.5 m turning
  circle, reported above it and worded distinctly ("too narrow to walk through, not just to turn
  in"). Applied to every habitable room's min span rather than to "corridors" — a room under 900 mm
  is unwalkable whatever it is called, and there is no `corridor` `RoomCategory` to key on.
  **It fires on no shipped plan** (168 rooms across 19 templates + the default flat, narrowest
  1.00 m), which is the honest reason it exists: a user-drawn corridor is the only place it can
  occur. **The route model now EXISTS** (`layout/reachability.ts`, v0.31.8.52/.53) — see the entry
  below.
- **[ROUTE ACCESS — MEASURED .52, RECALIBRATED .53, ANCHORED .54, FIXED .55, WIDENED .56,
  DISC + CLASH GATE + SATELLITES .86] 6 rooms across 3 of 19 templates still cannot be reached from
  the front door once the arranger has placed the furniture — down from 43 across 10 — and the corpus now
  carries ZERO overlapping pairs, down from 5.**
  **v0.31.8.86 made the search a DISC instead of a cross.** `±X`/`±Z` offsets cannot move a piece
  out of a CORNER, which is why `tpl-hdb-5room`'s four stranded rooms survived a pass whose own
  culprit attribution said either of two pieces would reconnect them: of 64 axis-aligned offsets,
  53 had nowhere to land and 11 landed still inside the pinch. Disc, nearest-first, is also
  FASTER (maisonette 1115 -> 856 ms) because `trialFits` rejects most offsets without a
  `solveGrid` and an early commit beats exhausting 64 misses.
  **The same release found the pass had been buying routes with OVERLAPS.** `trialFits` reads only
  the route raster, which excludes anything under `OBSTACLE_AREA_M2` — so a slide could park a
  sofa through a side table legally, and all 5 of the corpus's overlapping pairs came from here.
  Adding `itemHeightAwareClash` took that to 0 and took `tpl-hdb-2room` 1 -> 4 severed, which is a
  CORRECTION: those three were only reachable through an overlapping piece.
  **The disc also stranded three of `tpl-hdb-maisonette`'s dining chairs** (~1.5 m table move, the
  `diningChairTuck` defect), because a chair is under `OBSTACLE_AREA_M2` and so invisible to the
  raster. The pass now CARRIES a piece's satellites — nearest obstacle within 1.2 m — and
  clash-checks the riders against pieces and walls. That costs `tpl-1bed`'s Dining back.
  **WHAT IS LEFT, and why none of it is about the search:** `tpl-hdb-2room`'s four (a flat too
  small to hold the move-in layout and walk between it — this is a LAYOUT-PRESET question, not a
  route one), `tpl-1bed`'s Dining (traded for tucked satellites) and `tpl-condo-2bed`'s Common
  Bath (no single culprit, so a one-piece-at-a-time pass cannot open it by construction). **Do not spend another release on the search shape or the reach** —
  both are measured out.
  Superseded pre-.86 note follows.
  `unsealRoutes` runs in `furnishPlanItems` and slides the sealing piece; it moved 12 items and
  deleted none. **The reach lever is now MEASURED and spent** (.56): 1.2 m left 18 rooms,
  1.8 m left 11, 2.4 m leaves 10, 3.0 m gains nothing, so the reach is not where the remaining
  work is.
  **`tpl-condo-2bed`'s 8 were a TEMPLATE defect and are FIXED (.57)** — its front
  door opened into the Open Kitchen, whose only other exit the counter and fridge fill; moving
  the door into Living / Dining took it 8 -> 1 and broke nothing else in the suite.
  **What WAS left before .86:** `tpl-hdb-2room` Master Bedroom 0.9 m² (`dining-table-4`),
  `tpl-1bed` Dining 0.6 m² (`coffee-table`, FIXED by the disc), `tpl-condo-2bed` Common Bath
  1.5 m² (no single culprit).
  **A lever that was tried and is NOT worth re-trying: letting the pass ROTATE as well as slide.**
  Built in .57 with quarter-turns only (180° excluded, since it reverses facing on pieces whose
  rotation encodes it). Measured: used **zero times** across all 19 templates, identical 12 moves.
  It tripled the trial budget and fixed nothing, so it was reverted.
  **Superseded note: `tpl-condo-2bed` holds 8 of the 10, all behind one `kitchen-counter-l`.** Every position that would open the route puts the counter across a
  doorway, and the pass refuses that (rightly — it is the same rule `dropDoorBlockers` deletes
  on). Two honest ways forward, neither taken: (a) let the pass ROTATE a piece as well as slide
  it, which for an L-counter against a wall run is the move a designer would actually make;
  (b) treat this as a TEMPLATE defect — an L-counter that spans the only route between the front
  door and the living room is arguably mis-authored for the room, and re-authoring
  `tpl-condo-2bed`'s open kitchen would fix it at the source. (b) is probably right, since the
  counter is fitted joinery and sliding fitted joinery to open a walkway is not a design a
  contractor could build from. Plus one room each in `tpl-hdb-2room` and `tpl-1bed`.
  Original note follows. They are walkable on
  the empty template and unreachable once the move-in layout is placed: you cannot get in.
  `layout/reachability.ts` erodes the storey's free floor by half a body width
  (`CLEARANCE.walkwayMin`, 0.6 m) and flood-fills what survives, so the ruler is the body rather
  than a threshold — which is what v0.31.8.51 established was needed after the gap-threshold fix
  was built, measured and reverted (see `src/layout/CLAUDE.md`). Wired into `layoutCritique` as
  the `route-access` check, opt-in (`{ routeAccess: true }`) because it costs two rasters per
  storey, and surfaced in the report. Ratcheted in `routeAccess.test.ts`; 10 templates clean.
  Worst: **`tpl-hdb-jumbo` leaves a 5.7 m² pocket by the front door reachable and ~55 m² not**
  (8 rooms behind one break), `tpl-condo-2bed` 8 rooms / 25.7 m², `tpl-condo-penthouse` 6 /
  23.3 m². Read the counts as rooms BEYOND a break, not as a number of breaks.
  **The MOVER shipped in v0.31.8.55 and the cost worry was misplaced** — the 60-120 ms figure is
  `buildLevelGrid`, which is furniture-independent, so a trial placement is one `solveGrid` at
  ~2 ms. Build the grid once and hundreds of candidates cost less than one rebuild. Original
  note follows.
  **The MOVER is the next step and its cost is the constraint.** `sealedBy` (v0.31.8.54) names
  the piece to move — 39 of 43 have one — so a post-pass has a candidate and a discrete goal.
  What it does not have is a budget: each trial placement needs a re-solve, and a full
  `findFurnitureSeveredRooms` is 60-120 ms, so ~8 candidate positions x a few culprits is
  seconds per plan. That is far too slow for `furnishPlanItems`, which runs on every template
  load and a dozen times inside `schemeOptions`. Two ways out, both unmeasured: re-solve
  INCREMENTALLY (only the moved footprint's old and new cells change in `itemAt`, so the grid
  need not be rebuilt), or make the fix a user-triggered action in the Checks panel where
  seconds are acceptable. Decide that before writing the mover.
  **Where to start, from the culprit sweep (which single item's removal reconnects the room):**
  19 of the 22 have an identifiable single-piece culprit, and four defs account for 25 of the 29
  attributions — **`tv-console` 9, `sofa-3seat` 6, `dining-table-4` 5, `wardrobe-3door` 5**. So
  this is overwhelmingly the LOUNGE/DINING group parked across the circulation spine of an
  open-plan template, not a diffuse problem. A post-pass that re-places a piece which SEALS a
  room is the obvious shape, and unlike v0.31.8.7's rejected clearance objective it has a
  discrete, checkable goal (the room reconnects) rather than a continuous one that trades
  pinches around. 3 of the 22 have NO single culprit (`tpl-condo-2bed` Common Bath,
  `tpl-condo-penthouse` Master Bath + Master Bedroom) — those need two pieces moved and should
  not be expected to fall to a single-piece pass.
  **Only circulation obstacles (>= 0.5 m²) can seal a room**, added in `.53`: the first cut
  counted every floor-standing piece and so named `potted-plant`, `nightstand` and `floor-lamp`
  as things that walled a room off. That took the list 32 -> 22 and the clean templates 5 -> 10,
  and it RETRACTS v0.31.8.52's headline finding — `tpl-terrace-ground`'s master bedroom, whose
  culprit was a 0.32 m² shoe cabinet, is clean.
- **[APPLIANCE PLACEMENT — FIXED v0.31.8.71] 15 marooned appliances -> 6.** WALL-SNAP-SHORTFALL
  (`autoArrange.ts:edgeShortfall`, applied in BOTH `snapToWall` and `placeFlush`) pushes a
  wall-snapped piece out by however far its rect edge falls short of the wall face, so "flush"
  means the same distance on every edge of every room. That cleared the whole 0.32 m cluster —
  0.18 m of intended gap plus 0.15 m of rect shortfall — plus `tpl-hdb-jumbo`'s washing machine.
  Needed MOUNT-HEIGHT-CLASH alongside it (`placeSeededMounts` now tries every wall, height-aware,
  and falls back to the nearest rather than stranding). Cost: one blocked window, two decor props
  and one drying rack, against +7 items elsewhere — net +4. Full history in the v0.31.8.61/.69/.70
  changelog entries.
  **The three SERVICE-YARD washing machines are FIXED (v0.31.8.75), and it took three changes
  that only work together:**
  (a) **WALL-BACKED-EDGE** — `snapToWall` prefers an edge that actually has a wall. It chose from
  the piece's SEEDED position before, so `tpl-hdb-3room`'s washing machine took the yard's west
  edge (no wall within 0.80 m) over its north edge (flush to one).
  (b) **WINDOW-KEEPOUT-IN-RESCUE** — `placeSeededMounts` checked `doorKeepOutRects` but not
  `windowFrontRects`, so a piece the arranger could not place was rescued straight into a window
  front. Pre-existing; (a) merely changed which pieces get stranded and exposed it.
  (c) **All four walls, strictness outside the wall loop** — a stranded FLOOR piece used to try
  only its nearest wall, so it had to relax the window rule whenever that one wall carried glass.
  Trying every wall strictly first, and only then allowing a windowed spot, is what lets
  `tpl-hdb-5room`'s `utility-cabinet` take the yard's clear north wall AND
  `tpl-hdb-maisonette`'s 2 m shower keep its windowed wall in a 1.6 x 1.3 m bathroom with no
  window-free option.
  Net **+5 items with no losses anywhere** (3room +1, 4room +2, jumbo +1, studio +1) — trying
  more walls rescues pieces that previously had nowhere to go.
  **What is LEFT (3):** `tpl-condo-3bed/stove 1.05` (never placed at all — still at its room-centre
  seed, see the ALONG-WALL entry, which is measured and declined), `tpl-condo-3bed/stove 1.05` (never placed at all) and
  `tpl-condo-1bed/stove 0.59`.
  **`tpl-hdb-2room`'s stove is FIXED (v0.31.8.76)**: `arrangeKitchen`'s work triangle picked its
  two candidate walls from the rect's ASPECT alone, so the stove took the long edge with no wall
  behind it (0.77 m from anything) while a flush one went spare. Wall-backed first now, aspect as
  the tie-break. Zero collateral — no item counts moved, no new blockage.
  **`tpl-condo-1bed`'s stove is DIAGNOSED, not fixed.** Its Open Kitchen is flush on S and W and
  0.49-0.67 m from any wall on N and E. Aspect gives long walls ['S','N']; S is wall-backed and
  tried first, but the counter run is already there, so `placeFlush` falls to N — which is
  wall-less and FREE, so it succeeds and `toEnd` never reaches its `snapToWall` fallback (which
  would have found the flush WEST wall via WALL-BACKED-EDGE).
  **That plan was BUILT in v0.31.8.77 and has ZERO corpus effect** — wall-backed long walls, then
  `snapToWall` across all edges, then unbacked long walls. Full suite green with nothing moved:
  the stove stays at (1.38, 5.27) rot 0.00, snapped to the N rect edge. Reverted rather than
  shipped as dead branches.
  **So the reasoning above is wrong somewhere, and two candidates are eliminated:** the room
  DOES resolve to `kitchen` (`authored=kitchen resolved=kitchen`), so `arrangeKitchen` is the
  routine; and the W edge IS wall-backed by `edgeHasWall` (rect edge sits ~0.12 m off the face,
  so `d - ROOM_INSET` is ~0, well inside the 0.3 m bar). Either `toEnd` is not the code path that
  places this stove, or `snapToWall`'s W candidate is rejected by something — the counter run
  spans x 0.32-2.72 at z 5.62-6.22 and the stove wants z 4.97-5.57, which should not collide.
  **TRACED in v0.31.8.78, and it closes this thread.** `toEnd`'s three stages for
  `tpl-condo-1bed`'s Open Kitchen (rect x 0.32-2.08, z 4.92-6.28):
  ```
  toEnd refrigerator low=true  along=1.07  longWalls=S,N
    placeFlush S -> fail    placeFlush N -> fail    snapToWall -> fail
  toEnd stove       low=false along=1.38  longWalls=S,N
    placeFlush S -> fail    placeFlush N -> OK 1.38,5.27
  ```
  **`snapToWall` fails in this room** — it fails outright for the fridge, so reordering
  `toEnd` to reach it earlier cannot help the stove either. That is why v0.31.8.77 had zero
  effect.
  **Why `snapToWall` fails:** the W edge is wall-backed and free at its low end, but `snapToWall`
  tries exactly ONE along-wall position — the seeded z clamped — which puts the stove at
  z 5.30-5.90, overlapping the counter run at z 5.62-6.22. At the clamp's low end (z 5.22) it
  would be z 4.92-5.52 and clear.
  **So both remaining marooned appliances trace to the ALONG-WALL lever above, which is measured
  and declined twice** (v0.31.8.7 and v0.31.8.62, on cost). There is nothing further to do here
  without reopening that decision, and the prize is two stoves. **Treat the appliance thread as
  closed at 15 -> 2.**

- **[ALONG-WALL SWEEP — MEASURED AND DECLINED TWICE (v0.31.8.7, v0.31.8.62). Do not re-attempt
  without a new idea.]** `snapToWall` tries exactly ONE along-wall position per edge — the
  piece's seeded position clamped to fit — so a wall with room somewhere ELSE along it reads as
  full.
  **The defect it causes is real and traced end to end.** `tpl-condo-3bed`'s stove is marooned at
  its kitchen's exact centre, 1.05 m from any wall, because all four edges reject it and every
  rejection is at that single position: W is under the 2.4 m counter run, N under the fridge, E
  overlaps the kitchen door's keep-out (z 5.57-6.47 vs the stove's 6.38-6.98), and S overlaps the
  service-yard door's (x 1.10-2.00 vs the stove's 1.25-1.85). **The south wall is clear from
  x 0.20 to 1.10 and the stove never asks for it.**
  **Implemented as a nearest-first sweep in 0.25 m steps.** It works: the condo-3bed stove places
  against a wall AND its range hood follows it (`placeSeededMounts` only makes a hood follow a
  stove that has MOVED off the seed), clearing two separately-ratcheted findings with one change.
  **It costs more than it buys.** Unbounded, it also stranded a `tpl-hdb-jumbo` dining chair
  **4.54 m** from its table and added 2 window blockages. Capping the travel at **1.2 m** (still
  clears a 0.9 m door keep-out) fixed the dining regression completely — but blocked windows went
  **4 -> 7**: `tpl-loft/lfu-win: bookshelf`, `tpl-loft/lfu-e-win: shower`,
  `tpl-terrace-ground/ct-kit-win: bathroom-sink`. **Two appliances fixed for three windows
  blocked** is the wrong direction, and a window blocked by a shower is worse than an appliance a
  metre off its wall.
  **Two orderings were tried to recover the windows and NEITHER worked**: preferring along-wall
  candidates that clear `ctx.windowKeepOut`, first for `tall` storage only (the three new
  blockers are a shower, a sink and a bookshelf — none are `storage`, so it missed all three) and
  then for every piece (no change at all, so `windowSightline` is measuring something the
  keep-out rects do not capture — find out what before trying a third ordering).
  v0.31.8.7 measured the same lever on the pre-route codebase and got a different trade in the
  same shape (3 blocked windows cleared for 3 new pinches). **Two independent measurements, two
  declines.**
- **[THROUGH-ROOMS — MEASURED v0.31.8.68, NOT FIXED] 3 rooms are corridors in disguise.**
  `src/floorplan/throughRooms.test.ts` blocks one room's floor and asks whether the REMAINING
  rooms fall into more groups than before. Found: `tpl-condo-3bed/c3-bed2`, `c3-bed3` and
  `tpl-condo-penthouse/cp-bed2` — bedroom columns with no corridor, the shape item (f) defers.
  This corroborates `bedroomPrivacy.test.ts` from the other side: that test names the bedroom
  you cannot reach without crossing another, this one names the bedroom you cross.
  **Two refinements were needed and both are load-bearing — do not remove either.**
  (a) **Suites are not defects.** Reaching an ensuite through its bedroom is normal, and it
  splits off a group of exactly ONE room, so only splits whose smaller side holds 2+ rooms
  count. Without this the check flagged `jb-master`, which `bedroomPrivacy`'s docstring records
  as the exact false positive that killed its own room-graph attempt.
  (b) **The room's rectangle has to BE the room.** All four edges must have a wall within
  0.15 m. Unscoped, the check reported 26 rooms, because where a rect covers undeclared
  circulation (v0.31.8.60: fewer than half the shipped rect edges sit on their own wall)
  blocking it blocks a corridor.
  **Consequence worth acting on:** (b) is why this check does NOT catch `tpl-hdb-4room`'s
  household shelter, which v0.31.8.67 PROVED is a through-room — its rect is rejected because
  the shelter has one wall of four.
  **CORRECTED in v0.31.8.87: "one wall of four" is the point, and it is NOT a rect problem.**
  Classifying all 46 terminal rooms by why (b) rejects them — 22 rejected, of which 6 fail by
  0.20 m (a real shortfall), 1 by 0.40, and **15 have no wall on the failing side at all**
  (0.60-1.60 m; `h4-shelter` is S=0.30 W=0.78 E=0.87). Those 15 ARE
  `templateEnclosure.test.ts`'s `KNOWN_SHARED_ENCLOSURES`, already attributed to open-graphics
  item **(f)**. So this check is gated on (f), and the room-rect fix would unblock 6 rooms here,
  not 22.
- ~~**[G8] Add a Peranakan encaustic floor tile material.**~~ **DONE v0.31.8.17.** This entry was
  half-stale: `floor-peranakan-jade`/`-cobalt`/`-rose` had been added since it was written (with the
  researched 200 mm `moduleMm` as of v0.31.8.16), but the PRESET still used `floor-wood-ebony` plus
  a patterned rug, so the theme was still approximating its most recognisable element. Peranakan
  Accent now lays the real tile.
  **Only in the living/dining, and that is researched rather than cautious:** encaustic tiles "line
  the five-foot ways and prestigious interior spaces" of a shophouse, whose plan "transitions from
  public to private" — the front hall and courtyard, not the bedrooms. Tiling every dry floor would
  repeat Coastal's all-walls mistake (fixed v0.31.8.2). Needed a new `LayoutPreset`
  `dryFloorByCategory` field, since `dryFloor` is one finish for the whole home; it is keyed on
  `RoomCategory` so it works on custom plans and templates too, and no other preset sets it.
- **[G8] Give a few themes real `kits`, informed by the grounding audit.** No preset defines `kits`,
  so themes differ in finish/styling but place identical furniture (v0.31.5.363). The audit says
  what belongs: rattan/bamboo + handmade ceramics for Japandi, wool/linen textiles for Scandi Calm,
  leather + reclaimed timber for Warm Industrial. Cheaper and higher-value than any generator change.
- **[G8 next] Scheme comparison needs a UI surface.** v0.31.5.363 ships the data core
  (`analysis/schemeOptions.ts`): generate N schemes, scored/priced, with derived trade-offs. Still
  needed: a review-and-pick surface (each scheme's plan thumbnail, score breakdown, price and the
  trade-off lines, with "use this one" applying its items + the preset's finishes), a brief/budget
  input wired through `furniture/briefParser.ts:parseBrief`/`parseBriefBudget` (both already exist
  and already return a preset id + a budget), and a feature flag. Also worth doing: presets define NO
  `kits`, so scheme variety leans entirely on the layout seed — giving a few presets real kit
  differences (a WFH desk, an entertainer's bar) would widen the spread more cheaply than any
  algorithm change.
- **[G3 remainder] Profile-dependent details need a trim/profile data model.** v0.31.5.360 details
  the four junctions the model can state exactly (ceiling drop, waterproofing upturn, floor
  threshold, window sill/head). Still missing, and ALL blocked on the same prerequisite: skirting and
  cornice sections (heights exist as `PlanWall.baseboard.height`/`crown.height`, but there is no
  profile and no specified projection — the 3D render's ~12 mm is a rendering constant), shower kerb
  geometry (only `buildKerbAdvisories`, no height), worktop edge/nosing, and door jamb/architrave.
  The fix is the same shape as G5's `MaterialDef.moduleMm`: a SPECIFIED profile + projection on the
  trim/joinery data, then the section can be drawn from it. Do NOT derive a projection from the
  render constants. Once profiles exist, the details should be DRAWN sections at 1:5/1:10
  (`DETAIL_SCALE_RATIOS` is already in place) rather than dimension tables.
- **[G4 remainder] The calibration constant and the utilisation factor.** v0.31.5.357 shipped the
  work plane + uniformity; v0.31.5.361 shipped the IES distribution SHAPE into the spatial grid.
  Still open: (a) the room AVERAGE stays isotropic because it is the lumen method (Φ × UF / A), which
  is distribution-agnostic by construction — making it directional means replacing it with a full
  point-by-point integration, a real decision rather than a fix. Also still shape-only: absolute
  photometry (`lumensPerLamp`/`candelaMultiplier`) is deliberately not asserted. (b) `SCENE_INTENSITY_CALIBRATION = 12` anchors lux output
  to the renderer's stylised night-scene intensities; retiring it needs a real lumen/CCT/beam package
  per fixture. (c) `UTILISATION_FACTOR` is a single global 0.45 though the app knows each room's
  finish reflectances (`roomFinishes.ts`). (d) DONE v0.31.5.362 — `buildRoomUniformity` + a U0 column on both surfaces.
  NOTE: do NOT calibrate any of this against the HQ render — see the research doc's cross-cutting
  section; the render is not a photometrically anchored reference.
- **[G1 follow-up] Section cuts are automatic, not user-placed.** v0.31.5.355 emits both
  conventional cuts (A cross, B longitudinal) at scored-informative positions with proper plan
  marks. What is still missing is letting a user take a cut WHERE THEY WANT — through a specific
  wet area, a dropped ceiling, a stair, a tall joinery run. Needs a plan entity (position, axis,
  view direction, mark letter) plus an editor affordance to drag the cut line, and then
  `conventionalSectionCuts` becomes the default seed rather than the only source. The projector
  (`buildSection`) already accepts any axis+position, so this is entity + UI work only.
- **[G6 follow-up] Revisions are set-wide, not per-sheet; no revision clouds.** v0.31.5.354 ships the
  revision HISTORY, but every sheet still carries the same global `Rev X` in its title block, whereas
  in practice sheets revise independently. Doing it properly needs each revision to record WHICH
  sheets it touched (`sheets?: string[]` on `DrawingSetRevision`) — deliberately NOT added yet
  because nothing can populate it: it would need a per-sheet issue UI, and an unpopulated field is
  worse than an absent one. Same reason revision clouds/deltas (marking WHAT changed on a sheet) are
  deferred: they need a diff between two issues of the plan, which means storing a plan snapshot per
  revision. Revisit together, and only with a real issue-management surface.
- **[G9 follow-up] Aircon trunking vs joinery is not clash-checked.** v0.31.5.353 covers MEP-behind-
  furniture and item-under-ceiling-drop. The third failure mode from the research — an
  `analysis/airconTrunking.ts` route crossing a carpentry run — needs the trunking polyline treated
  as a swept 3D volume against joinery bodies, which is more than the current 2D-footprint-plus-one-
  height model can express. Also unhandled: an item's internal voids (an open-backed shelving unit
  reports its socket as obstructed) — would need a per-def "backless/open" hint.
- **[G10 follow-up] The DXF still writes metre geometry + metre dimension text.** v0.31.5.352 moved
  the printed sheets to integer mm but left the DXF alone on purpose: it declares `$INSUNITS = 6`
  (metres) and writes metre coordinates, so mm annotation beside a 4-unit line would contradict its
  own header. The real fix is to write the whole DXF in mm with `$INSUNITS = 4` (the usual metric
  CAD convention) — every coordinate, not just the labels — then dimension text can use
  `formatDrawingLength` like the sheets. Touches all of `export/dxf.ts`'s geometry, so it wants its
  own change + a careful re-read of the layer/scale tests.
- **[G10 follow-up] Interior dimension rows have no label-collision stagger.** `autoDimensionSvg.ts`
  staggers the SETTING-OUT row (`staggerLabelRows`) but the per-room interior dimension labels can
  still overlap where two rooms are narrow and adjacent (visible as "1950 1850" / "1000 900" on the
  default 4-room plan). Pre-existing, and *improved* by the mm change (integer labels are shorter
  than "1.95 m"), but not solved. Reuse `staggerLabelRows` for those rows.
- **[G11 follow-up] A decomposed footprint's drawn edge is faceted, not a true arc.** v0.31.5.351
  draws a round/oval item as one filled silhouette (no false internal edges), but the outline is
  still the `ellipseFootprintParts` OBB staircase. Reads fine at 1:50-1:100; a large-format detail
  would want a real ellipse/arc path. NOT a rendering-only change: emitting an arc needs a
  convexity/shape hint on the def, since a convex hull would wrongly fill an L-shaped sofa's
  notch. Revisit with G3 (detail scales), where it actually starts to matter.

## Wall reveal (v0.30.9.0, 2026-08-28)
- [ ] **The default orbit pose parks every near wall at a MILKY 0.371 — the curve's head-on
  floor is unreachable from the boot camera.** (Re-framed again in v0.31.5.53; the "hard step at
  joints" framing is now closed as WON'T-FIX, see below. What remains is a design-parameter
  question, not a bug, and it needs a product decision rather than a patch.)
  **Measured** (`scripts/dev-probes/reveal-step.mjs`, default boot framing): `WALL-REVEAL-STRENGTH`
  defaults to 0.95, which the docs describe as a head-on opacity FLOOR of `1 - fade` = **0.05** —
  a near wall head-on is meant to be barely an outline. But `revealStrength` is
  `smoothstep(0.25, 1, toward)` and `toward` only reaches 1 when a wall faces the camera dead-on.
  The dollhouse boot pose looks down a 45-degree diagonal (camera forward XZ `[-0.64, -0.64]`), so
  **every** visible facade sits at `toward` = 0.707 → strength 0.662 → opacity **0.371**, and
  none of them ever approaches the floor unless the user orbits to put a wall head-on.
  0.371 is exactly the "washed mid-band" that the retired binary target was introduced to prevent
  — it was fixed for FAR walls (structurally, via the orientation check) and reappears on NEAR
  walls as a consequence of the default camera angle. Cropped frames show it plainly: the kitchen
  and dining furniture read through a milky sheet.
  · **Whoever picks this up is choosing between two defensible looks**, so measure, do not tune:
    a deeper default fade makes the cutaway cleaner but pushes near walls toward invisible, and
    the current value is what `wallRevealStrength` exposes to the user anyway. Judge on frames at
    the BOOT pose, not head-on.
  · **CLOSED as WON'T-FIX: "ease the faded wall toward its opaque neighbour near the shared
    corner."** Two independent reasons, both measured/read rather than argued.
    (a) **The architecture cannot express it.** Opacity is a single scalar per material —
    `useWallReveal.ts` and `WallSegment.tsx` both assign `material.opacity = cur` for the whole
    mesh — so a gradient across a wall's width needs either split geometry (which reintroduces
    the multi-layer compositing WALL-FADE-OVERLAY-CULL exists to remove) or an `onBeforeCompile`
    alpha patch that would then have to survive the fade CLONE (meta-rule xli), the overlay cull,
    WALL-FADE-DEPTHWRITE and the composer. That is disproportionate to a boundary artefact.
    (b) **The gradient would have to act where the design forbids it.** What steps is a faded wall
    against a STRUCTURALLY OPAQUE far wall (the two faded walls at a corner already match exactly
    — 10 of 44 corners step by precisely 0.629, and every faded wall reads 0.371). Easing across
    that boundary means fading the far wall near the corner, which is the washed-pane failure the
    far-wall rule exists to prevent. `cornerSpreadStrength`, which the original entry nominated,
    cannot help for the same reason.
    So the step is the CUTAWAY BOUNDARY, not a compositing fault — a dollhouse view with an open
    top has to end somewhere.

## Showroom finishes (v0.26.0.0, 2026-08-19)
- [ ] **Showroom picks for furniture `mat:` finishes.** A resolved showroom finish already works
  as a `mat:polyhaven:<slug>:1k` furniture finish (and rehydrates — the boot scan covers item
  props), but no furniture UI surfaces the curated list yet.
- [ ] **Curated-slug liveness check.** Showroom slugs degrade gracefully when dead (thumb 404 →
  chip hides), but a periodic dev-time script hitting `api.polyhaven.com/info/<slug>` would catch
  a renamed asset before users see a thinner strip. (Sandbox egress blocked polyhaven at author
  time, so the medium-confidence slugs — `laminate_floor_02`, `painted_plaster_wall` — ship on
  the graceful-degradation contract; verify once network allows.)

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
- [x] **BSJ-2 follow-up — 3D refrigerant-trunking route** (S/M, pro) — DONE: pure
  `analysis/airconTrunking.ts` routes an orthogonal (Manhattan-dogleg) polyline per served room,
  condenser → FCU, at ceiling height. Router: a room-adjacency graph over DOOR openings only
  (`planRoomShell` per-room openings, a door's world centre attributed to every room it borders),
  BFS shortest hop-count path from the condenser's room to the FCU's room (naturally prefers the
  corridor spine — it has doors to every bedroom), waypoints = condenser pos + each hop's door
  threshold + FCU pos, each leg expanded into an axis-aligned dogleg. `resolved:false` (no wall-
  crossing check beyond "through doors, not walls" — deliberately simple, correctness over
  optimality) keeps the ORIGINAL advisory text unchanged — no regression. `resolveAirconTrunkingInput`
  mirrors `renovationAllocator`'s placed-items-else-planner-proposal fallback so every consumer
  (3D, RCP, budget) agrees on the same route for the same design. **3D**: `scene/AirconTrunking.tsx`
  — small (~60×40mm) painted-white duct boxes per segment, mounted alongside `PlanShell` in
  `Scene.tsx`, **custom plans only** (the curated default flat has no room-graph model to route
  against). **RCP sheet**: `rcp.ts`'s `ReflectedCeilingPlan.trunking` (resolved runs only) +
  `rcpSvg.ts` dashed polyline + `~XXm` label + a legend row. **Budget**: new
  `trades.airconTrunkingPerM` (S$20/m) feeds a separate `aircon-trunking` trade line (real
  modeled-route length, only when resolved) alongside the existing flat per-FCU `aircon` line.
  **DaylightPanel**: "Trunking ~XX m" replaces the generic advisory per system once every FCU in
  that system resolves. New pro flag `airconTrunking` (default on, rides alongside `airconSystem`).
  Tests: `airconTrunking.test.ts` (router: resolves through doors, Manhattan-only segments,
  planner-proposal fallback, unresolved on no door path), `rcp.test.ts` (RCP overlay), allocator pin
  (`renovationAllocator.airconTrunking.test.ts`), `featureFlags.test.ts` (both modes).
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

## Blank-slate journey queue r2 (2026-07-24)
> Second-queue gap analysis over the areas round 1 scored lower — full per-area verdicts,
> SG-source citations and near-miss re-verification in
> `docs/research/2026-07-24-blank-slate-gap-analysis-r2.md`. Ranked.
- [ ] **BSJ2-1 — Condo developer fit-out intake state + customisation budget posture** (M,
  simple) — fifth `IntakeStateMeta` (`furniture/intakeStates.ts`) seeding the developer-fitted
  unit: tiled/vinyl floors per room category, bedroom wardrobes, kitchen cabinet run +
  hob/hood/oven, complete bathrooms, wall FCUs + condenser (reuse the BSJ-2 primitives). The
  renovation allocator then reads the intake baseline and zeroes developer-provided trades
  (flooring, wardrobe carpentry, aircon install) unless the user replaces them — the
  customisation-vs-rebuild split every SG condo cost guide describes. Unblocks the condo half
  of the product promise (all four shipped intake states are HDB).
- [ ] **BSJ2-2 — Defect pins on the 3D model + DLP defect report** (M, pro) — typed defect
  pins (category from `handoverChecklist`'s room-kind snag rules, severity, open → reported →
  rectified → re-inspect status, room auto-attribution) extending the proven comment-pin
  pattern (`commentsSlice`/`CommentPins`); a "Defect check" mode seeded per room from the
  checklist; export a defect report (plan markup via the existing SVG overlay pattern +
  numbered list + DLP/Assure-3 deadlines from `handoverDates`) the owner hands the
  developer/BSC. No photos in v1 (storage-free).
- [ ] **BSJ2-3 — Smart-home pre-wire advisory + wired-AP coverage** (S/M, pro) — electrical
  advisory section: neutral-wire-to-every-switch line (per MEP switch count, S$500–1,200 band,
  deeper-box + LEW notes — the one irreversible pre-reno smart-home decision) folded into the
  Electrician handover pack; plus wired access-point coverage (an `ap` electrical kind or a
  data-point coverage advisory: ≥1 wired drop per ~60–90 m² zone + TV/study), reusing the
  socket-advisory pattern.

## E2E blank-slate journey validation r2 (2026-07-25)
> Second adversarial no-designer journey run on the GPU harness, focused on what shipped since
> round 1 (four intake states, BSJ-8 real 3D floor levels, BSJ-2 3D trunking) + a regression pass
> over the round-1 chain. Full write-up + 19 screenshot refs + probe data:
> `docs/research/2026-07-25-e2e-journey-validation-r2.md`. Scenario:
> `scripts/scenarios/e2e-blank-slate-journey-r2.json` (110 steps). Verdict: the promise HOLDS
> and every round-1 finding stayed fixed; the new 3D legs are **starter-template-starved**.
> P1=1 (fixed), P2=4 (2 fixed), P3=6, 0 crashes.
- [x] **E2E2-P1 — printed RCP sheet silently dropped the modeled trunking route.** FIXED:
  `ui/drawingSet.ts` passed each placed aircon item with a PLACEHOLDER `roomId: it.id`; the
  router matches input FCUs to served rooms by that id, and `resolveAirconTrunkingInput` only
  derives the room from position when `roomId` is undefined — so every run came back unresolved
  in the print path only (3D/panel/budget pass raw items and were fine). Dropped the placeholder.
  The one sheet an aircon installer is handed had none of the data the budget charges for.
- [x] **E2E2-P2-1 — deleting the condensers kept quoting a route from them.** FIXED: the
  placed-items gate required BOTH FCUs and condensers, so deleting the condensers fell back to
  the planner PROPOSAL and the ducts/RCP/$-carrying budget line kept showing a route from
  equipment the user removed. Now ANY placed aircon item means "describe the scene" → a
  half-edited system yields unresolved runs → the honest advisory.
- [x] **E2E2-P3-2 — three stale "documentation only / doesn't move the 3D floor" copy sites.**
  FIXED (RoomInspector helper text, `floorLevels.ts` module doc, `floorLevelMm` field doc,
  `floorLevels` flag comment) — all four contradicted BSJ-8 3D shipped in v0.24.0.2.
- [ ] **E2E2-P2-2 — starter templates starve the room-graph features** (M, data). `tpl-hdb-4room`
  has doors only on the entrance + master bedroom and an UNROOMED corridor, so features that walk
  the room graph quietly degrade on exactly the plans a new buyer starts from: 3 of 4 trunking
  runs stay unresolved (the budget prices 10.43 lin.m of a realistically ~40 m job while *looking*
  exact), and `buildFloorTransitions` (which pairs rooms via door openings) emits no step marker,
  no 3D threshold riser and no kerb advisory for a bath FFL offset. Fix: author full door sets +
  corridor rooms into the starter templates (data, not code), and/or teach the router + transition
  builder to treat unroomed circulation as a traversable pseudo-room.
- [ ] **E2E2-P2-3 — `planAircon` places 0 condensers, silently, on a plan with no ledge/yard**
  (S, pro). On `tpl-hdb-2room` the proposal claims 2 systems / 2 condensers, then places 2 FCUs
  and 0 condensers with `advisories: []`, while `ledgeWeightNote` still describes "2 condensers
  ≈ 60 kg on one ledge" for a ledge that doesn't exist. Fix: push an advisory when no condenser
  room resolves ("no AC ledge/service yard on this plan — add one, or confirm external bracket
  mounting") and suppress/reword the ledge weight note.
- [ ] **E2E2-P2-4 — `floorLevelMm` accepts absurd values with no clamp or warning** (S, pro).
  The inspector only rounds and `roomFloorOffsetM` divides raw mm by 1000, so a −500-for-−50
  typo renders a clean-looking 1 m pit (fittings re-seat, plinth fills the gap) with no warning.
  Fix: clamp or soft-warn outside a sane band (SG practice ≈ ±150 mm).
- [ ] **E2E2-P3-1 — moving an FCU out of its served room silently zeroes the modeled route.**
  Consistent (no phantom data) but invisible: the trunking budget line vanishes and the panel
  reverts to the advisory with no hint. Suggest a per-run "FCU is outside its served room —
  re-plan aircon" note.
- [ ] **E2E2-P3-3 — no FFL feedback in the interactive plan editor.** FFL tags exist only on the
  printed dimensioned plan + tiler pack; the editor canvas shows nothing, so a user can't see
  which rooms carry offsets without selecting each one. Suggest reusing the print `FFL ±N` tag on
  the editor room label (flag-gated like the field).
- [ ] **E2E2-P3-4 — OCS blurb promises "porcelain living"; the SNV default seeds vinyl.** The
  vinyl is a deliberate spec-match to the SNV OCS photo; the wizard blurb states the generic
  claim unconditionally. Reword per-plan or generically.
- [ ] **E2E2-P3-5 — aircon trade pack never carries the modeled trunking.** `ui/tradePacks.ts`
  prints only the generic `trunkingNote` and its sheet list omits the RCP sheet that now holds
  the actual dashed route + length. Add the RCP sheet + per-run modeled lengths to the pack.
  (Cosmetic: the tiler's tile-setting-out legend prints on the aircon pack's floor-plan sheet.)
- [ ] **E2E2-P3-6 — `budget` flag defaults off while the docs call budget part of the Simple core
  loop.** A Simple user gets no budget surface on a clean boot. Either flip the default when the
  surface is ready or align CLAUDE.md + the registry header.
- [ ] **E2E2-follow-up — walk-mode Y-follow across a threshold has no screenshot proof.** Verified
  at module level only (`floorOffsetAtPoint` returns the offset; `FirstPersonCamera` consumes it
  per frame); headless WASD driving into the door-less template bath wasn't deterministic. Needs a
  guard scenario on a door-ful custom plan (blocked on P2-2's template doors).

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
- **Runtime catalog CORS proxy** (ambientCG prod) — ~~ambientCG's API/CDN send no CORS headers.~~
  **Resolved for the Cloudflare deployment** (v0.29.2.0): rather than proxying ambientCG at
  runtime, the corpus is packed to the four bound PBR maps (`npm run pack-ambientcg`) and
  mirrored into our own R2 bucket under `acg/`, served same-origin through the existing
  auth-gated `/api/assets` proxy (`providers/acgLibrary.ts`, flag `ambientcgLibrary`). No
  third-party CORS dependency and no proxy to operate. **Closed for good in v0.29.4.0**: the
  live transport and its `/acg`+`/acg-cdn` proxies (Vite *and* the Docker nginx) are deleted —
  the upstream API had rotted anyway (CDN moved to `acg-media.struffelproductions.com`, 100 of
  ~2000 assets per page, `category` now `null` on every material).
  **GitHub Pages remains uncovered** — it has no backend (`hasBackend()` is false), so the R2
  mirror is inert there and the ambientCG grid is simply empty on that build (Poly Haven works
  direct); there is no longer a live fallback to stand in for it.
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

## Main-bedroom sconces float over the window glass (v0.31.5.232)

`light-distribution.mjs WINDOW=mainBedroom` puts the camera on the bed axis, and the frame shows the
bed's headboard against the **window** wall with two wall sconces mounted **on the glass**. Real rooms
never do this, so it reads as a render bug even though the render is correct — it is a placement result.

`docs/interior-design-guidelines.md` already says storage/appliances/beds go flush to walls and TVs to
windowless walls; the same windowless-wall preference plainly ought to apply to a **headboard**, and
wall-mounted lighting should refuse a wall opening outright. Fix belongs in
`layout/designRules.ts` + `layout/autoArrange.ts`, not in the look.

Not touched in `.232`, which was a measurement round.

## Daylight: no model of mechanical ventilation — PARTLY ADDRESSED v0.31.8.65

The check measures openable WINDOW area only. An interior bathroom or WC is legally
ventilated mechanically, so `noFacade` reports it as "not assessed" rather than failing.

**v0.31.8.65 turns that into an instruction**: such a room now reads "interior WC — no
external wall, so mechanical ventilation ducted to outdoor is required" instead of the
generic interior-room wording. Live on **7 rooms across 7 templates**, ratcheted in
`daylight.test.ts` so the wording cannot go inert.

**No RATE is stated, and that is deliberate.** Searching returned three figures for
three different scopes and none of them a primary residential source: 40 ACH attributed
to SS 553; 15 ACH (2017) rising to 20 ACH (2024) from NEA's Code of Practice on
Environmental Health, which governs the premises NEA regulates rather than private
homes; and trade guidance for HDB flats quoted in CFM (150-200 CFM for a 4-6 m²
bathroom, 100/150 mm duct). Putting one of them in a contractor-facing tool would
repeat exactly what v0.31.8.64 had to correct. **Find a residential SG source before
adding a rate** — with one, this becomes a real sizing line rather than a requirement
flag, and the room could be ASSESSED instead of skipped, which is what the rest of this
entry asks for.

## ~~Daylight: the 10% glazing figure is not sourced to Singapore~~ — RESOLVED v0.31.8.64

**Searched again, same answer, and the app now says so.** Two fresh searches returned
only Australian (NCC Part 10.5 / F4 — 10% of floor area for windows, 3% for roof
lights), UK HMO and US IRC/IBC sources for the 10% figure; no Singapore instrument
carrying it was findable. The 5% ventilation figure IS corroborated for SG.

So the two thresholds are now documented SEPARATELY in `analysis/daylight.ts` rather
than jointly as "a rule of thumb", and `ui/DaylightPanel.tsx` prints
"Glazing ≥ 10% (indicative) · openable ≥ 5% of floor" instead of both percentages bare
— the report already carried an equivalent qualifier, the panel did not. If anyone
finds a Singapore source, cite it on the constant and the qualifier can be dropped.

Original note follows.

`DAYLIGHT_MIN_RATIO = 0.1` is documented as a rule of thumb, which is honest, but a
web search for a Singapore/BCA habitable-room definition returned only Australian
(NCC), UK and US codes carrying the 10% figure. The **5% ventilation** figure IS
corroborated for SG (a BCA circular requires residential developments to be designed
for natural ventilation with a minimum opening area of 5% of room space). If the
daylight ratio is ever presented as more than indicative, source it first — no
official SG habitable-room exclusion list was findable either, which is why the
façade test above is derived from the plan's own geometry instead of a rule list.

## Template household shelters are drawn without three of their four walls

Measured on `tpl-hdb-4room`: the shelter is authored as a room rectangle at
`origin [5, 0.2]`, `1.5 × 2.0 m`, but the plan contains a wall along only ONE of its
four boundary edges (the external north wall). For the other three, the nearest wall
is 0.70–0.80 m away and belongs to a different room — so there is no wall to
classify, not a matching failure. `shelterWallIds` correctly returns 1 wall there.

Consequences: the hackability overlay can only mark the one wall NOT PERMITTED, the
3D shell renders the shelter unenclosed on three sides, and a drawing set cannot show
the RC enclosure a contractor needs. Corpus counts of shelter-bounding walls:
DEFAULT 4, `-exec` 3, `-3gen` 3, `-maisonette` 3, `-2room` 2, `-jumbo` 2, and
`-3room`/`-4room`/`-5room` just **1** each.

Fixing this is a template DATA change (author the missing RC partitions), not a logic
change.

**DONE so far: `tpl-hdb-3room` (v0.31.8.63, 2 walls -> 4) and `tpl-hdb-maisonette` +
`tpl-hdb-exec` (v0.31.8.66, 3 -> 4 each, one south wall apiece).** Five of the eight
HDB templates now enclose their shelter fully, matching `-3gen` and `-jumbo`. New walls are authored with the centreline offset half a thickness OUTWARD
from the room rect (4.5 -> 4.45, 2.2 -> 2.25) so the FACES land on the room edge —
otherwise the rect overlaps the wall body, which is one of the four populations
`roomRectWalls.test.ts` measures. Full suite green.

**`-4room` and `-5room` were authored the same way, measured, and REVERTED.** Both take
`templateConnectivity`'s ratchet from 2 disconnected groups to 3, and it stays at 3
wherever the shelter door is placed (tried south into the living band and east into the
living room, on both templates). The shelter becomes its own group because, once
properly enclosed, it shares a wall-free volume with no other DECLARED room — the space
its door opens onto is undeclared circulation. Whether that is the enclosure being
wrong or the room-graph test being coarse in the presence of undeclared floor was not
resolved, and shipping template geometry whose connectivity effect is not understood is
the wrong trade. **Resolve that question first**; the wall coordinates are in the
v0.31.8.63 changelog entry, so re-authoring is copy-paste once it is answered.

**`-2room` was authored and REVERTED (v0.31.8.66), for the same reason as `-4room`/
`-5room` plus one more.** `shelterWallIds` matched `h2-bed-e` (x=3.3) and `h2-bath-n`
(z=4.0), but both are the NEIGHBOUR's wall 0.2 m away — this shelter has no wall of its
own on any side, so it needs all four. Enclosing it adds a NEW `templateConnectivity`
entry (2room is currently connected) and costs a furniture piece (48 -> 47). So the
three still open — `-2room`, `-4room`, `-5room` — are exactly the ones where enclosing
the shelter disconnects it, and they all wait on the same question.

**ANSWERED in v0.31.8.67, and the answer changes what this entry is about.** Enclosing
`tpl-hdb-4room`'s shelter and dumping the raster component of every room:

```
Kitchen            comp 1        Household Shelter  comp 2
Service Yard       comp 1        Living / Dining    comp 2
Bedroom 2/3, Common Bath, Master Bedroom/Bath   comp 3
```

The shelter is connected to the living room exactly as intended. The count goes 2 -> 3
because **the shelter's own unwalled floor was the bridge between the kitchen band and
the living room** — in `tpl-hdb-4room` the only route from the kitchen to the rest of
the flat runs THROUGH the household shelter. Walling it does not create a defect; it
UNMASKS one, and the connectivity test is right to report it.

So the remaining three are not a shelter problem. They are the "bedroom/service zone
with no corridor" problem — the same one `docs/open-graphics-decisions.md` item (f)
defers and `templateConnectivity`'s remaining entries describe. **Enclosing those
shelters is correct and should ship together with a corridor for the band the shelter is
currently standing in for**, not before it.

Worth stating plainly for whoever does that re-plan: a plan where you walk through the
bomb shelter to reach the kitchen is not one a contractor should be handed, and the app
could not previously see it because the shelter had no walls to see.

Also still open: whether `templateEnclosure.test.ts` should have caught any of this — it
passed on a shelter missing three walls, so its criterion is weaker than its name
suggests.

## (j) WINDOW-SIGHTLINE: the beside-the-glass option is measured impossible

Recorded in `docs/open-graphics-decisions.md` (j) under v0.31.8.27. Implemented and
instrumented: the blocking gate fires 15 times across the 19 templates and accepts
**zero** moves — in 9 cases the usable wall span is narrower than the item itself
(1.26 m vs 1.50 m; one span is **−0.04 m**), and in the other 6 a pane-clearing
candidate is rejected by collision / door swing / the window front keep-out.

The change was reverted (it was a bit-identical no-op). **(f) TEMPLATE-ROOM-ENCLOSURE
is a precondition**: those 0.86–1.26 m bedroom wall spans are the same mis-sized
template rectangles (f) measures, so re-measure (j) only after (f) lands.

## (f) is wider than recorded: 16 of 22 template levels are internally disconnected

Measured with every door treated as OPEN (`src/floorplan/templateConnectivity.test.ts`,
new ratchet, 16 entries). `templateEnclosure.test.ts` flood-fills with openings
IGNORED, so it measures too few WALLS; this measures too few DOORS. `tpl-hdb-jumbo`
splits into **7** sealed groups — its kitchen, service yard, household shelter,
living/dining and family room are each unreachable, and the west bedroom stack has
no opening in `jb-wb-corr` at all.

Consequence for the authorised (f) work: re-authoring jumbo is not just partitions +
moving the Common Bath, it also needs corridor doors, and 15 other levels share the
defect. Details and the two wrong instruments are in
`docs/open-graphics-decisions.md` (f) under v0.31.8.28.

## tpl-hdb-jumbo: the central corridor is ~43 m² of undeclared space

Pre-existing (jumbo never had a corridor room), surfaced by the v0.31.8.29
re-author. The strip x 4.0-8.4 × z 3.2-13.1 is the flat's circulation spine and is
covered by no declared room, so the app accounts no floor finish, no area and no
sockets for roughly a third of a 119.7 m² plan. Declaring it as a hall would fix
that, but it has to avoid the Common Bath now sitting in it (x 6.4-8.3, z 9.7-11.7),
so it needs either an L-shaped room or the bath moved to one end — a content call.

Check the other 15 levels for the same thing as they are re-authored.

## tpl-hdb-4room re-author is blocked on a content call

Four layouts built and measured, all reverted — see `docs/open-graphics-decisions.md`
(f) under v0.31.8.32. The template's bedroom zone has no corridor (so any door from
the living opens into a bedroom) and `h4-bed3` touches no external wall at all, so
item (h) needs a re-plan rather than a window offset. But the zone's only façades
are west and south, and the living owns the whole east side — so giving bedroom 3
daylight starves the living: measured 1.32 m, 3.69 m and 4-chairs-stranded for
living areas of 12.8, 14.4 and 14.8 m². The original 23 m² living passes.

Three options are written up in the decisions doc; the call is the maintainer's.

## Small combined living/dining rooms should get a 2-chair dining set

`furnishPlan.ts` gives every combined living/dining `KITS.living + KITS.dining` — a
`dining-table-4` plus 4 chairs — regardless of area. In a 13-15 m² room that does not
fit, and the 4th chair falls through to the room-wide safety settle, which parks it
metres from its table. This is what blocks (f)'s remaining 8 levels: carving a
bedroom corridor costs living area, and that area is what seats the set.

Do this as its own change: measure which template rooms fall under the threshold
first, then reduce the kit. It removes 2 items per affected room, so it will move
`placeSeededMounts.test.ts`'s `total >= 899` — legitimately, as a content trade with
a per-def diff, which is the only reason that guard has ever moved.

Measured and REJECTED already (see `docs/open-graphics-decisions.md` (f), v0.31.8.35):
committing the chair to its own slot as a last resort. Ignoring all checks costs
899 -> 875 items; relaxing only the keep-outs costs 899 -> 897. Both are the exact
pattern that guard was written to catch.

## tpl-hdb-5room ships a stray-wall warning that must NOT be closed on its own

`h5-b2-e` (x=3.2, z 3.6-6.9) stops 0.4 m short of `h5-svc-s` and 0.3 m short of
`h5-m-n`, so the plan shows "⚠ 1 stray" in the editor. Do not just extend it: those
gaps are the only way bedrooms 2 and 3 reach the master band, so sealing the wall
splits the bedroom zone further (2 groups -> 3) instead of fixing anything.

Closing it properly means adding doors inside the zone AND connecting the zone to
the living — i.e. the corridor re-plan that is blocked on the 4-room/5-room/exec
content call (`docs/open-graphics-decisions.md` (f)). Fix them together.

## A built-in wardrobe variant would unlock the narrow-bedroom corridors

`wardrobe-3door` is a freestanding 1.5 m × 0.6 m piece that needs
`CLEARANCE.storageFront` of clear floor to open into. That total (~1.35 m) plus a
2.0 m bed exceeds a 2.3 m deep bedroom, which is why carving a corridor out of
`tpl-condo-3bed`'s column costs all three wardrobes — measured in v0.31.8.39, and
NOT fixed by narrowing the piece (v0.31.8.40 proved width is not the constraint).

A real 2.7 m condo bedroom has a BUILT-IN wardrobe: shallower, and its doors slide
rather than swing, so it needs far less clear floor.

**CORRECTED v0.31.8.41 — do not build this expecting it to unlock the corridors.**
Measured: only FOUR wardrobes are missing library-wide (`tpl-hdb-3room` ×2,
`tpl-hdb-jumbo` ×2), and `tpl-condo-3bed`'s corridor is blocked by the COLUMN's
depth, not the wardrobe's: three bedrooms plus a bath in a 9.3 m column leaves each
bedroom ~2.4 m deep, and a 2.0 m bed leaves 0.4 m — less than a wardrobe's depth at
any width. A shallower piece would still not fit. The two rooms that could take a
recovered wardrobe (`h3-master` and `jb-bed5`) are both 2.6 m across, so no
threshold separates them, and recovering `jb-bed5`'s parks it in front of a window.
A built-in variant is still worth having for realism, but its value is NOT here.

## ~~tpl-condo-penthouse: `cp-liv-win` is in the dining room~~ — FIXED v0.31.8.42

Fixed along with three more of the same kind, found by a sweep rather than by hand.
`src/floorplan/windowNaming.test.ts` now ratchets the whole library at zero known
misnamed windows.

## ~~264 m²~~ 75 m² of template floor belongs to no room — CORRECTED v0.31.8.46

Measured v0.31.8.45 by flood-filling each level's interior and subtracting the
declared room rectangles. The hand-authored default flat is **4%** undeclared; the
templates run 4–31%.

**The 264 m² figure OVERSTATED it about threefold.** Splitting those cells by
distance to the nearest declared room (v0.31.8.46): **156 m² is margin** — the 0.1-0.2 m
band left because room rectangles are inset from wall centrelines, which is
structural to the model and not a defect — and only **75 m² is real space**, about
3 m² per level. The split is sound: a 1 m corridor's centre cells sit 0.5 m from any
room and count as real; only its outer band counts as margin.

Jumbo was the one template where the real space was substantial, and it is fixed.
For the rest, 4-11 m² of real corridor each does not justify re-authoring room
rectangles — revisit only if a template is being re-planned for another reason. Undeclared floor is invisible to the area readout, the floor
finish, the socket counts and the circulation statistic, so a plan that is 15–30%
unaccounted is not contractor-grade.

`tpl-hdb-jumbo` is fixed (31% → 12%, by declaring its central Hall). Remaining, worst
first: `tpl-condo-penthouse` 22.3 m² (16%), `tpl-hdb-exec` 19.9 (15%),
`tpl-condo-4bed` 19.9 (16%), `tpl-hdb-3gen` 19.0 (17%), `tpl-hdb-4room` 15.0 (18%),
`tpl-condo-3bed` 14.7 (15%), `tpl-hdb-5room` 14.5 (14%), `tpl-hdb-maisonette` 13.0 +
12.0 across two storeys, `tpl-hdb-3room` 9.7 (17%), `tpl-condo-1bed` 7.3 (16%).

Each needs its own read: the space is usually a corridor, and declaring it means
choosing a category (`foyer` for circulation) and an L-shape where a bath or store
sits in the strip. Jumbo's entry is the worked example. Declaring a room also gets it
FURNISHED, which is a gain (+5 pieces there) but changes the per-template counts.

## Template wall structure is 50% unclassified — and that is CORRECT

Measured v0.31.8.45: across the library, 127 walls resolve to NOT PERMITTED, 10 to
permit-required and **139 to unclassified**. Every one of the 10 `permit` walls is in
the hand-authored default flat; no template declares a single one.

Do NOT "fix" this by inferring structure from wall thickness in mm —
`wallHackability.ts` records why that is forbidden (a non-structural precast
partition and a load-bearing wall are identical on plan, a documented HDB
hacking-plan failure mode). For a generic flat-TYPE archetype there is no correct
answer, and the app already says so: `Unclassified — confirm structure with HDB/PE
before hacking`, plus a ⚠ per wall on the hacking sheet. Recorded so the 50% is not
mistaken for a gap by a future reader.

## ~~(g) LEVEL-ISOLATION-IN-WALK is implemented but VISUALLY UNVERIFIED~~ — VERIFIED v0.31.8.49

v0.31.8.47 makes walk mode render the storey below the walked one. Unit-tested and
bounded (it can never render more levels than the default `'all'` view), but nobody
has seen it: the headless harness cannot turn a first-person camera — look is driven
by pointer-lock `movementX`, and a synthetic drag does not move it — and the walker
spawns facing a wall, so before/after frames are identical.

Verify by hand: `tpl-loft` → View → Levels → Loft → walk → turn to the guard rail.
Expect a floor and the room below, not the pale sky gradient and two black holes the
(g) write-up describes. If it is wrong, the suspect is the wiring in
`apartment/PlanShell.tsx`, not `renderedLevels`, which has tests.

**DONE v0.31.8.49.** `window.__walkLook` now carries `setPitch`, `setYaw` AND
`setPosition`, so a scenario can place and aim the walker anywhere — every future
walk-mode change is verifiable headlessly. (g) is verified: standing at the
mezzanine edge, 57.2% of the frame differs with the fix disabled versus applied, and
the overlook band's mean luma goes 112.7 -> 174.4.
