# The app has no deep shadow — measured against real interior photographs (v0.31.5.134)

*Round `.134`. Follows `2026-08-30-photoreal-round2-gap.md`, whose per-room-bounce lever was built,
measured at two hours, refuted and reverted in `.133`.*

## Method

The brief was to look at real reference imagery and compare, rather than reason from memory. Two
freely-licensed interior **photographs** were pulled from Wikimedia Commons (Unsplash returns 401 to
scripted fetches) and compared against the app at its **maximum** tier — its ceiling, not its
default — walking the boot flat at 13:00 (`/tmp/tw31`, resolved `maximum/on/manual13`, 44 frames,
354 meshes / 117531 tris). Luminance percentiles over the app frame's central region (UI chrome
cropped out) and over each whole photograph.

| source | p01 | p05 | p50 | p95 | p99 | range | %<40 | %<64 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **app, maximum tier, `livingDining-y0`** | 55 | 104 | 179 | 220 | 238 | 183 | **0.5** | **1.4** |
| photo — polished-tile living room | 24 | 44 | 189 | 215 | 220 | 196 | 3.6 | 12.2 |
| photo — living room, Accra | 16 | 42 | 155 | 205 | 231 | 215 | 4.4 | 11.2 |

## The finding

**Midtones and highlights already match; the shadows do not.** The app's p50 (179) sits between the
two photographs (155, 189) and its p95 (220) is squarely in their range (205–215). But both
photographs put **11–12% of their pixels below 64** and **3.6–4.4% below 40**, while the app puts
**1.4%** and **0.5%** there — close to an order of magnitude less deep shadow. The app's *5th
percentile* (104) is brighter than the darkest fifth of either photograph.

So the app is not failing at exposure or at highlight roll-off. **It is failing to be dark
anywhere.** A picture whose blacks never close is one of the most legible "this is CG" cues there
is, and it is exactly the axis a viewer reads as "flat" without being able to name why.

