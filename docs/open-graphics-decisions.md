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

**Recommendation — the offset-fixable phase is nearly exhausted.** Scan each remaining entry's walls
before assuming; expect most to be façade decisions like these two. Consider giving `perimeter()` a
consistent winding as part of the last such change. The remaining 12 stay **ratcheted by name** in
`src/floorplan/bedroomWindow.test.ts`.

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

**Recommendation — continue with (h) per plan, but scan the wall FIRST.** Where a living-category
room touches the door's wall, it is a one-number mirror; where it does not, it needs a façade
decision and should stay here. Of the 5 remaining, `h5-main` and `g3-main` are already **proven**
unfixable. The rest stay **ratcheted by name** in `src/floorplan/mainDoorRoom.test.ts`.

---

## (j) WINDOW-SIGHTLINE — ⏳ OPEN, needs an arranger strategy (measured v0.31.5.117)

**What you would see.** Walk into `tpl-hdb-4room`'s or `tpl-hdb-5room`'s master bedroom after
`.115`/`.116` gave each of them a window, and the glass is **not visible from the room centre in any
of the four yaws** — a 2.1 m 3-door wardrobe stands about 0.8 m in front of it. The daylight gets
in (both rooms measurably brightened); the view does not.

**The size.** Across the 19 templates, **12 of 78 windows** (11 when first measured in `.117`; `.118` added one, see below) have a floor piece taller than the sill
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

**Recommendation — try a narrower wardrobe in tight rooms before touching the keep-out again.** The
measured blocker is the piece's 1.8 m width against a ~3.5 m wall that also carries a window and a
bed. Until then the 12 are **ratcheted by name** in `src/layout/windowSightline.test.ts`, which also
asserts that 66 of the 78 windows are clear so it cannot pass by measuring nothing.

---

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
| h | BEDROOM-WINDOW | content | ⏳ **OPEN v0.31.5.113** — was 15 of 44; **12 left** after `.115` (4-room), `.116` (5-room), `.118` (exec); ratcheted by test |
| i | MAIN-DOOR-ROOM | content | ⏳ **OPEN v0.31.5.114** — was 8; **5 left** after `.115`, `.118`, `.119`; `h5-main` and `g3-main` proven NOT offset-fixable — façade decisions |
| j | WINDOW-SIGHTLINE | arranger strategy | ⏳ **OPEN v0.31.5.117** — **12** of 78 windows have tall furniture in front (`.118` added one as a trade); the deeper-keep-out fix was measured and reverted (it deleted wardrobes) |

**Five of ten items are resolved** — four shipped ((a), (b), (c), (e)) and one closed as no defect
((d)). Each was implemented in its own committed round and marked here as it landed. **(f), (g), (h), (i) and (j) are open.** (h) and (i) share one cause and should be fixed together; (j) was created by fixing (h) and needs an arranger strategy, not a bigger keep-out.
Neither is a one-line answer: (f) is a request to re-draw shipped floor plans, scoped per template
rather than decided once, and (g) is a renderer change whose cost must be benchmarked on the
weak-device tier before it lands.
