# Open graphics decisions

Five items the graphics-realism sweep (`v0.31.5.20`–`.83`) measured, diagnosed, and then
deliberately did **not** change, because each one is a product or content judgement rather than a
defect. Every measurable axis is now clean — the per-class chroma/coverage ranking (`.77`–`.81`),
tier parity (`.82`), and time-of-day in the boot view (`.83`) — so these five are what remains.

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

## (b) WINDOW-TIME-INVARIANT — the world outside the window never changes

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

## (c) PLAN-SWAP-STRANDED — attached furniture is left floating when you swap to a smaller plan

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

## (d) wall-reveal POSE — near walls sit in a milky mid-band at the default camera angle

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

## Summary

| # | Item | Kind | Recommendation |
| --- | --- | --- | --- |
| a | DEFAULT-GLOOM | one-line behaviour | ✅ **SHIPPED v0.31.5.86** — guard extended to daylight |
| b | WINDOW-TIME-INVARIANT | content + flag policy | **Ship curtains open; keep `proceduralSky` pro** |
| c | PLAN-SWAP-STRANDED | structural vs interim | **Add a confirm; do NOT widen the skip** |
| d | wall-reveal POSE | design parameter | **Retune the curve for the 45° boot pose** |
| e | Curtain vs nightstand | content | ✅ **SHIPPED v0.31.5.87** — curtain narrowed + nightstands outboard |

(a) is shipped. The rest are approved and being implemented one committed round at a time; each is
marked here as it lands.