Note this is the *inverse* of the failure mode the GI literature warns about ("without global
illumination shadows are pure black and the scene looks lit by spotlights in a void"). This app has
the opposite problem: so much fill that nothing closes.

## What is NOT yet established

**Which lift is responsible.** There are at least four plausible contributors and they have not been
separated:
1. **Lamps forced on at every hour** — `ensureDaylightFirstPaint` (DEFAULT-GLOOM, `.86`) switches
   the fixtures on at *any* hour on a fresh seed, and that decision was itself taken on measured
   evidence (2.3–2.5x in the daytime walk view). It adds fill everywhere.
2. **The analytical fill** — ambient + hemisphere, deliberately sized so "nothing crushes to black"
   (`Lighting.tsx`'s own comment).
3. **The IBL probe** — `SceneEnvironment.tsx`'s Lightformers.
4. **AgX** — the view transform lifts and desaturates near-black by design (TONE-CURVE-CHOICE).
**Do not touch any of them before attributing.** Several were chosen deliberately on measurements
recorded in `open-graphics-decisions.md`, and at least one (DEFAULT-GLOOM) was a product decision
the user signed off. A round that darkens the picture by undoing a legibility fix is a regression,
not a realism win — the target is *depth in the darks*, not a dimmer room.

## ✅ ATTRIBUTED (v0.31.5.135) — it is the lamps, and the reason is that daylight cannot carry the room

`scripts/dev-probes/shadow-attrib.mjs` holds ONE session at ONE pose (the `getRoomEditorShell`
centre of `livingDining`, eye height, yaw 0, pitch −0.05 — directly comparable to `/tmp/tw31`) and
mutates only the store between shots, resetting to baseline before each arm. Every arm printed a
distinct resolved state, so none was a failed mutation. Maximum tier, 13:00, same crop as above.

| arm | p01 | p05 | p50 | p95 | %<40 | %<64 |
| --- | --- | --- | --- | --- | --- | --- |
| `a-baseline` | 50 | 101 | 180 | 220 | 0.7 | **1.7** |
| `b-lamps-off` | 3 | 49 | 112 | 191 | 4.2 | **7.8** |
| `c-ibl-off` | 49 | 100 | 179 | 220 | 0.7 | **1.7** |
| `d-tone-linear` | 44 | 95 | 173 | 215 | 0.8 | **2.1** |
| `e-lamps-and-ibl-off` | 1 | 39 | 116 | 190 | 5.0 | **9.2** |
| *photo — polished tile* | 24 | 44 | 189 | 215 | 3.6 | *12.2* |
| *photo — Accra* | 16 | 42 | 155 | 205 | 4.4 | *11.2* |

**The fixtures are the dominant lift by a wide margin**: switching them off takes `%<64` from 1.7 to
7.8, a 4.6x increase in deep shadow. AgX contributes a little (1.7 → 2.1). **IBL is not innocent but
is invisible while the lamps are on** — arm `c` is indistinguishable from baseline, yet arm `e`
(9.2) beats arm `b` (7.8) by 1.4 points, which is what proves arm `c`'s mutation really did reach
the renderer rather than silently failing. (Worth knowing: `setQualityOverride` does NOT call
`syncIblFromTier`, unlike `setQualityTier` — the override works only because `SceneEnvironment`
re-renders off `useQuality`. Arm `e` is the evidence; without it, arm `c` would have been
unreadable.)

### The finding that actually matters — and it is NOT "turn the lamps off"

Look at what lamps-off costs. `%<64` reaches a photographic **7.8**, but `p50` collapses **180 → 112**
and `p95` **220 → 191**. The room goes dim and grey. That is precisely the DEFAULT-GLOOM failure
(`.86`) the lights-on default was measured and signed off to prevent, and `.127` measured the same
thing independently (lights off at 13:00 gave a wall of 130 against 222 with them on).

Now compare with the photographs: they have deep shadows (11–12% below 64) **and** bright midtones
(p50 155–189) **at the same time** — and they achieve it with daylight, not lamps. Our lamps-off arm
has photographic shadows but a p50 of 112, roughly 30–40% dimmer than either real room.

**So the root cause is not the lamps. It is that the app's daylight cannot carry a room on its own,
which is why the lamps are on at midday, and the lamps are what flatten the shadows.** The fixtures
are a compensation for weak daylight transport, and the flat picture is the bill for that
compensation.

That reframes the lever. **Do not darken the picture by undoing a signed-off legibility decision.**
The target is a room carried by *daylight* at midday — window light transport strong enough that the
midtones hold without every fixture burning — after which the shadows come back for free and the
lamps become what they are in a real photograph at 1 pm: mostly off. That is also exactly what the
GI literature points at (light entering a window and bouncing), and it is consistent with `.133`,
where the analytical fill turned out to be far too small a share of interior light to matter.

## ✅ MEASURED (v0.31.5.136) — the daylight does not fall off at all, and that is the problem

`scripts/dev-probes/daylight-falloff.mjs` stands **0.9 m inside the `win-livingDining-N` window
facing into the room, pitched −0.55**, so the floor recedes across the frame and a horizontal band
maps to distance from the glass. Curtains forced open; three arms reset between, each printing its
resolved state. Maximum tier, 13:00. Mean luma per band, band 0 nearest the window:

| arm | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 | near/far |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `a-daylight` (lamps off) | 108 | 120 | 115 | 104 | 96 | 103 | 113 | 124 | **0.87** |
| `b-daylight-noibl` | 82 | 98 | 96 | 93 | 98 | 105 | 114 | 124 | 0.66 |
| `c-lamps-on` (shipped) | 153 | 163 | 160 | 150 | 145 | 154 | 169 | 189 | 0.81 |

**There is no falloff.** The daylight-only arm's near/far ratio is **0.87** — the far end of the room
is *brighter* than the end next to the window. A room lit through an aperture has a pronounced
gradient; this one is flat. **The prediction going in was a steep curve meaning "the bounce is
missing"; the actual answer is the opposite and more interesting: the app's daylight behaves like
uniform ambient fill rather than like light entering through a window.** That explains both symptoms
at once — a flat distribution has no bright near-window zone to carry the midtones, so the absolute
level is low, and it has no deep zone either, so nothing is dark.

Two supporting decompositions from the same run:
- **The IBL probe lights only the window end.** Its share of daylight is **24%** at band 0, 19%,
  16%, 11%, then ~0% from band 4 inward. Deep-room light is analytical fill, not the probe.
- **The lamps compensate exactly where daylight fails.** They add **42% at band 0 rising to 53% at
  band 7** — proportionally most in the deepest part of the room. That is direct evidence for
  `.135`'s conclusion rather than an inference from it.

### The instrument gap from `.134` is closed
This is the first pose in the arc that actually shows floor (`walk-tour` is level at 1.6 m and
frames almost none). Two things are plainly visible in `/tmp/daylight-falloff/a-daylight.png` and
were not measurable before: the dining table and chair legs meet the floor with **no contact
darkening whatever**, and the floor carries **no sheen or gradient**. Both are strong "furniture is
floating / this is CG" cues, and the reference photograph has the opposite — tight dark contacts
under every leg.

**A failed measurement, recorded so it is not repeated:** an attempt to quantify the floor by a fixed
crop returned sd 53 / range 208 for the app "floor", which is furniture, not floor — a rectangle
cannot isolate floor in a furnished room. Quantifying contact shadows needs either an unfurnished
arm or a mask derived from the depth/normal buffer, not a hand-placed box.

### What this does and does not license
It does **not** license turning the lamps down — that trade was measured in `.135` and settled in
`.86`. The target is a daylight distribution with a real gradient: bright near the glass, falling
inward, with the room's own surfaces carrying the far end. That is the same lever `.133` identified
(the IBL probe is the only bounce that matters) and it remains a *baked-environment cost decision*,
not a constant to edit. The cheapest independent win visible here is **contact shadows**, which is
local, does not touch the light rig, and addresses the most legible remaining cue.

## An instrument gap found on the way

**`walk-tour` poses cannot judge floors.** The camera stands at room centre at 1.6 m with a −0.05
rad pitch, so in most frames the floor is barely in shot — the kitchen frame at maximum tier is
nose-to-cabinet with no floor at all. Real interior photography sits at a similar height but tilts
down and stands back, which is why the reference photographs are full of floor.

This matters because the most obvious single difference between the reference and the app is the
**polished floor reflecting the furniture** — sofa legs, table legs and fire tools all mirrored in
the tile, with per-tile tonal variation and a rust stain. **That comparison could not be made
fairly**, for two reasons: the app's living-room floor is `floor-vinyl-oak`, a matte vinyl that
*correctly* should not mirror anything, and the walk pose shows almost no floor in any case. Judging
floor realism needs a floor-visible pose that does not exist yet.


## Contact shadows — AO grounds corners, not furniture (v0.31.5.137)

`.136` observed that the dining table and chair legs meet the floor with no visible darkening. That
is a hypothesis about the AO pass, so it was tested rather than asserted. `daylight-falloff.mjs`
gained a **`d-ao-off`** arm (`setQualityOverride('ao', false)`) which is identical to `c-lamps-on`
except for AO, at the same floor-visible pose. Both printed distinct resolved states, so neither was
a failed mutation.

**AO is not inert** — differencing the two frames gives mean |Δ| **5.85**, max **121**, with **10.8%**
of pixels shifting by more than 15. But *where* it acts is the finding. The amplified difference map
(`/tmp/ao-diff.png`) is blazing along wall/ceiling junctions, wall-to-wall corners and object
silhouettes, and only faintly around the table and chair legs. The band profile says the same thing
numerically — AO's effect by band, b0 nearest the floor:

| b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5.5 | 7.5 | 7.5 | 8.6 | 8.6 | 7.8 | 6.2 | 4.1 |

**The effect peaks mid-frame, where the wall corners are, and is weakest at the floor.**

**This is the AO doing exactly what it was tuned to do.** `look.ts` sets
`AO = { aoRadius: 0.7, distanceFalloff: 1.2, intensity: 3.0 }` under a comment saying it is "deeper
than the old defaults so corners and recesses ground like the reference renders". A **0.7 m** radius
is the right scale for a room corner and an order of magnitude too wide for a leg-to-floor contact: a
3 cm chair leg occludes almost none of a 0.7 m hemisphere, so the pass correctly returns almost no
darkening there. The app has **broad ambient occlusion but no contact term**, and the missing tight
dark contact is what reads as "the furniture is floating".

### The candidate fix, and why it is not free
A *second, tight* occlusion term (small radius) alongside the existing corner-grounding one — not a
smaller `AO.aoRadius`, which would trade away the corner grounding that was deliberately tuned and is
working. **That means a second full-screen AO pass**, and N8AO already runs half-res below High
(`aoFullRes`). **Benchmark the cost on the weak-device tier before proposing it** (rule lxviii); if it
only ever ships on High/Maximum, say so plainly rather than describing it as a win for everyone.


## Window area-lights prototyped and refuted — and a CORRECTION to `.136` (v0.31.5.138)

### Research correction first: light portals are not what I thought
V-Ray/Corona **light portals do not add light and do not create falloff**. They are a *sampling
optimisation* that steers a path tracer's rays toward apertures to cut GI noise — "portals only tell
Corona how to sample light more efficiently", and modern V-Ray tells you to skip them entirely when
the Adaptive Dome Light is on. In a rasteriser there is no transport to importance-sample, so the
technique does not transfer at all. Recorded because the *name* makes it sound like the fix for a
missing window gradient, and it is not.

### The architectural root cause is stated in the codebase
`windowLightModifiers.ts` says the window system uses a **GLOBAL tint** and that "the final scene
attenuation **averages each window's factor across all windows**". Windows here are **modifiers of
global lights, not emitters with a position**, and there is no `RectAreaLight` anywhere in `src/`
(grepped). Whatever else is true, a window in this app cannot produce a *spatial* effect.

### The prototype, and its refutation
One `RectAreaLight` per window on the walked level — in the aperture, sized `op.width × (head−sill)`,
aimed inward, `intensity 8`. `tsc` and biome clean. Same pose and band script as `.136`:

| arm | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 | near/far |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline `a-daylight` | 108 | 120 | 115 | 104 | 96 | 103 | 113 | 124 | 0.87 |
| **prototype `a-daylight`** | 132 | 143 | 142 | 140 | 142 | 147 | 161 | 174 | **0.76** |
| baseline `c-lamps-on` | 153 | 163 | 160 | 150 | 145 | 154 | 169 | 189 | 0.81 |
| prototype `c-lamps-on` | 162 | 172 | 171 | 167 | 166 | 174 | 187 | 202 | 0.80 |

It **brightened** the room (+22% at b0, +40% at b7) and made the ratio **worse** (0.87 → 0.76). The
prototype was reverted from `/tmp/lighting2.bak`; nothing shipped.

### ⚠️ The correction that matters: `.136`'s headline was not established by its own metric
The reason the prototype "failed" exposes a flaw in the instrument. **The horizontal-band metric
measures screen regions, not distance-from-window on a consistent surface.** The high bands are the
**far wall**, which faces the window head-on; a light aimed into the room hits it at normal incidence
while the near floor gets a grazing angle, so the far bands brighten *more*. A real photograph of a
real room does the same thing — a far wall facing a window is genuinely bright.

So **`.136`'s claim that "the app's daylight has NO falloff" is not supported by that measurement**
and is withdrawn as stated. What the bands actually show is that screen brightness does not fall with
height in frame, which is what you would expect when the far region is a window-facing wall.

**What survives, and why.** The two *differential* results from `.136` are unaffected, because they
compare two arms **at the same band**, which cancels the surface-orientation confound entirely: the
IBL probe's share of daylight (24% at b0 falling to ~0% by b4) and the lamps' contribution (+42% near
the glass rising to **+53%** deepest). `.135`'s conclusion — that the fixtures compensate for daylight
that cannot carry the room — rests on those differentials and on the whole-frame histogram against
real photographs, not on the band shape. It stands.

**To actually measure falloff** the sample must be one surface at known distances — a floor-only
strip, which needs an unfurnished arm or a depth/normal mask. That is the same instrument gap already
recorded above after a fixed crop returned furniture instead of floor. Until that exists, no claim
about the *shape* of the app's daylight distribution should be made.


## ⚠️ CORRECTION to `.137` — the app DOES have a contact term (v0.31.5.139)

`.137` concluded "the app has broad ambient occlusion but **no contact term**". **The second half is
wrong.** `src/scene/ContactShadow.tsx` has existed all along — an under-furniture blob (RZ1) plus a
fainter surface decal under small decor (`furniture/surfaceDecal.ts`), ~51 planes in the default
flat — and `quality.ts` sets **`contactShadows: true` on all four tiers**, maximum included.

**Why `.137` could not see it:** that round differenced AO **on** against AO **off**. The contact
blobs were present in *both* arms, so they cancelled exactly and were invisible to the measurement.
A knock-out only reveals the thing being knocked out.

Isolating them properly (`e-contact-off`, identical to `c-lamps-on` except
`setQualityOverride('contactShadows', false)`, same floor-visible pose):

| cue | mean \|Δ\| | max | %>5 | %>15 | peak band |
| --- | --- | --- | --- | --- | --- |
| AO (`.137`) | 5.85 | 121 | 26.2% | 10.78% | b3–b4 (mid-frame corners) |
| **contact blobs** | **0.90** | **121** | **0.86%** | **0.42%** | **b2 (furniture bases)** |

The difference map shows them plainly: a bright ellipse under the dining table and another under the
floor-lamp base. **They work.** They are simply *soft and small* — locally as strong as AO (max 121)
but covering a thirtieth of the frame area, and they peak at b2, exactly where furniture meets floor,
which is the right place.

### What is actually missing, and why it may not be worth fixing
A blob is emitted at the item's **whole footprint** (`itemFootprint` → `obb.hx*2 × obb.hz*2`), so a
dining table gets one ellipse the size of its top. Nothing produces the *tight dark line* where an
individual 3 cm leg meets the floor — AO's radius is 0.7 m (tuned for corners, working as designed)
and the blob is footprint-scaled. So the accurate statement is: **the app has broad AO and a soft
footprint-scaled contact blob, but no per-leg contact line.**

**The case for adding one is now weak.** It would cost a second full-screen AO pass (N8AO already
drops to half-res below High), the grounding cue it would sharpen is already present and measurable,
and the delta is a thin line visible mainly at close range on a polished floor — which the reference
photograph has and the app's matte vinyl living-room floor correctly does not. **Recommend not
pursuing it**, and certainly not by shrinking `AO.aoRadius`, which would trade away corner grounding
that works. Note also that RD-403's wall/floor corner-AO strips were built (v0.1.0.41) and **retired**
(v0.23.1.11) for reading as hard black outlines from a plan camera, with an explicit
do-not-reintroduce in `scene/CLAUDE.md`.

### Where that leaves the arc
Contact grounding is **not** the gap. The finding that remains solid and unexplained-away is `.134`'s:
whole-frame deep shadow is ~10x short of real photographs (`%<64` 1.4 vs 11.2–12.2), and `.135`
attributed the dominant lift to the fixtures — which must not simply be dimmed, because that trade
was measured and signed off. The real lever is still making **daylight carry the room**, and that is
blocked on an instrument: a floor-only sample at known distances (unfurnished arm or depth/normal
mask), without which no claim about the *shape* of the daylight distribution is admissible.


## ✅ RE-ESTABLISHED on a sound instrument: the daylight really is flat (v0.31.5.140)

`.136` claimed "the app's daylight has NO falloff" and `.138` **withdrew** it, because the
horizontal-band metric measured screen regions rather than distance on one surface — the high bands
were the far wall. This round built the instrument that was missing and the claim now stands on
evidence that has no such confound.

**The instrument.** `daylight-falloff.mjs UNFURNISHED=1` clears all furniture (`setItems([])`) so the
floor is unobstructed, and logs the camera's real geometry — `fovV 70.00°, eyeY 1.600 m, aspect
1.600`, pitch −0.55. That is everything needed to turn a screen row into a ground distance:
`elev = pitch + atan((0.5 − y/H)·2·tan(fovV/2))`, and where `elev < 0` the ray meets the floor at
`d = eyeY / tan(−elev)`. Rows are binned into **real half-metre bands** and sampled only in the
central 800 px, so side walls never enter, and capped at 6.5 m so the far wall never does either.

**Bare floor, daylight only, luma versus true distance from the glass:**

| m | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0 | 5.5 | 6.0 | 6.5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| luma | 117 | 130 | 122 | 118 | 119 | 121 | 132 | 110 | 111 | 112 | 112 | 112 | 112 |

**near/far = 1.04 — a 4% change across six metres.** The bare-room frame says the same thing at a
glance: the floor is uniformly lit from the camera all the way to the far door, and the side walls
carry no gradient either. A room lit through an aperture does not look like this.

**It is not a second window.** The living/dining has exactly one opening — `win-livingDining-N`
(grepped `apartment/constants.ts`; the other `win-*` refIds belong to the bedrooms and baths). So the
flatness is not two apertures cancelling.

**And it follows directly from the architecture already documented**: `windowLightModifiers.ts` uses a
**global** tint and "averages each window's factor across all windows", so interior light arrives from
ambient + hemisphere + IBL — all positionless. A positionless light cannot produce a distance
gradient. At 13:00 in Singapore the sun sits at ~82°, so essentially no direct sun enters a vertical
window either; the room is carried entirely by the global terms.

### ⚠️ An instrument fault found in the same run — do not repeat
The `c-lamps-on` arm returned **byte-identical** numbers to `a-daylight`. That is not "lamps do
nothing": `setItems([])` deletes the *fixtures along with the furniture*, so there were no lamps left
to switch on. **The unfurnished arm and the lamp arm are mutually exclusive by construction.** Any
future lamp comparison must be made in a furnished room (as `.135` did).

### What this licenses, and what it does not
It re-establishes the *description* — the app's interior daylight has no spatial falloff — without
licensing a fix. `.138` already refuted the obvious one (window `RectAreaLight`s brightened the room
and made the ratio worse), and the honest reading of that failure is now clearer: adding a positional
light on top of a dominant positionless fill does not create a gradient, because the fill still
floods the room. A real gradient needs the *global* terms reduced in favour of aperture-driven light —
which is the DEFAULT-GLOOM trade (`.86`, measured and user-signed-off) and cannot be taken
unilaterally. **That is the decision this arc has arrived at, and it belongs to the user, not to me.**


## ❌ Redistribution prototype fails, and a precision correction to `.140` (v0.31.5.141)

`.138`'s window-`RectAreaLight` arm only ADDED aperture light and never removed any positionless
fill, so the fill kept flooding the room. This round did both halves — the same window lights plus
`PROTO_FILL_SCALE = 0.45` on the hemisphere and ambient — on the theory that **redistributing**
rather than reducing would produce a gradient without touching the DEFAULT-GLOOM legibility trade.

At first reading it looked like a win: near/far **1.04 → 1.70**. **It is not.**

| distance (m) | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0 | 6.5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 117 | 130 | 122 | 118 | 119 | 121 | 132 | 110 | 111 | 112 | 112 |
| prototype | 146 | 155 | 147 | 174 | 180 | 179 | 183 | 110 | 85 | 86 | 86 |

**Both curves step sharply at the same place, between 3.5 m and 4.5 m — and the frame shows why: the
living/dining's vinyl-plank floor ends at about 4 m, where the kitchen's beige tile begins.** Beyond
that the sample is a *different floor in a different room*. The apparent 1.70 is therefore near-vinyl
compared against a far room the window lights do not reach — a room-to-room brightness difference,
not a falloff gradient.

**On the one consistent surface (0.5–3.5 m) both curves RISE with distance**: baseline 117 → 132,
prototype 146 → 183. The prototype produced no near-window falloff at all. It also **raised the mean
floor luma 117.4 → 131.0 (+12%)**, so it was not mean-preserving either — it failed both of its own
acceptance conditions. Reverted from `/tmp/lighting3.bak`; nothing shipped.

### Precision correction to `.140` (the conclusion stands, the number does not)
`.140` reported the bare floor as "117 @0.5 m → 112 @6.5 m, near/far **1.04**". That range **crosses
the same room boundary**, so the figure compared two different floors. Restricted to one surface,
0.5–3.5 m, the baseline reads **117 → 132, near/far 0.89** — it *rises* with distance. **The
conclusion is unchanged and if anything strengthened: the app's daylight does not fall off from the
window.** Only the quoted ratio was contaminated.

**The standing instrument rule this adds:** a floor is not one surface for as far as the camera can
see. Any distance-based sample must be capped at the **material/room boundary**, which for this pose
is ~3.75 m — not at the far wall, which was the earlier `.136`/`.138` trap. That is now two distinct
confounds found in the same measurement family: surface *orientation* (far wall) and surface
*identity* (next room's floor).


## Tiled surfaces: mostly already there; scene reflections are unaffordable, not missing (v0.31.5.142)

`.134` named the reference photograph's most striking cue as **the polished tile mirroring the sofa
legs, table legs and fire tools**, with per-tile tonal variation and a rust stain. That comparison
was deferred because the living/dining floor is `floor-vinyl-oak` — matte vinyl that *correctly*
should not mirror anything. The tiled rooms had never been checked. They are now.

**What the app already does.** `materialRealism.ts` gives `ceramic` a strong smooth coat —
`clearcoat: 1, clearcoatRoughness: 0.06` — and it works. In the maximum-tier bathroom frames the tile
shows **clear specular blooms from the ceiling fixtures**, visible grout seams, and genuine
**tile-to-tile tonal variation**. Three of the reference's four tile cues are present.

**What is absent, and why it is not a defect to fix.** Nothing in the app reflects scene *geometry* in
a floor — no basin, door or furniture appears mirrored in the tile. That is structural, not an
oversight: `clearcoat` samples the **environment map**, so it can only ever return sheen and
highlights, never the room's own contents. Scene reflections need SSR or a planar reflection, and the
repo already carries the measurement that rules the planar route out — `furniture/CLAUDE.md` records
drei's `MeshReflectorMaterial` re-rendering the entire scene per mirror at **1710 draw calls / 464K
triangles, 43% of a single frame, for a bathroom pane a few dozen pixels tall**, which is exactly why
`useMirrorRelevance` gates mirrors by on-screen relevance. **A floor is a far larger surface than that
pane.** Reflective floors are therefore a measured affordability limit in this renderer, not a gap
someone forgot.

**A pose limitation worth recording.** The window-standoff rig cannot frame a bathroom floor: at
`r = 1.42 m` a camera 0.7 m inside the window with pitch −0.7 is nose-to-door. Tiled *floor* at a
useful angle needs a different pose than tiled *wall*; the readings above come from the maximum-tier
walk frames instead.

### Where this leaves the photorealism arc
Of the cues the reference photograph shows, the app already has gloss and specular response, tile
variation, contact grounding (`.139`), matching midtones and highlights (`.134`), and correct matte
behaviour on matte materials. **Two things separate it from the photograph, and both are now
characterised rather than open:**
1. **Deep shadow, ~10x short** (`.134`) — attributed to the fixtures (`.135`), which exist because the
   daylight is spatially flat (`.140`), which follows from windows being modifiers of global lights
   rather than emitters (`.138`). Closing it means reducing the global fill: **the DEFAULT-GLOOM trade,
   measured and user-signed-off, and the user's decision to make.**
2. **Scene reflections in floors** — measured as unaffordable above.
Neither is a bug awaiting a fix, and three separate lighting interventions have already been built,
measured and reverted (`.133`, `.138`, `.141`). **The measurable backlog on this axis is exhausted.**


## The camera is a real lever, and it needs no renderer change (v0.31.5.143)

Every round so far attacked the *renderer*. This one questioned the **camera**, and it is the first
finding in this arc that suggests a concrete improvement requiring no engine work at all.

**Convention.** Interior architectural photography uses **16–35 mm full-frame equivalent, typically
24 mm**, and keeps the camera **level** — "capture the height of the room evenly without pointing the
camera up or down", grid parallel to the walls, verticals parallel. Tilt-shift lenses exist
specifically to preserve those verticals.

**The app measured against it.** `WALK_FOV_DEFAULT = 70` vertical at aspect 1.6:

| walkFov | ≈ focal length (vertical basis) | horizontal FOV |
| --- | --- | --- |
| **70 (shipped default)** | **17.1 mm** | **96.5°** |
| 50 (the control's floor) | 25.7 mm | 73.5° |

**17 mm sits at the extreme wide edge of the architectural band and well outside its 24 mm norm; 50°
lands almost exactly on it.** `walk-tour` also aims with pitch −0.05 rad, so verticals converge
slightly, against the level-camera convention.

**The comparison.** Same pose, level camera (pitch 0), 2.6 m back, maximum tier, 13:00 — only the FOV
differs. At **70°** the side walls rake steeply to a central vanishing point and the dining table
stretches and looms in the foreground: the wide-angle game look. At **50°** object proportions are
believable, edge stretching is largely gone, verticals read parallel, and the frame reads much closer
to the reference photographs. **The difference is large and is entirely perspective, not shading.**

**This needs no code change.** `walkFov` is already a user-facing control (50–100, `setWalkFov`), so a
photographic framing is reachable today. The only question is the **default**.

**And that default is a genuine trade, not a free win.** A wide FOV is the first-person navigation
norm; at 50° you see materially less of the room and walking feels tighter and more enclosed. The app
is a design tool people navigate, not only a render viewer. **So this is a product decision to put to
the user with the frames as evidence — not a unilateral edit** — and it should be framed honestly as
"more photographic stills versus more comfortable navigation", possibly resolved by decoupling them
(a photographic FOV for stills/screenshots while walking keeps the wide default).

*(A caveat on the numbers: the app renders at aspect 1.6 while a full-frame still is 1.5, so the
mm-equivalents above are quoted on the vertical basis. The conclusion is unaffected — the gap between
17 mm and 24 mm is far larger than that discrepancy.)*


## The app already has a photographic lens model — and it was inert (v0.31.5.144)

Following the camera thread from `.143` into the code turned up something better than a
default-value argument: **`src/scene/cameras/cameraLensSettings.ts` already models a real lens** —
35 mm-equivalent focal length against a 24 mm full-frame sensor height, `mmToFov`/`fovToMm`, a
14–200 mm range, presets at 24/35/50/85 mm, f-stop presets and focus distance. The HQ render modal
exposes it as a "Lens focal length" dropdown whenever the `cameraDof` feature is on.

**Two facts about it, both verified in source:**

1. **The live viewport ignores it entirely.** `lensFocalMm` has exactly one non-test consumer outside
   the store and its persistence: `HqRenderModal.tsx`. The orbit camera is hardcoded `fov: 45`
   (`Scene.tsx:154`) and the walk camera runs off `walkFov` (default 70). So the lens the user picks
   describes the *still*, not the view they design in. That is defensible as a design — but it means
   `.143`'s framing question is genuinely about the two hardcoded viewport FOVs, not about a control
   users could already reach.

2. **The lens did nothing at the default aperture — a real bug, now fixed.** In
   `hqRenderSession.ts` the focal length was read *only inside* the `if (opts.fStop && opts.fStop > 0)`
   branch, which builds the tracer's `PhysicalCamera`. With DoF off — `FSTOP_DEFAULT = 0`, the shipped
   default, and the dropdown is shown independently of the aperture — `renderCamera` stayed the live
   camera and the focal length was passed in and dropped. Selecting "24 mm · wide" or "85 mm ·
   portrait" produced the identical image at 45°.

**The fix.** A pure `hqRenderFov(focalLengthMm, liveFovDeg)` in `cameraLensSettings.ts` makes the
choice explicit and independent of the aperture (lens wins when chosen, live framing otherwise, 50°
on a nonsense live FOV), and `hqRenderSession` now takes a plain pinhole `PerspectiveCamera` clone at
that FOV when DoF is off and the lens differs from the live camera. The `PhysicalCamera` path is
unchanged apart from reading the same shared value.

**Verification, honestly.** Four unit tests pin the helper, and they discriminate — stubbing the
helper back to "always the live FOV" fails 2 of 15. The *rendered* pair is what would prove the
session honours it, so `scripts/dev-probes/hq-lens.mjs` was written to render the same pose at 24 mm
and 85 mm with DoF off and report the mean absolute pixel difference (0.00 = the dropdown did
nothing). **It could not answer here: both arms time out waiting for samples — and so does the
pre-existing `hq-still.mjs` at 4 samples on the same machine**, so the `three-gpu-pathtracer`
megakernel simply does not run under headless ANGLE/metal in this sandbox. That is the documented
failure mode `hq-still.mjs`'s own header was written about, not a regression from this change. **So
this fix is verified by unit test and code path only; the image check is written and pending a
machine where the tracer compiles.**

**Why it belongs in this arc.** Every round so far has asked how to make the renderer more
photographic. This one found photographic controls the app already ships and was not honouring. Fixing
the plumbing is cheaper than any lighting change measured in `.133`–`.142`, and it is the first thing
in the arc that makes a user-visible photographic knob actually work.


## Sharp 90° edges — the CG tell the app already had a fix for (v0.31.5.145)

Research first: the single most-cited "why does my render look CG" answer in architectural-viz
writing is **edges**. Every real edge has a small radius that catches a thin specular highlight;
a perfectly sharp one either produces a harsh unrealistic reflection or no highlight at all, and
reads as cardboard. It is standard practice to chamfer every visible edge, and Marmoset ships a
bevel *shader* purely so hard-surface art gets the highlight without the geometry
([d5render](https://www.d5render.com/posts/detailing-architectural-rendering),
[Marmoset](https://marmoset.co/posts/revolutionize-your-3d-workflow-with-toolbags-bevel-shader/),
[PGBS](https://www.proglobalbusinesssolutions.com/photorealistic-rendering-tips/)).

**The app already has the tool and is not using it consistently.**
`primitives/BeveledBox.tsx` is a drei `RoundedBox` with an auto-clamped 7 mm chamfer, written for
exactly this reason, and `furniture/CLAUDE.md` already states a body mesh "is always" one. The audit
says otherwise: **341 raw `boxGeometry` uses across 113 files, and 53 primitives entirely sharp** —
including `DiningChair` (seat slab, back panel and all four legs in *both* styles), `FlatscreenTV`
(foot, neck and bezel), `Monitor`, `Toilet` (cistern, in-wall panel, flush plate) and `BarStool`'s
step style. These are not obscure: the default 4-room flat puts four to six dining chairs in the
foreground of the walk view.

**Converted those five** (→ 326 boxes / 108 files / 48 sharp primitives), with smaller explicit
chamfers on thin members — 3 mm on the 40 mm chair legs and monitor stem, 2 mm on the 10 mm flush
plate — because the 7 mm default on a 40 mm stick rounds it into a dowel.

**Measured, same pose, lamps on, maximum tier, 13:00:** 2.67 % of pixels changed by more than 2
levels. At a 4× crop on a chair back the mechanism is unmistakable: sharp, the top edge is a hard
line that simply terminates against the wall; chamfered, it carries a **continuous bright specular
rim** along the top and both verticals, and the panel reads as a solid with thickness instead of a
cut-out. This is the first change in the arc that alters *object* realism rather than room lighting,
and it is cheap — the chamfer is ≤7 mm, so footprints, clearances and joins are unchanged.

*Caveat, honestly:* the two capture runs are not pixel-identical in pose (the walk teleport lands
within a few pixels, not exactly), so the 2.67 % figure includes a small amount of that. The edge
highlight is a geometry change and is not explicable by a pose shift, but the percentage is a
loose upper bound rather than a clean isolation.


## Golden hour: the app models the COLOUR of a low sun but not its DIRECTION (v0.31.5.146)

Professional practice is emphatic that golden hour is where interiors look most photographic — warm
3000–3500 K cast, one dominant source, long angled shadows, and (a point worth noting) *"the most
forgiving lighting for hiding minor model imperfections"*
([omegarender](https://omegarender.com/3d-interior-lighting),
[Ultra-Z](https://ultra-z.com/elevating-architectural-visualization-with-golden-sunset-lighting-in-3d-rendering/),
[Rendershop](https://rendershop.ai/blog/render-lighting-tips)). This arc had never tested it.

**First, a correction to the arc's own framing.** Every measurement from `.134` to `.145` was taken at
**13:00**, and in Singapore (1.35°N) that is a sun altitude of **82.4°** — very nearly straight down,
and therefore the single worst hour of the day for daylight to enter a *vertical* window. Golden hour
is 18:00–19:00 local (**16.4° → 1.6°**), and `altitudeCurve.ts` still grades the sun at **0.85
intensity with a warm [1, 0.92, 0.78] tint at 10°**, on a `castShadow` directional light. A low warm
sun *should* throw a window-shaped patch across the floor.

**The measurement.** New `scripts/dev-probes/sun-ingress.mjs` fixes the hour and the pose (just inside
the living/dining window, lights OFF in every arm, curtains opened, maximum tier) and sweeps the plan
**orientation** 0/90/180/270 instead of the hour — rotating the building guarantees that one arm
points that window straight at the sun and another points it away.

| | result |
| --- | --- |
| interior, 0° vs 90/180/270° | **mean \|Δ\| 0.13 luma; 0.02 % of pixels differ by >2** |
| largest single difference | the **UI compass rose** at (2517, 1535) |
| floor band, all four orientations | mean 76.0, sd 41.4, p50 77, p99 226 — **identical to 3 s.f.** |
| window pane's own mean | 174.6 / 163.9 / 163.1 / 165.7 — a ≤12-luma spread |

**Turning the sun through a full circle at golden hour changes the room by a tenth of a luma level.**
Direct sun does not enter, at any orientation. Checked against the obvious confounds first: the glass
mesh does **not** `castShadow` (`Window.tsx:239`), curtains and blinds were opened in every arm, and
the plan carries **zero** `window-mesh-screen` fixtures — the dense grid over the panes is the
window's own approved SNV safety grille, not a fixture the probe left in place.

This corroborates `.138`/`.140` from the opposite end — they showed windows *modulate global lights*
rather than emit; this shows the *sun* has no positional effect either — and it does so at the hour
that most favours a positional result. **The axis stays closed.** Three interventions have already
been built, measured and reverted; the one remaining lever is reducing the global fill, which is the
DEFAULT-GLOOM trade and the user's call.

**Two things the app does get right, and one new candidate.**
- **Warmth is modelled.** The floor band's R/B ratio rises **1.221 (13:00) → 1.257 (18:00) → 1.291
  (18:30) → 1.420 (19:00)**. The *colour* of golden hour is there; only the direction is missing.
- **The pane is real glass on Maximum** — `MeshPhysicalMaterial`, `transmission 0.92`, `ior 1.5`,
  `roughness 0.1`. Not a fake.
- **NEW CANDIDATE — the window reads as a pale panel, not as a view.** That transmissive pane also
  carries `color #bcd4e6` (which tints everything transmitted) *and* a flat `emissive #cfe4f5 at 0.4`
  laid over the whole pane. At golden hour the brightest pane pixel measures **197 / 255**, whereas in
  an interior photograph the window is the blown-out brightest thing in the frame. Looking back at
  the window from across the living room, the TV — showing a sky wallpaper — reads more like a window
  than the window does. Reducing the flat emissive wash (or letting the transmitted sky through
  untinted) is a plausible, cheap, *material* change rather than a lighting one — **but given three
  reverted interventions in this arc it goes to the user as a proposal with the frame as evidence,
  not as a unilateral edit.**


## The same wood is drawn at up to 210 different scales on one object (v0.31.5.147)

Looking at a walk frame rather than a histogram, the chest beside the dining table reads as
**corrugated cardboard**: regular vertical ridges on one face, stretched horizontal streaks on
another. The bedroom door next to it looks like vertical corduroy. Neither is wood.

**The mechanism.** A `BoxGeometry` face's UVs run 0→1 *whatever the face's real size*, and the
furniture material factories (`getWoodMaterial`, `getSurfaceMaterial`) take **one isotropic
`repeat`**. So the physical scale a texture actually lands at is `faceSize / repeat` — different on
every face, and different on every panel that shares the cached material. Nothing in the pipeline
expresses "this wood has a 30 cm grain period".

**New instrument: `scripts/dev-probes/grain-scale.mjs`.** For every textured mesh it dumps the
world-space box dimensions and the material's `map.repeat`, computes the implied **metres-per-tile**
per axis, and groups by material so the spread *within one material* is visible.

Measured on the default 4-room flat, maximum tier:

| material | meshes | metres-per-tile | spread |
| --- | --- | --- | --- |
| `wardrobe-3door` wood | 8 | 0.005 … 1.050 | **210×** |
| `bookshelf` wood | 8 | 0.009 … 1.100 | 122× |
| `tv-console` wood | 5 | 0.010 … 1.125 | 112× |
| door leaf | 1 | 0.025 … 1.050 | 42× |
| `shoe-cabinet` wood | 5 | 0.014 … 0.671 | 48× |

**Two distinct errors, and they need different fixes:**

1. **Between panels.** On the `tv-console` the carcass front is drawn at **1.125 m/tile** and the
   drawer fronts right below it at **0.536 m/tile** — the same wood at two scales, 15 cm apart. A
   scalar repeat derived from each panel's own size fixes this.
2. **Within one face — and a scalar repeat can NEVER fix it.** A wardrobe door is 0.437 × 1.99 m and
   gets 0.218 m/tile across and 0.995 m/tile up: the square texture is stretched **4.6:1**, exactly
   the face's aspect ratio. Any isotropic `repeat` preserves that ratio. The door leaf is stretched
   2.1:1 the same way — that is the "corduroy". Fixing it needs an **anisotropic repeat derived from
   world dimensions**, `repeat = (w / metresPerTile, h / metresPerTile)`, or true world-space UVs.

**Nothing was changed this round, deliberately.** A first patch — matching a drawer front's repeat to
its carcass on `Dresser.tsx` — was written and then **reverted**: `dresser` does not appear anywhere
in the default flat's mesh dump, so the fix was unverifiable against the frames that motivated it,
and an unverified fix is worse than a measurement. The pieces that *are* in the flat (wardrobe,
bookshelf, TV console, shoe cabinet, doors) are all dominated by error (2), which needs the
anisotropic material factory rather than a per-primitive tweak.

**Proposed next step, with the numbers to justify it:** add a sized-material factory —
`getSurfaceMaterialSized(kind, color, metresPerTile, w, h)` — that caches a clone with
`map/normalMap/roughnessMap.repeat = (w / mpt, h / mpt)`, generalising the existing
`getFurnitureMatWithRepeat` from a scalar to a pair, and roll it through the worst offenders with a
`grain-scale.mjs` spread reading before and after. Note that `furnitureMaterials.ts` already carries a
**"Wave 4A"** comment describing the *symptom* ("the same tile squishes into a busy wavy cathedral /
watermark grain — worst on wardrobe/bookshelf doors") and treats it with two hand-tuned constants,
`FURNITURE_WOOD_COARSEN = 0.5` and `FURNITURE_WOOD_NORMAL_SCALE = 0.24`. Those calm the *amplitude*;
they cannot correct the *scale*, because the error is geometric.


## Fixing it: grain sized from world dimensions (v0.31.5.148)

`.147` measured the defect; this ships the fix for the panels where it showed most.

**New in `furnitureMaterials.ts`:** `FURNITURE_GRAIN_METRES = 0.9` (one texture tile per 0.9 m of
real panel — chosen so the largest carcass panels keep roughly the scale they already had), the pure
`sizedRepeat(w, h, mpt) → [repeatU, repeatV]`, `getSurfaceMaterialSized(...)`, and
`getSurfaceMaterialForBox(kind, color, [w,h,d], sheen)`. The box helper takes `v` from `max(h, d)`
because three maps `v → y` on the four upright faces but `v → z` on the top and bottom: that single
rule lands correctly on a tall door AND on a horizontal shelf, i.e. on the large visible face in both
cases. Six unit tests pin the helper, including that `u` and `v` differ (the whole point) and that a
1 mm edge is clamped rather than asking for a 900× tile.

**Applied to fronts only, and that restriction is load-bearing.** Sizing *every* panel made
`structuralSoundness.test.tsx` fail on five cases with up to 18 "z-fighting coplanar face pairs" —
carcass backs, sides and tops are flush with one another by construction, and while they shared one
material those coincident faces were invisible. Give each its own variant and the seam becomes a
visible scale discontinuity. So doors, drawer fronts and flap fronts are sized; carcass panels keep
the shared material. Suite green.

**Measured with `grain-scale.mjs`, same scene, before → after:**

| panel | before (m/tile, u / v) | after | face stretch |
| --- | --- | --- | --- |
| wardrobe door (0.437 × 1.99) | 0.218 / 0.995 | **0.873 / 0.905** | 4.6:1 → **1.04:1** |
| TV-console drawer front (0.858 × 0.185) | 0.536 / 0.116 | **0.903 / 0.925** | 4.6:1 → **1.02:1** |
| shoe-cabinet front | — | 0.930 | — |

**Visually**, at the same living-room pose, the console's drawer fronts go from dense tight vertical
ribs to noticeably broader bands that match the carcass top. **Honest limits:** the improvement is
real but modest at walking distance, the two capture runs are not pixel-identical in pose, and the
fronts still read as *vertically* striped — because the remaining error is **grain DIRECTION**, not
scale. A 0.86 × 0.19 m drawer front should have grain running along its long axis; the texture's
grain axis is fixed in UV space, so a wide-short panel gets cross-grain. That needs a per-panel
texture ROTATION (`texture.rotation` / `center`), and is the natural next step — recorded here rather
than bundled in.


## Grain DIRECTION, the other half of the same defect (v0.31.5.149)

`.148` closed the scale error and said plainly what was left: the fronts still read as vertically
striped, because a texture's grain axis is fixed in UV space and a wide-short panel therefore comes
out **cross-grained**. Real timber and veneer run the grain along the panel's long axis; a drawer
front has horizontal grain.

**Verified the axis rather than assuming it.** The procedural furniture wood lays its boards out
along **v** — `getWoodMaps` "index[es] across u", so plank seams are vertical lines. Right for a
2 m door, wrong for a 0.86 × 0.19 m drawer front. **But the catalog wood is authored the other way:**
`builtinCatalog.ts` sizes `mat:floor-wood-*` by *"plank length = uvScaleX"*, i.e. boards along u. So
a blanket rotation would have *introduced* cross-grain on every DLC wood finish. `grainQuarterTurn`
therefore turns **procedural wood only**, and a unit test pins that a `mat:` id is never turned.

**Mechanics.** three composes the uv transform as scale-then-rotate about `center`, so at
`rotation = π/2` texture-u samples the mesh's v axis and texture-v samples u — the repeat pair has to
**swap with it** or the physical period lands on the wrong axis. Four more unit tests cover the
predicate; `grain-scale.mjs` now prints `rot=90` in the key so a turned material's u/v columns are
not misread.

**Visually — three states at one pose, stacked:** original (tight vertical ribs) → `.148` sized
(broader vertical bands) → `.149` sized + turned (**grain running horizontally along the drawer
front**). The third is unmistakably the most furniture-like; the ribbed look is gone. Tall panels are
untouched by construction (`w > h` is the condition), so wardrobe doors keep their vertical grain,
which is correct.

*Same caveat as `.148`: the walk teleport does not land pixel-identically between runs, so the frames
differ slightly in pose. Grain direction is not something a pose shift can produce.*


## Rolling the sized grain out — and fixing the instrument that was misreading it (v0.31.5.150)

**Re-measured first.** With the `.148`/`.149` primitives fixed, `grain-scale.mjs` surfaced a new set of
offenders that had been hidden behind them, all present in the default flat: `dining-table-4` (40×),
`coffee-table` (36×), `bed` (32×), `desk` (30×), `nightstand` (23×). The dining tabletop is the single
most prominent wood surface in the walk view.

**Applied `getSurfaceMaterialForBox` to the large face-on surfaces:** the dining tabletop, both coffee
-table tops and its lower shelf, the desktop, and the nightstand drawer fronts. Every one lands on the
0.9 m target on BOTH axes:

| surface | before (m/tile) | after | stretch |
| --- | --- | --- | --- |
| dining tabletop (1.4 × 0.85) | 0.933 / 0.567 | **0.903 / 0.895** | 1.65:1 → **1.01:1** |
| desktop (1.2 × 0.55) | 0.800 / 0.367 | **0.889 / 0.917** | 2.18:1 → **1.03:1** |
| coffee tabletop (1.1 × 0.55) | 0.688 / 0.344 | **0.917 / 0.917** | 2.00:1 → **1.00:1** |

**Visually**, at the L/D pose the tabletop goes from narrow, tightly-spaced plank seams running
towards the viewer to broad boards with the grain along the table's length — which is how a real
timber table is made. It is the clearest single-surface improvement in this arc so far.

**The instrument was misreporting the fixed materials, and that is worth recording.** A quarter-turned
texture samples texture-u from the mesh's v axis, so its `repeat` pair is swapped relative to mesh
axes — `grain-scale.mjs` was dividing by the wrong one and reporting a *worse* spread for exactly the
panels the fix had corrected. It now undoes the swap before reporting, adds a `topV` column (a
tabletop's visible face maps v → z, so it was never in the front columns at all), and computes the
spread over each mesh's **dominant face only** instead of including the 2 cm edge that made every
correctly-tiled panel look broken. With that corrected, all six fixed primitives drop out of the
top-10 offenders entirely; what remains at the top is curtain folds (a 3.5 cm wide × 2.6 m panel,
inherent) and table legs.

**Deliberately NOT touched: the door leaf.** It measures 0.5 / 1.05 m per tile — a 2.1:1 stretch, and
doors are ~13 % of the walk view — but its `repeat` 2 is a **previously measured, recorded decision**
(`PlanDoorLeaf.tsx` cites `dev-probes/door-ab.mjs`: "at repeat 1 the grain stretches … into broad soft
bands; at 2 it reads as timber, at 3 it goes busy"). That measurement optimised a scalar under an
isotropy constraint it could not escape; sizing would land the horizontal density near the "repeat 1"
they rejected. Overturning it needs `door-ab.mjs` re-run at the new anisotropic setting, which is its
own round — not a change to smuggle in here.


## The door leaf: the recorded decision survives, and the reason is instructive (v0.31.5.151)

`.150` left the door leaf alone because its `repeat` 2 is a recorded measured decision, and said
overturning it needed `door-ab.mjs` re-run at the anisotropic setting. This is that round.

**New `PAIRS` arm in `door-ab.mjs`** — `PAIRS="0.9x2.35,1.8x4.7"` sets `repeat` u and v independently,
which is precisely what the original verdict could not do: with a box face's UVs at 0→1, ANY single
scalar leaves a 0.8 × 2.1 m leaf stretched 2.6:1 (repeat 2 → 0.40 m per tile across, 1.05 m up). Four
arms at one pose, maximum tier, 13:00: shipped `repeat 2`, then sized at 0.9, 0.6 and 0.45 m per tile
(`0.9×2.35`, `1.35×3.5`, `1.8×4.7`).

**Result: no arm beats the shipped one, and the recorded decision stands.** Measured on a clean crop
of the leaf interior, the vertical row profile is the same across all four — sd 10.4–11.0, max step
6.8–7.4, and every arm's largest step at the *same* row, i.e. a lighting gradient, not a tile seam.
The only thing that moves is horizontal rib density: **38 ribs (shipped) / 25 / 32 / 38**. That is the
"how dense" knob the original sweep already explored and settled.

*(An impression I recorded on first look — a horizontal seam across the upper leaf in the 0.9 arm —
did not survive measurement: it was the wall above the leaf inside the composite crop. The numbers
overrule it.)*

**Why the earlier wins were real and this one is not.** The consequence of a UV stretch depends on the
texture's OWN anisotropy. This wood's features run along v — long grain lines, low-frequency along
their length — so stretching v is nearly invisible, while stretching u changes rib spacing and shows
immediately. A door leaf is stretched *along* the grain, where the texture hides it. A wide-short
drawer front or a tabletop is stretched *across* it, where nothing hides it. That is exactly why
`.148`–`.150` moved the needle on fronts and tops and why this one does not.

**The rule to carry forward:** size a panel when it is stretched across the grain; a tall panel that
happens to run with the grain is already fine, and changing it only trades one density for another.
`PlanDoorLeaf.tsx` keeps `repeat` 2 unchanged.


## The boot dollhouse view — two suspicions refuted, one real gap (v0.31.5.152)

The whole arc has been measured from inside the walk camera, but the app boots in **orbit**
(`cameraSlice.ts`), and that dollhouse frame is the first impression. New probe
`scripts/dev-probes/boot-view.mjs` captures it untouched and reports the resolved state, so the frame
is never judged against an assumed one.

**Boot state, measured:** `cameraMode orbit`, `tier medium`, `timeMode system`, `backdrop sky`,
`uiMode simple`, **87 items**, `fov 45`, camera `[20.84, 10.59, 19.16]` (≈30 m out — the framing pass
dollies past `Scene.tsx`'s hardcoded `[12, 8, 12]`).

**Convention to judge it against:** a professional dollhouse render is a bird's-eye cutaway with the
roof removed, walls extrapolated so interiors read, every room furnished *and decorated*, on a clean
neutral backdrop ([BluEnt](https://www.bluentcad.com/3d/home-rendering/home-builder-renderings-portfolio-dollhouse-views),
[ArchiCGI](https://archicgi.com/3d-floor-plan-visualization/),
[Transparent House](https://www.transparenthouse.com/post/3d-floor-plan-renderings-dollhouse)).

### Refuted #1 — "the backdrop is black, the sky dome is broken"

The first capture came back with a **pure black background**, which looked like a serious first-run
bug. It is not. `timeMode` is `system`, the probe ran at **02:14 local**, and the dome bakes night.
Before concluding, the dome was inspected directly: `SphereGeometry radius 200`, `MeshBasicMaterial`,
`side BackSide`, `hasMap true` (256×128), visible, tracking the camera — present and correct; its
baked texel and the rendered pixel were both `[0,0,0]`, consistent with night, not with a missing
dome.

### Refuted #2 — "at midday the backdrop is flat grey with no sky in it"

At hour 13 the backdrop measures **184,184,185 at the top of frame → 175,173,175 at the bottom**:
near-zero saturation and a ~10-level gradient. That looked wrong against `altitudeCurve.ts`'s
distinctly blue `skyColor [0.55, 0.66, 0.92]`. It is **as designed**. `skySurround.ts` (SKY-ANALYTIC
-ORBIT) documents that the dollhouse surround deliberately has *no ground* and continues the horizon
colour dimmed toward the nadir, and records the horizon as pale (saturation 0.09–0.23) with the blue
reserved for the zenith. The camera pitches ≈20.5° down with a 45° vertical fov, so the frame spans
roughly **+2° to −43°** — entirely horizon-to-nadir. The blue zenith is behind the camera. The
measurement matches the design.

### The real gap — the model floats

Against the reference convention the one clear difference is that **the flat has nothing under it**:
no ground, no anchoring shadow, so the dollhouse hangs in haze. Professional dollhouse renders sit the
model on a soft shadow that fixes it in space.

**But the obvious fix has already been tried and retired, with reasons on file (RD-410).**
`ShowcaseController.tsx` and `quality.ts` record that a drei `AccumulativeShadows` ground plane was
mounted while the camera was parked, and that its 19 m catcher "caught the building's own silhouette
and rendered it as a large dark rectangle on the ground — bigger than the footprint", while the
single synchronous frame the capture path renders never converged the accumulation. **So this is not
mine to re-open**: it is a recorded decision, and the honest note is only that its rationale
("grounding is fully covered by the floor + PCF sun shadows + contact blobs") argues about grounding
*within* the apartment and does not address the building's silhouette seen from *outside*. If a
dollhouse anchor is wanted, it wants a shadow **catcher** sized to the footprint rather than a 19 m
plane — a product call with RD-410's artifact as the known risk.

### Secondary observation — the cutaway is a veil, not a cut

Roughly half the plan is covered by near-side walls faded to translucent, which reads as milky fog
over the rooms behind rather than as a cutaway; the furniture under it is desaturated. The reference
convention *cuts* walls at a section plane instead. Recorded, not acted on — the fade is a deliberate
system (`REVEAL-THROUGH-TINT`) with its own tests.


## Is the default flat *staged*? 97.7 % of it is axis-aligned (v0.31.5.153)

Render-studio writing names two finishing steps that separate a photograph from a CG frame: rooms must
be **decorated**, not merely furnished — "empty or sparsely furnished interiors … fail to communicate
scale, proportion and lifestyle" — and decor placement must be **"slightly varied to avoid an overly
centred or staged feel"**
([Golden Vision](https://goldenstudio.org/realistic-interior-rendering),
[RenderLand](https://renderland.ca/how-furniture-and-decor-modeling-elevate-realism-in-interior-3d-renders/),
[ArchitectRender](https://www.architectrender.com/post/why-3d-renders-sometimes-look-unrealistic)).
A layout produced by an auto-arranger is the opposite of the second by construction. New probe
`scripts/dev-probes/staging-audit.mjs` turns both into numbers.

**Refuted: "the bedrooms look sparse".** That was my read of the `.152` dollhouse frame, and it is
wrong — the rooms are ghosted by the wall-reveal veil, not empty. Measured, the default flat carries
**87 items**, and by category:

| decor | lighting | textiles | storage | seating | bathroom | appliances | kitchen | beds | tables | laundry | electronics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 18 | 8 | 7 | 7 | 7 | 5 | 4 | 3 | 3 | 2 | 1 |

**28 of 87 items (32 %) are decor or textiles**, and no room is bare: Living/Dining 26, Main Bedroom
15, Bedroom 3 13, Bedroom 2 10, Kitchen 7, the two bathrooms 5 and 4. On the first criterion the app
is already doing what the reference asks.

**Confirmed, and it is the real signature: 85 of 87 items (97.7 %) sit at an EXACT multiple of 90°** —
56 at 0°, 12 at 270°, 9 at 180°, 8 at 90°, and just **2 off-axis**. Nothing in the flat is a fraction
of a degree askew. That is precisely the "overly staged" tell, and it applies to the decor too.

**A fix is available but it is not mine to make, and the reason is specific.** The reference advice is
about *decor*, not about beds and wardrobes: in a real flat — and in a design tool — storage and
seating genuinely are pushed square to the wall, and a sofa 3° askew would read as a bug in the
arranger rather than as realism. So the change would be a small deterministic yaw jitter on the 28
decor/textile items only. Two concrete hazards mean it needs a decision rather than an edit:
**wall art, mirrors and other mounted pieces must stay square** (a tilted picture is a defect, not a
flourish), and the **selection outline, rotate gizmo and clearance checks all read the stored
rotation**, so a render-time-only jitter would desynchronise the handles from the object. Recorded
with the numbers; the call is the user's.


## The window is not a lightbox because of the glass — it is because nothing is outside (v0.31.5.154)

`.146` left a proposal on the table: the pane carries a flat `emissive #cfe4f5` sky-catch over a
`#bcd4e6` tint, so "reducing the flat emissive wash" might let the window read as a view. New probe
`scripts/dev-probes/window-pane.mjs` tests it. Three results, one of which kills that proposal.

**Live material mutation does not work here, and that matters for anyone repeating this.**
`PlanShell.tsx:1181` and `Window.tsx` rewrite the pane's `emissiveIntensity` and `color` **every
frame** from the daylight curve, so a probe that patches the material and screenshots gets the shipped
look back. The first sweep returned six byte-identical arms (mean 192.6 across the board) before that
was spotted. The emissive arm had to be run by editing `glassSkyCatchIntensity` at source, with a `cp`
backup.

**1 — Refuted: removing the sky-catch emissive makes the window WORSE.** With it off, the pane's
variation does rise (sd **13.4 → 21.6**, +61 %), but its mean falls **197 → 173** — the window becomes
*darker than the surrounding wall*, which is the opposite of a photograph, where it is the blown-out
brightest thing in the frame. The emissive is doing a job. **The `.146` proposal is withdrawn.**

**2 — Transmission works; the backdrop is empty.** Setting `BACKDROP=city` at 13:00 puts visible tower
blocks behind the glass — faint, but unmistakably content, seen *through* a transmissive pane. With
the shipped `sky` backdrop the same pane is featureless. So the pane reads as a lightbox because the
**default backdrop is a deliberately empty, desaturated horizon haze** (`skySurround.ts` has no ground
and a pale horizon by design), not because the glass is wrong.

**3 — But the default stays. `WINDOW-SKY-DEFAULT` (v0.31.5.92) survives, with its symptom updated.**
That decision records `city` as painting "warm lit tower windows at every hour". That specific symptom
no longer reproduces: `city.windowColor` is `rgba(52,66,84,0.5)`, dark daytime glass, and the 13:00
capture is a daytime skyline. The underlying defect does reproduce, measured differently — **at 18:00
`city` is COOLER than the interior it sits behind (window-region R/B 0.973) while the analytic `sky`
is warm with it (1.034)**, because the preset is authored at one hour and the analytic sky tracks the
clock. That is exactly the "clashing colour temperatures" failure the reference literature names. At
night the question is moot: `windowTransmission(0) = 0.2` and the pane lerps to `GLASS_NIGHT`, so
`city` and `sky` differ by **2.2 luma** (62.1 vs 64.3) — the backdrop is invisible either way.

**The precise next step, then, is not the glass and not the default — it is the presets.** Make the
photo backdrops daylight-aware (blend `sky`/`haze`/`ground` toward the analytic sky's colour for the
hour, and scale `litScale` with 1 − daylight so lit windows only appear at night). That removes the
one measured objection to a content-bearing default, after which windows would stop reading as
lightboxes for every user rather than only for those who go and change a setting.


## Photo backdrops that track the clock — right mechanism, small effect (v0.31.5.155)

`.154` ended with a precise next step: the static photo backdrops are authored at one time of day, and
at 18:00 `city` renders **cooler** than the interior in front of it (window-region R/B 0.973 against
the analytic sky's 1.034). This implements the preset side of that.

**New pure `presetForDaylight(preset, hour)` in `backdropEquirect.ts`,** taking two *separate* signals,
and the separation is the whole design:

- **`daylight`** (0 night … 1 day) drives **dimming** and lit-window density.
- **`lowSun`** (0 sun high … 1 sun on the horizon) drives the **warm shift**.

They cannot be one signal. The first implementation used `daylightFromAltitude` for both, shipped,
measured — and moved nothing: **`daylightFromAltitude` is a NIGHT ramp** (`(altDeg + 8) / 8`, clamped),
so it reports exactly 1.0 at every altitude above 0°. At 18:00 the sun is still **16.4° up**, so the
preset was returned unchanged at precisely the hour the defect was measured at. `lowSun` is
`1 − altDeg/30` instead, and the tint is `lightingFromAltitude(...).sunColor`.

Six unit tests pin it, including that midday is the **identity** (so nothing about the shipped look
can move), that golden hour warms *without* dimming, and that a preset with no lit windows stays
`undefined` rather than becoming `NaN`.

**Measured through the window, same pose, same crop:**

| | mean | R/B |
| --- | --- | --- |
| `sky` 13:00 (default) | 185.9 | 0.968 |
| `city` 13:00 before → after | 190.2 → 190.3 | 0.974 → **0.974** (identity, as designed) |
| `sky` 18:00 (default) | 185.1 | **1.034** |
| `city` 18:00 before → after | 186.6 → 186.0 | 0.973 → **0.980** |

**The direction is right and the midday identity holds exactly, but the effect is small** — 0.007 of
a 0.061 gap, about 12 %. Two honest reasons: the analytic `sunColor` at 16° is only mildly warm
(≈[1, 0.945, 0.85]), and the backdrop reaches the measured region only faintly, through a tinted pane
carrying its own sky-catch emissive. **So this does not on its own justify making a photo backdrop the
default** — `WINDOW-SKY-DEFAULT` still stands. What it does is remove the *structural* objection: the
presets now track the clock instead of being frozen at one hour, which is a prerequisite for any
future content-bearing default, and it costs nothing (the re-bake is quantised to 0.1 on both
signals so scrubbing the time slider cannot re-bake per frame).


## The curtains were an extrusion (v0.31.5.156)

Looking at the `.154` window frame rather than a histogram: the curtains are **perfectly parallel
vertical ribbons of constant width, identical from rod to hem**. Real drapery is pinned at the track
and free at the bottom, so its folds lean and wander as they fall.

**The cause is exact.** `Curtain.tsx:buildWavyPanel` displaced the plane by
`FOLD_DEPTH * sin((x + 0.5) * FOLDS * 2π) * taper` — a function of **x only**. Every horizontal
cross-section was therefore identical: the panel was a literal extrusion, and it rendered as one. It
is the same "corrugated card" tell the furniture grain had in `.147`, in a different system.

**The fix — CURTAIN-DRIFT.** The profile is now the exported pure `curtainFoldZ(x, y, panelHeight)`,
adding two smooth deterministic terms: a **phase drift** that is zero at the rod and grows toward the
hem (so the pleats stay fixed where they are actually pinned, and the fabric wanders where it is
actually free), and a small **per-fold amplitude variation** so neighbouring folds are not identical
twins. `SEG_Y` goes 5 → 12, because a wandering fold rendered across five segments is five straight
facets; 48 × 12 quads is trivial.

**Depth is deliberately unchanged.** `windowSnap`'s standoff is sized against the current amplitude,
and a deeper wave would push fabric through the window sill — a unit test pins the peak at ≤ 1.2 ×
`FOLD_DEPTH` so a later tweak cannot quietly break that. Five tests in all, including that the rod
cross-section is *exactly* the undrifted profile and that the hem is fuller than the rod.

**Measured** as mean |row − column-profile| over the curtain crop, which is **0 for a perfect vertical
extrusion**: **9.37 shipped → 9.87 at drift 0.9 → 9.98 at drift 1.8**. Two drift strengths were
rendered and compared; 1.8 was kept because the folds visibly lean and gather without any wobble or
kinking, and 0.9 was barely distinguishable from shipped.

**Honest scale:** this is a small change in the numbers (+6.5 %) and a modest one to the eye. It
removes a categorical defect — "this object is an extrusion" — rather than transforming the frame. The
larger remaining curtain tells are the hard dark seam lines between folds and the dead-straight
silhouette edges and hem; a real floor-length curtain breaks at the floor.


## Walls are fine, upholstery is not — and the material cannot fix it (v0.31.5.157)

Measured the app's own frame against the two reference photographs, using **micro-sd** — the standard
deviation of (pixel − a 4-px blur), i.e. surface texture with the lighting gradient divided out.

| patch | mean | micro-sd |
| --- | --- | --- |
| photo 1, plain wall right of the clock | 199.8 | **1.56** |
| photo 1, wall above the TV | 171.3 | 6.03 |
| photo 2, wall patch | 91.7 | 10.50 |
| **app wall, right of the window** | 189.2 | **2.97** |
| **app wall, left** | 193.6 | **1.38** |

**Refuted before building anything: wall micro-texture is not a gap.** The app sits *inside* the
photographic range, and its brighter wall (2.97) is above the photograph's comparable plain wall
(1.56). Nothing to do here.

**Upholstery is a real gap.**

| patch | mean | micro-sd | micro-sd ÷ mean |
| --- | --- | --- | --- |
| photo 1, leather sofa back | 87.8 | 15.28 | 0.174 |
| photo 1, armchair arm | 96.1 | 15.07 | 0.157 |
| **app sofa, seat/back** | 131.4 | 8.13 | **0.062** |
| **app sofa, arm** | 150.7 | 5.11 | **0.034** |

Roughly **2.8× flatter** once normalised for mean. (Caveat: the photograph is a JPEG and its
compression noise inflates micro-sd, so treat 15 as an upper bound.)

**Both material levers are exhausted — this is the part worth recording.**

1. The **weave normal** is already measured and settled: `getFabricMaterial`'s `weave = 1.3` carries a
   recorded sweep (microcontrast 1.346 / 2.115 / 2.879 / 3.829 at 0.65 / 1.3 / 2.0 / 3.0) with 2.0
   rejected because the weave "becomes a regular grid that looks like mesh screen".
2. The **wrinkle channel** was the one lever that sweep could not isolate — it scales the whole normal
   map, weave included, whereas `SeamParams.wrinkle` scales only the crease band. Swept it alone,
   1 → 2.5 → 4, measured with the same instrument (`surface-detail.mjs DEF=sofa-3seat MASK=item`,
   walk / Medium / 09:00): microcontrast **1.971 → 1.951 → 1.904**. It goes the *wrong way*. The
   wrinkle fbm is `baseFreq 3` — deliberately broad — so it never registers as high-frequency detail
   and only dilutes the weave against the field's `clamp01`.

**So the remaining upholstery gap is GEOMETRIC, not textural.** A photographed cushion is deformed —
sagging under its own weight, creased along its seams, dented where someone has sat — while the app's
are smooth rounded boxes. That is the same class of defect as `.156`'s curtain extrusion, and the same
class of fix (vary the surface, don't paint it), but a substantially larger piece of work:
per-cushion deformation. `glbEdit/plump.ts` and `glbEdit/wrinkleTexture.ts` already exist as partial
machinery for it.


## Cushion jitter: the cheap version of `.157`'s fix does not work (v0.31.5.158)

`.157` concluded that the upholstery gap is **geometric, not textural** — a photographed cushion sags
and creases, the app's are smooth rounded boxes. The cheapest thing that sounds like that fix is to
stop the cushions being a *moulded row*: nudge each one so no two sit identically. It was built,
tested and reverted.

**What was built.** A pure `cushionSettle(index)` giving each seat and back cushion a deterministic
`dx`/`dy`/`dz`/`yaw`, phase-shifted so a back cushion never settles in lockstep with the seat cushion
under it. Bounded by construction and pinned by unit tests: the sum of two neighbours' `dx` stays
under the 0.03 m inter-cushion gap so a row can never overlap, `dy` is **downward only** so a cushion
can never float off its base, and the tilt stays under a degree. `structuralSoundness` stayed green.

**What it measured.** Micro-sd over the sofa crop, same pose, lamps on:

| | micro-sd |
| --- | --- |
| shipped | 9.11 |
| settle ±5 mm / ±0.6° | 9.13 |
| settle ±12 mm / ±1.7° + downward sink | **9.09** |

Nothing, at either amplitude — and the second is *below* shipped, i.e. noise. Visually the frames are
near-identical: the seam between two cushions moves a few pixels and nothing else changes.

**Why it fails, which is the useful part.** At this pose 12 mm is about 5 px, so it is not a resolution
problem — it is that **adjacent cushions are the same colour**. Sliding the boundary between two
identically-shaded surfaces produces no new shading; a photograph's cushion detail comes from the
surface *bending* — sagging under its own weight, creasing along a seam, denting where someone sat —
which changes the normal and therefore the light.

So `.157`'s conclusion survives its own cheapest counter-proposal, and narrows: it is not "the parts
are too regular", it is **"the surfaces are too flat"**. Recorded in `src/furniture/CLAUDE.md` so this
is not retried. The real fix needs per-cushion surface deformation with enough tessellation to carry
it — drei's `RoundedBox` subdivides its corners, not its faces, so it cannot.


## The tessellated cushion: built, iterated four times, reverted (v0.31.5.159)

`.157` said the upholstery gap is geometric; `.158` eliminated part-jitter as the cheap version of
that. This built the real thing — a properly tessellated cushion with a sag and crease field — and it
still does not close the gap. Reverted, with the lessons.

**What was built (the technique is sound and reusable).** A `BoxGeometry` with real face subdivision,
mapped through the **exact rounded-box (box ⊕ sphere) Minkowski transform**: clamp each unit-cube
coordinate into the core, then push the residual out to the corner radius. Points on a *face* have a
one-axis residual and come back unchanged, so **face tessellation survives** — which is precisely what
drei's `RoundedBox` cannot offer, because it subdivides corners rather than faces. Then a sag
(supported at the edges, unsupported in the middle, so a smooth dome that vanishes at the perimeter)
and a low-frequency crease field. Ten unit tests, all passing, including that a face point is exactly
fixed and a corner lands exactly on the sphere.

**Four iterations, each fixing a real defect found by looking at the render:**

1. **v1** — the cushions came out smooth and plastic while the arms beside them kept their cloth.
   Cause: replacing `RoundedBox` throws away its UV layout, and a `BoxGeometry` face's UVs are 0→1
   whatever its size — the same trap as `.147`'s grain. Fixed by box-projecting the UVs at a fixed
   physical period.
2. **v2** — the back cushions grew a **scalloped top edge**. Cause: sagging the top face of a *back*
   cushion is wrong physics. A back cushion is squeezed front-to-back, not loaded from above, and the
   dip lands exactly on the silhouette a viewer reads straight on. Fixed with a `sagScale` parameter,
   0.15 for backs.
3. **v3** — clean, and arguably nicer than shipped: soft pillowy backs, a gentle seat dip.
4. **v4** — doubled the fabric tile density, in case the weave was simply too coarse.

**And the measurement says no, consistently:**

| | micro-sd | micro/mean |
| --- | --- | --- |
| shipped (`RoundedBox`) | 6.66 | **0.0470** |
| v3, tile 0.20 m | 6.39 | 0.0455 |
| v4, tile 0.10 m | 6.35 | 0.0452 |

Every variant is **below** shipped, and the denser weave made it slightly worse still. The reference
photographs sit at **0.157–0.174**.

**The insight worth keeping — and it closes this route.** Adding smooth curvature *lowers*
high-frequency contrast: a curved surface catches light more evenly than a flat one with a crisp edge.
The photograph's micro-contrast does not come from a cushion-sized sag at all; it comes from **creases
at a far finer scale than any deformation this pipeline can carry** at 14 × 6 × 14 segments and this
viewing distance. At that scale it is a normal-map problem — and `.157` already showed the normal-map
route is exhausted (weave settled at 1.3, the wrinkle channel moves microcontrast the wrong way).

So the upholstery gap is **not closable by tuning**: it needs either genuine cloth simulation baked
per cushion, or a hand-authored crease normal map at a resolution the procedural generator does not
currently reach. That is a project, not a round, and this is the evidence for scoping it.


## A better-controlled metric, and it moves the target (v0.31.5.160)

Three rounds of failing to close the upholstery gap were reason to question the *measurement*, not
just the fixes.

**First, one more refutation.** If the app's cloth is flat, perhaps its weave is simply too coarse:
`getFabricNormal()` returns a **shared 256² singleton with `repeat` left at (1, 1)**, so one tile
stretches across a whole face — 0.6 m on a cushion, 2.0 × 1.4 m on a rug, 1.0 × 2.75 m on a curtain
panel — exactly the "one scale per object, stretched by aspect" defect `.147` found in wood. Swept the
shared repeat 1× → 3× → 6×:

| weave repeat | micro/mean |
| --- | --- |
| **1× (shipped)** | **0.0470** |
| 3× | 0.0388 |
| 6× | 0.0356 |

**Finer is worse**, monotonically. At walking distance a finer weave falls under the screen sampling
rate and the mipmap chain averages it away. The shipped tiling is at its sweet spot for this pose, and
that is the fourth consecutive lever that moves micro-contrast the wrong way.

**Second, a fairer metric — compare fabric to the WALL IN THE SAME IMAGE.** Absolute micro-sd across
two images conflates exposure, subject and JPEG noise. A within-image ratio removes all three:

| | mean | micro-sd | micro/mean |
| --- | --- | --- | --- |
| photo: plain wall | 199.8 | 1.56 | **0.0078** |
| photo: pale cream curtain (left) | 184.2 | 25.73 | **0.1397** |
| photo: pale cream curtain (mid) | 170.2 | 31.84 | **0.1871** |
| photo: dark leather sofa | 87.8 | 15.28 | 0.1739 |
| app: pale cream curtain | 158.9 | 3.94 | **0.0248** |
| app: pale woven sofa | 141.8 | 6.66 | **0.0470** |

Two things fall out.

**The JPEG-noise caveat from `.157` is dead.** The photograph's own plain wall sits at **0.0078** — a
*lower* noise floor than the app's walls (0.0073–0.0156). Compression is not what inflates its fabric
numbers; within one image, fabric carries **~18× the wall's micro-contrast**. In the app that ratio is
about **2.3×**. So the app's textiles are under-textured by roughly **8× relative to its own walls**,
and that statement survives every difference between the two images.

**And the target moves.** The curtain, not the sofa, is the bigger gap — **0.0248 against 0.140–0.187,
about 6× flatter**, versus the sofa's 3.7×. Three rounds were spent on cushions while the larger,
flatter textile was in the same frame. `.156` already found the curtain was an extrusion and fixed the
fold *direction*; what this says is that its fold *contrast* — the dark shadow between gathers, which
in the photograph is deep and irregular — is where the missing 6× lives. That is the next round, and
`.156` records the one hard constraint it must respect: fold depth is capped by the window-sill
standoff, so the contrast has to come from somewhere other than simply making the wave deeper.


## Six material levers, and the seventh is the lighting (v0.31.5.161)

`.160` moved the target to the curtain (app 0.0248 against the photograph's 0.140–0.187). Two more
material levers, then the measurement that explains all of them.

**Lever 6 — the shipped fabric PATTERNS.** The default plan hangs *plain* cotton while the reference
curtain is a patterned jacquard, so the gap might be a content choice. Re-propped every curtain in the
flat through each shipped pattern:

| plain | herringbone | dots | plaid | photograph |
| --- | --- | --- | --- | --- |
| 0.0356 | **0.0399** | 0.0382 | 0.0380 | 0.140–0.187 |

**+12 % at best.** The tone-on-tone patterns are, by design, whispers; they do not begin to close a 4×
gap.

**Lever 7 — the drapery weave relief.** `getDraperyMaterial` passes `weave = 0.65`, deliberately half
the upholstery's 1.3 ("curtains … occupy a large share of the frame, so the upholstery's stronger 1.3
would be loud here") — settled on taste, before there was a photographic target. Swept it:

| 0.65 (shipped) | 1.3 | 2.2 | 3.2 |
| --- | --- | --- | --- |
| 0.0356 | 0.0366 | 0.0392 | **0.0436** |

A **5× increase in relief buys +22 %.** Normal-map amplitude is not the limiter either.

**The measurement that explains it.** If relief barely converts into image contrast, the suspect is
the light rather than the surface — a bump only reads when something *directional* shades its two
sides differently. Same pose, same materials, lamps on vs off:

| | lamps ON | lamps OFF | |
| --- | --- | --- | --- |
| **sofa** (deep in the room, lamp-lit) | mean 141.7, micro/mean **0.0470** | mean 102.8, micro/mean **0.0760** | **+62 %** |
| curtain (at the window) | mean 158.4, 0.0356 | mean 88.9, 0.0310 | −13 % |
| wall (at the window) | mean 189.2, 0.0157 | mean 122.6, 0.0137 | −13 % |

**Turning lights OFF makes the sofa's micro-contrast go UP by 62 %, with no material change at all** —
and up 17 % in absolute micro-sd too, not just as a ratio. The surfaces near the window go the other
way, which is the same mechanism seen from the other side: they lose their only key and are left with
the flat daylight fill, while the sofa *gains* directionality when the diffuse lamp wash is removed
and the window becomes its dominant source.

**So six material levers have now been tried across `.157`–`.161`** — weave `normalScale`, the wrinkle
channel, part jitter, a tessellated sag/crease cushion, weave tiling density, fabric pattern, drapery
relief — and not one moves micro-contrast more than ~20 %, several move it *down*. Changing which
light dominates moves it **62 %**. The textiles are not under-detailed; **their detail is being washed
out by a positionless fill**, which is the DEFAULT-GLOOM trade measured in `.86` and left as the
user's call, and the same wall `.133`/`.138`/`.141` hit from the lighting side.

That is the honest end of the materials route: the remaining textile gap is downstream of a lighting
decision that is not mine to make.


## `photographicFill` — the flag exists now, and it shows where the fill really lives (v0.31.5.162)

`.161` ended with the textile gap sitting downstream of a lighting decision. Rather than leave that
blocking two lines of work, this ships the alternative **behind a flag, default OFF**, so the two looks
are comparable without changing what anybody sees.

**What shipped.** `FEATURE_FLAGS.photographicFill` (`tier: 'simple'`, `default: false`, not `devOnly`)
and a pure `photographicFillScale(on) → 0.55 | 1` in `look.ts`, applied to the hemisphere, the flat
ambient **and** `scene.environmentIntensity`. **The sun keeps its full graded intensity**
(KEY-FILL-BALANCE), so this is purely a key:fill ratio change, not a dimmer. Five unit tests: the
scale is a no-op when off, the flag is off by default in *both* UI modes, and — because it is a look
preference rather than a pro tool — it is `tier: 'simple'` so it stays **reachable** in the default
mode.

**Measured at the living-room pose, 13:00, maximum tier:**

| | OFF | ON (hemi+ambient) | ON (hemi+ambient+IBL) |
| --- | --- | --- | --- |
| curtain micro/mean | 0.0356 | 0.0382 | **0.0421** (+18 %) |
| sofa micro/mean | 0.0470 | 0.0494 | 0.0503 (+7 %) |
| wall micro/mean | 0.0157 | 0.0169 | 0.0171 |
| frame mean | 168.9 | 167.3 | 165.7 |
| **frame %<64** | **1.28 %** | 1.46 % | **1.60 %** |

Scaling only the analytical hemisphere/ambient was nearly inert; adding the IBL probe roughly doubled
the effect, which is worth recording on its own — **the probe is the larger half of the positionless
fill by day**. But `%<64` reaches only **1.60 %** against the photographic **11.2–12.2 %** measured in
`.134`. A 45 % cut in both fill halves buys about a quarter of a stop.

**Why it cannot reach further, and what the real target is.** The remaining light is the **fixtures**,
and they are all on: `state/storage/firstPaintDaylight.ts:ensureDaylightFirstPaint()` switches the
interior lights ON at first paint **at any hour**, on a fresh seed, for legibility — a deliberate,
recorded decision. So the default frame at 13:00 has every ceiling light and lamp burning in full
daylight, which no real interior does. `.161` measured what that costs: turning the lamps off raises
the sofa's micro-contrast **+62 %**, far more than any material lever and far more than this flag.

So the honest ordering of the remaining levers is now: **fixtures at midday (≈+62 %) ≫ positionless
fill (+7–18 %) ≫ any material change (≤ +20 %, often negative)**. The flag is shipped and off; the
next thing to examine is `ensureDaylightFirstPaint`, which is a legibility decision made before any of
this was measured.


## The fixtures at midday were the lever (v0.31.5.163)

`.162` shipped `photographicFill` and measured it reaching only `%<64` 1.60 % against a photographic
11.2–12.2 %, with the diagnosis that the remaining light is the **fixtures** — every lamp and ceiling
light burning at 1 pm, because `ensureDaylightFirstPaint()` switches them on at first paint at any
hour. This extends the same flag to skip **only the daytime half** of that guard.

**The default is untouched, and deliberately so.** The all-hours rule is `DEFAULT-GLOOM` (`.86`),
shipped on the user's decision, and the night behaviour — a dark flat is still lit — is the legibility
case the guard exists for. `shouldLightFirstPaint(daylight, photographicFill)` is pure and
unit-tested: with the flag off it returns true at every hour; with it on it returns false **only** at
full daylight; a non-finite daylight returns true rather than risking a black screen. `firstPaintDaylight`
matches `useSunPosition` exactly (effective local hour through `hoursToDate`) so the guard and the
renderer can never disagree about whether it is daytime.

**Verified end to end**, with the page clock frozen before load (a boot-time guard cannot be tested at
the hour the probe happens to run at):

| boot | flag | resolved `lightsMode` |
| --- | --- | --- |
| 13:00 | off | `on` — shipped behaviour intact |
| 13:00 | **on** | **`off`** |
| 21:00 | on | `on` — legibility case intact |

**Then calibrated against the photograph rather than guessed.** Swept the fill scale with the daytime
fixtures already off:

| | sofa micro/mean | frame mean | `%<64` |
| --- | --- | --- | --- |
| shipped (flag off) | 0.0470 | 168.9 | 1.28 % |
| fixtures off only (scale 1.0) | 0.0761 | 117.0 | 7.78 % |
| **scale 0.8** | **0.0838** | 110.4 | **11.39 %** |
| scale 0.55 | 0.0986 | 99.9 | 21.50 % (≈2× past) |
| **photograph (`.134`)** | 0.157–0.174 | — | **11.2–12.2 %** |

**0.8 lands inside the photographic band**, so `PHOTO_FILL_SCALE` is now 0.8 with the sweep recorded
beside it. Sofa micro-contrast is **+78 %** over shipped — against ≤ +20 % for every material lever
tried in `.157`–`.161`, and often negative.

**And it reframes an earlier finding.** With the flag on the window is finally the brightest thing in
the frame. `.146` and `.154` both asked why the window read as a pale lightbox; the answer was never
the glass, and not only the empty backdrop — **the room was too bright for its own window**. Deep
shadow, surface texture and a window that reads as a window all turn out to be the same measurement.

The trade is exactly what `.86` recorded: the room is dimmer and the far corners go dark. That is why
this ships **off**.


## Relief and light balance are one knob (v0.31.5.164)

`.161` claimed that the material levers failed because relief only becomes image contrast when
something directional shades a bump's two sides. `.163` gave us a lighting balance to test that
against. This is the test, and it confirms it about as cleanly as a measurement can.

**The same material change, under two lighting balances** — drapery weave relief 0.65 → 2.2:

| | shipped fill | `photographicFill` |
| --- | --- | --- |
| curtain micro/mean | 0.0356 → 0.0392 | 0.0346 → **0.0822** |
| gain | **+10 %** | **+138 %** |

**Fourteen times the effect from an identical edit.** Upholstery 1.3 → 2.0 behaves the same way:
sofa 0.0838 → 0.0978 (+17 %) under the photographic balance, where the shipped-fill sweep in `.157`
had rejected 2.0 as "a regular grid that looks like mesh screen".

So the relief constants were not wrong; **they were at their useful ceiling for the fill they were
tuned under.** Turning the fill down does not merely deepen shadows — it makes previously wasted
relief start paying. The flag now carries both halves (`PHOTO_WEAVE`, values rather than a multiplier,
since one scale cannot serve a 0.65 drapery baseline and a 1.3 upholstery one).

**Where the photographic balance now stands, end to end:**

| | shipped (flag off) | flag ON | photograph |
| --- | --- | --- | --- |
| curtain micro/mean | 0.0356 | **0.0822** | 0.140–0.187 |
| sofa micro/mean | 0.0470 | **0.0958** | 0.174 |
| fabric ÷ wall | 2.6× | **5.9×** | ~20× |
| frame `%<64` | 1.28 % | **11.61 %** | **11.2–12.2 %** |

**Deep shadow is now inside the photographic band**, and textile micro-contrast has roughly doubled —
against ≤ +20 % for every material lever tried alone. The remaining fabric gap is about 2×, and the
fabric ÷ wall ratio says the same thing: 5.9× against ~20×.

The default is still untouched. What has changed is that the alternative is no longer a dimmer switch
— it is a calibrated look, with the deep-shadow metric on target and the material relief tuned to
match it.


## The photographic balance is VIEW-DEPENDENT, and the dollhouse pays for it (v0.31.5.165)

`.163`/`.164` measured `photographicFill` at one first-person pose. Before it could ever be proposed
as a default it has to be checked across the app — starting with the frame a new user actually sees
first, the orbit dollhouse.

**Boot state confirms the wiring end to end at midday:** flag off → `lightsMode: 'on'`; flag on →
`'off'`. No crash, and **nothing goes black**: near-black pixels (`<24`) are 0.00 % → 0.02 %.

**But the dollhouse gets measurably colder and flatter**, over the model region only (excluding the
grey backdrop):

| | mean luma | mean rgb | R/B | mean saturation |
| --- | --- | --- | --- | --- |
| flag OFF | 180.9 | (185, 180, 176) | **1.047** | **0.053** |
| flag ON | 158.8 | (159, 159, 159) | **0.998** | **0.030** |

**The warmth is gone entirely** — R/B falls to 1.00, dead neutral, and saturation drops **43 %**. Side
by side the shipped boot view has warm pools of light in the living room, kitchen and bedrooms; with
the flag on the whole model reads as uniform cool grey.

**This is exactly what `firstPaintDaylight.ts` predicted.** Its recorded rationale is that the fixtures
buy legibility and that "a night render with lights on is not just legible, it is the more inviting
first impression of the two — warm pools of light, the TV glowing". That argument was written about
the boot view, and it still holds *there*. What `.163`/`.164` measured is a different view with a
different requirement: standing inside a room at 1 pm with every lamp burning is what makes the walk
view read as CG.

**So the balance is view-dependent, and that is the finding.** In first person it is a large,
calibrated win (deep shadow into the photographic band, textile micro-contrast roughly doubled). In
the orbit dollhouse it removes the warmth the view was designed around, for no photographic gain — a
dollhouse is a product illustration, not a photograph of a room someone is standing in.

**Not acted on, deliberately.** The obvious fix — skip the fixtures only in first person — cannot be
done inside `ensureDaylightFirstPaint`, which runs once at boot in orbit mode; making it
camera-dependent would mean toggling `lightsMode` on every camera change, which would fight the user's
own lights switch and silently overwrite a real preference (the guard's own first rule is "only ever
touch untouched defaults"). Doing it properly means separating "the user's lights setting" from "what
this view renders", which is a design change, not a tweak. Recorded with the numbers so the trade is
visible: **`photographicFill` currently buys walk-view realism at the cost of the boot view's warmth.**


## Separating the user's setting from what a view renders (v0.31.5.166)

`.165` found the photographic balance is view-dependent — a large win in first person, a loss in the
dollhouse — and deliberately did not act, because the obvious fix would have had
`ensureDaylightFirstPaint` fight the user's own lights toggle. This does it the right way instead.

**The two things that were one value are now two.** `lightsMode` is the **user's setting**; nothing in
the render path writes it, and `ensureDaylightFirstPaint` is **unconditional again**, exactly as
`DEFAULT-GLOOM` (`.86`) recorded — `.163`'s boot-time coupling is reverted. What a given view *draws*
is now a separate, pure decision: `scene/look.ts:fixturesRender(lightsOn, cameraMode, daylight,
photographicFill)`, consumed by `FurnitureLights`.

The rule is deliberately narrow. Fixtures are skipped **only** in first person, **only** in full
daylight, and **only** under the flag. Nine assertions pin the rest: with the flag off it is exactly
`lightsMode === 'on'` in every view and at every hour; fixtures the user switched off are never lit;
the dollhouse always keeps them; night always keeps them; and a non-finite daylight keeps them rather
than risking a black room.

**Both halves verified, at one pose each:**

| dollhouse (model region) | luma | R/B | saturation |
| --- | --- | --- | --- |
| flag OFF | 180.9 | 1.047 | 0.053 |
| flag ON, `.165` | 158.8 | 0.998 | 0.030 |
| **flag ON, `.166`** | **179.7** | **1.051** | **0.056** |

| walk view | curtain | sofa | `%<64` |
| --- | --- | --- | --- |
| flag ON, `.164` | 0.0822 | 0.0958 | 11.61 % |
| **flag ON, `.166`** | **0.0822** | **0.0958** | **11.68 %** |

**The dollhouse is fully restored — warmer than the flag-off baseline, in fact — and the walk view's
numbers are unchanged to four decimals.** The boot state confirms it: `lightsMode: 'on'` again at
first paint.

That is the whole trade from `.165` removed, without touching the user's switch or the recorded
default. `photographicFill` now costs only what `.86` always said it would: a dimmer room when you are
standing in it at midday.


## The windowless rooms (v0.31.5.167)

`.166` verified `photographicFill` at one walk pose and the boot view. Parity means the rooms that
pose cannot reach — and the windowless ones are exactly where a fixtures-off rule should be expected
to fail. `window-pane.mjs` gains a `ROOM` env that stands at a named room's centroid, which the
window-standoff pose structurally cannot do.

**It failed, as suspected:**

| room | flag OFF | flag ON (`.166`) |
| --- | --- | --- |
| Bath/WC | mean 183.5, `%<64` 0.02 % | mean **94.6**, 6.00 % |
| Corridor | mean 195.2, `%<64` 0.00 % | mean **98.6**, **31.06 %** |
| Household shelter | mean 196.7 | mean 103.7, 8.53 % |

A room with no window gets nearly all its light from those fixtures. Removing them halves it. Its
occupants switch the light on at noon for exactly that reason, and the user had already asked for
lights on — the flag was overriding a real preference where daylight could not replace it.

**The fix narrows the rule again, by geometry.** New pure `lighting/daylitRooms.ts`:
`daylitRoomIds(plan)` probes each window's midpoint a little way to both sides and attributes it to
whichever room contains the probe (so an interior window lights both); `fixtureSurvivesDaylight`
then keeps any fixture standing in a room daylight cannot reach. Doors are ignored — a door is not
daylight — and a degenerate wall, a missing wall, an empty plan and a fixture outside every room
(a ledge, a balcony) are all covered. Eleven tests.

**Result:**

| room | flag ON (`.166`) | flag ON (`.167`) |
| --- | --- | --- |
| **Corridor** | 98.6, `%<64` 31.06 % | **189.4, 0.00 %** — fully recovered |
| Bath/WC | 94.6, 6.00 % | **115.9, 1.40 %** |

The corridor is truly windowless and comes back completely. **The bathroom does not, and that is
correct**: `apartment/constants.ts` gives the HDB baths *"ventilation windows (high-sill), over the AC
ledge"*, so they are daylit rooms by the rule and their fixtures are dropped. A small high vent window
at noon with the light off is a dim bathroom — which is what a photograph of one looks like.

**Cost to the walk view, stated plainly:** `%<64` slips **11.68 % → 10.93 %**, just under the
photographic 11.2–12.2 % band, because windowless-room fixtures now leak a little light back into the
frame. Curtain and sofa micro-contrast are unchanged (0.0820 / 0.0946).

**Known residual, not fixed here:** `setFixtureGlow` is a single global signal, so in a daylit
first-person view the lamp *shades* stop glowing everywhere while windowless-room fixtures keep
emitting. The shade glow is a subtle self-illumination rather than a light source, so the visible
effect is small, but making it per-room is the follow-up.


## The calibration only held on the tier nobody boots into (v0.31.5.168)

Every walk measurement in `.162`–`.167` was taken at **maximum**. The capability-detected boot tier is
**medium** (`quality.ts:tierForCapabilities` — High and Maximum are never auto-selected). So the
photographic calibration had been verified on a tier almost no user is on.

**Measured across the three tiers at one pose, 13:00, `PHOTO_FILL_SCALE` a single 0.8:**

| tier | flag OFF `%<64` | flag ON `%<64` | curtain | sofa |
| --- | --- | --- | --- | --- |
| maximum | 1.28 % | **10.93 %** | 0.0820 | 0.0946 |
| **medium (boot default)** | 0.82 % | **6.84 %** | 0.0719 | 0.0818 |
| performance | 0.55 % | **3.25 %** | 0.0420 | 0.0488 |

**The band (11.2–12.2 %) was reached only at maximum.** The lower tiers make less shadow of their own
— less AO, coarser shadow filtering — so the same fill cut lands nowhere near it.

**So the scale is per tier now**, swept rather than interpolated: medium **0.68 → 9.65 %**, **0.62 →
11.53 %**, 0.60 → 12.31 %. 0.62 it is.

**Performance cannot reach the band at all**, and that is the honest finding rather than a value to
tune: 0.80 → 3.25 %, 0.60 → 3.82 %, 0.45 → 4.71 %. Nearly flat — the tier lacks the machinery that
produces deep shadow, so cutting further only darkens the frame without creating structure. It gets
0.60, which still buys **+227 %** curtain micro-contrast without crushing it.

**Final, tier-aware:**

| tier | scale | `%<64` OFF → ON | curtain OFF → ON | sofa OFF → ON |
| --- | --- | --- | --- | --- |
| maximum | 0.80 | 1.28 → **10.89 %** | 0.0356 → 0.0820 | 0.0470 → 0.0946 |
| **medium** | **0.62** | 0.82 → **11.52 %** ✓ | 0.0245 → **0.0887** (+262 %) | 0.0385 → **0.0921** (+139 %) |
| performance | 0.60 | 0.55 → 3.82 % | 0.0168 → 0.0550 (+227 %) | 0.0234 → 0.0590 (+152 %) |

**The tier a new user actually boots into is now the one inside the photographic band.** An unknown
tier falls back to `medium` for the same reason.


## The rule fired an hour too long, and stepped (v0.31.5.169)

Everything so far was measured at 13:00. Across the day, on medium with the flag on, the fixture rule
turned out to be gated on the wrong signal:

| hour | sun altitude | `%<64`, `.168` |
| --- | --- | --- |
| 08:00 | 13.6° | 14.60 % |
| 13:00 | 82.4° | **11.52 %** |
| 17:00 | 31.2° | 10.39 % |
| 18:00 | 16.4° | 13.42 % |
| **19:00** | **1.6°** | **29.57 %**, mean 88.1 |

**At 19:00 — sun 1.6° up, an hour from dark — the lamps were still being held off.** `daylight >= 1`
uses `daylightFromAltitude`, which is a *night* ramp: it saturates at 1 for every altitude above 0°.
It was the wrong question. Sun **strength** (`lightingFromAltitude(...).sun` — 1.0 above 30°, 0.85 at
10°, 0.4 at the horizon) tracks how much light there actually is.

**Two fixes, both measured.**

1. **Gate on sun strength.** At `sun >= 0.95` (≈23° up) only the middle of the day qualifies. 19:00
   goes **29.57 % → 2.17 %** and 08:00 **14.60 % → 1.02 %**; 13:00 and 17:00 are untouched.
2. **Ramp, don't step.** A hard threshold popped the whole room as the time slider crossed it — mean
   **175 → 109** either side. `fixturesLevel` now smoothsteps 0.86 → 0.95, and windowless rooms keep
   full light through it (the two compose on one pass by scaling `moodMultiplier`).

**Final, medium tier, flag on:**

| hour | `.168` step on daylight | step on sun | **ramp on sun** |
| --- | --- | --- | --- |
| 13:00 | 11.52 % | 11.52 % | **11.53 %** — unchanged |
| 18:00 | 13.42 % | 1.27 % | **2.10 %** — partial, no pop |
| 19:00 | **29.57 %** | 2.17 % | **2.11 %** |

Midday is untouched, the evening keeps its lamps, and the transition is continuous. The photographic
band is a *midday-photograph* target, so it is right that only the middle of the day reaches it — at
08:00 and 18:00 the physical answer is that the lamps are on, and now they are.


## Eight rounds of work no real user could reach (v0.31.5.170)

`photographicFill` shipped as a flag with `default: false`, turned on in the probes through the
`hdb_feature_flags` localStorage map. Reading `features/flags/resolve.ts` properly:

```ts
const privileged = isDev || isAdmin
…
} else if (privileged && key in overrides) { out[key] = overrides[key]! }
else { out[key] = def.default }
```

**Overrides only apply when dev or admin.** In a shipped production build the flag was locked to
`false` for every ordinary user — so `.162`–`.169` were, in the app people actually run, unreachable.
The measurements were all real; the feature was not.

**The fix separates the two things a flag was doing.** The **flag** now ships the *control*
(`default: true`), and a new store setting **`ui.photographicLook`** is the *look* — `false` by
default, so `DEFAULT-GLOOM` (`.86`) is untouched and nothing about the shipped frame moves. The render
path requires both. A `Photographic` switch sits beside `Lights` in the Scene menu (desktop) and the
mobile scene sheet, each guarded by `useFeature('photographicFill')` as the area rules require.

One wrinkle worth recording: the material factories are plain functions outside React and cannot read
the store — `look.ts` is deliberately dependency-free, and materials importing the UI store would close
a cycle. So `Lighting` publishes the resolved state through a module signal
(`scene/photographicSignal.ts`), the same shape as `lighting/fixtureGlow.ts`. It defaults to `false`,
which is the shipped look, and the weave value is folded into the material cache key, so flipping the
setting serves a different cached variant rather than mutating a shared one.

**Verified through the setting rather than the flag** (medium tier, 13:00):

| | frame mean | `%<64` | curtain | sofa |
| --- | --- | --- | --- | --- |
| setting OFF (default) | 179.5 | **0.86 %** | 0.0245 | 0.0463 |
| setting ON | 109.0 | **11.52 %** | **0.0887** | **0.0921** |

Off matches the shipped baseline to a decimal; on reproduces `.168`'s calibrated numbers exactly. The
photographic look is now one switch away for anybody running the app, and off until they ask for it.


## The metric cannot tell cloth from mesh (v0.31.5.172)

`.164` set `PHOTO_WEAVE` at drapery 2.2 / upholstery 2.0 from a sweep that stopped there, and the
curve was still climbing. The photograph sits at 0.140–0.187. So: does more relief keep paying?

**By the metric, yes — almost all the way there:**

| drapery / upholstery | curtain micro/mean | sofa |
| --- | --- | --- |
| **2.2 / 2.0 (shipped)** | 0.0887 | 0.0921 |
| 3.2 / 3.0 | 0.1140 | 0.1091 |
| 4.5 / 4.0 | **0.1370** | 0.1235 |
| photograph | 0.140–0.187 | 0.174 |

At 4.5 the curtain is inside the photograph's range. **And it looks worse.** At a 4× crop the fabric
is a **regular horizontal-dash lattice** — a repeating waffle, hardest and highest-contrast at 4.5,
already faintly visible at the shipped 2.2. It is the exact failure `.157` recorded when the
shipped-fill sweep rejected upholstery 2.0 as "a regular grid that looks like mesh screen"; the
photographic balance did not remove that ceiling, it only moved it.

**So `PHOTO_WEAVE` stays at 2.2 / 2.0**, and the more useful result is the limit itself:
**micro-contrast is necessary but not sufficient.** It measures *how much* high-frequency signal a
surface has, not whether that signal is organised like cloth or like wire mesh, and the two are
indistinguishable to it. Every measurement in `.157`–`.171` should be read with that caveat.

**Which gives the next materials task a real specification.** The gap is not amplitude — it is
**regularity**. `buildUpholsteryHeight` builds its weave from `sin(x * 2.4) · sin(y * 2.4)` with a
phase warp; the threads are evenly spaced and evenly bright, so scaling it up scales up a lattice.
Real cloth has thread-to-thread variation in *thickness and brightness*, slubs, and the occasional
missed or doubled pick. Closing the remaining ~2× wants an irregular height field at the same
amplitude, not a louder regular one — and the way to test it will be the 4× crop, not the number.


## An irregular weave (v0.31.5.173)

`.172` specified the fix: the gap is **regularity, not amplitude**. `buildUpholsteryHeight` wove
`sin(x·2.4)·sin(y·2.4)` with a phase warp — the threads meander, but every one is the same thickness
and the same brightness, so scaling the relief scaled a lattice. This builds the irregularity instead.

**New pure `threadGain(index, salt)`** in `procedural/upholsterySeams.ts`: a deterministic per-thread
multiplier keyed to the **thread index** rather than the pixel, averaging **1.0** by construction, plus
a rare thin pick (7 % at 0.3×). Real cloth varies thread to thread in thickness and brightness and
drops the occasional pick; this is that, and nothing else — the weave keeps its mean and its
amplitude, so it changes character without changing exposure.

**It adds no new frequency content**, which matters here: the variation is keyed to the thread index,
so it sits at the weave's own ~0.38 cycles/texel and cannot alias. That is the same discipline
`FABRIC-FINE-NYQUIST` records after the fuzz term once ran seven times over Nyquist.

**Judged by the 4× crop, as `.172` said it had to be.** Side by side at the same amplitude: the old
weave is an even lattice, every dash the same size and brightness marching in perfect rows; the new
one varies dash to dash, some rows thicker and brighter, some threads thin. It reads as woven cloth
with slubs rather than a stamped grid. **The regularity that read as mesh is broken up without
touching the amplitude that caused it.**

**The numbers came along too**, though they were not the goal:

| | curtain | sofa |
| --- | --- | --- |
| photographic look, regular weave | 0.0887 | 0.0921 |
| photographic look, **irregular** | **0.0958** | **0.0991** |
| photograph | 0.140–0.187 | 0.174 |

**And the shipped default look is unmoved**, which had to be checked because this is the *shared*
fabric normal: frame mean **179.5 → 179.6**, `%<64` 0.86 % → 0.83 %, curtain 0.0245 → 0.0248. The sofa
gains a little (0.0463 → 0.0524) at identical brightness — a small free improvement for every user,
not a change of look.


## Clouds: built, and invisible — the pane transmits no structure (v0.31.5.174)

A visual audit of the photographic look at maximum tier, against the reference photograph, put the
**window** back at the top of the list: measured over the glazing it spans **158–181 luma**, a smooth
ramp and nothing else. A real window is the one place in an interior photograph with *content* in it.
`.146` chased that through the glass and `.154` through the backdrop; the simplest missing thing is
that the analytic sky **has no clouds**.

**Built properly.** A pure `skyClouds.ts`: a cloud deck projected onto a horizontal plane
(`p = dir.xz / dir.y`), which is what compresses puffs into bands toward the horizon and keeps them
broad overhead — a flat noise over azimuth/elevation gives evenly-sized puffs everywhere and looks
wrong. Thresholded into separated puffs, faded in over the first ~3° so the deck never ends in a hard
line, projected distance capped so the horizon cannot alias into speckle. Ten unit tests. Applied
above the horizon only, in `paintSkyEquirect` **and** `paintSkySurround`, never to
`scene.environment` — so the IBL and every key:fill measurement in this arc stay untouched.

**And it is invisible.** Window glazing, same pose:

| | mean | sd |
| --- | --- | --- |
| clear sky | 172.3 | 35.56 |
| with clouds | 172.5 | **35.61** |
| with clouds, dome 256×128 → **768×384** | 172.5 | 35.63 |
| with clouds, pane emissive cut to a quarter | 154.2 | **27.73** |

Three hypotheses tested and all refuted. It is not which painter (both now carry the deck), not the
dome resolution (tripling it changes nothing), and not the pane's flat sky-catch emissive — cutting
that to a quarter makes the window *darker AND less varied*, which is the opposite of what it would do
if the emissive were masking transmitted structure.

**So the wall is the transmission itself: the pane delivers no fine structure from behind it.** That
is consistent with `.154`, where the `city` preset's tower blocks were visible but only as faint broad
masses. The remaining suspects are on the material — `windowGlassPhysical`'s **`roughness 0.1`**,
which blurs the transmission through the mip chain, and the pane's `thickness`/attenuation volume.
That is the next thing to test, and it is a two-line sweep.

**The cloud field was reverted rather than shipped.** It is correct and cheap, but it changes nothing a
user can see, and shipping invisible code fails the same standard this arc has held everywhere else.
The design is recorded above in enough detail to rebuild in an hour once transmission carries
structure — which is the right order to do it in.


## Two corrections to my own window measurements (v0.31.5.175)

`.174` concluded "the glass parameters are irrelevant — the pane delivers no fine structure". Both
halves of that turn out to need correcting, and the second correction reaches back over three rounds.

**Correction 1 — the `.174` sweep never took.** `Window.tsx` builds the pane with

```tsx
roughness={Math.max(glassPhysical.roughness, glassParams.roughness)}
```

`glassParams.roughness` is **0.1** and `windowGlassPhysical`'s is 0.05, so the max always picks 0.1.
Setting the config value to 0 — which is what `.174` swept — changes nothing by construction. The
conclusion was drawn from an experiment that could not have moved.

**Swept properly** (patching the value that actually applies), pane roughness 0.1 → 0.02 → 0:
micro-sd **19.96 → 20.18 → 20.18**. So the conclusion survives — transmission blur is not the blocker
— but it is now measured rather than assumed, and `windowGlassPhysical.roughness` is revealed as
**dead config**: the `Math.max` means it can only ever matter if it exceeds 0.1, which it does not.

**Correction 2 — about half of every window number in this arc is the SAFETY GRILLE.** The crop used
since `.146` spans the whole glazing, which the approved SNV grille crosses with a dense grid of hard
bars. Measured on the same frame:

| region | mean | sd | micro-sd |
| --- | --- | --- | --- |
| whole glazing (grille included) | 176.4 | 37.78 | **20.18** |
| **one pane cell, between bars** | **193.7** | 21.95 | **11.06** |

**The bars carry roughly half the window's measured micro-contrast.** Every window figure in `.146`,
`.154` and `.174` is a grille-plus-glass statistic, not a statement about the view.

**And that overturns the "pale flat panel" reading.** Inside a single cell the glazing measures
micro/mean **0.057** — the same range as the app's own fabrics, and not remotely flat. What makes the
window read as a slab is its **low saturation and smooth large-scale ramp**, not an absence of detail.
Which means the thing to change is the sky's *colour and gradient*, not its fine structure — and it
explains why `.174`'s clouds, a fine-structure fix, could not have helped.


## Closing the window thread: the comparison was not like-for-like (v0.31.5.176)

With `.175`'s corrected crop — one pane cell, no grille — the remaining question was the one that
survived: the glazing reads cool and desaturated. Measured against the reference photograph:

| | saturation | mean rgb |
| --- | --- | --- |
| app, one pane cell (sky backdrop) | **0.082** | (179, 188, 195) — cool |
| app, one pane cell (city backdrop) | 0.073 | (186, 195, 201) — cool |
| photo, left window | **0.213** | (207, 197, 173) — warm |
| photo, middle window | **0.249** | (200, 187, 160) — warm |

Three times the saturation, and the opposite hue. That looks damning until you look at what is
actually behind each pane: **the photograph's windows are filled with cream curtains and warm timber
louvres**, and the app's are filled with clean blue midday sky. A window showing blue sky at 13:00
*is* cool and desaturated. Chasing the photograph's hue here would mean warming a midday sky toward
sunset, which would be wrong.

**So the window thread closes as a content question, not a rendering one**, and it is gated on a
recorded product decision (`WINDOW-SKY-DEFAULT`, `.92`) rather than on anything measurable I can fix.
For the record, what the last four rounds established about it:

- the glass is real transmissive glass and its parameters are **not** the limiter (`.175`: roughness
  0.1 → 0 buys +1 %);
- the pane is **not** a flat slab — inside one cell it measures micro/mean 0.057, the same range as
  the app's fabrics (`.175`);
- roughly **half** of every earlier window figure was the safety grille (`.175`);
- adding fine structure to the sky cannot help, because fine structure was never what was missing
  (`.174`);
- and the residual difference against this photograph is **what is outside the window**, which is a
  content choice.

Also fixed in passing: `windowGlassPhysical.roughness` is documented as inert at its shipped value —
the `Math.max` with the glass KIND means it can only ever matter above 0.1 — with the measured sweep
recorded beside it, so the round I spent assuming otherwise is not repeated.
