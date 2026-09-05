# Open graphics decisions

Ten items the graphics-realism sweep (`v0.31.5.20`–`.117`) measured, diagnosed, and then
deliberately did **not** change, because each one is a product or content judgement rather than a
defect. Every measurable axis is now clean — the per-class chroma/coverage ranking (`.77`–`.81`),
tier parity (`.82`), and time-of-day in the boot view (`.83`) — so these are what remains.

**How to use this file.** Each item states what a user would SEE, the evidence already in hand,
the exact change and its blast radius, what genuinely needs a human, and a recommendation. Each
can be answered in one line. A recommendation is not a decision: nothing here has been applied.

---

## (a) DEFAULT-GLOOM — ✅ DECIDED: YES, SHIPPED in v0.31.5.86

> **Status: done.** The user approved the recommendation. `ensureDaylightFirstPaint` now fires at
> every hour; `isDaylightHour` and the `DAYLIGHT_START`/`DAYLIGHT_END` constants were deleted (no
> other consumers). Verified by A/B at a faked system clock — `lights-boot FAKE_HOUR=13` reads
> `off` on the old guard and `on` on the new, `FAKE_HOUR=21` stays `on`. Both preference guards are
> unchanged. The original write-up is kept below for the record.

### Original write-up — should the first-paint lights guard also apply in DAYLIGHT hours?

**What you would see.** Open the app after dark and the flat is already lit — lamps on, furniture
legible. Open it at 11:00 and the flat is lit only by sun through the windows, which is dimmer and
flatter than the same room with its fixtures on. The question is whether the daytime boot should
also switch the lights on once, at first paint.

**Evidence.** The guard is `src/state/storage/firstPaintDaylight.ts`
(`DAYLIGHT_START = 8`, `DAYLIGHT_END = 18`). It is a ONE-SHOT first-paint guard, not the retired
continuous `'auto'` follow-the-sun mode, and it never overrides a real preference
(`timeMode !== 'system'` and `lightsMode !== 'off'` are both no-ops).
- `.54` measured the daytime payoff at **2.3–2.5x**.
- `.74` settled the mechanism with a wall-clock table (`.54` 10:04 → `off`, `.62` 14:20 → `off`,
  `.68` 17:40 → `off`, `.72` 20:00 → `on`, `.73`/`.74` 20:30+ → `on`) and a falsifying arm: booting
  13:00 vs 22:00 and diffing the whole store, only **2 of 133 scalars** differ — `lastSavedAt` and
  `lightsMode`. The clock is not selecting a different startup path.
- `.72` flagged "DEFAULT-GLOOM's premise may be stale" and said not to act until settled.
  **That flag is now resolved**: its two runs resolved `on` because the guard fires at first paint
  against the REAL wall clock before a probe switches to manual time — the mechanism `.83`
  independently rediscovered and documented (playbook, meta-rule xcviii).
- `.83` adds the strongest supporting datum: at 21:00 the fixtures are worth **7.8x in luminance**
  (mean 132.2 lit vs 16.9 unlit, orbit/medium, identical pixel regions) while costing essentially
  nothing in chroma (0.249 vs 0.248). The guard's mechanism is proven benign — it buys brightness
  without pushing the frame toward the cartoon look the tone-operator work was chosen to avoid.

**The change.** One line in `firstPaintDaylight.ts` (`isDaylightHour` → always). Existing
precedent, existing unit-test file. **No tier cost**: the fixtures already exist and already render
at every tier, so this adds nothing on the weak-device path.

**What needs a human.** Whether a daylit flat with its lamps on reads as *cosy* or as *wrong* —
lamps burning at noon is slightly unrealistic, and the current behaviour is arguably the more
honest daylight render. That is an aesthetic call about first impressions, and no probe settles it.

**Recommendation — YES, extend it.** The 2.3–2.5x payoff is large, the mechanism is already shipped
and trusted after dark, and this is now "extend a guard that exists" rather than "change a default".
Keep it strictly one-shot at first paint and keep both existing no-op guards, so a user who has
ever expressed a preference is never overridden.

---

## (b) WINDOW-TIME-INVARIANT — ✅ SHIPPED (curtains open v0.31.5.88; sun-driven default v0.31.5.92)

> **Status: CLOSED. Option 2 chosen by the user and shipped in v0.31.5.92** — `backdrop` now
> defaults to `'sky'`, the sun-driven analytic backdrop, so the exterior tracks the clock the
> interior is already graded by. Measured at the `win-mainBedroom-N` pose: 09:00 -> 13:00 moved
> from **0.1 rgb** (time-invariant) to **16-25 rgb with a hue flip** (warm morning -> cool midday),
> and 21:00 is a genuinely dark warm night.
>
> **It required option 3 as well, and that is a measured finding rather than scope creep.**
> `proceduralSky` was pro-tier and Simple forces pro flags off, so `'sky'` in Simple selected a
> backdrop nothing could paint — verified in a frame: a **flat dead grey window**, worse than the
> city preset. The flag is now simple-tier, matching this repo's own rule that anything changing
> the DEFAULT look must not sit behind a pro flag. `isPhotoBackdropActive` was also root-caused so
> the dead-slab state is unreachable at any flag setting.
>
> **Option 1 (re-author the `city` palette) was NOT taken, and `.91`'s reason for dismissing it was
> wrong.** `.91` claimed `BACKDROP_PRESETS` "is not the lever" after an edit measured
> byte-identical; that was a broken probe (it used `toggleWindowFixture` to "open" curtains that
> v0.31.5.88 already ships open, so it closed them). A clean mutation moves the frame decisively.
> The presets ARE editable — the option was simply not the one chosen.
>
> **Trade-off accepted:** the `sky` backdrop has no skyline, so the default view loses the HDB
> towers and gains a time-tracking sky. `city`/`dusk` remain one click away in the picker.
>
> Historical status below.
>
> **Option 1 of 3 done (v0.31.5.88), and it changed the picture.** The default flat now ships with
> `drawAmount: 0` on all four curtains, so the baked city backdrop is finally visible; the def's own
> default stays drawn for user-placed curtains. **But opening them exposes what drawn curtains were
> hiding**: at `HOUR=13` a walk frame now shows a dark sky with lit tower windows and glowing street
> lamps — a night skyline at midday, beside a TV playing a bright daylight image. The backdrop is a
> static authored palette and `proceduralSky` remains pro-gated per the same decision, so nothing
> makes it track the sun in Simple.
>
> **This is worth re-deciding now that it is visible.** Options 2 and 3 from the original write-up
> are unchanged and still open: default `backdrop` to `'sky'`, or ungate `proceduralSky` in Simple.
> A third possibility this round surfaces: re-author the static `city` palette to read as daytime,
> which keeps the flag contract intact and costs only content. Original write-up below.

### Original write-up

**What you would see.** By default you see nothing outside: the flat ships with its **curtains
drawn**, so all five window openings are covered. Open them (the UI offers "E — Open curtains") and
there is a good city skyline with lit windows and a horizon glow — but it is the same view at 09:00
as at 21:00. Tower windows are lit at noon.

**Evidence.** `scripts/dev-probes/window-hours.mjs`, one fixed window pose derived from the plan's
own opening, fixtures opened once, then only the clock swept. Same crop, mean rgb:
**09:00 198.8/187.2/171.8 · 13:00 198.2/186.4/170.5 · 21:00 181.6/166.9/146.7**. 09:00 and 13:00
are identical within ~1 unit; 21:00 is ~9% darker *only* because global day/night exposure dims the
whole frame (the white window grille dims with it). The exterior CONTENT never changes.
This is by construction: `backdrop` defaults to `'city'`, a static authored palette. The sun-driven
alternative is the `sky` backdrop, gated on the `proceduralSky` flag, which `featureFlags.test.ts`
pins **false in `simple` and true in `pro`** — and Simple is the app default, so a default user can
never get a time-following exterior.

**The change.** Three separable choices with very different blast radius:
1. ship the default flat with curtains **open** — content only, most visible, cheapest;
2. default `backdrop` to `'sky'` — changes the authored look for everyone;
3. ungate `proceduralSky` in Simple — touches the **feature-flag tier contract**, and the repo rule
   is that anything analytical/advanced belongs in `pro`.

**What needs a human.** Whether a time-following exterior is a *pro* feature or part of the core
promise, and whether curtains-drawn is a deliberate privacy/staging default. Both are positioning
calls, not rendering ones.

**Recommendation — do (1) only.** Shipping the default flat with curtains open exposes a backdrop
that already reads well and costs nothing but a content edit. Leave `proceduralSky` pro-gated:
option 3 would relitigate the Simple/Pro contract to fix a subtler problem than the one users
actually hit, which is that they never see outside at all.

---

## (c) PLAN-SWAP-STRANDED — ✅ DECIDED, SHIPPED in v0.31.5.90 (as an honest confirm)

> **Status: done, and the recommendation needed one correction.** Both rehome paths ALREADY had
> danger confirms, so nothing needed adding — what they SAID was wrong. Each promised "Your
> furniture is kept — anything left outside a room is moved back inside", which is true only of
> free-standing floor pieces. The confirm now counts what will really be left outside (pure
> `countStrandedAfterRehome`, computed against the plan actually being loaded) and says so. The
> skip predicate is untouched, as recommended. Also fixed: the `mounted || noClip` rule was
> duplicated between the two rehome call sites that `rehomeItems.ts` claims "can't drift" — now one
> shared `isAnchoredToNonFloor`. Original write-up below.

### Original write-up

**What you would see.** Load a saved apartment or reset to a much smaller plan, and wall art,
curtains, the ceiling fan, the TV, the range hood, a cove light and a rug with its books and candle
hang in the void beside the new shell — e.g. `wall-art@12.5,6.55` in a plan whose rooms end at
x = 5.8.

**Evidence.** `scripts/dev-probes/plan-swap-rehome.mjs`, furnished default 4-room (**87 items**),
reset between arms so each swap starts identical:

| target plan | centre outside every room | footprint crosses out |
| --- | --- | --- |
| *(baseline, 4-room)* | 2 | 7 |
| `tpl-condo-penthouse` | 4 | 6 |
| `tpl-hdb-2room` | **32** | **46** |
| `tpl-studio` | **37** | **48** |

A similar-sized plan is fine; only a much smaller one strands. **Note on the figure:** these are
item COUNTS, not percentages — 37 of 87 items is ~43%. `floorplan/CLAUDE.md` currently glosses this
as "~37% of the home", conflating the count with a percent; the counts above are the measured
values. Only the `replaceFloorPlan(plan, { furniture: 'rehome' })` path is affected — the template
picker clears furniture behind a danger confirm, and SH3D import brings its own.

**The change — and what NOT to do.** The skip predicate
(`skip: (defId) => def.mounted || def.noClip`) is **correct as written**, and widening it makes
things worse: re-homing every `noClip` def would rip decor off tables and scatter cushions and tea
sets to room centres, and moving `mounted` pieces floats them in mid-air. The real fix is
structural — an attached piece must move WITH its host, be re-anchored to a wall in the new plan,
or be dropped with consent — which means modelling the host relationship that does not exist today.

**What needs a human.** Which of those three behaviours is right, and whether this rare path
deserves the structural cost at all.

**Recommendation — do not touch the skip predicate; ship a confirm instead.** The cheap, honest
interim is to warn on the rehome path naming the count of pieces that will end up outside, mirroring
the danger confirm the template picker already has. That converts a silent mess into an informed
choice, and it does not spend structural effort on a rare path before you have decided the model.

---

## (d) wall-reveal POSE — ❌ CLOSED as NO DEFECT in v0.31.5.89 (my premise was wrong)

> **Status: closed, no code change, on the user's decision.** The write-up below claimed the
> parameter "promises 0.05 head-on and the shipped default pose never gets near it". **That is
> false.** Verified exactly: head-on (`toward` = 1) yields opacity **0.0500** — the floor is
> delivered where it is promised. The boot pose is a 45° diagonal (`toward` = 0.707), giving
> strength 0.6616 → opacity 0.3715, which is an angle-graded curve behaving correctly at an
> intermediate angle. `WALL-REVEAL-ANGLE-GRADED` already ruled that near walls "SHOULD fade
> gradually and are EXPECTED to rest anywhere along the curve"; the mid-band worry applies to FAR
> walls, which are excluded structurally. The onset lever cannot reach the floor either (onset 0
> only gets to 0.2468), so the request needs a steepened curve — the "fast-ramp bias" that decision
> explicitly rejected. Original write-up kept below as the record of the error.

### Original write-up — contains the false premise

**What you would see.** At the dollhouse boot pose, every near-facing façade is a translucent milky
sheet rather than the near-invisible outline the feature intends; kitchen and dining furniture read
through it.

**Evidence.** `WALL-REVEAL-STRENGTH` defaults to 0.95, described as a head-on opacity floor of
`1 - fade` = **0.05**. But `revealStrength` is `smoothstep(0.25, 1, toward)`, and the dollhouse boot
pose looks down a 45-degree diagonal (camera forward XZ `[-0.64, -0.64]`), so **every** visible
façade sits at `toward` = 0.707 → opacity **0.371**, and never approaches that floor unless the user
deliberately orbits a wall head-on. 0.371 is precisely the "washed mid-band" the retired binary
target was introduced to prevent — fixed structurally for FAR walls, reappearing on NEAR walls as a
consequence of the default camera angle.

**The change.** Retune the `smoothstep` domain or the default strength so the 45° boot pose lands
near the intended floor. A design-parameter change in the wall-reveal path; **no tier cost**.

**What needs a human.** Two defensible looks: a milky sheet preserves the sense of an enclosing
room, a crisp outline shows the furniture. The feature has already reversed direction once
(`WALL-REVEAL-BINARY-TARGET` → `WALL-REVEAL-ANGLE-GRADED`), so this is a taste call with history.

**Recommendation — worth changing.** The parameter's own documentation promises 0.05 head-on and
the shipped default pose never gets near it, so the intent and the behaviour disagree; and this is
the first frame every user sees. Retune the curve so the boot pose lands low, rather than reverting
to binary.

---

## (e) Curtain cuts through the bedside lamps — ✅ DECIDED: fix as content, SHIPPED in v0.31.5.87

> **Status: done.** Fixed in `defaults/mainBedroom.ts`, not in the placement rules. The arithmetic
> showed there was no z placement (the north wall at z 0.20 forces a 0.40-deep nightstand to reach
> z >= 0.60, into the 0.48-0.58 panel) and none in x at the old 2.2 m width either — so the curtain
> narrowed to 1.9 (x 0.75-2.65, still covering the 0.8-2.6 glass) AND the nightstands, lamps and
> plant moved outboard to x 0.475 / 2.925. Pinned by `defaults/mainBedroom.test.ts`, which fails 4
> of 9 on the old geometry. Original write-up below.

### Original write-up

**What you would see.** Both `mainBedroom` bedside lamp shades render with a clean V-notch bitten
out of the top edge, curtain visible through the bite — at 13:00 and 22:00 alike.

**Evidence.** Hypothesis A (transparency sort) is **refuted**. Hypothesis B is **confirmed with
coordinates**: the shade spans world z **0.30–0.60** and the curtain panel **0.48–0.58**, so the
curtain plane passes straight through the shade. The "notch" is an ordinary intersection, **rendered
correctly** (`side=2` is why the shade's inside is visible). `defaults/mainBedroom.ts` puts both
nightstands under a 2.2 m curtain spanning x 0.6–2.8.

**The change — three candidates measured, none clean.**
- `length: 'sill'` lands the hem at 0.85 against a shade top of 0.92 — still intersects.
- Moving the nightstands clear needs them **0.33 m off the wall** — visibly wrong for a bedside table.
- Narrowing the curtain to the glass still overlaps.
- `CURTAIN_SILL_STANDOFF` is **ruled out by its own derivation**: its 0.2 is derived in
  `placement/windowSnap.ts` to clear the sill ledge with 0.02 of margin, and the previous 0.16 read
  as the curtain embedded in the wall.

**What needs a human.** Curtain length and bedside-table placement are interior-design choices. The
renderer is behaving correctly, so there is nothing to fix in the geometry system.

**Recommendation — fix it as CONTENT, in the default flat.** Since the rendering is right and every
systemic lever is ruled out, adjust `defaults/mainBedroom.ts` — a shorter curtain on that window, or
nightstands that are not directly under a full-length panel. That is a one-file staging change to
the demo apartment and leaves the placement rules untouched.

---

## (f) TEMPLATE-ROOM-ENCLOSURE — ⏳ **1 of 20 remains** (`.194` 4-room, `.195` 5-room, `.196` exec, `.197` jumbo, `.199` condo-4bed, `.200` 3gen, `.201` 3-room's master bath, `.203` maisonette)

> **The two left are different in kind.** `tpl-hdb-3room`'s north strip and
> `tpl-hdb-maisonette/em-up` are not missing partitions — subdividing them asks how rooms are
> ENTERED, and a wrong answer produces a kitchen reachable only through the service yard. The two
> bisection entries are ✅ **FIXED in `.202`** by shortening both corridor walls to the master's
> north wall — no rectangle resize was needed once the baths had partitions of their own.

> **Note for the remaining six:** closing a column can SEAL a bathroom — `tpl-hdb-exec` had no door
> on either bounding wall, and the enclosure ratchet passes happily on two sealed boxes. Check the
> doors, not just the ratchet.

> **`v0.31.7.194`:** `h4-cbath`/`h4-mbath` owned no walls at all. Three partitions close the bath
> column (x 3.6-5.7, z 6.5-D) and two doors reach it, which separates all five rooms the ratchet
> listed together. Item `(j)` improved as a side effect: `h4-m-win` is no longer blocked.

Original write-up (measured v0.31.5.109):

**What you would see.** Load `tpl-hdb-jumbo`, walk into the Master Bedroom, and look west: **two
toilets and a washbasin are standing in the same open volume as the bed**, with no wall or door
between them. Turn 90 degrees and a corridor wall slices through the middle of the room as a grey
slab. The walk probe's own room-centre spawn lands at x=4.11 with that wall at x=4.0 — it puts the
camera 0.11 m from a wall it thinks is the middle of the room.

**Evidence.** Frames `/tmp/tw4` (48, 17:06, resolved `medium/on/manual13`). Two sweeps over all 20
templates and every storey:

- **Bathrooms nobody can enclose.** Flood-filling the free space with every wall treated as solid
  (openings ignored — a door still separates two rooms) puts a `bath`/`powder` room in the SAME
  component as other declared rooms in **9 of 20 templates**: `tpl-hdb-3room` (two groups),
  `tpl-hdb-4room`, `tpl-hdb-5room` (all 10 rooms in one component), `tpl-hdb-exec`, `tpl-hdb-3gen`,
  `tpl-hdb-jumbo`, `tpl-hdb-maisonette/em-up`, `tpl-condo-4bed`. Confirmed by hand on
  `tpl-hdb-4room`: the plan has **9 walls total**, and `h4-cbath` and `h4-mbath` have **none of
  their own** — `h4-m-n` stops at x=3.6, just short of where they begin.
- **Walls through rooms.** A corridor wall runs through a master bedroom's interior, far from any
  boundary, in two templates: `jb-wb-corr` 3.20 m through `jb-master` (1.80 m from its nearest
  parallel edge) and `g3-b-corr` 2.20 m through `g3-master` (1.50 m). The room rectangles also
  overrun those walls into the corridor beyond.

**This is NOT the running default flat.** The app boots `defaultPlan.ts` — a separate, 11-room
hand-authored plan with its own `corridor` room. Its bathrooms were re-walked at 17:10 (`/tmp/tw5`)
and are **correctly enclosed**: tiled walls all round, a door with a working prompt, a shower
screen. That run also settles the mechanism — the 3D shell builds walls from `plan.walls` and does
NOT synthesise partitions from room rectangles, so the sweep measures the model the renderer uses.
`tpl-hdb-4room` is a template in the picker, not the boot plan.

**The change and its blast radius.** There is no code fix. Enclosing these rooms means adding
partition walls plus the doors to reach them, and re-sizing the room rectangles around them — in
`tpl-hdb-jumbo`'s case the master enclosure is 3.9 x 3.5 m and currently declares three rooms
inside it, so any correct partition makes the master bedroom roughly 2.1 m wide, or moves the
"Common Bath" out to the corridor where its name says it belongs. That is re-drawing shipped
Singapore starter layouts that carry real project names.

**What needs a human.** Room sizes, which bath opens off which space, and where doors go are
interior-design decisions about content the product ships as accurate reference plans. Picking them
unilaterally would be inventing a floor plan, not fixing a defect.

### v0.31.8.39 — condo 3-bed: the door, not the corridor — and a ratchet so the chain stays visible

`tpl-condo-3bed` was the last level not blocked on the content call. Both fixes were built and
measured: a **1.0 m corridor** is the correct architecture and costs **all three wardrobes and a
dresser** (a 2.7 m wide bedroom cannot take a 1.5 m freestanding wardrobe beside a bed; all three
beds survive), while **one door from the living** connects the column at **zero** furniture cost
and leaves the chain bedroom 2 → bedroom 3 → master.

Took the door. The measured defect is "rooms nobody can reach"; the corridor's extra benefit is
real but unmeasured, and its cost is an artefact of the app modelling a wardrobe as a freestanding
1.5 m piece rather than the built-in a real 2.7 m condo bedroom has. Connectivity: **16 → 3**.

**The honest problem with that choice is that the door hides the chain**, so this adds
`src/floorplan/bedroomPrivacy.test.ts` — bedrooms reachable only by crossing another bedroom. Four
across the library. If the wardrobe kit ever gains a built-in variant, revisit the corridor.

### v0.31.8.38 — every room in the library now has a door; (f) is down to 4 levels, all one shape

Re-triaged the 8 remaining levels instead of assuming they were all the hard case, and **half of
them were not**: four held a single room that still had no door — `tpl-loft/lf-up`'s Dressing,
`tpl-condo-4bed`'s Balcony, `tpl-condo-penthouse`'s Master Bath and `tpl-terrace-ground`'s Service
Yard. Earlier scans returned no suggestion for these because they touched no wall shared with the
main component *at the time*; the component has since grown, so the same scan now answers cleanly.
`tpl-hdb-exec` held four more (living, kitchen, service yard, shelter).

Eight doors later: **`tpl-loft`, `tpl-condo-4bed`, `tpl-condo-penthouse` and `tpl-terrace-ground`
are fully connected**, and `tpl-hdb-exec` goes **6 groups → 2**. The ratchet is **16 levels →
4**, and every one of those four is now the SAME shape: a bedroom zone with no corridor, reachable
only by opening a door straight into a bedroom. `tpl-hdb-4room`, `-5room` and `-exec` additionally
hold a bedroom with no external wall, so the fix there is a re-plan and it is blocked on the
content call above. `tpl-condo-3bed`'s column has no interior bedroom — it is purely the
door-into-a-bedroom question.

**Two offsets had to be measured, both for the same reason as every earlier batch:** the exec's
kitchen door at the near end of its run took the stove wall and the room lost its **RANGE HOOD**;
the loft's dressing door cost the ground-floor stairs a bench until it moved. Both were fixed by
moving the door, not by adjusting a guard — and this batch needed no guard change at all, which is
the first time a doors batch has been free.

Also cleared as a side effect: `ex-b2-win` no longer has a wardrobe in front of it. **Item (j) is
now 11 → 7, entirely from (f) and (i) work.**

### v0.31.8.36 — an area threshold for the dining kit is the WRONG instrument; (i) 2-room fixed instead

Last entry proposed reducing the dining kit for small combined living/dining rooms. **Measured
first, and it does not hold up.** Every room that receives a dining set, smallest first:

| area | room | kit |
| --- | --- | --- |
| 3.1 m² | `tpl-1bed/ob-dining` | diningRoom |
| 5.8 m² | `tpl-condo-penthouse/cp-dining` | diningRoom |
| 7.3 m² | `tpl-terrace-ground/ct-dining` | diningRoom |
| **9.2 m²** | **`tpl-hdb-2room/h2-living`** | **living+dining** |
| 11.1 m² | `tpl-1bed/ob-living` | living+dining |
| 17.9 m² | `tpl-hdb-3room/h3-living`, `tpl-condo-1bed/c1-living` | living+dining |
| … up to 38.6 m² | `tpl-hdb-exec/ex-living` | living+dining |

**`h2-living` seats four chairs at 9.2 m² today, with no strand.** So area does not predict fit —
geometry does. An area threshold set high enough to help a 13 m² re-plan (≥15 m²) would strip
chairs from two rooms where they demonstrably work, to fix a room that does not exist yet. Dropped.

That closes both routes to (f)'s option 1 for the tight HDB plans: the placement fallback costs
items (v0.31.8.35) and the kit threshold is the wrong instrument. The 8 remaining levels stay as
they are, and the 4-room/5-room/exec entry above stands as written.

**Spent the tick on (i) instead, where two entries were still open.** `tpl-hdb-2room`'s front door
opened into the **BATHROOM** (offset 1.2 on `h2-s` = x 4.7-3.8), and its living/dining had **no
window at all** — `h2-liv-win` sat at offset 4.2 on `h2-w`, which runs south→north from z=6.3, so
it was at z 2.1-0.7, inside the MASTER, which already had one. Both fixed. `KNOWN_MISPLACED_MAIN_DOORS`
is down to one entry (`tpl-hdb-5room/h5-main -> h5-master`).

Three door offsets were measured on the living's frontage, and the readable-on-paper one is wrong:
**3.5 loses the flat's dining TABLE altogether** (4 chairs, no table — the exact regression
`diningChairTuck` was written for), 4.6 costs three items, 2.6 costs one (the TV console). Removing
the master's second window also left its wardrobe in front of the remaining one until that window
moved to the west end of its frontage.

### v0.31.8.35 — the last 8 levels need a smaller dining set, and the naive fallback is measured worse

Having decided to take (f)'s option 1 myself (shrink the living, accept a smaller dining set,
rather than ship windowless habitable bedrooms), I went after the thing that actually blocks it: a
4-seat dining set does not fit a 13-15 m² living/dining, and the 4th chair falls through to
`arrangeCore`'s room-wide safety settle, which parks it metres from its table.

**The obvious fix is a last-resort commit at the table, and it fails the furniture guard.**
`arrangeLivingAnyEdge` already offers the table's two ENDS as spare slots; when those are rejected
too the chair is simply left unplaced. Committing it to its own slot anyway was built and measured
twice:

- **Ignoring all checks: 899 → 875 items.** An overlapping chair becomes an obstacle for
  everything placed after it, so the loss cascades far beyond the chair.
- **Relaxing only the door/window keep-outs, still enforcing item and wall collisions:
  899 → 897.** `tpl-1bed` goes 48 → 46: the chair legitimately claims table-side floor that two
  accents used to get, because dining chairs are placed before accents while the safety settle
  runs last.

Both are exactly what `placeSeededMounts.test.ts`'s `total >= 899` exists to catch — its own
docstring records two earlier attempts that scored 893 and 895 while reporting a stranding win.
**Reverted.** I am not lowering that guard for a placement change; the one time it moved
(900 → 899, v0.31.8.31) it was for a content trade with a per-def diff behind it.

**So option 1 needs the dining KIT to change, not the placement.** `furnishPlan.ts` gives every
combined living/dining `KITS.living + KITS.dining` — a `dining-table-4` and 4 chairs — with no
reference to the room's area. A small combined room wants a 2-chair set. That is a deliberate
content change with a visible rationale (a 13 m² living/dining genuinely does not seat four), it
PREVENTS the strand rather than papering over it, and it costs 2 items per affected room, which
will move the same guard. Worth doing, but as its own change with the affected rooms measured
first — not folded into a template re-plan.

**State of the (f) programme:** 16 disconnected levels → **8**. Every level fixed so far was fixed
without touching a guard. The 8 that remain are all the same shape: a bedroom column with no
corridor, where carving one costs living-room area, and that area is what seats the dining set.

### v0.31.8.33 — 12 rooms across 3 templates had NO DOOR; and a triage of what remains

Rather than keep discovering each template's blocker one at a time, I triaged all 13 remaining
levels first: per sealed group, how much SPARE floor it holds (circulation available to open a
door onto) and whether it contains a bedroom with no external wall. That splits the work cleanly.

**Blocked by the same tension as (f)'s 4-room entry** — a bedroom with no façade at all:
`tpl-hdb-5room` (`h5-bed3`) and `tpl-hdb-exec` (`ex-bed3`). The decision written up for
`tpl-hdb-4room` covers all three; attempting them individually just repeats that dead end.

**Cheap, and done here:** groups that are a single room with ~0 spare are rooms that simply have
no door. A wall-by-wall scan for the longest span where a sealed room and the main circulation
face each other gives the wall and offset directly. Fixed 12 such rooms:

- `tpl-condo-3bed` **7 groups → 2**: kitchen, service yard, common bath, master ensuite and
  balcony all had no door.
- `tpl-condo-studio` **3 → 1**: kitchenette and balcony.
- `tpl-hdb-maisonette` **4 → 1**: kitchen, service yard and the **stair hall** — on a maisonette
  that hall is the only route to the upper storey, so the plan shipped a two-storey home whose
  second storey could not be reached.

**Two door positions had to be measured, not guessed.** At its first offset the condo master's
ensuite door pushed the wardrobe onto the east wall in front of `c3-m-win`, and the maisonette's
yard door (on the yard's east wall) crowded that room's own window and put a utility cabinet in
front of it — caught by `windowSightline` and `placementSoundness`. Moving the ensuite door to the
west end and the yard door onto the service band's south wall cleared both.

Also closed a pre-existing stray-wall warning: `c3-bal-n`, the balcony parapet, stopped 0.1 m
short of the walls at both ends. Closing it makes the balcony a real enclosure and it furnishes
one piece better — the item total went UP, 1430 → 1431.

**What still remains, and why:** `tpl-condo-3bed`'s bedroom column keeps 2 groups because it has
no corridor — its three bedrooms fill it, so any door from the living opens straight into bedroom
2. Same class as 4-room. `tpl-condo-2bed`, `-4bed`, `-penthouse`, `tpl-1bed`, `tpl-loft/lf-up` and
both `tpl-terrace-ground` levels have suggested doors ready from the same scan and are next.

### v0.31.8.32 — `tpl-hdb-4room` NEEDS A CONTENT CALL: its defects are in direct tension

Fourth template attempted, and the first that cannot be fixed without a decision. Four layouts
were built and measured; **all four are reverted.** The plan file is unchanged.

**Why it is not a "one door short" case like the 3-room.** `tpl-hdb-4room`'s bedroom zone
(x 0.1-5.7, z 2.9-9.7) contains bedrooms 2 and 3, both baths and the master as ONE open volume
with no corridor. Nothing pierces `h4-liv-w`, so none of them is reachable. But a door anywhere on
that wall opens straight into a bedroom, because the rooms fill the zone — there is no circulation
to open onto. And `h4-bed3` (x 3.2-5.6, z 3.2-6.2) touches **no external wall at all**, which is
why it ships windowless: fixing item (h) for it is not a window offset, it is a re-plan.

**The tension.** The zone's only façades are west (`h4-w`) and south (`h4-s`). The living column
occupies the whole east side. So giving bedroom 3 a façade means taking frontage from the living —
and every version of that starves the living room:

| living | result |
| --- | --- |
| 3.2 × 4.0 m (12.8 m²) | 1 chair stranded **1.32 m** from its table (threshold 1.2) |
| 3.2 × 4.5 m (14.4 m²) | 1 chair at **3.69 m** — worse |
| 3.7 × 4.0 m (14.8 m²) | **4** chairs stranded, worst 2.90 m |

Door and window positions on the living's east wall were swept too (main door at offsets 2.3 / 3.0
/ 5.0, window 1.4-2.0 m wide at three offsets): best case 1.32 m, none under the threshold. The
original 23 m² living passes the tuck test; a 4-seat dining set plus a lounge does not fit in
13-15 m².

So the plan can have **either** a bedroom 3 with daylight **or** a living room that seats its
dining set, not both, unless the envelope or the room programme changes. That is a content
decision, not a defect fix:

1. **Shrink the living and accept a smaller dining set** (a 2-seat table, or drop the dining zone
   and let the kitchen take it). Clears every ratchet entry.
2. **Leave bedroom 3 interior and windowless**, fixing only connectivity by carving a corridor out
   of the bedrooms. An HDB habitable room needs natural light, so this ships a known compliance
   defect — but it is what the plan does today.
3. **Re-cut the whole flat** so the bedrooms wrap the west and south façades and the living sits
   inland. Biggest change, closest to a real 4-room, and it stops being the shipped layout.

Recorded rather than chosen. The three ratchet entries stay as they are.

### v0.31.8.31 — `tpl-hdb-3room` re-authored (3 of 16); the living room sets a hard door budget

Third template, and the smallest change of the three so far: **the plan was one door short.**
Nothing pierced `h3-liv-w`, so the whole bedroom wing (master + ensuite + bedroom 2) had no way in
from the rest of the flat. Its original topology — `h3-m-e` fencing the master behind a narrow
strip that also serves bedroom 2 — is fine; it just needed a door onto the living.

Four entries cleared: connectivity 2 groups → 1; **`h3-kit + h3-yard + h3-shelter + h3-cbath +
h3-living`** (the Common Bath was open to the kitchen and the living room); **`h3-mbath +
h3-bed2`** (no wall between the Master Bath and Bedroom 2); and `h3-bed2` in the windowless-bedroom
list — `h3-b2-win` had been at offset 6.4 on `h3-w`, i.e. z=2.0, **in the kitchen**, and bedroom 2
does not reach that wall at all. Item (j) gained too: the refrigerator that had been standing in
front of that kitchen-bound window is no longer blocking it.

**A hard constraint worth recording: this living room affords exactly ONE door on `h3-liv-w`.**
It is 3.2 m wide, and a second door's swing keep-out strands the 4th dining chair 2.2 m from its
table. Measured directly — one door passes the tuck test, two fail — and neither narrowing both to
0.8 m nor moving them to the ends of the wall changed the outcome. So bedroom 2 is reached across
the strip rather than by its own door off the living. Any future re-plan of a narrow living room
should budget door swings the same way.

**Enclosing a small bath costs fixtures.** Walling the two baths at their original sizes
(2.2 m² and 2.7 m²) cost **both a toilet and a basin** — the door swing covers most of such a
room. They were enlarged to 2.7 and 3.0 m² rather than ratcheted, which restored every fixture.

The global furniture floor moved 900 → **899**, the first time it has been lowered, for exactly one
piece: bedroom 2's 2.0 m south wall cannot take both its new window and a wardrobe. An HDB
habitable room needs natural light, which outranks a wardrobe in a 5.6 m² bedroom. Three
alternatives were measured first (a 1.0 m window, a deeper master bath, no window at all) and none
recovered it. Also closed a pre-existing stray-wall warning: `h3-m-e` stopped 0.1 m short of the
walls at both ends.

### v0.31.8.30 — `tpl-hdb-3gen` re-authored (2 of 16), and one researched target proved impossible

Second template. All of 3Gen's ratchet entries are gone — connectivity 7 groups → 1, the shared
enclosure `g3-gbath + g3-bed2 + g3-master + g3-mbath`, the bisected `g3-b-corr through g3-master`,
and its front door (item (i)) which had opened **into the master bedroom**. With jumbo's, the
`KNOWN_BISECTED_ROOMS` list is now **empty**.

Grounded in `docs/research/hdb-floor-plans.md`: 3Gen is ~115 m², **4 bedrooms and 3 baths, two of
them en-suite**, bedrooms on opposite sides of the shared living. The template's room SET already
matched; its geometry contradicted it — the "Grandparent Bath" sat 6 m from the grandparent suite
at the far end of the flat, and the "Master Bath" floated in the corridor with no walls of its own.

**The "two en-suite" target is not achievable in this envelope, and that is measured, not assumed.**
The west wing is 6.1 m wide and takes a bedroom plus ensuite comfortably (master 10.3 m², bath
5.4 m²). The east wing is 4.1 m. A `masterBedroom`-kit room needs roughly 9–10 m² before the kit
starts dropping pieces: at 6.2 m² the grandparent suite lost its **queen bed** and five other
items, and at 4.6 m² it lost seven. A furnishable bedroom there leaves ≤1.1 m for a bath, below any
usable width. So the suite takes the whole east wing (8.7 m²) and the third bath moved to dead
corridor floor as "Bathroom 2" — 4 bedrooms, 3 baths, **one** ensuite. Ship-blocking alternatives
were built and measured before choosing.

**Item (h): the same window bug as jumbo, twice over.** `g3-w` runs south→north, so `g3-m-win` at
offset 9.6 sat at z=1.7 — **in the kitchen** — and `g3-b3-win` at 7.0 sat at z=4.3, **inside
bedroom 2**. Three bedrooms (`g3-master`, `g3-bed3`, `g3-gen`) gained windows on walls they own;
template bedrooms owning a window 34 → 37. **Item (j):** `g3-liv-win` cleared, 10 → 9 blocked.

**Six geometry iterations, each corrected by measurement rather than reasoning:**

1. Carving both ensuites lost **both** queen beds (`bed-queen` 2 → 0).
2. Deepening the south wing recovered the master's bed but not the suite's.
3. Swapping the suite to the east wall so its window ran along the long side was a **no-op** —
   identical output, because the blocker is kit-vs-area, not headboard geometry.
4. Giving the suite the whole wing recovered its bed but dropped the plan under the global
   ≥900-item furniture floor (899).
5. Moving the corridor door to offset 3.4 made it **open into the common-bath box** — measurably
   costing furniture. Restored clear of both bath boxes.
6. A dining chair stranded 7.2 m from its table: I had shortened the living room to 8.1 m so the
   4th chair no longer fit. Restoring the east wing wall to z=8.8 took it to 2.1 m, and routing
   the service band off the CORRIDOR instead of the living's west wall (where the door sat beside
   the dining zone) cleared it entirely.

The item total is now **exactly 900**, the floor that assertion guards. That is tight by
construction — this plan trades a bathroom in the wing for one in the corridor.

### v0.31.8.29 — `tpl-hdb-jumbo` re-authored (1 of 16), all three ratchets improved

Directed to re-author all 16 disconnected levels, starting with the two frame-proven worst.
`tpl-hdb-jumbo` is done and every ratchet entry it held is GONE:

- **connectivity 7 groups → 1.** Added the doors the plan simply did not have: a service line
  (living → utility lobby → service yard → kitchen, shelter off the lobby) and a bedroom corridor
  off the living hall with one door per room. Before this, the kitchen, service yard and shelter
  had NO doors at all, and the west stack chained bed2 → bed3 → master with no way in.
- **shared enclosure `jb-cbath + jb-master + jb-mbath` → gone.** Per the recorded decision, the
  Common Bath moved OUT to the corridor (its name says common, so it must be reachable without
  crossing the master) and the ensuite is walled off as a full-depth strip.
- **bisected room `jb-wb-corr through jb-master` → gone.** The master rectangle had overrun the
  corridor wall at x=4.0 *and* both baths, claiming 11.5 m²; it is now an honest 6.9 m².
- **item (h), two bedrooms fixed.** `jb-m-win` sat at offset 10.2 on `jb-w`, which runs
  south→north — so it was at z=2.9, **inside the kitchen**, giving that room a second window and
  the master none. It moved to the master's own external wall (`jb-s`), and `jb-bed3` got its
  first window. Template bedrooms owning a window: 32 → 34.
- **item (j), one window cleared.** Dividing bedrooms 4 and 5 (previously one undivided volume)
  cleared `jb-b5-win`. Blocked windows 11 → 10.

**This hit item (f)'s own prediction exactly.** The write-up warned that "any correct partition
makes the master bedroom roughly 2.1 m wide" — the master is now 2.1 × 3.3 m. That is the cost the
decision accepted, not a slip.

**An L-shaped master was tried first and lost the bed.** Wrapping the master round a corner-placed
ensuite gave no leg deeper than 1.8 m, and a queen bed is 2.0 m long, so it could not be placed at
all — measured as `bed-queen` 2 → 1 across the template, i.e. a master shipping with no bed. The
shape was changed rather than the ratchet. Total pieces 1444 → 1440 is a genuine
room-geometry consequence (verified by per-def diff: a wardrobe and a desk in the now-smaller
bedrooms, plus one piece that had been standing outside every room; the ensuite GAINED a shower
and a second basin).

**Still open on this template:** the central corridor is ~43 m² of UNDECLARED space (pre-existing —
jumbo never had a corridor room), so the app accounts no floor finish or area for a third of the
flat. Worth declaring as a hall, but it is a separate content call.

### v0.31.8.28 — (f) is WIDER than measured: 16 of 22 template levels are internally disconnected

Starting the authorised re-authoring of `tpl-hdb-jumbo`, I read its west wing before moving
anything and found the wing has **no door to the corridor at all**: `jb-wb-corr` (x=4.0,
z 3.2→13.1) carries no opening, and the only doors in that wing are `jb-b2` and `jb-master`, on
INTERNAL walls. So bedroom 2, bedroom 3 and the master form a chain with no way in.

`.109`'s sweep could not see this: it flood-fills with **every wall solid, openings ignored** —
deliberately, because a door still separates two rooms. That measures too few WALLS. Treating
doors as OPEN measures a different defect: too few DOORS.

Measured with doors open, over all 22 template levels — **16 are internally disconnected**, i.e.
their declared rooms fall into two or more mutually sealed groups:

| level | groups |
| --- | --- |
| `tpl-hdb-jumbo/ground` | **7** — Kitchen · Service Yard · Household Shelter · Living/Dining · Family Room · Bed4+Bed5 · the west stack |
| `tpl-hdb-3gen/ground` | 7 |
| `tpl-condo-3bed/ground` | 7 |
| `tpl-condo-4bed/ground` | 7 |
| `tpl-hdb-exec/ground` | 6 |
| `tpl-condo-2bed`, `tpl-condo-penthouse`, `tpl-terrace-ground` (ground) | 5 |
| `tpl-hdb-maisonette/ground` | 4 |
| `tpl-loft/lf-up`, `tpl-condo-studio/ground`, `tpl-terrace-ground/ct-up` | 3 |
| `tpl-hdb-3room`, `-4room`, `-5room`, `tpl-1bed` (ground) | 2 |

Ratcheted in **`src/floorplan/templateConnectivity.test.ts`** (16 entries, by group COUNT so a
merge shows up as a required edit), with a second case asserting at least one level IS connected —
so the instrument cannot pass by calling everything broken.

**This changes the shape of the (f) decision.** Re-authoring `tpl-hdb-jumbo` is not "add partitions
and move the Common Bath" — the wing also needs door openings onto the corridor, and the same is
true of 15 other levels. It is still a content call, but a larger one, and worth re-scoping before
committing to "one template per change".

**Two wrong instruments, recorded so they are not repeated.** A flood fill needs a seed, and
seeding from the main door was wrong twice. The exterior is free space too, so seeding on the wrong
side floods OUTSIDE the flat and every interior room reads unreachable — that produced a
"13 of 20 templates have unreachable rooms" result I nearly reported. Requiring the seed to land
inside a declared room did not fix it, because template room rectangles overrun the perimeter walls
(itself one of this item's own findings), so a point outside the flat can still test as inside a
room. The shipped instrument picks NO seed: it labels every free-space component and counts how
many the declared rooms occupy.

**Recommendation — re-author the bedroom/bath wings, worst first, one template per change.** Start
with `tpl-hdb-jumbo` (the only one whose damage is frame-proven) and `tpl-hdb-3gen`, which share
the same shape: a bath wing with no partitions and a master rectangle overrunning the corridor
wall. Until then both defects are **ratcheted by name** in
`src/floorplan/templateEnclosure.test.ts`, so no new template can add another and fixing one shows
up as a required edit to the list.

---

## (g) LEVEL-ISOLATION-IN-WALK — ✅ FIXED v0.31.8.47, VERIFIED v0.31.8.49

> **SUPERSEDED ON MERGE (feat/blender-render).** This branch also fixed `(g)`, at
> `v0.31.7.207`-`.208`, with `visibleLevelsForWalk` (walked storey plus ALL below) and a
> per-room `ceilingCullBelowY` suppression. Staging's fix landed later, is bounded to the
> storey immediately below, carries a cost invariant in `renderedLevels.test.ts` and a measured
> frame diff (57.2 %, overlook luma 112.7 -> 174.4), and needs NO ceiling work because room
> ceilings are already `side: BackSide`. So staging's is what ships and this branch's
> `visibleLevelsForWalk` plus the ceiling plumbing were removed in the merge. The branch's own
> measurement stands as corroboration: below the walked storey, orbit rendered 0 meshes and
> walk 359.


**Decided and shipped** (the three open questions, answered): walk mode renders the storey
**immediately below** the walked one — not all storeys, because that is what an overlook can see and
it bounds the cost. The overlooked ceiling needed **no** work: room ceilings already render with
`side: BackSide` so they read from below and are invisible from above, which is exactly what an
overlook wants. **This write-up assumed otherwise and priced an occluder change that is not needed.**

**The cost question answers itself.** `viewLevelId` DEFAULTS to `'all'`, so every user already
renders every storey in orbit. `renderedLevels` can never return more levels than `'all'` — there is
a test asserting exactly that across every template and storey — so walking a storey now costs the
same as the default view, never more. No new tier benchmark is required.

**VERIFIED v0.31.8.49, and the fix is visible.** The headless harness could not turn OR move a
first-person camera (both are gated on Pointer Lock), so the dev-only `window.__walkLook` lever —
which already carried `setPitch` — gained `setYaw` and `setPosition`. Standing at the mezzanine's
north edge (2.4, 3.9) looking over the rail, with the change disabled versus applied at the SAME
framing: **57.2% of the frame differs**, and the overlook band's mean luma goes **112.7 → 174.4**.
Before, beyond the rail there is nothing but a pale gradient — exactly what this write-up describes.
After, the room below is there: walls, a lit interior, windows in the far wall. Luma is the same
instrument this item used for its original evidence. Scenario: `scripts/scenarios/loft-walk-level.json`.

### Original write-up (measured v0.31.5.110)
**What you would see.** Open `tpl-loft`, pick View → Levels → "Loft" (the ONLY way to walk the
mezzanine), and walk to the guard rail. Over the rail there is **no floor, no far wall and no room
below — just a pale sky gradient**. Beside the wardrobe, two **black holes** open in the floor where
the double-height space should be. The near-black rectangles in `lfu-ward-y3` and `lfu-sleep-y2` are
the same absence framed by a wall reveal.

**Evidence.** Frames `/tmp/tw6u` (12, 17:22, resolved `medium/on/manual13`). Ceiling-band luma puts
`lfu-ward-y3` at **28.2** against a 129–185 range for the rest of the storey — the same class of
outlier that caught `ct-kit` in `.103`.

**Mechanism, read from source after the pixels showed the symptom.**
`floorplan/levels.ts:visibleLevels(plan, viewLevelId)` returns **only the matching level** unless
`viewLevelId === 'all'`, and `apartment/PlanShell.tsx:575` renders exactly those — storeys unmount
when hidden, deliberately, so picking cannot hit them. Confirmed by a control arm differing in one
variable: the same four loft ground rooms render **126 meshes / 49191 tris** at the default `'all'`
and **103 / 41406** with a single storey selected. The missing 23 meshes are the mezzanine.

**The default is FINE — do not overstate this.** `viewLevelId` defaults to `'all'`
(`state/slices/cameraSlice.ts:130`), so out of the box every storey renders. The precise defect is
narrower: **`walkLevel(plan, 'all')` walks the GROUND floor, so the only way to walk an upper storey
is to select it — which is exactly what hides the storey beneath.** You cannot walk the loft
mezzanine without the floor below vanishing.

**Blast radius.** Only three templates are multi-storey, and severity tracks how much of the ground
floor has no storey above it: **`tpl-loft` 25.7 m2 of 41.9 (62%)** — the acute case, a genuine
double-height volume — versus `tpl-hdb-maisonette` 7.9 m2 (13%) and `tpl-terrace-ground` 10.2 m2
(13%), which are small stairwell voids. This is why `.95` and `.104` walked two upper storeys and
saw nothing: neither plan has enough void to expose it.

**The change and its blast radius.** Level isolation is correct for the dollhouse and 2D editing
views — isolating a floor is the point there. It is wrong in WALK mode, where you are standing
inside the building and the world should be continuous. So the change is to render the storeys
BELOW the walked one in first-person only. That is not a one-liner: the storey below draws its own
ceiling, so simply un-hiding it would replace the sky hole with the top of a ceiling slab seen from
above. It needs the existing ceiling-occluder path (`apartment/ceiling/CeilingOccluder.tsx`,
`occluderRects.ts`) extended to cull the ceiling of a storey being overlooked, plus a decision about
whether picking may hit the lower storey, plus a tier benchmark — the loft adds only 23 meshes /
7785 tris, but a deeper plan would add more, and nothing unmeasured should land on the weak-device
tier.

**What needs a human.** Whether walk mode should show all storeys below or only the immediate one,
whether the overlooked ceiling culls or fades, and whether the added cost is acceptable on the
Performance tier. These are renderer design + budget choices, not a defect with one right answer.

**Recommendation — fix it in walk mode only, starting with the immediate storey below.** It is the
mode where isolation has no meaning, `tpl-loft` is the only plan that visibly needs it, and the
measured cost there is small. Benchmark on the Performance tier before committing (`.97` shipped a
65% sky-bake regression by skipping exactly that step).

---

## (h) BEDROOM-WINDOW — ⏳ **3 of 44 remain** (`v0.31.7.192` fixed three, `.193` six more) and none is offset-fixable (measured v0.31.5.113)

> **`v0.31.7.192`:** `ex-bed2b`, `g3-bed3` and `jb-bed3` fixed by ADDING a window, not moving one.
> The mirrored offset is a position FINDER: flipping the existing glass swaps it between two rooms
> and leaves the count at 12 (measured), so "none is offset-fixable" stands. All three new windows
> are clear of furniture, so item `(j)` is unchanged.
>
> **`v0.31.7.193`:** six more, found by scanning every wall marked `thickness: 'external'` for a
> span where 1.5 m of glass opens outdoors, centred in that span. The three left — `h4-bed3`,
> `h5-bed3`, `ex-bed3` — have NO external span of their own and need a restructure. Item `(j)`
> improved as a side effect (`g3-liv-win` is no longer blocked).

> **⚠️ I CLOSED THIS IN ERROR ON 2026-09-04, and `v0.31.7.145` reopens it.** I read the three
> "PLAN FIXED" notes below (`.115` `tpl-hdb-4room`, `.116` `tpl-hdb-5room`, `.118` `tpl-hdb-exec`)
> and concluded the item was done. The summary table at the foot of this file says otherwise and is
> right: it was **15 of 44** windowless master bedrooms, **12 remain**, and `.120` proved **none of
> the twelve is fixable by moving an offset** — each needs a *new opening cut into a wall*.
>
> Three of fifteen is not fifteen. I generalised from the three worked examples I happened to read
> and did not check the count, then told the user it could close.

**What you would see.** Load `tpl-hdb-4room`, walk into the Master Bedroom and turn through all
four yaws: **four blank walls, no window.** Walk into the Kitchen and there are **two**. Confirmed
in frames (`/tmp/tw7`, 36 frames, resolved `medium/on/manual13`) — this is seen, not inferred.

**The size.** **15 of 44 template bedrooms own no window on any of their own walls**, including
**seven master bedrooms**: `h3-bed2`, `h4-bed3`, `h4-master`, `h5-bed3`, `h5-master`, `ex-bed3`,
`ex-bed2b`, `ex-master`, `g3-gen`, `g3-bed3`, `g3-master`, `jb-bed3`, `jb-master`, `c4-bed4`,
`cp-master`. The probe is not vacuous — the other 29 bedrooms do own one.

**The mechanism, and why it looks like an authoring slip rather than a design choice.**
`templates/shared.ts:perimeter()` builds N and E "forwards" but **S and W backwards**: the west wall
runs from `[T, D-T]` to `[T, T]`, i.e. decreasing z. A `window(id, wall, offset, width)` offset is
measured from the wall's own start, so a west-wall offset written as if it were an absolute
z-coordinate lands mirrored. Measured across all templates, **55 windows would change room if their
offset were read from the other end** — and the tell is which ones: `h4-m-win`, `h5-m-win` and
`ex-m-win`, all named for the master, **all land in the KITCHEN as authored and in the MASTER when
flipped**. Three templates, same wall, same symptom.

**Proven to be a one-number fix.** Changing `h4-m-win`'s offset from 7.4 to 0.7 removes
`tpl-hdb-4room/h4-master` from the windowless list (verified, then reverted).

**What needs a human.** Whether to flip the offsets, move the glass elsewhere, or re-cut those
elevations is a decision about shipped Singapore reference plans that carry real project names —
and HDB habitable rooms require natural light and ventilation, so getting this right is a content
question, not a guess. It is the same class as (f): mechanical to apply, but it is someone's floor
plan.

**FIRST PLAN FIXED — `tpl-hdb-4room`, v0.31.5.115.** `h4-m-win`'s offset was corrected to its exact
mirror (7.4 → 0.6 = `9.6 - 7.4 - 1.6`), moving the master's window from z=1.5 in the KITCHEN to
z=8.3 in the master. Measured: the master's mean frame luma rose **184.2 → 198.1** and the kitchen's
fell **169.0 → 161.4** — daylight moved to the room that owns it; living and bedroom 2 unchanged.
**14 bedrooms remain windowless (6 masters).**

**SECOND PLAN FIXED — `tpl-hdb-5room`, v0.31.5.116.** `h5-m-win` 8.2 → 1.0 (`10.8 - 8.2 - 1.6`),
moving the master's window from z=1.9 in the KITCHEN to z=9.1 in the master. Measured on this
template (not carried from the 4-room): the master's mean frame luma rose **177.3 → 190.8**, and
living / bed2 / bed3 were flat to within 0.1. **13 bedrooms remain windowless (5 masters).**

**THIRD PLAN FIXED — `tpl-hdb-exec`, v0.31.5.118.** `ex-m-win` 9.8 → 0.4 (`12.0 - 9.8 - 1.8`),
moving the master's window out of the KITCHEN (which lines offsets 9.2-12.0 of that wall) into
`ex-master` (0.1-2.7). Measured on this template: master mean frame luma **186.4 → 195.2**, with
bedroom 2, bedroom 3 and the study flat to 0.1. **12 bedrooms remain windowless (4 masters).**

**TWO MORE PROVEN NOT OFFSET-FIXABLE — v0.31.5.119.** A master can only get a window on a wall it
actually fronts, and neither of these does. **`g3-master` fronts only `g3-s`**, yet `g3-m-win` is
authored on `g3-w` (cbath 0.1-2.6, bed3 2.7-5.2, bed2 5.6-8.2, kit 8.6-11.2) — its mirror (0.0)
lands in the **Common Bath**. **`jb-master` likewise fronts only `jb-s`**, yet `jb-m-win` is on
`jb-w` (mbath 0.1-1.3, cbath 1.5-3.5, bed3 3.7-6.2, bed2 6.6-9.8, kit 10.2-13.0) — its mirror (1.0)
lands in the **bathrooms**. Giving either master daylight means putting a window on the south
façade: a **content decision**, not an offset correction.

**THE OFFSET-FIXABLE PHASE IS CLOSED — v0.31.5.120. All 12 remaining entries were scanned in one
pass and NONE can be fixed by moving an offset.** For each, the walls the room actually fronts and
the windows authored on them:
- **`h4-bed3`, `h5-bed3`, `ex-bed3` front NO external wall at all** — interior bedrooms. No offset
  can give them daylight; only a re-planned layout can.
- **`h3-bed2`, `g3-master`, `jb-master`, `cp-master`** front an external wall with **no window
  authored on it**, so there is nothing to move — they need a new opening.
- **`ex-bed2b`, `g3-gen`, `jb-bed3`, `c4-bed4`** front a wall that does carry windows, but none of
  them (or their mirrors) fall within the room's own frontage.
- **`g3-bed3` looked fixable and is a trap.** `g3-b3-win` is named for bedroom 3 and lands in
  bedroom 2 (offsets 5.6-8.1), and its mirror (2.7) does land in bedroom 3 (2.7-5.1) — but
  **`g3-bed2` fronts ONLY that wall and that window is its only one**, so the move would strand
  bedroom 2. Net zero: the count would stay 12.

**Every remaining entry needs a new window opening — a content decision.** The 12 stay **ratcheted
by name** in `src/floorplan/bedroomWindow.test.ts`.

> ### ⚠️ STATUS `v0.31.7.204`: the window-treatment blocker below is now MOSTLY CLEARED
>
> That paragraph says "Fix (h) first" because `snapToNearestWindow` picks the nearest window on the
> whole LEVEL, so a windowless bedroom would have its curtain snapped onto another room's glass.
> `(h)` has gone **15 → 3** (`.192`, `.193`), so only three bedrooms could still mis-snap, and they
> are known by name in `bedroomWindow.test.ts`.
>
> **Scoped, from reading the code rather than guessing.** `furnishPlan.ts` has **no** window
> handling at all — no `windowBound`, no `snapToNearestWindow`, no `windowFixtureProps` — so this is
> not a `KITS` one-liner. The def exists (`curtains` in `furniture/defs/textiles.ts`, the only
> `windowBound: true` def) and the placement machinery exists in `placement/windowSnap.ts`; what is
> missing is the wiring between them in the furnish pipeline, plus:
>
> 1. a guard so a curtain is only seeded for a room that OWNS a window — otherwise the three
>    remaining `(h)` bedrooms steal another room's glass, which is the exact failure this warning
>    was written about;
> 2. `drawAmount: 0` set explicitly, because the def defaults to **1 (CLOSED)** and that contradicts
>    the curtains-open decision shipped in `.88`/`.92`.
>
> ✅ **SHIPPED in `v0.31.7.205`**: 42 curtains across 17 templates, one per window a bedroom OWNS,
> `drawAmount: 0` on all of them, and **0** outside an owning bedroom — the seeder passes the snap
> only the room's own windows, so the mis-snap this warning describes cannot occur.

**This also blocks the window-treatment gap.** `applyLayoutPreset('move-in')` places **zero** window
treatments on any template (measured: 0 across all 19) because no entry in `furnishPlan.ts`'s `KITS`
is a curtain or blind — the default flat's curtains are hand-authored in
`furniture/defaults/mainBedroom.ts`, not produced by the furnish pipeline. The machinery to fix that
already exists and is shared with the 3D commit path (`placement/windowSnap.ts`'s
`snapToNearestWindow` + `windowFixtureProps`; `arrangeRoles.roleOf` already treats `windowBound` as
`'mounted'` so the arranger will not relocate one). **But seeding a curtain per bedroom would be
actively wrong while (h) stands**: `snapToNearestWindow` picks the nearest window on the whole
LEVEL, so each of those 15 windowless bedrooms would have its curtain snapped onto some other
room's glass. Fix (h) first. Note also that the `curtains` def defaults to `drawAmount: 1`
(CLOSED), which would contradict the curtains-open decision shipped in `.88`/`.92` — a seeded
curtain must set `drawAmount: 0` explicitly.

---

## (i) MAIN-DOOR-ROOM — ✅ DECIDED 2026-09-04, see (z)16: fix (5room needs a restructure) (measured v0.31.5.114)

**What you would see.** Stand in `tpl-hdb-4room`'s Master Bedroom and there are **two doors** — the
internal one on its north wall, and a second on the **south EXTERNAL wall**. That second one is
`h4-main`, the flat's front door. **The front door opens into the master bedroom.** Confirmed in
frames (`/tmp/tw7`).

**The size.** Of the 19 templates' `*-main` doors, **8 open into a bedroom or a bathroom**: 5 into a
master bedroom (`h4-main`, `h5-main`, `ex-main`, `g3-main`, `jb-main`) and 3 into a bathroom
(`h2-main`, `st-main`, `lf-main`). Every one sits on an `-s` or `-w` wall.

**Same root cause as (h).** `perimeter()` winds N and E forwards but **S and W backwards**, while
`door()`/`window()` measure their offset from the wall's own start — so an offset written as an
absolute coordinate lands mirrored. Read from the other end, **12 of the 19 main doors open into the
living room**, which is plainly the authoring intent. There are **41 openings on S/W walls** in
total (19 doors, 22 windows).

**Proven to be a one-number fix, then reverted:** changing `h4-main`'s offset from 6.4 to 1.9 drops
it off the misplaced list.

**A blanket flip is NOT the answer, and this is why it needs a human.** Read from the other end,
`h5-main` would open onto a **balcony**, `em-main` into a study, `ob-main` into the dining room and
`lf-main` into a sleeping area. Twelve land in a living room; the rest need a per-plan decision. And
moving a front door shifts door keep-outs, which the furnishing pipeline uses
(`dropDoorBlockers`, `.108`) — so item counts and both existing ratchets ((f) enclosure, (h)
bedroom-window) will move with it. This has to be done plan by plan, with frames.

**FIRST PLAN FIXED — `tpl-hdb-4room`, v0.31.5.115.** `h4-main`'s offset was corrected to its exact
mirror (6.4 → 1.7 = `9.0 - 6.4 - 0.9`), moving the front door from x=2.25 inside the master bedroom
to x=6.95 in the Living / Dining. Verified in frames: the master now shows ONE door, not two.
**7 misplaced main doors remain.**

**`tpl-hdb-5room` CANNOT be fixed by an offset — measured, v0.31.5.116.** Scanning every offset
along its four perimeter walls and printing which room each lands in shows `h5-s`, the front door's
wall, is lined ONLY by **balcony (0.2-4.0), master bath (4.4-6.2) and master (6.4-10.2)**. **The
Living / Dining never touches that wall at all**, so no offset can put the entrance into it — the
exact mirror (2.1) lands on the BALCONY. The living room touches only the NORTH wall (6.3-10.2) and
the EAST wall (0.1-8.6), so fixing this door means **moving the entrance to a different façade**,
which is a decision about how the flat is entered, not a typo correction. **`tpl-hdb-4room` was
different: its living room did touch the door's wall, which is why `.115` could fix it with one
number.** Check each remaining template's wall before assuming the same shape.

**SECOND PLAN FIXED — `tpl-hdb-exec`, v0.31.5.118.** The wall scan showed `ex-s` IS lined by
`ex-living` at offsets 0.1-4.3 (unlike the 5-room), so the mirror works: `ex-main` 8.4 → 2.1
(`11.4 - 8.4 - 0.9`), out of `ex-master` (8.0-11.4) and into the living room. Confirmed in frames —
the master now shows ONE door where it showed two. **6 misplaced main doors remain.**

**THIRD PLAN FIXED — `tpl-hdb-jumbo`, v0.31.5.119**, and the target room was NOT the obvious one.
`jb-s` (len 14.2) is lined by `jb-bed5` 0.2-2.8, **`jb-family` 3.1-5.8**, `jb-master` 8.6-12.2,
`jb-mbath` 12.4-14.2 — **the Living / Dining never touches that wall** (it fronts `jb-n` 8.6-14.2 and
`jb-e` 0.1-6.4). So `jb-main` 9.2 → 4.1 (`14.2 - 9.2 - 0.9`) lands in the **Family Room**, a
living-category space, which is the correct destination here. **5 misplaced main doors remain.**

**`tpl-hdb-3gen` CANNOT be fixed by an offset — measured, v0.31.5.119.** `g3-s` is lined only by
`g3-gen` 0.2-4.1, `g3-master` 4.4-8.7 and `g3-cbath` 8.8-10.4. **No living-category room touches it
at all**, and the exact mirror (1.9) lands in `g3-gen`, the Grandparent Suite — another bedroom. The
living room fronts `g3-n` (6.4-10.3) and `g3-e` (0.1-8.8), so this entrance needs a **façade
decision**, like the 5-room's.

**FOURTH AND FIFTH PLANS FIXED — `tpl-studio` and `tpl-loft`, v0.31.5.120**, both at zero cost
(global item count, stray chairs and wardrobe count all unchanged). `st-main` 1.0 → 3.9: `st-s`
(len 5.8) is lined ONLY by `st-bath` 0.2-1.7 and `st-kit` 1.9-5.7, so the kitchen end is the sole
non-bath option. `lf-main` 1.2 → 5.8, into the Lounge / Study (`lf-s` = `lf-bath` 0.1-1.8,
`lf-stair` 2.0-3.1, `lf-sleep` 3.4-7.9). **3 misplaced main doors remain, and all three are proven
unfixable by offset:**
- `h5-main` — mirror lands on a **balcony**.
- `g3-main` — mirror lands in `g3-gen`, **another bedroom**; no living-category room touches that wall.
- **`h2-main` — every position in the living room costs furniture.** Measured three offsets against a
  49-item baseline: the exact mirror (3.7) **drops the dining table** — undoing what `.111` fixed for
  this very template — 4.8 loses **7 items**, and 2.5 keeps the table but still loses 2. The 2-room
  is 5.8 m wide; a door into its living room consumes wall the furniture needs. **Reverted:** a front
  door in the bathroom is wrong, but not worth a missing dining table.

**Recommendation — (i) now also needs content decisions, not offsets.** The remaining 3 stay
**ratcheted by name** in `src/floorplan/mainDoorRoom.test.ts`.

---

## (j) WINDOW-SIGHTLINE — ✅ DECIDED 2026-09-04, see (z)16: fix via an arranger strategy (measured v0.31.5.117)

**What you would see.** Walk into `tpl-hdb-4room`'s or `tpl-hdb-5room`'s master bedroom after
`.115`/`.116` gave each of them a window, and the glass is **not visible from the room centre in any
of the four yaws** — a 2.1 m 3-door wardrobe stands about 0.8 m in front of it. The daylight gets
in (both rooms measurably brightened); the view does not.

**The size.** Across the 19 templates, **11 of 78 windows** (11 when first measured in `.117`; `.118` added one and `.121` cleared one) have a floor piece taller than the sill
standing in front of the glass — footprint overlapping the pane laterally by ≥0.3 m with its nearest
face within 1.2 m. **Nine are `wardrobe-3door` (2.10 m).** The two worst cover **1.17 m of 1.6 m**
(`h4-m-win`) and **1.37 m of 1.6 m** (`h5-m-win`) — 73% and 86% of the glass. Every offender's
nearest face is 0.65–1.05 m from the pane.

**The guard already exists and is not failing — it is the wrong shape.** `designRules.ts`'s own doc
on `windowSillTall` says "a wardrobe, bookcase, or tall cabinet taller than this shouldn't be pushed
against a windowed wall", and `autoArrange.ts:tryPlace` does reject a too-tall item inside
`clearance.ts:windowFrontRects`. But that rect is **0.65 m deep — a walking band**. A wardrobe
clears it by centimetres and then stands a metre away, still covering the window. The clustering of
offenders at 0.65–0.85 m is the signature.

**THE OBVIOUS FIX WAS IMPLEMENTED, MEASURED, AND REVERTED.** Giving `WindowFrontRect` a second,
deeper prism for items taller than the sill (depth `0.65 + CLEARANCE.storageFront` = 1.4 m, derived
from existing constants rather than tuned) took blocked windows **11 → 3** — but it **dropped 5
wardrobes outright** (total items 1442 → 1439): a small HDB master has nowhere else to put one, and
**a bedroom with no wardrobe is worse than a partly blocked window**. Adding a last-resort fallback
in `settle` that relaxes the deep prism once every constrained position has failed kept the
furniture (1445 items, nothing lost) and still fixed 7 of the 11 — **but it put the two worst
offenders, the very masters that motivated the round, straight back**, because for them the relaxed
position is the only position. It also still lost one wardrobe and added a stray dining chair. Both
attempts are reverted; the tree is unchanged.

### v0.31.8.27 — the "wall segment beside the glass" route is MEASURED IMPOSSIBLE, not merely hard

Directed to try the beside-the-glass option, I implemented it in `snapToWall`: on a windowed
edge, offer along-wall coordinates that stand clear of the pane BEFORE the piece's own
coordinate, always keeping today's coordinate as the last candidate so nothing can go unplaced
(the shape that made `.121`'s windowless preference safe). Result on the ratchet: **11 → 11,
bit-identical.** Exact equality is evidence of a no-op, so I instrumented it rather than
believing it.

Instrumented over all 19 templates (`SL_DEBUG`, since removed):

- 116 `snapToWall` calls for `storage` pieces, 67 with `tall` true, `ctx.windowKeepOut` populated
  every time, 40 seeing a windowed edge — **the branch is live, not dead code.**
- The blocking gate (`the piece's own coordinate covers a pane`) fires **15 times**.
- **Accepted beside-moves: 0.** Every candidate fails, and the split says why:
  - **9 of 15 — no candidate exists at all.** The usable wall span is SMALLER THAN THE ITEM:
    `wallSpan 1.26 m` vs `itemW 1.50 m`, `0.86` vs `1.50`, and one case at **`wallSpan −0.04 m`**
    (the span is negative — the wall is narrower than the wardrobe, so the clamp range is empty).
    A 1.5 m wardrobe on a 0.86–1.26 m wall has nowhere to be except across the glass.
  - **6 of 15 — a candidate clears the pane but `tryPlace` rejects it** (collision, door swing,
    or the window's own front keep-out).

So this option is closed on geometry, and closed for the same underlying reason the item already
records ("the room is simply too small"). It is not a tuning problem.

**This also links (j) to (f).** Bedroom wall spans of 0.86–1.26 m are not plausible room
dimensions; they are the same mis-sized template rectangles item (f) measures. **(f) looks like a
precondition for (j)**: re-authoring those bedroom/bath wings changes the wall spans this option
depends on, so (j) is worth re-measuring only AFTER (f) lands, not before.

Levers now measured and rejected: deeper keep-out (`.117`, dropped 5 wardrobes), narrower wardrobe
(`.121`, net zero), windowless-wall preference (`.121`, shipped, 12 → 11), beside-the-glass segment
(`.27`, no-op — no geometric room). Remaining untried: content changes to room size (= (f)), or
accept.

**What needs a human / a different approach.** More clearance is not the answer — the room is simply
too small for a 1.8 m wide, 2.1 m tall wardrobe plus a queen bed plus a window. The options are an
arranger strategy (prefer a narrower wardrobe variant in a tight room; or accept the window wall but
choose the wall SEGMENT beside the glass rather than in front of it), or a content change (a
2-door wardrobe in the smaller masters). Both are design calls about what a furnished HDB bedroom
should look like.

**`.118` added one entry, and it is a trade rather than a regression.** Fixing (h)/(i) on
`tpl-hdb-exec` gave `ex-master` a window it never had AND restored the wardrobe that had been
dropped, so the room went from **no glass at all** to glass partly blocked by its own wardrobe —
`tpl-hdb-exec/ex-m-win: wardrobe-3door`. Expect the same on each remaining (h) fix: closing (h)
tends to open (j).

**CORRECTION (v0.31.5.121).** This item previously said the blocker was "the piece's 1.8 m width".
**That was wrong.** Measured across every template, **every wardrobe is `width: 1.5`** —
`wardrobe-3door` is parametric (`defaultFootprint.w` 1.5, min 1.0, max 2.4, `doorCount` 2-4), and
there is no separate narrow-wardrobe def; the same def is resized via `props.width`.

**THE NARROWER-WARDROBE RECOMMENDATION IS ALSO DISPROVED (v0.31.5.121).** Measured: `width: 1.2`
gives blocked **12 → 10** but resizes every wardrobe in every template; **`width: 1.0` goes back to
12**, because two MORE wardrobes then fit (40 → 42) and block other windows (+5 items). Narrowing is
not the lever.

**PARTIAL FIX SHIPPED (v0.31.5.121) — prefer WINDOWLESS walls for tall STORAGE.** `snapToWall` tried
edges in a fixed order with no window awareness. It now attempts windowless edges first for
`storage`-role items taller than a sill. Because it only reorders preferences and still attempts
every edge, **nothing can go unplaced** — unlike `.117`'s deeper prism. Measured: blocked
**12 → 11**, total items **1444 → 1444**, wardrobes **40 → 40**. Cleared:
`tpl-hdb-5room/h5-b2-win`.

**The `storage` scope was forced by a regression the sightline metric could not see.** Applying the
reordering to EVERY item taller than a sill cleared one more window
(`tpl-condo-studio/su-bath-win`) but pushed **bathroom fixtures off their walls** — a basin is
0.98 m tall, above the 0.95 sill — which `autoArrange.test.ts`'s "fixtures along the walls, not
parked mid-room" case caught at 0.80 m against a 0.70 m bound. Sanitaryware is not what
`windowSillTall` is written about.

**IT IS AN IMPROVEMENT, NOT A CURE, AND THE LIMIT IS STRUCTURAL.** The 11 that remain — including
**both masters that motivated this item**, `h4-m-win` and `h5-m-win` — have **no windowless wall
with room for the wardrobe**. Three levers have now been measured (deeper keep-out, narrower piece,
wall preference) and the residue is rooms that are simply too small for a queen bed, a wardrobe and
a window. **Anything further is a content decision about what a furnished HDB bedroom contains**, not
an arranger change. The 11 stay **ratcheted by name** in `src/layout/windowSightline.test.ts`, which
also asserts that 67 of the 78 windows are clear so it cannot pass by measuring nothing.

---

## (k1) WINDOW-SKY-DARK — ❌ CLOSED v0.31.5.128: mis-attributed, and its symptom was (k2)

**The dark window pane was real. My explanation of it was wrong, and the fix for (k2) resolved it.**

### What `.125` claimed, and why it was wrong
`.125` reported that after `replaceFloorPlan` in a session where `setQualityTier` was never called,
the plan panes were `MeshPhysicalMaterial` (the High/Maximum glass) **while `st.qualityTier` reported
`medium`** — a scene carrying a tier of glass its own store said it was not on. **That comparison was
invalid.** The `resolved=` line the probe prints is emitted early, before the plan swap; the material
dump happens later. Logging the tier HISTORY (`.128`) shows the `auto` path goes
**`performance` → `medium` → `high`** and *ends at `high`*. So when the panes were dumped the store
said `high`, `transmissionTiers('high')` is true, and `MeshPhysicalMaterial` was **correct**. There
was never a store/material mismatch. I had compared a snapshot from one moment against a material
from another.

### What actually caused the 49-vs-132 split
Both arms were rendering the SAME defect — (k2), the glass reading the lamp switch instead of the
sun — and the two tiers simply express "it is night" differently:

| tier | night-glass rendering at 13:00 (before `.127`) | pane p50 |
| --- | --- | --- |
| `high` (the `auto` path) | `transmission = windowTransmission(0) = 0.20` at **opacity 1.00** — a near-opaque slab | **49** |
| `medium` (explicit) | the cheap path, `opacity = 0.28 + 1 × 0.45 = 0.73` — a quarter of the background still gets through | **132** |

The tier was never the disease; it only decided how badly the same wrong daylight value showed.

### Resolved by `.127`
With the glass keyed off sun altitude, re-measured at 13:00 on `tpl-condo-4bed`/`c4-master`,
furnished, lights on:

| arm | the plan panes | pane p50 | wall p50 |
| --- | --- | --- | --- |
| `TIER=auto` (ends at `high`) | `MeshPhysicalMaterial` `#bcd4e6`, transmission **0.92** | **196** | 182 |
| `TIER=medium` (explicit) | `MeshStandardMaterial` `#bcd4e6`, opacity **0.28** | **193** | 189 |

**The two tiers now agree to 3 luma and both show daylight.** Nothing further to fix; item closed.

### ⚠️ Correcting the caveat this item put on every past walk
`.124`/`.125` warned that every `walk-tour` frame in `.95`–`.123` used `TIER=auto` and therefore
showed "wrong-branch glass", implying the tier flag was the problem and that an explicit tier would
have been safe. **That was wrong in the same way.** The degraded exterior in those frames came from
(k2), which affected **every tier** — an explicit `TIER=medium` walk would have shown it too, just
less severely (132 rather than 49). The accurate statement: **no walk frame captured before
v0.31.5.127 is evidence about the view through a window, at any tier.** Interior conclusions in
items (f) through (j) never depended on it and still stand.

### Refuted hypotheses and failed instruments — kept on the record
1. **The plan swap loses `scene.background`.** No — byte-identical uuid; a forced re-bake changed
   the uuid without changing the picture.
2. **`walk-tour`'s `setPitch(-0.05)` aim.** No — 132 → 131 as a single variable.
3. **Tour order / state decaying across a tour.** No — 132 / 132 / 132 / 132 with the tier set.
4. **Tone mapping or the glass eating the background generally.** No — on the boot flat the `city`
   preset's own `#5d8fc4` (luma 134) lands at 135 on screen.
5. **`getFixtureGlow()` as the TIER discriminator.** No — 1 in both arms. (It was, however, half of
   (k2): it is the lamp switch.)
6. **Failed instrument:** selecting panes by `/glass|window|pane/i` on mesh names returned zero —
   the panes carry no such name. **That zero was not evidence.**
7. **Failed instrument:** `await import('three')` inside `page.evaluate` throws on the bare
   specifier; only `/src/...` path imports resolve, so no `Raycaster` that way.
8. **The sky bake was innocent throughout** — `scene.background` live in every arm, its image at the
   camera forward vector reading **188.4** against a pure `skyRadiance` prediction of 187.

---

## (k2) DAYLIGHT-GLASS — ✅ SHIPPED v0.31.5.127

**The window glass told its day/night story from the LAMP SWITCH, not the sun, so every new
visitor met night-coloured glass at midday.**

`FurnitureLights.tsx` computes `const level = lightsMode === 'on' ? 1 : 0` and writes it to
`setFixtureGlow`. Both window renderers — `apartment/Window.tsx` (curated flat) and `FadeWindow` in
`apartment/PlanShell.tsx` (plan windows) — then read it as `const d = getFixtureGlow()` under the
comment `// 1 at night, 0 in daylight` and fed `1 - d` to `windowTransmission(daylight)`,
`glassSkyCatchIntensity(daylight)` and the `GLASS_DAY`/`GLASS_NIGHT` lerp. **Those arguments mean
daylight; what they received was the lamp switch.** `ensureDaylightFirstPaint` (DEFAULT-GLOOM,
`.86`) turns the lamps on at every hour on a fresh seed, so the shipped default put the glass in
its night look at noon.

**Measured before the fix — boot flat, 13:00, `TIER=medium`, one variable (the lamp switch):**

| arm | the 4 plan panes | pane p50 | wall p50 |
| --- | --- | --- | --- |
| `LIGHTS=on` | `#20272f` (GLASS_NIGHT), opacity **0.73**, sky-catch **0.00** | 139 | **222** |
| `LIGHTS=off` | `#bcd4e6` (GLASS_DAY), opacity **0.28**, sky-catch **0.40** | 183 | **130** |

**Neither arm was acceptable, and that is what named the defect.** Lights on gave a warm, inviting
room with night glass; lights off gave correct day glass in a cold grey room — and that gloom is
exactly what the lights-on default exists to prevent. **The bug was the COUPLING**, so the fix
decouples the two rather than choosing between them.

**The fix.** New pure `altitudeCurve.ts:daylightFromAltitude(altRad)` = `clamp((altDeg + 8) / 8, 0,
1)` — deliberately **the same ramp `skyGradient.ts:skyRadiance` already uses for its own night
fade**, so the glass and the sky reach night together instead of disagreeing. Both renderers hold
the sun altitude in a ref (`useSunPosition` is memoised per minute/location; `useFrame` must not
call a hook) and use `d = 1 - daylightFromAltitude(...)`. The lamp switch keeps driving the lamps
and nothing else.

**Measured after, lights ON in both rows:**

| arm | the 4 plan panes | pane p50 | wall p50 |
| --- | --- | --- | --- |
| 13:00 | `#bcd4e6`, opacity **0.28**, sky-catch **0.40** | **206** | 222 |
| 21:00 | `#20272f`, opacity **0.73**, sky-catch **0.00** | **57** | 207 |

Midday now shows daylight through the glass **while keeping the warm interior** (wall unchanged at
222), and the night story survives intact — the 21:00 frame is still a dark reflective pane carrying
the lamp reflections. **The fix also corrects a case nobody had reported: lights OFF at night
previously produced DAY glass at midnight.**

Pinned by `scene/lighting/daylightFactor.test.ts`. Full suite 9354 passed — **no test had pinned the
old lamp-coupled behaviour**. `fixtureGlow.ts`'s header, which claimed "≈ scene darkness" and
"written each frame", was corrected in the same commit: it is the lamp switch, written on change.

---

## Boot-plan re-audit — ✅ CLEAN (v0.31.5.129)

**The boot plan (`defaultPlan.ts`, 11 rooms) was last walked in `.102`. Every arranger fix from
`.108` onward touched shared code, and its exterior had never been judged on a trustworthy frame —
so this is both a regression check and the first honest look at its windows.**

`walk-tour FURNISH=1 TIER=medium HOUR=13` (explicit tier on purpose; an `auto` run climbs to `high`,
which is a different render). Resolved `medium/on/manual13`. 44 frames, 11 rooms, 354 meshes /
87486 triangles. Ceiling-band luma **139.0** (`bedroom3-y0`) to **232.4** (`householdShelter-y2`) —
**no outlier**; the two real defects this metric has caught read 37 and 28.2.

**Read frame by frame across two contact sheets. No new defect.** Furnished living/dining with the
TV, ceiling fan and sofa; kitchen with cabinets, hob, range hood and fridge; both bathrooms tiled
with mirrors and windows; bedrooms with beds, nightstands, lamps, wardrobes and bookshelves; the AC
ledge and service yard correctly showing open sky. Known items only — the bathroom mirrors render as
flat grey panels (mirrors do not reflect, recorded 3x).

**Checked rather than reported:** four dark octagonal discs on the household-shelter wall, visible
from both the corridor and the shelter side, are the blast door's **bolt heads** — authored geometry
(the HDB household shelter door), not holes in a wall. Low-poly at nose distance, which is what the
walk pose puts you at, but a small detail on a service door.

**The `.127` glass fix, measured on the artefact users actually boot into.** Same probe, same room,
same crop, same hour; the only difference is the fix:

| `mainBedroom-y0` | before (`.109`, `/tmp/tw5`) | after (`.129`, `/tmp/tw20`) |
| --- | --- | --- |
| window pane p50 | **136** | **203** |
| wall p50 | 223 | **223** |

The wall is identical to the byte and the window gained 67 luma — the change is confined to the
glass, which is what a correct fix looks like. **Mean frame content also fell from ~97% (template
walks) to 81% here, which is expected and is itself evidence:** more of each frame is now sky seen
through glass rather than opaque pane, and the content metric counts sky as background.

---

## `tpl-studio` — ✅ CLEAN (v0.31.5.129), and the first look at `.120`'s door fix

`walk-tour PLAN=tpl-studio FURNISH=1 TIER=medium HOUR=13`, resolved `medium/on/manual13`. Only 12
frames — the studio has **3 rooms** (`st-living` r=3.09, `st-kit` r=2.02, `st-bath` r=1.03) — 62
meshes / 21896 triangles, mean 80% content. Ceiling band **174.1–221.7**, no outlier.

Read frame by frame: open-plan living with sofa, floor lamp, plant, coffee table and wall art; the
kitchen's range hood and TV visible from the living area (correct for one volume); a bright daylight
window; the bathroom a tight tiled cell behind its door. **No defect.**

**It carries no ratchet entries at all** — `tpl-studio` appears in none of the (f)/(h)/(i)/(j)
allow-lists; its only mention anywhere is `mainDoorRoom.test.ts`'s comment recording that `.120`
FIXED `st-main` (offset 1.0 → 3.9, out of the bathroom and onto the kitchen end of `st-s`). **That
fix had never been seen in a frame until now**; the walk confirms the doors read sensibly.

*(The first attempt died on the known `ProtocolError: Promise was collected` puppeteer flake and was
re-run; the numbers above are from the successful run, `exit=0`.)*

---

## The last six templates — ✅ ALL CLEAN (v0.31.5.130), coverage complete

All six walked at an **explicit `TIER=medium`**, resolved `medium/on/manual13`, contact sheet plus
ceiling-band luma read frame by frame. **No new defect in any of them.**

| plan | frames / rooms | meshes / tris | ceiling band | known ratchet entries |
| --- | --- | --- | --- | --- |
| `tpl-hdb-2room` | 20 / 5 | 138 / 44522 | **190.7–226.6** | (i) `h2-main -> h2-bath` |
| `tpl-1bed` | 20 / 5 | 126 / 56642 | **175.5–231.8** | (j) `ob-liv-win: potted-plant` |
| `tpl-condo-1bed` | 20 / 5 | 131 / 55729 | **140.3–216.9** | none |
| `tpl-condo-1study` | 24 / 6 | 182 / 76657 | **154.7–227.2** | none |
| `tpl-condo-2bed` | 36 / 9 | 187 / 70676 | **140.1–227.5** | none |
| `tpl-condo-studio` | 16 / 4 | 75 / 25188 | **159.5–220.6** | (j) `su-bath-win: bathroom-sink` |

Every band sits inside the range the clean plans already established; the two real defects this
metric has caught read 37 and 28.2. Windows read as bright daylight throughout, which is the
post-`.127` behaviour. Bathroom mirrors render as flat grey panels — the known "mirrors do not
reflect" item, seen again here.

**One known entry was CONFIRMED IN A FRAME for the first time.** `tpl-hdb-2room`'s (i) entry
`h2-main -> h2-bath` has been ratcheted by name since `.114`, but nobody had ever looked at it:
`h2-bath-y0` and `h2-bath-y2` each show a door, i.e. the flat's **front door opens into the
bathroom** and the room has two. The ratchet was right. This changes nothing about the item — it is
still a content decision — but the defect is now documented visually rather than only arithmetically.

**Coverage is complete: 19 of 19 registered templates walked, plus the boot plan.** Counted against
`src/floorplan/templates.ts`. **The visual-audit arc that began at `.95` is finished.** Every
remaining open item ((f) through (j)) is a content or product decision with its data already
recorded above; none is waiting on more frames.

---

## `tpl-loft` room categories — ❌ CLOSED v0.31.5.131, no effect, nothing changed

A standing candidate said "`tpl-loft` rooms carry no `category` field — measure whether that changes
furnishing". **Measured: it does not, and the premise was half wrong.**

The loft's **upper** rooms already carry explicit categories (`lfu-sleep` → `bedroom`,
`lfu-landing` → `foyer`, `lfu-ward` → `other`) because they are built with `templates/shared.ts`'s
`room()` helper. Only the four **ground** rooms are raw object literals with no `category`. Dumping
`roomCategory()` for every room in the plan:

| ground room | name | explicit | resolved |
| --- | --- | --- | --- |
| `lf-open` | "Open Living" | none | **living** |
| `lf-sleep` | "Lounge / Study" | none | **study** |
| `lf-stair` | "Stairs" | none | **other** |
| `lf-bath` | "Bathroom" | none | **bath** |

`roomCategory.ts` resolves explicit `category` → else `roomCategoryFromName` → else `'other'`, and
**all four names already infer the right value**. Adding explicit categories equal to what inference
returns is a no-op *by construction* — the downstream `toRoomKind`/`toArrangeKind` consumers receive
the identical input either way. The only thing an explicit field could change is a case where the
inference is WRONG, and none of these is. The plan furnishes 44 items; nothing about that depends on
the missing field.

**One cosmetic note, not a defect:** `lf-sleep` is named "Lounge / Study" and resolves to `study`,
which matches the module's own description ("the ground keeps a lounge + bath + an open stair run;
the loft level stacks a sleeping deck"). The `lf-sleep` **id** is a stale misnomer from an earlier
layout — ids are opaque to every consumer, so it changes nothing.






---


## Template audit coverage

**Corrected in v0.31.5.123.** The `.122` revision of this section claimed *"12 of 19 shipped
templates have now been walked frame by frame, only `tpl-condo-1study` outstanding"*. **Both numbers
were wrong.** It was written from a handoff note rather than counted against
`src/floorplan/templates.ts`; the true figure at `.122` was **10 walked, 9 unwalked**, and
`tpl-condo-1study` was one of nine outstanding plans, not the only one. `tpl-studio` in particular
was listed as walked because `.120` moved its front door — moving an offset is not a walk.

**After `.130`: ALL 19 registered templates have been walked frame by frame**, plus the boot plan `defaultPlan.ts` (not a template; audited separately above). **Coverage is complete.**

Walked (12): `tpl-hdb-maisonette` (`.95`), `tpl-terrace-ground` (`.103`/`.104`),
`tpl-condo-penthouse` (`.109`), `tpl-loft` (`.110`), `tpl-hdb-4room` (`.111`/`.115`),
`tpl-hdb-5room` (`.116`/`.121`), `tpl-hdb-exec` (`.118`), `tpl-hdb-jumbo` (`.109`/`.119`),
`tpl-condo-3bed` (`.122`), `tpl-hdb-3room` (`.122`), `tpl-condo-4bed` (`.123`),
`tpl-hdb-3gen` (`.123`), `tpl-studio` (`.129`), and `tpl-hdb-2room` + `tpl-1bed` + `tpl-condo-1bed` +
`tpl-condo-1study` + `tpl-condo-2bed` + `tpl-condo-studio` (`.130`).

**Not yet walked: none.** Counted against the registry, not against a summary — which is the
discipline `.123` had to correct after `.122` claimed coverage it did not have.

Every defect these walks found is recorded as (f) through (k) above; **no unrecorded visual defect
remains in any shipped plan.**

## (l) WINDOW-LUMINANCE — ✅ **FIXED v0.31.7.157, refined to v0.31.7.281** — not by the route
this item proposed, and with a third veil retired independently in v0.31.8.50

> **Merged from staging: GLASS-SKYCATCH-VEIL (`v0.31.8.50`).** The sky-catch is a STAND-IN for
> sky luminance, so when a photo backdrop paints a real view behind the pane it double-counts —
> a constant emissive added to every pane pixel, compressing whatever the backdrop carries.
> Measured at the living-room window, 13:00, `medium`: dropping it took pane `sd` 15.9 → 20.1
> and spread 47 → 63 on `sky`, 10.5 → 11.5 and 31 → 38 on `city` — the stand-in was costing
> 23-34 % of the window's luminance RANGE. `glassSkyCatchIntensity` therefore takes
> `backdropVisible` and returns 0 for that case, which takes precedence over the curve below;
> orbit and every backdrop-less path keep it. The two fixes are orthogonal: this one decides
> WHETHER the stand-in applies, the curve below decides how bright it is when it does.

> **Merged from staging: ESTATE-SKYCATCH-VEIL.** `backdropVisible` only tracked the PHOTO
> backdrop; it knew nothing about `<Estate>`, the real HDB-neighbour geometry drawn behind the
> same glass. `Estate.tsx` mounts on `backdrop: 'sky'` **or** `'none'`, so a walk with
> `backdrop: 'none'` still has a real, lit neighbour block behind the pane while
> `backdropVisibleNow()` reads `false` — the same double-count, from the other signal. Both call
> sites (`apartment/Window.tsx`, `apartment/PlanShell.tsx`) now pass
> `backdropVisibleNow() || estateVisibleNow()`. Measured at the living-room window, 13:00,
> `realistic`, `backdrop: 'none'` (the config that reaches the gap — the default `sky` backdrop
> already reads `backdropVisibleNow() === true` via `proceduralSky` and was already unaffected):
> pane mean 233.5 → 183.6, sd 25.4 → 28.2, spread p95−p05 64 → 96, **`> 240` 61.2 % → 0.3 %** —
> before the fix the veil was clipping 61 % of the pane to flat white and hiding the neighbour
> block entirely; after, the pane matches the `sky`-backdrop numbers exactly (183.5 / 28.2 / 0.3 %
> at the same pose). Night and the default `sky`-backdrop path are untouched by construction.

> **Merged from staging: GLASS-CLARITY (`v0.33.0.10`).** With the two veils retired, what was left
> between the camera and the estate was the pane MATERIAL itself, and two of its three parameters
> were wrong for glass. (1) **Roughness.** Both call sites resolved
> `Math.max(glassPhysical.roughness 0.05, glassParams.roughness 0.1) = 0.1`, and in three r184
> `getTransmissionSample` blurs the transmissive target by
> `log2(transmissionSamplerSize.x) · applyIorToRoughness(roughness, ior)` — at ior 1.5 the ior
> factor is exactly 1, so 0.1 on a ~1900 px target spent **~1.1 mip levels** on the whole view.
> `materialRealism.ts` had recorded this knob as "currently inert… do not tune this expecting a
> visible change" on a `v0.31.5.175` sweep of 0.1 → 0.02 → 0 that moved micro-contrast +1 %; that
> sweep was taken when the only thing behind the pane was the PMREM-blurred sky, i.e. a blur knob
> measured against an already-blurred subject. (2) **Colour.** The shader's
> `transmittance = diffuseColor · volumeAttenuation(...)` multiplies the view through the glass by
> the pane colour, and `clear`'s `#bcd4e6` is 0.74/0.83/0.90 in linear — a ~20 % neutral-density
> loss plus a blue cast. Real 6 mm clear float glass transmits 88–90 % nearly neutral (the faint
> green edge lives in `attenuationColor`).
>
> Swept live inside ONE run at one pose (living-room window, 13:00, `realistic`, default `sky`
> backdrop, estate mounted; `dev-probes/window-pane.mjs SWEEP=…` driving the mounted pane
> materials from inside a wrapped `gl.render`, two pane patches read by `patch-read.mjs`, arms
> repeated — noise floor max 2 counts, micro-contrast identical to 2 d.p.):
>
> | arm (roughness / colour) | mean | p95−p05 spread | R−B | micro-contrast |
> | --- | --- | --- | --- | --- |
> | 0.1 / `#bcd4e6` (was shipping) | 189.2 / 180.0 | 82 / 91 | −13.3 / −15.9 | 2.12 / 2.13 |
> | 0.05 / `#bcd4e6` | 187.6 / 179.3 | 84 / 93 | −14.1 / −16.0 | **2.32 / 2.27** |
> | 0.02 / `#bcd4e6` | 187.6 / 179.3 | 84 / 93 | −14.1 / −16.0 | 2.32 / 2.27 |
> | 0 / `#bcd4e6` | 187.6 / 179.3 | 84 / 93 | −14.1 / −16.0 | 2.32 / 2.27 |
> | 0.05 / `#dfe8ee` | 195.2 / 187.2 | 75 / 84 | −4.1 / −5.7 | 2.03 / 2.03 |
> | **0.05 / `#f2f5f7` (ships)** | **199.5 / 191.6** | 68 / 78 | **−0.9 / −2.4** | 1.87 / 1.89 |
> | 0.05 / `#ffffff` | 202.4 / 194.7 | 65 / 74 | +0.4 / −0.9 | 1.76 / 1.80 |
>
> Read the two columns separately: at a FIXED colour, micro-contrast is a clean blur metric and
> says **+9 %** for 0.1 → 0.05 and **exactly nothing** below 0.05 (0.05 → 0 changes no pixel by
> more than the 2-count repeat floor, against 58 for 0.1 → 0.05). Across the COLOUR arms it is
> confounded — lifting transmittance pushes the pane up AgX's shoulder, so spread and
> micro-contrast fall while the frames get visibly *better*; the honest colour statistic is R−B,
> the blue cast on the neighbour block, which goes −13.3 → −0.9. `#f2f5f7` is taken over
> `#ffffff` because it is the physical value (0.89/0.91/0.93 linear = the real 88–90 %); no glass
> transmits 100 %. Shipped as two new transmission-tier-only fields on
> `windowGlassKindParams` (`transmissionColor`, `transmissionRoughness`), so the cheap
> Performance/Medium pane — where the same hex is an opacity-blended TINT over the wall and reads
> correctly — is byte-identical, and frosted/textured/glass-block keep their higher roughness
> through the same `Math.max`. Night is untouched (`windowTransmission`, the `dn` ramp and
> ESTATE-NIGHT-GLASS unchanged; only the daylight end of the colour lerp moves). Frame cost
> p50/p90 8.3/11.5 → 8.2/11.2 ms.
>
> **One diagnosis in the same brief was REFUTED and nothing shipped for it** (meta-rule ii): the
> mottled grey wall left of the near-down frame was assumed to be `estateTextures.ts`'s
> `speckle(…, 2600, 0.045)` (3–7 cm blotches at 72 px/m) on the own-block wings. Painting the
> own block's tiles WITHOUT the speckle changed **zero pixels** in that frame (max 2 counts =
> the repeat floor), and so did raising the estate textures' `anisotropy` 4 → 16. Raycasting the
> pixel names the surface instead: at 2.4 m behind the pane it is an **apartment wall**
> (`MeshStandardMaterial`, `#f1f0ec`, no albedo map — the shell's own wall body, `.79`/`.80`
> above), whose plaster NORMAL map at a grazing angle is what mottles. The estate speckle is
> invisible at every pose in `estate-surround-verify.json`; a fix for the grazing-angle plaster
> read is a separate item and is not this one.

> **The fix is `glassSkyCatchIntensity(d) = d³ · 5.2`**, a single coefficient and curve on the pane's
> emissive. Verified by frame at 13:00 (bright opening, crisp mullions, `> 240` **21.5 %**), 18:00
> (**15.0 %**), 19:00 (bright, defined, no bloom, 0.8 %) and 21:00 (zero by construction).
> Photographs clip **15–39 %**; the app clipped **0.0 % at every hour** before this.
>
> **Everything this item proposed about the background was the wrong lever.** `v0.31.7.152` measured
> four arms — analytic/Cycles sky × `backgroundIntensity` 1/4 — all at **0.0 % above 240**, because a
> pane's brightness never reads `scene.background`; it reads this emissive. `(z)`4 was decided on
> that premise and could not have worked.
>
> The curve is cubic because flat ×13 **bloomed at dusk** (`v0.31.7.156`: glow on the wall, mullions
> washed out) while its statistics looked clean. See `materialRealism.ts` for the full derivation.

> **Read `(y)` below before acting on anything in this section.** The mechanism is now known
> and it is not what this write-up spent five rounds assuming. The window was never "27 % too
> dark": `scene.background` is an **LDR sRGB texture**, max ≈ 1.0 linear, and AgX has a
> shoulder — so the pane was **clipped at the wrong end of the curve**, with **0.0 % of glazing
> pixels able to exceed 219 counts** against the reference's 49.6 %. The escalated `BGMUL ≈ 12`
> was fitted to **p99**, a statistic later shown to be pinned by a fixed bright feature the sky
> never touches. Fitted to the pane *distribution* with a Blender-generated glazing mask, the
> answer is **4**, and it matches physics to 0.1 of a percentage point.

### ⚠️ (l)/(z)4 — THE PREMISE IS WRONG: the pane is an EMISSIVE CONSTANT, `v0.31.7.152`

`(z)`4 is "ship the Cycles sky **and** `backgroundIntensity ≈ 4`". Both halves are now built behind
DEV seams (`?skyKeys=1`, `?bgIntensity=<n>`) and measured on the world-verified glazing population
(n = 367), 13:00, `realistic`:

| arm | glazing mean | **> 240** |
| --- | --- | --- |
| analytic sky, intensity 1 | 174.6 | **0.0 %** |
| Cycles keys, intensity 1 | 179.2 | **0.0 %** |
| Cycles keys, intensity 4 | 179.1 | **0.0 %** |
| analytic sky, intensity 4 | 171.1 | **0.0 %** |
| *photographs* | | *15–39 %* |

**Nothing moves.** And the reason is in the source: `GLASS_SKYCATCH_COLOR = '#cfe4f5'` is a
**constant**, and a pane's brightness is an **emissive** driven by `glassSkyCatchIntensity(daylight)`
(`materialRealism.ts`). It never reads `scene.background`. So no change to the background or its
intensity can reach the pane — which is also why the probe already carries a `SKYCATCH` knob, built
by an earlier round that suspected exactly this and measured a 1.4× brighter background moving the
window mean by only ~8 %.

**So `(z)`4 as decided cannot close `(l)`.** The sky-catch emissive is the gate. The Cycles sky and
the intensity are still worth having for the sky *seen past the window frame* — and `.77`'s
"matched the pane distribution to 0.1 pt" was presumably measured on that region rather than on the
glazing material, which is a different quantity and not a contradiction.

**Revised shape of the fix:** the pane must derive its brightness from the sky it is supposed to be
showing, rather than from a constant. That is a `materialRealism` change, not a background change,
and it is what `(l)` has actually needed all along.

**And the magnitude is now measured, `v0.31.7.153`.** Sweeping the probe's `SKYCATCH` multiplier
(applied with interception and read-back, so the intervention is verified — `0.4 → 6.4` emissive
across the sweep), 13:00, `realistic`, world-verified glazing (n = 367):

| `SKYCATCH` | glazing mean | **> 240** | > 250 |
| --- | --- | --- | --- |
| 1 (shipped) | 174.6 | 0.0 % | 0.0 % |
| 4 | 211.3 | 0.0 % | 0.0 % |
| 8 | 228.1 | 0.0 % | 0.0 % |
| 10 | 229.9 | 0.0 % | 0.0 % |
| **12** | 233.2 | **7.9 %** | 0.0 % |
| **14** | 238.5 | **43.1 %** | 0.0 % |
| 16 | 240.6 | 56.4 % | 0.0 % |
| *photographs* | | *15–39 %* | |

**≈×13 lands in the photographic band.** Two further observations:

- **`> 250` stays 0.0 % at every multiplier**, even with the mean at 240.6. That is AgX's shoulder —
  the same mechanism this item recorded for the background. So the app can approach the photographic
  band at `> 240` but cannot reach a hard clip; a metric defined at `> 250` would call every setting
  a failure.
- **≈13 is suspiciously close to the `BGMUL ≈ 12` this item escalated and then corrected down to 4.**
  Since the background provably cannot reach the pane, the discarded ~12 may have been the right
  *magnitude* measured on the wrong *lever*. Offered as an observation, not a conclusion.

**Across the day at ×13, and the night constraint is satisfied by construction:**

| hour | ×1 mean | ×13 mean | ×13 `> 240` |
| --- | --- | --- | --- |
| 08:00 | 154.8 | 233.7 | 1.9 % |
| 13:00 | 174.6 | 237.3 | **33.0 %** |
| 18:00 | 175.0 | 236.5 | **27.5 %** |
| 21:00 | — | — | **0 by construction** |

This item's standing constraint is *"Night (21:00) is already correct and must not regress"*, and it
is met without a guard: `glassSkyCatchIntensity(d) = clamp(d, 0, 1) * 0.4`, so at zero daylight the
sky-catch is **exactly 0** and any multiplier has nothing to scale. `materialRealism.test.ts` already
pins `glassSkyCatchIntensity(0) === 0`. (The probe emits no glazing population at 21:00 — `.127`
keyed the glass off sun altitude, so the night pane has a different material signature — so this is
established from the source and its test rather than from the metric.)

The daylight ramp also means the effect **self-scales with time of day**: in-band at midday and
evening, well under it at 08:00, zero at night. That is the right shape for a window, and it comes
free from the existing function.

### ⚠️ (l) — ×13 BLOCKED by a bloom guard, and the frame is right, `v0.31.7.155`

Implemented `glassSkyCatchIntensity` at ×13 (0.4 → 5.2) and **the suite caught it**:
`materialRealism.test.ts` asserts `glassSkyCatchIntensity(1) < 1.05` — *"stays below the bloom
threshold so windows do not bloom"*.

**The frame at ×13 is exactly what `(l)` asks for.** 13:00, `realistic`: the panes read as a bright,
blown-out opening with the grille silhouetted against them, edges crisp, no visible halo — the first
time in this arc a window has looked like an opening rather than a panel.

**But the guard is not obviously stale, and the interaction is subtle.**
`bloomIntensityForDay(d) = BLOOM.intensity · (1 − d)`, so bloom is **full at night and zero at full
day**, while the sky-catch is `d · 5.2`, **zero at night**. They are anti-correlated, so:

| day level | bloom | sky-catch at ×13 | risk |
| --- | --- | --- | --- |
| 0 (night) | full | **0** | none — nothing to bloom |
| ~0.3–0.6 (dusk) | 40–70 % | **1.6 – 3.1** | **above the 1.05 guard, unexamined** |
| 1 (full day) | **0** | 5.2 | none — pass is not even mounted |

So the guard protects a **dusk band** that neither the 13:00 frame nor the >240 sweep touches.
**Both settling questions are now answered, `v0.31.7.156`:**

**1. The guard predates the ramp — its daylight premise IS inverted.** `git log -S`:
`materialRealism.test.ts`'s `< 1.05` assertion landed **2026-06-13** (`RZ2: window glass sky-catch`);
the bloom day-ramp landed **2026-06-27** (`v0.5.0.0`). So when the guard was written bloom was active
in daylight and "a bright pane will bloom" was true. The ramp later made bloom **zero at full day**,
which is why the 13:00 frame at ×13 has crisp grille bars and no halo.

**2. But dusk DOES bloom, visibly.** 19:00 at ×13: pane mean 231.6, `> 240` 0.0 % — and the frame
shows a **soft glow spilling onto the wall and ceiling, with the grille bars losing definition**.
Compare 13:00, where they are sharp. The guard still protects a real case.

**And no smooth curve avoids it**, because bloom is non-zero for every `d < 1`:

| day level | bloom | `d·5.2` | `d³·5.2` |
| --- | --- | --- | --- |
| 0.4 | 60 % | 2.08 | 0.33 |
| 0.6 | 40 % | 3.12 | 1.12 |
| 0.8 | 20 % | 4.16 | 2.66 |
| 1.0 | **0 %** | 5.2 | 5.2 |

A cubic ramp keeps the pane under the guard until `d ≈ 0.59` — where bloom is still 41 % on. So the
overlap can be *narrowed* but not removed by reshaping the sky-catch alone.

**Three real options, and it is a look call:**

- **Accept the dusk glow.** A glowing window at dusk is photographically normal; the cost is the
  grille losing definition for an hour or so either side.
- **Ramp the boost as `d³`** — full effect at midday, and the overlap pushed into a narrower,
  higher-daylight band where bloom is weak.
- **Narrow bloom's own ramp** so it reaches zero earlier than full daylight, freeing the whole
  daylight range for the pane. Touches a separate shipped look.


### ⚠️ (z)4's OTHER half is also moot once (l) is fixed — `v0.31.7.158`

With `glassSkyCatchIntensity` shipped at `d³ · 5.2` (`.157`), the pane is correctly bright — and the
sky behind it is therefore almost invisible. Measured at 13:00, `realistic`, both paths confirmed
engaged by `BACKDROPCHECK` (1024×512 analytic vs 512×256 keyed):

| | mean abs diff | channels > 2 |
| --- | --- | --- |
| before `(l)`'s fix (`v0.31.7.152`) | 0.938 counts | 7.5 % |
| **after `(l)`'s fix** | **0.339 counts** | **1.49 %** |

**So the whole `(z)`4 asset route buys 0.34 counts in the shipped interior view.** Both halves of that
decision turn out not to matter for `(l)`: the intensity provably cannot reach the pane, and the
physical sky is hidden behind a pane that is now correctly blown out.

**Kept, not shipped.** `skyKeys.ts`, `skyKeyBake.ts`, the 500 kB key set and the `?skyKeys=1` seam are
all correct and tested, and the sky would matter for a **direct** view of it — a balcony, an open
door, looking up — which this pose does not contain. Making it the default on 0.34 counts would be
paying 500 kB for nothing measurable.

### (l)/(z)4 — the baked-key-set route is MEASURED VIABLE, `v0.31.7.148`

`(z)`4 was decided ("ship the Cycles sky **and** `backgroundIntensity ≈ 4`") but not scoped: the sun
moves, so one equirect will not do, and the choice was between a **baked key set with
interpolation** and an in-app Nishita implementation. Measured instead of argued.

Eight Cycles equirects at fixed sun altitudes (0–75°, 512×256, 32 samples) took **17 seconds** on the
GPU. Linear interpolation of two neighbouring keys against a directly-baked midpoint:

| key spacing | MAE (display counts) | as % of frame mean |
| --- | --- | --- |
| **15°** | 0.38 – 0.44 | **0.2 – 0.3 %** |
| **30°** | 1.09 – 2.17 | **0.6 – 1.4 %** |
| 60° | 3.66 | 2.2 % |

**30° keys hold the sky to ≤1.4 %**, and 15° to ≤0.3 %.

**And azimuth is free.** A multiple-scattering sky is azimuthally symmetric about the sun, so moving
the sun in azimuth is a **u-offset on the equirect**, not another key. Only *altitude* needs keys —
which is why the set is small.

So the route is: **~4–6 keys over the daylight range plus a couple below the horizon, interpolated by
altitude and rotated by azimuth.** At 512×256 the eight test renders total under 1 MB, so the whole
set is well inside a sensible asset budget, and an in-app Nishita implementation is unnecessary.

**The caveat was checked and resolves the SAFE way, `v0.31.7.149`.** I expected the
window-relevant region to be *more* sensitive than the whole frame. It is less:

| case | all | horizon band | brightest decile |
| --- | --- | --- | --- |
| 15° keys | 0.23 – 0.26 % | **0.12 – 0.13 %** | 0.16 – 0.21 % |
| 30° keys | 0.65 – 1.40 % | 0.24 – 1.36 % | **0.39 – 0.67 %** |
| 60° keys | 2.21 % | 1.31 % | 0.83 % |

The bright, high-valued parts of the sky are smooth and interpolate well; what changes fastest is the
sun's immediate surroundings and the sky/ground boundary, which occupy little area. So **30° keys
hold the pane-relevant regions to ≤1.4 %, and the brightest decile to ≤0.67 %** — the key count is
settled at 30° spacing, i.e. **4–6 keys**, with no need to refine it for the window case.

**And the error is RESOLUTION- AND SAMPLE-INDEPENDENT, `v0.31.7.150`.** Re-run at 1024×512 with 128
samples, every figure is identical to two decimals (0.26 / 0.12 / 0.22 against 0.26 / 0.12 / 0.21,
and so on). The interpolation error is a property of how the sky model varies with **altitude**, not
of how finely it is sampled — so the key count can be fixed independently of the asset resolution.

**Asset budget, measured:**

| resolution | 8 keys | ⇒ a 4-key set | bake time (8 keys) |
| --- | --- | --- | --- |
| 512×256 | 1.0 MB | **~0.5 MB** | 17 s |
| 1024×512 | 3.7 MB | **~1.9 MB** | 30 s |

**The resolution choice is therefore about gradient sharpness, not fidelity to Cycles** — and a
clear sky is a smooth gradient with the sun disc excluded, so it has little high-frequency content to
lose. That is reasoning rather than measurement: item `(r)` is the standing warning that a backdrop's
legibility through a window can only be judged by looking, so the resolution should be picked from a
frame, not from this table.

Measured at 512×256/32 and 1024×512/128; the horizon band is rows 40–60 % of height, and the decile
is taken wherever it falls because a pane can face the sun.

### Original write-up (the framing is superseded; the measurements are not)
~~⏳ OPEN, needs a product call~~ — ✅ ANSWERED by (z)4. (measured .236; diagnosed .258; priced .259; qualified .260; TWO ROUTES SEPARATED .261)
`.209` recorded that the window backdrop reads flat and parked it as a product decision, partly
because pushing the pane brighter fights the AgX view transform. `.236` measured what the gap
actually is, so the call can be made on numbers.

**Photographs blow their windows out. The app never clips at all.**

| | glazing ÷ wall | glazing pixels clipped |
| --- | --- | --- |
| `Home_Staging_Beispiel_Nachher` (daylit) | 1.10 | **39.3 %** |
| reference kitchen glazing (`curtain-glow.mjs`) | — | **15.1 %** |
| shaded garden view (`curtain-glow.mjs`) | — | 0.1 % |
| **app, 13:00** | **1.38** | **0.0 %** |
| **app, 19:00** | **0.85** | **0.0 %** |
| **app, 21:00** | **0.39** | 0.0 % |

> **App figures corrected in `.237`.** `.236` measured a rectangle over the whole window, which the
> **grilles** dominate — and grilles are interior-lit surfaces, so they track the wall by construction.
> The rows above are re-measured on **pane interiors only**, sampled between the bars. The clipping
> column is unchanged at 0.0 %, so the conclusion of this item never depended on the error.

The mean ratio is not the tell — the app's 1.32 at noon is *higher* than the photograph's 1.10. The
tell is the **distribution**: a real daylit pane is a clipped white hole with detail only at its
edges, while the app's is an evenly-lit grey field. That is why the app's window reads as a panel
rather than an opening, and it is measurable in one number that needs no crop matching.

> **v0.31.6.10 — the call is now TWO numbers, and one of them is not the pane.** Measured against the
> Cycles reference at matched framing (both 16:9) on a crop that excludes the app's UI and the
> reference's unlit edge band. Both frames put **100 % of their top percentile in the same two tiles**
> — the window — so this is a level/shape question at a fixed location, not a placement one.
>
> | `BGMUL` (`scene.backgroundIntensity`) | median | p95 / median | p99 / median |
> | --- | --- | --- | --- |
> | ×1 (shipping) | 126.4 | 1.320 | 1.436 |
> | ×2 | 126.7 | 1.412 | 1.608 |
> | ×4 | 126.8 | **1.584** | 1.759 |
> | ×8 | 126.9 | 1.741 | 1.870 |
> | ×32 | 127.0 | 1.938 | **1.993** |
> | **Cycles (physics)** | **111.1** | **1.624** | **2.194** |
>
> Three things follow.
>
> **It is a nearly pure highlight lever.** The median moves **+0.5 % across a 32× range**, so it cannot
> disturb the shadows and mid-tones that `v0.31.6.9` found already match physics. That is the ideal
> shape for a lever here.
>
> **It saturates at the encoding ceiling, so the pane alone cannot get there.** 255 ÷ 127.0 = **2.008**,
> and ×32 measures 1.993 — within 0.7 % of the hard limit. Physics fits its 2.194 tail only because it is
> exposed lower (median 111.1 → headroom 2.30). **So matching the highlight tail requires ~13 % less
> overall exposure as well as a brighter pane.** Exposure is a look call in its own right, which is why
> this item now needs two numbers rather than one.
>
> **No single multiplier matches both percentiles — the highlight SHAPE is wrong.** ×4 nails p95
> (1.584 vs 1.624) but leaves p99 20 % short; ×32 overshoots p95 by 19 % while still 9 % short on p99.
> Looking at the pane crops says why, and it is specific: **the Cycles pane has a bright narrow horizon
> band under blue sky — structure — while the app's pane is a uniform slab at every multiplier.** This is
> `.263`'s PMREM low-pass again, but for the first time with a physical target: what is missing is a
> **horizon-band gradient**, not pane brightness. `.261` judged the luminance route insufficient against
> *photographs* (which need 55–60 % blown); the Cycles target is far more modest (0.0 % clipped on both
> sides), so the route is not hopeless — it is just capped where the structure should take over.
>
> **FPS is not a constraint on any of this.** `backgroundIntensity` and `toneMappingExposure` are
> per-frame scalars, and a horizon band is a one-time backdrop paint. Zero per-frame cost.

> **v0.31.7.4 — the structural half is now settled, and it rules out the lever.** `BGHORIZON`
> paints a bright narrow band at the equirect horizon on a fresh `CanvasTexture` (the only route
> that reaches the render, `.263`). The band **arrives** — read back live at `[255,255,250]`
> against sky `[183,205,227]`, and plainly visible in the pane — but it arrives about **ten
> times wider and correspondingly dimmer**, so it adds mid-level brightness over most of the
> pane instead of a tail. Every percentile lands within 1.5 % of the no-band run at the same
> multiplier (p95 1.562 vs 1.584; p99 1.748 vs 1.759 at `×4`).
>
> **So `scene.background` cannot produce a highlight tail at any luminance or band width.** The
> PMREM pre-filter is the mechanism, not a parameter. `×4` stays the best available compromise
> on this lever (p95 within 4 % of physics, p99 20 % short).
>
> **The decision this item now needs is therefore bigger than a number:** whether the window
> gets **real geometry behind it** — a textured/emissive quad sampled directly, bypassing the
> environment path — which is what the tail requires. One quad per window, no per-frame work, so
> the fps floor is unaffected; but it is a visual-design call about what the view *is* (sky
> gradient? a neighbouring block? a photograph?), which is exactly the call that has been open
> since `.209`.

> **v0.31.7.5 — the pane is also where the last chroma error lives, and it is ~16 counts.**
> Absolute R−B cannot be compared across pipelines (`.315`: white-balance dependent, no
> photographic anchor), so the app's +8.6 against Cycles' −31.6 is mostly a difference of white.
> On the **WB-invariant** residual — each frame de-meaned before differencing — the whole-frame
> disagreement collapses from 40 counts to **7.0 counts rms**, within **±4.2** everywhere except
> two features, and the two worst tiles (**−15.2, −18.4**) are the **window tiles** — the same
> two that hold 100 % of both frames' top percentile. The app's pane is ~16 counts too **cool
> relative to its own room**: physics' pane is the least-blue thing in its frame (a bright
> near-white sky glow), the app's is a cool grey slab against a warmer interior.
>
> **So the tonal tail and the chroma residual — measured differently, normalised differently,
> sensitive to different things — both land on this one object.** The rest of the render agrees
> with physics on both axes. That is the strongest argument yet for giving the window real
> geometry, and it means this item is now the single open decision carrying *both* remaining
> measured errors.

> **★ RE-MEASURED AGAINST A PHYSICAL REFERENCE, ON A REPAIRED HARNESS — v0.31.7.278.** Every
> earlier number in this item predates `(z5)` (references built with no interior lights) and
> `(z10)` (frames captured before the baked GI attached), so the item needed re-measuring rather
> than re-arguing. Daylight-only on BOTH sides, `light-distribution`'s own `win-livingDining-N`
> pose (cam 10.87, 1.6, 6.475 → 10.87, 1.42, 3.480, fov 50 vertical, aspect 1.6), exposure-matched
> AgX, Cycles at 128 samples with the physical sky:
>
> | patch | Cycles | app | delta |
> | --- | --- | --- | --- |
> | window | **244.8** (sd 20.0) | **217.5** (sd 52.7) | −27.4 |
> | wall left | 131.0 | 135.1 | +4.0 |
> | ceiling | 193.0 | 199.7 | +6.7 |
> | wall right | 183.9 | 193.6 | +9.7 |
>
> **The room is fine; the APERTURE is the whole defect.** Every interior surface is within 10
> counts and the app is slightly BRIGHTER than physics on all three — so this is not a daylight
> or GI shortfall. The window alone is 27 counts short of a reference that is essentially clipped
> (244.8 of 255), and the `sd` says what that costs: **20.0 in Cycles against 52.7 in the app**.
> Physics blows the aperture out and the safety grille washes into the glare; the app renders a
> patterned light-grey panel with the bars still fully legible. That is the difference between a
> photograph and a render, and it is the single largest remaining VISUAL gap in the arc.
>
> `light-distribution` reaches the same verdict independently and refuses the pose for
> dynamic-range work: *"p05 18 vs median 138, aperture 0.00 % — no bright aperture in view"*,
> on a pose where 31 % of its near bucket IS window glazing. The glazing is in view and simply is
> not an aperture.
>
> **Recommended approach, and it is a look call.** `.4` established that `scene.background` cannot
> produce the tail at any luminance or band width, because the PMREM pre-filter is the mechanism.
> So the pane needs a term of its own. The cheapest bounded version is a DAYLIGHT-SCALED EMISSIVE
> on the glazing material, calibrated so its rendered value matches this reference's 244.8 — one
> material, no new geometry, no per-frame cost, and it must be tied to sky luminance or the panes
> glow at night. It changes no interior lighting, since the room is lit by the analytic sun plus
> the baked GI rather than by the pane. Not yet implemented: it is a visible design change to
> every window in the app and deserves its own round with a multi-hour look check.

> **★ TWO CANDIDATE FIXES KILLED, AND THE MECHANISM FOUND — v0.31.7.279.** `.278` recommended a
> daylight-scaled emissive on the pane. That was wrong, and the lever it named already exists.
>
> **1. The pane emissive SATURATES.** `glassSkyCatchIntensity` is already `d³ · 5.2`, already
> daylight-scaled, and `light-distribution` already has a `SKYCATCH` override for it. Swept at the
> reference pose: **5.2 → 228.9, 9 → 230.2, 13 → 230.3**. Raising it 2.5x moves the pane **1.4
> counts** against a 27-count gap. The function's own docstring said as much (×16 tops out at
> 240.6) and I proposed it anyway.
>
> **2. It is NOT the AgX shoulder.** The obvious next suspect was three's AgX diverging from
> Blender's at the top end. Rendered BOTH sides under `Khronos PBR Neutral`, a low-shoulder
> transform: the ceiling agrees to **1.2 counts** (217.4 vs 216.2) while the window gap **WIDENS to
> 33.1** (241.6 vs 208.5). A shoulder artefact would shrink, not grow.
>
> **3. The mechanism: the app's pane mean is GRILLE-BAR-dominated, and the app has no glare to
> wash them out.** Spread at the same patch is **sd 13.6 in Cycles against 62.0 in the app**.
> Physics puts a very bright aperture behind the safety grille and veiling glare overwhelms the
> bars; the app renders crisp dark bars against bright glass, so the patch MEAN is dragged down by
> the bars — which is also why brightening the glass between them barely moves it.
>
> And the app cannot produce that glare at midday **by construction**: `bloomIntensityForDay(d) =
> BLOOM.intensity · (1 − d)` is exactly **0 at `d = 1`**, and `EffectsImpl` DROPS the bloom pass
> entirely once it ramps to zero (BLOOM-MIP-FLASH — cheaper, and one less way to blank a frame on
> ANGLE/Metal). So bloom is keyed INVERSELY to the one variable that should drive it: an aperture
> needs glare most at full daylight, and that is precisely when there is none.
>
> **Fix direction, not attempted.** Bloom keyed to APERTURE LUMINANCE rather than to `1 − day`.
> That collides with two recorded decisions — the BLOOM-MIP-FLASH unmount and `.156`'s finding that
> a bright pane plus dusk bloom spills onto wall and ceiling and destroys the grille definition —
> so it is a real design change, not a coefficient. It also has an fps cost the current design
> deliberately avoids: mounting bloom at midday is a blur chain the daylight path does not
> currently pay for.

> **★ PARTLY FIXED, AND THE MEAN WAS THE WHOLE PROBLEM — v0.31.7.280.** `patch-read` now reports
> **p05/p95** alongside the mean, and that single instrument change dissolved two of my own wrong
> conclusions. A pane region holds TWO populations — thin grille bars and bright glass — and a mean
> cannot separate them:
>
> | | mean | p05 (bars) | p95 (glass) |
> | --- | --- | --- | --- |
> | Cycles | 244.8 | **187** | **254** |
> | app, before | 217.4 | **91** | 243 |
> | app, after | 230.5 | **187** | 243 |
>
> **The glass was nearly right all along (243 vs 254); the BARS were 96 counts too dark.** So
> `.279`'s "the pane emissive saturates" was an artefact — a 5.2 → 13 sweep moved the MEAN 1.4
> counts because bars dominate it, not because the glass failed to brighten. And the AgX-shoulder
> theory it replaced was also wrong (`.279` refuted it by measurement). The defect was never
> brightness or tone curve; it was that physics washes the bars out with veiling glare and the app
> renders them crisp.
>
> **Fix: `grilleGlareIntensity(daylight) = d³ · 1.4`**, a daylight-keyed emissive on the bars,
> calibrated on **p05** — which now lands exactly on the reference's 187. `sd` 52.8 → 29.9 against
> Cycles' 20.0. Deliberately a LOCAL approximation of veiling glare: it lifts the bars, where the
> error is, and does not spill. Verified not to spill — the ceiling patch is byte-identical before
> and after (199.7 / p05 189 / p95 211).
>
> **The first calibration was wrong and the FRAME caught it.** At `3.0` it hit a mean target and
> drove p05 to 213 — brighter than the glass — which the numbers called an improvement and the
> image showed as light streaks with the polarity inverted. Reverted, re-derived on p05. A test now
> pins `grilleGlareIntensity(1) < glassSkyCatchIntensity(1)` so bars can never out-shine glass again.
>
> **Night cannot regress, by construction**: cubed, exactly 0 at `daylight = 0`, and measured —
> 22:00 reads pane p05 45. Dusk checked against `.156`'s bloom-spill failure: at 19:00 the wall
> moves 1.2 counts against night, and the frame shows no halo. Note `daylightFromAltitude` is
> effectively a day/night switch (1.0 for any sun above the horizon, ramping only across −8°..0°),
> so the cube's protection lives in that narrow twilight band rather than across the afternoon.
>
> **Residual: p95 243 vs 254, mean 230.5 vs 244.8.** The GLASS is now the remaining 11 counts, and
> `scene.background` cannot supply it (`.4`: the PMREM pre-filter is the mechanism). Frame cost
> unchanged — no new pass, and `useSunPosition` re-renders only on hour change.

> **★ THE GLASS TOO — v0.31.7.281, and the sweep that dismissed it had been misread twice.**
> With p95 separating glass from bars, the glass was **243 against physics' 254** — a real deficit
> `.279` had written off as "the emissive saturates". That came from a MEAN (bar-dominated, blind
> to the glass) and from reading `SKYCATCH` as an absolute intensity when it is a **multiplier**:
> "5.2, 9, 13" were ×5.2/×9/×13 on top of the default, ~27 to ~68, every one clipped at p95 255.
> Swept properly the glass responds — ×1.25 → 246, **×1.6 → 248**, ×2.2 → 251.
>
> `glassSkyCatchIntensity` is now **`d⁴ · 8.32`** (was `d³ · 5.2`). ×1.6 and not ×2.2, because at
> ×2.2 the bars' p05 falls 187 → 163 and pushing the glass further undoes `grilleGlareIntensity`.
> The exponent rose WITH the coefficient for `.156`'s reason: the ratio to the old curve is exactly
> `1.6 · d`, so they cross at **d = 0.625** — brighter only from there to full daylight, and
> strictly lower through the deep-dusk band below (0.520 vs 0.650 at 0.5; 0.213 vs 0.333 at 0.4),
> so both codified dusk guards gain margin. A curve higher at 1 and lower below must cross
> somewhere; the point is where.
>
> | | mean | p05 (bars) | p95 (glass) | sd |
> | --- | --- | --- | --- | --- |
> | Cycles | 244.8 | 187 | 254 | 20.0 |
> | app, original | 217.4 | 91 | 243 | 52.8 |
> | + bar glare | 230.5 | 187 | 243 | 29.9 |
> | **+ glass** | **235.2** | **188** | **248** | **31.4** |
>
> Closed: mean 27.4 → 9.6, p05 96 → 1, p95 11 → 6, sd 32.8 → 11.4. Ceiling moves 1.0 count, so
> still no spill. Dusk verified in the ramp band (19:40): dim pane, no halo, bars catching the
> lamps — which is the lamps on metal, not this term, since glass stays above bars throughout the
> ramp. **60 fps on both tiers**, max 12.5-13.8 ms. Residual is 6 counts of glass and 11 of `sd`.

> **★ VALIDATED IN A SECOND ROOM — v0.31.7.282.** Every number in `.280`/`.281` came from ONE
> pose in `livingDining`, and this arc's own rule is that one room is not a validation. Re-run in
> `mainBedroom` (`win-mainBedroom-N`, standoff 3.6, daylight-only, its own Cycles reference at 128
> samples):
>
> | | mean | p05 (bars) | p95 (glass) |
> | --- | --- | --- | --- |
> | Cycles | 251.0 | 221 | 254 |
> | app | 241.1 | 207 | 248 |
> | **gap** | **9.9** | 14 | **6** |
>
> Against `livingDining`'s **9.6 mean / 6 p95**, the window fix reproduces almost exactly in a
> different room with a different window, standoff and furniture. The `p05` gap is 14 here against
> 1 there, so the bar term is slightly under in this room — but against the 96 it started from,
> both rooms are now in the same small band. **The fix generalises.**
>
> **A separate room-level finding, and it is NOT the window's:** this room's surfaces run DARKER
> than physics where `livingDining`'s ran slightly brighter. The left wall reads **198.0 against
> Cycles' 213.8 (0.926)**, where the L/D walls measured 1.02-1.05. So the daylight/GI balance is
> room-dependent at roughly the ±8 % level, which is larger than anything else currently open.
> Filed as a lead, not a conclusion — one patch, one pose.
>
> **Two ceiling patches are deliberately NOT quoted.** The first landed on the HUD toolbar (the
> `Scene` button) — the exact failure `patch-read`'s docstring records from `.316` and `.323`, and
> caught by looking at the overlay rather than by the numbers, which were plausible. Re-placed
> clear of the chrome they read 72-101 counts dark, but the visible ceiling here is a band about
> 8 % of frame height, where a small framing difference moves a patch from ceiling to downstand
> beam. That magnitude is not trustworthy and the wall figure above is the safe version of the same
> signal.

> **★ FOUR VIEWS, TWO PLANS, cv 0.62 % — v0.31.7.57.** app p99 ÷ physics p99 = 0.7265, 0.7388,
> 0.7287, **0.7306** (the last measured after the constant was published). Mean **0.7312** ⇒
> correction **1.368×**.
>
> **★ THE LEVEL IS ONE CONSTANT, MEASURED ON THREE VIEWS — v0.31.7.54.** Decomposing
> `p99/median` into its parts separates the window's *level* from the room's:
>
> | view | app p99 | physics p99 | ratio |
> | --- | --- | --- | --- |
> | 4-Room livingDining | 178 | 245 | **0.725** |
> | 4-Room bedroom3 | 181 | 245 | **0.740** |
> | 5-Room kitchen | 180 | 247 | **0.731** |
>
> Physics pins its highlight at **245–247 (cv 0.4 %)** — the window shows the sky, whose luminance
> is the same in every room. The app pins its own at **178–181 (cv 0.8 %)**, at **0.73×**, in all
> three views across two plans.
>
> **✅ VERIFIED REACHABLE — v0.31.7.55: `BGMUL ≈ 12`.** app p99 goes 178 → **242** (livingDining),
> 181 → **244** (bedroom3), 179 → **243** (5-Room kitchen) against physics' 245/245/247, with the
> median unchanged to the count in every case. ×20 overshoots. This also retires `v0.31.6.10`'s
> "BGMUL saturates below physics" — that was the *ratio* `p99/median` hitting `255/median`; the
> absolute p99 reaches 248 and the target is 245.
>
> **So the call is one multiplier: ~1.37× on the window's luminance.** Not a curve, not a
> per-plan value, not a structure change — everything above about the pane reading "as a panel
> rather than an opening" concerns its *structure*, which is a separate and still-open question
> (`v0.31.7.4`: the PMREM path cannot carry a horizon band). The level is scene-independent and
> off by a single factor.
>
> Earlier ratio-based readings of this item (51 % short, 32 % short, 10 % over) were a compound of
> this constant and the app's under-responsive median (`cv 8.2 %` against physics' `26.7 %`), and
> should not be used.

**The 21:00 case is already right** (glazing 0.39 of wall, interior warm at R−B 23.4 against a
neutral pane) — whatever ships must not regress it.

> **v0.31.5.267 — the chroma half of this item is answered, and the reference set cannot settle the rest.**
>
> New metric: **chroma separation = (wall R−B) − (glazing R−B)**, within one image, so it is white-balance
> invariant. The app across the day, canonical pose, `medium`, photographic look:
>
> | hour | glazing R−B | wall R−B | **separation** |
> | --- | --- | --- | --- |
> | 09:00 | 1.5 | 5.9 | 4.4 |
> | 13:00 | −5.0 | 4.4 | 9.4 |
> | 17:00 | 18.0 | 6.1 | **−11.8** (window *warmer*) |
> | 19:00 | 21.3 | 26.4 | 5.1 |
> | 21:00 | 1.8 | 28.8 | **27.0** |
>
> The reference, measured identically — `p233-Home_Staging_Beisp`, three hand-cropped panes against a clean
> wall (R−B 9.0): **+1.5, −4.6, −4.0.** A daylit interior has almost **no** warm/cool separation, because
> inside and outside share the same light, and the sign varies pane to pane.
>
> **So the app is not deficient.** Daylight hours give 4.4–9.4 against the photograph's ≤ 4.6 — same order,
> if anything more. The "no separation" concern below is **not supported as a defect** wherever a reference
> exists, and 21:00 shows a strong 27.0.
>
> **But the reference set can never settle 19:00.** `.233`'s screening *requires* daylit photographs, while
> chroma separation only becomes large at golden hour and dusk. Every screened photograph will show ≈ 0
> separation, forever. Settling it needs a deliberately different screen — dusk interiors, lamps on, sky
> visible — with its own confounds (long exposures, mixed colour temperature, heavy grading in real-estate
> dusk shots).
>
> *Caveat:* R−B conflates paint with illumination. The app's wall is `#f5f5f0`, own R−B 5, so its 13:00
> reading of 4.4 is essentially all paint — the daylight wall carries no warm illumination tint beyond its
> pigment. The photograph's paint is unknown.

**A second, narrower finding at 19:00.** The pane is *dimmer* than the wall (0.80) **and tinted
identically to it** — pane R−B **21.0**, wall R−B **21.3** (`.237`, pane-only). At the hour when interior photography
most depends on warm-interior-against-cool-exterior separation, the app has none. Some of this is
honest physics (at golden hour the sky and the room are lit by the same warm sun), but a sky that is
both dimmer than the wall and the same colour as it cannot read as sky.

### v0.31.5.258 — this is a scene dynamic-range deficit, not a tone-mapping fight

`.209` framed the blocker as *"pushing the pane brighter fights the AgX view transform"*, and this item
inherited that. Measured with the curve bypassed (`LINEAR=1`: `gl.toneMapping` → `NoToneMapping`, exposure
intercepted), sampling a 6 cm world patch **between the grille bars** on the glazing against wall plaster
anchors at 1.2/2.4 m, 13:00, photographic look, canonical pose:

| tier | wall linear | glazing linear | **glazing : wall (linear)** | same anchors, shipped curve |
| --- | --- | --- | --- | --- |
| `medium` | 0.1736 | 0.3895 | **2.24 : 1** | 2.06 : 1 |
| `performance` | 0.1227 | 0.4015 | **3.27 : 1** | 2.88 : 1 |
| *physical daylight* — sky 2,000–15,000 cd/m² vs interior wall 50–300 cd/m² | | | ***~20–200 : 1*** | |

**Two conclusions.**

1. **The app's window carries 2.2–3.3× the wall where physics carries 20–200×** — short by roughly one
   order of magnitude at best, two at worst. That alone explains 0.0 % clipping: a pane at 2.2× the wall
   cannot clip while the wall sits mid-grey.
2. **The tone curve is not what flattens it.** With the shipped curve the same anchors read 2.06:1 and
   2.88:1 — the curve removes only **8–12 %** of the ratio. It is not compressing a large range; there is
   no large range to compress. **The `.209` objection is measurably not the binding constraint.**

Robustness: the reading is sRGB-decoded before ratioing; were the output linear the ratio would be
**1.45:1**, smaller still. Cross-check: the tone-mapped 8-bit ratio here is **1.389** against `.237`'s
independently hand-sampled pane-only **1.38** — two methods 21 rounds apart agreeing to 0.01.

Confound direction, stated because it matters: wall albedo enters (the app's wall is near-white `#f5f5f0`,
so its luminance sits high) and a large aperture brightens the wall further (71 % of the end wall, `.251`).
**Both make the app look better than it is, so the deficit is understated.**

### v0.31.5.259 — priced: ≈×30 of exterior radiance, and it costs nothing in shadow depth

**The lever is `scene.backgroundIntensity`.** In walk mode the sky *dome* is not in the scene
(`isPhotoBackdropActive` stands it down); the exterior is `scene.background`, a `CanvasTexture`. Glazing
measured as a **world-verified signature population** (n = 413 pane-interior samples) rather than a
rectangle, so grilles cannot dominate it as they did in `.236`.

13:00, `medium`, photographic look, canonical pose, AgX:

| `backgroundIntensity` | glazing mean | **clipped (> 250)** | frame mean | `%<64` |
| --- | --- | --- | --- | --- |
| **1 (shipped)** | 161.4 | **0.0 %** | 113.0 | 11.85 % |
| 4 | 206.6 | 0.0 % | 117.9 | 11.85 % |
| 16 | 237.2 | 0.0 % | 121.3 | 11.85 % |
| 24 | 242.3 | 4.1 % | 121.8 | 11.85 % |
| **32** | 245.3 | **39.7 %** | 122.2 | 11.86 % |
| 64 | 250.2 | 86.2 % | 122.7 | 11.85 % |
| *photographs* | | ***15–39 %*** | | |

**≈×28–32 reaches the photographic band. `%<64` does not move at all** (11.85 % throughout) and the frame
mean rises only **+8 %** — because the background is not a light and does not illuminate the room. Contrast
`.254`'s ground bounce, which cost 14 % of brightness for 13 % of ratio.

**Looked at:** at ×32 the window is a blown white opening with the grille bars **silhouetted** against it —
what a daylit interior photograph looks like, and what this item describes. The interior is visibly
unchanged. Honest caveat: a blown pane shows no view, which is photographically correct and a look question.

**Both `.209` and `.258` are right, at different operating points.** Tested at ×32:

| view transform | clipped | frame mean | `%<64` |
| --- | --- | --- | --- |
| **AgX (shipped)** | 39.7 % | 122.2 | 11.86 % |
| filmic | 86.4 % | 109.9 | 24.72 % |
| neutral | 90.6 % | 95.1 | 32.80 % |

AgX's long shoulder resists clipping (so `.209`'s tension is real once range exists) **while protecting the
interior** — the other curves clip readily but cost 13–21 points of `%<64`. `.258`'s "the curve is not the
constraint" holds only at the shipped level, in the curve's near-linear region. **Practical consequence:
keep AgX, supply the range.**

**Cost at the hours this item recorded as already correct.** The app switches pane material by hour — day
`BoxGeometry#bcd4e6`, night `BoxGeometry#20272f` at opacity 0.73:

| | glazing ×1 | glazing ×32 | frame mean | `%<64` |
| --- | --- | --- | --- | --- |
| 19:00 (day pane) | 141.0, 0.0 % clipped | 228.2, **0.0 %** clipped | 156.0 → 165.3 | 3.68 → 3.69 % |
| 21:00 (night pane) | 23.0 | **43.0**, 0.0 % clipped | 133.9 → 136.0 | 15.65 → 14.09 % |

19:00 stays unclipped, arguably right for golden hour. **21:00 is the real cost — the night pane roughly
doubles.** It stays far from clipping and far below the wall, but this item recorded 21:00 as correct, so it
is a genuine change. That the app *already* switches pane material by hour suggests the fix need not be one
global scalar — a per-hour or per-material curve would leave 21:00 alone.

### v0.31.5.260 — the 15–39 % band is an AGGREGATE, and the app can only match the average

The clipping band rests on n = 2 and `.259`'s answer is sensitive to it (×24 → 4.1 %, ×32 → 39.7 %), so
widening it was the obvious next step. It could not be widened by automation — a bright-region pane-finder
returned curtains, a chandelier and a whole kitchen interior as "panes", and on the control it selected the
brightest *core* and read **86.1 %** where `.236` recorded **39.3 %** for the same photograph.

That discrepancy is the finding. Measured pane by pane on `Home_Staging`, hand-cropped and visually checked:

| pane | what is behind it | mean | **> 250** |
| --- | --- | --- | --- |
| left | open sky, neighbouring roof, bare branches | 229.1 | **58.9 %** |
| middle | a sunlit neighbouring wall | 193.3 | **32.6 %** |
| right | a **shaded** balcony with a wooden door | 146.3 | **9.0 %** |

**A 6.5× spread within one photograph**, because each pane faces something different. The 39.3 % is a
*mixture*, not a property of glazing.

**Consequence for the fix.** The app has **one backdrop texture**, so at ×32 all 413 glazing samples read
39.7 % — every pane blows together, a smooth gradient uniformly clipped. A photograph reaching ~39 % does so
by mixing a blown pane with an unblown one. **A single global multiplier therefore buys the right statistic
and the wrong picture.**

So the limiting uncertainty in this item is **not** the size of the reference set — it is the *population
definition*. "Photographs clip 15–39 %" is not a target without "over what population", and once attached,
scaling one backdrop reaches the photographic **average** but not its **structure**.

`.259`'s ≈×30 stands as the aggregate-matching figure, with that caveat explicit. Anyone taking this
decision should know they are buying a uniformly-blown window, which is more photographic than today's grey
panel and still not what a photograph does.

### v0.31.5.261 — a real window is blown AND readable at once. There are two routes, not one.

Measured with matched statistics on both sides — the app's 413 world-verified glazing samples, and a
**frame-free** pane of `p233-Home_Staging_Beisp` (tiled roof, soffit, blown sky, a bare branch), stable
across three insets:

| | clipped | sd | spread p95−p05 | **mid-tone (60–240)** |
| --- | --- | --- | --- | --- |
| app @ ×1 (shipped) | 0.0 % | 17.4 | 55 | **100.0 %** |
| app @ ×32 (`.259`'s match) | 39.7 % | 16.5 | **20** | **9.4 %** |
| **photograph, one pane** | 54.6–60.3 % | **33.7–37.7** | **90–95** | **36–44 %** |

**A real pane is 55–60 % blown *and* 36–44 % mid-tone simultaneously** — the sky is gone, the roof beneath it
is still readable. At comparable clipping the app's *entire window* carries half the internal variation of
that one pane (sd 16.5 vs ~35) and a quarter of the spread. The comparison is generous to the app: pooling
all its panes should give it *more* variation, not less.

**The app can be one mode or the other, never both**, because its backdrop is a smooth gradient — scaling it
scales everything together, which is exactly what ×1 → ×32 shows (mid-tone 100 % → 9.4 %).

This also corrects `.260`, which attributed the mixture to panes facing different things. The variance
splits **within-pane sd 42.3** against **between-pane sd 20.9** — the dominant term is variation *inside* a
pane. Each pane contains a scene with its own range; that matters more than the differences between panes.

### ~~⚠️ v0.31.5.262 — the ×30 lever's MECHANISM is not established~~ → RESOLVED in v0.31.5.263

`backgroundIntensity` demonstrably moves the glazing (161.4 → 237.1 → 245.2 at ×1/×16/×32, reproduced).
But painting the backdrop canvas has **no effect at all** — filling it *entirely black*, verified black by
read-back at capture time, leaves frame mean 121.3 → 121.3, `%<64` 11.85 → 11.84 and glazing 237.1 → 237.2.

So the glazing depends on the background **slot** but not on the background's **content**, and the ×30
lever is *not* "make the view brighter" — it scales something whose content is not the painted sky.

This does **not** change `.259`'s measured costs (+8 % frame mean, zero `%<64`, night pane 23 → 43). It
changes how much the *interpretation* should be trusted: this arc has retired four metrics for being
right-looking and wrong-mechanism (`.249`, `.251`, `.253`, `.255`), and a lever with a measured effect and
an unknown mechanism belongs in the same category until the mechanism is found.

**Leading hypothesis (untested):** the glazing may be lit from a **PMREM derived once** from the sky rather
than from the live canvas, which would make canvas mutation inert while a scalar on the slot still scaled
the derived result.

**Consequence for the structural route:** `.261`'s claim that backdrop *content* would supply the range is
**untested, not refuted** — `.262` could not deliver content to the renderer at all.

> **✅ RESOLVED in v0.31.5.263.** three converts an equirect `scene.background` into a CubeUV/PMREM and
> **caches it keyed on the texture object**; `needsUpdate` does not invalidate that cache. Mutating the bound
> canvas is therefore inert, while `backgroundIntensity` still scales the cached conversion. Handing the
> scene a **new `CanvasTexture`** makes the content appear.
>
> **The `.262` caveat is withdrawn.** The window does show the background, the ×30 lever scales what the
> window shows, and `.259`'s pricing stands with its interpretation intact.
>
> **`.261`'s content hypothesis is confirmed in direction** — a facade raises glazing spread **20 → 78** and
> mid-tone **9.4 % → 75.3 %** at ×32, roughly 4× what no luminance multiplier could buy at any value.
>
> **But the backdrop path is LOW-PASS.** Looked at, the facade arrives as a soft blurred band — its 8 px
> vertical detail is gone and the pane reads as **frosted glass, not a view**. Moving the facade's top edge
> across 0.485/0.520/0.535 changed the numbers by ≤ 0.1 %, confirming the smear. So the structural route
> needs **a path that can carry detail** — real geometry outside the window, or a background that bypasses
> the PMREM conversion — not merely a better backdrop image.

### The two routes, now separated

| route | what it costs | what it buys |
| --- | --- | --- |
| **aggregate match** — ≈×30 exterior radiance (`.259`) | +8 % frame mean, **zero** `%<64`, night pane 23 → 43 | the right clipping *statistic*; a **uniformly blown** window |
| **structural match** — backdrop **content** with its own range | unpriced; a content change, not a lighting one | what a photograph actually does: blown sky over a readable near object |

The backdrop today is `paintSkySurround`, a procedural sky gradient with nothing in it, so **no luminance
multiplier can reach the structural target.** For an HDB flat the diagnosis is fortunate: the real view from
most windows *is* another block, which is exactly the near-object content that would supply the range.

### v0.31.8.50 — a THIRD veil, in the pane itself. Two corrections and one shipped fix.

Everything above tries to put range *behind* the glass — more exterior radiance (`.259`), more
backdrop content (`.261`, `.263`). Nobody looked at the glass. The pane carries a **constant emissive
sky-catch** (`glassSkyCatchIntensity`, RZ2: `emissiveIntensity = daylight × 0.4`), added to every pane
pixel regardless of what is behind it. A constant added to a signal raises its floor and **compresses
its contrast by construction** — which is exactly the signature this item has been describing since
`.236`: *"an evenly-lit grey field"*, 2.2–3.3 : 1 against the wall, and 0.0 % clipping.

Measured at the default 4-room flat's living-room window, walk mode, 13:00, `medium`, the pane
rectangle inside the glazing, dropping the sky-catch to 0:

| backdrop | pane sd | pane spread (p95−p05) |
| --- | --- | --- |
| `sky` (the default) | 15.9 → **20.1** | 47 → **63** |
| `city` | 10.5 → **11.5** | 31 → **38** |
| `park` | 12.5 → **14.7** | 37 → **44** |
| `dusk` | 17.0 → **23.2** | 53 → **74** |

**The stand-in was costing 19–40 % of the window's luminance range**, at the exact hour and pose this
item is measured at, on every backdrop, for free.

**Shipped, narrowly.** The sky-catch is a *stand-in* for sky luminance where nothing is painted behind
the pane, so it now **retires whenever a backdrop is painted** (`backdropVisibleNow()` — walk mode,
backdrop with imagery). Orbit / dollhouse, the `none` backdrop and `custom` with no upload keep it
byte-identical; those are the cases RZ2 added it for. **The 21:00 case cannot regress**: at night
`daylight` → 0 and the sky-catch is already 0 there, which is now a test.

**Correction 1 — `.263`'s "the backdrop path is LOW-PASS" is wrong.** three only runs PMREM on the
background when `scene.backgroundBlurriness > 0` (`WebGLBackground.getBackground`), and this app never
sets it. The real path is `WebGLEnvironments.getCube` → `new WebGLCubeRenderTarget(image.height)`,
i.e. **1024 px per cube face** from the 2048×1024 equirect — sharp. The WeakMap cache keyed on the
texture object, which `.262`/`.263` correctly measured, lives in `getCube`, not in the PMREM branch;
same observable behaviour, different converter, and **no resolution loss**. What `.263` read as a
smear was the pane veil above, not the delivery path.

**Correction 2 — the structural content already ships.** `.261` says the backdrop is *"`paintSkySurround`,
a procedural sky gradient with nothing in it"*. That is true of the **default** (`sky`), and only of it.
The `city` preset paints a full HDB skyline with lit windows, and looked at through the window it is
plainly legible — individual window squares, a roofline, depth layers. `dusk` likewise. So the
structural route does not need building; it needs the pane to stop veiling it, and — separately — a
default that has something in it.

**What is left of this item.** Even with the veil gone the pane reads sd 20.1 / spread 63 against a
photograph pane's ~35 / 90–95, so roughly half the gap remains, and `.259`'s ≈×30 aggregate lever is
untouched. But two of the three things this item blamed turn out not to be the constraint (the tone
curve, `.258`; the delivery path, above), and the third is now partly paid without any look trade.

> **A caveat on the spread numbers, stated because it matters.** sd / p95−p05 over a large rectangle
> conflate a smooth vertical *ramp* with actual *detail* — which is why `city` measures LOWER spread
> than the empty `sky` gradient (31 vs 47) despite plainly carrying more structure. The comparisons in
> the table are paired (same crop, same backdrop, one variable), so they price the veil correctly; they
> are **not** a ranking of the backdrops. Separating ramp from detail needs a local/high-frequency
> metric, which this round did not build.

**Why this is still not being decided here:** the fix space is unchanged in kind — brighter backdrop, a
bloom-carrying emissive pane, or a separate exposure for the backdrop — but it now has a **target**: roughly
10–100× more backdrop luminance relative to the interior. That changes shipped appearance at every hour, and
the **21:00 case `.236` recorded as already correct must not regress** (glazing 0.39 of wall, interior warm
at R−B 23.4 against a neutral pane). Root `CLAUDE.md` reserves calls like this. What has changed is that the
call is now a physical-correctness question with a number, not a look-versus-AgX trade.

## (m) PHOTO-VIGNETTE — ✅ DECIDED 2026-09-04, see (z)12: ship on all tiers (built and measured v0.31.5.244; its counter-metric retired in v0.31.5.249)

`EffectsImpl.tsx` mounts `Vignette` — its own header calls it *"subtle edge darkening so the frame reads
'shot, not rendered'"* — **only on the full post stack** (`high`/`maximum`). `medium` runs the AO-only
minimal composer, so the photographic look there gets the film grain but not the lens falloff.

That asymmetry has an explicit precedent pointing the other way. PHOTO-GRAIN was deliberately extended to
both composer modes, and the comment says why: *"`medium` … is the tier the adaptive ladder picks for most
browsers, so a full-stack-only grain would miss them."* The identical argument applies to the vignette.

**It was built and measured, then reverted.** `VIGNETTE = { offset: 0.32, darkness: 0.55 }` hoisted to
`look.ts` (so both call sites cannot drift), and the mount changed to `full || photographicLook`:

| corner ÷ centre | top-left | bottom-left |
| --- | --- | --- |
| `medium`, shipped (no vignette) | 0.894 | 0.751 |
| **`medium` + vignette** | **0.726** | **0.605** |
| `high`, full stack (ships it today) | 0.693 | 0.575 |

Vignetted `medium` lands just short of `high`, and the residual is `high`'s heavier `AO.intensityPost` —
i.e. the pass behaves exactly as the tier that already ships it. Visually the frame reads more
photographic.

**Why it was reverted rather than shipped.** It costs a *validated* metric:

> **wall falloff far/near 0.74 → 0.66**, against a photographic reference of **0.85–0.86**.

The far-wall band sits near the frame edge in the canonical pose, so the lens darkening lands directly on
it. Ceiling ÷ wall also moves 0.88 → 0.86. This is a stylistic gain paid for with a measured regression on
a metric whose reference is a photograph — and that photograph carries whatever vignette its own lens had,
so 0.85–0.86 is already the vignette-inclusive target.

> **⚠️ That objection is gone as of `v0.31.5.249`.** The wall-falloff metric has been **retired
> entirely** — not merely demoted. Its `'wall'` classifier is `|n.y| < 0.3`, i.e. any near-vertical
> surface, so at the canonical pose the "far wall" bucket is **64 % dark timber armchair backs, 21 %
> lampshade, 13 % lamp pole and 0 % plaster**, while the near bucket is 31 % window glazing. The number
> also runs **0.60–0.98 on viewport aspect alone**. And photo D's 0.85–0.86 came from two hand crops of
> real plaster, so the two sides were never the same measurement. **The 0.74 → 0.66 above is a change in
> how much light lands on two armchairs, not a wall-falloff regression.**
>
> `ceiling ÷ wall` 0.88 → 0.86 also weakens: that `'wall'` population is 49 % plaster / 14 % glazing /
> 6 % timber, so it is contaminated too, though less. `.244`'s **corner ÷ centre** figures in the table
> above are unaffected — they are frame-geometry ratios and do not use the `'wall'` classifier.
>
> So this item no longer has a measured cost on one side. It is now a **pure look call**, which is what
> `.244` argued it was in the first place. A clean re-test needs the plaster-only, world-anchored wall
> metric described at the end of the `.249` section of the research doc.

**The call needed:** is a lens cue worth having on the tier most users boot into? It is a
look decision, not a measurement one, and it changes the shipped appearance of the photographic look —
so it is filed here rather than taken unilaterally. Two secondary facts for whoever decides: the
photographic look is **opt-in** (`ui.photographicLook` defaults off), so blast radius is limited to users
who chose it; and **every `medium` + photographic figure in this arc was measured without the vignette**,
so adopting it re-bases those numbers.

## (n) HQ-LAMBERT-CEILING — ✅ FIX 1 SHIPPED v0.31.5.253; fix 2 ✅ DECIDED 2026-09-04, see (z)13: fix

**The shipped HQ path-traced still renders the ceiling as a mirror.** It reflects the window, the AC
unit, the curtain rail and the ceiling fan. The rasterised viewport over the identical crop is clean
matte grey with a smooth gradient and no reflection at all.

| surface | material | raster | traced (251 samples) | raster / traced |
| --- | --- | --- | --- | --- |
| wall plaster, d = 1.2/2.4/3.0 m | `MeshStandardMaterial` rough 0.92 | 129.0 / 131.2 / 131.9 | 131.7 / 131.5 / 131.8 | ≤ 2 % |
| **ceiling**, d = 0.6/1.2/1.8 m | **`MeshLambertMaterial`** | 112.7 | 150.3 | **+33 %** |
| rug | `MeshPhysicalMaterial` rough 0.95 | 218.0 | 115.9 | −47 % |

**Cause, exactly.** The ceiling is `MeshLambertMaterial` — **14 meshes** — a legacy non-PBR material with
**no `roughness` and no `metalness` field**. The HQ renderer is a PBR path tracer, so it has to interpret
that, and interprets absent roughness as **0**: a mirror. Every surface where the two renderers agree to
2 % is `MeshStandardMaterial` with an explicit roughness.

`MeshPhysicalMaterial` at roughness 0.95 (the rug) still diverges by a factor 1.9 in the *other*
direction, which roughness does not explain — sheen or clearcoat interpretation is the suspect. That is
n = 1 and unresolved; it is not part of this item's fix.

### Two candidate fixes, with their blast radii

**1. HQ-scoped (recommended).** Substitute an equivalent `MeshStandardMaterial` (roughness ≈ 0.9,
metalness 0) for every `MeshLambertMaterial` while building the tracer scene. **Changes only the HQ
still.** The rasterised viewport is untouched, so every raster measurement in this arc — `%<64`, the
region ratios, the anchored wall numbers — keeps its meaning and needs no re-basing. Low risk, and it
fixes the defect where the defect is.

**2. Scene-wide.** Convert the 14 ceiling meshes to `MeshStandardMaterial` in `src/`. Arguably the more
correct material for plaster and it fixes both paths at once, but `MeshLambertMaterial` and
`MeshStandardMaterial` shade differently in the raster too (Standard adds a specular lobe and an
environment response at grazing angles), so it **changes shipped viewport appearance** and re-bases
every ceiling figure this arc has published. It also has a cost: Lambert is the cheaper shader, and the
ceiling is a full-room surface on the `performance` tier.

### Outcome (v0.31.5.253)

**Fix 1 was built, measured and shipped.** `pbrStandInFor` in `hqRenderSession.ts` substitutes a matte
`MeshStandardMaterial` for every `MeshLambertMaterial`/`MeshPhongMaterial` inside the tracer snapshot
(Phong's `shininess` mapped monotonically back to roughness). `MeshBasicMaterial` is deliberately left
alone — it is unlit by intent (window panes, screens, sky), so a PBR response would change what it is
rather than correct how it is read.

- **The mirror is gone**, confirmed by looking: the before crop shows the window's rectangle, the AC
  unit, the curtain rail and a ghost fan blade reflected in the ceiling; the after crop is clean matte
  with a smooth gradient and none of them.
- Traced ceiling **150.3 → 140.7**; the traced figures also became far more reproducible (ceiling 140.2
  at 151 samples vs 140.7 at 251, against `.251`'s pre-fix 8 % drift — specular convergence was itself a
  variance source).
- **The raster is provably untouched**: every raster anchor is identical to 0.1 count across the two
  rounds, and the frame mean is unchanged.
- Three unit tests added.

**Fix 2 is still formally open, but the measurement has largely answered it.** `.253` swapped all 14
ceiling meshes Lambert → Standard(0.9) in the **live raster** as a control:

| raster ceiling, 3 anchors | frame mean |
| --- | --- |
| `MeshLambertMaterial` (shipped) — **113.0** | 108.2 |
| `MeshStandardMaterial` 0.9 — **112.9** | 108.2 |

**0.09 % on the ceiling and no change at all in the frame mean.** So fix 2's stated cost — "changes
shipped viewport appearance and re-bases every ceiling figure this arc has published" — is measured as
negligible at this pose, and the re-basing worry was unfounded. What remains of the case against it is
only **shader cost**: Lambert is the cheaper shader and the ceiling is a full-room surface on the
`performance` tier. So fix 2 is now a **performance** call, not a look call, and it buys nothing visible
now that fix 1 has repaired the path that was actually broken. Recommendation: **don't**, unless a
separate reason to unify materials appears.

> **This item also un-retired a finding — see (o).**

## (o) CEILING-BOUNCE — ❌ WITHDRAWN v0.31.5.255: the reference was a different lighting rig

> **❌ WITHDRAWN in v0.31.5.255. Do not act on the numbers below.**
>
> `buildTracerScene` copies only `DirectionalLight`/`PointLight`/`SpotLight`. It does **not** copy
> `AmbientLight` or `HemisphereLight`, and substitutes a hardcoded `GradientEquirectTexture` for the
> environment. At the pose used throughout, the live scene carries `AmbientLight` 0.077 and
> `HemisphereLight` 0.243 — and zeroing exactly those two in the raster (`FILLOFF=1`) costs the **ceiling
> 69 %** of its luminance (120.2 → 37.7) and the **wall 34 %** (130.4 → 86.4).
>
> So the raster ceiling and the traced ceiling are lit by entirely different sources, and the 12.3 % was
> the difference between `PHOTO_GROUND_BOUNCE`-scaled hemisphere fill and
> `GradientEquirectTexture(0xbfd4e6 → 0x5a5650)` — not a measurement of missing inter-reflection.
>
> The wall-agreement "control" was not a control: the wall is also 34 % fill-lit, so its ≤ 2.6 % agreement
> across two different rigs was a coincidence of level. **An agreement is not a control unless both sides
> share a mechanism.**
>
> What survives: `.254`'s sweep table, which is a pure raster measurement of what `PHOTO_GROUND_BOUNCE`
> does. What does not: the 12.3 % deficit, the 1.053 target, and the "wrong-shaped lever" verdict that
> depended on it. `.188`'s ceiling deficit returns to **unproven** — neither established nor retired.
>
> Re-testing it needs the reference rig fixed first — see **(p) HQ-FILL-RIG**.

**`.188`'s ceiling deficit is real after all.** It was retired in `.234` for the right reason at the
time — the app's ceiling ÷ wall of 0.93 sat inside the 0.91–1.03 spread of two qualifying photographs.
But `.251` showed that comparing across rooms is invalid: falloff and ceiling brightness are properties
of the **window-to-wall geometry** first. Against a physically-based reference **in the same room**, the
deficit reappears.

Raster against the app's own path tracer, identical world anchors, `medium`, photographic look, 13:00,
standoff 4.6, pitch −0.06, 16:9, lights off, 15×15 world samples per 0.24 m patch:

| pair | raster | traced | raster ÷ traced |
| --- | --- | --- | --- |
| wall A / wall B — **control**, both direct-lit `MeshStandardMaterial` | 1.278 | 1.237–1.245 | **1.027–1.033** |
| **wall B / ceiling** | 1.109–1.115 | 0.934–0.938 | **1.186–1.189** |

**The raster's ceiling is ~16 % too dark relative to its wall** (1 ÷ 1.187 = 0.842). Absolute: ceiling
raster 112.1–112.7 against traced 140.2–140.7, so the traced ceiling is ~25 % brighter.

### Why this measurement is trustworthy where `.188`'s was not

1. **Same scene.** No pose, method, tier, framing (`.247`/`.249`) or scene (`.251`) confound — one
   camera, one set of world anchors, two renderers.
2. **A same-material control passes in the same frame.** Wall plaster (`MeshStandardMaterial` 0.92)
   agrees between the two renderers to **≤ 2.6 %** per anchor, and the wall A / wall B pair to ~3 %. So
   the traced picture is not uniformly offset — if it were, the walls would be offset too.
3. **The material control passes.** The ceiling comparison is raster-Lambert against traced-Standard,
   which looks cross-material — but swapping the live raster ceiling to Standard(0.9) moves it by
   **0.09 %** (item (n)). Lambert and Standard are indistinguishable here, so the residual is not material.
4. **The mirror artefact is removed.** `.252`'s +27 % included a specular window reflection; fix 1
   removed it and **+18.9 % survives**.
5. **Reproduced** at two sample counts (1.189 at 251, 1.186 at 151).

### What it points at

The ceiling receives almost no direct window light — the window is below it and daylight goes in and
down — so it is lit almost entirely by **inter-reflection off the floor and walls**. The rasteriser
approximates that with a hemisphere ambient plus fill, and `.226`/`.235` established that the hemisphere
ground term has **no distance dependence**. That mechanism was correct all along; `.226` simply attached
it to the wrong symptom (wall falloff with distance, refuted in `.251`). **This is the symptom it
actually produces.**

`PHOTO_GROUND_BOUNCE` (shipped at 3) exists precisely to lift the ceiling, and `.234` parked the
question of whether it still earns its keep once its motivation was retired. Its motivation is back, with
a target attached for the first time: **+16 % of ceiling relative to wall, measured, not inferred.**

### Priced in v0.31.5.254 — and the lever is the wrong shape

**Revised deficit: 12.3 %.** `.253`'s 16–19 % was measured on the room axis, where the ceiling anchor set
was unstable (a rotating fan blade intermittently occluded d = 1.2) and the wall mean included the
reveal-shadow anchor at d = 0.6. Measured on a fan-clear anchor line (`ANCHOR_OFF −0.7`), where all three
ceiling anchors read plaster on every run: **raster ceiling ÷ wall 0.923 against traced 1.053.**

`PHOTO_GROUND_BOUNCE` swept live (`GBOUNCE`), same pose/tier/framing, lights off:

| bounce | ceiling | wall | **ceiling ÷ wall** | frame mean | `%<64` |
| --- | --- | --- | --- | --- | --- |
| 1 | 92.5 | 120.2 | 0.770 | 99.3 | 18.47 % |
| 2 | 108.3 | 125.7 | 0.862 | 104.1 | 15.75 % |
| **3 (shipped)** | **120.4** | **130.4** | **0.923** | **108.2** | **13.57 %** |
| 4 | 129.9 | 134.7 | 0.964 | 111.8 | 12.21 % |
| 5 | 137.9 | 138.6 | 0.995 | 115.1 | 11.30 % |
| 6 | 144.3 | 142.2 | 1.015 | 118.0 | 10.63 % |
| 8 | 155.6 | 148.8 | 1.046 | 123.4 | 9.75 % |
| **traced target** | **139.7** | **132.65** | **1.053** | — | — |

**The target is reached at bounce ≈ 8.5, about 2.8× the shipped 3, and it costs:**

- frame mean **+15 %**,
- `%<64` **−4 points** (13.57 → ~9.5) — a real loss of the shadow depth tuned across `.163`–`.168` and
  re-checked in `.186`,
- walls **+14 %**. This is not a ceiling repair.

The term does favour down-facing normals — ×3 → ×8 gains the ceiling **+29 %** against the walls'
**+14 %** — but the efficiency is roughly **1:1**: 13 % of ratio for 14 % of overall brightness.
`look.ts` already said so in `.195`, before there was a target to check it against: *"That is what a
bounce does; it is not a targeted ceiling repair."*

### Recommendation

**Not this lever.** A hemisphere ground term brightens every surface with a downward normal component,
which is most of the room, while the traced reference says the **ceiling specifically** is 12 % short.
Closing it this way trades one calibrated quantity for another, and the transfer function above makes the
trade explicit so it does not get rediscovered.

A targeted repair needs something that separates ceiling from wall, which a hemisphere cannot do by
construction. The honest candidates are a **ceiling-specific fill term** or **real single-bounce GI**, and
both are larger than a constant retune — a feature, not a tuning round.

### The call needed

Whether a 12.3 % ceiling deficit is worth a feature-sized change at all. It is measured, it is real, and
it is the one place where the absence of inter-reflection is now demonstrated to show up — but it is
12 % on one surface, against a look this arc has spent ~70 rounds tuning, and the cheap lever has been
priced and rejected.

## (p) HQ-FILL-RIG — ✅ DECIDED 2026-09-04, see (z)13: fix (found v0.31.5.255, proven v0.31.5.256, fix built + measured + reverted v0.31.5.257)

**The shipped HQ path-traced still is not a higher-quality version of what the user sees. It is a
different lighting setup.**

`buildTracerScene` (`src/scene/pathtrace/hqRenderSession.ts`) snapshots the live scene but copies only
`DirectionalLight`, `PointLight` and `SpotLight`. `AmbientLight` and `HemisphereLight` are dropped, and
the environment becomes a hardcoded `GradientEquirectTexture` (top `0xbfd4e6`, bottom `0x5a5650`) whenever
no user HDRI is active. The existing header explains why the *PMREM probe* cannot be ingested — that part
is sound — but the consequence for the two punctual-ish fill lights was never measured.

**How much light this is.** At 13:00, `medium`, photographic look, the live scene carries `AmbientLight`
0.077 and `HemisphereLight` 0.243. Zeroing exactly those two in the raster (`FILLOFF=1`, `light-distribution.mjs`):

| | fill on (shipped) | fill zeroed | loss |
| --- | --- | --- | --- |
| ceiling, 3 world anchors | 120.2 | 37.7 | **−69 %** |
| wall B, 2 world anchors | 130.4 | 86.4 | **−34 %** |
| frame mean | 108.2 | 75.2 | −31 % |
| `%<64` | 13.56 % | 38.44 % | — |

So roughly **two-thirds of the ceiling's light and a third of the walls'** comes from lights the HQ still
does not have. What it has instead is a fixed gradient that cannot respond to:

- **the hour** — the same sky at 13:00 and 21:00;
- **the exposure grade** — `Lighting` grades `toneMappingExposure` across the day/night curve;
- **the photographic look** — including `PHOTO_GROUND_BOUNCE`, whose entire job is to lift the ceiling;
- **the user's own exposure control.**

### Proven independently by the hour test (v0.31.5.256)

`PT=1` at two hours, 152 samples each, lights **on** (point lights *are* copied), world anchors:

| raster ÷ traced | 13:00 | 21:00 | swing |
| --- | --- | --- | --- |
| **wall B** — lit by point lights, **copied** | 0.965 | 0.956 | **−1 %** |
| **ceiling** — 69 % fill-lit, **not copied** | 0.853 | 1.181 | **+38 %, inverts sign** |

Absolute: raster ceiling +50 % from 13:00 to 21:00 while the traced ceiling moves **+8 %** — its light is a
fixed gradient sky that does not know the hour. The wall moves +38 % / +39 %, in lockstep.

Two things follow. The defect is **localised** exactly where predicted — the copied-light surface tracks to
1 %, the dropped-fill surface diverges and reverses. And item (o)'s withdrawal is confirmed from the
opposite direction: a real inter-reflection deficit cannot flip sign with the clock.

Visible, too: at 21:00 the traced ceiling carries a cold blue cast from the fixed daytime sky
(`topColor 0xbfd4e6`) while the raster's is warm.

### What a fix looks like

Substituting the fill is not hard in principle — a `HemisphereLight` is analytically a gradient
environment, which is exactly the form the tracer already accepts. The candidate is to **build the
tracer's `GradientEquirectTexture` from the live `HemisphereLight`'s own `color`/`groundColor`/`intensity`
plus the `AmbientLight`, instead of from two literals.** That makes the still track the hour, the grade and
the photographic look for free, and it is a change to the snapshot only — the viewport cannot move,
exactly as with (n).

Whether the *sum* should be an environment or a mix of environment plus a constant term is the judgement:
an `AmbientLight` is not directionally the same thing as a sky gradient, and getting it wrong trades one
mismatch for another.

### Built, measured, reverted (v0.31.5.257)

The mapping was implemented as `top = Σ hemi.color·intensity + amb.color·intensity`,
`bottom = Σ hemi.groundColor·intensity + amb.color·intensity` — snapshot only.

| raster ÷ traced | 13:00 | 21:00 | swing |
| --- | --- | --- | --- |
| ceiling — before | 0.853 | 1.181 | +38 % |
| ceiling — **after** | 0.825 | 1.022 | **+24 %** |
| wall — before | 0.965 | 0.956 | −1 % |
| wall — **after** | 0.927 | 0.927 | **0 %** |

The traced ceiling's response to the hour went **+8 % → +21 %** (raster +50 %), and the traced wall's went
+39 % → **+37 %, exactly matching the raster**. Visibly, the 21:00 traced ceiling turned from cold blue to
warm cream.

**So the mapping is right in shape and worth ~14 of the 38 points — but it does not restore the
instrument.** 24 % of ceiling swing survives and the ratio still crosses unity between the two hours.

**The residual is energetic, not structural.** A `GradientEquirectTexture` lights a surface by a
cosine-weighted hemispherical integral; three's `HemisphereLight` uses a cheap `0.5 + 0.5·(n·up)` blend.
Same shape, different energy — so the residual concentrates on the ceiling, the most orientation-sensitive
surface in the room. **What (p) still needs is an energy calibration, not a different mapping.** That is a
modelling task with a measurable target (ceiling swing → 0), and it is the honest next step.

Reverted for now because it shipped alongside (q), which introduced a visible regression — see (q).

### Why this is filed rather than fixed

Same reason as (n) was: it changes shipped appearance of the HQ still, and here the correct mapping is a
real modelling choice rather than a bug with one obvious repair. **The call needed is whether to make the
HQ still track the viewport's fill, and by what mapping.**

**It also blocks measurement.** Until this is fixed the path tracer is not a valid reference for *any*
surface — the mismatch is upstream of materials, so it applies to all of them — which is what withdrew
item (o) and reduced `.252`'s per-material validity list to nothing. Fixing (p) would restore the most
useful instrument this arc has built, and would let `.188`'s ceiling deficit finally be settled either way.

**Cheap next measurement, no decision required:** render HQ stills at 13:00 and 21:00 and show how little
the fill changes while the viewport changes a great deal. That makes the defect undeniable without
committing to a mapping.

**⚠️ ESCALATED v0.31.5.286 — this is the DEFAULT path, not an edge case.** `.286` established that
`store.hdriId` defaults to **null** (`src/state/slices/uiSlice.ts:385`, asserted by
`src/state/slices/hdri.test.ts`). `hqEnvironmentUrl(on, null)` returns `hdriById(null)?.url ?? null` = null,
so `hdriUrl` reaches `createHqRenderSession` as `undefined`, so `resolveTracerEnvironment` returns null, so
`buildTracerScene` takes the `GradientEquirectTexture` branch (`hqRenderSession.ts:352`). **Every HQ render a
user produces — unless they go and pick an HDRI by hand — is lit by a hardcoded cold gradient (top
`0xbfd4e6`, bottom `0x5a5650`) instead of the scene's own lighting.** This was filed as "the tracer drops
Ambient/Hemisphere and substitutes a gradient"; it is worse than that, because it is what happens by default
on every single render. The HQ still is the app's photoreal showcase and it is not lit by the room the user
built.

**💰 PRICED v0.31.5.312 — the gradient supplies the MAJORITY of an HQ still's interior light, not a fill.**
Zeroing the gradient leaves exactly what the scene's own copied Directional/Point/Spot lights provide
(bedroom3 `PITCH=0.30`, medium tier, photographic look, hour 13, 256 samples, white room):

| | frame mean | glazing | ceiling | sidewall-L | winwall-R | lampshade |
| --- | --- | --- | --- | --- | --- | --- |
| **gradient zeroed** | **38.4** | 111.0 | 0.0 | **69.2** | **49.3** | **36.5** |
| normal, class B (correct) | 112.7 | 166.9 | 115.2 | 116.1 | 102.7 | 74.6 |

Removing it cuts the frame mean **66 %**, the interior wall **40 %**, the window wall **52 %**, the lampshade
**51 %**.

*Arithmetic caveat:* these are **displayed** counts after AgX tone mapping, and AgX is not a power curve, so no
linear "% of photons" figure is quoted — an inverse-curve guess would be the false precision `.290` was
corrected for. The drops are large enough that the conclusion does not depend on the curve.

**What the decision now looks like.** Fixing (p) is **not** swapping a wrong tint for a right one — it
**replaces the dominant light source** in every HQ still, so every existing HQ image changes substantially. The
direction is visible in the frame: with only the scene's own lights the walls read **warm, with a natural
falloff and visible plaster texture**, where the gradient's contribution is cooler and brighter. **The fix makes
HQ stills warmer and darker, and closer to the rasteriser's look** — a larger look call than this item's filing
suggested.

**🔬 SURFACE SURVEY v0.31.5.323 — the largest error is on the surface that should be DARKEST.** Seven surfaces,
one frame pair, class-B traced arm (so this is (p)'s cost, not (u)'s):

| surface | raster L | traced L | ΔL | ΔR−B | sd raster → traced |
| --- | --- | --- | --- | --- | --- |
| ceiling | 128.8 | 115.2 | −13.6 | **−6.1** | 1.6 → 1.3 |
| ceiling2 | 129.9 | 115.0 | −14.9 | −3.7 | 0.4 → 1.1 |
| sidewall-L | 133.5 | 116.1 | −17.4 | −1.0 | 3.2 → 3.0 |
| **winwall-R** | **60.0** | **102.7** | **+42.7 (+71 %)** | +1.0 | **11.6 → 1.7** |
| glazing | 173.3 | 166.7 | −6.6 | −5.4 | 7.2 → 0.5 |

(Curtain and picture-mat patches discarded on their own sd — 21.0 and 42–52 — as uninterpretable.)

1. **Plaster is uniformly 11–13 % darker** in the trace — a global level offset, tightly grouped.
2. **The ceiling is disproportionately cooled** (−6.1, −3.7) against the sidewall's −1.0, reproducing `.314` on
   two independent patches.
3. **The window wall — the only zero-sky surface — is 71 % BRIGHTER**, the opposite direction to every other
   plaster surface. The tracer **over-lights precisely the surface that should be darkest**: the signature of an
   environment term that ignores visibility of the aperture. `.301` showed these walls *are* properly shaded, so
   they are properly shaded but wrongly **illuminated**.
4. **The shading is flattened 7×** on that wall (raster sd 11.6 → traced 1.7); the glazing collapses too
   (7.2 → 0.5).

**Four checkable acceptance criteria for a (p) fix**, all pose-matched and photograph-free: raise plaster ~11–13 %,
warm the ceiling ~4–6 counts R−B, **darken the window wall by ~40 counts**, and **restore its shading gradient**.

**❌ WITHDRAWN v0.31.5.325 — the block below used a baseline in the WRONG (u) CLASS.** `.324` took its "no
ambient" values from a **class-A** frame, but in class A the ceiling is not a bounce surface, so the whole room
is darker than a true class-B no-ambient render: **sidewall 69.4 (class A) vs 100.3 (class B)**, a 31-count
understatement. With the baseline too low, both the "correct" and "actual" ambient figures were inflated. **The
redistribution ratios, the 6.8× spread, the ceiling ÷ wall explanation, and "intensity tuning cannot fix it" are
all withdrawn.**

Recomputed on a **class-B** baseline (provisional — dim-blue is not exactly zero ambient, n = 1 per class,
displayed-count arithmetic):

| surface | raster | traced | class-B base | correct | actual | ratio |
| --- | --- | --- | --- | --- | --- | --- |
| ceiling | 128.8 | 115.2 | 96.6 | 32.2 | 18.6 | 0.58× |
| sidewall-L | 133.5 | 116.1 | 100.3 | 33.2 | 15.8 | 0.48× |
| **winwall-R** | 60.0 | 102.7 | **78.4** | **−18.4** | 24.3 | **impossible** |
| glazing | 173.3 | 166.7 | 115.4 | 57.9 | 51.3 | 0.89× |

The window wall's implied correct ambient is **negative**, which cannot happen — the near-zero-ambient class-B
window wall (78.4) is already brighter than the raster's (60.0). **So its over-brightness is present with the
environment nearly removed and is NOT attributable to the gradient.** `.323`'s *observation* (+42.7 vs raster,
shading flattened 7×) stands — a direct raster-vs-traced comparison needing no baseline. Only the attribution
falls. The recomputed ratios are **not** offered as a replacement finding.

<details><summary>Withdrawn text of v0.31.5.324, kept for the record</summary>

**⚖️ AND (p) IS A REDISTRIBUTION, NOT A LEVEL ERROR — v0.31.5.324.** Subtracting `.312`'s gradient-zeroed frame
gives the *correct* ambient contribution (raster − none) against the *actual* one (traced − none):

| surface | correct ambient | actual | **actual ÷ correct** |
| --- | --- | --- | --- |
| sidewall-L — sees sky | 64.3 | 46.9 | **0.73×** (27 % short) |
| glazing — sees sky | 62.3 | 55.7 | **0.89×** (11 % short) |
| **winwall-R — sees NO sky** | **10.7** | **53.4** | **4.99×** (5× too much) |

**6.8× spread between best- and worst-served surface.** The gradient supplies roughly the right *total* in
roughly the *wrong places* — the signature of a visibility-blind environment.

**This also explains why ceiling ÷ wall could never see (p)** (`.313`, 2.8 % for a 66 % light change): that
metric compares two surfaces on the **same side** of the redistribution, both short by a similar factor, so the
error cancels in their ratio. The window wall — the other side — was never in the metric.

**🚫 INTENSITY TUNING CANNOT FIX IT.** Scaling the gradient by 1/4.99 to correct the window wall takes the side
wall from 0.73× to **0.15×** of its correct ambient — from 27 % short to catastrophically dark. **A fix must be
visibility-aware, not a coefficient.** That rules out the cheapest class of fix and should be known before the
work is scoped.

*Caveats:* displayed AgX counts, not energy, so the multipliers are directional and approximate (the
5×-vs-0.73× **contrast** is far too large to be a tone-curve artefact; the exact figures are not). And the
no-ambient frame was a class-A run, so the **ceiling row cannot be computed** and is omitted rather than
estimated.

</details>

**Note also:** `.314`'s "walls right, ceiling wrong" does not survive breadth — the *side* wall is right to 1
count, the *window* wall is wrong by 71 %. "The walls" was not a category.

**⚠️ AND ceiling ÷ wall CANNOT VALIDATE A FIX FOR THIS (v0.31.5.313).** At a matched pose the gradient-lit
tracer agrees with the scene-lit raster on ceiling ÷ wall to **2.8 %** (0.992 vs 0.965) — even though the
gradient supplies **66 %** of the frame's light. The arc's primary photographic metric is therefore a **weak
discriminator of lighting-rig fidelity**.

**✅ BUT CHROMA CAN, AND IT LOCALISES THE ERROR (v0.31.5.314).** Interior R−B against the raster (same room,
pose, pipeline and white balance):

| condition | ceiling R−B | wall-L R−B | winwall-R R−B |
| --- | --- | --- | --- |
| **raster** — scene's own lights (reference) | **+13.6** | **+5.8** | **+6.3** |
| traced class B — scene + cold gradient | **+7.5** | **+4.8** | **+7.3** |
| traced, gradient zeroed — *no ambient at all* | 0.0 (void) | +8.3 | +15.1 |
| traced class A — (u) biting | −14.4 | −8.5 | −6.2 |

**(p)'s chroma error is concentrated on the CEILING** — 6.1 counts too cool (+7.5 vs +13.6) — while the **walls
agree with the raster to ~1 count**. Much more precise than "66 % of the light is wrong".

**⚠️ CORRECTION TO `.312`'s FIX DIRECTION.** `.312` said the fix makes stills *"warmer and darker, closer to the
rasteriser's look"*. **Darker stands** (frame 38.4 vs 112.7); **warmer does not** — the gradient-zeroed arm is
*warmer than the raster* (+8.3 vs +5.8), so warming **overshoots** the reference. The current cold gradient is
*closer* to the raster's wall chroma than no ambient at all.

**A distinction to keep:** the gradient-zeroed arm is the **null** (no ambient whatsoever), **not** a preview of
the fix (which would supply the scene's own Ambient/Hemisphere). It prices the gradient's contribution; it does
not show what a fixed still looks like. Conflating the two is what produced `.312`'s wrong direction.

**Acceptance test for (p), no photographs needed:** traced interior chroma should match the raster's — same
pipeline, same white balance. Currently **walls pass (~1 count), ceiling fails by 6.1**.

**↩︎ CORRECTION v0.31.5.315 — chroma DOES have a photographic anchor**, just not the absolute value: **ceiling
minus wall R−B is within-frame, hence WB-invariant, and crosses to a photograph.**

| source | ceiling − wall Δ R−B |
| --- | --- |
| `Home_Staging_Beispiel` | −2.8 |
| `Vogtsbauernhof` | +1.1 |
| `At_La_Palma` | +13.6 |
| app raster | **+7.8** — inside |
| app traced, class B | **+2.7** — inside |
| app traced, class A | **−5.9** — outside |

**Weak evidence, for three stated reasons:** the band is a **16.4-count spread on n = 3** (class A misses by
3.1); `.292` already showed the quantity is **non-systematic**, tracking floor colour rather than transport;
and **pose-matching is unresolved** — `.232` showed ceiling ÷ wall luminance swings 0.68 → 0.96 on pitch, and Δ
chroma's pose-dependence is **untested**.

**The pose test was attempted and defeated by patch placement:** at `PITCH=-0.06` the fixed patches land on the
**window wall** and on the **framed picture**, caught by marking and looking. bedroom3's eye-level view has
almost no croppable ceiling. So **the raster remains the better reference for a (p) fix** — pose-matched by
construction, pipeline-identical, and reproducible across boots (a fresh run 40 min later returned
ceiling 13.6 / wall 5.8 / Δ 7.8 / ratio 0.964 against 13.6 / 5.8 / 7.8 / 0.965).

**✅ POSE CAVEAT DISCHARGED v0.31.5.316 — interior chroma is pose-ROBUST.** Tested in livingDining, which does
have a croppable ceiling at eye level. One ceiling patch, verified by marking as valid at both pitches, raster
only:

| | ceiling R−B | ceiling L |
| --- | --- | --- |
| `PITCH=-0.06` | **10.3** | 122 |
| `PITCH=+0.30` | **11.2** | 127 |
| difference | **0.9 counts** | 4 % |

`.232` established ceiling ÷ wall **luminance** swings **0.68 → 0.96** across pitch. **So chroma shifts under one
count on the axis that wrecks the luminance ratio.**

| | sensitive to the lighting rig? | pose-robust? |
| --- | --- | --- |
| ceiling ÷ wall luminance | **no** — 2.8 % for a 66 % light change (`.313`) | **no** — 0.68 → 0.96 (`.232`) |
| interior chroma | **yes** — 6.1 counts for (p), 20–28 for (u) (`.314`) | **yes** — 0.9 counts (`.316`) |

*Caveats:* same surface but not the same spot (fixed coords sample different ceiling regions per pitch); one
room, two pitches, one surface; the wall comparison is **confounded and not offered as evidence** (no single wall
patch was valid at both poses — eye-level right wall 1.0 vs pitched-up left wall 2.7, different surfaces); and
**livingDining's ceiling light appears ON** at hour 13, so its absolute values are not a daylight measurement
(both pitches share it, so the pose comparison stands).

**So (p) has a metric, a reference and an acceptance test better founded than the ratio this arc was built on.**

**📸 AND A PHOTOGRAPHICALLY-ANCHORED DEFECT v0.31.5.318 — the HQ still's ceiling is TOO FLAT.** Same-surface
ceiling luminance falloff, `far ÷ near` from the aperture:

| source | far ÷ near |
| --- | --- |
| `Vogtsbauernhof` | 0.765 |
| `At_La_Palma` | 0.844 |
| `Home_Staging_Beispiel` | 0.895 |
| **app raster** | **0.862** — inside |
| **app traced, class B** | **0.974** — **outside, too flat** |
| app traced, class A | 1.009 — no falloff at all |

References agree in **sign** (unlike chroma's 47-count sign-flipping spread on the same patches), and the metric
separates the rigs by **0.11** where ceiling ÷ wall gave 2.8 %. **The HQ still does not show enough falloff away
from the window** — (p)'s cost stated against real photographs, which `.313`/`.314` could not do.

*Precision:* patch sds 0.5–1.1 except the raster's far patch at 9.6 (nearby cornice gradient); with ~12,500 px
the SE is ≈0.09 counts, so the ratio is good to ~0.001.

**❌ THE BAND COMPARISON IS WITHDRAWN v0.31.5.319 — the metric is pose-dependent.** Across three pitched-up
bedroom3 poses the raster reads **0.847 / 0.862 / 1.059** at pitch **0.15 / 0.30 / 0.45** — a **0.21 swing
crossing 1.0**, wider than the photographic band itself, and the pose with the *cleanest* far patch (sd 1.3 vs
21.5 and 9.6) gives the most extreme value. So *"the HQ still's ceiling is too flat against real photographs"*
is **not supported**.

Two further problems found: `.318`'s `near` patch was **never physically placed** (re-placing it at the
window-wall junction shifts the 0.30 figure **0.862 → 0.912**, a third of the band's width), and the `far` patch
**straddles the cornice gradient at shallow pitch** — the poses where the metric looked best are where its far
patch was worst.

**What survives:** the **raster-vs-traced separation at a matched pose (0.862 vs 0.974)** — pose-matched by
construction. The working tracer does show less ceiling falloff than the app's own raster; photographs do not
adjudicate it.

**✅ CONFIRMED BY DIRECT OBSERVATION v0.31.5.287.** Temporary instrumentation in `buildTracerScene` (added,
observed, reverted; `src/` verified clean) logged the branch actually taken on the default shipped path:

```
[PROBE] buildTracerScene: hdriUrl=undefined env=NULL -> gradient fallback
```

Observed on two independent runs, one in each of item (u)'s two states. This is no longer an inference from
default values. **The next step on (p) is a real `src/` fix — feed the tracer the scene's own lighting instead
of the hardcoded gradient — which is a look-and-cost call and is not being made unilaterally.**

### ⚠️ (p) IS TWO FAULTS, NOT ONE — and a faithful substitute already exists in the scene (v0.31.5.326)

**The tracer is not missing a faithful environment. It has one and does not look at it.** Measured in the
running app (`ENVDUMP=1`, default state, medium tier):

| slot | ctor | render target? | mapping | image | passes `isReusableEquirectEnvironment` |
| --- | --- | --- | --- | --- | --- |
| `scene.environment` | CubeTexture | **yes** | 301 | Array | **no** — correctly, per the documented reason |
| `scene.background` | **CanvasTexture** | no | **303 equirect** | **canvas 1024×512** | **yes** |

`scene.background` is the hour-aware sky the raster shows through every window in the same frame.
`resolveTracerEnvironment` never evaluates it: it returns at `if (!hdriUrl) return null` before inspecting the
live scene (and `hdriId` is null by default), and even inside the HDRI branch it tests only
`live.environment`.

**Latent bug found on the way.** Passing that predicate is **not sufficient**. Handing the background over
directly gives **0 samples, no tracer canvas, no error** — `EquirectHdrInfoUniform` builds its CDFs from
`const { width, height, data } = map.image`, and an `HTMLCanvasElement` has no `data`.
`isReusableEquirectEnvironment` only tests `t.image` for truthiness. Unreachable today (only an `RGBELoader`
DataTexture gets there), but **a canvas-backed equirect would pass the check and silently kill HQ rendering** —
worth fixing before anyone extends the HDRI path.

**The candidate fix, priced.** Convert the canvas to a `Float32Array` `DataTexture`, sRGB→linear. bedroom3
`PITCH=0.30`, medium, photographic look, hour 13, 16:9, 256 samples, ai-denoised:

| patch | raster | hardcoded gradient | converted background | error removed |
| --- | --- | --- | --- | --- |
| ceiling | 129.4 | 115.0 (−14.4) | 125.2 (**−4.2**) | 71 % |
| sidewall-L | 134.5 | 116.9 (−17.5) | 121.7 (**−12.8**) | 27 % |
| winwall-L | 115.2 | 107.9 (−7.3) | 110.9 (**−4.3**) | 41 % |
| **winwall-R** | 70.0 | 105.8 (+35.8) | 106.0 (**+36.1**) | **0 %** |

**The sky-blind wall does not respond** — 0.3 counts against sd 1.6. Replacing the tracer's dominant light
source wholesale leaves the frame's largest error untouched. This **independently confirms** `.325`'s
withdrawal-driven conclusion by a route needing no baseline. So (p) splits:

1. **a plaster-wide deficit** on sky-facing surfaces — largely explained by the environment, and largely fixed
   by converting it;
2. **a sky-blind-wall excess** — unexplained, unaffected by the environment, cause still unidentified.

**What the conversion does NOT fix: chroma.** Ceiling R−B runs 11.9 (raster) → 7.8 (gradient) → **0.7**
(converted sky) — *cooler*, not warmer. The app's warmth is a white-balance tint on the analytical hemisphere
and ambient, and `buildTracerScene` drops both. **No environment can restore light that was never copied.**
That is (p)'s other half and it is untouched.

**Ceiling figure verified against (u).** `.325`'s class discriminator was calibrated under the gradient this
replaces, so it does not apply. `.305`'s acceptance test does (within-condition): `HIDECEIL=1` under the *same*
converted environment reads ceiling **114.7** vs run C's **125.2**, 10.5 counts at sd 1.4–1.6 → class B,
rendering as a surface, **−4.2 stands**.

**Still not decided unilaterally.** `src/` reverted and verified byte-identical to HEAD. Three separable calls
for the user: (1) ship the environment conversion (a look change — the HQ still gets brighter and cooler on
plaster); (2) tighten `isReusableEquirectEnvironment` to require `image.data` (a pure correctness fix, no look
change); (3) the sky-blind-wall excess needs its cause found before it can be fixed at all.

### (p)'s second fault: floor bounce REFUTED, and the raster may be the wrong reference for it (v0.31.5.327)

`.326` split (p) into a plaster-wide deficit and a **sky-blind-wall excess** (+35.8, unresponsive to replacing
the environment). The leading candidate for the excess — genuine path-traced **floor bounce** the rasteriser
cannot produce — is **refuted**.

Paired renders, dye verified landed (77 upward-facing meshes, found geometrically), both arms class B:

| patch | undyed | dyed H1 | dyed H2 | Δ |
| --- | --- | --- | --- | --- |
| **winwall-R** | 105.8 | 99.8 | 99.5 | **−6.1** |
| sidewall-L | 116.9 | 110.1 | 108.1 | −7.8 |
| ceiling | 115.0 | 104.2 | 103.5 | −10.9 |

Cutting floor reflectance ~60 % moves the sky-blind wall **6 counts out of a 36-count excess**. Real null, not a
weak intervention: the hue follows the dye on all three surfaces, and the **ceiling drops most**, the sensible
ordering. Too small and too evenly spread to be winwall-specific.

**The control gave a positive finding: the raster's walls and ceiling are floor-independent** — byte-identical
with the floor dyed dark navy. The rasteriser has **no floor-bounce term** for these surfaces.

**Which reframes the fault, and this is the part that bears on the decision.** winwall-R is **coplanar with the
aperture**: no sky, no direct sun, so **bounce is its only physical light source** — and the raster has no
bounce mechanism. Its 70.0 comes entirely from a non-directional analytical fill that is not modelling the
light path at all. So `.323`'s "the tracer's largest error is on the surface that should be darkest" **may have
the sign backwards**: the 36 counts may be largely the *raster's* deficit.

This does not resolve which renderer is closer to correct. `.320`'s construction (the app against itself at a
matched pose) remains the only one available — but **"only available reference" is not "correct reference"**,
and on a bounce-only surface the raster is structurally incapable of being right. **Anyone deciding (p) should
not assume the traced sky-blind wall needs bringing down to the raster's value.**

### ⚠️ (p)'s second fault is probably NOT a tracer fault — the raster has zero interreflection (v0.31.5.328)

**The rasteriser has no interreflection at all.** With **1062 meshes dyed near-black** (every surface except the
window wall's own plane), the raster's window-wall patches are **byte-identical to the decimal** — 70.0 and
115.2 — while the dyed ceiling reads 0.0, proving the dye landed. Raster wall luminance is a pure function of
the analytical lights and is wholly independent of scene albedo.

**The traced window wall is bounce-dominated.** Class B, dye verified:

| patch | undyed | all bounce surfaces dyed | change |
| --- | --- | --- | --- |
| **winwall-R** | 105.8 | 34.4 | **−67 %** |
| winwall-L | 107.9 | 16.4 | **−85 %** |

**winwall-R is coplanar with the aperture: no sky, no direct sun, so bounce is the only light that physically
reaches it.** The tracer models that light; the rasteriser substitutes a non-directional fill for it. So the
+36-count gap is most likely the **raster's deficit**, and `.323`'s "the tracer's largest error is on the
surface that should be darkest" is **retired**.

**What this means for the decision.** The assumption baked into every round from `.323` on — that where the two
renderers disagree the raster is the value to move toward — is unfounded on a bounce-only surface. **Do not
"fix" the traced sky-blind wall by bringing it down to 70.0.** That would be tuning a renderer that has a
mechanism to match one that does not.

It does **not** follow that the trace is correct: its absolute level is unvalidated and nothing in this arc can
photographically anchor it (`.320`). The honest position is that (p) has **one** confirmed fault — the
plaster-wide deficit, fixable by converting the scene's own sky (`.326`) — and that the second apparent fault
is a raster limitation showing up in a raster-referenced comparison.

## (q) HQ-GLAZING-OPAQUE — ✅ DECIDED 2026-09-04, see (z)13: fix; fix works but is INCOMPLETE ALONE (found v0.31.5.256, built + reverted v0.31.5.257)

**The HQ path-traced still renders the window glazing as an opaque panel.** Compared at native resolution,
21:00, same pose:

| | raster (viewport) | traced (HQ still) |
| --- | --- | --- |
| grille | ~20 vertical bars + horizontal rails, pale cream | **absent — only the cross mullion** |
| pane | near-black night sky | flat, lighter blue-grey |

**Cause.** The glazing is `MeshPhysicalMaterial#bcd4e6` with **`opacity 0.22` and `transmission 0`**.
`opacity` is a rasteriser alpha-blend concept — the raster composites it over what is behind, so the grille
bars and the night backdrop show through. A PBR path tracer has no alpha blend; it needs **`transmission`**
to see through a surface. With `transmission: 0` the pane is simply an opaque diffuse surface, so it hides
everything behind it and reads as a panel.

**This bears directly on item (l) WINDOW-LUMINANCE**, whose subject is the window reading *"as a panel
rather than an opening"*. In the HQ still it literally is one.

### The fix, and the judgement in it

Snapshot-only, same family as (n): when cloning into the tracer scene, give an `opacity`-transparent
material a `transmission`-based stand-in (roughly `transmission = 1 − opacity`, `opacity = 1`,
`ior ≈ 1.5` for glass). The viewport cannot move, since the live materials are untouched.

The judgement is that `opacity` and `transmission` are not the same thing physically — alpha blending is a
compositing trick, transmission is refractive transport, and a mapping between them is an approximation
chosen for looks. It also interacts with `depthWrite: false` on the 61 `MeshBasicMaterial` overlay planes
(see below), so a blanket rule is riskier than it looks. **The call needed is whether to map opacity to
transmission in the snapshot, and with what rule.**

### Built, measured, reverted (v0.31.5.257) — and it cannot be fixed in isolation

`transmission = 1 − opacity`, `ior 1.5`, applied in the snapshot to Standard/Physical materials with
`opacity < 1` and `transmission 0`. **It works: the window grille is fully restored in the HQ still.**

**But making the glass see-through also exposes whatever the tracer has behind it — and that is not the
viewport's backdrop.** At 21:00 the still went from an opaque pale panel to a **pale daylight-blue sky**,
where the viewport shows a near-black night pane. One visible defect traded for another.

So the decision is larger than first filed: **restoring transmission requires settling what the tracer puts
behind glass at the same time.** The sky sphere is `MeshBasicMaterial` and the snapshot also sets
`root.background` to the derived gradient, so which of the two a refracted ray should see is the open
question. Fixing (q) alone is not an option.

*Implementation note for whoever takes it:* `MeshPhysicalMaterial.copy(source)` reads Physical-only object
fields off the source (`clearcoatNormalScale` is a `Vector2`), so copying from a plain
`MeshStandardMaterial` throws `Cannot read properties of undefined (reading 'x')` — and the scene has seven
transparent Standard materials beside the glazing. Clone when the source is already Physical; construct
explicitly when it is not.

### Two related snapshot infidelities, same function

- **Instanced geometry is dropped.** `buildTracerScene` skips `isInstancedMesh` outright — **17 meshes,
  231 instances**. *Expanding to per-instance clones was implemented in `.257` and worked (231 expanded);
  it reverted only because it shipped with the rest.* Measured consequence is small: hiding exactly those in the raster changes **0.16 %** of
  pixels (765 of 480 000). Worth fixing (expanding to per-instance clones is trivial), low priority. *Noted
  because I first assumed these were the missing grille bars; the pixel diff disproved it.*
- **Ten fully invisible planes may be rendering as solid.** 61 `MeshBasicMaterial` planes are transparent
  via opacity, **ten at `opacity 0.00`** with `depthWrite: false` — invisible in the raster. Basic is copied
  untouched (`.253` deliberately did not substitute it) and opacity is not honoured, so they may be solid
  surfaces in the still. A plausible cause of the faint curved streaks visible across the traced ceiling.
  **Hypothesis, not isolated.** *Excluding `transparent && depthWrite === false` was implemented in
  `.257` and skipped 61 planes cleanly; also reverted only because it shipped with the rest.*

## (r) BACKDROP-LOWPASS — ✅ DECIDED 2026-09-04, see (z)10: ship (found .264; proven RECOVERABLE .265)

**The app ships four exterior backdrops — `city`, `dusk`, `park`, `hills` — and almost none of their
content reaches the window.**

The source assets are good. Dumped straight off `scene.background`, `city` is a **2048×1024** crisply drawn
stylised skyline: blocks with clearly defined windows, sharp edges, good contrast against blue sky, entirely
legible. What appears through the glazing is **faint blue-grey blurred blobs** — just enough to tell
something building-shaped is out there, reading as patterned glass rather than a view.

Measured on the world-verified glazing population (n = 413), 13:00, `medium`, photographic look, canonical
pose:

| backdrop | source | glazing mean | sd | **spread** | mid-tone |
| --- | --- | --- | --- | --- | --- |
| `sky` (default) | 1024×512 procedural | 161.4 | 17.4 | **55** | 100 % |
| **`city`** | **2048×1024 skyline** | 172.0 | 18.8 | **58** | 100 % |
| `park` | 2048×1024 | 157.5 | 20.7 | **65** | 100 % |
| *photograph, one pane* | | | *33.7–37.7* | ***90–95*** | *36–44 %* |

**A crisp 2048×1024 city buys 3 points of spread where the target needs 35.** Sharp input, mush output — so
the loss is in the **path**, not the asset.

### Cause

`.263` established it: three converts an equirect `scene.background` into a **CubeUV/PMREM**, which is
pre-filtered by construction, so the background path cannot carry high-frequency detail. `SceneBackdrop.tsx`
configures every preset and every user upload as an **LDR equirectangular** background, so all of them go
through that filter. `scene.backgroundBlurriness` is 0 — the blur is not deliberate.

### Why this matters more than it looks

1. **It is a viewport defect, not an HQ-still one.** Any user who picks a backdrop and expects to see it is
   affected, in ordinary use.
2. **It changes the cost/benefit of item (l)'s structural route completely.** `.263` implied new content
   would be needed for a window that reads as an opening. It would not — **the content already exists and is
   good.** What is needed is a path that preserves it, which would unlock all four presets at once, for every
   user, without authoring anything.
3. **The custom-upload path is affected identically**, since it uses the same `configureBackdropTexture`.

### v0.31.5.265 — the blur is 100 % recoverable, and it cannot be tracked by number

Rehosting the same backdrop canvas in a fresh texture with **`UVMapping`** instead of
`EquirectangularReflectionMapping` removes the CubeUV step. The window then shows a **legible city
skyline** — individual buildings, visible window grids, a clear roofline — against the faint blobs of the
shipped path, same asset, same pose, same frame.

**So the loss is entirely the pre-filter and the content survives to the GPU intact.** The fix space below
is real, not speculative.

`UVMapping` is **not** a candidate fix: a flat screen background has no parallax and is not projectively
correct through a window.

**⚠️ This defect cannot be verified numerically — established as STRUCTURAL in v0.31.5.266.** Twelve
candidate metrics were calibrated against the ground-truth pair (illegible vs legible, same asset, same
pose). Only a 16–64 px difference-of-Gaussians moved at all, by 20 %, which is less than this arc's metrics
move from pose and framing alone. The diagnostic: `hp8` detects a 16 px blur on the **unobstructed source**
at **13.3×**, and the identical change through the window at **1.05×** — because the rendered window's
high-frequency energy (`hp8` ≈ 0.12) is about **twice the entire source image's** (≈ 0.063), so backdrop
detail is a few percent of what any high-pass sees. **Assess a fix here by looking; no available number can
confirm it.** Measured across that transformation:

| metric | equirect (blobs) | UVMapping (legible city) |
| --- | --- | --- |
| glazing spread p95−p05 | 56 | **50** (worse) |
| glazing sd | 18.6 | **15.9** (worse) |
| mid-tone fraction | 100 % | 100 % |
| glazing micro-contrast | 0.0820 | 0.0817 |

Spread and sd measure **dynamic range, not detail**; micro-contrast is **swamped by the ~20 grille bars**,
which are identical in both frames and dominate the high-frequency band. **Any fix here must be assessed by
looking** — a number that cannot see the defect cannot confirm the repair.

### The fix space

Not a tuning change, which is why it is filed rather than taken:

- **Render the backdrop as geometry** — a large textured shell (or a screen-facing quad at distance) sampled
  directly rather than via `scene.background`, bypassing the CubeUV conversion. Correct parallax, full
  sharpness; costs a draw call and needs care with the sky dome and the HQ snapshot.
- ~~**Keep `scene.background` but supply a cube texture**~~ — **❌ REFUTED, `v0.31.7.132`.** Tested on
  the existing `city` preset without re-authoring anything: `equirectToCube.ts` resamples the same
  canvas into six 512 px faces (matched resolution — a face spans 90° where the equirect spans 360°,
  so both are 5.7 px/degree) and `?bgCube=1` hosts it as a `CubeTexture`. The glazing definitely
  changes (window-crop mean |diff| **7.34**, 57.2 % of channels), so the path is live — and the view
  is **equally blobby**. Judged by looking, as this item requires. The premise that a cube background
  escapes the pre-filter does not hold, so the route is closed and the presets never needed
  re-authoring to find that out.
- **Accept it and document it** — the presets become mood tinting rather than views, which is arguably what
  they are today.

**The call needed:** whether a legible exterior is wanted, and — with the cube route refuted — whether
to pay for **backdrop-as-geometry** or accept the presets as mood tinting. It touches the
render path and shipped appearance for every backdrop user.

## (s) ALBEDO-FILL — ✅ DECIDED 2026-09-04, see (z)11: ship luminance-only (built .271, falsified on hue .272)

**The app has no colour bleed at all**, established across three rounds with one-variable A/B designs:

| round | result |
| --- | --- |
| `.268` | repaint the ceiling vivid orange → the wall's hue moves **exactly 0.0**. Real transport would move it. |
| `.269` | the same A/B **inside the path tracer** moves it **+17.7 / +19.0** counts of R−B |
| `.270` | with the shipped, user-selectable `wall-paint-terracotta`, real transport warms the ceiling **+8.8 to +13.5** and **darkens it 16–20 %**; the rasteriser changes it by **0.0 counts and 0.2 %** |

In user terms: **paint a feature wall dark in this app and the rest of the room does not notice.** In a real
room a dark wall makes everything darker and warmer, which is most of what choosing a dark paint does.

### The candidate fix

Scale the **fill lights** (`AmbientLight` + `HemisphereLight`) per channel by the **room's area-weighted
average albedo**, in the interreflection form **ρ/(1−ρ)**. Calibration-free — only the ratio between two
rooms is ever applied.

Scope is critical: a whole-flat census (2186 m²) barely moves when one room is repainted and predicts a
2.6 % darkening against a measured 16–20 %. **Bounce is local**, so the census must be room-scoped (467 m²
here).

| fill model | per-channel scale | Δ L | Δ R−B | recovered |
| --- | --- | --- | --- | --- |
| single bounce (ρ) | 0.9405 / 0.8960 / 0.8813 | −3.8 % | +2.6 | ~20 % |
| midpoint | 0.8446 / 0.7605 / 0.7466 | −8.4 % | +5.1 | ~45 % |
| **interreflection ρ/(1−ρ)** | **0.7487 / 0.6250 / 0.6119** | **−14.1 %** | **+7.9** | **~75 %** |
| *traced target* | | *−18.3 %* | *+10.8* | |

**~75 % of the real response, from a per-channel scale on two lights that already exist.** No probes, no
irradiance volume, no extra draw calls — which matters, because `src/scene/CLAUDE.md` records an irradiance
volume as spiked and **rejected** at 6.19 ms for 420 probes.

**Looked at:** the tinted room is warmer and slightly darker, and reads as coherently lit *by* its terracotta
walls rather than unaware of them. Natural, not dingy. The window is correctly unaffected.

### v0.31.5.272 — tested on a cool finish: energy right, hue WRONG-SIGNED

`.271` was validated on one **warm** finish. The shipped `navy` (`#3b4a63`) is cooler *and* much darker, so
ρ/(1−ρ) is far more sensitive — the strongest test available.

**The traced target is counterintuitive: a navy wall makes the ceiling WARMER** (ΔR−B +3.0 / +5.4 / +4.1)
while darkening it (−20.5 / −22.3 / −17.5 %). The dark wall absorbs the **blue sky bounce** that previously
cooled the ceiling, so what remains is more dominated by the warm direct sun. The room gets bluer; the
ceiling gets warmer.

| | Δ model | Δ traced target | verdict |
| --- | --- | --- | --- |
| luminance | −19.4 / −18.0 / −17.6 % | −20.5 / −22.3 / −17.5 % | **~90 % recovered** |
| hue R−B | **−2.9 / −2.8 / −2.6** | **+3.0 / +5.4 / +4.1** | **wrong sign** |

**Diagnosis.** The model tints by the room's **reflectance** colour ("the room is bluer, so the bounce is
bluer"). Real transport is governed by what is **removed** ("the wall absorbs the blue sky bounce, leaving
the warm sun"). Those agree for terracotta and oppose for navy — so `.271`'s ~75 % was partly luck, and the
model was never capturing hue, only agreeing with it by accident on the one case tested.

### ⚠️ v0.31.5.273 — the albedo census is TEXTURE-BLIND, so the scalars above are approximate

The living/dining floor mesh is `color: #ffffff, map: true` — **its albedo lives entirely in a texture**, and
its `material.color` is identical under every floor finish. The census reads `material.color`, so it counts
the floor as pure white when it is actually mid-brown oak.

Sized honestly: the floor is **8.3 %** of the room's 467 m², so counting it white instead of the catalogue's
oak swatch `#b88f5d` inflates ρ by ~0.046 — and because it inflates **both** arms, most of it cancels in the
ratio:

| | census ρ | corrected ρ |
| --- | --- | --- |
| white walls | 0.8115 / 0.8067 / 0.7876 | 0.7885 / 0.7704 / 0.7351 |
| terracotta | 0.7632 / 0.7228 / 0.6941 | 0.7402 / 0.6865 / 0.6416 |
| navy | 0.7027 / 0.7010 / 0.6941 | 0.6797 / 0.6647 / 0.6416 |

Terracotta's ρ/(1−ρ) ratio moves **0.7487 / 0.6248 / 0.6119 → 0.7642 / 0.6526 / 0.6451** — a few percent,
not a factor. **The 77–90 % luminance recovery survives; the scalars are approximate and must not be treated
as final.**

**Implementation note:** a correct census should read the **finish catalogue's `swatch`** — which exists for
every material (`floor-wood-oak` `#b88f5d`, `floor-tile-white` `#e6e3dc`, `floor-wood-ebony` `#43342a`) —
rather than `material.color`. More accurate than reading colours off materials, and cheaper than averaging
texture maps.

**A SECOND census flaw — exposure weighting (v0.31.5.274).** `FLOOREXPOSED=1` casts 3600 rays straight down
over the room rect: the floor is **56.0 %** exposed, with the sofa 8.0 %, the rug 7.4 % and furniture ~15 %
covering the rest. So the floor's contribution must be weighted: 38.6 m² × 0.56 = **21.6 m² effective, 4.6 %
of the room's 467 m²**, not the 8.3 % used. This pushes the same way as the texture-blindness — `.271`
over-weighted the floor twice over.

**A THIRD correction — illumination weighting (v0.31.5.275).** The floor's finish was swapped from
`floor-tile-white` to `floor-wood-ebony`. World-verified floor anchors show the **traced floor darkened
61–64 %** (d = 1.6: 74.9 → 29.1; d = 2.8: 113.9 → 41.4), while the **traced ceiling moved +0.3 / −0.1 /
−0.3 %** — a >200× ratio. **The floor contributes on the order of 1 % of the ceiling's light.**

Not because it is hidden (it is 56 % exposed) but because it is **dim**: even white-tiled it reads L 74.9–113.9
against a ceiling at ~159. A poorly-lit surface bounces little whatever its albedo.

**So the census needs three fixes before its scalars mean anything:**

1. **swatch-based albedo** (`.273`) — read the catalogue `swatch`, not `material.color`;
2. **exposure weighting** (`.274`) — weight by unoccluded fraction (floor: 0.56);
3. **illumination weighting** (`.275`) — weight by the light actually *leaving* each surface.

The third is the physically correct form: bounce is governed by a **radiance**-weighted average, not a
reflectance average. It is also the largest of the three for the floor, which carries 4.6 % of
exposure-weighted area but ~1 % of the ceiling's light.

This also explains why `.271`/`.272` worked despite a flawed census: they changed **walls** — bright,
well-exposed and untextured, the one case where a naïve reflectance census is close to right. None of the
three corrections overturns the luminance *ratio* result, which largely cancels them.

**Still untested: the brightening direction.** Both validated points *lowered* ρ, and ρ/(1−ρ) rises steeply
as ρ → 1, so a lighter room is where the model might over-predict badly.

*Correction:* `.273` reported a floor-finish A/B as void, claiming the render never got the finish. **That was
wrong** — `.274` found the pitched-down frames differ unmistakably (pale tiles vs dark planks); `.273` had
read the eye-level frame, where the floor is almost entirely occluded. Why the *traced ceiling* barely moved
across that swap is still **unexplained**.

### RECOMMENDED FORM — a scalar grey fill scale (validated at three finishes, v0.31.5.276)

Apply a **scalar** grey scale from ρ/(1−ρ). Validated across warm, cool and green finishes:

| finish | scalar | luminance recovered | hue recovered | hue sign |
| --- | --- | --- | --- | --- |
| terracotta | **0.650** | ~78 % | ~7 % | **right** |
| navy | **0.563** | ~90 % | ~23 % | **right** |
| forest | **0.574** | ~89 % | ~20 % | **right** |

**The scalar gets the hue sign right at all three**, because darkening a cool fill lets the warm sun dominate
— which is *the same mechanism as the real effect*. The **per-channel** version is right-signed only for
terracotta (`.271`) and **wrong-signed** for navy (`.272`) and forest (`.276`), because it encodes the
reflectance colour rather than the colour of the light being removed.

**So the cheaper model is the better one:** simpler, no hue risk, 78–90 % of the luminance, and 7–23 % of the
hue for free and in the right direction. Most of the hue effect remains unmodelled — but it is no longer
modelled *wrongly*.

### ~~⚠️ v0.31.5.277 — ROOM-DEPENDENT~~ → ❌ WITHDRAWN v0.31.5.280 (unconverged traced target)

> **❌ WITHDRAWN in v0.31.5.280.** The bedroom's white-walled traced still was **not converged at 150
> samples**: traced L 175.4/181.1 at 150, against 120.1/118.0 at 250 and 118.6/117.3 at 256 — the two higher
> counts agreeing within 1.3 %, and 150 high by **31–35 %**. Looked at, the 150-sample still is uniformly
> washed out and flat while the 250-sample one shows cornice, ceiling tone and curtain detail: systematic,
> not noise. The navy arm was stable throughout (within 1 %), so only the bright arm was bad.
>
> **Corrected bedroom target: Δ L −17 to −23 %, essentially identical to livingDining's −20.5/−22.3 %; Δ R−B
> −5.6/−6.3 (cooler, not warmer).** So there is **no measured room-to-room difference**, the "deficit
> doubles" claim is gone, and the model's own −22.1/−20.4 % at s = 0.494 is **close** to the corrected target
> — it appears well-calibrated in the bedroom too.
>
> Everything below in this sub-section, and the `.278`/`.279` under-scale factors, are withdrawn.
> **Residual risk:** the livingDining targets are also 150-sample and were spot-checked only in `.263` at a
> nearby configuration (0.4 % across 151/251). They carry the same class of risk and have not been
> re-verified at their own settings.
>
> **New rule: sample-count adequacy must be verified per room and per pose.** Convergence is slowest exactly
> where bounce dominates, so a spot-check elsewhere does not transfer. The HQ modal caps at 256 samples.

Item (s) was validated in **one** room. Re-run in `bedroom2` (aperture **27 %** of its wall against
livingDining's 71 %, ρ 0.8249/0.8100/0.7768 over 360 m²):

| | livingDining | **bedroom2** |
| --- | --- | --- |
| Δ traced L (navy walls) | −20.5 / −22.3 % | **−43.1 / −50.3 %** |
| Δ traced R−B | +3.0 / +5.4 | **+15.0 / +20.3** |
| Δ raster | 0.0 | 0.0 |
| **scalar model recovers** | **78–90 %** | **~46 %** |

**The deficit is twice as large and the model recovers half as much.** A small room with high-albedo surfaces
has ρ/(1−ρ) = 4.7 and is interreflection-dominated: its traced ceiling is *brighter* (175–181) than the living
room's (158–161) despite a far smaller window. The raster's fill knows nothing about room size or albedo, so
its bedroom ceiling (118) matches the living room's and the shortfall grows.

**This materially weakens the proposal.** ~46 % recovery in the room type that dominates an HDB plan is a much
less attractive trade than 78–90 % in the one room with a 71 % aperture — and `.268`–`.276` all measured the
living/dining room, i.e. the best case.

The **per-channel** variant is wrong-signed again here (−4.1 / −3.8 against +15.0 / +20.3), failing in a third
room, which retires it conclusively.

*Pose caveat:* bedroom2 needed pitch +0.30 (its ceiling is not in frame at the shipped pitch in a 3.5 m-deep
room). Each Δ is internally pose-consistent so the recovery fractions compare, but absolute Δs across rooms
are not pose-matched.

### v0.31.5.278 — the LEVER is big enough; the ESTIMATOR is 2–4× wrong

The fill's share of the ceiling's light is nearly the same in both rooms (livingDining 66.9–69.7 %, bedroom2
61.4–66.9 %), so that does not explain the halved recovery. Inverting the question — using the fill-off run as
a second measured point and interpolating in the scalar — gives what the scalar *should* have been:

| room | model scalar | **required scalar** (measured, `.279`) | **off by** |
| --- | --- | --- | --- |
| livingDining d = 0.6 | 0.563 | **0.543** | 1.04× |
| livingDining d = 1.2 | 0.563 | **0.488** | 1.15× |
| livingDining d = 1.8 | 0.563 | **0.572** | 0.98× |
| bedroom2 d = 0.6 | 0.494 | **0.204** | **2.4× under** |
| bedroom2 d = 1.2 | 0.494 | **0.089** | **5.6× under** |

*(v0.31.5.279 replaced `.278`'s linear interpolation with a measured 7-point curve. The response **saturates**
— `dL/ds` falls from ~138 to ~45 across s = 0.05 → 1.0, the same tone-curve compression `.259` found at the
window — so `.278`'s estimates were optimistic: it predicted s ≈ 0.262 would give −43.1 %, and the measured
value at 0.262 is **−37.8 %**. Because the response saturates, matching a large target needs a
disproportionately small scalar, so the model's error is worst exactly where the target is largest.)*

**1. The lever is sufficient.** Zeroing the fill gives −61 to −70 %, exceeding every target measured. Scaling
the ambient + hemisphere is an adequate mechanism in both rooms.

**2. The estimator is geometry-blind.** The rooms' albedos differ by 1.6 %, so ρ/(1−ρ) returns nearly the same
scalar (12 % apart) while the required scalars differ by **2–4×**. livingDining leaks light out of a 71 %
aperture; bedroom2 retains it behind a 27 % one — and ρ/(1−ρ) cannot see that.

**The obvious fix is ruled out:** an area-weighted aperture term is the same in both rooms — the window is
5.7 % of livingDining's enclosing surface and 5.8 % of bedroom2's (assuming 2.0 m height). The missing
geometry term is not aperture *area*.

### Usable path

Because the lever is sufficient, a **per-room scalar calibrated once against the path tracer, offline, and
baked** would work. The tracer runs headlessly (`.245`) and the anchors already measure the target. That
trades an analytic model for a lookup — less elegant, considerably more likely to be right, and it sidesteps
the geometry term entirely.

**Also resolved:** the "brightening direction" is largely moot. The model is a **ratio**, so white → navy and
navy → white are the same experiment read either way, and `.272` tested it. The untested regime is ρ *above*
the shipped 0.81, which needs an all-white room (many surfaces at once), not one finish swap.

### What it does not do

It reproduces the **global** part only. It cannot produce *localised* bleed — a wall redder near a red sofa —
and `.268`'s A/B would still read ~0 for a localised source. `.270`'s configuration is global, and repainting
a wall is the common user action, but "colour bleed" in general is not fully covered.

### The call needed

Whether to ship a room-albedo-driven fill tint at all. It changes shipped appearance in **every room on every
tier** — any room whose surfaces are not near-white gets warmer/cooler and darker — and it re-bases the
`%<64` and region-ratio figures this arc is calibrated on, exactly as item (o) would have.

Untested and worth knowing before deciding: the shipped **`navy`** (`#3b4a63`) and **`forest`** (`#4a5e4a`)
finishes bleed **cool**, and only warm terracotta has been measured. One finish, one room, one pose, one
hour. A real implementation also needs the albedo census at runtime with a recompute on finish change —
cheap (a traverse), not free.

## (t) HQ-DENOISE-SHIFT — ❌ REFUTED v0.31.5.285. The AI denoise is radiometrically neutral

`.283` re-filed this claiming the AI denoise pass shifts level ~30 % and flips R−B. A proper one-variable A/B
refutes it. New `PTAI=off|on` forces the `hqAiDenoise` flag before the modal mounts, asserts the store took the
value, and reads it back after the capture (`.254`'s lesson). Same room, pose, anchors, hour, tier
(bedroom3, white, medium, photographic look, hour 13, pitch +0.30, 256 samples; runs 13:11 and 13:19 +08):

| | stage reported | traced L, d = 0.6 / 1.2 |
| --- | --- | --- |
| `hqAiDenoise` **off** | `raw-trace` | 119.3 / 117.6 |
| `hqAiDenoise` **on** | `ai-denoised` | 118.0 / 115.7 |

**1.1–1.6 %.** The denoise pass is radiometrically neutral, and the ~30 % gap `.283` attributed to it was two
runs that happened to be in different states of the nondeterminism now filed as (u). This also verifies the
`.284` stage label in both directions.

## (u) HQ-TRACE-NONDETERMINISM — 🐞 REAL; ✅ DECIDED 2026-09-04, see (z)13: keep hunting. Found v0.31.5.285; a CONTINUUM not two classes (v0.31.5.348); cause NOT yet identified

**The HQ tracer produces one of two discrete outputs from identical inputs.** Same room, pose, hour, tier,
sample count, exposure and denoise setting; the run lands in one state or the other, and they are ~45 % apart
at the anchors.

| | frameL | frameRB | anchors d = 0.6 / 1.2 |
| --- | --- | --- | --- |
| **state A** | 156.1–156.5 | **−9.7 to −9.8** (cold) | 172.1 / 175.3 |
| **state B** | 112.3–114.7 | **+3.9 to +4.6** (neutral) | ~118–120 / ~116–118 |

Two tight clusters, no intermediates in 12 runs, and `frameRB` flips sign — so a whole-frame mean is a free and
unambiguous discriminator, now printed as `PT FRAME STATE` on every run.

**It is a global exposure/environment difference, not a transport one.** A 6×4 grid over the two frames shows
**every one of 24 cells** darker in state B by a near-constant factor (~0.62–0.70) with R−B moving from
uniformly cold to neutral. Localised lighting changes do not look like that.

**What has been ruled out.**

- **Sample count** — `.284`: wall means move +5.6 % over 6 → 256 samples and <0.5 % over 120 → 256. The state
  gap is ~45 %.
- **The AI denoise stage** — item (t) above: 1.1–1.6 %, and both states occur with the same stage label.
- **Exposure** — two back-to-back runs, identical settings, both reporting `gl.toneMappingExposure = 1.38` and
  `toneMapping = 6` at modal-open *and* at Start render, landed in opposite states (13:27 → A, 13:31 → B).

**The HDRI-fallback lead is REFUTED (v0.31.5.286).** `.285` suspected the cold `GradientEquirectTexture`
fallback. It cannot be the state variable, because it is not a variable: `store.hdriId` defaults to null
(`uiSlice.ts:385`), so `hdriUrl` is `undefined` on **every** default run and the gradient branch is taken every
time. Forcing `hdriEnvironment=false` duly produced state A, but that is consistent with the branch being
constant, not with it selecting the state. The cause of (u) remains **unidentified**, and no replacement
hypothesis is offered.

**Eliminated by direct observation (v0.31.5.287), not by argument.** With a page-console listener finally
wired into the probe (it had never been):

- **tone mapping** — session opts report `toneMapping=agx` in both states. State A being brighter *and* colder
  is exactly what a missing AgX pass looks like, so this was the natural suspect. It is not missing. Refuted.
- **the environment branch** — the same `gradient fallback` line appears in a state-A run and a state-B run.
  Refuted by observation, where `.286` had only ruled it out as a constant.
- **denoise / blank-render failure** — no warnings or errors fire in either state.
- **a per-capture tile race** — `PTDOUBLE=1` recaptured one settled render three times, 5 s apart:
  `frameL=112.7 frameRB=4.0` all three times. **The state is fixed per run, not per capture**, so whatever
  selects it happens at or before render time and then holds.

**✏️ RE-DESCRIBED v0.31.5.293 — this is not a two-state fault.** The continuum-versus-binary puzzle above is
resolved, and it changes what (u) *is*:

- **Spatially local, not global.** A 3×3 grid compared cell-by-cell across frames (content controlled): within
  one mixed frame, cell (0,0) reads **+2.6** where the all-B frame reads +7.4 and the all-A frame −11.9, while
  cell (0,2) reads **−12.9** against +3.3 / −14.0. One render contains both behaviours in different regions.
  That explains binary anchors (each sits in one region), the continuum of frame means (the mix varies), and
  recapture stability.
- **Not per-tile.** `tracer.tiles` is 3 at 1920×1080, so a per-tile assignment would step at x = 640/1280. A
  24-column R−B profile over y = 200–500 is a **smooth gradient** with no step.
- **Both "states" share the same near-glazing asymptote (−13.8)** and differ only away from the window
  (+1.3 vs −8.6).

**So (u) is one spatially varying cold cast whose EXTENT varies between runs.** Looking settles which is
healthy: the good frame is warm on the far side and cold near the glazing with a diagonal transition across
the ceiling — cool skylight near the aperture, warmer bounce away from it. The anomalous frame is cold
everywhere at the saturated value. **The anomaly is a missing falloff, not a colour shift.**

**Also ruled out this round: camera pose.** Two runs with identical arrival (`reached [7.33,3.4]`, drift 0.37)
and identical *raster* anchors landed in opposite states — so (u) is downstream of both pose and the
rasteriser.

**A falloff-based classifier was built and reverted.** Left-third vs right-third R−B calls *every* frame
anomalous including the known-healthy one (`u1` falloff −1.8), because warm furniture in the lower third swamps
a gradient that exists only in the upper wall/ceiling band. Reverted; the profile ships as an opt-in diagnostic
(`PTPROFILE=1`) instead. `.285`'s global-mean rule stays, now documented as summarising a spatial field.

**📊 MEASURED AT n=24 v0.31.5.294 — three discrete classes, and `.293`'s description was built on the wrong
pair of frames.** Every bedroom3 traced frame from `.280` on was still on disk at the same room, pose and
finish. Upper-band (y = 0.19–0.46) left-third vs right-third R−B:

| class | n | band L | band R | falloff | frameL |
| --- | --- | --- | --- | --- | --- |
| **A** | 12 | −10.1 … −10.6 | **−12.8** | 2.2 – 2.7 | 155.7 – 156.5 |
| **B** | 10 | +6.0 … +7.1 | **+2.6 … +3.0** | 3.3 – 4.1 | 112.3 – 114.9 |
| **M** | 2 | +1.1 … +1.4 | −12.6 … −12.7 | 13.8 – 14.0 | 139.5 – 139.7 |

Frequencies **A 50 %, B 42 %, M 8 %**, each class tight to under one count across a dozen runs.

`.293` claimed both states share a near-glazing asymptote and that (u) is therefore "one spatially varying cold
cast whose extent varies". It profiled `tm-1` against `u2` — classes **M and A**, both cold on the right — and
**never profiled a class-B frame**. Class B's right band is **+2.8**. So **A and B differ globally across the
upper band** (cold throughout vs warm throughout), and only the two M frames are spatial mixtures.

Withdrawn from `.293`: the shared-asymptote claim and the varying-extent description. Retained: pose and the
rasteriser are ruled out; the per-tile hypothesis is dead; class M frames really do contain both behaviours
spatially.

**`.286`'s UNKNOWN bucket is validated** — it is what catches class M, at 8 % roughly one run in twelve, which
is exactly the single 139.5 outlier `.285` saw and `.286` reclassified.

**Cause still unidentified** — ten candidates eliminated across `.284`–`.294`, and every mechanism proposed in
that span has been refuted by a later round. The classes and their frequencies are the finding. No mechanism is
proposed.

**🔍 CONSEQUENCES AUDITED v0.31.5.295.** All ~48 saved traced frames were classified. The classifier is
calibrated on **white-walled** frames, so deliberately recoloured arms cannot be class-assigned; claims are
confined to white-finish frames at a shared pose.

| past result | verdict |
| --- | --- |
| the three floor-finish A/Bs (`ld-floor-*`, `ld-fa-*`, `ld-fb-*`) | **clean** — bands differ 0.6–2.9 counts within each pair, against ~17 between classes. Both arms same class. |
| `.281`'s livingDining "converged at 150" | **same-class artefact** — `ld-lp150`/`ld-lp250` are both class A (band L −8.4/−5.2, frameL 158.8/160.7) |
| `.277`–`.279`'s bedroom2 white-vs-navy | **class-straddled, void** — `ld-b2t` is class A (band L −9.4, band R −11.4, frameL 160.0) |
| the recoloured arms of `.269`, `.270`, `.276` | **not auditable by this method** — a deliberate finish change moves the bands the classifier reads. Status unknown. |

**The bedroom2 anomaly is finally attributed, and both earlier explanations are superseded.** `.280` blamed
sample count and withdrew `.277`–`.279`; `.284` blamed the AI-denoise swap. The saved frame shows the white arm
was simply a **class-A frame**. `.280`'s withdrawal stands; its reason and `.284`'s replacement reason do not.

**🚨 ESCALATED v0.31.5.298 — class A is PHYSICALLY IMPOSSIBLE, so this is not nondeterminism; it is half of
all HQ stills being wrong.** In a room lit only through a window, no interior surface can be brighter than the
aperture. Measured on saved frames:

| frame | class | glazing | ceiling | verdict |
| --- | --- | --- | --- | --- |
| `u1` | B | 166.9 | 115.2 | interior 51 counts below the aperture ✔ |
| `tm-1` | M | 169.5 | 127.4 | below ✔ |
| `u2` | **A** | 170.9 | **181.5** | **ceiling out-radiates the window by 10.6** ✘ |

Patch maxima agree (184 vs 173) and all patches are clean (sd 0.7–1.3). Confirmed by looking at the two crops
side by side. AgX compresses the bright end, so the radiance violation is **understated** by these displayed
values.

**Consequences.** Class **B is the correct render**; class A is a bug — which answers the "which class is
correct" question `.296` had listed as unknown. **~50 % of HQ renders (12 of 24 at one pose) are physically
invalid**, so a user pressing "Start render" has about even odds of a still whose ceiling emits more light than
its window. And **class-A figures must be discarded, not merely labelled** — `.295`'s "record the class" is too
weak; a class-A number measures an impossible render.

**Constraint on the cause, offered as a lead only.** Whatever (u) is, it adds energy to interior surfaces the
aperture cannot account for. `root.environment` lights every surface in three's IBL regardless of whether it
can see the sky, and the tracer's environment is the hardcoded cold gradient (item (p)) — which would also
explain why class A is *cold* as well as bright. **Untested. Not a mechanism.** Eleven candidates eliminated;
every mechanism proposed in `.280`–`.294` was refuted by a later round.

**This puts (u) level with (p) in priority:** both make the app's photoreal showcase wrong by default — (p)
always, (u) half the time.

**🎯 UNIFIED STATEMENT v0.31.5.303 — (u) and (v) are one fault:**

> **In roughly half of HQ renders, the ceiling is not rendered as a surface — the ceiling region shows the
> environment instead.**

Established by a black-ceiling A/B with byte-identical rasters: class B traced ceiling **1.0** (raster 0.9),
class A traced ceiling **181.5**. One wrongly-lit surface then floods the room — the *same black wall* reads
**16.1 in class A against 1.2 in class B**, 13×.

**This one statement accounts for every class-A symptom** recorded since `.285`: global brightness, the cold
cast (the grey gradient's cold top colour), `.298`'s ceiling out-radiating the aperture, `.300`'s zero-variance
saturated patch, `.301`'s albedo immunity. The "saturation", "occlusion" and "transport" descriptions
`.299`–`.300` reached for are no longer needed.

**Geometry is refuted as the cause:** the 99 wall planes are also `PlaneGeometry` and render correctly,
collapsing 7–23× with albedo. The walls are the control.

**Lead with a discriminating prediction (untested).** The ceiling's one distinguishing property in the census is
that **it is the only substituted material** — 14 Lambert planes swapped to `MeshStandardMaterial` by `.253`'s
`pbrStandInFor`, while the 99 walls are natively Standard and need no swap. The substitution is applied *after*
`root.add(clone)`, inside a promise collected in `pending`.

**❌ THE SUBSTITUTION LEAD IS REFUTED v0.31.5.304.** New probe knob `CEILSTD=1` replaces every
`MeshLambertMaterial` in the **live scene** with an equivalent native `MeshStandardMaterial` (confirmed:
`CEILSTDCHECK {"swapped":14,...}`), so `pbrStandInFor` has nothing to substitute. Identical to the decimal:

| | traced ceiling, class B | traced ceiling, class A | sidewall B / A |
| --- | --- | --- | --- |
| with substitution | 1.0 | 181.5 | 1.2 / 16.1 |
| **without** substitution | **1.0** | **181.5** | 1.2 / 15.7 |

Same magnitude, same bimodality, same frequency. Sixteenth mechanism refuted.

**`.253`'s `pbrStandInFor` is cleared** — the arc's only shipped `src/` change, which `.301` had under suspicion
because the ceiling is exactly the surface it touches. The fault survives its complete removal, and `.302`
showed it does its job correctly. **It stays.**

**What still distinguishes the ceiling from the walls:** not material type (`.304`), not geometry type — the 99
correctly-rendering plaster planes are also `PlaneGeometry` (`.301`) — not back-face orientation (`.302`), not
presence in the snapshot (`.302`). What remains is **where it is**: the topmost surface, the only large
down-facing one, the one thing between the camera and the environment when the camera pitches up.

**🎯 EXACT STATEMENT v0.31.5.305 — class A is quantitatively IDENTICAL to the ceiling not being in the scene.**
New knob `HIDECEIL=1` sets `visible = false` on the 14 ceiling planes, and `buildTracerScene` honours the
visibility chain, so they are genuinely absent from the snapshot:

| | frame L | glazing | ceiling | sidewall-L | winwall-R |
| --- | --- | --- | --- | --- | --- |
| ceiling **hidden** | 104.5 | 168.8 | **181.5** sd 0.88 | **16.1** sd 0.94 | **2.7** sd 0.66 |
| ceiling hidden (replicate) | 104.4 | 168.9 | 181.5 sd 0.88 | 15.8 sd 0.92 | 2.7 sd 0.64 |
| **class A**, ceiling present | 104.5 | 168.8 | **181.5** sd 0.88 | **16.1** sd 0.92 | **2.7** sd 0.67 |
| class B, ceiling present | 29.9 | 164.9 | 1.0 sd 0.00 | 1.2 | 0.0 |

Every figure matches, **including the standard deviations**, and the hidden case is **stable** where the present
case is bimodal.

> **In roughly half of HQ renders, the tracer renders as if the ceiling were not in the scene at all.**

**This refutes the last rival — mis-shading.** A ceiling shaded as emissive or as background would put the
right colour in the ceiling *region* but would still **occlude and still bounce**. The sidewall matches to 0.3
counts and the window wall to 0.1, so in class A the ceiling **neither occludes nor bounces**.

**Combined with `.302`** (the ceiling *is* in the snapshot — 14 planes, right geometry, colour, material,
roughness), the ceiling is **in `root` and absent from the trace**: dropped downstream of `root`, which in this
pipeline means **the BVH**. First time this investigation has pointed at a component rather than a behaviour.

**Fix-verification criterion (cheap, and worth keeping):** after any fix, the traced ceiling must never equal
the hidden-ceiling value. **One-frame detector:** the class-A signature is now known exactly, so a single run
can be classified without a second run.

**🔬 BISECTED v0.31.5.306 — the app's entire contribution is cleared; the fault is inside the tracer library.**
Temporary instrumentation censused the snapshot **at the `tracer.setScene` hand-off**:

| run | frame L | class | at `setScene` |
| --- | --- | --- | --- |
| `b1` | 29.9 | B — correct | `meshes=1104 darkPlanes=113 visible=true` |
| `b3x` | 104.4 | A — ceiling absent from trace | `meshes=1104 darkPlanes=113 visible=true` |

**Identical** — all 113 dark planes, including the **14 ceilings**, present in both classes at the last point
the app touches the scene.

| stage | verdict | round |
| --- | --- | --- |
| `buildTracerScene` populates the snapshot | ceiling present, right geometry/colour/material/roughness | `.302` |
| the Lambert→Standard substitution | removing it entirely changes nothing | `.304` |
| snapshot → `tracer.setScene` hand-off | identical in both classes | **`.306`** |
| inside `setScene` / BVH build / traversal | **← the fault is here** | — |

**This changes the item's character.** (u) is not a defect in the app's scene construction but in
`three-gpu-pathtracer`'s ingestion of a scene the app hands over correctly and identically every time. The
app's options are a **workaround** — force or verify the BVH build, await completion, rebuild on failure —
rather than a fix to its own logic. **Worth knowing before budgeting the work**, and a materially different
decision from what (u) looked like at `.285`.

**Honest limitation: `.305`'s discriminator is still unanswered.** The BVH was not readable at any path tried
(`tracer._bvh`, `tracer.bvh`, `tracer.material.uniforms.bvh.value` → all `n/a`); enumerating the tracer's keys
gives only `[rasterizeScene, rasterizeSceneCallback, _previousScene, scene]`. So the **upstream** half is
answered (input identical) and the downstream half — missing from the BVH versus present-but-not-intersected —
needs an access path into this library version's internals.

**Incidental lead, not a finding:** the tracer exposes **`_previousScene`**, so `setScene` keeps state across
calls. Each session builds a fresh tracer so it should be empty on first use, but a cache inside the component
now known to hold the fault is the first thing to inspect once the access path is found.

**🔎 DISCRIMINATOR ANSWERED v0.31.5.307 — present-but-not-contributing.** The access path is
`tracer._generator.geometry` (`PathTracingSceneGenerator` merges every mesh into one geometry and builds `bvh`
from it). 14 `PlaneGeometry` ceiling planes contribute exactly 56 vertices, so the rivals differ by an exact
number:

| run | frame L | class | merged geometry |
| --- | --- | --- | --- |
| `g307a` | 29.9 | B — correct | `positions=930573 index=984120 bvh=object` |
| `g307b` | 30.1 | B — correct | `positions=930573 index=984120 bvh=object` |
| `g307c` | **104.2** | **A** | `positions=930573 index=984120 bvh=object` |

**Identical to the integer.** The ceiling's triangles ARE in the merged geometry and the BVH IS built in a
class-A run. "Missing from the BVH" is refuted.

**⚠️ CORRECTION TO `.305`.** `.305` claimed to refute mis-shading because "a ceiling shaded as emissive or
background would still occlude and still bounce". **That reasoning is wrong:** a surface returning *exactly the
environment's radiance* sends the walls precisely what they would receive through a hole, so the two are
**radiometrically indistinguishable**. `.305`'s numbers stand; its inference does not. **Mis-shading was never
excluded.** `.305`'s statement is weakened to what the data supports: *the ceiling region and the room's bounce
are indistinguishable from a scene with no ceiling.*

**Refuted guess worth recording:** an async BVH race (`setScene` returning a promise, called without `await`,
with `session.start()` accumulating before the BVH exists) is **impossible here** — `setScene` is synchronous
unless `_buildAsync` is set, and that is set only by `setSceneAsync`, which the app never calls. Reading forty
lines of library source killed the most plausible mechanism in this investigation before it cost a run.

**❌ THE MATERIAL-INDEX LEAD IS REFUTED v0.31.5.308, statically.** The condition is effectively **always true**,
so `updateMaterialIndexAttribute` always runs: on the first call `_materialUuids === null` short-circuits it,
and `WebGLPathTracer`'s constructor itself calls `setScene(new Scene(), new PerspectiveCamera())`, so the app's
real `setScene` is the *second* call, where `changeType` is a rebuild and forces it true again.

**Latent upstream bug found while reading** (`PathTracingSceneGenerator.js:180`): `this._materialUuids.length
!== length` references a bare `length` that is **not in scope** — the intended `materials.length` is declared
three lines below, scoped to the `for` statement. In a browser it resolves to `window.length` (frame count, 0).
Benign here (it forces the update *on*), but a real defect worth reporting to `three-gpu-pathtracer`.

**Recorded so it is not re-derived:** mesh collection uses `traverseVisible` (`three-mesh-bvh`'s
`StaticGeometryGenerator`), a second visibility filter consistent with the app's; and `.304` already kills the
"async substitution order" idea, since with `CEILSTD=1` there is no substitution at all and the fault persists.

**So everything CPU-side is identical across classes** — snapshot at hand-off (`.306`), merged geometry and BVH
(`.307`), material index (`.308`). The remaining variability must be downstream, in the GPU-side upload or
shader path, which is consistent with intermittency and all-or-nothing behaviour.

**⚠️ THE SEVERITY CLAIM IS PROVISIONAL.** The playbook has a section titled *"Before calling a headless finding
a product defect, ask whether a real browser sees it"*, and (u) was called a product defect across
`.298`–`.307` **without that check**. `.308` did confirm the renderer string for the first time —
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4)`, exactly what the playbook requires, so the measurements are
real-GPU and not SwiftShader — which makes the defect considerably more likely to be real, since a real Chrome
on macOS runs the same ANGLE/Metal backend on the same GPU. But headless flags, compositor state and driver
timing remain unexcluded. **"Half of all HQ stills are wrong" holds for headless ANGLE/Metal; a real browser
must confirm it before the claim stands for users.**

**✅ DEBT PAID v0.31.5.309 — (u) is NOT a headless artefact.** New `HEADED=1` launches a real windowed Chromium
(real compositor, window surface and swap chain) rather than the headless offscreen path:

| | renderer | frame L | glazing | ceiling | sidewall-L |
| --- | --- | --- | --- | --- | --- |
| **headed** `hd1` | ANGLE Metal, Apple M4 | 104.4 | 168.9 | **181.5** sd 0.88 | 15.9 |
| **headed** `hd2` | ANGLE Metal, Apple M4 | 104.2 | 169.0 | **181.5** sd 0.88 | 15.4 |
| headless class A | ANGLE Metal, Apple M4 | 104.5 | 168.8 | **181.5** sd 0.88 | 16.1 |
| headless class B | ANGLE Metal, Apple M4 | 29.9 | 164.9 | 1.0 sd 0.00 | 1.2 |

**The fault reproduces headed, matching class A exactly — including the ceiling's sd of 0.88.**

**Severity moves from provisional to SUPPORTED.** Excluded: SwiftShader (`.308`) and the headless rendering
path (`.309`). Untested: a user's *own* Chrome — profile, extensions, default flags rather than puppeteer's
`--no-sandbox --use-gl=angle --use-angle=metal --enable-gpu`. Those flags **force the backend real Chrome on
macOS picks by default**, so they narrow rather than widen the gap. Honest position: **(u) reproduces on the
real GPU with a real compositor, and the only untested difference from a user's browser is the launch
configuration.**

Observation, not a claim: both headed runs were class A where headless is ~50/50, but at n = 2 that is
unremarkable (P ≈ 25 %). Across the dark-ceiling arm the classes stay roughly balanced.

**🧭 BOUNDED FURTHER v0.31.5.310 — clean GL state, and the fault is PER-RENDER.**

*No GL error accompanies it.* A class-A run drained `gl.getError()` either side of `setScene`: `none` both
times, `lost=false`, and no size pressure (`maxTexture=16384`; 930,573 positions need 57 rows). A failed or
clamped upload would have reported one. Twentieth candidate eliminated.

*The class flips within one page session.* New `PT2=1` clicks **Re-render** and captures a second still in the
same boot:

| | frame L | glazing | ceiling | sidewall-L |
| --- | --- | --- | --- | --- |
| render 1 | 104.4 | 168.9 | **181.5** sd 0.88 | 15.8 |
| render 2 | **29.7** | 164.7 | **1.0** sd 0.00 | 1.2 |

Class A then class B, each matching its signature exactly — the first time both classes have been produced
**back to back with everything else held constant** (same page, in-memory scene graph, dev server, wall-clock
minute, GPU, renderer string).

**Eliminates:** anything set once per page — module init, first-context state, one-time shader compilation, boot
sequence — and **slow drifts** (thermal, memory pressure, dev-server state), since both classes occurred within
three minutes in one process.

**Nuance:** each render constructs a *new* `WebGLRenderer` on a new canvas, so the two do not share a GL
context. This eliminates *page*-level state, not per-context state. "Per-render" = "per
`createHqRenderSession` call", which is the correct scope for the remaining search.

**(u) is now bounded as:** decided per `createHqRenderSession` call, on the real GPU with a real compositor,
with a clean GL state, from CPU-side inputs identical to the integer.

**📐 (u) IS THE LARGER DEFECT ON THE ARC'S OWN METRIC (v0.31.5.313).** Raster vs traced ceiling ÷ wall at a
matched pose (bedroom3 `PITCH=0.30`, white room):

| run | raster | traced | departure |
| --- | --- | --- | --- |
| class **B** (tracer working) | 0.965 | **0.992** | **2.8 %** |
| class **A** ((u) biting) | 0.965 | **1.151** | **19 %** |

Rasters identical in both runs (128.8 / 133.5), re-confirming the nondeterminism is tracer-only. So on the one
metric with photographic references, **(u) costs 19 % and (p) costs 2.8 %** — even though (p) is physically the
larger defect. *Caveat:* the photographic band (0.91–1.11, n = 4) was derived at the canonical pose and `.232`
showed the ratio swings 0.68 → 0.96 on pitch, so class A exceeding the band's upper edge is rough orientation,
not a pose-matched claim. The raster-vs-traced comparison is pose-matched.

**🎯 CHARACTERISATION CONFIRMED BY MANIPULATION v0.31.5.312.** `.303`–`.307` inferred "class A's ceiling shows
the environment" from an equivalence with a *hidden* ceiling. Changing the environment now changes the class-A
ceiling to match it — a dose-response on the suspected source rather than an inference from a coincidence:

| background | class-A ceiling |
| --- | --- |
| green (`.299`) | greenness **79.0**, above the glazing's 60 |
| grey gradient (default) | **181.5**, cold, sd 0.88 |
| **black** (`.312`) | **0.0** — a pure void, plainly visible in the frame |

It also re-confirms class A is unrelated to the ceiling's own material: a black-background void is not a shading
of `#fafafa`.

**❌ AOV/DENOISE PATH REFUTED v0.31.5.311.** `captureAovPasses` runs right after `setScene` on the same renderer
and snapshot, and only when AI denoise is armed — a good candidate, left open because `.285`'s `PTAI=off` arm
drew two class-B runs. With `PTAI=off` (AOV passes never run) one boot gave **class A then class B**, exact
signatures. Twenty-first candidate eliminated. By-products: re-confirms `.310`'s per-render finding in a
different configuration, and confirms the denoise is radiometrically neutral **in class A too** (ceiling 181.5
sd 0.88 with it off, identical to on) — `.285` had only verified class B.

**A pattern tested and killed in the same round.** Two consecutive pairs came out A-then-B, implying a
cold-first-render effect with an obvious workaround. The third pair is **A-then-A**, so *"the second render is
always correct"* is **false**.

| pair | render 1 | render 2 |
| --- | --- | --- |
| `.310` `p2a` | A | B |
| `.311` `ai1` (denoise off) | A | B |
| `.311` `ai2` | A | A |

**Tallies, quoted rather than impressions:** first renders **12 A / 5 B (71 %)**, second renders **1 A / 2 B**
(n = 3). A first-vs-second difference is *possible but not established*; both classes occur in both positions,
so position is not determinative. Note 71 % on first renders sits against the ~50 % quoted since `.294` — that
figure came from 24 frames at one pose and may deserve re-derivation now that position is a known variable.

**Assessment of further diagnosis.** Twenty-one candidates have fallen; the last five rounds each narrowed the
location without reaching the cause. What remains is inside the tracer's per-session GPU setup (shader
compilation, texture upload ordering, uninitialised state), which is not reachable from the probe without
library-side instrumentation. The item is already actionable: **acceptance test written** (`.305`),
**reproduction cheap and paired** (`.310`), **confirmed on real hardware** (`.309`). **Further diagnosis is now
lower value than a decision on the workaround.**

**Fixability without the last mechanistic step:** the requirement is already precise — the ceiling must render
as a surface in every run.

**🎯 LOCALISED v0.31.5.299 — the environment is identical in both classes; class A delivers 2.2× more of it to
interior surfaces.** Temporary instrumentation (added, observed, reverted, `src/` verified clean) set the
tracer's `GradientEquirectTexture` to **pure uniform green**, so any surface the environment reaches carries an
unmistakable cast (`green = G − (R+B)/2`) and the glazing — which shows `root.background` directly — acts as a
full-environment reference in the same frame.

| run | frame L | glazing green | ceiling green | wall-L | wall-R |
| --- | --- | --- | --- | --- | --- |
| bright class | 170.9 | 59.9 | **79.0** | 71.9 | 77.8 |
| bright class (replicate) | 170.4 | 59.4 | **79.0** | 74.5 | 79.1 |
| dim class | 128.2 | 58.2 | **36.5** | 42.0 | 43.2 |
| grey-env baseline | — | 1.1 | 1.1 | 2.1 | 2.1 |

1. **Interior lighting is environment-dominated** — greenness 36–79 against a ~2 baseline. Item (p) restated as
   a magnitude: the hardcoded gradient is the principal light on walls and ceiling, not a minor fill.
2. **The environment itself is invariant across classes** — glazing greenness 58.2 / 59.4 / 59.9, a 2.8 %
   spread spanning both. This is the control, and it is why `.287`'s "same env branch" was correct but not
   sufficient.
3. **Interior surfaces get 1.7–2.2× more environment light in class A** — ceiling 79.0 vs 36.5, replicated to
   the digit across two bright runs.

**So (u) is a variation in the TRANSPORT of environment light to interior surfaces.** That retro-explains why
class A is both brighter *and* colder (more of the cold gradient reaches the interior) and why `.298` found a
ceiling out-radiating the aperture (possible only if lit by something the aperture does not mediate).

**⚖️ THE DICHOTOMY WAS WRONG — v0.31.5.300.** The discriminating test ran on the **window wall**, which is
coplanar with the aperture and sees zero direct sky (placement verified by marking the patches on the frame,
which also corrected the `wall-R` patch used since `.298` — it is on the right *side* wall).

| | glazing | ceiling | winwall (zero sky) | winwall ÷ ceiling |
| --- | --- | --- | --- | --- |
| bright | 59.9 · L=193 | 79.0 · L=193 · **sd 0.0** | 76.0 / 78.9 | **0.980** |
| bright (replicate) | 59.4 · L=193 | 79.0 · L=193 · **sd 0.0** | 77.4 / 80.3 | **0.998** |
| dim | 58.2 · L=190 | 36.5 · L=127 · sd 1.1 | 38.5 / 46.7 | **1.168** |

**Two layered defects, not one of two alternatives:**

1. **Environment light ignores sky visibility in BOTH classes.** A wall that cannot see the sky is as green as
   the ceiling in every run (0.98 / 1.00 / 1.17). This is present in the *good* class too, so it is **not**
   (u)'s differentiator — it is a separate defect, and it belongs with **(p)**, where the tracer's environment
   handling lives.
2. **The class difference is the interior saturating at the environment's own level.** In the bright class the
   ceiling reads **L = 193 with sd = 0.0** — every pixel identical — and the glazing, showing
   `root.background` directly, also reads 193. A constant direction-independent environment term produces that;
   path-traced transport does not. The dim class reads 127 with sd 1.1.

**Consequences.** `.299`'s "2.2×" is a **lower bound** — a saturated patch cannot report how much energy
arrives past saturation. And `.298`'s physical violation is explained: the ceiling out-radiates the aperture
because it is lit to the environment's full level while the aperture's own view of that environment is
attenuated by the glazing tint.

**Sharper target for a fix:** the interior should never render at the environment's own level with zero
variance, and a zero-sky surface should never match a sky-facing one. **Why the magnitude differs run to run is
still unidentified** — thirteen candidates eliminated; no mechanism claimed.

**✅/❌ PARTLY CORRECTED v0.31.5.301.** Finding 1 above was over-claimed. Suppressing bounce (room repainted
`f5f5f0:141414;fafafa:141414`, 113 surfaces) collapses the zero-sky walls by 7–23× — sidewall-L 171 → 24,
winwall-L 164 → 9, winwall-R 161 → 7 — while the sky-facing glazing holds at 192. **Wall greenness tracks
albedo the way transport should, so there is no demonstrated occlusion fault on the walls.**

**But the ceiling did not move: 193 → 192, while every wall around it collapsed.** Same run, same scene:

| ceiling patch | value |
| --- | --- |
| **raster** | **L = 0.9** |
| **traced still** | **L = 192.1** |
| traced still, white ceiling | L = 192.7 |

**The rasteriser renders the black ceiling correctly; the path tracer renders it at 192 whether the ceiling is
`#fafafa` or `#141414`.** See item **(v)**.

**Why it matters beyond the probe.** Two users rendering the same scene get images 45 % apart in level and of
opposite colour temperature. Whichever state is correct, the other is a shipped bug.

**Consequence for this arc, stated plainly.** No round before `.285` recorded which state it was measuring, and
the two are ~45 % apart. `.284` restored `.269`–`.276` as valid raw-trace measurements; that restoration must
now be **qualified** — they are valid only if they were taken in state B, which was never recorded and is
roughly a coin flip. Every traced figure in the arc needs re-measurement with the discriminator on.

### (u) — TWO MORE MECHANISMS ELIMINATED by source inspection, `v0.31.7.145`

Both at zero runtime cost, and both were worth checking because class A's symptom — *the ceiling
shows the environment, with zero variance, immune to its own albedo* — is exactly what a **missing or
empty BVH** would produce.

1. **An unawaited BVH build — REFUTED.** `hqRenderSession` calls `tracer.setScene(snapshot, camera)`
   and ignores the return value, which would be a race if the build were async. It is not:
   `WebGLPathTracer.setScene` takes the synchronous branch unless `_buildAsync` is set (only
   `setSceneAsync` sets it), calling `generator.generate()` and then `_updateFromResults`, and
   `_updateFromResults` contains no awaits. The accumulation cannot start before the BVH exists.

2. **A stale BVH from a reused tracer — REFUTED.** `_updateFromResults` gates
   `material.bvh.updateFrom(bvh)` on `bvhChanged`, which is `result.changeType !== NO_CHANGE`, and
   `StaticGeometryGenerator` leaves `changeType` at `NO_CHANGE` unless `forceUpdate` fires. A tracer
   reused across renders could therefore keep an old BVH — and the constructor seeds it with
   `setScene(new Scene(), ...)`, i.e. **empty**, which would give precisely class A. But
   `hqRenderSession` does `const tracer = new WebGLPathTracer(renderer)` **per render**, so the mesh
   set goes 0 → ~1100 every time, `forceUpdate` fires, and `bvhChanged` is true.

**And a third, `v0.31.7.147`: renderer state carried between renders — REFUTED, along with my own
claim that the renderer is shared.** I wrote above that "the `renderer` itself is shared across
sessions"; it is not. `hqRenderSession` line 381 constructs
`new WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })` on a **fresh offscreen
canvas**, per render. I inferred "shared" from `new WebGLPathTracer(renderer)` without reading where
`renderer` came from — the same partial-read error this session has made repeatedly. Neither
`postprocessing` nor `three-gpu-pathtracer` assigns `renderer.outputColorSpace` either, so the
colour-space variant of the idea is out too.

**So the whole "state leaks between renders" family is closed.** Renderer, tracer, generator and BVH
are all constructed per render. `(u)`'s two classes cannot come from anything carried over.

**Which reframes what is left.** The remaining possibilities are:

1. **Input non-determinism** — the snapshot is taken from the *live* scene, which is animated (sun,
   curtains, `RenderPump`) and whose textures load asynchronously. Two runs may legitimately snapshot
   different scenes. `.302`'s census confirmed the ceiling *present* in one run; it did not establish
   that every run snapshots the same thing.
2. **Uninitialised GPU resource** inside a single render.
3. **Driver/GPU non-determinism.**

(1) is the cheapest to test and has never been checked: census the snapshot on *both* classes and
diff, rather than censusing it once. That is a different experiment from every one tried so far,
which have all looked for a mechanism *downstream* of a snapshot assumed constant.

## (v) HQ-CEILING-ALBEDO-IGNORED — 🐞 REAL DEFECT; ✅ DECIDED 2026-09-04, see (z)13: fix. Found v0.31.5.301; verification named

**The path tracer's ceiling is completely insensitive to the ceiling material.** Recolour the ceiling from
`#fafafa` to `#141414` (confirmed applied to 14 ceiling planes by `RECOLORCHECK`, and applied at probe line 494,
long before the PT block) and:

| same run, ceiling patch | value |
| --- | --- |
| raster (`frame.png`) | **L = 0.9** |
| traced still (`pathtraced.png`) | **L = 192.1** |
| traced still with a white ceiling | L = 192.7 |

The rasteriser obeys the recolour; the tracer ignores it entirely.

**192 is the environment's own level.** The glazing, which shows `root.background` directly, reads 192 in the
same frame, and `.300` measured this ceiling patch at **L = 193 with sd = 0.0** — every pixel identical. So the
traced ceiling is not a dark surface rendered too bright: **it renders at the environment's level, with zero
spatial variation, immune to its own albedo.**

**Lead, explicitly untested.** If the ceiling is **absent or transparent in the tracer snapshot**, the camera
sees `root.background` through it. That predicts and matches: equality with the glazing; zero variance; immunity
to recolour; greenness *higher* than the glazing (78.2 vs 60.3 — no glazing tint in the way); class A's cold
cast under the normal grey gradient; `.298`'s ceiling out-radiating the aperture; and `.252`'s original "mirror
ceiling", which `.253` may have replaced with a hole. Six matched predictions, zero tests — and fourteen
mechanisms in this arc have been refuted by a later round.

**❌ THAT LEAD IS REFUTED v0.31.5.302.** The snapshot was censused directly (temporary instrumentation, added,
observed, reverted, `src/` verified clean), with the room repainted `f5f5f0:141414;fafafa:141414`:

```
[PROBE] snapshot meshes=1104 distinct=180
[PROBE]   x99 PlaneGeometry#141414 MeshStandardMaterial r=0.92     <- walls
[PROBE]   x14 PlaneGeometry#141414 MeshStandardMaterial r=0.9      <- CEILINGS
```

**The ceiling planes are present, carry the recoloured `#141414`, and are correctly substituted from Lambert to
`MeshStandardMaterial` at `SUBSTITUTE_ROUGHNESS = 0.9`.** `.253`'s `pbrStandInFor` works as designed.

Two further candidates eliminated by source inspection at zero cost:

- **the traceability gate** — `buildTracerScene` skips meshes failing `mats.every(isTraceableMaterial)` *before*
  `pbrStandInFor` runs, but `isTraceableMaterial` explicitly accepts `isMeshLambertMaterial`;
- **back-face culling** — `Ceiling.tsx` uses `rotation={[Math.PI/2,0,0]}`, mapping `PlaneGeometry`'s `+Z` normal
  to `(0,−1,0)`, i.e. **down into the room**, so default `FrontSide` is correct from below and `pbrStandInFor`
  copies `side` through. (`RoomCeiling.tsx` deliberately uses `BackSide` for the *other* ceiling implementation —
  a real asymmetry between the two, but not the fault here; the census's `r=0.9` identifies the Lambert path.)

**Reproduced more starkly.** Two dark-ceiling runs: traced ceiling **192.1** and **181.5** against raster
**0.9** in both; in the second, a *black* ceiling out-radiates the window by **12.5 counts**.

**So the fault is DOWNSTREAM of the snapshot.** The material handed over is right in colour, type, roughness,
orientation and presence — whatever renders it at the environment's level does so after a correct hand-off, in
the tracer's own material conversion or shading.

**🔗 FOLDED INTO (u) v0.31.5.303 — (v) is not independent; it is what (u)'s class A IS.** Two runs, room
repainted dark, normal grey environment, **byte-identical rasters**:

| | frame L | traced ceiling | traced sidewall-L | raster ceiling |
| --- | --- | --- | --- | --- |
| class A | 104.5 | **181.5** | 16.1 | 0.9 |
| class B | 29.9 | **1.0** · sd 0.00 | 1.2 | 0.9 |

**In class B the tracer renders the black ceiling correctly (1.0 vs raster 0.9); in class A it renders 181.5.**
So the albedo immunity is a class-A symptom, not a separate defect. See (u) for the unified statement.

**Consequence for past results.** Every traced *ceiling* figure — `.253`, `.254`, `.255` and the tracer-based
ceiling ÷ wall work — measured a quantity that does not depend on the ceiling. `.255` withdrew `.253`'s ceiling
deficit citing "a different lighting rig"; the reason is sharper and worse: **the tracer's ceiling is not a
ceiling.** The photographic band and the app's 0.93 are raster measurements and unaffected.

**Relation to (p) and (u).** All three live in `hqRenderSession`'s snapshot/environment handling, and this may
be the same fault as (u) seen from another angle — if the ceiling is sometimes present and sometimes not, that
alone would produce (u)'s two classes.

## Summary

| # | Item | Kind | Recommendation |
| --- | --- | --- | --- |
| a | DEFAULT-GLOOM | one-line behaviour | ✅ **SHIPPED v0.31.5.86** — guard extended to daylight |
| b | WINDOW-TIME-INVARIANT | content + flag policy | ✅ **SHIPPED v0.31.5.88 + v0.31.5.92** — curtains open; default backdrop now the sun-driven sky |
| c | PLAN-SWAP-STRANDED | structural vs interim | ✅ **SHIPPED v0.31.5.90** — confirm now names the count; skip untouched |
| d | wall-reveal POSE | design parameter | ❌ **CLOSED v0.31.5.89** — no defect; premise retracted |
| e | Curtain vs nightstand | content | ✅ **SHIPPED v0.31.5.87** — curtain narrowed + nightstands outboard |
| f | TEMPLATE-ROOM-ENCLOSURE | content | ⏳ **OPEN v0.31.5.109** — 9 templates ship unenclosed bathrooms; ratcheted by test |
| g | LEVEL-ISOLATION-IN-WALK | renderer design + cost | ✅ **SHIPPED v0.31.7.207** — walk mode renders the walked storey plus everything below (0 → 359 meshes below on `tpl-loft`), ceilings of overlooked storeys suppressed, furniture filter moved with it; `performance` 60 fps unchanged, `realistic` 52.7–53.4 vs a 54.1–57.6 control. **Uncovered `(w)`:** the sky over the rail is a missing wall band, not a visibility bug |
| w | DOUBLE-HEIGHT-WALL-BAND | content / template geometry | ✅ **SHIPPED v0.31.7.208** — `lf-open` now carries `ceilingHeight: 5.5` and the void-side perimeter spans (split from east/west at z = 3.4) carry `topHeight: 5.5`. Eye-level raycast over the rail went from **NOTHING (sky)** to the north wall at y = 4.27; looking up from the ground floor went from y = 3.0 to **y = 5.5** at two points. `performance` 59.9/60 fps unchanged; `realistic` **44.7 fps mean (41.4–48.2)** against a same-server control of **50.1/50.9/50.5** — a real ~11 %, with p50 and worst frame unchanged, so the loss is CPU-side per frame, not raster |
| z3 | LOW-SUN-DIRECT-LEAK | render | ✅ **FIXED v0.31.7.263** (history below) — originally measured v0.31.7.254 — on the east wall of the default flat's `livingDining`, the app GAINS 0.222 linear from 13:00 to 17:00 where Cycles LOSES 0.029, taking app/reference from 0.974 to **1.445**. Isolated by differencing two hours with GI ON, which cancels the hour-independent bake; the ceiling and floor at the same poses stay at 1.05, so it is wall-specific. Not the day grade — `grade()` returns only `{exposure, warmth}` and exposure is 1.38 at 09:00/13:00/17:00 alike. Not grille shadowing — see `(z2)`. The brightening is UNIFORM across the patch with no sun patch visible, which is the signature of an unshadowed Lambert term rather than admitted sunlight. **CAUSE FOUND v0.31.7.255: the sun has no ATMOSPHERIC EXTINCTION.** `dirLight.intensity` measured **0.9913 at 09:00 (elevation 28.8°), 1.000 at 13:00 (83.9°), 1.000 at 17:00 (31.0°)** — flat across the day. Physically the direct beam falls with air mass: 1.94 air masses at 31° against 1.01 at 84°, so at a clear-sky optical depth of 0.25 the low sun should be **~21 % weaker**. Cycles' MULTIPLE_SCATTERING sky models that; the app does not. The 09:00 asymmetry is geometric, not a counter-example: that hour the sun is EAST, behind this west-facing interior face, so the same over-strong beam lands on it at a poor angle and adds only 0.040. Eliminated on the way: the shadow frustum (both probe points inside, 1024 map), `castShadow` on the walls (present; the 84 large shell meshes lacking it are floors at y=0), `shadowMap.enabled` (true), `CeilingOccluder` (explicitly `castShadow` so the sun cannot enter through the open top), the day grade (`grade()` returns only `{exposure, warmth}`, and exposure is 1.38 at all three hours), and **environment specular** — zeroing `envMapIntensity` on 931 materials moved the patch 0.0 counts. **PARTLY FIXED v0.31.7.257** — the curve now carries a Kasten-Young beam (85° 1.0, 45° 0.903, 30° 0.781, 10° 0.318, 0° 0.10 as a flagged look call), 13:00 held to within 0.1 counts, and the 17:00 wall improves **1.445 → 1.368**; mean error over nine measurements 13.4 % → 12.3 %, worst 44.5 % → 36.8 %. But it accounts for only about a QUARTER of the excess, and the arithmetic says why: a 21 % cut to a direct term that is 29 % of that surface's total is a 6 % total change. **DECOMPOSED v0.31.7.258** by hiding the directional light (`visible = false`, since `Lighting` rewrites `intensity` every frame): at 17:00 the wall reads **0.7285 with the sun and 0.5478 without**, and 0.5478 is EXACTLY its 13:00 reading — so the sun contributes **0.1807** and the rest is an hour-independent floor. Meanwhile the Cycles wall FALLS 0.5622 → 0.5327 (−5.2 %). Of the 0.1958 excess, only **0.0151 is the static floor failing to dim**; **0.1807 is direct sun the reference does not have**. And it is NOT a missing occluder: the `livingDining` ceiling occluder at (10.45, 2.60, 4.72), 4.16 × 6.84, is `visible`, `castShadow`, `shadowSide: DoubleSide`, and DOES cover (10.77, 3.88) where the sun's ray exits the ceiling. So the sun is reaching a surface its own occluder covers — **NARROWED v0.31.7.260**: shadows WORK and that wall is simply never in shadow. With the sun's `castShadow` forced false at SOURCE (verified by the probe's own state line reading `cast0`), the wall moves **0.0 counts** while the floor moves **+8.4** — the shadow pass functions, and nothing in the app's scene casts onto the sun's path to that wall. Resolution is eliminated too: `mapSize 4096` — the one in-page mutation that persists, since `Lighting.tsx:224` rewrites `castShadow` and `normalBias` every frame — also reads 203.2. So the ceiling occluder covers the ray's exit point and is `castShadow`, yet contributes no occlusion for this light path, while Cycles simply blocks the ray with the ceiling geometry and gets no sun there. **v0.31.7.262**: the wall mesh has **`receiveShadow` unset** (`RoomShell.tsx:191`, which also sets `castShadow={false}`) while `WallSegment.tsx` — the CUSTOM-plan wall — sets both. A real inconsistency, and NOT the cause: adding `receiveShadow`, adding `castShadow` to all three ceiling components (`RoomCeiling`, `RoomCeilingTile`, `Ceiling`'s plain mesh), and both together each moved the wall **0.0 counts** at 13:00 and 17:00. The ray's own casters are confirmed present — traced with `ALL=1`, which keeps transparent hits, the path is blocked at 1.94 m by the `[T]` occluder AND a non-transparent ceiling mesh at (10.75, 2.60, 3.88), while the FLOOR's path hits an opaque wall at 2.38 m and the floor IS shadowed. So the surface takes full unshadowed Lambert and nothing available makes it shadowable. That is where `(z3)` sits **FIXED v0.31.7.263, and `.262`'s attribution was WRONG.** `RoomShell.tsx:191` is the ISOLATED ROOM EDITOR's wall and `PlanWallFace` is the CUSTOM-plan wall; neither renders the default flat. The surface the camera actually sees is `WallSegment.tsx`'s `FacePlane` (mesh at :133), a world-UV plane drawn `FACE_OFFSET` proud of the wall body — and it set **neither** `castShadow` nor `receiveShadow`, both of which default to false. The body behind it (`:194-195`) sets both and is never visible. So the visible wall could not receive a shadow at any hour. Adding `receiveShadow` to `FacePlane` (and to `PlanWallFace` for parity) takes the 17:00 wall **222.2 -> 217.7 counts** while 13:00 moves 0.1 — the excess was low-sun-only, which is `(z3)`'s whole signature. **Why `.262` read a null result: the flag never reached the mesh.** `ray-probe` now prints each hit's `recv`/`cast`, and the patched `PlanWallFace` still measured `recv0`; only after patching `FacePlane` did it read `recv1`. Every previous null in this item was an unverified edit. **Cycles confirms the shape** — at the same pose, hour and exposure-matched AgX, the reference wall is likewise UNIFORM and fully shadowed with no sun patch (sd 3.1 vs the app's 3.3). It should be: the wall's ray to a 31 deg western sun exits through the solid ceiling slab, not a window, so shadowed is the physical answer. The occluder is the caster that supplies it (`4.16x6.83`, `cast1`); the room ceiling plane beside it is `cast0`. Frame cost is unchanged, p50 7.5->7.6 ms performance and 10.1->10.2 ms realistic. Residual brightness now lives in `(z4)`. |
| z4 | SHADOWED-SURFACES-WARM | render | ✅ **FIXED v0.31.7.264** — measured v0.31.7.263, exposure-matched — a shadowed interior wall is lit WARM by the app and COOL by Cycles. At the `livingDining` east wall, 17:00, same pose, same AgX, and Cycles exposure derived from the manifest (`toneMappingExposure` 1.38 linear -> 0.4647 stops), the reference reads **185.8 mean / R-B -14.9** against the app's **217.7 / +12.4**. That is 31.9 counts too bright and **27.3 counts of colour disagreement in the opposite direction**, and the sign is not an exposure artefact because both sides now agree about exposure — the unmatched render read -16.8, the matched one -14.9, so matching moved R-B by 1.9 while the app differs by 27. **Hypothesis, tied to `.223`:** the `replace`-mode injection sets `reflectedLight.indirectDiffuse` and thereby REPLACES ambient, hemisphere and IBL. A shadowed surface therefore has no cool-sky term at all — its entire illumination is one warm sun-derived baked irradiance, where Cycles gives it multiple-scattering sky bounce. If that is right, the fix is not a gain change but restoring a sky-coloured component to the injection, and `IRRADIANCE_GAIN` cannot express it because the defect is chromatic. Untested. **CAUSE CONFIRMED IN SOURCE, and the `.263` hypothesis was only half right.** The injection was achromatic in BOTH factors: `uniform float visGain` times the map's `.r` channel, so `indirectDiffuse = grey * BRDF_Lambert( albedo )` and indirect light in this renderer had no colour at all — every shadowed surface rendered at its own albedo hue. Proof the LIGHT RIG had no authority: setting the hemisphere's warm `groundColor [0.42,0.38,0.34]` to its blue `skyColor [0.55,0.66,0.92]` at all three daytime keys moved the patch **0.0 counts**, because `replace` mode discards ambient, hemisphere and IBL alike. The `.263` guess that a cool-sky term was being DISCARDED was wrong in an instructive way — `GI=off` measured **warmer** (+20.5) not cooler, so there was no cool term to lose; the baked GI was already the cooler of the two. **FIX:** `visGain` is now a `vec3`, tinted by `daytimeSkyTint()` — the 30/45/85 keys' shared `skyColor`, normalised by Rec. 709 luminance so it carries CHROMA ONLY and cannot disturb `IRRADIANCE_GAIN`. Strength CALIBRATED, not chosen: lights-off endpoints measured R−B **+1.8 at 0 and −17.4 at 1**, a −19.2 span, so `SKY_TINT_STRENGTH = 0.87` lands the target. **Result, n=2 and exposure-matched:** app −15.1 against Cycles **−14.8 at 13:00 and −14.9 at 17:00** — colour error on this surface 16.7 counts → 0.25. Mean stays +2.9 %/+3.9 % high. Cycles' own R−B being CONSTANT across the two hours independently vindicates a constant tint, which is required anyway: the tint sits in `customProgramCacheKey`, so an hour-varying one would recompile every baked material on every hour change (`.15` measured 216 ms for that). Frame cost +0.3 ms performance / +0.2 ms realistic. Look: the wall gains a real cool-to-warm gradient — sky-cool away from the cove LED, warm toward it — where it was previously flat uniform yellow-white. |
| z5 | CYCLES-REF-HAS-NO-INTERIOR-LIGHTS | method | ✅ **FIXED v0.31.7.265** — measured v0.31.7.264 — `scene-glb.mjs` writes only `lights.directional` into the manifest, so `render_from_manifest.py` builds a reference lit by sun and sky ALONE. Every app-vs-Cycles comparison taken at the default `lightsMode: on` has therefore been measuring a LIT interior against an UNLIT reference. Magnitude at the `livingDining` east wall, 17:00: turning the app's interior lights off (19 of 87 candidates flipped) moved that patch from **218.2 / R−B +4.0** to **193.2 / −17.4**, i.e. **25 counts of brightness and 21 counts of warmth** — larger than most defects this arc has chased, and in the direction that makes the app look over-warm and over-bright against the reference. `(z4)`'s calibration was done lights-OFF on both sides for exactly this reason, and that is the only reason its residual came out at 0.25 counts. **Consequence:** any earlier absolute app-vs-Cycles number taken with lights on is inflated by an unknown share of this. **Fix would be** exporting the interior lights (`FurnitureLights`/`fixtureLights`) into the manifest and placing them in `render_still.py`; until then a lights-off arm is MANDATORY for any absolute comparison. Not yet built. **FIXED v0.31.7.265.** `scene-glb.mjs` now exports `lights.point` / `lights.spot` with WORLD positions (fixture lights hang off furniture groups, so the local one is meaningless), `sofa_scene.add_point_lights_from_three` places them, and `render_still.py --point-lights` takes them as a JSON file — 19 fittings is past a comfortable argv, and the count is plan-dependent. The render's JSON now REPORTS `point_lights`, because `(z5)` survived this long precisely because nothing in the output said how many lamps were in the scene. **The candela→watt derivation needed no fudge factor.** three takes `intensity / d²` as illuminance and a Blender point lamp of `P` watts gives `P / (4πd²)`, so `P = 4πI` with no 683 lm/W anywhere — neither renderer applies luminous efficacy. At `scale = 1.0` the lit wall reads **217.9 Cycles against 218.1 app, 0.2 counts apart**, which both validates the conversion and says the app's absolute brightness on that surface was right all along. `--point-light-scale` is kept as a dial, unused. **Residual: R−B +10.1 Cycles vs +5.0 app, so lights-on the app is 5.1 counts too COOL** — see `(z6)`. Two divergences are deliberate: three's `distance` is a windowed cutoff with no Blender equivalent and is DROPPED (Blender stays pure inverse-square, making it the physical one), and `shadow.radius` is DROPPED because it is a shadow-map blur in TEXELS, not an emitter size — mapping it would be a unit error. A small physical `emitter_radius` 0.04 m is used instead, so the lamps cast soft-edged shadows. **RECONCILED with `v0.31.7.8`, v0.31.7.268.** `light-distribution.mjs` had already met this problem and deliberately declined to convert placed lights, on the grounds that inventing a wattage would make the physical reference agree with the artistic choice under test. That reasoning stands and the fix here does NOT overturn it. Two things reconcile them: the conversion is DERIVED from both renderers' falloff laws rather than fitted, and it agreed to 0.2 counts at the derivation's own value with no tuning — but a lit comparison still INHERITS the app's lamp intensities and therefore cannot test them. So the two arms answer different questions: **daylight-only for calibrating the GI chain** (and `(z4)`'s tint was calibrated there, correctly), **lit for comparing the composite the user actually sees**. `light-distribution.mjs` stays daylight-only by design. |
| z6 | LED-DISTANCE-CUTOFF-DIMS | render | 🐞 **REAL, measured v0.31.7.265** — lights-on, the app's wall is **5.1 counts cooler** than Cycles (R−B +5.0 vs +10.1) while agreeing on brightness to 0.2 counts. Lights-OFF the same surface matches to 0.25 counts, so the disagreement is carried entirely by the interior lamps, and it is the WARM term that is short. **Hypothesis with the arithmetic:** three applies a windowed falloff that forces intensity to zero at `PointLight.distance`, roughly `clamp(1-(d/distance)⁴,0,1)²`, whereas Cycles is pure inverse-square. The `livingDining` LEDs carry `distance` 3.2–6.5 m and this patch sits a few metres out, so at `d/distance ≈ 0.6` the app dims its own warm lamps by **~24 %** — the right magnitude and the right direction. Not yet tested; the test is to drop the cutoff (`distance = 0`) and re-measure, which is a real behaviour change and needs its own look call, since the cutoff is also what stops distant fittings lighting the whole flat. |
| z8 | SKY-TINT-IS-ORIENTATION-BLIND | render | ✅ **FIXED v0.31.7.269** — measured v0.31.7.268 — a limitation of `(z4)`'s own fix.** `SKY_TINT_STRENGTH = 0.87` was calibrated on ONE surface, a vertical wall, and it is applied to every baked surface regardless of which way it faces. Daylight-only residuals now read **wall 0.2 counts, floor 2.0, ceiling 7.0** (app R−B −18.0 against Cycles −11.0): the ceiling is over-cooled. Physically that is expected and the fix was always going to hit it — a ceiling faces DOWN, so its indirect arrives from the floor as WARM bounce, not from the sky, and tinting it with sky chroma is the wrong illuminant. A single global tint cannot express this. **Fix would be** a per-orientation tint (sky for up-facing, floor-bounce for down-facing, a blend for vertical), which is affordable because baked materials are already cloned per mesh and axis-aligned surfaces have a known dominant normal — it costs about three program variants rather than one. Worth measuring against Cycles per orientation before picking the values, and NOT worth guessing: `(z4)` is only trustworthy because its strength was measured from two endpoints rather than chosen. **FIXED v0.31.7.269.** `SKY_TINT_STRENGTH` is now a per-orientation record and `surfaceOrientation()` classifies each baked mesh by its world-space mean normal (0.7 on y, a little over 45°, so a surface must be meaningfully horizontal to count; ambiguous takes the middle value). Every strength MEASURED daylight-only from its own two endpoints, not chosen: ceiling **0.539**, wall **0.866**, floor **0.773**. Residual R−B against Cycles: ceiling **7.0 → 0.5**, floor **2.0 → 0.1**, wall unchanged at 0.2 — mean chroma error **3.07 → 0.27 counts**, with brightness untouched (181.5 → 181.3, 195.7, 104.7). Classification is verified by the measurement itself: misclassifying the ceiling as `side` would have read ≈ −17.7, and it reads −11.5. Frame cost NIL — realistic p50 10.6/10.4/9.8 ms against a 10.1–10.3 baseline, performance 7.7 ms at 60 fps. An earlier 12.2–13.1 ms reading was noise from running straight after heavy Blender renders, which is worth remembering: three repeats separated a real regression from an imagined one. Limit: n = 1 room, so the values are measured-but-provisional. **FLOOR VALUE CORRECTED v0.31.7.276.** The 0.773 was fitted on frames where the floor's lightmap had not attached (`(z10)`), so it was calibrated against the wrong surface. Re-measured with the GI settled, the floor's endpoints are **38.1 at strength 0 and 25.2 at 1** — a span of only 12.9 against a target of 19.5, so the lever **SATURATES**: even fully sky-coloured the floor stays 5.7 counts too warm. `up` is set to **1.0**, the lever's maximum rather than a solved value, which improves the floor 2.8 counts and restores the ordering physics expects (`up 1.0 > side 0.866 > down 0.539` — a floor sees sky through the glazing most directly). The residual cannot be closed by this dial: the floor's R−B is dominated by its warm wood albedo (0.527/0.361/0.216), which both renderers share. Ceiling and wall values are untouched and were never affected, being byte-identical with and without the settle wait. **FLOOR VALUE CORRECTED v0.31.7.276.** The 0.773 was fitted on frames where the floor's lightmap had not attached (`(z10)`), so it was calibrated against the wrong surface. Re-measured with the GI settled, the floor's endpoints are **38.1 at strength 0 and 25.2 at 1** — a span of only 12.9 against a target of 19.5, so the lever **SATURATES**: even fully sky-coloured the floor stays 5.7 counts too warm. `up` is set to **1.0**, the lever's maximum rather than a solved value, which improves the floor 2.8 counts and restores the ordering physics expects (`up 1.0 > side 0.866 > down 0.539` — a floor sees sky through the glazing most directly). The residual cannot be closed by this dial: the floor's R-B is dominated by its warm wood albedo (0.527/0.361/0.216), which both renderers share. Ceiling and wall values are untouched and were never affected, being byte-identical with and without the settle wait. |
| z9 | ONE-PROGRAM-FOR-ALL-BAKED-MATERIALS | perf | ✅ **SHIPPED v0.31.7.270** — found as a lead in v0.31.7.269. `customProgramCacheKey` encodes the per-map gain, so a plan compiles **~195 distinct programs** for the baked materials. Collapsing the key to a constant took the worst frame from **1130–1224 ms to 13–344 ms across 3/3 runs** — that is the `(z)`6 load hitch, and `.15`'s 216 ms-per-compile figure accounts for it. Renders correctly too: ceiling, wall and floor kept their own gains and tints to within 0.7 counts, because `materialProperties.programs` is a Map on the MATERIAL, so a key only dedupes variants within one material and cross-material uniform bleed is impossible. **Why it is not shipped.** `v0.31.7.44`'s hazard is real but narrower than its wording: on a key HIT three's `getProgram` returns early, skipping both `onBeforeCompile` and the `materialProperties.uniforms` assignment, so RE-APPLYING the injection to the SAME material with a new gain would silently keep the old one. Materials outlive a plan change here (`visClonedFrom`), so that path is live. **Prerequisite:** hold the uniforms object (e.g. `userData.visUniforms`) and update `visGain`/`visMap` in place on re-apply, instead of relying on a recompile. Worth doing — it is the largest smoothness win currently identified — but it is a correctness change to the attach path and deserves its own round rather than riding along with a look fix. **SHIPPED v0.31.7.270 via a per-material GENERATION, which satisfies the prerequisite rather than working around it.** Every attach bumps `userData.visGeneration` and the key is `visLightmap:${generation}`, so an attach ALWAYS misses for that material and `onBeforeCompile` always re-runs with the new values — exactly `.44`'s guarantee, and STRONGER than keying on the gain, which silently missed a changed MAP at an unchanged gain. Materials attached once all share generation 1, so a plan compiles ONE program. Deliberately NOT reset by detach: after a detach the material recompiles to its stock program with a fresh uniforms object holding no `visMap`/`visGain`, so a re-attach reusing an earlier generation would hit that generation's injected program and find those uniforms absent — an indirect term of zero, which reads as a bake fault rather than a cache one. Both properties are now tested. **PAIRED A/B, same machine, 2/2 each — and it is a TRADE, not a free win:** p50 **10.3 → 11.9 ms**, but worst frame **1162/1107 → 24/27 ms** and achieved **49.7 → 58.8 drawnFrames/s**. The hitch is gone and 11.9 ms is still comfortably inside the 16.7 ms 60 fps budget, so the trade is worth taking; the p50 rise is UNEXPLAINED, since fewer programs should mean fewer state changes. One hypothesis, untested: the old 1.1 s stall blocked rAF and so shifted WHICH part of the 12 s orbit was sampled, meaning the two p50s are not measured over the same frames. Render output is byte-identical across the change (0.0 counts on all three surfaces). **HYPOTHESIS REFUTED, v0.31.7.271 — the p50 cost is REAL.** `frame-time.mjs` gains `WARMUP`, which discards the first N seconds of samples so both arms are measured in the same steady state; `.270` guessed that the old 1.1 s stall had shifted which frames were sampled. It had not. Warmed up (5 s discarded, 12 s measured), realistic: **gain key p50 10.0/10.5 ms, max 60.8/43.1, 58.3 fps** against **generation key p50 11.2/11.4/12.2 ms, max 12.7/13.6/14.8, 59–60 fps**. So one program costs about **+1.2 ms per frame** in steady state and that is not a measurement artefact — it is also still UNEXPLAINED, since three's `setProgram` skips its program-level uniform refresh when the program does not change, which should make FEWER programs cheaper, not dearer. **The trade stands and the decision is unchanged:** worst frame 43–61 ms → 13–15 ms (the gain key keeps stalling even after a 5 s warm-up, because materials enter view lazily through the orbit), achieved 58.3 → 59–60 fps, and 12.2 ms is still well inside the 16.7 ms budget. Smoothness is what the goal asks for and smoothness is what this buys. |
| z10 | GI-NOT-SETTLED-AT-CAPTURE | method | ✅ **FIXED v0.31.7.276** — measured v0.31.7.275, and it invalidated `(z7)` and part of `(z8)`. The same committed tree, same probe, same state line (`realistic/on/manual13/exp1.3800/sun[i0.998/cast1/map1024]`, `LIGHTS=off` flipping 19 of 87 on both) renders the FLOOR at **126.6 / R−B +28.0** on a freshly started dev server and **104.7 / +19.4** on the long-running one. Ceiling and wall are BYTE-IDENTICAL across the same pair (181.3 / −11.5 and 195.8 / −14.6), so this is not exposure, tone mapping or the sun — it is specific to the floor. Lightmaps are attached in both (`ray-probe MAT=1` reports `visLightmap: true`). **A second observation that should not be possible:** on the fresh server, contact shadows ON reads 126.6 and OFF reads 104.6, i.e. removing a `rgba(0,0,0,0.55)` darkening blob makes the floor 22 counts BRIGHTER and 9 counts warmer. `Furniture.tsx` gates that blob with nothing but `if (!contactShadow) return null`, so the prop cannot legitimately do this. **Suspects, none tested:** `surfaceOrientation()` (added `(z8)`) reads a world normal via `updateWorldMatrix` at material-attach time, so a floor could be classified `up` or `down` depending on whether parent transforms are settled when lightmaps are applied — and the measured chroma sits between the `up` (0.773) and `down` (0.539) strengths, at an implied ~0.34. **Consequence:** `(z8)`'s FLOOR strength was calibrated on the long-running server and is not verified on a fresh one; its ceiling and wall values are unaffected, being byte-identical. Any app-side floor number in this arc taken before this is suspect. **CAUSE FOUND v0.31.7.276: `aim-look` captured frames BEFORE the baked GI had attached, and `store.loading.active` going false does not mean ready.** `applyLightmapsFromIndex` runs after that flag clears and its textures load asynchronously, so a frame taken in between renders the same geometry with a different indirect term. The probe now polls the count of materials carrying `userData.visLightmap` until it stops changing (6 polls x 750 ms) and PRINTS it — 179 on the default flat. With the wait the floor reads **126.6 / R-B 28.0** in two successive runs; without it, **104.7**. Ceiling and wall are unaffected either way, so their lightmaps attach early — which is why only the floor moved. **The trap worth remembering: repeatability is not validity.** Four identical unwaited runs returned 104.7, 104.7, 104.7, 105.8 — stable to 1.1 counts — and that stability was read as confirmation. This item's original framing (a fresh-versus-long-running server difference) was wrong: both regimes are deterministic, they just settle differently under machine load, and the 126.6 readings happened to follow heavy Blender runs. The 'contact shadows BRIGHTEN the floor by 22 counts' result in v0.31.7.275 was an unattached frame compared against an attached one. **PROPAGATED v0.31.7.277.** The wait is now `waitForBakedGi()` in `lib.mjs` and is used by `aim-look` (frames), `gi-point` (it resolves a mesh to its map through the DEV pairing handle that the lightmap pass writes, so it can answer for some surfaces and not others while attaching) and `scene-glb` — the last for a second and separate reason: **`uv1` is COMPUTED by `applyLightmapsFromIndex`**, so a GLB exported too early carries no `UVMap.001`, which is the layer `--uv-layer` needs to compare a fresh bake against a shipped map. All three now PRINT the count (179 on the default flat) rather than checking silently, which is what failed before. 73 probes share the older `loading?.active` assumption; the three that measure or export GI-dependent state are done, and the rest are unaudited — a probe that reads a GI-lit surface and does not print a GI count should be treated as suspect. |
| z11 | GI-EDGE-FALLOFF-TOO-STRONG | render | ❌ **RETRACTED v0.31.7.286 — the app's falloff is if anything too GENTLE. History below; opened v0.31.7.283.** `mainBedroom`, pitched up 0.22 rad for real ceiling area, daylight-only, own Cycles reference at 128 samples. App ÷ Cycles on clean patches: **ceiling CENTRE 209.9/215.1 = 0.976**, ceiling LEFT EDGE 180.2/207.2 = **0.869**, left wall 200.0/212.9 = **0.939**. So the ceiling is nearly right in the middle of the room and falls away toward the walls **faster than physics does** — this is a GRADIENT error, not a level one, and `.282`'s single wall patch read the gradient rather than the room. The app's own spread says the same: ceiling-edge sd 10.7 against Cycles' 1.1, where the centre patches agree at 3.7 vs 3.0. **Consistent with `.266`'s first floor observation** — three floor patches read 0.811 / 0.948 / 0.877 and the worst sat beside the ottoman, i.e. against an occluder. **Suspects, untested:** the bake is `res 256` with `dilate 4` and `bake_margin 2`, so an atlas slot's edge texels are dilated outward from whatever borders them; and Cycles' own corner darkening is real but softer. A texel-scale check at a wall/ceiling junction against the map would separate dilation from genuine occlusion. **Two patches were discarded, both caught by the overlay** rather than by their numbers: one clipped the wardrobe's dark edge (app sd 36.0 against Cycles' 5.2), and `.282`'s 72-101-count ceiling reading is now formally RETRACTED — that pose's visible ceiling was a band about 8 % of frame height, and with real ceiling area the centre is 0.976. **v0.31.7.284: sun-bounce REFUTED, tone-curve position REFUTED, and the crux is now that the BAKE and a RENDER of the same Cycles scene disagree about the gradient.** The falloff is in the MAP, and the app renders it faithfully: at the two patch centres `gi-point` reads `E_baked` **0.6307 centre / 0.5622 edge = 0.891 linear**, against the app's 0.859 in bytes and Cycles' render at 0.963. **Sun-bounce is not the cause** — two `--indirect-only` bakes of this ceiling with and without the sun disc give edge/centre **0.7608 and 0.7609**, i.e. identical to four figures, so the sunlit-floor-brightens-the-wall mechanism does nothing to the profile. **Nor is it staleness** — a fresh bake from the CURRENT export falls off *more* steeply (0.808) than the shipped map (0.891). **Nor is it the AgX shoulder**, which was the strongest objection: byte gradients at 215/255 sit where the curve compresses hard, and the app's ceiling sat 5 counts lower where it compresses less, so the two byte ratios were not comparable. Matched by raising the app's exposure, the app reads ceilC 219.7 / ratio 0.874 and 223.8 / 0.882 against its default 209.9 / 0.859 — the ratio does flatten with level, but at a MATCHED ~215 it is still about 0.87 against Cycles' 0.963. The discrepancy survives level matching. **So the open question is why a Cycles BAKE of a scene produces a steeper irradiance gradient across a ceiling than a Cycles RENDER of the same scene**, with the sun disc, staleness and the view transform all eliminated. Remaining suspects: the box-atlas texel footprint at `res 256` (a ceiling face 10.68 m² across roughly a third of a 256 px atlas is ~4 cm per texel, so a texel adjacent to the junction integrates a hemisphere partly below the ceiling plane), and the `bake_margin 2` / `dilate 4` padding interacting with the face boundary. A resolution sweep (256 vs 512 vs 1024 on this one object) would separate texel footprint from physics, and is the next measurement. **v0.31.7.285: TEXEL FOOTPRINT REFUTED, and the refutation carries a practical warning.** Same object, same scene, same seed and samples, `--uv existing --uv-layer UVMap.001` so the atlas layout is identical and only texel COUNT changes: edge/centre **0.8667 at res 256** and **0.7471 at res 512**. Doubling resolution makes the falloff STEEPER, not flatter — the opposite of a texel-integration artefact. So a coarse texel was AVERAGING AWAY a genuinely sharp near-junction darkening, and finer texels resolve it. **Practical consequence: do NOT raise lightmap resolution to address this item** — the shipped 256 maps are flatter than a finer bake would be, so more texels would worsen the visible artefact while costing memory. **What remains established** is the render-to-render comparison, which is apples to apples: over IDENTICAL image regions and level-matched, the app falls off at **0.859-0.87 against Cycles' 0.963**. **What is NOT established** is the framing 'the bake is steeper than the render': that compared `gi-point`'s single-texel sample against a patch AREA average, and near a steep gradient those are different quantities. Settling it needs the map sampled at a grid of points across the patch footprint and averaged, which is the honest next measurement. Four hypotheses are now eliminated (sun-bounce, staleness, AgX shoulder, texel footprint) and the item is better bounded than it is explained. **RETRACTED v0.31.7.286, measured in LINEAR light.** Every version of this item compared gradients in tone-mapped BYTES, and that is not a comparison of light. Cycles rendered under `Standard` (the sRGB OETF alone, so exactly invertible) at `--exposure -2.0` to avoid clipping (p95 170 and 141), decoded PER PIXEL by `patch-read LINEAR=1`, gives ceiling centre **85.5** and edge **64.1** — a true linear gradient of **0.750**. The shipped map, area-averaged over the same two footprints with a 3x3 `gi-point` grid each, gives **0.8216**. **So the bake is FLATTER than physics, not steeper**, and the app renders that faithfully. What made the app's frame look steeper is entirely curve position: its ceiling sits at 209.9 against Cycles' 215.1, and the AgX shoulder compresses Cycles' brighter ceiling harder — 0.963 in bytes for a 0.750 linear gradient, against the app's 0.859 in bytes for a 0.8216 linear one. `.284` tested that objection and wrongly cleared it, because raising the app's exposure moved BOTH patches up the curve together and could not separate level from gradient; only a linear measurement can. **What survives:** the app's ceiling is **0.976** of physics in level (the centre patch), which is small and is the only real residual here. Area-averaging also mattered on its own — the map's ratio is 0.891 point-sampled and 0.8216 area-averaged, because the gradient is steep even WITHIN a patch (0.802 to 0.877 to 0.507 across the centre patch's own 9 samples). The four eliminations recorded above (sun-bounce, staleness, AgX shoulder, texel footprint) all stand as measurements; they were just eliminating causes of something that was not happening. |
| z12 | NO-LINEAR-VIEW-FOR-MEASUREMENT | method | ✅ **FIXED v0.31.7.288** — opened v0.31.7.287. `(z11)`'s retraction showed that gradient comparisons must be made in linear light, and the same argument applies to LEVELS: near the AgX shoulder a byte ratio UNDERSTATES a linear difference, so `v0.31.7.276`'s headline 'every surface within 3.4 %' is a byte-space figure of unknown linear size. Blender can be measured linearly (`--view-transform Standard` is the sRGB OETF alone, exactly invertible, and `patch-read LINEAR=1` decodes it per pixel). **The app cannot.** `aim-look TONEMAP=linear` sets `gl.toneMapping = LinearToneMapping` and reads it back as **6 (AgX) within 1.2 s**: `Lighting.tsx:168` assigns `TONE_MAPPING_THREE[toneMode]` every frame and the mode vocabulary is `filmic | agx | neutral` with no linear member; on Medium+ tiers the curve additionally runs through the post `<ToneMapping>` effect (TONE-POST), so a renderer-level bypass alone would not suffice. The probe now EXITS rather than rendering, because an AgX frame measured as linear is invisible in the output and is the error class that mis-framed `(z11)`, `(l)`'s shoulder theory and `.280`'s bar/glass conflation. **Fix:** a dev-only linear passthrough — a fourth tone mode or a debug flag that sets `NoToneMapping`/`LinearToneMapping` AND disables the post curve together. Small, but it touches the render path, so it wants its own round. Until then, every app-side LEVEL comparison in this arc should be read as byte-space and probably conservative. **FIXED v0.31.7.288 with a DEV-only linear passthrough, and it immediately corrected the arc's headline.** `isLinearView()` (`src/scene/linearView.ts`) reads `ssg_linear_view` from localStorage, DEV-only and cached; `Lighting` swaps `LinearToneMapping` for the mode's curve and `EffectsImpl` swaps `PostToneMappingMode.LINEAR` into the post stack. **Both sites or neither** — three skips `renderer.toneMapping` when rendering to a render target, which is why TONE-POST exists, so bypassing one would leave a plausible-looking frame that measures wrong. Deliberately NOT a fourth `ToneMappingMode`: that vocabulary is user-facing and a linear passthrough is not a look. `aim-look TONEMAP=linear` sets the key via `evaluateOnNewDocument` (before the first frame, since the read is cached) and READS BACK `gl.toneMapping`, exiting if it is not 1. **THE RESULT: byte-space ratios were understating the errors, badly for the floor.** Same pose, same hour, daylight-only, Cycles under `Standard` at the manifest-derived 0.4647 stops so both sides carry the same x1.38 scaling, decoded per pixel by `patch-read LINEAR=1` — **ceiling 1.040, wall 0.985, floor 0.877** in LINEAR light, against the byte-space AgX figures of 1.034 / 1.026 / 0.981 from `v0.31.7.276`. The ceiling barely moves, the wall flips sign, and **the floor's error is six times larger: 12.3 %, not 1.9 %**. So `.276`'s 'every surface within 3.4 %' was a byte-space artefact and `(z7)` is reopened at 12.3 %. Caveat kept: the wall patch reaches p95 244-248 of 255 under a linear transform, close enough to clipping that 0.985 is the least trustworthy of the three; ceiling (p95 165-178) and floor (82-87) are safely in range. **KNOWN LIMIT, v0.31.7.290: the linear pair only works at the DEFAULT exposure.** A brighter room clips under a linear transform — the `mainBedroom` ceiling and wall both read **255 / p05 255 / p95 255** on BOTH sides at the manifest's x1.38, so no ratio is recoverable there. The obvious remedy, lowering both sides together (`aim-look EXPOSURE=0.3` against `render_still --exposure -1.2721`, which are the same 0.414 scaling on paper), does NOT hold the relationship: the app comes out **28.8 counts brighter** (224.5 against 195.7), a linear ratio of about **1.37** — close enough to 1.38 to look like the day grade being applied twice somewhere in the `EXPOSURE` + `TONEMAP=linear` combination, but that is a guess and it is NOT measured. Until it is, linear comparisons are only trustworthy at the default exposure, on surfaces that do not clip there. `livingDining`'s tri pose qualifies (p95 165-250); the bedroom's pitched-up pose does not. So `(z7)`'s 12.3 % stands at **n = 1**. |
| z14 | EXPORT-DEPENDENT-BAKE | method | ✅ **EXPLAINED v0.31.7.294 — it was my own `.281` edit, not the pose.** Measured v0.31.7.293. Two `scene-glb` exports of the SAME flat at the SAME hour bake to systematically different irradiance: maps baked from the `mainBedroom`-pose export read about **1.5x** those baked from the `livingDining`-pose export, on identical keys at identical bake settings (res 256, 1024 samples, `--keep-glazing`, `--per-map-scale`, `--uv-layer UVMap.001`). Measured via `lightmap-audit.mjs`: the shipped set matches the livingDining export to median **0.987** and the bedroom export to **0.648-0.725** on the same maps. **Eliminated:** mesh count is nearly identical (1288 against 1295, so no missing walls from walk-mode reveal culling) and the sun differs only trivially (elevation 83.907 against 84.28, one calendar day apart). **Prime suspect, untested:** the bedroom export was taken with `LIGHTS=off`, which flips `lightOn` on 19 items and may change EMISSIVE lamp materials — emissive surfaces are real emitters in a Cycles bake. But the direction is wrong for that (removing emitters should make the bake DARKER, and it is brighter), so the mechanism is not yet identified. **Consequence:** a BLENDREF or `scene-glb` export is not a neutral snapshot of the flat, and any bake or reference compared across two exports is suspect. Fix starts with diffing the two GLBs' materials rather than guessing. **CAUSE: the exported GLB carries the app's pane EMISSIVE, and I changed it between the two exports.** Reading the glTF material blocks directly: the `livingDining` export has 24 emissive materials at `emissiveStrength` **5.2**, the `mainBedroom` export 27 at **8.32** — exactly `glassSkyCatchIntensity`'s coefficient before and after `v0.31.7.281`, with `emissiveFactor [0.624, 0.776, 0.914]`, which is `GLASS_SKYCATCH_COLOR` `#cfe4f5` sRGB-decoded. So the 1.5x was not pose dependence and not staleness: it was a look change of mine propagating into the bake through the export. Cross-export comparisons ARE still unsafe, but for a knowable reason — see `(z15)`, which is the much larger problem this uncovered. |
| z15 | PANE-EMISSIVE-LIGHTS-THE-REFERENCE | method | 🐞 **REAL, measured v0.31.7.294 — the arc's Cycles references are NOT physically lit, and this is the most consequential methodology finding in the arc.** The app gives its window panes an emissive sky-catch (`GLASS_SKYCATCH_COLOR` at `glassSkyCatchIntensity`) as a LOOK device, because a rasteriser cannot otherwise make a window read as a bright aperture. That emissive is EXPORTED into the GLB, and in Cycles an emissive surface is a real emitter. New `render_still.py --no-glazing-emissive` (built on `find_glazing`'s predicate, so a mask, an aperture and this can never disagree about what a window is) zeroes it and measures the contribution. In `mainBedroom`, same exposure, LINEAR: ceiling **141.6 → 16.4**, wall **129.8 → 18.6**. **The pane emissive was supplying roughly 88-99 % of the interior light in the reference.** It zeroed 6 sockets totalling strength 49.92. **This explains a standing anomaly and retracts its conclusion.** `v0.31.7.181` measured that REMOVING the glazing made the bake DARKER (wall −25, ceiling −71) and concluded 'the glass is not sealing the room' — which is backwards. Removing the glazing removed the EMISSIVE PANES that were supplying the light. That wrong inference is why the shipped set carries `keep_glazing: true`, so the shipped lightmaps are lit predominantly by the app's own artistic emissive rather than by sky through an aperture. **Consequences.** (1) `(l)`'s window calibration was circular: the app's pane was tuned against a reference lit by that same pane. (2) Every absolute app-vs-Cycles number in this arc inherits it. (3) `(z13)`'s room-dependent GI is a likely artefact of pane-emissive area per room volume rather than a renderer defect. **The honest configuration — open apertures AND no pane emissive — has never been run.** The pipeline's own docstring already says sealed glazing makes an interior nearly black, and with the emissive gone this render confirms it (0.004-0.005 linear), so `--keep-glazing` and `--no-glazing-emissive` together are not a valid reference either: the sky has to get in through an opening. Next: render with apertures opened and emissive zeroed, and re-derive the comparison set from that. |
| z13 | ROOM-GI-LEVEL-VARIES | render | 🐞 **REAL, measured v0.31.7.291 in LINEAR light — the LARGEST error this arc has measured, and byte space hid it completely.** Same hour, same transform on both sides, both frames verified UNCLIPPED, Cycles scaled analytically onto the app's exposure (exact, since `LinearToneMapping` and Blender `Standard` are both a multiply then the sRGB OETF). `mainBedroom`: ceiling centre **0.678**, wall left **0.631**. Against `livingDining`: ceiling 1.040, wall 0.985, floor 0.877. **So the bedroom's baked GI sits ~35 % below physics while the living/dining room sits at ~1.0** — a room-to-room spread far larger than any surface- or orientation-dependent effect found so far. In tone-mapped bytes the same bedroom patches read **0.976 and 0.939**, which is why this went unseen for the whole arc: AgX's shoulder compressed a 35 % deficit into 3-6 %. **It also retires the orientation hypothesis** from `v0.31.7.290`: ceiling (down-facing) and wall (side) are dark by nearly the same factor here, so the dominant variable is the ROOM, not the surface normal. **Consequence for the calibration:** `IRRADIANCE_GAIN` is global and every calibration of it in this arc was done in `livingDining`, the room that happens to agree. A single gain cannot serve a 35 % spread, so the fix is per-room or per-map rather than a constant — and `--per-map-scale` already gives the bake a per-map channel to carry it. **Method notes.** The comparison needs care: at the manifest's x1.38 both sides clip (bedroom ceiling reads 255/255/255 on BOTH), the app's user exposure is CLAMPED at `EXPOSURE_MIN = 0.6` so it cannot be dimmed past x0.828, and at 0.828 Cycles still clips — hence rendering Cycles at 0.414 and doubling its decoded linear values. That resolves `(z12)`'s 1.37x puzzle too: it was the clamp, not a double-applied grade. Patches with app `sd` far above Cycles' were discarded (`wallR`, sd 56.2, clips the wardrobe edge). Next: a third room, and whether the deficit tracks anything in the bake index (per-map `scale`, area, or sky visibility). **CAUSE FOUND v0.31.7.292: PER-MAP STALENESS in the shipped set.** The bedroom ceiling's shipped map is **0.562x a fresh bake of the current scene** at matched settings (res 256, 1024 samples, `--keep-glazing`, `--per-map-scale`, 8-bit, and `--uv-layer UVMap.001` so both write into the SAME app-side atlas and one uv addresses one surface point): shipped E **0.6307** against fresh **1.1216** at the ceiling-centre uv1, with `scale` 1.7482 against 2.8890. Meanwhile the `livingDining` floor map matched a fresh bake to **0.1 %** (`int_mean` 0.1648 against 0.1650, `v0.31.7.274`). So the set is not uniformly stale — some maps are exact and others are ~44 % low, which is precisely the shape of `(z13)`'s room dependence, and it means no global gain can correct it. The rendered bedroom deficit (0.678) is smaller than the map deficit (0.562) because a render patch averages over an area and over several maps, so the two are consistent in direction and magnitude without being identical. **Fix: re-bake the set** from a current export, at the settings the index's `bake` block records (min_area 1.5, limit 400, res 256, samples 1024, per_map_scale, dilate 4, keep_glazing, 8-bit). 195 maps, so it is its own round — and worth a staleness AUDIT first, comparing every shipped map against a fresh bake to learn how many are affected rather than re-baking blind. **`.292`'s STALENESS CAUSE IS RETRACTED, v0.31.7.293 — the shipped set is fine.** New `lightmap-audit.mjs` compares every shipped map against a fresh bake by the mean over OCCUPIED texels x `scale`, reporting an occupancy ratio alongside so a packing difference cannot pass as a value difference. Audited against a fresh bake from the **livingDining** export, the shipped maps match to within about 1.3 %: **4b1218e6 0.981, ce497848 1.000, 70e55d20 1.000, 114cf680 0.997, b04c03d3 0.998**, median 0.987 over 10 comparable maps. Audited against a bake from the **mainBedroom** export, the SAME maps read 0.648 / 0.662 / 0.725. So the shipped set is not stale; the bedroom export bakes roughly **1.5x brighter** and `.292`'s 0.562 was measuring that, not staleness. Two exports of the same flat at the same hour therefore disagree — see `(z14)` — and until that is understood no cross-export bake comparison is trustworthy. **`(z13)` itself still stands as a measurement** (bedroom 0.678/0.631 against livingDining ~1.0, in linear light) but is once again WITHOUT a cause. Also worth keeping from the audit: the first version used a whole-map mean, which is invariant to the glTF/Blender v-flip but NOT to atlas packing, and it produced a plausible bidirectional 0.64-1.77 spread that was partly packing artefact. |
| z7 | FLOOR-20PCT-DARK | render | 🐞 **REOPENED v0.31.7.288 at 12.3 % in LINEAR light.** Was marked largely dissolved in v0.31.7.276 on a byte-space figure. Originally measured v0.31.7.266. Re-running the three-surface sweep against LIT references (`(z5)`) in `livingDining`, one pose, exposure-matched AgX, app ÷ Cycles on byte means: **ceiling 1.050 / 1.053 / 1.059, wall 0.990 / 0.998 / 1.000, floor 0.783 / 0.804 / 0.806** at 09:00 / 13:00 / 17:00. The floor is ~20 % DARK at every hour while its chroma AGREES (R−B 44.6 vs 45.4 at 09:00), so it is a level error, not a colour one. Contrast disagrees too: patch sd **23.3 app against 12.9 Cycles**, i.e. the app's plank grain is twice as contrasty and the reference's floor is flatter and paler. **Do not fix this in the app until export fidelity is ruled out.** The reference is built from a three-exported GLB, so a floor material that survives the export imperfectly — texture colour space, a missing roughness/normal map, a tiling or UV-transform difference — would produce exactly this signature, and then the REFERENCE is wrong rather than the app. The 40-count gap is large enough that assuming the app is at fault is the expensive guess. First step is a material census on the floor mesh either side of the export, not a gain change. **EXPORT FIDELITY RULED OUT, v0.31.7.267 — so this is app-side.** New `material_census.py` imports the exported GLB and dumps what Blender actually received for the mesh at a THREE-space point. For the floor (`Mesh_4`, 4 verts, surface distance 0.001 m) the export is FAITHFUL on every axis that could have caused this: base colour **512² sRGB** feeding `Base Color`, roughness/metallic **512² Non-Color** feeding `Roughness`+`Metallic`, normal **512² Non-Color** feeding `Normal`, and a mapping scale of **[0.83333, 0.92593]** against the app's `repeat [0.8333, 0.9259]`. Both UV sets survive (`UVMap`, `UVMap.001` = `uv1`). Nothing is dropped and nothing is mis-tagged, so the sRGB-decode-skipped theory that would have made the REFERENCE too bright is dead. **The surface IS lightmapped** — `ray-probe MAT=1` now reports `visLightmap`/`hasUv1`, and floor and wall are both `true`. So the deficit is in the INJECTED IRRADIANCE for that surface. **And it is not missing sun bounce:** 0.783 / 0.804 / 0.806 across three hours is essentially constant, whereas an absent sun-dependent bounce term would vary with the sun. That leaves a constant, orientation- or map-specific level error — note `IRRADIANCE_GAIN` is GLOBAL at 4.2, so a value that puts walls at 1.000 leaves floors needing about **1.25×**. Next test is `gi-point` on the floor against Cycles' own irradiance at the same point, to separate the baked map's value from the gain applied to it. Two probe bugs were fixed getting here, both of which returned plausible answers rather than errors: nearest- VERTEX search picked a 2148-vertex furniture mesh over the 4-vertex plane the ray actually hit (now `closest_point_on_mesh`, and runners-up are printed), and bpy returns a FRESH wrapper on every `link.from_node` access, so `is` identity comparison reported `feeds: []` for textures that were plainly connected. **CONFIRMED DAYLIGHT-ONLY, v0.31.7.268 — so it is not an artefact of the lamp assumption.** `.266`/`.267` measured this in the LIT arm, which inherits the app's LED intensities (see the reconciliation in `(z5)`), so it was re-run with lights off on both sides: app ÷ Cycles **ceiling 1.035, wall 1.025, floor 0.811**, against 0.804 for the floor lit. The deficit is ~19 % in both arms and therefore belongs to the daylight/GI chain, which is the arm `v0.31.7.8`'s decision endorses for exactly this kind of calibration. **`gi-point` adds a suggestive number:** at the measured floor point `E_baked = 0.4338` (texel 0.4863 x scale 0.8921) against the wall's **0.5242** (texel 0.2980 x scale 1.7587), and `visGain` threads correctly at 3.7468 = 0.8921 x 4.2. A floor carrying LESS baked irradiance than a mid-height interior wall is backwards for a daylit room, where the floor sees sky through the glazing directly — which points at the bake rather than the gain, though it is not yet proof: the comparison still needs Cycles' own INDIRECT-only value at that point, which is what `bake_material.py --pass irradiance` produces and what a re-bake would settle. **SUN-BOUNCE ELIMINATED as the explanation, v0.31.7.272 — measured, not argued.** The shipped decomposition removes the sun as a SOURCE (`with_sun_disc: false`), which necessarily removes the sun's BOUNCES from the indirect slot as well; nothing could previously say how much that cost. `bake_material.py --indirect-only` is the instrument: bake twice with `use_pass_direct` OFF, once with the sun disc and once without, and the difference is pure sun-bounce with the direct double-count excluded from BOTH sides. At 13:00, same seed, per-map means over the three largest interior surfaces: Mesh_116 **0.0719 → 0.1015** (x1.41), Mesh_37 **0.1565 → 0.2331** (x1.49), Mesh_95 **0.0146 → 0.0507** (x3.47). Against the same objects' shipped-configuration means (1.1363 / 0.8662 / 0.8457) that is **2.6 % / 8.8 % / 4.3 %** of the baked indirect. Real, and worth knowing — but far short of the floor's 19 %, so it is NOT this. Two caveats on the number: 13:00 puts the sun at 83.9°, nearly overhead, so little enters the glazing and the term should be larger at 09:00/17:00; and none of the three is the measured floor, which at 5.6 m² does not reach a `--limit 6` bake. Also noted for any future map-to-map comparison: a fresh export of this scene bakes to `plan_context` **ac2d3655** while the shipped set is **5487e7de**, so shipped and fresh maps cannot be matched by key. **v0.31.7.273: the shipped map is now readable, and the mapping is NOT at fault.** New `map-stats.mjs` reports a shipped map's `mean`/`int_mean`/`max` in irradiance units (x`scale`), the same three `bake_material.py` prints, so shipped and fresh maps are finally comparable on the same statistics. Floor `4b1218e6` (Mesh_11, 19.3 m²): **int_mean 0.1648, max 0.8746**. Wall `6f5a1254` (Mesh_96, 9.23 m²): **int_mean 0.3002, max 1.7243**. Sampling is confirmed sound: the index declares `slots [[2,0]]` for the floor and `gi-point`'s uv1 (0.857, 0.273) lands in exactly that slot, so the 19 % is not a UV or atlas-slot error. **NOT decisive, and deliberately not called:** these are two different objects of different extent — Mesh_11 spans much of the flat including corridor far from any glazing, which drags its mean down — so comparing their means is the mesh-mean-versus-patch conflation `v0.31.7.180` already named as the reason four rounds failed. The measured point reads 0.4338, well ABOVE its own map's mean, so the point is on a bright part of the map. **The test that would settle it:** bake this same object fresh and read it at the SAME uv1. Blocked on tooling, not physics — a fresh bake gets its own `plan_context`, so the app's index cannot resolve it; `--uv existing` might reuse the GLB's `UVMap.001` (the app's own atlas) and make the two directly comparable, but it may bind uv0 instead and that needs checking before it is trusted. **THE BAKE IS EXONERATED, v0.31.7.274 — the shipped map reproduces to 0.1 %.** `bake_material.py --uv-layer` lets a fresh bake write into `UVMap.001`, which IS the app's own runtime `uv1` carried through the export, so a fresh map can be read at the SAME uv1 a probe samples the shipped map with — the comparison that was blocked on tooling. Baked from the same GLB at the shipped settings (res 256, **1024 samples, `--keep-glazing`**), the floor's interior slot mean is **0.1650 against the shipped 0.1648**, and max 0.8536 against 0.8746 (2.4 %, and max is the noise-sensitive statistic). So the map is right, reproducible, and NOT the 19 %. `(z7)` is downstream of the bake: in the shading that consumes the map — gain, albedo, the Lambert term, or the direct light the app adds itself. **`--keep-glazing` is load-bearing and nearly cost this conclusion:** omitting it (the DEFAULT) made the fresh map **2.6x darker** (scale 0.342 against 0.892), matching `v0.31.7.181`'s measurement that removal darkens THIS pass — which is precisely why the index's `bake` block records `keep_glazing: true`. **And a convention trap worth naming:** the fresh map's energy lands in the MIRROR row, `[2,1]` where the shipped map fills `[2,0]`, because glTF puts the UV origin at top-left and Blender's importer flips v. Read at the un-flipped uv1 the fresh map returns **0.0000**, which reads exactly like 'the bake produced nothing'. `map-stats.mjs`'s 3x2 slot grid is what caught it; sample a Blender-baked map at `1 - v`. **v0.31.7.275: sun-bounce eliminated ON THIS SURFACE, contact shadows eliminated, and then the BASELINE turned out to be unstable — see `(z10)`, which blocks this item.** Sun-bounce measured on the floor object itself (`--indirect-only`, seed 11, glazing kept, with and without the sun disc): interior slot mean **0.1402 → 0.1429**, a difference of 0.0027 = **1.6 %** of the shipped map's 0.1648. Smaller than the 2.6-8.8 % found on other meshes, so sun-bounce is definitively not the 19 %. The floor deficit also VARIES across the surface (0.811 / 0.948 / 0.877 at three patches), which a uniform gain error cannot produce — but those ratios are now void, because `(z10)` shows the app-side floor value is not reproducible between dev-server instances. Nothing further on this item is worth measuring until `(z10)` is resolved. **RESOLVED v0.31.7.276: the 19 % was `(z10)` — the floor was being measured before its own lightmap attached.** With the GI settled the floor reads **126.5 against Cycles' 129.0, a ratio of 0.981**, alongside ceiling 1.034 and wall 1.026 — every surface now within 3.4 %. Everything eliminated along the way stands and was worth eliminating (the bake reproduces to 0.1 %, sun-bounce is 1.6 % on this surface, contact shadows 0.1 counts, sampling and atlas slots correct), but the headline deficit itself was never real. Residual: **1.9 % dark and 5.6 counts too warm**, the latter tracked in `(z8)`. **REOPENED v0.31.7.288.** `.276`'s 0.981 was a ratio of tone-mapped BYTES. Measured in linear light with `(z12)`'s passthrough — Cycles under `Standard` at matched exposure, decoded per pixel — the floor reads **52.6 against 60.0, a ratio of 0.877**. The floor really is ~12 % dark; it was the 19-20 % that was an artefact, not the deficit. Everything eliminated in `.267`-`.275` still stands (bake reproduces to 0.1 %, sun-bounce 1.6 %, contact shadows 0.1 counts, sampling correct), so the cause remains open — but now against a magnitude worth chasing rather than a rounding error. **n = 1, and the second room is BLOCKED, v0.31.7.290** — see `(z12)`'s known limit: the bedroom clips at the matched exposure and the lowered-exposure pair does not preserve scaling. One further observation from the linear L/D set, worth keeping because it is cheap and points somewhere: the error is ORIENTATION-ordered — ceiling (down-facing) **1.040**, wall (side) 0.985, floor (up-facing) **0.877**. If that survives a second room it is a per-orientation gain error and fixable the way `(z8)`'s tint was. One contributor is already identified and is small: `(z8)`'s tint is luminance-preserving only on a NEUTRAL surface. On the floor's warm wood albedo (0.527/0.361/0.216) the blue-heavy `up` tint costs **2.6 %** of reflected luminance (albedo luma 0.386 → 0.376), because the surface reflects little of what the tint adds. Real, but a fifth of the deficit. |
| z2 | GRILLE-NO-SHADOW | render, UNVERIFIED-BENEFIT | 🐞 **REAL but not worth fixing blind, v0.31.7.253** — `Window.tsx:Grille` is the ONLY window element without `castShadow`; the louvre slats and sash members both have it. Coverage is ~10 % of the glazed opening (11-15 bars, 0.16-0.32 m² projected on 1.6-3.1 m² windows), so a Cycles render of the same geometry blocks ~10 % of the sun the app admits. Adding `castShadow` was built and REVERTED: the 17:00 east-wall patch read 205.4 both with and without it, and the frame shows no sun patch on that wall at all — so the pose could not test it, and the change would have added every window's bars to the shadow pass for no measured benefit. Needs a pose with a visible sun patch on an interior surface before it is worth the shadow cost |
| y | ROOM-SET-FOOTPRINT-GAP | content + render | ✅ **SHIPPED v0.31.7.234, verified `.235`** — ceilings render per ROOM, so footprint area no room rect covers had a floor (the plan slab spans everything) and NO ceiling: a raycast up left the scene. **16 of 19 templates**, up to 45.9 m² in `tpl-hdb-jumbo`, in two shapes — unassigned BLOCKS of 4-5 m² and thin SLITS where a rect stops short of a wall face (`h4-svc-s`'s face at z = 2.95 against `h4-bed2` at 3.2). Fixed by filling footprint-minus-rooms with `ceilingGaps.ts` (ground level only, so a double-height void keeps its own lid), NOT by editing 19 templates' room rects, which the furniture ratchets measure. Cost 8-60 meshes per plan. It also closed a daylight LEAK: `h4-shelter` dropped 148.2 → 131.8 counts, since a windowless bunker was being lit through the hole. `ceilingHole.test.ts` still ratchets the AUTHORING gap, which the fill only backstops |
| x | ENVELOPE-SLAB-BAND | content / template geometry | ✅ **SHIPPED v0.31.7.209, magnitude corrected and VERIFIED in `.210`** — found by generalising `(w)`: a storey's exterior wall was built at its OWN ceiling, so the floor-slab band above it had no wall. `perimeter()` takes an optional `topHeight`; all three ground envelopes now reach the next storey's floor. The open band is **0.05 m, not the 0.3 m `.209` published** — `LevelSlab` is a 0.25 m box hung under the storey above and fills the rest. Still a real see-through: at 2.62 m a ray crosses the whole maisonette to the sky at 226 m pre-fix and stops at the envelope post-fix; terrace identical at 3.02 m, and both arms agree at 2.9 m, which validates the aim |
| h | BEDROOM-WINDOW | content | ⏳ **OPEN v0.31.5.113** — was 15 of 44; **12 left**; `.120` proved NONE of the 12 is offset-fixable — each needs a new opening |
| i | MAIN-DOOR-ROOM | content | ⏳ **OPEN v0.31.5.114** — was 8; **3 left** after `.115`, `.118`, `.119`, `.120`; all 3 proven NOT offset-fixable |
| j | WINDOW-SIGHTLINE | content | ⏳ **OPEN v0.31.5.117** — **11** of 78 after `.121` shipped a windowless-wall preference for storage; three arranger levers measured, the residue is rooms too small to fix |
| k1 | WINDOW-SKY-DARK | render bug | ❌ **CLOSED v0.31.5.128** — mis-attributed. The `auto` tier ends at `high`, so the transmissive pane was correct; the dark pane was (k2) rendered by two tiers. Both tiers now read ~195 |
| m | PHOTO-VIGNETTE | look call | ⏳ **OPEN v0.31.5.244** — built, measured and reverted. Extending the lens vignette to the photographic look on the AO-only composer matches the PHOTO-GRAIN precedent and the tier that already ships it, but costs wall falloff 0.74 → 0.66 against a 0.85–0.86 photographic reference |
| l | WINDOW-LUMINANCE | render + product look | ⏳ **OPEN v0.31.5.236**, figures corrected in `.237`, **re-measured `v0.31.7.247`** — photographs clip 15–39 % of their glazing; the app clips **0.33 %** (≥254) looking level through the north window at 13:00 and **3.61 %** pitched up, so still an order of magnitude short. But the premise needs widening: that opening is crossed by the **approved SAFETY GRILLE** (`Window.tsx:Grille`, the SNV GRID design in `assets/guidelines/approved_grille_design.png` — vertical bars plus horizontal rails, one `InstancedBoxes` draw), not a bare pane. `v0.31.7.247` called these "vertical blind slats", which is wrong and misleading: a blind is a furnishing a user could open, a grille is approved architecture that stays — rays 1 cm apart alternate between hitting the slat plane at z ≈ 1.25 and passing to the sky. So a large share of what a walker sees at a window is grille bar, permanently, and making the PANE clip like a photograph changes only the glass between the bars — which is the honest scope of any fix here. Night (21:00) is already correct and must not regress |
| t | HQ-DENOISE-SHIFT | render bug | ❌ **REFUTED v0.31.5.285** — one-variable A/B with the flag asserted and read back: denoise off 119.3/117.6 vs on 118.0/115.7, i.e. **1.1–1.6 %**. The pass is radiometrically neutral; `.283`'s ~30 % gap was two runs in different states of (u) |
| u | HQ-TRACE-NONDETERMINISM | render bug | 🐞 **REAL v0.31.5.285, cause UNIDENTIFIED** — identical inputs give one of two discrete outputs ~45 % apart at the anchors, opposite colour temperature. Sample count, denoise stage and exposure all ruled out. Discriminator shipped in the probe; every traced figure in the arc needs re-measurement |
| v | HQ-CEILING-ALBEDO-IGNORED | render bug | 🔗 **FOLDED INTO (u) v0.31.5.303** — not independent. A black-ceiling A/B with byte-identical rasters gives traced ceiling **1.0** in class B (raster 0.9) and **181.5** in class A, so the albedo immunity is a class-A symptom. (u)'s unified statement: in ~half of HQ renders the ceiling is not rendered as a surface, it shows the environment |
| k2 | DAYLIGHT-GLASS | render bug | ✅ **SHIPPED v0.31.5.127** — the glass read the lamp switch, not the sun, so a fresh visitor met night glass at midday; now keyed off sun altitude, midday pane 139 → 206 with the warm interior intact and the night look preserved |

**Five of eleven items are resolved** — four shipped ((a), (b), (c), (e)) and one closed as no defect
((d)). Each was implemented in its own committed round and marked here as it landed. **(f), (g), (h), (i), (j) and (k) are open.** (h) and (i) share one cause and should be fixed together; (j) was created by fixing (h) and needs an arranger strategy, not a bigger keep-out.
Neither is a one-line answer: (f) is a request to re-draw shipped floor plans, scoped per template
rather than decided once, and (g) is a renderer change whose cost must be benchmarked on the
weak-device tier before it lands. (k) is the only open item that is a genuine RENDER bug rather
than a content or policy call — it is the strongest candidate for the next round, once the loss has
been attributed to the glass or to the background tone-mapping path.

## (x) SCENE-RESPONSE — ⛔ CLOSED as not-correctable (v0.31.7.59)

The app's rendered median is nearly scene-independent: **121, 123, 122, 96, 116** across five
matched-pose views where Cycles gives **83, 110, 112, 160, 187** (cv 8.7 % against 28.9 %, range
1.28× against 2.25×). So the app is too bright in dark rooms and too dark in bright ones, and this
is the entire remaining tonal error once item (l)'s constant is applied.

**Four predictors tested and refuted on five views:** in-view aperture visibility, glazing area per
unit surface, room floor area, and room depth perpendicular to the window. None is monotone with
the physics median. The decisive case was the Executive living room — 38.6 m² of floor but only
4.2 m deep — where the area and depth hypotheses predicted opposite results (below 83 against
95–105) and the truth was **187**, outside both.

**And the app's own output carries no signal:** ordering the five views by the app's median gives
physics medians 160, 187, 83, 112, 110 — no relation. So a correction driven by the app's own
histogram has nothing to drive it either.

**Conclusion: this is not a tuning problem.** How bright a view should be depends on light being
transported through the room, which is what the renderer does not do. It needs a real indirect
term — not a scalar, a curve or a baked map — and item (w) is where that work would live.

## ⚠️ MEASUREMENT BOUNDARY — `(l)`'s fix (v0.31.7.157) shifted EVERY region ratio by ~4 %

**Any region ratio in this document measured before `v0.31.7.157` cannot be compared with one
measured after it.** Not because the surfaces changed, but because the normaliser did.

The geometric-mask ratios are reported "normalised by their own combined mean", and **the glazing is
10 % of the `wall` sample population** (`BoxGeometry#bcd4e6`). `(l)`'s fix raises the pane from a mean
of 174.6 to 234.6, so the combined mean rises with it. Same tier, same pose, GI off in both:

| | pre-fix (`v0.31.7.114`) | post-fix (`v0.31.7.159`) |
| --- | --- | --- |
| combined mean | 98.2 | **104.0** (+5.9 %) |
| ceiling | 0.69 | **0.66** |
| wall | 1.05 | 1.06 |
| floor | 0.75 | **0.72** |

The ceiling and floor did not change; their *ratios* fell ~4 % because the denominator rose.

**What this specifically invalidates:**

- ~~**The GI's headline `ceiling 0.69 → 0.92`** (`v0.31.7.114`)~~ — **re-measured in `v0.31.7.160`:
  `ceiling 0.66 → 0.87`** post-fix, i.e. **+0.21** against the pre-fix **+0.23**. The GI's benefit
  survives the renormalisation; quote the new pair.
- `(w)`'s ceiling/wall figures and the photographic-band comparisons, all taken pre-fix.
- Any cross-session comparison of these ratios that straddles `.157`.

**It does not invalidate** the absolute glazing statistics (`> 240` shares), the frame means, or
anything measured on a crop that excludes glazing.

## (w) RASTER-INTERREFLECTION — 🐞 REAL; ✅ DECIDED 2026-09-04, see (z)9 — and `v0.31.7.131` finds it is THE SAME FIX AS THE GI, needing no separate mechanism.

> **`v0.31.7.131`: the GI path measurably reduces (w)'s spatial error, so (w) is not separate work.**
> (w)'s verified requirement is "modulate indirect irradiance PER FRAGMENT by aperture visibility,
> allowing values above 1" — which is exactly `visibilityLightmap.ts`'s shader injection, and the
> Cycles **irradiance** bake is a superset of visibility (it carries the real bounced light rather
> than the fraction of sky seen). Measured against one fresh 256-sample Cycles reference at the
> current default pose, GI the only variable: **column spread 1.48x → 1.37x, row spread 1.98x →
> 1.46x (−26 %)**.
>
> Not the 80 % the visibility candidate predicted at γ=1, and **the absolute spreads here are not
> comparable to the 4.76x/6.36x below** — different pose, different reference. What the comparison
> does establish is direction and mechanism: enabling the GI moves (w)'s own quantity the right way,
> so building a second visibility path would be fixing the same physics twice. **(w) is therefore
> blocked on the same thing the GI is** — the edge artefact parked in `v0.31.7.130`.
>
> This also resolves a tension between the decisions: `(z)`5 retires the `visibility` pass entirely
> while `(z)`9 ships (w), whose named mechanism *was* aperture visibility. They are consistent only
> because irradiance subsumes visibility — which was worth checking rather than assuming.

In the DEFAULT render path. In the DEFAULT render path; PRICED ~21 % on the ceiling, LEVER + CONSTANT VERIFIED (found v0.31.5.329, priced v0.31.5.330, lever v0.31.5.331)

> **⚠️ RE-PRICED, v0.31.7.7, CORRECTED v0.31.7.8 — a ~3× error on a whole wall, and it is
> APERTURE VISIBILITY.** *(The figures below are `v0.31.7.7`'s, taken against a reference that
> had no lamps while the raster did; the corrected, light-set-matched numbers are wall
> **2.99×** and spread **4.76×** against `bedroom3`'s 1.74×. The diagnosis is unchanged.)* Everything below prices (w) as surface *ratios* in one small room
> (`bedroom3`): ~21–25 % on the ceiling, ~14 % on the floor. Measured against a Cycles reference
> in a normal living room it is far larger. Column profile, mean luminance ÷ own median:
>
> | `livingDining` left → right | | | | | | | | | | |
> | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
> | app | **1.417** | 1.332 | 1.178 | 0.901 | 0.764 | 0.898 | 0.933 | 0.788 | 0.831 | 0.910 |
> | physics | **0.359** | 0.496 | 0.665 | 1.114 | 1.085 | 1.446 | 1.445 | 1.150 | 1.247 | 1.255 |
> | **ratio** | **3.95** | **2.69** | 1.77 | 0.81 | 0.70 | 0.62 | 0.65 | 0.69 | 0.67 | 0.73 |
>
> Spread **6.36×** and monotone (`bedroom3`: 1.65×). Confirmed by eye — the app's near-left wall
> is bright cream where physics is nearly black, same geometry and camera.
>
> **Three consequences.**
>
> 1. **No scalar can fix it.** The error is a gradient, so a uniform fill multiplier trades one
>    room against another — the measured reason `FILLSCALE` failed (`v0.31.6.9`), not a guess.
> 2. **AO cannot reach it.** N8AO is already on from `medium` up, at `aoRadius: 1.0` m. A
>    contact-scale kernel cannot produce a 4–6 m gradient.
> 3. **The right quantity is aperture visibility** — what fraction of the window each point
>    sees. The app's `HemisphereLight` + `AmbientLight` give every surface the same skylight
>    whether or not it can see the sky.
> 4. **It must modulate indirect irradiance PER FRAGMENT** (`v0.31.7.8`). Scaling the IBL probe
>    alone (`ENVSCALE`) or the analytical fill alone (`FILLSCALE`) each makes the spatial shape
>    *worse* (spread 6.97× and 10.06× against 6.36×), so both terms are equally visibility-blind.
>    A per-material `envMapIntensity` cannot reach the analytical lights, which are per-*light*.
> 5. **⚠️ But NOT via `aoMap` — corrected in `v0.31.7.17`.** The app's fill stands in for the
>    room's *average* irradiance, so the shader needs `V / mean(V)`, which **exceeds 1** wherever
>    a surface sees more sky than average. `aoMap` is capped at 1 and can only darken. Measured:
>    raw visibility gives spread 4.76× → **6.27×** (worse); normalising and clamping gives 5.71–
>    6.02× (all worse); and compensating with a global fill gain over-brightens the **267 unmapped
>    meshes** (maps cover 118 of 385). The analysis that predicted 80 % multiplied by a
>    *median-normalised* profile — mean 1 by construction — which a ≤1 multiplier was never able
>    to supply. **The mechanism must be a shader injection** (`onBeforeCompile` or a custom
>    material) allowing values above 1. Still one texture fetch and no extra pass, so
>    `v0.31.7.15`'s frame-cost measurement stands.
>
> **✅ CONFIRMED AND QUANTIFIED, v0.31.7.9 — visibility explains 80 % of the error, and a naive
> multiply regresses small rooms.** `render_visibility.py` renders the term itself (white
> Lambertian everything, **constant** white world, no sun, glazing deleted so the aperture is
> open — without that deletion the room is a sealed box and the render maxes out at 2/255).
> `spatial-profile.mjs --explain=` then tests it: multiply `app ÷ physics` by the candidate's
> profile and a correct candidate flattens the product.
>
> | | spread |
> | --- | --- |
> | `livingDining`, `app ÷ physics` | 4.76× |
> | `livingDining` × visibility, columns | **1.37× → explains 80 %** |
> | `livingDining` × visibility, rows | 1.22× → explains 69 % |
> | `bedroom3`, `app ÷ physics` | 1.74× |
> | `bedroom3` × visibility | **2.10× → explains −34 %** |
>
> The sky-lit reference's own column profile tracks the constant-world visibility render to
> ~10 % across 8 of 10 columns, from two unrelated world setups — so the reference's structure
> *is* visibility.
>
> **⚠️ SUPERSEDED by `v0.31.7.40` — there is no trade, so full strength is correct.** Measured
> through the shipped path against each room's own Cycles reference: `bedroom3` **1.74× → 1.48×**
> and `livingDining` **4.76× → 1.36×**. Both improve. The predicted `bedroom3` regression below
> was computed from the *median-normalised profile of the 64 px unconverged bake*; the shipped
> path uses the converged adaptive bake with a fitted gain, and behaves differently. The γ = 0.7
> compromise and the ≤4 % regression bound are no longer needed.
>
> **✅ STRENGTH DECIDED, v0.31.7.10 — γ ≈ 0.7.** `--gamma-sweep` on `(app ÷ physics) ×
> visibility^γ` (γ = 0 is the untouched baseline, so any γ above it is a regression):
>
> | γ | 0.0 | 0.5 | **0.7** | 0.9 | 1.0 |
> | --- | --- | --- | --- | --- | --- |
> | `livingDining` columns | 4.76 | 2.39 | **1.88** | 1.49 | 1.37 |
> | `livingDining` rows | 1.91 | 1.42 | **1.27** | 1.19 | 1.22 |
> | `bedroom3` columns | 1.74 | 1.79 | **1.81** | 2.00 | 2.10 |
> | `bedroom3` rows | 1.32 | 1.34 | **1.34** | 1.35 | 1.35 |
>
> The trade is asymmetric: the deep room improves steeply, the small room degrades shallowly
> until γ ≈ 0.8. **γ = 0.7 removes 68 % of the deep room's spatial error for a ≤4 % regression
> in the room that was already right.** A two-room fit, so a justified starting value rather
> than a settled constant — and each extra room now costs ~60 s, so widen it before trusting it.
>
> **Ship path:** bake the *starter plans* (a fixed, finite set, and the move-in default is one
> of them) offline with Blender into the `aoMap` slot; user-edited plans fall back to γ = 0,
> i.e. today's render. That dissolves the invalidation question rather than answering it, since
> a starter plan's shell never changes.
>
> **But `bedroom3` gets worse at full strength.** The direction is right and the magnitude is
> not: it lifts the app's too-dark columns past parity. So the shippable form needs a strength
> below 1, a per-room normalisation, or a blend weighted by the structure a room already has.
> **That is a tuning surface with regression risk on walk, orbit and the room editor at once**,
> which is what makes this a designed feature rather than a patch — and what the product call
> should cover.
>
> **And it must be a FULL-GI bake, not AO.** At albedo 1.0 the visibility render matches
> physics; at albedo 0.05 (near first-bounce only) it explodes to 59.7 at the window column and
> matches nothing. Short-range AO is the wrong quantity, independently re-confirming why N8AO at
> 1 m cannot substitute.
>
> **⏱ PRICED IN FRAMES, v0.31.7.15.** `tier-fps.mjs AOSTRESS=` attaches 331 distinct 64 px
> `aoMap`s + `uv1` to every shell-sized mesh and measures orbit at 1280×800 dpr 2:
>
> | tier | baseline | with maps |
> | --- | --- | --- |
> | `performance` | 60 fps / 16.8 ms | **60 fps / 16.8 ms** |
> | `medium` | 60 fps / 16.8 ms | **60 fps / 16.8 ms** |
> | `high` | 58.8 fps / 50 ms | 57.9 fps / **66.6 ms** |
>
> Free at both auto-selected tiers, so the ≥30 fps floor is not at risk. **Not free at `high`**,
> whose worst frame grows 33 % — opt-in only, so a note rather than a blocker, but "zero cost"
> was too strong.
>
> **Design constraint, found by measuring:** an `aoMap` adds **+18–19 shader programs**, and
> attaching one mid-session cost a **216 ms** compile hitch. Attach at material creation; a flag
> that toggles `aoMap` live will stutter. Read the flag where the material is built.
>
> **⛔ CONFIRMED ON PROPERLY-FRAMED EVIDENCE — v0.31.7.53.** Re-tested on a 5-Room pose that
> passes the new aperture preflight (kitchen, 3.01 % aperture, better framed than either 4-Room
> view): flag off **1.57×**, flag on **3.69×**, visibility explains **−119 %**. Across the three
> valid views the term explains +80 % / −34 % / −119 % — one in three, with failures on *both*
> plans, so it is not a plan-level property. Also measured there: the app's highlight ratio is
> **higher** than physics (1.775 vs 1.542) where in the 4-Room views it was 32–51 % *short*, so
> the sign of the error flips between views and no fixed-direction correction can serve all of
> them.
>
> **⛔ THE PREMISE HOLDS IN ONE VIEW OF FOUR — v0.31.7.48.** Running `--explain` on every view
> with a reference: aperture visibility explains **+80 %** of the 4-Room `livingDining` error
> (baseline 4.76×) and **−34 % / −153 % / −270 %** in 4-Room `bedroom3` (1.74×), 5-Room bedroom 2
> (1.55×) and 5-Room living (1.20×). Monotone in the baseline: the worse the render already is,
> the more visibility accounts for it, crossing from useful to harmful between **1.74× and 4.76×**.
>
> Measured at the *analysis* level — profile arithmetic on rendered frames, no shader involved —
> so no implementation detail explains it. A correction that only helps where the baseline is bad
> would need the reference at runtime, and gating per plan fails because the 4-Room plan contains
> both a +80 % view and a −34 % view. **So the term cannot be applied uniformly and the flag stays
> off.** The mechanical work (bake chain, keying, UV atlas, shader injection, nil frame cost) is
> verified and reusable for any future indirect-light term.
>
> **⚠️ IN-SAMPLE ONLY — v0.31.7.47.** The improvement below was measured on the same plan the
> gain was fitted against. Out of sample the term **degrades**: the 5-Room plan goes 1.20× → 2.34×
> in one pose and 1.55× → 1.69× in another, consistently in both, while the 4-Room plan improves in
> both of its poses. Per-plan gain scaling (means differ 1.71×) does not fix it, and the plans'
> visibility *spread* barely differs (cv 0.981 vs 0.914), so neither level nor structure explains
> it. `bedroom3` in `v0.31.7.40` looked like generalisation and was a different **pose of the same
> plan**.
>
> **So the flag stays off**, and the open question is well-posed: what property of a plan predicts
> how much visibility-blindness its render actually suffers? Everything mechanical is verified —
> bake, keys, contexts, shader injection, per-plan resolution, nil frame cost, all three views.
>
> **✅ DEMONSTRATED IN THE RENDERER, v0.31.7.19 — spread 4.76× → 1.46×.** With baked visibility
> applied through a patched `aomap_fragment` (a plain `texel × gain`, so the multiplier may exceed
> 1) and `Texture.channel = 1`, the app's spatial match to physics beats the analysis' own
> prediction:
>
> | gain | frame mean R | spread vs physics |
> | --- | --- | --- |
> | baseline | 115.6 | 4.76× |
> | 5 | 67.4 | 1.93× |
> | **15** | **95.0** | **1.46×** |
> | 22 | 106.0 | 1.70× |
>
> **The root cause of five rounds of failure was `Texture.channel`, which defaults to 0 (`uv`)** —
> setting `uv1` on the geometry is necessary and not sufficient, and with tiling shell UVs the map
> was read as wrapped noise.
>
> **Blocked on bake QUALITY, not on mechanism.** The render is visibly blotchy: 64 px across a 3×2
> atlas is ~0.2 m per texel on a 5.8 m wall, and gain 15 amplifies Cycles' noise 15×. Fixing it is
> offline cost only (resolution, samples, denoise) but pushes the asset from 480 KB toward ~29 MB
> uncompressed, forcing a compression/packing decision. Runtime cost is unchanged.
>
> **Which makes the fix a bake, at zero per-frame cost.** Aperture visibility is static per room
> geometry, so Blender can bake it (`bake_material.py`, Part B) and the fill can be modulated by
> it; the room shell is low-poly enough that vertex colours may carry it. Nothing per frame, so
> the ≥30 fps floor is unaffected and it reaches walk, orbit and the room editor at once. The
> open call is the **pipeline** shape — when to bake, where to store it, how to invalidate it
> when a wall moves — not whether the error is real.


**Repainting a room's walls from white to near-black changes the rest of the room's render by exactly zero.**
This is the real-time walk render — the render every user actually sees — not the HQ still. It is independent of
(l), (m), (p), (q), (r), (s) and (u), all of which concern the path-traced still.

**Code check.** Nothing in `src/scene/look.ts` or `src/scene/lighting/*` reads a wall, floor or ceiling finish.
The only "albedo" in the lighting path is `skyGradient.ts`'s *exterior* ground tint for the lower hemisphere.
The analytical fill — hemisphere + ambient + the IBL probe — is a **constant with respect to interior surface
finish**.

**Measurement.** bedroom3, `PITCH=-0.10`, medium tier, photographic look, hour 13, 16:9, raster only (no (u) to
control for). Walls repainted white → **`wall-paint-ink` `#2b3340`, a shipped finish a user can select**, via
the app's own finish path:

| patch | white walls | Ink walls | Δ |
| --- | --- | --- | --- |
| wall-L (landing check) | 140.3 | 20.9 | **−119.4** |
| floor | 75.2 | **75.2** | **0.0** |
| pillow | 153.8 | **153.8** | **0.0** |
| ~~bed-top~~ | 155.5 | 154.6 | discarded — patch clips the mattress edge (sd 11.0 → 18.1) |

Wall reflectance falls roughly **0.91 → 0.033** (≈28×, sRGB base colours decoded to linear). The floor and the
pillow do not move by one part in a thousand.

The zero is trustworthy precisely because the same frame carries a **positive landing check**: the wall itself
moved −119.4, so the intervention unambiguously fired. Per `.327`'s rule an exact zero otherwise reads as a
no-op.

**Contrast with a physically correct render of the same scene.** `.328` removed the room's bounce surfaces and
the traced window wall fell **67–85 %**. Different pose, so only the *responsiveness* is comparable, not the
absolutes — but that is the point: **the tracer is bounce-dominated and the rasteriser is bounce-free.**

**Why this matters for photorealism parity.** Interreflection is not a subtle effect in a small
high-reflectance room; it is a large fraction of the light. The app renders a charcoal bedroom exactly as
bright as a white one, which is not a shortfall in subtlety but a physically impossible result, visible to any
user who repaints a room. Every other item in this document concerns the HQ still; this one is the default
view.

**The fix direction, not decided here.** Drive the analytical fill from the room's **area-weighted mean surface
reflectance** rather than a constant — the classic room-cavity interreflection term. It is cheap (a scalar per
room, recomputed on finish change), it needs no new GPU work, and it would make the fill respond in the right
direction. But it is a **look change to the default render of every scene**, so it is a product call and is
**not being made unilaterally**. Open questions for that call: whether to scale hemisphere, ambient and the IBL
probe together or separately; whether to clamp the darkening so dark schemes stay usable rather than
photographically correct; and whether it should track the *visible* room only or the whole plan.

### ⚠️ PRICED v0.31.5.330 — and it corrects `.329`'s magnitude

`.329` filed this item on a structural finding plus two zeros. `.330` measured what the **correct** answers are,
class-matched in both renderers at one pose (bedroom3 `WALKFOV=72` `PITCH=-0.02`, medium, photographic look,
hour 13, 16:9):

| patch | raster Δ (white → Ink) | tracer Δ (class B) | raster error |
| --- | --- | --- | --- |
| **ceiling** | **0.0 %** | **−21 %** | **~21 %, the defect** |
| floor | 0.0 % | **+0.2 %** | none |
| pillow | 0.0 % | **−2.3 %** | ~2 % |
| wall-L (landing check) | −84 % | −88 % | n/a — own albedo |

**`.329`'s framing was over-strong and is corrected here.** Its structural claim stands — there is no
interreflection term, confirmed in code and by byte-identical output. But it wrote that "a charcoal bedroom
renders exactly as bright as a white one" and called that a result visible to any user, on the strength of
zeros measured at the **floor and a pillow** — the two least wall-bounce-dependent surfaces in the room, both
near the window and both dominated by direct skylight. The correct answers there are +0.2 % and −2.3 %, so the
raster is approximately right on those surfaces.

**The defect is localised to the ceiling**, at ~21 % too bright with dark walls — which is where it should be,
since the ceiling is the one surface that sees every wall and no window.

**What that means for the decision.** The fix is narrower and cheaper than `.329` implied, and the
usability tension is milder: making the *ceiling* respond to wall reflectance is a much smaller look change
than darkening the whole room, and it targets the surface carrying nearly all of the error. The open
sub-questions from `.329` still stand (scale hemisphere/ambient/IBL together or separately; clamp for
usability; visible room or whole plan), but the magnitude to aim for is now known for one pose and hour, and
**~21 % on the ceiling is the number to price against** — not a room-wide darkening.

Caveat, per this arc's standing rule: one pose, one hour, one room, one tier. The ceiling figure should be
re-measured at a second pose before it is treated as a target.

### ✅ LEVER AND CONSTANT VERIFIED v0.31.5.331 — one line, one constant

**The lever is the hemisphere's `groundColor`, not the fill as a whole.** In three's `HemisphereLight`
irradiance follows `normal·up`, so a ceiling (facing down) receives `groundColor` while a floor (facing up)
receives `skyColor`. That matches (w)'s requirement, which is ceiling-only:

| patch | uniform fill (hemi+ambient) at 0 | **ground term at 0** | tracer needs |
| --- | --- | --- | --- |
| ceiling | −59 % | **−37 %** | **−21 %** |
| floor | −11 % ❌ | **−0.1 %** ✅ | **+0.2 %** |
| pillow | −5 % | −0.7 % | −2.3 % |

Scaling hemisphere+ambient together would hit the ceiling target but darken the **floor ~4 %**, which should
not move. The ground term alone costs the floor a tenth of a percent.

**The constant.** `PHOTO_GROUND_BOUNCE` is shipped at **3.0** under the photographic look. With walls at
`wall-paint-ink`, sweeping it gives ceiling 126.9 (3.0) → 105.5 (1.29) → **100.7 (1.0)** → 79.7 (0), against a
target of 100.2. **`3.0 → 1.0` lands within 0.5 counts**, with the floor pinned at 102.4–102.5 throughout.
Collateral ≤2 % and partly beneficial — the Ink wall moves −84 % → −86 % against the tracer's −88 %.

**Shape of the relationship, not yet established.** A **27×** wall-reflectance change (0.91 → 0.033) needs only
a **3×** ground-bounce change, so the required scaling is strongly sub-linear — qualitatively expected, since
interreflection depends on ρ/(1 − ρ·f) rather than ρ. But **two points define a line, not a functional form.**
A third finish (`wall-paint-slate` ≈ 0.15) is needed before any curve is fitted, and each point costs a
class-matched tracer target (~30 min at (u)'s 4× tax).

**So the decision is now concrete.** Not "should the fill respond to finishes" but: **drive
`photographicGroundBounce` from the room's area-weighted mean surface reflectance, calibrated so white ≈ 3.0
and near-black ≈ 1.0.** Remaining product questions: the interpolation shape between those points (needs the
third measurement); whether to clamp so dark schemes stay usable rather than correct; whether to track the
visible room or the whole plan; and whether the same term should also apply outside the photographic look
(shipped ×1 there, so the response would need its own calibration).

### ⚠️ DO NOT INTERPOLATE LINEARLY — v0.31.5.332

A third wall finish refutes the two obvious interpolation models. Class-matched tracer targets, same pose:

| wall finish | ρ_wall | raster ceiling | tracer ceiling | required ground bounce |
| --- | --- | --- | --- | --- |
| white `#f5f5f0` | 0.910 | 126.9 | 116.9 | **3.0** (shipped) |
| **slate `#6a6f76`** | **0.158** | 126.9 | **90.5** | **≈0.88** |
| ink `#2b3340` | 0.0326 | 126.9 | 92.6 | **≈1.0** |

**Slate and ink are statistically indistinguishable** (2.1 counts apart, patch sd 3.4). The response
**saturates by ρ ≈ 0.16** — nearly all of it happens between white and mid-grey.

Predicted in advance and refuted: linear in area-weighted ρ_avg → 1.29; power law in ρ_wall → 1.67; naive
ρ/(1−ρ) → 0.41. Measured **0.88**. No functional form is claimed on three points.

**Consequence for implementation.** A two-point lerp between a white endpoint and a near-black one gives
**1.29 at slate against a true ≈0.88 — a 46 % error**, on precisely the mid-tone greys users pick most. The
endpoints are exact by construction and are the least interesting cases. So this item needs a **measured curve
or an explicitly saturating form**; the simplest implementation is not merely imprecise but wrong where it
matters.

Also confirmed: the raster's ceiling is **126.9 for all three finishes** (floor 102.5 likewise), so the defect
is finish-independent.

### ⚠️ DAYTIME-ONLY, AND THE NIGHT HALF IS BLOCKED ON (p) — v0.31.5.333

**The lever loses ~15× its authority at night.** Zeroing the hemisphere ground term, same pose:

| hour | ceiling GB=3 → GB=0 | authority |
| --- | --- | --- |
| 13:00 | 126.9 → 79.7 | **−37 %** |
| 21:00, lights on | 121.6 → 118.7 | **−2.4 %** |

`Lighting.tsx` scales the hemisphere by the day level (`cur.ambient * 1.1 * fillScale`), so after the night ramp
there is nothing left for a scale factor to act on.

**The defect nonetheless persists at night** — walls white → Ink at 21:00: wall-L 181.3 → 49.4 (**−73 %**,
landing check) while **ceiling 121.6 → 121.6** and floor 90.4 → 90.4, both exactly zero.

**So `.331`/`.332`'s calibration is DAYTIME-ONLY.** And at night the problem is different in kind: hemisphere
and ambient are daylight-derived and near-zero, so **no term represents lamp bounce off walls**. The night
ceiling is bright because the lamp lights it *directly*. The daytime defect is a mis-tuned constant; the night
defect is a **missing mechanism**, and this lever cannot reach it.

**Blocked on (p).** Pricing the night defect needs a physically-motivated reference, and the only one available
is the path tracer — whose environment is (p)'s two hardcoded constants with no hour dependence. The arc's hour
test already shows the consequence: raster ceiling +50 % from 13:00 to 21:00 against the traced ceiling's +8 %,
with the ratio inverting sign (0.853 → 1.181). **(w)'s night half cannot be specified until (p) is fixed.**

Implication for sequencing: if (w) is to be fixed properly rather than at midday only, **(p) should be decided
first** — and `.326` already established that a faithful hour-aware environment exists in the scene and priced
the conversion.

### ⚠️ (p) QUANTIFIED AT SOURCE — the gradient is ~31 % too dark at noon and ~77x TOO BRIGHT at night (v0.31.5.334)

The environment's own energy, mean linear luminance, measured on the canvas independently of tone mapping, of
(u), and of the renderer:

| | mean linear |
| --- | --- |
| app's own sky (`scene.background`), 13:00 | **0.433** |
| app's own sky, 21:00 | **0.0039** |
| hardcoded gradient, **any hour** | **≈0.298** |

The app's sky varies **111× across the day**; the gradient is constant (computed from
`ProceduralEquirectTexture`'s own formula, `t = (dir.y·0.5+0.5)²` → mean t = 0.375).

**So the gradient is ~31 % too dark at 13:00 and ~77× too bright at 21:00.** The midday figure independently
corroborates `.326`, whose conversion *brightened* the traced plaster — exactly what a too-dark environment
predicts.

Render-side, using (u) as an instrument (in class A the ceiling patch reads the environment directly):

| condition | class-A ceiling | R−B |
| --- | --- | --- |
| gradient, 13:00 | 175.2 | −13.8 |
| gradient, 21:00 | 156.0 | −14.7 |
| **converted background, 21:00** | **21.4** | **+3.2** |

A 7.3× drop against an −11 % hour-drift control, with the R−B sign flipping — the ceiling stops showing a
daylight sky at 9pm. (The −11 % drift under a provably constant environment is a separate small finding:
something else tracks the day level, most likely tone-mapping exposure.)

**Decision impact.** `.326`'s conversion is not merely a level correction at midday — it repairs the
**structural** hour-blindness, which is what `.333` identified as blocking (w)'s night half. So the sequencing
argument is now quantified: **deciding (p) unblocks (w) at night.** It does not by itself establish that the
tracer's night render is correct, only that its environment is hour-appropriate, which is the precondition for
using it as a reference at all.

### ⚠️ THE NIGHT DEFECT IS BIGGER AND BROADER — 28 % ceiling, 26 % floor (v0.31.5.335)

Priced against an hour-appropriate reference (converted `scene.background`, since the shipped gradient is 77×
too bright at 21:00 and would understate the answer). Both conditions class B:

| patch | white | Ink | tracer Δ | raster Δ | night error | daytime error |
| --- | --- | --- | --- | --- | --- | --- |
| **ceiling** | 177.3 | 127.8 | **−28 %** | **0.0** | **28 %** | 21 % |
| **floor** | 138.3 | 103.0 | **−26 %** | **0.0** | **26 %** | **~0 %** |
| wall-L (landing) | 205.0 | 53.7 | −74 % | −73 % | n/a | n/a |

**The defect spreads at night.** At midday it is ceiling-only — the floor has no defect because it is dominated
by direct skylight. At night nothing is direct, so every surface is bounce-lit and every surface is wrong.
Broader in extent, not merely larger in degree.

**Decision content.** With ~26–28 % error on every surface and a lever that has **2.4 % authority** at night
(`.333`), the night case cannot be reached by retuning a constant. It needs a **new term** — lamp bounce scaled
by fixture output × room reflectance. That is materially more work than the daytime one-liner. The trade is:

- **daytime only** — one line, `photographicGroundBounce` driven by room reflectance, curve to be measured
  (`.331`, `.332`); leaves a ~26 % error every evening, and the same code path in place would make it look
  handled;
- **both** — add a lamp-bounce term; covers the larger and broader half of the defect at real cost.

Sequencing: **(p) → (w) daytime → (w) night.** (p) first because it is what makes the night case measurable at
all, and it already has a priced fix (`.326`).

### ✅ THE CURVE, FROM FOUR FINISHES — `GB = max(0.9, 3.3·rho_wall)` (v0.31.5.337)

| finish | rho_wall | required ground bounce | `max(0.9, 3.3·rho)` | residual |
| --- | --- | --- | --- | --- |
| white `#f5f5f0` | 0.910 | **3.00** (shipped) | 3.00 | — sets the slope |
| **stone-grey `#a8a6a1`** | **0.382** | **1.26** | **1.26** | **−0.00** |
| slate `#6a6f76` | 0.158 | 0.88 | 0.90 | −0.02 — sets the floor |
| ink `#2b3340` | 0.0326 | 0.99 | 0.90 | +0.09 |

Slope from the **white point alone**, floor from slate — so **stone-grey and ink are unused by the fit and both
land within 0.09 GB.** Two confirmations rather than four knobs.

**Not pre-registered.** The models registered in advance were chord-linear (1.51) and log-linear (1.95), and
both failed, over-predicting. Proportionality-with-a-floor is a form that fits, and it makes an out-of-sample
prediction that has **not** yet been tested: `wall-paint-oat` (rho 0.617) → **GB ≈ 2.04**. Treat the form as
provisional until that is measured.

**Why the obvious implementation is wrong.** A chord between the endpoints (0.910, 3.0) and (0.033, 1.0) is not
proportionality, and the two diverge most in mid-range — exactly where the shipped palette sits. Of 19 wall
finishes, twelve are above rho 0.15, and the three genuinely dark ones (petrol 0.090, graphite 0.067, ink
0.033) are all in the flat zone where the response has already saturated.

**So the implementable form is two lines**, with a hard floor rather than an interpolation table:

```
photographicGroundBounce = max(0.9, 3.3 * meanWallReflectance)   // daytime only
```

Caveats that stand: one pose, one room, one tier, **daytime only** — the lever has 2.4 % authority at night
(`.333`) and the night defect is 26–28 % on every surface (`.335`), which needs a different mechanism. Room
spread on the lever's authority is ±10 % (`.336`), second-order against the 46 % error a chord would introduce.

**(w)'s zero is closed on the raster side:** four finishes over a 28× reflectance range, raster ceiling 126.9
and floor 102.5 for every one, with `wall-L` monotone at 144.6 / 104.3 / 67.5 / 22.6.

### ✅ (w) DAYTIME IS FULLY SPECIFIED AND VALIDATED — v0.31.5.338

**End-to-end validation, two finishes.** Applying the derived ground bounce in the raster and checking it
reproduces the tracer's ceiling:

| finish | GB applied | raster ceiling | target | error | floor | pillow |
| --- | --- | --- | --- | --- | --- | --- |
| ink `#2b3340` | 1.0 | 100.7 | 100.2 | 0.5 counts | unchanged | −0.5 % |
| **stone-grey `#a8a6a1`** | **1.26** | **105.0** | **105.0** | **0.0 counts** | **unchanged** | −0.4 % |

**The curve is finished to the instrument's power.** The chord model is refuted (2.7σ at stone-grey, with errors
to 0.62 GB in mid-range). The two surviving forms — `max(0.9, 3.3·rho)` and a 0.8-power law — differ by at most
**0.24 GB across the whole palette**, which is ~1.4σ per arm and would need ~18 runs to separate. They agree
closely enough that the choice does not matter. **Further tracer targets for the curve would be unfalsifiable
work.**

**So the daytime half needs no more measurement.** What is known: the defect (~21 % on the ceiling, raster
response exactly 0.0 across four finishes spanning 28× reflectance); the lever (hemisphere `groundColor`, not
the fill as a whole — a uniform fill scale wrongly darkens the floor ~4 %); its authority (−37 % to −46 % across
four rooms, ±10 % relative); the curve (proportional with a floor, four targets fit within 0.09 GB); and
end-to-end validation at two finishes to ≤0.5 counts.

**The change itself:**

```
photographicGroundBounce = max(0.9, 3.3 * meanWallReflectance)   // daytime only
```

**What is still open and needs YOUR call:**

1. **Ship the daytime fix?** It is a look change to the default render of every scene — ceilings darken in
   rooms with dark walls, by up to ~21 %. Correct, but a visible change to existing designs.
2. **Clamp for usability?** A physically correct dark scheme may be too dark to design in. The floor of 0.9 is
   a measured value, not a usability judgement.
3. **Build the night mechanism?** 26–28 % on every surface (`.335`) and unreachable by this lever (2.4 %
   authority, `.333`). Needs a lamp-bounce term — materially more work.
4. **`meanWallReflectance` scope** — visible room or whole plan; and whether the non-photographic look (where
   the term ships at ×1) needs its own calibration.

### ⚠️ USE A TABLE, NOT A FORMULA — v0.31.5.339 (supersedes the `.337`/`.338` closed form)

A fifth finish refutes the closed form, and a corrected noise estimate invalidates `.338`'s stopping decision.

**The measured curve** (class-matched class-B tracer targets, bedroom3 `WALKFOV=72` `PITCH=-0.02`, medium, hour
13):

| finish | rho_wall | required ground bounce |
| --- | --- | --- |
| white `#f5f5f0` | 0.910 | **3.00** (shipped) |
| stone-grey `#a8a6a1` | 0.382 | **1.26** |
| **clay `#b98a6e`** | **0.296** | **1.15** |
| slate `#6a6f76` | 0.158 | **0.88** |
| ink `#2b3340` | 0.0326 | **0.99** |

`max(0.9, 3.3·rho)` misses clay by 0.17 GB (**2.8 counts**, 6–28σ at the corrected noise of ~0.1–0.5 counts) and
is **refuted**. A 0.8-power law is closer at clay but collapses at ink (0.21 vs 0.99). **No two-parameter closed
form fits within noise**, and the curve has a shallow **minimum at slate** that no monotone form reproduces.

**So interpolate the table above linearly in rho.** Exact at every measured point, reproduces the minimum, and
avoids a formula that is wrong by ~3 counts in the mid-range where most of the palette sits.

Caveat: the slate/ink minimum rests on single arms 0.11 GB apart; a second arm at each would confirm it. It
does not affect the table's use, since the table reproduces whatever the points say.

**Noise correction that matters for any future work here:** daytime class-B arm-to-arm reproducibility is
**~0.1 counts** (two independent stone-grey arms: 96.7/96.7, 67.7/67.8). The 2.3-count figure quoted in `.337`
and `.338` came from a **night** pair and is roughly 20× too pessimistic for daytime comparisons.

### ⏳ STILL OPEN: is the required-GB table room-dependent? (attempted v0.31.5.340, unresolved)

`.336` established the lever's **authority** is room-stable (−37 % to −46 % across four rooms, ±10 % relative).
The required **values** have only ever been measured in bedroom3. That is the last real unknown in this item's
daytime half, and `.340` failed to close it.

**Why:** no class-matched tracer pair could be obtained at livingDining. Six arms produced white B/B and ink
A/A/A/A, so neither a class-B nor a class-A pair exists. No comparison was made rather than a contaminated one
published.

**What is settled:** the *reference* side is room-stable — the raster's livingDining ceiling reads **128.2**
against bedroom3's **126.9**, consistent with the raster's fill being finish- and room-independent. Only the
tracer side is unmeasured.

**Practical read for the decision:** the table in `.339` is measured at one room and one pose. If it is shipped
as-is, the risk is that the *magnitude* differs per room while the *shape* holds — the lever's room-stable
authority (±10 %) bounds how wrong that can be, and `.332` showed the curve's shape matters ~5× more than
per-room normalisation. So shipping the single-room table is defensible; it is not verified.

### ⚠️ THE RESPONSE IS ROOM-DEPENDENT — the single-room table is NOT transferable (v0.31.5.341)

Class-B matched pairs, traced ceiling, white → Ink:

| room | white | Ink | response |
| --- | --- | --- | --- |
| bedroom3 | 116.9 | 92.6 | **−20.8 %** |
| **livingDining** | **148.9** | **135.3** | **−9.1 %** |

A **2.3× difference**, and real: 13.6 counts against 3.1 counts of class-B reproducibility at livingDining
(white arms 147.3 / 150.4). The Ink side is n=1 and deserves a second arm.

**Mechanism, visible in the frames:** livingDining has a **ceiling-mounted fan light**, bedroom3 a table lamp.
A ceiling lit partly by a direct fixture depends proportionally less on wall bounce — and livingDining's traced
ceiling is duly brighter (148.9 vs 116.9). So the governing quantity is **the fraction of a ceiling's light that
arrives as wall bounce rather than direct**, which varies with room geometry *and* with which fixtures are on.

**Consequence for the decision.** `.339`'s five-point table is a **bedroom3** measurement. The *shape*
(proportional with a floor) plausibly transfers; the *depth* does not. So:

- shipping the table globally would over-correct rooms with ceiling fixtures — roughly 2× at livingDining;
- a correct fix scales the wall-bounce term by the bounce fraction, which needs that fraction computed per room
  (cheap in principle: it is the ratio the tracer already reveals, but the app would need its own estimate);
- the daytime "two-line change" from `.338` is therefore **understated** as a cost. It is right in shape and
  wrong in depth outside the room it was measured in.

This does not reopen the defect — (w)'s zero is confirmed at five finishes across a 28× reflectance range and
at two rooms. It reopens the **magnitude**, and it is the strongest remaining argument for measuring a second
room properly before implementing.

### ⚠️ THE ROOM-DEPENDENCE IS GEOMETRIC, NOT FIXTURE-DRIVEN — v0.31.5.342

`.341` proposed that livingDining's shallower response (−9.1 % vs bedroom3's −20.8 %) came from its
ceiling-mounted fan fixture diluting the wall-bounce fraction. **Refuted:**

| livingDining | white | Ink | response |
| --- | --- | --- | --- |
| lights on | 148.9 | 135.3 | −9.1 % |
| **lights off** (19 of 87 items flipped) | 141.2 | 129.5 | **−8.3 %** |

Removing every fixture changes nothing material. The cause is **geometric — the wall-to-ceiling area ratio**
(the room-cavity ratio of lighting design): a small room's walls subtend a far larger solid angle from any
ceiling point. bedroom3 small → −20.8 %; livingDining large → −8.3 %.

**This makes the fix MORE tractable, and it changes what to build.** Fixture state is dynamic — a
fixture-driven correction would have to change as the user flips lights. **Room geometry is static and already
in the plan**, so the scaling factor is computable, not measured. Concretely, the shape from `.339` scaled by a
per-room geometric factor derived from wall area ÷ ceiling area, rather than one global table (which would
over-correct large rooms ~2.5×) or a per-room measurement campaign.

**Next test, cheap and falsifiable:** `mainBedroom` is intermediate in size and should give an intermediate
response. `.336` already has its lever authority (−44.7 %); only the tracer target is missing.

Status of (w) overall: the **defect** is settled (zero response at five finishes over a 28× reflectance range,
two rooms). The **lever** is settled (hemisphere `groundColor`; a uniform fill scale wrongly darkens the floor).
The **shape** is measured at one room. The **depth** is room-dependent and now has a computable candidate
mechanism. The **night half** needs a separate mechanism entirely (`.333`, `.335`).

### ⏳ THE GEOMETRIC HYPOTHESIS IS UNTESTED — and hard to test in this plan (v0.31.5.343)

`.342` refuted the fixture explanation and left a geometric one (wall-to-ceiling area ratio). It is **fitted to
two points and not yet tested**:

| room | wall/ceiling | measured response |
| --- | --- | --- |
| livingDining | 2.446 | −8.3 % |
| bedroom3 | 3.278 | −20.8 % |

Two points define a line by construction. A third is needed, and this plan does not readily supply one:

- **`mainBedroom` is not intermediate** — 3.191, within 2.7 % of bedroom3. The ratio goes as `2H(1/W + 1/D)`,
  so it depends on the *reciprocals* of the dimensions; mainBedroom differs from bedroom3 only in width.
- **The kitchen (3.960) cannot be posed** — it has no window opening, and the probe's pose logic is
  window-based. Same for corridor, serviceYard and householdShelter.
- **The bathrooms (4.827, 5.337 — corrected in `.344`; `.343` used the global height and was ~8 % high) are the only well-separated points, and they are confounded**: walls are
  tiled by default (so a white baseline must be set explicitly to paint, else the comparison is tile → paint),
  and both contain a large specular glass screen and a mirror — which contribute to ceiling illumination in a
  way a wall/ceiling *area* ratio cannot represent.

**What this means for the decision.** The room-dependence itself is **measured and real** (−20.8 % vs −8.3 %,
2.3×, well clear of reproducibility). What is unproven is the *rule* for predicting it. So:

- shipping `.339`'s table globally over-corrects large rooms by ~2.5× — that much is established;
- scaling by wall/ceiling ratio is **plausible and computable from the plan** but rests on two points;
- getting a third point needs either a **different shipped plan** (HDB 2/3/5-room, condo, landed all have
  different proportions) or a controlled `wallHeight` change, which would move the ratio within a single room
  and is the cleaner experiment. Neither is built.

Ready for whoever picks it up: bath1 `PITCH=0.40`, ceiling patch `0.30,0.10,0.20,0.12` (sd 3.3), both arms on
explicit paint finishes. Registered prediction: linear-in-ratio → ≈ −50 %; strong saturation → materially less.

### ⏳ THE CONTROLLED HEIGHT EXPERIMENT NEEDS AN `src/` CHANGE (v0.31.5.344)

`.343` proposed varying ceiling height inside one room as the clean test of the geometric hypothesis. The
mechanism exists — `PlanShell.tsx:911` honours `r.ceilingHeight ?? lp.ceilingHeight`, and bath1/bath2 ship 2.4 m
overrides that render correctly — but **patching the field from the store removes the room's ceiling instead of
moving it** (ceiling patch 195.5 / R−B −27.0, i.e. the sky, identically at 1.6 and 4.2, against a 126.9
baseline).

There is no setter in `src/state/` and no UI control for per-room `ceilingHeight`; it is plan-authored data. So
this is **not** a user-facing defect — the shipped overrides work — and the experiment simply cannot be run from
the probe.

**Corrected ratios** (`.343` applied the global 2.6 to every room):

| room | wall/ceiling | note |
| --- | --- | --- |
| livingDining | 2.446 | measured −8.3 % |
| bedroom3 | 3.278 | measured −20.8 % |
| bath1 | **4.827** | H = 2.4 per-room |
| bath2 | **5.337** | H = 2.4 per-room |

Registered bath1 prediction shifts to **≈ −44 %** (linear-in-ratio), from `.343`'s ≈ −50 %.

**So the state of the geometric rule is unchanged: two points, fitted, untested.** The room-dependence itself
remains measured and real (2.3×). For the decision, that means: shipping `.339`'s table globally over-corrects
large rooms ~2.5×, and the *rule* for scaling it per room is plausible but unverified.

### (u) RATE MEASURED — p(A) ≈ 0.72, arms independent, tax ~2.1 boots (v0.31.5.345)

First unbiased estimate, from the existing record using only the **first fixed-length pair per condition**
(later pairs exist only because an earlier one lacked the wanted class, so including them biases toward B):

| | |
| --- | --- |
| first-pair sample | 13A / 5B of 18 arms |
| **p(A)** | **0.722**, 95 % CI [0.52, 0.93] |
| independence (AA / mixed / BB) | 5 / 3 / 1 vs 4.69 / 3.61 / 0.69 expected; χ² = 0.26 → **independent** |
| **tax** | **2.1 boots** per class-B arm |

**Withdrawn:** the "4×" (`.330`) and "6×" (`.337`) tax figures, and `.337`'s note that the tax was rising and
"worth watching" — P(≥5 of 6 class A) is 0.469 at this rate, so that was noise. `.340`'s p(A) ≈ 0.75 was close
but from a biased sample.

**Sharper statement of the defect.** With `.330`'s determinism result, (u) is an **independent Bernoulli draw
per `createHqRenderSession` call at p(A) ≈ 0.72, deterministic once drawn.** That excludes anything stochastic
*during* the trace **and** anything persistent *between* calls in a session — two whole classes of explanation,
on top of the ~25 candidates already eliminated.

**Decision impact:** (u) makes roughly **28 % of HQ stills** render the ceiling correctly and ~72 % show the
environment instead — or the reverse in terms of which is "correct", since `.328` established the traced ceiling
in class B is the physically sensible one. Either way it is not a rare glitch: it is the majority outcome, and
any user exercising the HQ still repeatedly will see both.

### (u) RATE REFINED, AND A TIMING LEAD REFUTED (v0.31.5.346)

A census mechanism now yields **20 arms per boot** (~36 s each) rather than 2 — click **Stop** at 9 samples,
then Re-render. `.341`'s recorded bound that Re-render gives only one extra arm per boot is **withdrawn**: the
button is absent mid-render only because a render is *running*, and re-renders are ~10× slower than the first.

| | |
| --- | --- |
| **pooled p(A)** | **0.632**, 95 % CI **[0.48, 0.78]**, n = 38 |
| independence | runs test on a 20-arm sequence — 10 observed vs 10.9 expected, z = −0.42 |
| tax | 1.7 boots per class-B arm |

Supersedes `.345`'s 0.722. **A setup-time race — the leading remaining hypothesis — is refuted**: rapid-cycled
re-renders (11/20) and converged first renders (13/18) draw from the same distribution (two-proportion
z = +1.10, p ≈ 0.27). An unguarded first census suggested otherwise (p(A) = 0.35), but that was stale frames
being counted twice; the guard requires the sample counter to reset before an arm counts.

**So (u) stands as:** an independent draw per `createHqRenderSession` call at **p(A) ≈ 0.63**, deterministic
once drawn, with no dependence on session timing, no clustering, and ~26 candidate causes eliminated. It affects
the **majority** of HQ stills, so it is not a rare glitch.

### ⚠️ (u) IS NOT BINARY — class A hides intermediate arms (v0.31.5.347)

Two 20-arm censuses. The A/B rate shows **no room-dependence** (bedroom3 11A/9B, livingDining 14A/6B;
two-proportion z = +0.98, p ≈ 0.33 — power-limited, so bounded rather than disproved). Pooled **p(A) = 0.655,
CI [0.53, 0.78], n = 58**.

**But class A is not a single state:**

| room | class-A arm luminance |
| --- | --- |
| bedroom3 | 175.6 × 11 — identical to the decimal |
| livingDining | 169.4, 168.0, 167.7, 167.9, 168.0, **152.1**, 168.0, **161.8**, … |

~14 % of livingDining's class-A arms sit well below the cluster. Those are **intermediate** arms — partial
coverage, not the whole ceiling — which the binary classifier assigns to A because their R−B is still negative.

This restores `.293`'s reading ("one spatially varying cold cast whose extent varies") and the early ~8 %
"class M" observation, both of which later rounds stopped accounting for. **Partial coverage implies a
per-triangle or per-tile decision, not a whole-surface one** — a different shape of cause than anything tested
so far.

**Two consequences for the record.** Every p(A) in this arc is a **binary projection** of a richer phenomenon:
right for pricing measurement cost, wrong for characterising the defect. And the severity statement needs
softening — it is not "72 % of stills show the ceiling as environment" but "the majority show it wholly or
partly", with the partial cases previously invisible.

Current characterisation: an independent draw per `createHqRenderSession` call at p(A) ≈ 0.66, deterministic
once drawn, **not** timing-dependent (`.346`), with no detected room-dependence, and **not strictly binary**.
~26 candidate causes eliminated.

### ⚠️ (u) IS A CONTINUUM, AND ONLY ~5 % OF STILLS ARE CLEAN (v0.31.5.348)

Mapping the **spatial extent** per arm (`PTGRID`, 8×3 over a verified clean ceiling rect, 20 arms) retires the
two-state model this document has carried since `.303`:

| arm class | cells affected | |
| --- | --- | --- |
| A (11 arms) | **24/24 every time** | uniform |
| B (9 arms) | **0, 3, 4, 4, 4, 6, 7, 10, 11** of 24 | wedge at the same corner |

| | |
| --- | --- |
| fully affected | **55 %** |
| partially affected | **40 %** |
| **unaffected** | **5 %** |
| mean affected fraction | **0.65 of the ceiling** |

**"Class B" never meant "the ceiling is correct"** — 8 of 9 class-B arms are partially affected. A single patch
mean only reports whether *that rect* fell inside the affected region, which is why fifty rounds of measurement
saw two clean classes.

**Severity is worse than every previous statement in this document.** Not "~72 % show the ceiling as
environment", nor `.347`'s "the majority wholly or partly", but **only about one still in twenty renders the
ceiling correctly throughout**.

**New mechanistic lead.** The boundary is **diagonal** in screen space (arm 4: col ≥ 7, ≥ 6, ≥ 4 down the
rows). Tiles would give axis-aligned rectangles; a diagonal is what a **geometry edge** projects to. With extent
varying continuously arm to arm, this points at **a variable subset of the ceiling's geometry missing from the
trace, anchored at one end of an ordering** — i.e. a truncated or partially-built merge/BVH, not a shading
fault. That is a different shape of cause from anything among the ~26 candidates eliminated so far.

**Every rate figure in this document is a binary projection** (`.345` 0.722, `.346` 0.632, `.347` 0.655). They
remain valid for pricing measurement cost — a "class-B arm" is still one whose measured patch is unaffected —
but they are not a characterisation of the defect.

Caveats: 8×3 is coarse, one room, one pose, and the corner anchoring has not been re-tested against a different
rect placement.

### (u) EXTENT IS ROOM-DEPENDENT; NO CLEAN ARM AT bedroom3 (v0.31.5.349)

A 12×5 grid (60 cells) at bedroom3 `PITCH=0.30`, 11 arms (partial census):

| arms | cells affected |
| --- | --- |
| 9 | 60/60 — fully affected |
| 2 | **1/60** — a single corner cell |

**The rate is room-invariant but the extent is not.** `.347` found no room-dependence in the A/B rate
(z = +0.98); here bedroom3 is near-binary (60/60 or 1/60) against livingDining's graded 0–11 of 24. Two separate
quantities; only the rate has been shown invariant.

**`.348`'s "~5 % of stills are clean" does not generalise.** It came from one livingDining arm at 0/24. At
bedroom3, **0 of 11 arms** render the ceiling correctly throughout — both class-B arms have a corner cell
affected. So the clean fraction is room- and pose-dependent and may be lower than 5 %.

**Corner anchoring survives a placement change** — the single affected cell is at the same corner as
livingDining's wedge, in a different room, pose and rect. That weakens the "artefact of my rect" explanation
without eliminating it.

**Still open: tile vs geometry edge.** A single cell has no shape, so the finer grid could not distinguish them
here. Needs livingDining (graded extents) at 12×5 or finer.

### ⚠️ (w) RE-MEASURED AGAINST PHYSICS — bigger, and NOT ceiling-only (v0.31.6.6)

First measurement against a **physically-motivated reference** rather than against the app
itself: Blender Cycles with the `MULTIPLE_SCATTERING` atmospheric sky, placed by the app's
own sun vector, lighting the app's own exported geometry at the app's own camera. Derived
sun elevation 83.53° — correctly near-overhead for Singapore at 13:00.

bedroom3, white → `wall-paint-ink`, identical camera and sun for both arms:

| surface | raster (app) | HQ tracer (`.330`) | **Cycles (physical)** |
| --- | --- | --- | --- |
| ceiling | 0.0 % | −20.8 % | **−25.3 %** |
| floor | 0.0 % | **+0.2 %** | **−13.6 %** |
| wall-L (landing check) | −84 % | — | **−84 %** ✓ |

**Three corrections to this document:**

1. **(w)'s magnitude was understated ~22 % relative.** The ceiling target is **−25.3 %**.
2. **`.330`'s "the floor has no defect" is wrong.** Physics says the floor responds
   **−13.6 %**; the raster is ~14 % off there too. (w) is **not** a ceiling-only defect, and
   the framing that made it one came from the HQ tracer, whose environment is hardcoded and
   hour-blind (`.334`).
3. **`.331`'s lever choice inverts.** Scaled to the corrected ceiling target, the hemisphere
   **ground term** moves the floor **0.1 %** and the **uniform fill** moves it **4.7 %**,
   against a physical **13.6 %**. `.331` picked the ground term *because* it left the floor
   alone and rejected the uniform fill *for* darkening it — reasoning that rested on the
   tracer's +0.2 %. **Neither lever is sufficient**; the ground term's selectivity is now a
   defect rather than a feature.

**So (w)'s implementation is reopened.** The five-point table (`.339`) and the two-line
ground-bounce change (`.338`) were both derived against the HQ tracer and are ceiling-only by
construction. A fix that satisfies physics has to move the floor too.

**New, and a look call rather than a bug: the app is far warmer than physics.** Ceiling R−B
is **+11.5** in the raster against **−39.4** in Cycles — a 51-count swing. Under a
near-overhead sun with a north-facing window the room is lit by cool skylight. Part of the
gap is a deliberate white-balance tint (`look.ts`), but it is much larger than any tint this
arc has priced, and colour cast reads as "not photographic" before any luminance error does.

Caveats: one pose, one room, one hour; only ratios compared (Cycles' absolute exposure is not
matched, and need not be — a response ratio is exposure-invariant); the sky/sun balance uses
the atmosphere model's own defaults rather than anything fitted.


---

## (z) DECIDED — sixteen calls made 2026-09-04, in one sitting

Every open decision in this document was put to the user as a question and answered. Recorded here
because a decision that lives only in a chat log is not actionable, and because several of these
**reverse or supersede** the framing the items above were written under.

**Standing note on the two that changed shape.** `(y)6` asked whether the visibility-lightmap flag
should come on; its blocker — "the runtime path that **replaces** the ambient term rather than
multiplying it" — now exists and is measured (`v0.31.7.106`). And `(l)`'s remaining look call is
decision 4 below.

### ⏱ STATUS after the 2026-09-04 overnight run (`v0.31.7.114`–`.141`)

Written because the sixteen decisions below were answered before ~30 commits of work on them, and
several turned out to mean something different once implemented. **Read this before the tables.**

| # | decision | where it actually stands |
| --- | --- | --- |
| 1 | GI on `realistic` | ✅ **ON, and re-baked `.183`** — the bake was deleting the window glass, so it lit a room whose windows were holes (`.181`). With `--keep-glazing` one gain fits a wall AND a ceiling (3.20 vs 4.01, was 7.3 vs 32.0), which is what `.170`'s "no single gain" actually meant. Wall 69 %, ceiling 27 %, floor 58 % of their Cycles deficits closed. Earlier: ✅ **ON as of `.176`** — cause of the black floor found (`.175`: the injection patches a MATERIAL, `uv1` is per GEOMETRY) and guarded; re-enabled on a 44-frame/11-room sweep whose only darkening (`kitchen-y2`, −5.2) a Cycles reference shows is correct in direction (app 204.5 vs Cycles 48.3). Floor 99.8 → 99.8, wall 79.9 → 141.2, ceiling 66.8 → 89.9. Earlier: ⚠️ **SHIPPED `.169`, REVERTED `.174`** — the GI crushes the FLOOR (wood 126.7 → **24.4**, warm cast lost, R−B +26.9 → −4.5), which was never measured before shipping. Worse than the 40-95-count deficits it fixes. Prior detail: **SHIPPED `v0.31.7.169`** — flag ON, validated against Cycles at two poses (acLedge wall lands 2.1 counts from the reference; bedroom3 wall/ceiling close 53 %/17 % of a 70/94-count deficit; the app is 40-95 counts too DARK indoors). Accepts a 5.5-count seam to fix a 40-95-count deficit. Cost: p50 +0.4 ms, fps −0.5. Prior detail: **Infrastructure shipped and verified.** Seam **diagnosed** `.164` (coverage by class: 52 of 1122 meshes mapped) and **sized** `.165` at a **5.5-count step (~3 %)**; two mitigations built and rejected (shader lift hit the target but stalled **2100 ms** compiling; fill scale was free and provably targeted but moved **≤1 count**). **`.166`: the seam was never the blocker.** An 11-room tour found a mapped exterior wall over-brightening **163.7 → 229.3 (+65.6 counts)** while its neighbours in the same frame move +0.4 and 0.0 — a per-surface reconstruction error, worst in rooms open to the sky. **⚠️ `.168` CORRECTS `.166`/`.167`: a Cycles reference at that pose says the GI is RIGHT.** extWall — app GI-off **163.7**, app gain 6 **229.3**, **Cycles 231.4**; far-wall control 210.5 vs 214.5 in every arm. The shipped gain matches the reference to **2.1 counts** and GI-off is **67.7 too dark**, so `.166`'s "defect" was the fix. `.167`'s gain sweep used GI-off as its target, which is the thing being corrected, so the interior gain is unvalidated rather than fitted at 2.8-3. Its measurements stand; the inference does not. **`.167` separated them.** The maps are clean (all 40 peak at exactly 250, zero saturated texels; the 22 near-identical scales each just contain a texel seeing full sky). The reconstruction is not: `(250/255) x 2.919 x VISIBILITY_GAIN 6` = **17.17**, an indirect diffuse of ~4.4 linear, ~4x a white surface in full sun. `VISIBILITY_GAIN = 6` was fitted for a `multiply`-mode VISIBILITY map and has no derivation in `replace` mode. Interior rooms are level-neutral at gain **2.8–3**; sky-exposed rooms are still +10 at gain 1, so that is a second, separable question needing a reference at that pose. |
| 2 | 40 maps, 1.2 MB | **Superseded.** You re-decided for 333 maps after `.114` showed my "no seam at this coverage" was measured at the wrong tier. Baked (10 MB, 0 clipped, 50 % coverage) — **and the seam persists at both**, so coverage was not the cause. |
| 3 | Commit maps to the repo | **Done** — the 40-map set is `public/assets/lightmaps`. |
| 4 | Cycles sky + `backgroundIntensity ≈ 4` | ❌ **MEASURED AND DECLINED `v0.31.7.163`** — its premise was spent by `(l)`'s fix. See the block below. |
| 5 | Delete the `visibility` pass | ✅ **DONE `v0.31.7.185`.** Operator, mode type, cache-key half, `VISIBILITY_GAIN`/`gainForPlanMean` all removed; a non-irradiance index is now REFUSED rather than given an operator. Verified byte-identical (0.000 counts). The bake's `--pass visibility` is kept as a measurement tool. |
| 6 | Reproduce the 1459 ms load hitch | **Not started** (n=1). |
| 7 | `dprMax` 2 → 1 as last rung | **Not started.** Largest unused perf lever (4.5×). |
| 8 | Twilight fully physical | **Re-scoped by you to below-horizon, then shipped** (`.116`). Black-band onset moved −4° → −8°; **cannot go further in that scope** — physical twilight at −2° wants 7× the app's own horizon sky. |
| 9 | Ship `(w)` | **Not separate work.** `(w)` and the GI are one fix (measured: GI cuts `(w)`'s row spread 1.98× → 1.46×), so it is **blocked on the same seam**. Also resolves a contradiction between this and decision 5. |
| 10 | Ship `(r)` | **Cube route REFUTED** on the shipped asset without re-authoring. Needs a route call: backdrop-as-geometry, or accept. |
| 11 | `(s)` luminance-only | **Architecture validated** — buckets reconstruct ρ to **1.1 % out of sample**, reference re-derived in Cycles (−17.4 % traced). **Not wired**; it is a *within-room delta*, not a between-room level, and the wall classifier is parked at 42 %. |
| 12 | `(m)` vignette on all tiers | ✅ **SHIPPED AND VERIFIED** — centre byte-identical, corners 133 → 107, no measurable fps cost. |
| 13 | Fix all five HQ defects | **Not started.** |
| 14–16 | `(f)`, `(g)`, `(i)`, `(j)` plan fixes | **Not started.** Scope, from the summary table: `(f)` **9 templates** with unenclosed bathrooms, `(i)` **3 left** and none offset-fixable, `(j)` **11 of 78**. |
| — | `(h)` — I closed it in error | **REOPENED `v0.31.7.145`.** 12 of 44 remain and `.120` proved none is offset-fixable; I generalised from three worked examples without checking the count. |

### ❌ `(z)`4 is CLOSED as declined — measured `v0.31.7.163`, and it is a premise failure

Decision 4 (ship the Cycles sky keys **and** `backgroundIntensity ≈ 4`) was answered to close `(l)`:
the window read as a panel rather than an opening because the pane was too DARK. **`(l)` was then
fixed by a different lever** — the `d³ · 5.2` glass sky-catch ramp in `v0.31.7.157` — which raised
the daytime pane on its own. Applying decision 4 on top of that fix overshoots in both directions.

**First, the bound nobody had stated.** `scene.background` is painted **in walk mode only, and is
seen exclusively through a window aperture** (`SceneBackdrop.tsx`). There is no view in this app
where the sky fills the frame. That caps what any sky improvement can be worth, and it explains the
daytime null below rather than being explained by it.

Measured on clean glass (patch sd ≤ 0.6, placement confirmed on the written overlay — the first
patch set straddled mullions and a sconce reflection and gave sd 48, which is why the overlay is
not optional):

| 21:00, clean glass | base | `bgIntensity 4` | + Cycles keys |
| --- | --- | --- | --- |
| upper pane (above horizon) | 27.3 | 27.3 | **197.4** |
| lower pane (below horizon) | 79.2 | 84.4 | **155.4** |
| lamp-lit wall | 210.2 | 210.2 | 210.2 |

| 13:00, clean glass | base | `bgIntensity 4` | + Cycles keys |
| --- | --- | --- | --- |
| upper pane | 227.9 | 238.4 | **243.4** |
| lamp-lit wall | 224.8 | 224.8 | 224.8 |

Three findings, in order of how much they matter:

1. **At night the keys are a REGRESSION, and a large one.** `skyKeyBlend` clamps below its lowest
   key rather than extrapolating (deliberately — twilight is the analytic continuation's job), so
   at 21:00 the sky is the **sun-at-horizon** key: the upper pane goes 27.3 → 197.4, which is
   *brighter than the lamp-lit wall it sits in* (210.2). A sunset sky at 9pm.
2. **By day there is nothing to win.** The pane is ALREADY 227.9 of 255 after `(l)`'s fix. The
   decided configuration takes it to 243.4, i.e. further toward clipping, destroying what sky
   structure the aperture still resolves. Whole-frame at `bgIntensity 1` the two arms differ by
   **0.27–0.46 counts** (max 5–8) at 09:00 and 13:00 — the aperture is too small and too
   attenuated for a radiometrically better sky to register.
3. **The sky provably cannot light the room**, which is the one thing that held: the wall patch is
   unchanged to the count in every arm at both hours (224.8, 210.2). `skyRadiance` reaches only
   `paintSkyEquirect` and `skySurround`, both background; `backgroundIntensity` scales what is
   SEEN, never what LIGHTS. Verified, not assumed.

**Kept, not deleted:** the four keys (500 kB), `skyKeys.ts`, `skyKeyBake.ts`, `equirectToCube.ts`
and the `?skyKeys=1` / `?bgIntensity=<n>` seams. None is fetched by default, and they are a
*validated* Cycles reference for the sky — `.148`–`.150` priced their accuracy (≤1.4 % whole-frame,
≤0.67 % in the brightest decile, error independent of resolution and sample count). Throwing away a
calibrated instrument because this particular application of it lost is the wrong trade.

### ❌ A night-sky "urban skyglow" floor — BUILT, MEASURED, REVERTED `v0.31.7.163`

Worth recording because the reasoning was sound and the premise was still wrong, and because the
error was one this arc has made before: **reading a screenshot instead of measuring it.**

The night frame *looks* like a black rectangle punched in a lit wall, and night-render practice is
explicit that it should not be — "real night skies and city glow never reach pure black, so a dim
sky map keeps dark regions readable and prevents the crushed, noisy look"
(`archfine.com/rendering-techniques/night-architectural-renders`), with the sky as a low-intensity
gradient pushed deep blue against warm interiors. That last part also has a physical reading rather
than a stylistic one: a sensor balanced for the 2700 K interior renders a 6500 K exterior blue.

So I built an additive skyglow term — physical in SHAPE (aerosol-scattered ground light, brightest
at the horizon, `SKYGLOW_ZENITH_FRACTION` toward the zenith), fading in from −6° to −18° as
`skyNight` fades out, so no altitude has both strong or both absent. It is graded, not derived, and
Blender cannot supply the level either: neither Preetham nor Cycles' Nishita sky has a
light-pollution term, so a −20° reference render returns black for exactly the same reason.

**Then the measurement killed it.** The pane is not crushed. Clean glass at 21:00 spans **27.3
counts** (above the horizon) to **79.2** (below) against a 210.2 wall — ratios of 0.13 to 0.38,
inside the range the practice above recommends. The dark-top/brighter-bottom split is not an
artefact either: it is what a city night window actually looks like, dark sky over lit ground. And
the glass carries warm interior reflection (R−B +14) rather than being a dead surface.

The term's effect was **~4 counts** at 4× the amplitude I first guessed (0.008 → 45.7, 0.030 → 50.1
on the aperture mean), because most of the aperture at eye height is the GROUND hemisphere, which
the sky term does not touch. A 4-count change fixing a defect that measurement says is absent is
not worth a permanent look constant, so it is reverted rather than tuned.

**Two threads are parked with hypotheses eliminated and fallbacks identified**, not abandoned:

- **The ceiling deficit** — ⏸ **PARKED `v0.31.7.187`** with the blocker named. ⚠️ those equality gains (~6.5 / ~15 / ~41) are **RETRACTED in `.189`** — interpolated in a compressed display curve. `visGain` and rho are now both measured and correct, leaving one free term (the albedo the SHADER uses); splitting that into a bake error needs a per-surface albedo measurement, the quantity that has contaminated three fits (`.170`, `.180`, `.183`). Bounce depth and the app's direct term are both eliminated. Unblock with an albedo-only render or by reading the base-colour texture through `gi-point.mjs`'s uv path.
- **The GI seam** — ✅ **DIAGNOSED `v0.31.7.164`, no longer parked.** All six earlier refutations
  were about the UV/atlas/bake machinery and all six hold: the machinery is clean (`mapped=52`,
  `unmapped=1070`, and **zero** meshes carry `uv1` without a map). The cause is *eligibility*: the
  bake's `--min-area 3.0` takes only shell-sized meshes, so ~1000 curtain/furniture/trim meshes are
  never baked, and the shell itself is only ~50 % covered by the 40-map budget. What reads as a
  dotted seam on a narrow mesh is the silhouette of an UNMAPPED mesh beside a darkened wall — in
  the difference image it is the region where the difference is **zero**. `.114`'s coverage test
  (10 % → 50 %) could not have refuted this: it varies the budget layer, never the class layer.
  Two look-alikes were excluded by control — the curtain rod's dashes are its own faceting and are
  present with the feature OFF.
- **`(s)`'s wall classifier** — four attempts (perimeter, inward-facing, exporter tag, tag+side) all
  plateau at 42 % of the bucket actually repainting. **The fallback works**: an empirical two-export
  face diff is an exact classifier by definition, and `.139` proved those buckets reconstruct ρ.

**What shipped tonight and needs no further decision:** `(m)`; the twilight continuation; the GI
infrastructure and its gate; `--scale` / `--per-map-scale` / `--bit-depth` / `--texels-per-metre` /
`--fill-holes` / `--room-albedo` / `--portals` in the bake; `equirectToCube`; and six probe fixes,
four of which were instruments that had been reporting confidently wrong numbers.

### Blender GI

| # | decision | answer |
| --- | --- | --- |
| 1 | Ship the irradiance GI, and on which tier? | **`realistic` only.** Matches the two-mode split: `performance` stays the fast editing path. Costs ~1.4 ms p50 there, nothing measurable on `performance` (`.110`). |
| 2 | Coverage / download budget | **40 maps, 1.2 MB.** The only configuration whose frame is verified clean (`.111`). |
| 3 | Where the maps live | **Committed to the repo.** Reproducible from a clean checkout with no bake step, as the current set already is. |
| 4 | Window: Cycles sky **and** `backgroundIntensity ≈ 4` | **Ship both.** Neither works alone; together the pane lands within 0.1 pt of reference, and it is verified not to touch the interior. **This closes `(l)`.** |
| 5 | The superseded `visibility` pass | **Delete the pass, the assets and the `multiply` path entirely.** `.102` measured the operator as wrong (52–80 % of slots dark by design). Removal, not deprecation. |
| 6 | The 1459 ms load hitch (n=1) | **Reproduce first, then fix.** One observation is not enough to design against; confirm it is upload cost before hiding or pre-warming. |

### Look and render

| # | decision | answer |
| --- | --- | --- |
| 7 | `dprMax` 2 → 1 in the demotion chain | **Yes, as the LAST rung only** — it fires only once the chain has bottomed out at 29.6 fps and is still short. Worth 4.5×. |
| 8 | Twilight (three linked findings) | **Go fully physical.** Lift the sky 6–20× below 20°, close the sky/ground seam, and move the ~90-count warm cast to blue hour. This re-grades every dawn and dusk. |
| 9 | `(w)` raster interreflection, ~21 % on the ceiling | **Ship it.** Verify no double-count against the GI path first — both add interreflection. |
| 10 | `(r)` backdrops reaching the window | **Ship.** |
| 11 | `(s)` luminance-only colour fill | **Ship.** The hue variant stays falsified. |
| 12 | `(m)` vignette on all tiers | **Ship.** Needed re-deciding anyway now that tiers are `performance`/`realistic`. |

### The HQ path-traced still

| # | decision | answer |
| --- | --- | --- |
| 13 | Five open findings — `(n)`, `(p)`, `(q)`, `(u)`, `(v)` | **Invest and fix all five.** Explicitly including `(u)`, whose cause is unidentified after many rounds — this is an open-ended commitment, made with that known. `(p)`'s fix was previously built and reverted, so it starts from a measured position. |

### Plans and content

| # | decision | answer |
| --- | --- | --- |
| 14 | `(f)` `tpl-hdb-jumbo` toilets sharing the bedroom volume | **Fix.** |
| 15 | `(g)` void over the loft mezzanine rail | **Fix.** Design + cost call taken. |
| 16 | `(i)` front door opening into the Master Bedroom, `(j)` windows hidden by wardrobes | **Fix both.** `(i)` on `tpl-hdb-5room` provably cannot be done by an offset, so it is a restructure; `(j)` needs an arranger strategy, not a nudge. |

### ~~`(h)` closes without a decision~~ — ❌ **THAT WAS WRONG, see `v0.31.7.145`**

I wrote that `(h)` could close because `tpl-hdb-4room` (`.115`), `tpl-hdb-5room` (`.116`) and
`tpl-hdb-exec` (`.118`) were each fixed. **Three of fifteen is not fifteen.** The summary table at
the foot of this file records **12 of 44 still windowless**, with `.120` proving none of the twelve
is offset-fixable — each needs a new opening cut. `(h)` is open and is the largest content item on
the list.

## (y) SESSION REGISTER — six decisions from the 2026-09-03 Blender/graphics arc — ✅ ALL ANSWERED, see (z)

Every open call this session produced, with the number that decides it and where the working is.
Written because the findings are spread across ~25 CHANGELOG entries and a decision is not
actionable if you have to reconstruct it.

**None of these is a bug awaiting a fix.** Each is a trade only you can price. The bugs this session
found were fixed and shipped (`.82` the black twilight sky, `.85` the adaptive guard, `.83` 63 stale
probe defaults).

### 1. Window: ship the Cycles sky **and** `backgroundIntensity ≈ 4` — ⏳ needs a yes/no

Neither works alone. The intensity without the physical sky raises a 4×-oversaturated gradient; the
sky without the intensity stays capped at 0.0 % of glazing above 219 counts. Together the pane
distribution lands within **0.1 percentage points** of the Cycles reference (54.9 % vs 55.0 % above
219). **Verified not to touch the interior**: interior median 107.1 and mean 103.5 are identical at
intensity 1, 4 and 12, because `backgroundIntensity` scales what is *seen*, not what *lights*
(`environmentIntensity` does that). Working: `.73`, `.74`, `.76`, `.77`.

### 2. Golden hour: the sky is 6–20× short below 20° elevation — ⏳ needs a look call

Measured against ten Cycles equirects at fixed sun altitudes: ~1.2× short near overhead, **~6× at
20°**, **~20× at the horizon**. Preetham's zenith luminance is only valid for a sun well above the
horizon, and this is the model's own falloff, not a tuning error. Fixing it re-grades every dawn and
dusk in the app, and it needs **both** the zenith luminance and the `night` fade to move (at −8° the
fade is exactly 0 and forces black whatever the luminance says). Working: `.80`, `.81`.

### 3. Twilight seam: sky ~5 counts under a ground band at ~60 — ⏳ needs a look call

`.82` removed the *black* (a negative luminance silently clamped), but not the **visible hard
horizon cut**, and reading the code says why: the lower hemisphere has its own level term,
`lvl = 0.12 + 0.88 * night`, which at −3° is **0.666**. The ground holds two-thirds brightness while
the sky collapses to ~2 % of its horizon value. Closing it means lifting the sky (decision 2) or
dropping the ground (a different look change). Working: `.82`.

### 4. Twilight warmth: the app paints a sunset where physics models blue hour — ⏳ needs a look call

At elev ≈ 0 the app's horizon is **R−B +71…+76** against Cycles' **−18…+10** — a ~90-count swing. At
−1° the sun is below the horizon, so the direct path that makes a real sunset orange is blocked and
Blender gives blue hour. A stylised warm sunset may be deliberate art direction; "physics says blue
hour" is not the same as "users want blue hour". Working: `.78` (numbers), `.79` (corrected).

### 5. `dprMax` in the demotion chain — ⏳ needs a look call, and it is the biggest lever left

`.86` verified the guard now recovers `realistic` from **10.9 → 29.6 fps** automatically. That lands
*on* the 30 fps floor with nothing left in the chain. The unused lever is the largest one measured:
**`dprMax` 2 → 1 is worth 4.5× (10.9 → 49.6 fps)** — more than shadows, post and transmission
combined. It trades resolution for frame rate, which is a look decision. Working: `.84`, `.86`.

### 6. Visibility lightmaps: the flag stays off — ⏳ unchanged, and superseded in prospect

Baked aperture visibility helps one view of five and hurts four (+79 % / −64 % / … measured with the
HUD mask in `.76`). The replacement candidate now exists: **`--pass irradiance`** bakes real Cycles
direct+indirect with the scene's own materials, **23 s on the GPU**, within **5.2 %** of a
1024-sample reference, carrying **171× spatial variation between shell surfaces** (cv 139 %) against
the app's cv 8.7 %. What is missing is the runtime path that **replaces** the ambient/hemisphere term
rather than multiplying it — `.67` measured that multiplying by irradiance is *worse* than
multiplying by visibility, which is what double-counting looks like. Working: `.67`, `.71`, `.72`.

### Still genuinely open as engineering, no decision needed

- **(w)/(x) interior indirect light.** Interior sits at **107.1** against physics' **124.2** — 1.16×
  short — and is **unmoved by any background change**, which is what finally separated it from (l).
  The irradiance bake is the candidate; the shader replacement path is the work.
- **`realistic`/weak at 25.1 fps** in walk, and the whole chain bottoming out at 29.6. Decision 5 is
  the lever.

## (aa) GLAZING-LIGHTMAP — ✅ FIXED v0.33.1.0: the night "static" through the pane was the baked-GI patch on the glass, not the estate, the pane or the transmission target

At 20:00 in walk mode, standing in the living room (pose x=10.9, z=4.2, yaw 0, pitch −0.02,
`realistic` tier, lights on, estate visible) and looking at the window, the neighbour block seen
through the pane rendered as mid-grey blocky STATIC with its lit windows as blurred squares. The
memory item filed as **"night neighbour-façade grain"** is this defect.

**Mechanism.** The visibility-lightmap shader injection
(`src/scene/applyVisibilityLightmaps.ts` → `src/scene/visibilityLightmap.ts`) had been applied to
the WINDOW GLASS along with every other shell surface. In `replace` mode it writes
`reflectedLight.indirectDiffuse = (visOcclusion * visGain + lampBounce) * BRDF_Lambert(diffuseColor)`
— a fine model for a wall's diffuse plaster, but the pane is ~81 % transmission (~19 % diffuse), so
the term was sourced from a baked irradiance map sampled through a synthesised box-atlas `uv1` built
for a 2 m × 1.5 m pane — grey texel noise. By day the transmitted view swamps that noise; at night it
IS the picture. The boot log at the time read: `lightmaps: 14/76 key lookups matched (18 %), 195
maps in set, 8 face(s) mirrored, 3 material(s) CLONED off a shared one — applied to 7/38 candidates
(plan 5487e7de, 2 detached)` — the pane materials carried `userData.visLightmap / visMapUrl /
visGeneration / visLampUniform`, confirming the patch had reached the glass.

**The transmission sample itself was measured clean throughout — the bug was never there.** Three's
real transmission render target was read back at the dark-façade pixels: mean **0.00606**, sd
**0.00386**, max **0.0192** linear, alpha **1.0** — byte-identical to a clean re-render.

**One-variable arms, before the cause was found:**

| arm | removed the static? |
| --- | --- |
| hide the estate | ❌ no |
| postprocessing off | ❌ no |
| AO off | ❌ no |
| `scene.environment = null` | ❌ no |
| pane `ior` 1.0 | ❌ no |
| pane `roughness` 0 / 0.02 / 0.1 / 0.2 | ❌ no |
| `gl.transmissionResolutionScale` 0.25 / 0.75 / 1 | ❌ no |
| lights off | ❌ no |
| hide the pane meshes | ✅ yes |
| replace the pane material with `material.clone()` | ✅ yes (drops the instance `onBeforeCompile`) |

The last two arms are the tell: both remove the injected shader callback from the material without
touching the estate, the transmission target, or any post/AO/light state — pointing straight at a
material-level patch on the glass itself rather than anything the glass was rendering *through*.

**Fix.** Window panes are now excluded from the baked-GI candidate set two ways — a `userData` mark
(`apartment/walls/wallReveal.ts:markGlazing`/`isGlazing`, set on the pane meshes in `Window.tsx` and
`PlanShell.tsx`, never on frames/mullions/grilles/sills) and, belt-and-braces, any
`MeshPhysicalMaterial` with `transmission > 0` — behind the new `glazingLightmapExclude` flag
(`default: true`, `tier: 'simple'`, pure code). Excluded glazing is never counted in `candidates` and
never keyed, so it cannot become a shared-material sharer either. See `src/scene/CLAUDE.md`'s
"Baked visibility lightmaps" bullet (rule 4) for the load-bearing detail.

