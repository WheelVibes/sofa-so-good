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

## (f) TEMPLATE-ROOM-ENCLOSURE — ⏳ OPEN, needs a content call (measured v0.31.5.109)

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

**Recommendation — re-author the bedroom/bath wings, worst first, one template per change.** Start
with `tpl-hdb-jumbo` (the only one whose damage is frame-proven) and `tpl-hdb-3gen`, which share
the same shape: a bath wing with no partitions and a master rectangle overrunning the corridor
wall. Until then both defects are **ratcheted by name** in
`src/floorplan/templateEnclosure.test.ts`, so no new template can add another and fixing one shows
up as a required edit to the list.

---

## (g) LEVEL-ISOLATION-IN-WALK — ⏳ OPEN, needs a design + cost call (measured v0.31.5.110)

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

## (h) BEDROOM-WINDOW — ⏳ OPEN, needs a content call (measured v0.31.5.113)

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

## (i) MAIN-DOOR-ROOM — ⏳ OPEN, needs a content call (measured v0.31.5.114)

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

## (j) WINDOW-SIGHTLINE — ⏳ OPEN, needs an arranger strategy (measured v0.31.5.117)

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

## (l) WINDOW-LUMINANCE — ⏳ OPEN, needs a product call (measured .236; diagnosed .258; priced .259; qualified .260; TWO ROUTES SEPARATED .261)

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

**Why this is still not being decided here:** the fix space is unchanged in kind — brighter backdrop, a
bloom-carrying emissive pane, or a separate exposure for the backdrop — but it now has a **target**: roughly
10–100× more backdrop luminance relative to the interior. That changes shipped appearance at every hour, and
the **21:00 case `.236` recorded as already correct must not regress** (glazing 0.39 of wall, interior warm
at R−B 23.4 against a neutral pane). Root `CLAUDE.md` reserves calls like this. What has changed is that the
call is now a physical-correctness question with a number, not a look-versus-AgX trade.

## (m) PHOTO-VIGNETTE — ⏳ OPEN, needs a look call (built and measured v0.31.5.244; its counter-metric retired in v0.31.5.249)

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

## (n) HQ-LAMBERT-CEILING — ✅ FIX 1 SHIPPED v0.31.5.253; fix 2 still open (and now nearly moot)

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

## (p) HQ-FILL-RIG — ⏳ OPEN (found v0.31.5.255, proven v0.31.5.256, fix built + measured + reverted v0.31.5.257)

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

## (q) HQ-GLAZING-OPAQUE — ⏳ OPEN; fix works but is INCOMPLETE ALONE (found v0.31.5.256, built + reverted v0.31.5.257)

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

## (r) BACKDROP-LOWPASS — ⏳ OPEN, a real defect needing a render call (found .264; proven RECOVERABLE .265)

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
- **Keep `scene.background` but supply a cube texture**, which is not PMREM-converted for background
  rendering the way an equirect is. Preserves the current structure; needs the presets re-authored as cube
  maps.
- **Accept it and document it** — the presets become mood tinting rather than views, which is arguably what
  they are today.

**The call needed:** whether a legible exterior is wanted, and by which of those routes. It touches the
render path and shipped appearance for every backdrop user.

## (s) ALBEDO-FILL — ⏳ OPEN, a candidate fix with a measured recovery (built + measured v0.31.5.271)

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

## Summary

| # | Item | Kind | Recommendation |
| --- | --- | --- | --- |
| a | DEFAULT-GLOOM | one-line behaviour | ✅ **SHIPPED v0.31.5.86** — guard extended to daylight |
| b | WINDOW-TIME-INVARIANT | content + flag policy | ✅ **SHIPPED v0.31.5.88 + v0.31.5.92** — curtains open; default backdrop now the sun-driven sky |
| c | PLAN-SWAP-STRANDED | structural vs interim | ✅ **SHIPPED v0.31.5.90** — confirm now names the count; skip untouched |
| d | wall-reveal POSE | design parameter | ❌ **CLOSED v0.31.5.89** — no defect; premise retracted |
| e | Curtain vs nightstand | content | ✅ **SHIPPED v0.31.5.87** — curtain narrowed + nightstands outboard |
| f | TEMPLATE-ROOM-ENCLOSURE | content | ⏳ **OPEN v0.31.5.109** — 9 templates ship unenclosed bathrooms; ratcheted by test |
| g | LEVEL-ISOLATION-IN-WALK | renderer design + cost | ⏳ **OPEN v0.31.5.110** — walking an upper storey hides the one below; acute on `tpl-loft` |
| h | BEDROOM-WINDOW | content | ⏳ **OPEN v0.31.5.113** — was 15 of 44; **12 left**; `.120` proved NONE of the 12 is offset-fixable — each needs a new opening |
| i | MAIN-DOOR-ROOM | content | ⏳ **OPEN v0.31.5.114** — was 8; **3 left** after `.115`, `.118`, `.119`, `.120`; all 3 proven NOT offset-fixable |
| j | WINDOW-SIGHTLINE | content | ⏳ **OPEN v0.31.5.117** — **11** of 78 after `.121` shipped a windowless-wall preference for storage; three arranger levers measured, the residue is rooms too small to fix |
| k1 | WINDOW-SKY-DARK | render bug | ❌ **CLOSED v0.31.5.128** — mis-attributed. The `auto` tier ends at `high`, so the transmissive pane was correct; the dark pane was (k2) rendered by two tiers. Both tiers now read ~195 |
| m | PHOTO-VIGNETTE | look call | ⏳ **OPEN v0.31.5.244** — built, measured and reverted. Extending the lens vignette to the photographic look on the AO-only composer matches the PHOTO-GRAIN precedent and the tier that already ships it, but costs wall falloff 0.74 → 0.66 against a 0.85–0.86 photographic reference |
| l | WINDOW-LUMINANCE | render + product look | ⏳ **OPEN v0.31.5.236**, figures corrected in `.237` — photographs clip 15–39 % of their glazing; the app clips **0.0 %** at every hour, so the pane reads as a panel not an opening. Night (21:00) is already correct and must not regress |
| k2 | DAYLIGHT-GLASS | render bug | ✅ **SHIPPED v0.31.5.127** — the glass read the lamp switch, not the sun, so a fresh visitor met night glass at midday; now keyed off sun altitude, midday pane 139 → 206 with the warm interior intact and the night look preserved |

**Five of eleven items are resolved** — four shipped ((a), (b), (c), (e)) and one closed as no defect
((d)). Each was implemented in its own committed round and marked here as it landed. **(f), (g), (h), (i), (j) and (k) are open.** (h) and (i) share one cause and should be fixed together; (j) was created by fixing (h) and needs an arranger strategy, not a bigger keep-out.
Neither is a one-line answer: (f) is a request to re-draw shipped floor plans, scoped per template
rather than decided once, and (g) is a renderer change whose cost must be benchmarked on the
weak-device tier before it lands. (k) is the only open item that is a genuine RENDER bug rather
than a content or policy call — it is the strongest candidate for the next round, once the loss has
been attributed to the glass or to the background tone-mapping path.
