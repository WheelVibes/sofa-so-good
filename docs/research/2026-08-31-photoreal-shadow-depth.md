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


## The room is cooler than a photograph, and the warmth dial cannot reach it (v0.31.5.177)

Post-production writing for architectural renders is consistent that the finishing grade is where a
render becomes photographic — "set exposure and white balance first", "warm the highlights", with
restrained saturation and modest contrast
([Archfine](https://archfine.com/rendering-techniques/render-post-production-photoshop),
[3DAS](https://www.3dastudio.com/rendering-tips/archviz-photoshop-post-production),
[Maverickframe](https://maverickframe.com/blog/post-processing-architectural-visualization/)).
So: is the app's grade neutral where a photograph's is warm?

**Measured by tonal band, R/B, with the WINDOW MASKED OUT** — `.176`'s lesson, so both sides describe
the *lit surfaces of a room* rather than the view:

| | shadows | midtones | highlights |
| --- | --- | --- | --- |
| photo 1 | 2.983 | 1.415 | **1.128** |
| photo 2 | 1.043 | 1.123 | **1.102** |
| app, default look | 1.528 | 1.098 | 1.054 |
| app, photographic look | 1.124 | **1.005** | **1.006** |

**The app's lit surfaces are neutral where photographed ones are warm** — and the gap is largest under
the photographic look, because that is where the warm fixtures step aside and leave a sky-graded fill.
Unmasked, the photographic look's highlights read 0.950 (cool); that is the window, and masking it out
is what makes the comparison honest.

**The app already has the control, and it cannot reach.** `sceneWarmth` (default 0) tints the lights
through `warmthTintRGB(b) = [1 + 0.14b, 1, 1 − 0.16b]`, so the +9 % the measurement asks for solves to
**b ≈ 0.29**. Wired up as a photographic-look offset and rendered:

| | midtones | highlights |
| --- | --- | --- |
| photographic, warmth 0 | 1.005 | 1.006 |
| photographic, **+0.29** | 1.023 (**+1.8 %**) | 1.008 (**+0.2 %**) |

**A fifth of the predicted effect on midtones and none on highlights.** The reason is structural and
is the same shape as `.162`: `warmthTintRGB` tints only the **analytical** lights — sun, hemisphere,
ambient — and under the photographic look those are scaled to 0.62–0.8 while the **IBL probe**, which
it does not touch, carries the rest. `.162` hit this exactly once before, when scaling only the
hemisphere and ambient was nearly inert until `scene.environmentIntensity` came down with them.

**So the offset was reverted, and the finding is where a fix has to go:** the probe's own colour.
`SceneEnvironment` builds it from `Lightformer`s with hardcoded cool tints (`#cfe0f2`, `#9fb0c4`), and
warming those is the only lever that reaches the dominant term. It is not free — the module carries a
`GPU-STARVE-2` note that the probe lives in a render target and re-bakes are expensive — but under a
fixed photographic offset it would re-bake once, on the toggle. That is the next round's work, and it
is worth saying plainly that **the shipped `sceneWarmth` dial is much weaker than its range suggests
whenever the IBL is doing the lighting.**


## Warming the probe, which is where the fill actually is (v0.31.5.178)

`.177` measured the app's lit surfaces as neutral where photographed ones are warm, and found the
existing `sceneWarmth` dial reached only a fifth of the predicted effect because it tints the
**analytical** lights while the **IBL probe** carries the rest. This puts the tint where the light is.

**`tintHex(hex, bias)`** applies the same `warmthTintRGB` curve to the probe's `Lightformer` colours,
and `SceneEnvironment` wraps all eight of them. The identity case matters as much as the maths: at
bias 0 it returns **the input string itself**, so with the photographic look off React sees identical
props and the probe's render target never re-bakes — the `GPU-STARVE-2` hazard the module documents.
Six tests, including that identity, that it matches `warmthTintRGB` so probe and analytical lights
agree, and that it clamps rather than wrapping.

**Measured, window masked, maximum tier:**

| | shadows | midtones | highlights |
| --- | --- | --- | --- |
| photographic, probe cool | 1.124 | 1.005 | 1.006 |
| photographic, **probe warm** | **1.180** (+5.0 %) | **1.039** (+3.4 %) | 1.009 (+0.3 %) |
| `.177`'s analytical-light attempt | — | 1.023 (+1.8 %) | 1.008 |
| photo 1 / photo 2 | 2.983 / 1.043 | 1.415 / 1.123 | 1.128 / 1.102 |

**Twice the effect of `.177`'s attempt on midtones, and it reaches the shadows** — which the other
path did not. Visually the left wall and the wood lose their blue-grey cast without going orange.

**The default look is byte-identical**, verified against a same-pose, same-tier baseline rendered from
the reverted tree: mean 175.3 → 175.4, R/B 1.726 / 1.165 / 1.085 → 1.725 / 1.165 / 1.085. (My first
attempt at that check compared against a *medium*-tier frame at a different pose and appeared to show
a large regression — worth recording, because it is exactly the kind of false alarm that would have
sunk a good change.)

**And a real ceiling turned up: the highlights barely move — +0.3 % — under any of these levers.**
AgX desaturates highlights toward white by design, so bright surfaces cannot carry much tint no matter
what colour is lighting them. The photographs' 1.10–1.13 highlight warmth comes from a camera pipeline
that keeps it. That caps how close this particular measure can get, and it is a property of the tone
operator rather than of the lighting — a separate, larger decision than anything in this arc.


## Matching the amount of darkness is not the same as putting it in the right place (v0.31.5.179)

The photographic look was calibrated on a single scalar — `%<64` inside the photographic 11.2–12.2 %
band. This asks a different question: **where** does each image spend its light?

Region mean ÷ frame mean, so exposure cancels:

| | ceiling | wall | floor |
| --- | --- | --- | --- |
| photo 1 | **1.28** | 1.43 | **1.23** |
| photo 2 | **1.17** | 0.53 | **1.30** |
| app, default look | 0.92 | 1.12 | 0.70 |
| app, photographic look | **0.75** | 1.09 | **0.66** |

**Both photographs put their ceiling and floor ABOVE the frame average. The app puts both below**, and
the photographic look makes it worse (ceiling 0.92 → 0.75, floor 0.70 → 0.66). The walls are not a
usable target — the two photographs disagree completely (1.43 vs 0.53) depending on what is hanging on
them — but ceiling and floor agree closely across both, which is what makes this a signal rather than
a coincidence.

This is the absence of global illumination stated in a way this arc has not said before. Earlier
rounds framed it as "daylight is spatially flat" (`.138`/`.140`); the sharper version is that **in a
real room the floor catches the window and bounces it onto the ceiling, so both horizontal surfaces
read bright**, and the app has no term that does that.

**Tried the term that is supposed to approximate it, and it cannot reach.** A hemisphere light's
`groundColor` exists precisely as the cheap stand-in for floor bounce. Scaled up under the
photographic look:

| ground bounce | frame mean | `%<64` | ceiling | floor |
| --- | --- | --- | --- | --- |
| ×1.0 (shipped) | 112 | **9.92 %** | 0.75 | 0.66 |
| ×2.0 | 117 | 8.07 % | 0.81 | 0.64 |
| ×3.5 | 123 | **7.10 %** | **0.86** | 0.62 |

**A 3.5× ground bounce buys +15 % of ceiling relative luma and costs the calibration** — `%<64` falls
out of the band — while the floor gets *relatively darker*, because lifting every downward-facing
surface raises the frame mean the ratio is measured against. Reverted.

The reason it cannot work is structural: a hemisphere light lights **every** downward-facing surface
equally, regardless of what is beneath it. Real bounce is directional and local — bright under the
window, dim in the corridor. Reproducing it needs an actual GI term (a light probe grid, a baked
bounce pass, or SSGI), not a brighter constant.

**And there is a lesson about the calibration itself:** hitting the photographic `%<64` band put the
right *amount* of darkness in the frame, but the app spends it on the ceiling and floor, where a
photograph is bright. A single scalar cannot tell you that. Any future calibration should carry the
ceiling/floor relative-luma pair alongside it.


## An instrument for `.179`'s lesson (v0.31.5.180)

`.179` ended with a rule: any future calibration of the photographic look should carry the
ceiling/floor relative-luma pair alongside `%<64`, because matching the scalar alone put the right
amount of darkness in the frame and spent it in the wrong places. A rule in a document is not an
instrument, so this makes it one.

**`scripts/dev-probes/light-distribution.mjs`** takes the standard living-room walk pose and prints,
in a single run: frame mean, `%<64`, and ceiling / wall / floor as **region mean ÷ frame mean** — with
the two HUD rectangles (toolbar, minimap) cut out so neither is ever counted as ceiling or floor. It
prints the photographic targets underneath, including the warning that **wall is not a target** (the
two reference photographs disagree 1.43 vs 0.53 depending on what is hanging on them).

**Both looks, from the new instrument:**

| | frame mean | `%<64` | ceiling | wall | floor |
| --- | --- | --- | --- | --- | --- |
| default look | 183.3 | 1.13 % | 1.05 | 1.11 | **0.77** |
| photographic look | 106.5 | **10.84 %** | **0.85** | 1.08 | **0.77** |
| photographs | — | 11.2–12.2 % | 1.17–1.28 | (disagree) | **1.23–1.30** |

The picture is unchanged from `.179` and now reproducible in one command: the photographic look has
the shadow depth about right and both horizontal surfaces too dark, and **the floor is equally short
under BOTH looks (0.77)** — that is not something the fill rebalance caused, it is the missing bounce.

*A caveat worth stating so nobody compares across instruments carelessly:* the probe's fixed
fractional bands are not the hand-placed crops `.179` used, so its absolute ratios differ a little
(default-look ceiling reads 1.05 here against 0.92 there). The bands are self-consistent, which is
what matters for tracking a change; the numbers are not interchangeable with the earlier hand-crops.


## Half of `.179` was albedo, not light (v0.31.5.181)

`.179`/`.180` reported that the app puts **both** horizontal surfaces below the frame average where
photographs put both above, and called it missing bounce. The floor half of that does not survive.

**What the two reference rooms have on the floor is polished light stone; the default flat has
`floor-vinyl-oak`.** The measured floor band is rgb **(156, 138, 118)** — warm mid-oak. A near-white
painted wall against a mid-oak floor gives a luminance ratio in the region of 0.55 from **albedo
alone**, before any question of how the light is distributed. Measured, the app's floor/wall is
0.77 / 1.11 = **0.69** — i.e. the floor is *brighter* than its albedo ratio would predict, not darker.

So the floor is not under-lit. It is a darker material than the floors in the photographs, and
comparing them was the `.176` mistake again: not like-for-like.

**The ceiling half stands, and is now the whole claim.** Ceilings are near-white in the app and in
both photographs, so albedo is not a confound there: **0.85 (photographic) / 1.05 (default) against
1.17–1.28** is a real difference in where the light goes, and it is consistent with there being no
term for the floor bouncing daylight upward.

**An attempted control failed, and the failure is worth recording.** Re-finishing the living/dining
floor to `floor-tile-marble` and `floor-tile-white` through `setFloorFinish` changes the store —
`state.floor` reports the new id — but **not the render**: the floor band stays rgb (156, 138, 118) for
oak, marble and white alike. Something downstream of `setFloorFinish` does not pick it up on the
curated default flat. That is a plumbing bug, not a graphics one, and it is a real one: a user
changing their floor finish on the move-in demo may see nothing happen. The probe keeps the `FLOOR`
env with that warning attached so the repro is one command away.

`light-distribution.mjs`'s printed targets are corrected accordingly: **floor is not a target**, for
the same reason wall is not.


## The HUD was in every frame: retractions, a repaired instrument, and a re-calibration (v0.31.5.182)

Three measurement regions in this thread have now turned out to be contaminated (`.175`'s grille,
`.178`'s wrong-tier baseline, `.181`'s floor band). Checking the last one properly turned up the
common cause: **every measurement in this arc was taken from a PAGE screenshot, which includes the
bright toolbar and minimap.**

**Retraction 1 — the floor band was furniture.** Cropping it and looking: the probe's "floor" was the
TV console, the coffee table, an ottoman and the sofa, with a sliver of floor between them. So
`.179`/`.180`'s headline — *"the app puts both horizontal surfaces below the frame average"* — is
**withdrawn**. Measured from a pitched-down frame where the band really is floor, the default look
reads **ceiling 1.13, floor 1.11**: both *above* the frame average, the same sign as the photographs
(1.17–1.28 / 1.23–1.30), just less pronounced.

**Retraction 2 — the floor-finish bug from `.181` is withdrawn too.** "Changing the floor finish
changes nothing" was measured against a band containing almost no floor. With the wall finish also
changed, the band moved as expected. There is no evidence of a bug; I should not have reported one.

**The instrument is repaired.** `light-distribution.mjs` now captures the **canvas element**, not the
page, so no DOM overlay can enter a band and no HUD rectangles have to be guessed at; and the floor is
read from a second, pitched-down capture normalised by its own mean.

**And that forced a re-calibration, which is the real result.** The HUD lifted the frame mean and
compressed `%<64`, so every tier had been tuned too dark. At the shipped values, on clean frames:

| tier | old value | clean `%<64` | swept | **new value** | verified |
| --- | --- | --- | --- | --- | --- |
| maximum | 0.80 | **12.91 %** | 0.85 → 12.23 % | **0.89** | **11.79 %** |
| medium | 0.62 | **13.39 %** | 0.675 → 11.98 %, 0.70 → 11.52 % | **0.70** | **11.51 %** |
| performance | 0.60 | **8.41 %** | 0.45 → 9.73 %, 0.32 → 12.89 % | **0.37** | **11.94 %** |

All three now land inside the photographic 11.2–12.2 % band, measured on frames with nothing in them
but the render.

**Retraction 3 — `.168` said performance could not reach the band.** That came from HUD-contaminated
readings which made the tier look nearly flat in the fill scale (3.25 → 4.71 % across the whole
sweep). On clean frames it moves **8.41 → 12.89 %**, and 0.37 puts it in the band like the others.

With the clean instrument the remaining gap is also smaller and better located than this arc had it:
ceiling **0.95–1.02** and floor **1.07–1.13** against photographs at 1.17–1.28 and 1.23–1.30 — still
short, still consistent with no bounce term, but nothing like the 0.66–0.85 the contaminated bands
reported.


## Re-testing the bounce hypothesis on clean data (v0.31.5.183)

`.179` refuted the hemisphere ground-bounce fix — but it did so on the contaminated frames `.182`
threw out, so the refutation was worth nothing. Re-run with the repaired instrument, and this time as
a **two-parameter** fit, since the fill scale is now a knob I control and can use to buy the shadow
depth back.

| ground bounce | fill scale | `%<64` | ceiling | floor |
| --- | --- | --- | --- | --- |
| ×1.0 | 0.70 (shipped) | **11.51 %** | 0.99 | **1.07** |
| ×2.5 | 0.70 | 9.49 % | 1.07 | 1.05 |
| ×4.5 | 0.70 | 8.34 % | 1.12 | 1.02 |
| ×2.5 | 0.55 | **12.02 %** | 1.06 | 1.05 |
| **×4.5** | **0.52** | **11.05 %** | **1.12** | 1.03 |
| photographs | | 11.2–12.2 % | 1.17–1.28 | 1.23–1.30 |

**With both knobs the ceiling really can be moved while the shadow depth holds** — 0.99 → **1.12**,
closing about half its gap at `%<64` 11.05 %. `.179`'s conclusion that this is impossible was an
artifact of the bad measurement.

**It still should not ship, for a better reason than the old one.** Two things:

- **It shuffles the error rather than removing it.** The floor moves the wrong way, 1.07 → 1.03,
  because lifting every downward-facing surface raises the frame mean the ratios are taken against.
  Summed absolute error against the photographs goes 0.34 → 0.25 — an improvement, but by moving a
  third of the ceiling's deficit onto the floor.
- **And it looks wrong where it matters.** At ×4.5 the undersides of the TV console and the coffee
  table are visibly lighter than a piece of furniture sitting on a floor in shadow should be. That is
  the mechanism showing through: a hemisphere lights every downward face equally, so "more bounce onto
  the ceiling" is inseparable from "more light under the sofa".

So the ground term is refused again, now on evidence: it buys a real ceiling gain and pays for it with
glowing furniture undersides and a second tuned constant. **The ceiling/floor deficit still wants a
directional, local bounce** — a probe grid, a baked pass, or SSGI — and nothing cheaper reproduces it.


## The amplitude cap moved once the lattice was gone (v0.31.5.184)

`.172` capped `PHOTO_WEAVE` at drapery 2.2 / upholstery 2.0: more relief kept raising the metric —
curtain 0.0887 → 0.1370 at 4.5, almost into the photographic range — but turned the fabric into a
**regular horizontal-dash lattice**, "a grid that looks like mesh screen". The cap was about
*regularity*, not amplitude.

`.173` removed the regularity (`threadGain` varies every thread's thickness and brightness and drops
the occasional pick). So the cap should have moved, and it has. Re-swept, and judged on the 4× crop
the way `.172` said it had to be:

| drapery / upholstery | curtain | sofa | 4× crop |
| --- | --- | --- | --- |
| 2.2 / 2.0 (was shipped) | 0.0866 | 0.0937 | irregular, soft |
| **3.2 / 2.8** | **0.1055** | **0.1068** | **irregular, clearly woven** |
| 4.5 / 3.6 | 0.1223 | 0.1176 | irregular, but coarse basket-weave |
| photographs | 0.140–0.187 | 0.174 | |

At 1:1 rather than 4×, 4.5 / 3.6 reads as raffia on a sofa that is meant to be cotton — most obviously
on the accent bolster. 3.2 / 2.8 reads as textile. **Shipped at 3.2 / 3.6 / 2.8**, which is the same
judgement `.172` made, on a surface that can now carry it.

**The default look is unaffected** — `PHOTO_WEAVE` only applies under the photographic look; the
default curtain measures 0.0248, exactly its long-standing baseline.

*(Also re-measured after `.182`'s re-calibration, since the relief values were chosen under the old,
too-dark fill: at the shipped 2.2 / 2.0 the photographic look now reads curtain 0.0866 / sofa 0.0937,
up from `.164`'s 0.0719 / 0.0818 — a mix of `.173`'s irregular weave, `.178`'s warmed probe and the
re-calibration itself. The comparison is not clean enough to attribute, and is quoted only as the
current state.)*


## `.182` was wrong about how to exclude the HUD (v0.31.5.185)

`.182` fixed a real problem — the bright toolbar and minimap were in every frame-level measurement —
with a wrong mechanism: it switched to a Puppeteer **element** screenshot of the canvas, on the belief
that this excludes overlaying DOM. **It does not.** An element screenshot clips the *composited page*
to the element's box; anything drawn on top comes with it. Verified by sampling the same three pixels
in both captures:

| | toolbar | Measure button | minimap |
| --- | --- | --- | --- |
| page screenshot | (234, 231, 227) | (226, 224, 220) | (246, 241, 235) |
| "canvas-only" screenshot | (235, 232, 227) | (227, 224, 220) | (246, 241, 235) |

Identical. The HUD was never removed.

**Hiding the DOM instead does not work either** — the canvas is not a direct child of the app root, so
a rule broad enough to hide the overlay hides the canvas's own wrapper: the frame came back a flat
(234, 219, 209) with `%<64` 0.00 % and every band ratio exactly 1.00. **Excluding the HUD rectangles is
what actually works**, which is what `.180` did and `.182` removed. Restored, now with the Measure
button included (it sat in the ceiling band and `.180` had missed it).

**So the calibration was re-fitted a third time, on frames the HUD is genuinely out of.** At `.182`'s
values the tiers read **12.61 / 12.52 / 12.89 %** — a little dark. Nudged:

| tier | `.182` | **now** | `%<64` |
| --- | --- | --- | --- |
| maximum | 0.89 | **0.92** | **12.28 %** |
| medium | 0.70 | **0.735** | **11.88 %** |
| performance | 0.37 | **0.40** | **12.31 %** |

**And the ceiling deficit is bigger than `.182` reported**, because the toolbar was sitting in the
ceiling band and inflating it: **0.81–0.92**, not 0.95–1.02, against photographs at 1.17–1.28. The
floor reads 1.13–1.18 against 1.23–1.30.

**Stopping here.** This is the third calibration pass against a band derived from two photographs;
±0.15 of a percentage point is inside what that target can justify, and further re-fitting would be
false precision rather than accuracy.


## The "photographic band" was two photographs (v0.31.5.186)

Everything from `.163` to `.185` was calibrated against a deep-shadow band of **11.2–12.2 %**, taken
from `.134`'s two reference images. `.185` ended by noting that a two-sample target cannot justify
±0.15 of a point. The right response was not to stop re-fitting — it was to **get more references**,
which is what this round does.

Two more interior photographs fetched and measured (kept in `/tmp` for measurement only, never
committed). Whole-frame, no region choices to get wrong:

| image | mean | `%<64` | `%<24` |
| --- | --- | --- | --- |
| photo A — dark leather, tiled floor | 140 | **11.23 %** | 1.79 % |
| photo B — small European room | 162 | **12.17 %** | 0.98 % |
| **photo C — modern white interior, daylit** | 157 | **1.90 %** | 0.29 % |
| **photo D — lived-in flat, parquet, sheer curtains** | 165 | **4.65 %** | 0.80 % |

**Across four photographs `%<64` runs 1.90 % to 12.17 % — a six-fold spread.** It is not a property of
photography at all; it is a property of how dark a particular room's furnishings are. Photo A is brown
leather on every seat; photo C is a white sofa in a white room. The "11.2–12.2 % band" this arc has
been fitting to is simply **the darkest two of the four**.

**Which reframes the whole photographic look.** It does not make the app photographic — it makes it
match a **dark-furnished** interior. And the shipped default, at `%<64` ≈ 1.2 %, sits right beside the
lightest photograph (1.90 %), which is the closer analogue for the app's own default flat: white
walls, pale sofa, light vinyl. **The two looks bracket the photographic range; neither is "the"
correct one.** That is a better description of what was built than "calibrated to photographs", and
the constant's docblock now says so.

**A methodological trap worth recording.** A third candidate reference, sourced the same way, turned
out to be a **CG render** rather than a photograph — recognisable from the sculpture, the too-perfect
blinds and the render-style light. It measures `%<64` **31.06 %**, darker than any of the four
photographs. Calibrating a renderer against another renderer would have been circular, and worse,
would have pulled the target much further into the dark. Any future reference has to be eyeballed for
this before it is measured.

---

## `.187` — the fabric target was two crops, and micro/mean has no single photographic value

`.186` found the deep-shadow band came from the darkest two of four photographs. The same two images
also supplied the *other* long-running target: surface micro-contrast **0.140–0.187** (drapery) and
**0.174** (upholstery), which has anchored every fabric round since `.157`. It had never been
re-derived. With four references in hand it can be, and the honest answer is that the target does not
survive contact with them.

### Measured as distributions, not crops

Each fabric region tiled (60 px for upholstery, 40 px for drapery) and every tile measured
independently, so the spread is visible rather than averaged away.

| region | tiles | mean | micro-sd | ratio p25 / p50 / p75 |
|---|---|---|---|---|
| photo C pale sectional | 50 | 146 | 12.37 | 0.048 / **0.089** / 0.116 |
| photo D pale sofa | 20 | 166 | 7.20 | 0.019 / **0.024** / 0.029 |
| photo A dark leather *(the old 0.174)* | 28 | 88 | 14.38 | 0.112 / **0.126** / 0.214 |
| app sofa, default look | 50 | 147 | 9.35 | 0.041 / **0.061** / 0.094 |
| app sofa, photographic look | 50 | 96 | 10.61 | 0.073 / **0.122** / 0.154 |

| drapery | tiles | mean | micro-sd | ratio min / p50 / max |
|---|---|---|---|---|
| photo A cream curtain (backlit) | 24 | 182 | 18.59 | 0.009 / **0.066** / 0.275 |
| photo C cream drape (side-lit) | 10 | 136 | 21.75 | 0.089 / **0.163** / 0.195 |
| photo D sheer (backlit) | 78 | 236 | 3.47 | 0.001 / **0.008** / 0.097 |

### What that says

**There is no photographic value for micro/mean.** Across four real interiors upholstery spans
**0.025–0.214** and drapery **0.001–0.275**. The statistic is set by lighting geometry and exposure at
least as much as by weave: the same reference set holds a backlit sheer at a median of 0.008 and a
side-lit drape at 0.163. A near-featureless pale sofa (photo D, micro-sd 4.20 over a clean crop) is not
a rendering failure — it is what pale upholstery looks like lit flat and exposed bright.

**The gap being chased was inside one photograph's own spread.** Photo C's sectional ranges 0.048–0.116
p25–p75 *within a single sofa*. That is wider than the entire distance from the app's shipped 0.047 to
the photographic look's 0.096 that `.160`–`.184` worked to cover.

**Both app looks are already inside the range.** Sofa 0.047–0.107 against 0.025–0.214; curtain
0.036–0.137 against 0.001–0.275. On the numbers this axis is closed, exactly as `.186` closed shadow
depth. The two looks bracket the photographic range on relief for the same reason they bracket it on
shadow: photographs do not agree with each other.

`r(sd, mean)` per region flips sign — negative in photos C and D and in both app looks, positive in
photo A — so micro-sd is not a simple function of brightness that could be divided out. The ratio is
not repairable by normalising differently; it is a per-crop number being read as a per-material one.

### What does not change

The shipped relief work stands. `.173`'s irregular `threadGain` and `.184`'s 3.2 / 2.8 sweep were
judged on the 4× crop — "clearly woven and still irregular" versus "coarse basket-weave" — and that
judgement was visual, not numeric. The retraction removes the *justification for pushing further*, not
the changes already made. `PHOTO_WEAVE` stays where `.184` put it, and the docblock now says so.

The lesson repeats `.186`'s: a target read off one or two crops is a point sampled from a wide
distribution, and re-fitting to it looks like convergence right up until the distribution is measured.

---

## `.188` — the ceiling target survives, the floor target does not, and the deficit belongs to one look

`.186` retracted the shadow band and `.187` the fabric target, both for the same reason: they were
point estimates from two photographs. The region-ratio targets in `light-distribution.mjs` have
identical provenance — its header names "photograph 1" and "photograph 2" — so they get the same
treatment. This time the answer is not uniform, which is what makes it useful.

Regions were picked off a coordinate grid overlaid on each photograph and every crop eyeballed before
it was measured. Three of the first six were wrong on the first pass — a "wall" that caught a clock and
a cove light, a "floor" that was an armchair's patterned upholstery. That is the `.181` failure mode
and it is only caught by looking.

| region mean ÷ frame mean | ceiling | wall | floor |
|---|---|---|---|
| photograph 1 | 1.28 | 1.43 | 1.23 |
| photograph 2 | 1.17 | 0.53 | 1.30 |
| photograph 3 (modern white) | **1.08** | 1.20 | 1.18 |
| photograph 4 (lived-in flat) | 1.14 | 1.14 | **0.87** |
| app, default look | **1.12** | 1.14 | 1.13 |
| app, photographic look | **0.87** | 1.11 | 1.13 |

### The floor target dissolves

"Both photographs put the floor above the frame average" was true of two pale-stone rooms. Photograph 4
has dark parquet and puts its floor at **0.87**, below frame mean. Across four the floor spans
0.87–1.30, which is not a band, it is the range of floor albedos. `.181` already demoted floor to a
non-target on albedo grounds; this confirms it from the reference side rather than the app side.
Walls span 0.53–1.43 and were never usable.

### The ceiling target survives — and the app already moved

Ceiling is the one ratio the four photographs agree on: **1.08–1.28**, every one of them above frame
mean. It is also the only ratio where the app was ever clearly outside.

But the app is not where the probe header said. That header recorded 0.75–0.92, measured back at
`.179`; the fill-scale and environment-intensity work since has moved the **default look to 1.12**,
inside the photographic band. The stale number would have justified another round of work on a gap that
had already closed. Both figures in the header are now corrected against the current tree.

### What is actually left, stated precisely

The deficit is not the app's. It belongs to **one look**:

| | `%<64` | ceiling |
|---|---|---|
| photographs (four) | 1.9–12.2 % | 1.08–1.28 |
| app, default look | 1.32 % | **1.12** ✓ |
| app, photographic look | 11.86 % | **0.87** ✗ |

Each look matches the references on one axis and misses on the other, and the two failures have a
single cause. The photographic look buys its shadow depth by turning the fill down; the ceiling is lit
almost entirely *by* that fill, because nothing relights it from the floor. So fill is simultaneously
the only lever holding the ceiling up and the only lever pushing the shadows down, and no setting of it
can satisfy both.

That is the sharpest statement of the remaining gap in this whole arc, and the first one that names a
mechanism rather than a number. A real directional GI term — floor catching the window and bouncing it
back up — is exactly the term that would decouple them, letting one look hold 11 % deep shadow *and* a
ceiling above frame mean. `light-distribution.mjs` run at `PHOTO=0` and `PHOTO=1` is the measurement
that would show it working: success is the photographic look's ceiling rising to ≈1.1 without its
`%<64` collapsing back toward 1 %.

Three axes have now been checked against four references. Two dissolved. This one did not.

---

## `.189` — the bounce card, refuted twice by the renderer (REVERTED)

`.188` named the mechanism behind the last surviving gap: under the photographic look the ceiling
sits at 0.87 against a four-photograph band of 1.08–1.28, because that look buys its shadow depth by
turning the flat fill down and the ceiling is lit almost entirely by that fill. The fix that follows
is a **bounce card** — the standard device in professional interior rendering — an emitter laid in
the window's floor pool, facing up, standing in for the light the floor throws back. Unlike the
hemisphere `.183` refused twice, it is positioned and directional, so it cannot light the underside
of the coffee table on the far side of the room.

The geometry was built and unit-tested (one card per window, attributed to the room the window lights
by the same inward probe `daylitRooms.ts` uses, pool pushed half a depth in, widened 1.25×). **The
renderer refused both emitters that could carry it, for two different reasons, and the whole thing is
reverted.** The tree is back at the `.188` baseline, re-measured to confirm: mean 110.4, `%<64`
11.86 %, ceiling 0.87.

### Attempt 1 — `RectAreaLight`: structurally cannot light the ceiling

The physically right emitter, and inert. At a deliberately absurd 25× gain it moved the walls
(1.11 → 1.25) and the frame mean (110.4 → 117.7) while the ceiling went **down** to 0.85 — it lit
every physical material in the room and could not touch the one surface it existed for, so the
ceiling *ratio* fell as the mean it is taken against rose.

The cause is in three's source, not in any tuning. `RE_Direct_RectArea` is defined **only** in
`lights_physical_pars_fragment`; `lights_lambert_pars_fragment` and `lights_phong_pars_fragment`
contain no reference to it at all, and `lights_fragment_begin` guards every rect-area contribution
behind `#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )`. The app's ceiling is a
`meshLambertMaterial` — deliberately, as `src/scene/CLAUDE.md` records, because it is a large matte
surface and Lambert is free. So the ceiling compiles the rect-area path out entirely.

**A rect-area light can never light this ceiling.** Making it possible means giving the ceiling a
standard material, i.e. paying GGX on the largest surface in the frame to gain one lighting feature.
That is a real option and it is a cost decision, not a bug fix.

### Attempt 2 — `SpotLight`: dropped entirely, cause unknown

A spot is evaluated by every lighting model, so it should reach a Lambert ceiling. It does nothing.
Swept gain 6 / 20 / 60 with the frame **identical to within noise** at every step (mean 110.4, `%<64`
11.86 / 11.88 / 11.87), then with `decay={0} distance={0}` — an unbounded intensity-20 light in a
small room, which should blow the frame out. Still 110.4. Removing the custom target changed nothing.

**It is mounted and it is correct.** `bounce-census.mjs` (added this round) walks the live scene and
reports both cards present: `kind: spot`, intensity 20, angle 1.15, aimed from (2.75, 0.03, 5.98) at
(2.75, 3, 5.98) — straight up — `visible: true`, target in the scene graph.

**And the plumbing around it works, proven by a control.** Swapping the same component to a
`pointLight` at the same position, same intensity, changed the frame decisively: mean 110.4 →
**195.5**, ceiling 0.87 → **1.09**, `%<64` 11.86 → 2.07 %. Flags, look gating, card placement,
per-frame intensity — all fine. Whatever suppresses the spot is specific to spot lights in this
scene, and it is **not diagnosed**. Recording it unsolved is the honest state; it is the first thing
to resolve if this is picked up.

### The one lead that is not dead

That control is more than a control. A point light in the floor pool **moved the ceiling into the
photographic band** (1.09 against 1.08–1.28) — the first thing in this arc that has. It did so at an
absurd unbounded setting that also destroyed the shadow calibration (`%<64` 2.07 %), so it proves
nothing about whether a *tuned* version can hold both. But it is a **positioned** light, which is the
property the hemisphere lacked and the whole reason `.183` refused that: it falls off with distance,
so it cannot light the far side of the room the way a hemisphere does.

The next round's question is therefore concrete and cheap: with real `decay` and a clamped
`distance`, is there a gain where the floor-pool point light holds ceiling ≥ 1.08 **and** `%<64`
above 11 %? Two knobs, one measurement, and `light-distribution.mjs` at `PHOTO=0`/`PHOTO=1` already
reports both. Its failure mode is known in advance and must be looked at, not just measured: a point
light is omnidirectional, so it will light furniture undersides near the window — the hemisphere's
defect, bounded by distance instead of unbounded.

**Nothing shipped.** A term that cannot light the surface it was built for is not a partial win.

---

## `.190` — the floor-pool lead is refuted on physics, and `.189`'s spot null was two different things

`.189` ended with one live lead: a point light in the window's floor pool put the ceiling at **1.09**,
inside the photographic band, where nothing else in this arc had reached it. This round tested whether
a *tuned* version could hold that while keeping the shadow depth. It cannot, and the reason is
geometric rather than a tuning failure.

### What `.189`'s 1.09 actually was

It came at `decay=0, distance=0` — an unbounded intensity-20 light in a small room. Read the whole row
rather than the one number: frame mean 110.4 → **195.5**, wall 1.11 → **1.29**, `%<64` 11.86 → 2.07 %.
The ceiling ratio rose because the entire room flooded, not because the ceiling was preferentially
lit. That is the same shape of error `.186`–`.188` kept finding in the reference data, appearing this
time in my own measurement: **a ratio moved for the wrong reason still moves.**

### The clamp series, which explains the "inert" readings

With real falloff the term reads as inert, and `.189` would have called that a second broken emitter.
It is not — it is the term being local, measured across a room:

| clamp | frame mean | `%<64` | ceiling | wall |
| --- | --- | --- | --- | --- |
| baseline (no term) | 110.4 | 11.86 % | 0.87 | 1.11 |
| `distance` 5 | 110.4 | 11.87 % | 0.87 | 1.11 |
| `distance` 8 | 111.5 | 11.28 % | 0.88 | 1.10 |
| `distance` 12 | 117.7 | 9.32 % | 0.90 | 1.18 |
| `distance` 0 (unbounded) | 123.0 | 8.49 % | 0.91 | 1.26 |

Monotonic in the clamp, which is what a working local term looks like. The probe stands **4.6 m back
from the window** and its ceiling band is mostly the ceiling *across the room*, so a 5 m clamp
excludes almost everything it measures. Censused before concluding (`bounce-census.mjs`, extended to
point lights this round): both emitters mounted, intensity 20, `distance` 5, visible — and the app's
own fixture lights sit alongside them at `distance` 6.5, so a clamp plainly does not break a light
here. **The null was the measurement, not the mechanism.**

### Why no floor-pool emitter can fix this ratio

Even unbounded, the ceiling gains **+0.04** while the walls gain **+0.15** and the shadow calibration
loses 3.4 points. That is not a gain that wants tuning; it is the wrong shape. An omnidirectional
emitter at floor level illuminates by 1/d², and the walls of a room are *nearer to the floor* than the
ceiling is. It will always light them more. Only a cosine emitter aimed up preferentially lights a
ceiling — and those are exactly the two `.189` could not use: `RectAreaLight` is compiled out by the
Lambert ceiling, and `SpotLight` contributes nothing for reasons still unknown.

**Re-tested this round and still unexplained:** the spot is inert at `decay=2, distance=0` too, so
`.189`'s spot null is NOT the clamp effect above. Two separate causes, and this one survives.

### The reframing this earns

A window-local term can never move a whole-room ceiling ratio, because a real ceiling is lit by bounce
from the **whole floor**, not from the window pool. That is precisely what a hemisphere models — and
it is why `.183`'s hemisphere *did* move the ceiling, 0.99 → 1.12, where a positioned card cannot.

`.183` refused it on a side effect: at ×4.5 the undersides of the TV console and coffee table read
brighter than furniture standing on a shadowed floor should. Worth noting against that, without
overturning it: undersides near a sunlit floor genuinely *are* lit in a real room, and the refusal was
made at a gain chosen to close the ceiling gap in one step, alongside a fill rebalance. Whether a
*smaller* whole-floor term is acceptable is a question `.183` did not ask, and it is now the only
approach left standing that both fits the physics and works in this renderer.

**Nothing shipped; reverted to the `.188` baseline.** Two candidate paths remain, and both are
concrete: diagnose why spot lights are inert here (which unlocks the directional emitter a Lambert
ceiling can receive), or re-open the hemisphere at a gain low enough to survive the underside test.

---

## `.191` — a number for `.183`'s underside objection, and an instrument that is only half built

`.190` left one approach standing: a whole-floor bounce term, which is what a hemisphere models and
what actually moved the ceiling (0.99 → 1.12 in `.183`) where a window-local card cannot. `.183`
refused it on a judgement made by eye — at ×4.5 "the undersides of the TV console and the coffee table
are visibly lighter than a piece of furniture sitting on a floor in shadow should be". That is the
right objection and the wrong kind of evidence: it cannot be re-checked at a smaller gain. Before
re-opening the term, the objection needs a number.

### The photographic target

Undersides themselves barely appear in an interior photograph — furniture sits close to the floor and
the underside is a dark gap. The measurable form of "sitting on a floor in shadow" is the **shadowed
floor beneath a piece against the lit floor beside it**, same material, so the ratio measures shadow
rather than albedo:

| reference | shadowed | lit | ratio |
| --- | --- | --- | --- |
| photo D, parquet | 103 | 143 | **0.725** |
| photo C, pale wood | 121 | 185 | **0.654** |
| photo C, pale wood (2) | 104 | 180 | **0.579** |

So real furniture sits over floor at roughly **0.58–0.73** of the open floor beside it. A term that
lifts the app above ~0.73 is `.183`'s defect, now falsifiable. (A fourth crop read 1.057 and was
discarded on inspection — it had missed the shadow entirely. Eyeball every crop; `.181` and this round
both paid for it.)

### The instrument, and what it cannot yet do

`scripts/dev-probes/underside-shadow.mjs` raycasts a screen grid, keeps only near-horizontal up-facing
hits at floor height (geometric mask, never a screen rectangle — `.181`), then casts a second ray
straight up from each to classify it as under furniture or open.

**The app's readings all land inside the photographic range**: 0.657 / 0.688 / 0.689 across three
poses, and 0.752 at a wider overhead test. **But they rest on 1–7 samples**, so nothing is settled.
Floor that is both under furniture *and* visible from standing eye height is rare — a sofa hides its
own under-floor. The classifier is the limit, not the pose.

The redesign that fixes it: classify floor samples by horizontal distance to the nearest furniture
footprint rather than by an upward ray, and compare the near band to the far band. That is also a
closer match to what the photograph crops actually measured — shadowed floor *beside and beneath*
furniture, not strictly under it.

### Two instrument traps, both of which produced confident wrong answers first

- **A direct `camera.lookAt` is stomped by `FirstPersonCamera`**, which rewrites the camera's
  orientation every frame from its own yaw/pitch state. `DIR=in` and `DIR=out` came back
  **byte-identical** (333/7 samples, 0.689 both) — a mechanism silently not firing, reading exactly
  like a real result. Pose now goes through the app's own `requestWalkTeleport` + `__walkLook`, the
  way `light-distribution.mjs` already did, and the two directions then differ.
- **The overhead ray hits the CEILING like anything else.** At `OCCLUDE=4.0` every floor sample in
  the room classified as "under furniture" (332 under / 0 open) and the ratio would have silently
  become 1. The clamp must stay below ceiling height; the probe now warns when it does not.

A third failure was pure flakiness: under machine load the sampling pass returned an empty set, which
reads as "this pose sees no floor". Four runs were lost to it before the pattern was clear. The pass
now retries until it finds floor, and the retry reproduced the original numbers exactly.

**Nothing was changed in `src/`.** This round bought a target, an instrument, and three traps; the
hemisphere sweep it was built for is the next round's work, and it now has a pass/fail criterion
rather than a judgement call.

---

## `.192` — the underside criterion, measured: the DEFAULT look is the one that fails it

`.191` built the underside instrument and left it half working: the ray classifier had the right sign
and magnitude but only 1–7 samples per pose, because floor that is both under a piece and visible from
standing eye height is rare. Two fixes were tried. One is refuted; the other works.

### Distance-to-footprint is refuted — it measures the window, not the furniture

The proposed fix in `.191` was to classify floor by horizontal distance to the nearest furniture
footprint instead of by an upward ray. It solves the sample problem completely — resolving defs
through the app's own `buildWalkBlockers` gives 40 footprints and 332 classified samples in a single
pose — and it measures the wrong thing:

| band | mean |
| --- | --- |
| "shaded", ≤ 0.15 m from a footprint | 140.9 |
| "open", ≥ 0.5 m from a footprint | 74.4 |
| **ratio** | **1.894** |

The shaded band is nearly **twice as bright** as the open one. In a window-facing pose the floor near
furniture is the sunlit strip by the glass, while floor far from furniture is deeper into the room, so
distance-to-footprint correlates with distance from the **window**, not with furniture shading. The
distance distribution also shows how cramped the sampled floor is: min 0.00, p50 0.21, **max 0.77 m** —
there is no genuinely open floor in view to compare against. Recorded in the probe header so it is not
re-proposed.

Two guards earned their place on the way: a `getDef` that resolved to nothing reported **0 footprints**
rather than a plausible ratio, and the probe now says so out loud.

### Pooling the ray classifier across poses does work

Eight poses (four standoffs × two look directions), samples pooled. Four poses see no floor at all —
the camera is inside a wall or facing one — and that is visible in the per-pose table rather than
silently averaged away.

| | pooled under / open | under | open | **under/open** |
| --- | --- | --- | --- | --- |
| photographic look | 11 / 975 | 58.9 | 89.3 | **0.660** |
| default look | 11 / 975 | 109.8 | 130.0 | **0.845** |
| reference photographs | | | | **0.579–0.725** |

The under-count is still small, and the guard says so. What carries the reading is that it has now been
taken **five times** across different poses, classifiers and settings — 0.657, 0.660, 0.688, 0.689 —
and never moved more than ±0.02.

### The result, which was not the expected one

**The default look fails `.183`'s own criterion, at 0.845 against a photographic ceiling of ~0.73.** Its
flat ambient fill lights the floor under the furniture too brightly — which is precisely the defect
`.183` refused the hemisphere for causing. The photographic look, which removes that fill, sits at
**0.660**, comfortably inside the photographic range.

That is the same shape as every other finding in this arc: the photographic look wins on every
shadow-shaped metric and loses on the ceiling ratio, and the default look does the reverse.

It also gives the next round a **quantified budget** instead of a judgement call. A whole-floor bounce
term added to the photographic look may raise this from 0.660 to at most ~0.73 before it commits
`.183`'s defect. That is the headroom, and `underside-shadow.mjs` is the pass/fail test.

**Nothing changed in `src/`.**

---

## `.193` — the hemisphere reaches the ceiling band, and `.191`/`.192`'s underside numbers are RETRACTED

Two results, and they have to be read separately because they come from instruments of very different
standing.

### The ceiling sweep (trusted instrument, real result)

`light-distribution.mjs` is the validated one — it excludes the HUD rectangles and has been the
measuring stick since `.179`. Sweeping a whole-floor bounce (the hemisphere's `groundColor`, scaled
under the photographic look only):

| ground bounce | frame mean | `%<64` | ceiling | wall | floor |
| --- | --- | --- | --- | --- | --- |
| ×1 (shipped) | 110.4 | 11.88 % | 0.87 | 1.11 | 1.13 |
| ×2 | 114.8 | 10.27 % | 0.94 | 1.11 | 1.11 |
| ×3.5 | 120.2 | 9.22 % | 1.01 | 1.12 | 1.09 |
| ×5 | 124.9 | 8.25 % | 1.05 | 1.12 | 1.07 |
| **×6.5** | 128.9 | **7.20 %** | **1.08** | 1.13 | 1.05 |
| photographs | | 1.9–12.2 % | 1.08–1.28 | 0.53–1.43 | 0.87–1.30 |

**At ×6.5 the photographic look's ceiling reaches the bottom of the photographic band** — the first
time anything in this arc has got there — and it does so **without inflating the walls** (1.11 → 1.13
across the whole sweep). That is the property `.190` showed a positioned point light could never have,
where the walls rose +0.15 for the ceiling's +0.04. Shape confirmed: the deficit is a whole-floor
phenomenon and a whole-floor term is what moves it. `%<64` falls 11.88 → 7.20 %, which is a real loss
of shadow depth but stays inside the four-photograph range `.186` established.

### The underside numbers are retracted

`.192` reported that the default look *fails* `.183`'s underside criterion at 0.845 while the
photographic look passes at 0.660. **Both figures are invalid, and so is every underside number in
`.191` and `.192`.**

`underside-shadow.mjs` never suppressed the onboarding modal. It renders over the canvas with a
**blurred, dimmed backdrop**, so every pixel the probe read was the scene seen through that scrim, not
the scene. `light-distribution.mjs` has always set `hdb_onboarded` in an `evaluateOnNewDocument` before
the first navigation; this probe simply did not, and I did not look at a frame until this round.

That also explains the one thing that had looked like evidence. `.192` argued the readings were
trustworthy because five measurements across different poses and classifiers agreed to ±0.02. They
agreed because they were all dominated by the same uniform overlay. **Consistency across arms is not
validation when every arm shares an unexamined common factor** — the arms have to be able to disagree.

Looking at a frame immediately surfaced two further defects in the same probe:

- **No HUD exclusion.** `.185` established that a puppeteer element screenshot does not exclude
  overlaying DOM, and `light-distribution.mjs` masks the toolbar, measure bar and minimap for exactly
  this reason. This probe masks nothing, so any floor sample under the walk-mode hint bar, the "Turn
  off ceiling light" pill or the minimap read the HUD's pixels.
- **It was measuring the wrong room.** The pose derives from "the first window opening in the plan",
  which is the **main bedroom** — a strip of floor beside a bed — not the living/dining room every
  other measurement in this arc uses.

The onboarding fix is committed. The other two are not, and until they are there is no valid underside
measurement at all.

### Consequence for the bounce term

**Not shipped, and it must not be until the constraint is real.** `.192`'s whole contribution was to
turn `.183`'s eyeball objection into a pass/fail test; with that test retracted, ×6.5 has a confirmed
benefit and an *unmeasured* cost. Shipping on the benefit alone would be exactly the "unverified fix"
this arc keeps refusing.

The ceiling result stands on its own and is the most encouraging thing here in ten rounds. The order of
work is now: repair the probe (HUD rectangles, living-room pose), re-derive the underside baseline for
both looks, and only then decide on ×6.5 — including whether to buy the lost shadow depth back with the
fill scale, as `.183`'s two-parameter fit did.

---

## `.194` — the repaired probe, a real baseline, and a proxy that is structurally blind

`.193` retracted `.191`/`.192`'s underside numbers and listed three probe defects. All three are now
fixed: onboarding suppressed (last round), HUD rectangles cut out, and the pose derived from the
**living/dining** window rather than "the first window in the plan", which had been the main bedroom.
Sample count went from 11 pooled under-samples to **115**, and the too-few-samples guard no longer
fires — the living room has furniture with clearance where the bedroom had a bed on the floor.

### The real baseline, which is worse than the retracted one claimed

| | under | open | under/open |
| --- | --- | --- | --- |
| photographic look | 95.3 | 121.2 | **0.786** |
| default look | 141.8 | 163.8 | **0.865** |
| reference photographs | | | **0.579–0.725** |

**Both looks sit above the photographic band.** The retracted `.192` figures had the photographic look
comfortably inside it at 0.660; measured properly it is at 0.786, outside. So the floor under the
app's furniture is too bright in *both* looks — a real deficiency, and one that exists independently of
the bounce question. The default look is worse, which is the one part of `.192`'s story that survives.

### The proxy cannot test the thing it was built to test

Measured at ground bounce ×1, ×3.5 and ×6.5, the ratio is **0.786 every time**, identical to three
decimals, while `light-distribution.mjs` shows the same sweep moving the ceiling 0.87 → 1.08 and the
frame mean 110.4 → 128.9. That is not a weak effect; it is no effect, and the cause is in three's
shader rather than in the probe:

```glsl
float dotNL = dot( normal, hemiLight.direction );
float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
```

A floor faces **up**, so `dotNL = 1`, the weight is 1, and the irradiance is pure `skyColor` —
`groundColor` contributes **nothing to the floor at all**. It contributes fully only to surfaces facing
**down**: ceilings, and the undersides of furniture.

So `.192`'s "quantified budget — the bounce may raise the underside ratio from 0.660 to at most 0.73"
was wrong in principle as well as in its numbers. This term cannot move that ratio in either direction.
The floor-shadow proxy was adopted in `.191` because undersides are barely visible in a photograph, and
that substitution quietly made the metric blind to the exact defect it existed to detect.

### What actually has to be measured

`.183`'s objection was about **downward-facing faces** — "the undersides of the TV console and the
coffee table" — which is precisely the population `groundColor` lights. The app can mask those
geometrically (`normal.y < −0.9`, above floor height), the same way `wall-cap.mjs` masks up-facing wall
caps. The open problem is the reference: a photograph shows very little underside, so the target has to
be built differently — most plausibly as underside ÷ frame mean, or underside ÷ the piece's own lit
top, measured on the few photographs where a console or table underside is genuinely visible.

**Nothing shipped, and the bounce is still undecided.** Its benefit is confirmed and unchanged (ceiling
0.87 → 1.08 with walls flat); its cost remains unmeasured, and this round establishes that it was never
going to be measured by the metric built for it.

---

## `.195` — SHIPPED: the whole-floor bounce, on a visual check because the objection is unmeasurable

Eight rounds after `.188` named the mechanism, the ceiling deficit is closed. `PHOTO_GROUND_BOUNCE`
scales the hemisphere's `groundColor` by 6.5 under the photographic look only.

| | `%<64` | ceiling | wall | floor |
| --- | --- | --- | --- | --- |
| photographic, 13:00 | 7.18 % | **1.08** | 1.13 | 1.05 |
| photographic, 19:00 | 2.19 % | **1.17** | 1.20 | 1.14 |
| default, 13:00 (unchanged) | 1.32 % | 1.12 | 1.14 | 1.13 |
| photographs | 1.9–12.2 % | 1.08–1.28 | 0.53–1.43 | 0.87–1.30 |

Every ratio is inside the four-photograph range at both hours, and the default look is byte-identical
to its pre-change baseline — the gate works.

### Why `.183`'s objection could not decide this

`.183` refused a ×4.5 ground term because furniture undersides looked too light, and `.191`–`.194`
tried to turn that into a metric. It cannot be done, for two independent reasons found this round:

- **A photograph does not show an underside.** Zoomed grid crops of both reference interiors show the
  *shadow* under a sofa and a coffee table, and at most a few pixels of the plane itself. There is no
  photographic target to calibrate against — unlike every other metric in this arc.
- **Neither does the app, from the walk camera.** Masking down-facing faces geometrically
  (`normal.y < −0.9`, shin-to-table height) over eight poses returns **zero** samples. A standing eye
  cannot see under a coffee table.

And the proxy that `.191` substituted is blind by construction, as `.194` established: `groundColor`
contributes nothing to an up-facing floor, so the floor-shadow ratio reads **0.786 identically** at
×1, ×3.5 and ×6.5. Four rounds of instrument work on a criterion that could not, even in principle,
answer the question.

So this shipped on the evidence that does exist: a validated ratio measurement for the benefit, and a
**visual A/B** for the cost. An amplified difference of the two frames shows the change reaching the
walls as well as the ceiling — which the ratio hid, since the frame mean rises 17 % and the walls rise
with it — and the side-by-side crop reads as a warmer, brighter room rather than a broken one.

### A shell trap that produced four identical wrong readings

The first verification run reported all four arms identical *and* equal to the default look. Cause:
**zsh does not word-split unquoted parameter expansions**, so `for a in "PHOTO=1 HOUR=13" …; do … $a` passed
one argument and `env` set `PHOTO="1 HOUR=13"` — false against `=== '1'`, with `HOUR` never set at
all. Every arm silently ran the default look at the default hour. `with-server.sh` uses `env "$@"` and
is order-independent; the loop was the bug. The repo already records a sibling of this
(`set -- $PAIR` in a zsh loop); this is the same tooth.

### Still open

The floor under the app's furniture measures **0.786** (photographic) and **0.865** (default) against
photographs at **0.579–0.725** — too bright in both looks. That is a real deficiency, independent of
this change, and `groundColor` provably cannot cause or cure it.

---

## `.196` — SHIPPED: AO is the only contact shadow an interior gets, and it was under-strength

`.194` left one measured deficiency that `.195`'s bounce provably could not touch: the floor under the
app's furniture reads **0.786** (photographic) and **0.865** (default) against reference photographs at
**0.579–0.725**. This closes it for the photographic look.

### Why it was bright: nothing else casts a shadow there

Pricing AO against the metric answers it immediately. With `ao: false` the ratio is **0.983** — floor
under a sofa is indistinguishable from open floor. This file already records that interiors are
effectively fill-only (INTERIOR-SHADOW: the sun reaches almost nothing indoors, and the fill is
non-directional), so screen-space AO is carrying the entire contact cue by itself, and at
`radius 0.7 / intensity 3.0` it was not carrying enough.

### The sweep, against both bands

| radius / falloff / intensity | under/open | `%<64` (photo look) |
| --- | --- | --- |
| 0.7 / 1.2 / 3.0 (was) | 0.786 | 7.18 % |
| 0.7 / 1.2 / 6.0 | 0.721 | — |
| **1.0 / 1.2 / 4.5 (shipped)** | **0.722** | **10.43 %** |
| 1.0 / 2.0 / 4.5 | 0.641 | 15.16 % ← too dark |
| photographs | 0.579–0.725 | 1.9–12.2 % |

Radius was preferred to intensity: a metre-scale radius reaches the same ratio as intensity 6.0 at a
third less intensity, and contact occlusion in a room genuinely is a metre-scale effect.
`distanceFalloff` 2.0 is the interesting near-miss — it centres the ratio at 0.641, but drives the
photographic look's deep-shadow fraction to 15.16 %, past the darkest of the four photographs. **The
shipped point is where both bands hold, not where the target ratio is centred.** Optimising one metric
until another leaves its range is the mistake this arc has spent ten rounds learning to avoid.

### Final state, every band checked

| | `%<64` | ceiling | wall | floor | under/open |
| --- | --- | --- | --- | --- | --- |
| photographic, 13:00 | 10.43 % | 1.08 | 1.21 | 1.15 | **0.722** |
| photographic, 19:00 | 3.49 % | 1.17 | 1.26 | 1.22 | — |
| default, 13:00 | 2.03 % | 1.12 | 1.20 | 1.20 | 0.820 |
| photographs | 1.9–12.2 % | 1.08–1.28 | 0.53–1.43 | 0.87–1.30 | 0.579–0.725 |

**The photographic look is now inside every measured photographic band at once** — the first time in
this arc. It also repaid what `.195` cost: `%<64` went 11.88 → 7.18 % with the ground bounce and back
to 10.43 % with this. And the **default** look entered the deep-shadow range for the first time
(1.32 → 2.03 %, against photographs starting at 1.9 %), having previously sat below the lightest one.

**Free.** N8AO's cost is sample-count driven and neither knob changes it: `frame-time.mjs` reads medium
p90 **8.3 ms** against the 8.4 ms already documented. Verified visually as well as numerically — the
A/B crop reads deeper and moodier with no halos or over-darkened corners.

### Still open

The default look's under-furniture floor is **0.820**, improved but still above the photographic 0.725.
Pushing AO further to reach it would take the photographic look past its deep-shadow band, so closing
that gap needs a different lever — most likely the default look's flat ambient fill itself, which is
what lights that floor.

### An edit trap the test suite caught

The sweep was driven with `sed -i '' "s/^  intensity: .*,$/  intensity: $i,/"`, which matches
`look.ts`'s **`BLOOM.intensity` as well as `AO.intensity`** — both are a two-space-indented
`intensity:` line. So every sweep run also set Bloom to 4.5–6.0 against its shipped 0.45, and
`look.test.ts`'s `expect(BLOOM.intensity).toBeLessThan(1)` is what caught it, not any measurement.

The sweep numbers survive, and the reason is worth stating rather than assumed: every run was at
`TIER=medium`, whose composer is AO-only (TIER-AO) and mounts no Bloom at all. Re-running the two key
measurements against the corrected file reproduces them exactly — under/open **0.722**, and
119.6 / 10.44 % / ceiling 1.08. **A sweep driven by a regex over source needs the regex anchored to
its block**, and the suite is the backstop that makes a stray match visible.

---

## `.197` — floor gloss has no target either, and two finishes were lying about their own colour

With the photographic look inside every band, this round went looking for the next axis and found a
different kind of defect on the way.

### Floor gloss is a property of the finish, not a target

A glossy floor mirroring the window is one of the strongest cues in a professional interior render, so
it looked like an axis. Measured on the references it is not one:

| floor | mean | sd/mean |
| --- | --- | --- |
| photo D parquet (glossy) | 143 | **0.156** |
| photo D parquet (2) | 150 | **0.218** |
| photo C pale wood (matte) | 185 | **0.037** |
| photo C pale wood (2) | 180 | **0.051** |

A 4× spread, driven entirely by finish. Same shape as `.187`'s retraction of the fabric target: there
is no single photographic value to hit, so the honest question is whether the app's floor *responds* to
its finish, not whether it matches a number. (The app's own open-floor sd/mean reads 0.288, but that
population spans the room and so includes the lighting gradient the small photo crops do not — the two
are not comparable, and the number is only useful for comparing app states to each other.)

### `.181`'s floor-finish "plumbing bug" is REFUTED

`light-distribution.mjs` still carries a note that `setFloorFinish` is accepted but the render does not
change — "the floor band stays rgb 156,138,118 for oak and marble alike". That was measured with the
screen-band method `.182` later threw out as contaminated. Re-measured against the geometrically-masked
open-floor population, the render responds plainly:

| floor finish | open-floor mean |
| --- | --- |
| default (vinyl oak) | 105.3 |
| marble | 103.3 |
| **white tiles** | **73.2** |
| parquet | 74.3 |
| concrete | 78.8 |
| carpet | 47.0 |

The plumbing works. `.181` compared oak against marble, which happen to sit 2 % apart, and read that
coincidence through a contaminated band as a dead lever.

### But "White tiles" is darker than oak, and that is a real defect

Look at the table again: the finish named **White tiles** renders at **73.2** against oak vinyl's
**105.3** — the "white" floor is the *darker* of the two. Its albedo texture means `#6e6155` and the
frame shows a fine brown/grey mosaic. Poly Haven's source asset is `square_tiles_03`; nothing about it
is white.

Scanning every finish for a colour word contradicted by its own swatch found the catalog has exactly
**two** such names, and **both were wrong**:

- `floor-tile-white` "White tiles" — swatch `#6e6156`, luma 99 → renamed **"Mosaic tiles"**
- `wall-leather-white` "White leather" — swatch `#969380`, luma 146, a flat greige → renamed
  **"Greige leather"**

**The swatches were honest and the names were not.** Every swatch matches its albedo texture's mean to
within rounding, because the asset pipeline derives it — so the drift is entirely in the hand-written
name. The names live in each asset's `material.json` and flow through
`scripts/asset-pipeline/index-assets.ts`; **ids are unchanged**, since those are what saved designs
persist. `src/materials/swatchHonesty.test.ts` now pins the rule, and includes a guard-the-guard case
so it cannot pass vacuously if the rules ever stop matching anything.

One regeneration trap: `npm run index-assets` emits double quotes and semicolons, so its output diffs
against the biome-formatted committed catalogs on **every line**. Run biome over the two generated
files afterwards and the diff collapses to the real change — here, two lines.

---

## `.198` — texture scale is fine; a drawn curtain is lit as an opaque sheet

Two axes checked, one clean, one badly broken.

### Texture world scale is correct — a clean negative

Textures at the wrong real-world size are a classic realism failure, so the generated (photo-scanned)
finishes were checked against dimensions that are not matters of taste. Overlaying 100 mm gridlines
derived from each material's `uvScale` (which is metres per texture repeat, the convention the
procedural catalog documents):

- **Red brick** — ~24 courses over 1.5 m ≈ **62 mm** per course. A real brick course is 65–75 mm.
- **Oak planks** — ~140 mm plank width. Real oak floorboards are 90–200 mm.

Both correct, so the hand-tuned `uvScale` values in the pipeline sidecars are doing their job. Recorded
as a negative so the axis is not re-opened.

One method note: autocorrelation on the albedo was tried first and is **not** trustworthy here — it
returns *a* period, not the feature pitch, and reported 23 mm "planks" for parquet and 19 mm "tiles"
for stone. The gridline overlay read directly off the image is what settled it.

### Floor gloss is not a target either

| floor | sd/mean |
| --- | --- |
| photo D parquet (glossy) | 0.156 / 0.218 |
| photo C pale wood (matte) | 0.037 / 0.051 |

A 4× spread driven entirely by finish — the same shape as `.187`'s fabric retraction. There is no
photographic value to hit, only the question of whether the app responds to its finish, which `.197`
answered yes.

### A drawn curtain reads as a blackout sheet at midday

In a photograph a curtain hanging over a daylit window is the **brightest large surface in the room**,
because daylight transmits through cloth. Measured on the references, curtain ÷ frame mean:

| reference | ratio |
| --- | --- |
| photo D, sheer over a balcony door | **1.42** (lower half alone 1.48) |
| photo A, cream curtain over a window | **1.32** |
| photo C, drape on a blank wall (not backlit) | 0.88 |

The app, at 13:00 with the curtains drawn, measures **0.69** — the curtain is *darker than the room
average*, less than half the photographic value. With the curtains open the same window plane reads
1.01, i.e. the glazing is barely brighter than the room either (though that figure includes the frame,
mullions and safety grille, which `.175` showed contaminate a window crop, so treat it as indicative).

The frame confirms the number without ambiguity: a large brown-grey sheet filling the window wall with
no sense of daylight behind it. At midday, with the sun outside, the app renders what looks like a
blackout curtain in a dim room.

`scripts/dev-probes/curtain-glow.mjs` is the new instrument — geometric mask (samples must lie in the
window's own plane, within 0.5 m of it and above sill height), HUD cut-outs, onboarding suppressed, and
a `CLOSED=0` control that measures the glazing instead. It sets `drawAmount` explicitly rather than
calling `toggleWindowFixture`, which FLIPS and is how `.91` ended up measuring two covered windows.

**Nothing changed in `src/` this round.** The fix is curtain light transmission — the fabric has to
carry daylight through it rather than only blocking it (the existing `windowFillAttenuation` models the
blocking half and nothing models the transmitting half). That is the next round's work, and it now has
a target of 1.32–1.48 and a probe that reports it.

---

## `.199` — curtain backlight: both cheap models refuted, and the reason is the same one

`.198` measured the app's drawn curtain at **0.69** of frame mean against photographs at **1.32–1.48**.
Two mechanisms were built and measured this round. Both are reverted; the baseline is restored and
re-measured at 0.69.

### Attempt 1 — emissive: hits the target and destroys the fabric

An emissive term proportional to the fabric's own colour, scaled by the eased sun so it cannot glow at
night, published to the material through a module signal (the `photographicSignal` pattern). It works
on the headline number and fails on everything else:

| backlight gain | plane/frame | curtain mean | micro-sd | micro/mean |
| --- | --- | --- | --- | --- |
| 0 (shipped) | 0.69 | 58 | **4.10** | **0.0705** |
| 0.8 | 1.23 | 152 | 2.43 | 0.0159 |
| 1.1 | 1.28 | 165 | 2.59 | 0.0157 |
| 1.6 | **1.33** ✓ | 180 | 2.62 | 0.0146 |
| photographs | 1.32–1.48 | | | 0.066–0.198 |

At 1.6 the ratio lands in the photographic band — and the weave is gone. **Absolute** micro-sd falls
4.10 → 2.62, so this is not the ratio being diluted by a larger mean; the high-frequency signal itself
is destroyed. The side-by-side is unambiguous: folds and weave in the before frame, a flat pale sheet
in the after. Even the gentlest gain tested (0.8) costs 41 % of the absolute detail.

**The mechanism is exact.** This fabric carries no albedo texture — plain drapery is
`map: null` — so *all* of its detail comes from `normalMap: getFabricNormal()`. Emissive is added
after shading and carries no normal information, so it dilutes precisely the signal the weave depends
on, and it pushes the surface onto AgX's shoulder where what remains is compressed further. Ten rounds
(`.157`–`.184`) went into that weave; trading it for a brightness number is a bad deal.

### Attempt 2 — `transmission`: barely moves, and costs detail anyway

The physically-right model, tried second: `transmission: 0.55, thickness: 0.02` on the drapery
`MeshPhysicalMaterial`.

| | plane/frame | curtain mean | micro-sd |
| --- | --- | --- | --- |
| baseline | 0.69 | 58 | 4.10 |
| transmission 0.55 | **0.79** | 71 | 2.86 |
| emissive 1.6 | 1.33 | 180 | 2.62 |

It buys **0.10** of ratio against the 0.63 needed, and still loses a third of the weave — while adding
a transmission render pass on every tier that mounts it. Strictly worse value than the emissive it was
meant to replace.

### What a correct fix needs

Both failures share a cause: the camera sees the curtain's FRONT face while the light is BEHIND it, and
a standard material's front face gets nothing from a light at `N·L < 0`. Real cloth scatters light
forward, and — this is the part that matters — it scatters it *modulated by thickness*, which is why a
backlit curtain in a photograph is bright **and** keeps its folds: a doubled fold transmits less and
reads darker.

So the term needed is diffuse transmission that responds to the surface normal, i.e. wrap lighting.
three has no such term for standard materials (`transmission` is specular refraction), so this needs a
shader chunk via `onBeforeCompile` — a real piece of work rather than a constant. Recorded with its
target (1.32–1.48), its constraint (**absolute micro-sd must stay near 4.10**), and the probe that
reports the first (`curtain-glow.mjs`) so the next attempt is measured against both from the start.

**Nothing shipped.** A curtain that hits the brightness target by erasing its own weave is not a step
toward photorealism.

---

## `.200` — SHIPPED: drapery scatters light forward, and the metric had to be fixed first

`.199` refuted both cheap models for the backlit curtain and named what was needed: diffuse
transmission that responds to the surface normal. This builds it as an `onBeforeCompile` chunk.

### The metric was pose-dependent, and that had to be fixed before anything could be tuned

`.198`'s target — curtain ÷ **frame** mean, 1.32–1.48 — is not comparable across poses. The
reference curtains cover **2 %** (photo A) and **8 %** (photo D) of their frames; this probe's pose
fills **~35 %**. A brighter curtain therefore inflates the very mean it is divided by, and the ratio
saturates: the wrap term ran 0.69 → 0.78 → 0.85 → 0.98 → 1.09 → 1.17 → 1.25 and was still climbing
at gain 16, appearing to stall short of a target it could not reach by construction.

Re-derived against the room EXCLUDING the curtain, the photographs give the same numbers —
**1.32 (photo A) to 1.48 (photo D)** — but now pose-robustly, and the app's room mean stays nearly
constant across the sweep (79.7 → 87.6) so the ratio scales properly. `curtain-glow.mjs` prints both
and labels which to compare.

### The term

Back-side irradiance added to `irradiance` immediately before `RE_IndirectDiffuse` consumes it, so it
is modulated by the material's own diffuse colour and takes the same path as every other diffuse
term: `saturate(dot(-N, L))` per directional light, plus `getIBLIrradiance(-N)` under `USE_ENVMAP` —
the latter is what actually carries a **north-facing** window, where the sun never strikes the glass
and the sky is the whole of the backlight.

| | plane/ROOM | curtain mean | micro-sd | micro/mean |
| --- | --- | --- | --- | --- |
| baseline | 0.59 | 58 | 4.10 | 0.0705 |
| emissive 1.6 (`.199`, refuted) | — | 180 | **2.62** | 0.0146 |
| **wrap t=14 (shipped)** | **1.41** | 151 | **15.00** | 0.0992 |
| photographs | 1.32–1.48 | | | 0.066–0.198 |

**The wrap term does the opposite of the emissive on detail.** Because it responds to the normal, a
fold whose back faces the window brightens while its neighbour does not — micro-sd goes **up** 4.10 →
15.00, into the photographs' own range, where the emissive drove it down to 2.62. The three-way crop
is unambiguous: a dark sheet, then a flat pale sheet, then a bright curtain with visible weave and
folds.

Night is untouched by construction — at 22:00 the lights are in FRONT of the cloth, and the term
measures **0.92**. The default look reaches 1.04, improved from 0.59 but below the band, because its
brighter room raises the denominator. Free: `frame-time.mjs` medium p90 **8.3 ms**, unchanged.

### The trap that would have shipped a broken program

`customProgramCacheKey` is required alongside `onBeforeCompile`. Three caches compiled programs by
material type + defines, so a patched and an unpatched `MeshPhysicalMaterial` collide and whichever
compiled first wins for BOTH — which would have applied the curtain's wrap term to upholstery, or
silently dropped it, depending on load order. `drapeTranslucency.test.ts` pins it, along with the
injection order and the fact that the chunk references the shading normal at all — the property whose
absence is exactly why `.199`'s emissive failed.

---

## `.201` — the parity check found a mask bug, not a parity gap

`.200` tuned the curtain term on the living/dining window alone. Checking the other windows is what
this round was for, and the first pass looked like a clear regional failure:

| window | 09:00 | 13:00 | 17:00 |
| --- | --- | --- | --- |
| living/dining | 1.31 | 1.41 | 1.35 |
| main bedroom | 1.00 | **1.14** | 1.08 |
| bedroom 2 | 0.99 | **1.10** | 1.10 |

A tidy story — the term works where it was tuned and not elsewhere. The frame refuted it: the bedroom
curtain is plainly bright, cream and woven, exactly like the living/dining one.

### The mask was measuring the wall

`curtain-glow.mjs` classified a sample as "window plane" by its distance from the window's plane along
the wall NORMAL only. The wall *beside* a window is in that same plane, so it counted as curtain — and
the narrower the covering relative to its wall, the more wall got averaged in. That is why the
bedrooms looked worse: their curtains cover less of their walls, not less of their windows.

Bounding the mask by the opening's own width (±15 %) as well as its depth:

| window | before (depth only) | after (depth + width) |
| --- | --- | --- |
| living/dining | 1.41 | **1.73** |
| main bedroom | 1.14 | **1.71** |
| bedroom 2 | 1.10 | **1.48** |

**The parity gap disappears** — 1.71 against 1.73 — and it was never real. This is `.181`'s lesson
again in a new place: a mask defined by one coordinate admits everything that shares it.

### Which means `.200` shipped an over-tuned value

`t=14` was chosen to reach 1.41 on a mask that under-read the curtain by ~0.3. On the corrected mask
it measures **1.73**, well past the photographic 1.32–1.48. Re-swept: **t=6 → 1.40**, t=9 → 1.56,
t=14 → 1.73. Shipped **6**.

| | plane/ROOM | curtain mean | micro-sd | micro/mean |
| --- | --- | --- | --- | --- |
| baseline (t=0) | 0.59 | 58 | 4.10 | 0.0705 |
| emissive 1.6 (`.199`, refuted) | — | 180 | 2.62 | 0.0146 |
| t=14 (`.200`, over-tuned) | 1.73 | 151 | 15.00 | 0.0992 |
| **t=6 (shipped)** | **1.40** | 120 | **12.62** | 0.1055 |
| photographs | 1.32–1.48 | | | 0.066–0.198 |

Across the app at t=6 the photographic look measures **1.40 / 1.32 / 1.20** (living-dining, main
bedroom, bedroom 2), night sits at 1.05 with no glow, and the default look at 1.12. The mechanism
from `.200` is unchanged and stands; only its constant moved.

`RollerBlind` needs no work — it already builds its fabric through `getDraperyMaterial`, so blinds
and zebra blinds inherit the term. Venetian slats keep their own inline material, which is right:
aluminium slats are opaque.

---

## `.202` — a room-by-room parity sweep, and why most of it was invalid

With the photographic look inside every band in the living/dining room, the obvious question is whether
that holds across the flat. The first sweep said no, dramatically — bedroom 2 and 3 and bath 1 all
reported `%<64` **0.00 %** with frame means of 178–197, i.e. no deep shadow anywhere and far brighter
than living/dining's 120.9. That reads as "the calibration is local to one room".

**It was three pose bugs stacked, and the frame gave the first one away.** The bedroom-3 capture was a
flat beige wall filling the frame, with the minimap reading **CORRIDOR**.

### Bug 1 — a fixed standoff walks out of a small room

`light-distribution.mjs` steps back a fixed 4.6 m from the window. The living/dining room is deep
enough; a bedroom is not, so the camera ended up in the corridor with its nose against a wall. The
standoff now steps back only as far as the room allows.

### Bug 2 — "in a room" is not "in THIS room"

The clamp's first version tested whether the point was inside *any* room, and the corridor is a room,
so it passed. Only the living/dining and main-bedroom arms changed. Requiring the window's **own**
room moved four of six poses and changed every number in the sweep.

### Bug 3 — the walker does not stay where it is put

`requestWalkTeleport` runs the point through the app's own collision solver (WALK-SPAWN-CLEAR), which
pushes the walker out of furniture and walls. Nothing compared the pose asked for with the pose
reached, so the probe measured whatever room it ended up in. It now reports both:

| window | asked | reached | drift | room asked → reached |
| --- | --- | --- | --- | --- |
| living/dining | 10.82, 5.80 | 10.87, 6.47 | 0.68 | livingDining → **livingDining** ✓ |
| bedroom 3 | 7.70, 3.70 | 7.70, 3.92 | 0.22 | bedroom3 → **corridor** ✗ |
| bath 1 | 2.75, 4.93 | 2.81, 4.91 | 0.06 | bath1 → **null** (no room) ✗ |

Bedroom 3 drifts only **0.22 m** and still crosses a room boundary; bath 1 drifts 0.06 m and lands
outside every room. A small drift is not a safe drift — what matters is which side of a wall it ends
on, and only an explicit room comparison can see that.

### What this leaves

**Living/dining is byte-identical** through all three fixes (120.9 / 10.22 % / ceiling 1.07 /
wall 1.19 / floor 1.15, standoff still 4.6), so every number recorded in this arc stands — the fixes
only touch poses that were already wrong.

**Per-room parity is still UNMEASURED for the small rooms**, and that is the honest state. The
corrected sweep suggests bedroom ceilings sit well below the band (0.65–0.86 against 1.08–1.28) while
living/dining is at 1.07, but those arms still fail the arrival check, so the figures are not
quotable. Fixing that means choosing a pose that survives collision resolution — a room centroid
rather than a window standoff — which is the next round's work, now with an arrival assertion that
will fail loudly instead of returning a plausible wrong number.

Nothing changed in `src/`.

---

## `.203` — the first verified per-room parity table

`.202` fixed three pose bugs and still could not land the camera in the small rooms, because
`requestWalkTeleport` runs the point through the app's collision solver. The fix is to stop guessing:
teleport, **check which room the camera actually reached**, step 0.3 m closer and retry, and only
accept a pose that lands in the window's own room. Every arm below reports `landedInRoom: true` with
`roomReached` matching, and the frames confirm it — the bedroom-3 capture now shows a bedroom with the
minimap reading BEDROOM 3, where `.202`'s showed a corridor wall.

Living/dining is byte-identical through the change (120.9 / 10.21 % / ceiling 1.07, standoff still
4.6), so nothing recorded earlier moves.

| room | standoff | `%<64` | ceiling | wall | floor |
| --- | --- | --- | --- | --- | --- |
| living/dining | 4.6 | 10.21 % | 1.07 | 1.19 | 1.15 |
| main bedroom | 3.6 | 10.43 % | **0.86** | 1.03 | **0.68** |
| bedroom 2 | 3.0 | 8.13 % | **0.98** | 0.96 | 1.26 |
| bedroom 3 | 3.3 | 8.58 % | **0.95** | 0.61 | **0.79** |
| bath 1 | 1.6 | 4.34 % | 1.06 | 1.12 | 0.87 |
| bath 2 | 1.6 | 2.02 % | 1.03 | 0.94 | 0.86 |
| photographs | | 1.9–12.2 % | 1.08–1.28 | 0.53–1.43 | 0.87–1.30 |

### Two findings, opposite in sign

**The deep-shadow calibration generalises completely.** `%<64` is inside the photographic band in
**all six rooms**, 2.02 % to 10.43 %, despite the rooms differing by a factor of three in size and the
baths having small high windows. That is the metric this whole arc was built on, and it holds
app-wide rather than only where it was tuned.

**The ceiling term does not.** Every room is short of the 1.08 band: living/dining sits on its edge at
1.07, the baths at 1.03–1.06, and the bedrooms at **0.86–0.98**. `.195` tuned
`PHOTO_GROUND_BOUNCE` against the living/dining window alone, and the hemisphere's ground term is
global, so the shortfall is geometric — a small room's ceiling is nearer its walls and gets
proportionally less of the term than a large room's does.

Floor also dips below band in the two rooms whose beds fill the pitched-down frame (main bedroom 0.68,
bedroom 3 0.79), which is furniture in the floor band rather than a floor result — the `.181` trap,
and the reason that column is quoted but not acted on.

### Why this is recorded rather than fixed

Raising `PHOTO_GROUND_BOUNCE` to lift the bedrooms would push living/dining past the band it was
tuned to and cost deep shadow in every room at once — the two are one lever, as `.195` measured.
Closing this needs a term that scales with room size, which is a design change rather than a constant.
Recorded with a probe that now refuses to measure the wrong room.

Nothing changed in `src/`.

---

## `.204` — the bedroom ceiling is not bounce-limited, and the ceiling METRIC is now in doubt

`.203` recorded bedroom ceilings at 0.86–0.98 against living/dining's 1.07 and attributed it to the
global ground-bounce term not scaling with room size. Testing that directly refutes it.

### Raising the bounce does not lift the bedrooms

| ground bounce | living/dining ceiling | bedroom 3 ceiling | bedroom 3 `%<64` |
| --- | --- | --- | --- |
| ×6.5 (shipped) | 1.07 | 0.95 | 8.58 % |
| ×11 | 1.12 | 0.97 | 6.27 % |
| ×16 | 1.16 | **0.99** | 5.33 % |

Living/dining responds normally (+0.09 across the sweep); bedroom 3 moves **+0.04 for 2.5× the term**,
while paying 3.25 points of deep shadow for it. Whatever caps the bedroom ceiling, it is not the amount
of bounce — so the `.203` plan (a room-size-scaled bounce) would have been tuning against the wrong
cause. Reverted; `PHOTO_GROUND_BOUNCE` stays at 6.5.

### And the metric itself may not be measuring the ceiling

A geometric cross-check was added to `light-distribution.mjs` — classify each ray by WORLD NORMAL the
way `wall-cap.mjs` and `underside-shadow.mjs` do, rather than by screen band. It finds **zero**
ceiling samples in every room (living/dining, bedroom 3, main bedroom), classifying essentially
everything as wall or floor, with either normal sign accepted at ceiling height.

That is not yet a verdict, because the two available pieces of evidence point opposite ways, and a new
probe (`ceiling-hit.mjs`) was written to settle it:

- **For "the band is ceiling":** every ray in the band (screen Y 0.02–0.16) hits a surface at
  **y = 2.6 m**, exactly ceiling height, in all seven sampled rows.
- **For "the band is upper WALL":** those same hits are classified as wall by the normal test, i.e.
  their normals are near-vertical — and a horizontal row of rays striking a flat far wall does land at
  a near-constant height, which 2.6 m would be, since the walls are 2.6 m tall.

`ceiling-hit.mjs` reports heights correctly but its normal column is not printing (a bad expression in
its own log line), so the question is **open**. It matters a great deal: the ceiling ratio has been a
target since `.179`, and `.195` shipped `PHOTO_GROUND_BOUNCE` to move it. If the band is upper wall,
that number needs re-deriving — though note the shipped change would not thereby become wrong, since
the hemisphere's `groundColor` reaches a down-facing ceiling in full and a vertical wall by half, so it
moved both.

Recorded as an open question with the evidence on both sides rather than resolved badly at the end of
a long round. Nothing changed in `src/`.

---

## `.205` — the ceiling metric is VALIDATED; `.204`'s doubt was my own broken cross-check

`.204` left the arc's oldest target in doubt: a geometric cross-check found **zero** ceiling samples in
every room, which would have meant the "ceiling band" had been measuring upper wall since `.179`.
Two probe bugs, both mine, and the metric is fine.

### Bug 1 — the readout, not the data

`ceiling-hit.mjs` printed `${r.horizontal > 2 ?? r.horizontalAbove2m}`. `r.horizontal` is undefined,
`undefined > 2` is `false`, and `false ?? x` short-circuits to `false` — so the column that was
supposed to answer the question printed a constant. The data had been collected all along. Fixed:

| screen Y | hits | max hit Y | n.y | material |
| --- | --- | --- | --- | --- |
| 0.02 | 40 | 2.60 | **−1** | **MeshLambertMaterial** |
| 0.05 | 40 | 2.60 | −1 | MeshLambertMaterial |
| 0.09 | 40 | 2.60 | −1 | MeshLambertMaterial |
| 0.13 | 40 | 2.60 | −1 | MeshLambertMaterial |
| 0.16 | 40 | 2.60 | −1 | MeshLambertMaterial |
| 0.25 | 40 | 2.60 | 0 | MeshStandardMaterial |
| 0.40 | 40 | 2.34 | 0 | MeshStandardMaterial |

Every ray in the band (0.02–0.16) hits **y = 2.60 m** with a normal pointing straight **down** on a
`MeshLambertMaterial` — and the app's only Lambert surface is the ceiling (`ceiling/Ceiling.tsx`, kept
Lambert deliberately because it is a large matte surface). **The band is the ceiling.** The rows below
it flip to vertical normals on `MeshStandardMaterial`, i.e. wall, exactly where you would expect.

### Bug 2 — the cross-check was looking at the floor

`light-distribution.mjs` captures twice: the main frame at `PITCH`, then a **pitched-down** frame at
`FLOOR_PITCH` for the floor band. The geometric block ran after both and inherited the pitched-down
camera, where the ceiling is out of frame — hence zero samples. Restoring the main pitch first, the two
methods agree:

| room | band ceiling | geometric ceiling | ceiling samples |
| --- | --- | --- | --- |
| living/dining | 1.07 | 1.03 | 519 |
| main bedroom | 0.86 | 0.83 | 223 |
| bedroom 3 | 0.95 | 0.83 | 60 |

The two normalise differently — the band against the whole frame mean, the mask against its own
ceiling+wall+floor mean — so they are not expected to match exactly. What matters is that an
**independent classifier reproduces both the level and the ordering**: every room below the 1.08 band,
and the bedrooms below living/dining.

### What stands

- **The ceiling metric is sound**, now corroborated by a second method instead of resting on one screen-band assumption. `.195`'s `PHOTO_GROUND_BOUNCE` was shipped against a real measurement.
- **`.203`'s parity finding stands**: bedroom ceilings really are lower than living/dining's, and every room is short of the photographic band.
- **`.204`'s refutation also stands**: that shortfall is not bounce-limited (×2.5 the term buys +0.04 in bedroom 3), so it still has no identified cause.

The geometric mask stays in the probe as a permanent cross-check, with the pitch restore and a
low-sample warning. Nothing changed in `src/`.

---

## `.206` — the ceiling "deficit" is largely a COMPOSITION artefact

`.205` validated that the ceiling band really is ceiling, leaving `.203`'s parity finding standing:
every room short of the photographic 1.08–1.28, bedrooms worst at 0.86–0.98. This round asks whether
that comparison is sound, and it is not.

### Every ratio taken against a FRAME mean moves with what is in shot

`.201` already hit this on the curtain: the reference curtains cover 2–8 % of their frames while the
probe's pose fills ~35 %, so the same physical brightness gives a different ratio. Ceiling ÷ frame has
exactly the same defect — the reference photographs are wide interior shots, the probe is a
window-facing walk view, and the two put very different amounts of bright floor and glazing in frame.

**Ceiling ÷ WALL has no such dependence**, because both surfaces are in the same frame. Measured on
the references with the crops `.188` verified by grid overlay:

| reference | ceiling | wall | **ceiling/wall** |
| --- | --- | --- | --- |
| photo C (modern white) | 169 | 188 | **0.90** |
| photo D (lived-in flat) | 188 | 188 | **1.00** |

### And the app is not short — it is marginally over

At a consistent `PITCH=0.25` (needed for the small rooms to see any ceiling at all), with 623–2116
ceiling samples per room:

| room | ceiling/wall |
| --- | --- |
| living/dining | 1.09 |
| main bedroom | 1.13 |
| bedroom 2 | 1.05 |
| bedroom 3 | 1.10 |
| bath 1 | **0.81** |
| bath 2 | **0.69** |
| photographs | 0.90–1.00 |

**The four habitable rooms sit at 1.05–1.13 — slightly BRIGHTER than the photographic band, not
darker.** The bedroom shortfall recorded in `.203` and re-confirmed in `.205` was an artefact of the
level pitch: at `PITCH=-0.06` those rooms yield only 60–223 ceiling samples, a small and biased slice
of ceiling and wall, and the ratio swung from 0.82 to 1.13 purely on pose. `.204`'s refutation now
makes sense from the other side too — raising the bounce barely moved the bedroom ceiling because it
was never dark.

The two BATHROOMS are genuinely different at 0.69–0.81, but there is **no matching reference**: both
photographs are living rooms, and a real tiled bathroom has bright gloss walls that would depress this
ratio legitimately. Recorded as unexplained rather than as a defect.

### What this costs the record

`.188`'s ceiling target and everything built on it — including `.195`'s shipped
`PHOTO_GROUND_BOUNCE` — rest on a frame-normalised ratio that is not comparable between the
photographs' compositions and the probe's. **That does not make the shipped change harmful**: it also
moved `%<64` into a defensible place, the wall and floor ratios stayed in range, and the visual A/B was
judged on its own terms. But the headline justification ("the ceiling reaches the photographic band")
was weaker than recorded, and the composition-independent measurement says the ceilings were closer to
right than the frame ratio implied.

The lesson is now twice-earned and belongs in every future target: **normalise against a surface in the
same frame, never against the frame itself.**

---

## `.207` — `%<64` is pose-bound, and it is the metric this whole arc was calibrated on

`.206` established that a ratio taken against the FRAME mean moves with what is in shot, and demoted
the ceiling target for it. The same test has to be applied to `%<64`, the deep-shadow fraction that has
been the primary calibration number since `.163` — it set `PHOTO_FILL_SCALE`, and every look decision
since has been checked against it.

One room, one lighting state, one time of day. Only the camera pitch changes:

| pitch | frame mean | `%<64` |
| --- | --- | --- |
| −0.50 (down at the floor) | 99.7 | **18.63 %** |
| −0.25 | 112.7 | 18.08 % |
| −0.06 (the calibration pose) | 120.9 | **10.21 %** |
| +0.15 | 134.3 | 3.26 % |
| +0.35 (up at the ceiling) | 141.9 | **1.42 %** |
| photographs | | 1.9–12.2 % |

**A 13× swing on pose alone, spanning and exceeding the entire photographic band.** Tilt down and the
app is darker than the darkest reference; tilt up and it is brighter than the lightest. The lighting is
identical in every row.

### What this does and does not invalidate

**It does not invalidate the sweeps.** Every calibration in this arc — `PHOTO_FILL_SCALE`,
`PHOTO_GROUND_BOUNCE`, the AO retune, the curtain term — compared arms at an *identical* pose, and
`%<64` is monotonic in each of those levers at a fixed pose. As a relative instrument it worked, and
the changes those sweeps produced stand on their own measurements.

**It does invalidate the absolute claim.** "The photographic look sits inside the photographic
deep-shadow band" is a statement about one pitch in one room, not about the app. `.186` widened that
band from two photographs to four and treated the result as a property of photographs; it is at least
as much a property of how each photograph was framed. The honest form of the claim is: *at the
calibration pose*, the app reads 10.21 % where four photographs of interiors read 1.9–12.2 %.

**And it explains a puzzle.** `.203` found `%<64` in band in all six rooms and called it the metric
that generalises. It generalises because every room was measured at the same pitch — which is exactly
the variable it is most sensitive to, held constant.

### Consequence

`%<64` stays as the arc's comparison instrument, because at a fixed pose it responds cleanly to every
lever that matters. It is retired as an absolute photographic target. The probe now says so in its own
output, next to the number, so the distinction cannot quietly be lost again.

Three targets have now failed the same test — the shadow band (`.186`), the fabric micro-contrast
(`.187`), and the ceiling ratio (`.206`) — and this is the fourth. The pattern is consistent enough to
state as a rule: **a number derived from a photograph transfers only if the app measures it the same
way, over the same denominator, from a comparable viewpoint.** Almost none of the obvious ones do.

---

## `.208` — SHIPPED: retuned on the metrics that survived, and all four now hold at once

`.206` and `.207` demoted the two frame-normalised targets this arc had been steering by. That leaves a
validated set — ratios between two things in the SAME frame, where composition cancels — and the app
had never been tuned against it.

### Which photographic ratios actually transfer

| ratio | photo C | photo D | usable? |
| --- | --- | --- | --- |
| ceiling / wall | 0.90 | 1.00 | **yes** — both painted, so albedo roughly cancels and it isolates lighting |
| floor / wall | 0.98 | 0.76 | no — pale wood against dark parquet; albedo-confounded, as `.188` found |
| ceiling / floor | 0.91 | 1.32 | no — same reason |

So the transferable set is **ceiling/wall (0.90–1.00)**, plus the two same-material ratios already in
use: shadowed ÷ lit floor (**0.579–0.725**) and curtain ÷ room (**1.32–1.48**).

### Retuning against them

`PHOTO_GROUND_BOUNCE` sweeps cleanly on the good metric — ceiling/wall 0.78 at ×1, **0.95 at ×3**, 1.09
at ×6.5 — so the shipped 6.5 was over. **3** puts all four habitable rooms in band: living/dining 0.95,
main bedroom 0.98, bedroom 2 0.89, bedroom 3 0.96, where 6.5 missed high in every one (1.05–1.13).

**And the two terms turned out to be coupled.** The curtain ratio is measured against the room, so
darkening the room lifted it to **1.53** without the curtain being touched. `CURTAIN_TRANSLUCENCY`
re-swept at the new bounce: t=4 → **1.38**, t=5 → 1.47. Shipped 4. `under/open` is unchanged at 0.721,
which is the expected result rather than a lucky one — `.194` established that `groundColor` cannot
reach an up-facing floor.

### Final state, every validated metric in band together

| metric | app | photographs |
| --- | --- | --- |
| ceiling / wall | **0.89–0.98** (four rooms) | 0.90–1.00 |
| shadowed ÷ lit floor | **0.721** | 0.579–0.725 |
| curtain ÷ room | **1.38** | 1.32–1.48 |
| curtain at 22:00 | 1.05 (no glow) | — |

That is the first time the app has satisfied the whole *validated* metric set simultaneously. It is a
smaller claim than the ones this arc has made before, and a sounder one: three ratios, each measured
the same way in the app and in the photographs, each independent of how the shot is framed.

The visual A/B is near-identical — ×3 is marginally deeper in the ceiling and upper walls, no
regression. `%<64` at the calibration pose moves 10.21 % → 14.42 %, which is a real change but no
longer a target (`.207`); it is recorded as a comparison between two builds at one pose, which is the
only thing that number can honestly support.

---

## `.209` — the window is a flat grey panel, and it never blows out

With the metric foundation rebuilt, a new axis: the glazing itself. A fifth reference was fetched for
it (a real-estate kitchen with an uncovered daylit patio door), eyeballed first per `.186` — real
appliances, natural clutter, no CG tells.

### The obvious assumption was wrong

"A window is the brightest thing in an interior" is false as stated. Measured glazing against wall in
the same frame:

| reference | glazing | wall | glazing/wall | clipped |
| --- | --- | --- | --- | --- |
| kitchen (new) | 227 | 211 | 1.08 | **15.1 %** |
| photo C living room | 155 | 188 | **0.82** | 0.1 % |

Photo C's window is **darker** than its walls — a shaded garden view in a bright white room. So the
mean ratio is not the signal. The **clipped fraction** and the **distribution** are.

### The app's window is flat, and dim

| | p90 | p99 | max | clipped |
| --- | --- | --- | --- | --- |
| reference kitchen glazing | 252 | 255 | **255** | 15.1 % |
| photo C glazing (shaded) | 210 | 242 | **255** | 0.1 % |
| **app window plane, 13:00** | 181 | 183 | **183** | **0.0 %** |

Two findings, and the second is the stronger one:

1. **The app never approaches white.** Its brightest window pixel at midday is **183**; both
   photographs reach **255** — including the shaded one that is darker than its own walls on average.
   The app clips 0.0 % at 09:00, 13:00 and 17:00 alike.
2. **The app's window is nearly uniform.** p90 → max spans **two luminance units** (181 → 183), where
   photo C's spans 210 → 255. That is a flat grey panel, not a view. It is the same thing `.198`
   observed qualitatively about the `sky` backdrop having no content, now with a number on it.

### Two candidate causes, one of which is not mine to change

- **The exterior's dynamic range.** The `sky` backdrop paints a smooth analytic gradient, so there is
  little tonal structure to survive into the frame. Broadening that is a backdrop change and sits in
  the area `WINDOW-SKY-DEFAULT` already treats as a product decision.
- **The view transform.** AgX was chosen deliberately *because* it cuts blown highlights 4–7× versus
  filmic (`TONE-CURVE-CHOICE`, clipped 0.28 % vs 1.94 %), and it shipped on the user's explicit
  sign-off. A real photograph of a daylit interior blows its window; the app's operator is tuned not
  to. **That tension is real and it is not mine to resolve unilaterally** — the note says so in terms.

Recorded, not fixed. What is unambiguous and independent of the tone curve is finding 2: a two-unit
spread across the top decile is a flat panel regardless of operator, and that is a content problem in
the backdrop rather than a grading one.

Nothing changed in `src/`.

---

## `.210` — is the render "too clean"? Only where there is no texture — and one false alarm on the way

A classic CG tell is that renders lack the sensor grain a photograph always carries. Measured as the
high-frequency floor (micro-sd against a 4 px blur) on surfaces that should be featureless.

### Flat painted wall: no deficit

| surface | micro-sd |
| --- | --- |
| photo C wall | 1.36 |
| photo D wall | 1.18 |
| app wall (right) | 0.80 |
| app wall (left) | 1.94 |

The app brackets the photographs. Its walls carry the procedural plaster micro-normal (MAT-003's
roller nap), which supplies high-frequency content of the same order as sensor grain. Two other
"wall" crops read 11.48 and 30.55 and were **discarded on inspection** — one contained a pendant
light and a switch, the other a curtain and blinds.

### Untextured ceiling: a real, small deficit

The ceiling is the honest test — `ceiling/Ceiling.tsx` paints it flat `#fafafa` with no map at all.

| | micro-sd |
| --- | --- |
| photo C ceiling | 0.70 |
| photo D ceiling | 1.56 |
| app, AO off | 0.29 |
| **app, shipped (AO on, half-res)** | **0.46** |
| app, AO on full-res | 0.64 |

**The app's untextured ceiling is roughly half as busy as the quietest photographic ceiling.** That is
the "too clean" effect, and it is confined to surfaces with no texture map — exactly where nothing
else supplies detail.

### The false alarm, and what caused it

The first pass reported the app's ceiling at **3.52** and AO on-vs-off at 3.52 vs 4.56, which read as
"the AO pass is adding more noise than a photograph carries, and `.196` raised its intensity 50 %".
That was wrong twice over:

- The first crop caught the **"Walking through" HUD toast** at its right edge — the `.185` trap again,
  in a probe frame this time rather than a band.
- The second crop, clear of the HUD, still spanned the **ceiling/wall junction**, so the high-pass was
  measuring AO's corner gradient. Contrast-normalising the crop showed it immediately: a smooth
  monotonic darkening toward the corner, which is exactly what AO is for, not grain.

Clear of both, AO contributes **0.17** (0.29 → 0.46). The claim is fully retracted. **A high-frequency
statistic on a crop that contains an edge measures the edge** — the same lesson as `.181`'s floor band,
now for a metric rather than a region.

Also recorded: `denoiseSamples` / `denoiseRadius` passed to `<N8AO>` are **inert** — output was
byte-identical (3.52 both) — most likely because the `quality` preset assigns them after the props are
read. And `halfRes={false}` does not reduce the ceiling's high-frequency floor either (0.64 vs 0.46);
if anything it raises it. Don't reach for either knob expecting a noise change.

### Consequence

The gap is real but small and narrow: 0.46 against 0.70–1.56, on untextured surfaces only. The
conventional fix is a subtle film grain, and the post stack already imports `Noise` — but it mounts
only at the full-post tiers, while `medium` (the tier the adaptive ladder picks for most browsers) runs
the AO-only minimal composer. So this is a real candidate with a real cost question attached, and that
is where it stands. Nothing changed in `src/`.

---

## `.211` — SHIPPED: sensor grain, and a metric that had to be measured at the right resolution

`.210` found the app's untextured surfaces about half as busy as a photographic ceiling and left film
grain as the candidate. Building it exposed a measurement problem first.

### The metric was being averaged away

`underside-shadow.mjs` screenshots at CSS pixels while the app renders at DPR 1.5, so per-pixel grain
is downsampled before it is measured. The same frames read **0.46 downsampled** and **0.10 native**.
That is why the first sweep looked so weak — grain 0.02/0.04/0.07 moved the downsampled number only
0.46 → 0.53 → 0.59 → 0.67, and the 3× crop showed nothing at all.

Re-measured through `light-distribution.mjs`, which captures at `deviceScaleFactor: 2`:

| | micro-sd |
| --- | --- |
| app, no grain | **0.10** |
| app, grain 0.04 | 0.48 |
| **app, grain 0.07 (shipped)** | **0.62** |
| photo C ceiling | 0.76 |
| photo D ceiling | 1.49 |

**And the resolution match was checked rather than assumed** — the app frame is 2560 px, the
photographs 1600 px, so micro-sd could have been comparing sampling rather than surfaces.
Downsampling the app crop to the photographs' pixels-per-metre moves it 0.10 → 0.13 and 0.48 → 0.46,
i.e. barely. The comparison stands.

### What shipped

`<Noise premultiply opacity={PHOTO_GRAIN_OPACITY}>` at **0.07**, in both composer modes, gated on the
photographic look. That lands the untextured ceiling at 0.62 — just under the quietest photographic
ceiling, deliberately the conservative end. On a 2× crop it reads as an even sensor grain rather than
as an effect. The default look is unchanged and measures 0.27.

Mounted in the minimal composer as well as the full one, because `medium` — what the adaptive ladder
picks for most browsers — runs AO-only, and a full-stack-only grain would have shipped a realism fix
that most users never see. Free: `frame-time.mjs` medium p90 **8.2 ms** against the documented 8.3.

### Scope, stated honestly

This closes a **narrow** gap. Painted walls needed nothing (0.80–1.94 against 1.18–1.36) because the
plaster micro-normal already supplies detail at that scale; only surfaces with no map at all were
short. It is a small, real improvement, not a transformation — and the reason it is worth having is
that a perfectly smooth large surface is one of the few remaining cues that reads as rendered rather
than photographed.

---

## `.212` — the bathroom ceiling gap is NOT demonstrable: the metric does not extend there

`.206` left the two bathrooms as the one unexplained outlier (ceiling/wall 0.81 and 0.69, against
0.90–1.00 for living rooms) with the caveat that both references were living rooms. This round fetched
a matched one — a white bathroom with twin basins and a window — and the answer is that the comparison
cannot be made.

| | ceiling | wall | ceiling/wall |
| --- | --- | --- | --- |
| bathroom reference | 169 | 159 | **1.06** |
| photo C living room | 169 | 188 | 0.90 |
| photo D living room | 188 | 188 | 1.00 |

The bathroom reference's ceiling is **brighter** than its walls, opposite to both living rooms — and
the reason is albedo, not light: its walls are **grey** tile against a white ceiling. The app's
bathroom walls are `wall-tile-white` (glazed porcelain, bright) against the same white ceiling. Two
different albedo relationships produce two different ratios under identical lighting, so the reference
cannot adjudicate the app's number.

**This is the same boundary `.208` drew for floor/wall.** Ceiling/wall works for living rooms *because
both surfaces are painted* and the albedos roughly cancel. Change one surface to tile and the ratio
stops isolating lighting. The metric's domain is narrower than it looked.

### What can honestly be said

At the shipped `.208` state the app measures bath 1 **0.65**, bath 2 **0.54**, living/dining 0.95 — so
the `.208` retune lowered the bathrooms further (from 0.81 / 0.69). But an internal difference between
a bathroom and a living room is *expected*: glazed porcelain walls are brighter under the same light
than matte paint, which depresses ceiling/wall legitimately. Nothing here distinguishes "the bathroom
ceiling is under-lit" from "the bathroom walls are correctly glossy".

**So the bathroom outlier is withdrawn as a finding rather than resolved.** It was never demonstrated,
and with this reference it still is not. Settling it would need either a bathroom reference whose wall
albedo matches the app's white tile, or a metric that divides out albedo — and every attempt at the
latter in this arc (`.188`, `.208`) has run into the same wall.

Nothing changed in `src/`.

---

## `.213` — the default look's weak contact shadow is intrinsic, not a defect

The last surviving valid finding: at the shipped state the photographic look measures under/open
**0.720** (photographs 0.579–0.725) and the default look **0.820**, outside it. This is the one metric
in the arc that never needed demoting — same material, same frame, no composition or albedo confound —
so the gap is real. The question is whether it can be closed.

### It can, and the price is the look itself

`look.AO.intensity` swept, both looks measured at every step:

| AO intensity | photographic | default | default's open floor |
| --- | --- | --- | --- |
| 4.5 (shipped) | **0.720** | 0.820 | 147.4 |
| 6 | 0.678 | 0.791 | 137.4 |
| 7.5 | 0.639 | 0.764 | 127.8 |
| 10 | — | **0.727** | **113.5** |
| 13 | — | 0.699 | 99.3 |
| photographs | 0.579–0.725 | | |

The default look reaches the band at AO ≈ 10 — **2.2× the shipped value** — and pays for it with a
**23 % drop in open-floor luminance** (147.4 → 113.5). AO does not add contact shadow in isolation; it
removes ambient light everywhere, so buying the contact ratio buys a darker room.

**That converts the default look into the photographic one.** The two looks differ precisely in how
much flat fill they carry, and this ratio is a direct consequence of that: more fill means shallower
contact shading. Forcing the default into the photographic band means removing the fill that defines
it, which is DEFAULT-GLOOM's trade (`.86`) — a decision the user owns and one this arc has respected
throughout.

### Verdict

**Withdrawn as a defect.** The app ships two looks; the photographic one is the realism target and it
is in band on every validated metric. The default look is deliberately brighter, and a shallower
contact shadow is what "brighter" means when the extra light is ambient. A look-gated AO (higher
intensity under the default look, to occlude its larger ambient term) is the principled form of the
fix and is recorded as an option — but it would change the out-of-box appearance of the app by
darkening every corner, for a metric only the photographic look is meant to satisfy.

Reverted; `AO.intensity` stays at 4.5. Nothing changed in `src/`.

### Where the arc stands

Every metric that survived scrutiny is now in band for the photographic look:

| metric | app | photographs |
| --- | --- | --- |
| ceiling / wall | 0.89–0.98 (four rooms) | 0.90–1.00 |
| shadowed ÷ lit floor | 0.720 | 0.579–0.725 |
| curtain ÷ room | 1.38 | 1.32–1.48 |
| untextured-surface grain | 0.62 | 0.76 / 1.49 (conservative by design) |

The open items that remain are ones this arc has established it cannot settle on its own: the window's
flat backdrop (`.209`, a product decision plus a tone-curve tension the user signed off), the
bathrooms (`.212`, no albedo-matched reference), and the default look's brightness trade (this round).

---

## `.214` — the curtain term does not work on the `performance` tier, and the IBL fallback is NOT why

Every number in this arc was measured at `medium`. Checking the shipped curtain translucency across
tiers finds one that does not hold:

| tier | curtain ÷ room |
| --- | --- |
| performance | **1.03** |
| medium | 1.38 |
| high | 1.49 |
| maximum | 1.45 |
| photographs | 1.32–1.48 |

Three of four are in band; `performance` is far below — and that is the tier the capability veto hands
most phones (`quality.ts:capabilityCeilingTier`), so the fix ships to desktop and misses mobile.

### The obvious cause was wrong

`.200`'s chunk reads `getIBLIrradiance(-N)` under `#ifdef USE_ENVMAP`, and `performance` has
`quality.ibl` false — so the term should collapse to the directional light alone, which is small for a
north-facing window. A hemisphere fallback looked like the fix: the hemisphere is the app's ambient
model at every tier.

**It changes nothing there.** Added as `#elif ( NUM_HEMI_LIGHTS > 0 )`, `performance` stayed at
**1.03**. Made unconditional as a diagnostic, it moved **medium 1.38 → 1.55** — so the term is live and
the hemisphere contributes — while `performance` stayed at **1.03 exactly**. The patched shader is
therefore not running at all on that tier, and the missing env map is not the reason.

Reverted both. The fallback fixes nothing and dead code that looks like a fix is worse than none.

### An editing trap worth recording

The GLSL lives inside a **template literal**, and the comment I added contained backticks around
`performance` and `.214`. They terminated the string; biome then reformatted the fragments into
expressions, and `tsc` reported *"Type 'Performance' has no call signatures"* — a message that points
at the global `Performance` object rather than at the real problem. **No backticks in the injected
GLSL**; the file now says so at the injection site.

### Where this leaves it

A real parity gap, cause undiagnosed, in a term shipped three rounds ago. The next step is to establish
whether the drapery material at `performance` is the patched instance at all — the material cache is
keyed on colour/roughness/pattern/weave/translucency but **not on tier**, and `customProgramCacheKey`
returns a tier-independent string, so a program compiled under one tier's defines is a candidate
explanation worth testing directly rather than reasoning about.

Nothing changed in `src/`.

---

## `.215` — `.214`'s diagnosis was wrong: the shader runs, the TIER has no range

`.214` concluded "the patched shader is not running at all on the `performance` tier". That is
**retracted**. Asking the renderer instead of the image (`drape-check.mjs`, new) settles it:

| | medium | performance |
| --- | --- | --- |
| drapery materials in scene | 2 | 2 |
| material type | MeshPhysicalMaterial | MeshPhysicalMaterial |
| `customProgramCacheKey` | `drape-translucency-4.000` | `drape-translucency-4.000` |
| `onBeforeCompile` present | yes | yes |
| compiled programs carrying the marker | 7 | **9** |
| `scene.environment` | true | false |

The patch compiles and runs on both. `.214` inferred absence from a null in the image, which is exactly
the inference this arc has been burned by repeatedly — and the diagnostic that *looked* decisive there
(an unconditional hemisphere term moving medium but not performance) has a simpler explanation, below.

### What is actually happening

The tier's problem is that it has no RANGE in a window-facing pose. Measured at the curtain probe's
pose, 3 m from the glass:

| tier | curtains | window plane | room |
| --- | --- | --- | --- |
| performance | open | 188.3 | 183.1 |
| performance | **drawn** | 188.6 | **183.1** |
| medium | open | — | 101.0 |
| medium | **drawn** | 96.5 | **69.9** |

**At `performance`, drawing every curtain in the room changes the room by 0.0 and the window plane by
0.3.** Curtain, glazing and the surrounding wall all sit at 183–188 — one flat, near-saturated field.
Any ratio taken against the room therefore collapses to ~1.0, which is precisely the 1.03 `.214`
reported. Adding irradiance to a surface already at 188 moves it barely, which is why the hemisphere
diagnostic looked inert there.

Note the same tier is unremarkable at the *light-distribution* pose (frame mean 118.8, `%<64` 9.19 %
against medium's 111.1 / 14.39 %). The failure is pose-specific: facing the window is where the tier
runs out of headroom.

### What this is really an instance of

`.163` already recorded that `performance` "cannot reach the `%<64` band at all" — it has no IBL, no
AO, and a fill scale that compensates for the missing environment light. This is the same limitation
seen from a different angle: the photographic look, which is defined by *removing* fill to create
range, has little range to work with on the tier that has no indirect lighting to remove.

So the curtain term is not broken on `performance`; the photographic look is thin there, and every
term measured against the room inherits that. Fixing it means giving that tier range — a tier-design
question about what `performance` should render, not a curtain fix — and it is worth stating plainly
that **the tier the capability veto hands most phones does not deliver the photographic look**.

Nothing changed in `src/`. `drape-check.mjs` added.

---

## `.216` — the photographic look is INERT on the `performance` tier

`.215` found the window-facing view at `performance` to be a flat near-saturated field that ignores the
curtains. Chasing the cause produced a much bigger and much simpler result.

Room luminance behind drawn curtains, photographic look on versus off:

| tier | look on | look off | change |
| --- | --- | --- | --- |
| medium | 69.9 | 149.6 | **−53 %** |
| performance | 183.0 | 181.1 | **−1 %** |

**On the tier the capability veto hands most phones, turning the photographic look on changes the room
by one percent.** Every realism change this arc has shipped — the fill rebalance, the whole-floor
bounce, the curtain translucency, the sensor grain, and the relief work `PHOTO_WEAVE` carries — is
gated behind that look. None of them reach those users in any meaningful degree.

### What it is not

Three plausible causes were tested and eliminated:

- **Not the shader patch.** `drape-check.mjs` shows the drapery material identical on both tiers, the
  `onBeforeCompile` hook present, and **9** compiled programs carrying its marker at `performance`
  against 7 at `medium` (`.215`).
- **Not the curtain attenuation.** `getWindowAttenuation()` and `windowFillAttenuation()` both read
  **0.413 on both tiers** — identical. The fill really is being attenuated there.
- **Not the sun.** If an unshadowed sun were flooding the room (`performance` has `shadowMapSize: 0`),
  night would collapse it. It barely moves: **183.0 at 13:00 against 163.7 at 22:00**, where `medium`
  swings 70.0 → 127.3 in the opposite direction as its lamps take over.

### What that leaves

`PHOTO_FILL_SCALE.performance` is **0.4** — a deeper cut than `medium`'s 0.735 — so the look should
change *more* there, not less. It changes almost nothing, and the room is largely decoupled from time
of day as well. Whatever is lighting the interior at `performance` is not the analytical fill that
`photographicFillScale` scales, and it is not the sun. That is the next thing to find, and it now has
a sharp question attached rather than a vague one.

This also reframes `.163`'s note that `performance` "cannot reach the `%<64` band". That was recorded
as a limitation of the tier's dynamic range. It is more specific and worse: the look barely engages at
all.

Nothing changed in `src/`.

---

## `.217` — RETRACTED: `.214`, `.215` and `.216` measured the orbit dollhouse

Three rounds of `performance`-tier findings are withdrawn. The frame those measurements came from is
not an interior at all — it is the **orbit dollhouse**, the whole flat seen from outside against a
pale background.

I looked at it only after building two explanations on top of it.

### What the state said, and what was drawn

Every check passed:

| check | value |
| --- | --- |
| `cameraMode` | `firstPerson` |
| `camera.position.y` | 1.60 |
| room containing the camera | `livingDining` |
| centre-ray hit distance | 2.55 m |
| HUD | walk-mode hint bar, minimap marker in LIVING/DINING |

And the rendered frame is the dollhouse, reproducibly, across separately captured runs. So on that
tier `window.__three.camera` — what `DevCameraExpose` publishes and every probe reasons about — is
**not the camera the renderer draws with**. The exposed camera really is standing in the living room;
the picture is of the building from thirty metres away.

### What that invalidates

- **`.214`** "the curtain term does not work on the `performance` tier" (1.03 vs 1.38–1.49) — the 1.03
  was measured on a dollhouse whose "room" is mostly background.
- **`.215`** "the tier has no range in a window-facing pose" (curtain/glazing/wall all 183–188) — that
  is the background, not a saturated interior.
- **`.216`** "the photographic look is INERT on the `performance` tier" (−1 % vs medium's −53 %) — the
  look barely changes a dollhouse of a flat seen from outside, which says nothing about walking
  through it.

`medium`, `high` and `maximum` frames were inspected and **are** interiors, so every number on those
tiers stands, including the shipped constants.

### Why the guards did not catch it

`.203` added an arrival check to `light-distribution.mjs` and this probe never got one; I added it this
round and **it passes** — because it interrogates the exposed camera, which is genuinely in the room.
A centre-ray distance test passes for the same reason (2.55 m on both tiers). An image-side
flat-background test was then tried and **does not fire either**: the dollhouse background is a soft
gradient, so only a few per cent of pixels sit within ±2 luma of the edge value.

So there is no automatic guard yet, and the probe now says so in a comment at the point where one
would go: **look at the frame before trusting a `performance` number from it.**

### The lesson, which this arc has now paid for four times

`.181` (a floor band that was furniture), `.193` (numbers taken through an onboarding scrim), `.202`
(three rooms measured from a corridor) and now this. Every one was a plausible number from a frame
nobody had looked at, and in every case a single glance settled in seconds what measurement could not.
**A number is not evidence until the frame it came from has been seen.**

Nothing changed in `src/`. Whether the `performance` walk view is genuinely broken in a real browser —
as opposed to in this headless probe — is now an open question worth its own investigation, and a more
serious one than anything `.214`–`.216` claimed.

---

## `.218` — the probe was launching software GL; the app was fine all along

`.217` retracted three rounds and left one question: is the `performance` walk view genuinely broken,
or was it the probe? It was the probe, and the cause is in its **launch configuration**.

`light-distribution.mjs` at `performance` renders a correct interior — window, curtains, sofa, console,
ceiling fan. Looking at that frame settled the app's innocence immediately. The two probes differed in
how they start Chrome:

| | `light-distribution.mjs` | `curtain-glow.mjs` (before) |
| --- | --- | --- |
| GL backend | `--use-angle=metal --enable-gpu` | **`--enable-unsafe-swiftshader`** (software) |
| headless | `true` | `'new'` |
| deviceScaleFactor | 2 | 1 |

Matching the launch config moved `performance` from **1.03 to 1.17** and the frame from the orbit
dollhouse to a proper interior with the drawn curtain, its weave, and the furniture. Two other
candidate fixes were tried first and are recorded as **not** the cause: waiting for `window.__walkLook`
before teleporting, and nudging a render immediately before the screenshot. Neither moved it.

### The real tier numbers

| tier | curtain ÷ room |
| --- | --- |
| performance | **1.17** |
| medium | 1.35 |
| high | 1.48 |
| maximum | 1.45 |
| photographs | 1.32–1.48 |

So `.214`'s original hypothesis was right in kind and wrong in magnitude: `performance` *is* below the
band, by **0.18**, not the 0.45 the artefact suggested — consistent with it having no IBL, so the
chunk's `getIBLIrradiance(-N)` term contributes nothing and only the directional light remains. Three
of four tiers are in band and the fourth renders a visibly backlit curtain.

### What to take from the whole `.214`–`.218` sequence

Four rounds, three retractions, one probe bug. The findings were wrong; the process that eventually
caught them was looking at a frame. Worth stating precisely what would have short-circuited it:
`curtain-glow.mjs` was written in `.198` with launch args copied from a different probe, and **no
frame from it had ever been inspected at any tier other than `medium`**. A single glance at a
`performance` frame on the day it was written would have saved four rounds.

The probe now carries the matched launch config with a comment explaining why, so the next probe
copied from it inherits the right one.

Nothing changed in `src/`.

---

## `.219` — probe audit: two more on software GL, and the shipped numbers survive

`.218` traced four rounds of wrong findings to one probe launching Chrome with
`--enable-unsafe-swiftshader`. That is a copy-paste defect, so the obvious question is which other
probes carry it. Two did:

| probe | GL backend before | load-bearing? |
| --- | --- | --- |
| `underside-shadow.mjs` | **software** | **yes** — the under/open metric behind `.196`'s AO retune and `.213` |
| `bounce-census.mjs` | software | no, a diagnostic |
| `curtain-glow.mjs` | software → fixed in `.218` | yes |
| `drape-check.mjs`, `ceiling-hit.mjs`, `light-distribution.mjs` | ANGLE/Metal | — |

All six now request the same backend.

### The shipped numbers survive

`underside-shadow.mjs` produced the contact-shadow figures this arc shipped `.196`'s AO values on, so
re-measuring them on the correct backend was the point of the round:

| | software GL (as shipped on) | ANGLE/Metal | photographs |
| --- | --- | --- | --- |
| photographic look | 0.720 | **0.712** | 0.579–0.725 |
| default look | 0.820 | **0.814** | — |

Both move by less than 0.01 and neither crosses a band edge. **`.196`'s AO retune and `.213`'s
conclusion stand**, and the metric is evidently insensitive to the GL backend — unlike the *camera*,
which is what `.218` was really about.

### And the frame check that `.218` said should be routine

Run at `performance`, the tier that exposed the problem, `underside-shadow.mjs` renders a **proper
interior walk view** — window, curtains, sofa, console, floor lamp — not a dollhouse. Its under/open
there is **0.721** against 0.712 at `medium`, so the contact metric is tier-stable as well as
backend-stable.

That is the whole audit: one load-bearing probe was on the wrong backend, its numbers were unaffected,
and its frames are correct at the tier that matters. The cheap check that `.218` cost four rounds to
learn now has a result for every probe in the set rather than for one.

Nothing changed in `src/`.

---

## `.220` — SHIPPED: the hemisphere fallback, now that the probe can see it

`.218` restored `curtain-glow.mjs` and gave the first valid `performance` number: **1.17** against a
1.32–1.48 band, while the other three tiers sat at 1.35–1.48. The cause was the one `.214` originally
guessed — `performance` has no IBL, so the chunk's `getIBLIrradiance(-N)` compiles out and the term
collapses to the directional light alone, which is small for a north-facing window.

`.214` built exactly this fix and measured nothing, because that probe was rendering the orbit
dollhouse. Re-applied against a working probe:

| tier | before | after |
| --- | --- | --- |
| performance | **1.17** | **1.42** |
| medium | 1.35 | 1.35 |
| high | 1.48 | 1.47 |
| maximum | 1.45 | 1.44 |
| photographs | | 1.32–1.48 |

**All four tiers are now in band.** The `#elif ( NUM_HEMI_LIGHTS > 0 )` fires only where `USE_ENVMAP`
is absent, so the tiers that have an env map are untouched — the 0.01 wobbles are run-to-run noise.
Night is unaffected at **1.03** (no glow), and the default look reads 1.07, which is expected: it is
not the realism target and its brighter room compresses the ratio.

The frame confirms it: at `performance` the drawn curtain is now bright, backlit and shows its weave,
matching the other tiers rather than reading as a dark sheet.

### Worth noting about the sequence

This is the fix `.214` proposed. It took `.215`, `.216`, `.217`, `.218` and `.219` to get an
instrument honest enough to show that it works — four retractions and a probe audit for a six-line
shader change. The idea was right the first time; the measurement was not, and there was no way to
tell which from inside the numbers.

---

## `.221` — tier-parity audit of everything shipped: three terms clean, one is not

`.220` closed the curtain's tier gap. The same check applied to every other term this arc shipped:

| metric | performance | medium | high | maximum | photographs |
| --- | --- | --- | --- | --- | --- |
| curtain ÷ room | 1.42 | 1.35 | 1.47 | 1.44 | 1.32–1.48 |
| ceiling ÷ wall | 0.91 | 0.95 | 0.96 | 0.95 | 0.90–1.00 |
| untextured grain | 0.64 | 0.61 | — | 0.53 | 0.76 / 1.49 |
| shadowed ÷ lit floor | 0.721 | 0.712 | **0.785** | **0.761** | 0.579–0.725 |

Three hold across the ladder. The contact shadow does not: `high` and `maximum` sit **outside the
band**, and — counter-intuitively — the two *highest* tiers have the *weakest* contact shading.

### Why, measured

| | AO off | AO on | AO contributes |
| --- | --- | --- | --- |
| medium | 0.998 | 0.712 | **0.286** |
| high | **0.912** | 0.786 | **0.126** |

Two separate effects, both against the higher tier:

- **Its AO buys less than half as much** (0.126 against 0.286), even though `aoFullRes` is false at
  `high`, so `<N8AO>` receives *identical* `quality` and `halfRes` props on both tiers. The AO pass is
  configured the same and lands differently.
- **Its no-AO baseline is already lower** (0.912 against 0.998), so something else is doing part of the
  work before AO runs.

The obvious candidate is the full post stack, which only `high` and `maximum` mount — Bloom, Vignette,
DoF, ChromaticAberration, SMAA — where `medium` runs the AO-only minimal composer. A pass that spreads
light spreads it into shadows, which is exactly the shape of "contact shading gets washed out". That is
a hypothesis, not a measurement: it has not been isolated, and `.181`/`.214` are recent enough reminders
of what an untested plausible mechanism is worth.

### Standing

The gap is modest (0.785 against a 0.725 ceiling — 0.06) and it affects the two tiers the adaptive
ladder does **not** hand most users: `medium` is what it settles on for typical browsers and
`performance` is the phone veto, and both are in band. Recorded rather than fixed, because the fix is a
per-tier AO or bloom retune and the cause is not yet isolated — the next step is to price the post
stack's individual passes against this metric the way `feature-price.mjs` does for frame cost.

Nothing changed in `src/`.

---

## `.222` — SHIPPED: the post stack costs 0.06 of contact shadow, and AO now compensates for it

`.221` found `high` and `maximum` outside the contact-shadow band and *suspected* the full post stack
without testing it. Tested:

| `high` | shadowed ÷ lit floor |
| --- | --- |
| full post stack (shipped) | **0.786** |
| `postprocessing: false` → AO-only composer | **0.726** |

The extra passes cost **0.06**, and that is the whole gap. `medium` runs the AO-only composer and sits
at 0.712, so the tiers were never differently *lit* — they were differently *post-processed*.

`AO.intensityPost` (7) compensates, passed as
`intensity={full ? AO.intensityPost : AO.intensity}` — keyed to the full stack rather than to a tier
name, so a tier that stops mounting it stops needing the compensation. Swept at `high`: 4.5 → 0.786,
6 → 0.742, 7 → in band, 7.5 → 0.702.

| tier | before | after | band |
| --- | --- | --- | --- |
| medium | 0.712 | 0.712 | 0.579–0.725 |
| high | **0.786** | **0.716** | ✓ |
| maximum | **0.761** | **0.691** | ✓ |

Free: `frame-time.mjs` reads high p90 10.1 ms and maximum 10.6 ms, both matching the documented
baselines — AO's cost is sample-count driven and intensity does not change it.

### A correction to `.221`'s table

That table listed `performance` at **0.721**, in band. It was measured with a **single pose** while
every other tier used the pooled eight, so it was never comparable. Pooled, `performance` reads
**0.827** — and the single-pose figures differ for every tier (medium reads 0.746 single against 0.712
pooled), so the mistake was mixing the two, not the tier.

`performance` being out of band is expected rather than a defect: it has `ao: false`, so it carries no
screen-space AO at all and leans on the RZ1 `ContactShadow` blob decals for grounding. Like the default
look's brightness (`.213`), that is a tier-design consequence, not something the photographic look can
fix.

So the honest tier table for this metric is now: **medium 0.712, high 0.716, maximum 0.691 — all in
band; performance 0.827, out of band by design.**

---

## `.223` — the blob decal's ceiling, and a documentation correction

`.222` left `performance` at **0.827**, outside the contact band, and attributed it to that tier having
`ao: false`. It does have the RZ1 `ContactShadow` blob decals, which exist precisely to ground furniture
where there is no screen-space AO — so the question is whether they can carry it.

### They contribute, and it is small

| `performance` | shadowed ÷ lit floor |
| --- | --- |
| decals off | 0.874 |
| decals on (shipped) | **0.827** |
| screen-space AO at `medium`, for scale | 0.998 → **0.712** |

The decals are worth **0.047**; AO is worth **0.286**, six times as much.

### And their ceiling is well short of the band

Sweeping the blob's opacity at `performance`:

| opacity | ratio |
| --- | --- |
| 0.5 (shipped) | 0.827 |
| 0.75 | 0.809 |
| **1.0** | **0.789** |
| photographs | 0.579–0.725 |

A **fully opaque** blob still lands 0.064 outside the band, and the returns are flattening. Widening
`scale` would darken the open floor too, which moves the ratio the wrong way. So the decal cannot bring
this tier into band, and nothing was changed — a painted radial gradient under a footprint is a
grounding cue, not a substitute for occlusion. This is its measured ceiling.

### A correction to `src/scene/CLAUDE.md`

That file described the decals as "tier-gate off where real AO runs". **They are not gated:**
`quality.contactShadows` is `true` on all four tiers, so `medium`, `high` and `maximum` render the
blobs *and* AO. Corrected in place, with the measurements above.

That also explains a number from `.222`: `medium` with `AO=0` read **0.998** — essentially no contact
darkening — even though the decals were active. At 0.047 they are simply below what that measurement
resolves once AO is removed.

Nothing changed in `src/`.

---

## `.224` — AO at `performance`: measured, and NOT shipped

`.223` showed the blob decal cannot bring `performance` into the contact band (0.789 even at full
opacity, against 0.579–0.725). The remaining lever is the one `src/scene/CLAUDE.md` retired:
screen-space AO on that tier. That note's own condition for re-opening is *"look at WALK mode close-ups,
not the phone dollhouse"* — which is exactly the evidence this arc now has.

### The measurement

| | `performance`, shadowed ÷ lit floor |
| --- | --- |
| shipped (no AO) | 0.827 |
| **AO on** | **0.709** (single-pose 0.654) |
| photographs | 0.579–0.725 |

**AO closes it.** Frame cost, `feature-price.mjs` at `performance`/DSF 2: p90 **4.8 → 5.4 ms**,
**+0.60 ms** against a 16.67 ms budget — the tier would still use under a third of it. The frame,
rendered through a probe whose pose is verified, is clean: a proper interior with visible contact
shading under the sofa and the console.

### Why it is not shipped anyway

**The tier exists for hardware I cannot measure.** `capabilityCeilingTier` sends software rasterisers,
phones, no-WebGL2 and <4-core devices here, and `src/scene/CLAUDE.md` says in terms that AO at
`performance` "cannot be honestly verified on an M4". AO is fill-rate bound; +0.6 ms on this machine
says very little about a low-end mobile GPU, and this is the tier whose whole purpose is to protect
that population. Changing its contract on the strength of a desktop measurement is exactly the call
that should not be made unilaterally.

Recorded with the numbers so the decision is informed rather than re-derived: **it costs 0.6 ms here
and it closes the gap.**

### Two probe notes

- **`feature-price.mjs`'s camera reset did not hold across these cases.** Its two arms came back at
  completely different poses — an orbit dollhouse against an interior close-up — so its
  `pixels>8=61.03% / meanAbsDiff=47.33` is a pose difference, not an AO measurement. That is precisely
  the trap its own header documents ("diffing stills taken from wherever the previous case's orbit
  ended reported 48–70% pixels changed for every feature"), recurring. The p90 timings are over 500
  frames each and are less affected, but should be read as indicative.
- **The large black rectangles in that arm's frame are a capture artefact, not AO.** The same
  configuration rendered through `underside-shadow.mjs` is clean.

`feature-price.mjs` gains an `ao ON` case, so pricing AO where a tier lacks it no longer needs an
ad-hoc edit. Nothing changed in `src/`.

---

## `.225` — CORRECTION: forcing AO on at `performance` renders black quads in orbit

`.224` reported that AO at `performance` closes the contact-shadow gap and that "the frame is clean".
**The second half of that is wrong, and I should have caught it there.** The frame I checked was
`underside-shadow.mjs`'s WALK capture. The ORBIT capture from the same configuration is badly broken.

Looking at the full `feature-price.mjs` frame rather than the crop: **large solid black quads**, some
inside the flat and several floating in empty background *outside* the building. Geometry cannot be
outside the building, so they are a shading failure, not a pose or content difference.

### It is specific to that configuration, not a shipped bug

`medium` ships `ao: true` and renders the same orbit dollhouse **completely clean** — no quads. So this
is not "orbit + AO is broken"; it is "forcing `ao: true` on a tier whose pipeline does not otherwise
mount it". `performance` has no IBL, no sun shadow map and the minimal composer, and N8AO evidently
needs something that combination does not supply — the likely candidates are the wall-reveal's
transparent faded planes and the `CeilingOccluder` (`colorWrite: false`, `opacity: 0`), both of which
orbit mounts and walk does not, and both of which a depth-based AO pass has to handle.

### What this does to `.224`'s conclusion

`.224` declined to ship AO at `performance` on a hardware argument — that the tier serves devices an M4
cannot stand in for. That argument stands, and now there is a second, harder one: **the configuration
does not render correctly in orbit at all.** Whatever the performance budget turns out to be on real
phone hardware, this would have to be diagnosed first. The measured benefit (0.827 → 0.709, into band)
is unchanged and still real in walk mode.

### And a correction to `.224`'s probe note

`.224` said `feature-price.mjs`'s camera reset "did not hold". Its ordering check reports baseline
against baseline-again at **0.00 % pixels / 0.00 meanAbsDiff** on both `performance` and `medium`, so
the reset demonstrably does hold between those two captures. The 61 % figure is the black quads plus,
possibly, a pose shift in that one case — unresolved, and not evidence of a broken reset. The probe was
accused of something it did not do.

Nothing changed in `src/`.

---

## `.226` — wall falloff: the photographic look is too steep, and the default look is right

A new axis, chosen because it satisfies the `.207` rule by construction: **how much darker is the wall
away from the window than the wall beside it?** Same paint, same frame, so composition and albedo both
cancel.

### The reference

Photo D has one flat peach wall running from the window deep into the room, measured at two independent
pairs:

| | near-window | far | far/near |
| --- | --- | --- | --- |
| photo D | 188 | 162 | **0.86** |
| photo D (2) | 195 | 165 | **0.85** |

A real room's far wall is only ~15 % darker than its near one. That is less falloff than intuition
suggests, and the reason is bounce: in a real room the far wall is lit by light that has already hit
the floor, the ceiling and the near walls. (Photo C's crops were contaminated — a clock, cabinets and
ceiling downlights — and were discarded on inspection.)

### The app, measured the same way

Wall samples from the geometric mask, split by distance along the window's inward normal:

| | near-window | far | far/near |
| --- | --- | --- | --- |
| photographic look | 116.2 | 85.5 | **0.74** |
| default look | 164.9 | 140.9 | **0.85** |
| photo D | | | 0.85–0.86 |

**The default look matches the photograph exactly. The photographic look is too steep** — its far wall
falls to 0.74 where a real one holds 0.85.

That is the first metric in this arc where the *default* look is the accurate one and the photographic
look is not, and the mechanism is the same missing term this arc has circled since `.188`: the
photographic look creates its range by removing flat fill, and flat fill is the only thing holding the
far wall up, because the app has no inter-reflection to replace it. `PHOTO_GROUND_BOUNCE` cannot fix it
— the hemisphere's ground term lights every wall equally at half weight, with no distance dependence,
which is precisely what a real bounce does have.

So the ceiling deficit (`.188`), the flat window (`.209`) and now the over-steep wall falloff are three
faces of one absent feature. Recorded rather than chased: `.189`–`.195` established that nothing
cheaper than real GI reproduces its spatial structure, and this measurement is more evidence for that
conclusion rather than a new lever.

**One reference.** Photo D is the only image in the set with a single flat wall spanning near and far,
so 0.85–0.86 rests on two pairs from one photograph. Worth widening before anyone tunes against it.

Nothing changed in `src/`.

---

## `.227` — the wall-falloff reference could NOT be widened, and that is the finding

`.226` measured wall falloff at **0.85–0.86** from two pairs in a single photograph, and flagged that as
the weakness. `.186` and `.187` are what happens when a one- or two-image number hardens into a target,
so this round tried to widen it before anything is tuned against it. Three candidates, three failures —
each for a different, instructive reason.

| candidate | reading | why it does not count |
| --- | --- | --- |
| photo C (existing) | — | crops caught a clock, cabinets and ceiling downlights (`.226`) |
| ref 2029667 | **1.17** | crops clean on inspection, but the wall CHANGES ORIENTATION relative to the window along its run, so "further along" is not "further from the light" |
| ref 1643383 | **0.67** | correct wall and lighting direction, but the far crop catches a ceiling soffit and a cabinet edge |

The 2029667 case is the interesting one: both crops are genuinely clean flat wall, and the number is
still meaningless. Falloff needs a wall of **constant orientation** to the window; where the wall turns,
the measurement mixes distance with incidence angle and can even run backwards, which is exactly what
1.17 is.

### What this leaves

**`.226`'s 0.85–0.86 stands on one photograph and should be treated as provisional, not as a target.**
The app's readings against it — photographic look 0.74, default look 0.85 — keep their relative meaning
(the photographic look's falloff really is steeper than the default's, measured identically), but
"0.85 is what a real room does" is one image's worth of evidence.

The criterion for a usable reference is now explicit, which is the durable part: **an unobstructed wall
of constant orientation, spanning near and far from a single window, with nothing mounted on it.**
Three of four interior photographs failed it. That rarity is itself worth knowing — it is why this axis
has one data point and not five.

Nothing changed in `src/`.

---

## `.228` — multi-room visual verification of everything shipped, and `walk-tour` learns the photographic look

Four terms have shipped since the last whole-flat visual review (`PHOTO_GROUND_BOUNCE` 3,
`CURTAIN_TRANSLUCENCY` 4, the AO retune plus its post-stack compensation, and the sensor grain). The
repo's own rule is visual verification after any app change, so this is that pass: an 11-room, 44-frame
`walk-tour.mjs` at `medium`/13:00.

**It passes.** 44 frames, every room reached, 83 % mean content, 354 visible meshes, no empty frames.
Reviewing six rooms: no artefacts, no missing walls, no black quads, consistent colour. Three of the
poses (kitchen, bath 1, corridor) face blank walls, which is a tour-pose limitation rather than a render
one.

### And a capability gap worth closing

Every frame this tour has ever shot was the **default** look — the tour had no way to enable the
photographic one, so the look this arc has tuned since `.162` had never been reviewed room by room.
`walk-tour.mjs` now takes `PHOTO=1`.

Running both and comparing:

| room | default sat / luma | photographic sat / luma | Δsat |
| --- | --- | --- | --- |
| living/dining | 0.105 / 162 | 0.086 / 111 | −0.019 |
| main bedroom | 0.162 / 188 | 0.095 / 104 | **−0.067** |
| bedroom 2 | 0.125 / 180 | 0.067 / 126 | **−0.058** |
| bath 1 | 0.196 / 188 | 0.184 / 119 | −0.012 |

**The photographic look does not merely darken — it desaturates, and unevenly.** The two bedrooms lose
three to five times more saturation than the living room or the bathroom.

That pattern has a cause, and it is by design: `fixturesLevel` fades the fixtures in a first-person
daylit view under the photographic look, and the bedrooms' warm content is largely their bedside lamps.
Remove them and what remains is cool daylight. The living room's warmth survives because it comes from
floor and furniture rather than lamps; the bathroom's saturation is tile colour, which no lighting change
touches.

So the bedrooms reading cool under the photographic look is the daytime fixture fade working, not a
colour-balance defect — a real bedroom at 13:00 does not have its bedside lamps on. Recorded because
"the photographic look makes bedrooms look cold" is exactly the kind of observation that would otherwise
get chased as a white-balance problem.

Nothing changed in `src/`.

---

## `.229` — a floor-gloss reference, and two more contaminants in the floor band

`.197` established that floor gloss has no single photographic value, using raw sd — which is dominated
by the lighting gradient. Measured as **micro-contrast** (high-pass against a 4 px blur, so the gradient
drops out), real floors are much tighter than that suggested:

| reference floor | micro/mean |
| --- | --- |
| photo D parquet (glossy) | 0.058 |
| photo D parquet (2) | 0.076 |
| photo C pale wood (matte) | 0.032 |
| kitchen ref tile | 0.076 |

**0.032–0.076 across gloss levels and materials** — a usable band, where `.197`'s raw-sd figures spanned
0.037–0.218.

### The app reads 0.335, and that is the band, not the floor

Looking at the floor band in the pitched-down frame settles it in one glance: it contains a **candle
group on a tray** and the **"Turn off ceiling light" HUD pill**. Neither is floor.

The pill matters beyond this measurement. `light-distribution.mjs`'s `hud()` excluded the toolbar, the
Measure button and the minimap — but **not** the walk-mode interaction pill or the hint bar, both of
which sit in the lower middle of the frame, squarely inside the floor band. So every floor ratio this
probe has printed since `.179` was averaging some DOM chrome.

Both rects are now excluded. The effect on the long-quoted number is small:

| | before | after |
| --- | --- | --- |
| floor ratio (band) | 1.15 | **1.13** |
| ceiling ratio | 0.96 | 0.95 |
| floor micro/mean | 0.335 | **0.224** |

**So no prior conclusion moves** — the floor ratio shifts by 0.02 and floor was demoted as a target in
`.188` anyway. But the fix is worth having, and the residual 0.224 is the decor, which cannot be masked
out of a screen rectangle.

### What to use instead

The **geometric** floor population (world-normal classified, `.205`) is the trustworthy one and is
already printed alongside. The band floor stays for continuity with the arc's earlier numbers, now with
its contamination documented at the point of use. Floor micro-contrast against the 0.032–0.076
reference will need the geometric mask, not a rectangle — a contiguous region is required for a
high-pass, and no rectangle in this pose is pure floor.

Nothing changed in `src/`.

---

## `.230` — the floor measured properly: a modest OVERSHOOT, and the board match outranks it

`.229` left floor micro-contrast unmeasurable from a screen rectangle, because no rectangle in the
pitched-down pose is pure floor. Fixed by certifying the region geometrically: raycast the pose,
classify every sample by world normal, then find the largest square whose samples are **all** floor and
measure inside that. The probe reports the square's world extent so its sampling density is visible.

| | micro/mean |
| --- | --- |
| app, photographic look | 0.121 |
| app, default look | **0.083** |
| photo D parquet | 0.058 / 0.076 |
| photo C pale wood | 0.032 |
| kitchen ref tile | 0.076 |

**Both looks sit above the reference band, not below it.** The default look is marginally over
(0.083 against a 0.076 top) and the photographic look is clearly over at 0.121.

### Resolution had to be matched first, and it mattered

The certified square is 0.72 × 0.83 m at **589 px/m**; the reference crops are nearer **300 px/m**. A
fixed 4 px high-pass reaches ~7 mm of floor at the app's density and ~13 mm at the photographs', so an
unmatched comparison measures the sampling. Downsampling to reference scale moves the app from 0.167 to
**0.121** (photographic) and 0.118 to **0.083** (default) — a third of the apparent excess was
resolution. The probe now prints both and labels which to compare.

### Why this is recorded and not acted on

The direction is consistent with intent: the photographic look raises surface micro-contrast, which is
what `.162` built it to do ("relief only becomes image contrast when something DIRECTIONAL shades its
two sides"). The floor simply carries more of that than a photograph does.

But the floor painters are not free parameters. SNV-BOARDS matched them against photographs of the
**physical Serangoon North Vista sample boards** the user supplied, JOINT-SCALE converts every joint
band to real millimetres, and `snvBoards.test.ts` pins the painter signatures. That is stronger ground
truth than a four-crop micro-contrast band from stock photographs of other people's floors. Retuning a
board-matched painter to hit 0.076 would trade verified physical fidelity for a statistic — the same
trade `.187` retracted for fabric.

Recorded as a bounded observation: **the app's floor grain reads about 1.1–1.6× a photograph's at
matched scale**, largest under the photographic look, and the reference is four crops.

Nothing changed in `src/`.

---

## `.231` — `PHOTO_FILL_SCALE` is not the lever for the two remaining deviations

Two measurements point the same way for the photographic look: its floor grain reads **1.6×** a
photograph's at matched scale (`.230`) and its wall falloff is **too steep** (0.74 against 0.85,
`.226`). Both are "too much contrast", and both would soften if the fill reduction were gentler — which
made `PHOTO_FILL_SCALE` the obvious suspect, especially since `.163` calibrated it against `%<64`, a
target `.207` has since retired as pose-bound.

Swept at `medium`, 0.735 → 0.85:

| | 0.735 (shipped) | 0.85 |
| --- | --- | --- |
| ceiling / wall | 0.88 | 0.89 |
| wall falloff | **0.74** | **0.74** |
| floor micro/mean (ref scale) | 0.121 | 0.116 |

**Nothing moves.** The falloff is identical to two decimals and the floor shifts by 0.005 for a 16 %
change in the fill. Hypothesis refuted.

### Why, and what it implies

`.216` censused the live lights: hemisphere **0.1**, ambient **0.03**, sun **1.0**, fixtures **36**
total. With the curtains open — which is the state this pose measures — the analytical fill that
`photographicFillScale` scales is a small share of what lights the room, so scaling it by 1.16× barely
registers. (The fill *is* dominant behind drawn curtains, which is where `.216` saw a −53 % swing; that
is a different state, not a contradiction.)

So neither remaining deviation is reachable from the fill knob:

- **Floor grain** is set by the floor painters' normal strength, and those are board-matched ground
  truth (SNV-BOARDS, `snvBoards.test.ts`). `.230` already declined to trade that for a four-crop
  statistic.
- **Wall falloff** needs inter-reflection, which `.189`–`.195` established nothing cheaper than real GI
  reproduces, and `.226` showed `PHOTO_GROUND_BOUNCE` cannot supply because the hemisphere's ground term
  has no distance dependence.

That is a reasonably complete answer for where the photographic look now stands: everything reachable
with the levers this codebase has is in band, and the two things outside it are held there by a
board-match and a missing feature respectively — neither of which a constant can fix.

Nothing changed in `src/`.

---

## `.232` — ceiling ÷ wall is pose-dependent, so the ceiling deficit is unproven

Every measurement in this arc has been taken in the default flat's living/dining. 19 plan templates
ship, so this round went looking for parity elsewhere — and found a methodology bug instead.

A `walk-tour` of `tpl-hdb-maisonette` (`PHOTO=1 FURNISH=1`, 28 frames, 12:53) showed the photographic
look holding on a second plan with no new artifacts. Measuring it was the problem:
`light-distribution.mjs` has no `PLAN` knob, so the substitute was the same plan's OTHER rooms via
`WINDOW=`, on the theory that a shallower room would show a different wall falloff.

**mainBedroom, canonical pitch −0.06:** far-wall samples **0** (the room is too shallow for the split),
and **ceiling / wall = 0.68** against the living/dining's 0.88 and the photographic band 0.90–1.00.

A ceiling deficit that deepens in a small room is physically plausible — a small room's ceiling is lit
proportionally more by bounce, and bounce is what's missing. But the ceiling in that frame is a grazing
sliver at the top of the image, only **223 samples**, concentrated in the darkest part of any ceiling:
the wall junction. So before believing it, the same room was re-shot pitched up.

| pose | mainBedroom | livingDining |
| --- | --- | --- |
| pitch −0.06 (canonical) | **0.68** (223 ceiling samples) | **0.88** |
| pitch +0.28 | **0.96** (1961 samples) | **0.95** (2296 samples) |

Both frames were inspected: broad, evenly-lit ceiling and upper wall, HUD masked, no junction band
dominating. The crops are clean.

### What this means

The small-room hypothesis is **refuted** — pitched up, the bedroom matches the living room to within
0.01. But the control refutes something larger: **ceiling ÷ wall moves 0.68 → 0.96 in one room, at one
hour, under one lighting state, from camera pitch alone.** `.206` adopted it as composition-independent;
it is not.

That matters because the ceiling deficit of `.188` — quoted since as one of the three faces of absent GI
(`.226`) — rests on this metric measured at the canonical downward pitch. At a pitch that samples the
ceiling broadly, both rooms sit **inside** the 0.90–1.00 photographic band.

This is not a claim that the deficit is imaginary. The two poses do not sample the same *wall*
population either: pitched up, the wall band is upper-wall only. Neither number is privileged. What is
established is narrower and sufficient:

> The app's ceiling ÷ wall cannot be quoted against photographs unless the app's pose and the
> photograph's are matched. Until that match is made, **the ceiling deficit is unproven** — the same
> error class `.207` corrected for `%<64`, on a metric adopted as its replacement.

**Open item (needs the reference set, not a code change):** re-derive the photographic band with the
approximate pitch of each source photograph recorded, then re-measure the app at the matching pitch.
Only then does a deficit — or its absence — mean anything.

Nothing changed in `src/`.

### Aside, logged not fixed

The `mainBedroom` frame shows the bed's headboard against the **window** wall with two wall sconces
floating over the glass. That is a placement result, not a look one — filed in `TODO.md`.

---

## `.233` — the ceiling ÷ wall band re-derived: most of the "deficit" was method, not render

`.232` left the ceiling deficit unproven and asked for one thing: re-derive the photographic band with
each source photograph's pose recorded. Doing that turned up two problems with the reference side and
one with the app side.

### The reference set does not survive inspection

Of `.206`'s four photographs, two survive in `/tmp`:

- **`ref-A_standard_living_room_i`** — its ceiling is **timber boarding** against plaster walls.
  Measured: ceiling 169.1, wall 200.6, **ratio 0.84**. That is an albedo measurement, not a light one —
  the exact confound this arc used to retire ceiling ÷ floor.
- **`ref-7_5_Wohnzimmer__Poliert_`** — a floor-focused shot with **no ceiling in frame at all**. It
  cannot have contributed a ceiling ÷ wall value; it is the floor reference.

So the 0.90–1.00 band cannot be reproduced from what remains of its own evidence.

### Qualifying photographs are rare

Screened 9 daylit interiors from Wikimedia Commons (7 fetched this round) against explicit criteria,
which future rounds should reuse:

1. ceiling and wall the **same plaster paint** — no timber, coffered, or contrast-coloured ceiling;
2. daylit, no dominant artificial ceiling wash;
3. enough clean ceiling to crop away from the junction;
4. not obviously **flash-lit or HDR-merged** — real-estate processing flattens exactly this ratio;
5. a real photograph, not AI stock (Commons now carries a lot of the latter under generic titles).

Rejected: timber/vaulted ceilings (2), white ceiling on coloured or cream walls (2), sepia/historical
(1), ceiling not croppable (2), heavy real-estate HDR (1). **One qualified** — `Home_Staging_Beispiel_
Nachher`, a low grazing-ceiling pose comparable to the probe's canonical one:

> ceiling 181.0, wall 176.5, **ratio 1.03**.

### The app side: method, not render

The probe's geometric mask takes **every** ceiling pixel, including the wall junction — the darkest part
of any ceiling. The photograph was hand-cropped clear of it. Cropping the app's canonical frame the same
way (two rod-free ceiling bands, two wall patches, all four inspected):

| | ceiling | wall | ratio |
| --- | --- | --- | --- |
| geometric mask (junction included) | — | — | **0.88** |
| hand-crop, junction excluded | 119.6 | 128.5 | **0.93** |

Same frame, same pose, same lighting. **Half the apparent deficit was the two methods disagreeing.**

### Where this leaves it

At matched pose and matched method: **app 0.93, photograph 1.03.** A deficit survives, and it is in the
direction absent inter-reflection predicts — but it is 0.10, not the 0.02–0.12 against a band that the
`0.88 vs 0.90–1.00` framing implied, and it rests on **n = 1**.

`light-distribution.mjs` now prints the number as a **diagnostic, not a target**, with both caveats
inline, so no future round quotes 0.88 against a band again.

**Still open:** widen the qualifying set. The criteria above are the bottleneck, not the measurement —
8 of 9 candidates failed them.

---

## `.234` — the ceiling deficit is retired

`.233` closed with one qualifying photograph and an open item: widen the set. This round screened ten
more (Wikimedia Commons category sweeps; Pexels returns 403 to a plain fetch, and title searches now
surface a lot of AI stock under generic descriptive names, so category listings were the usable route).

Screening was strict, and most candidates died on the same criteria as before: monochrome (1), timber or
sod interiors (2), ceiling not in frame (3), white ceiling against coloured walls (1), exterior-through-
window (1). Two got as far as measurement:

- **`3_Bedroom_2_Bath_home_in_Ada,_OK`** — **rejected at measurement.** Its ceiling is *vaulted*, so the
  ceiling plane catches window light far more directly than a flat one, and its walls carry a strong
  shadow gradient with no representative patch. First crops gave a nonsense 1.70. A sloped ceiling is
  not the geometry the metric is about.
- **`Living_room_(13152023964)`** — a Flickr upload, flat white ceiling, white walls, daylit from a
  side window, low pose. **Qualifies.** After two re-crops (the first wall crop caught the ceiling
  junction, the second the window head — both caught by looking at the crop):

  > ceiling 142.7, wall 157.2, **ratio 0.91**.

### The result

| | ceiling ÷ wall |
| --- | --- |
| `Home_Staging_Beispiel_Nachher` (`.233`) | 1.03 |
| `Living_room_(13152023964)` (`.234`) | 0.91 |
| **the app**, hand-cropped, canonical pose | **0.93** |

The app sits **inside** the spread of the qualifying references. Measured the same way the photographs
are measured, at a comparable pose, against photographs screened for the confounds, there is no ceiling
deficit to explain.

**`.188`'s ceiling deficit is retired as a claim.** It was, in the end, three artifacts stacked: a
reference band that included a timber ceiling, a probe method that swept in the wall junction the photo
crops excluded, and a pose that reduced the ceiling to a grazing sliver. `.226` called it one of three
faces of one absent feature; that list is now two — the flat window backdrop (`.209`) and the
over-steep wall falloff (`.226`), both still open, both still real.

### Follow-up this creates

`PHOTO_GROUND_BOUNCE` (shipped at 3) exists to lift the ceiling — three's hemisphere term gives the
ceiling the full `groundColor`. Its own measurements stand on their own, but the *motivation* for it was
the deficit now retired. Whether it is still earning its keep is a question for its own round, with its
own before/after; it is **not** being changed on the strength of this one.

Nothing changed in `src/`. `light-distribution.mjs`'s printed caveat now carries the two-photograph
spread and the retirement.

---

## `.235` — `PHOTO_GROUND_BOUNCE` re-justified under the corrected metric

`.234` retired the ceiling deficit and left one honest loose end: `PHOTO_GROUND_BOUNCE` was introduced
to *fix* that deficit. A constant whose motivation has been withdrawn should be re-earned or removed,
so this round tested it directly — `PHOTO_GROUND_BOUNCE` 3 (shipped) against 1 (`photographicGroundBounce`
returns 1 when the look is off, so 1 IS "no bounce"), everything else untouched.

| | bounce 3 (shipped) | bounce 1 (off) | reference |
| --- | --- | --- | --- |
| **ceiling ÷ wall, hand-cropped** (`.233` method) | **0.930** | **0.776** | **0.91 – 1.03** (2 photos) |
| ceiling ÷ wall, geometric mask | 0.88 | 0.70 | diagnostic only |
| wall falloff far/near | 0.74 | 0.73 | 0.85–0.86 |
| curtain plane ÷ room | 1.36 | 1.48 | 1.32–1.48 |

**The constant is re-justified, and on better evidence than it originally had.** Without it the ceiling
falls to 0.776 — far outside the qualifying photographs' spread and outside anything the old band would
have accepted either. With it, 0.930, near the middle. The visual check agrees: at bounce 1 the ceiling
reads as a dead grey slab; at 3 it reads as a lit surface.

That is worth stating plainly, because it inverts the tidy story `.234` might have implied. The deficit
`.188` measured was an artifact of method and pose — but the app WOULD have a real ceiling deficit
without this term. The term is not a correction for a measurement error; it is the thing keeping the
ceiling in band, and the retired deficit was measuring the residual *after* it.

Two secondary confirmations:

- The **coupling** documented at `CURTAIN_TRANSLUCENCY` is real and quantified: dropping the bounce
  darkens the room, and the curtain ratio — measured against the room — rises 1.36 → **1.48**, exactly
  the top edge of the photographic band. Retune both together or neither, as the note says.
- **Wall falloff is untouched** (0.74 → 0.73), which is the third independent confirmation that the
  hemisphere's ground term has no distance dependence and cannot address the falloff (`.226`, `.231`).

`src/scene/look.ts` was restored from `/tmp/look234.bak.ts` and verified: `PHOTO_GROUND_BOUNCE = 3`,
`git diff` on `src/` empty. Nothing changed in `src/`.

---

## `.236` — the window, measured across the day; and the falloff deviation is state-bound

A new axis: professional interior photography leans hard on **warm interior against cool exterior**,
and its signature case is the dusk shot. The app ships warm bulbs (`#ffd9a0` default) against cool
daylight, so the separation should exist — this round measured whether it does, and how the glazing
itself compares with photographs.

### The glazing never clips

| | glazing ÷ wall | glazing R−B | clipped |
| --- | --- | --- | --- |
| photograph, daylit (`Home_Staging`) | 1.10 | +20.2 | **39.3 %** |
| reference kitchen glazing (`.198` set) | — | — | **15.1 %** |
| app 13:00 | 1.32 | −4.1 | **0.0 %** |
| app 19:00 | 0.80 | +22.1 | **0.0 %** |
| app 21:00 | 0.28 | +5.7 | 0.0 % |

The *mean* ratio is not the problem — at noon the app's 1.32 beats the photograph's 1.10. The
**distribution** is: a real pane is a clipped white hole, the app's is an evenly-lit grey field. Filed
as open decision **(l) WINDOW-LUMINANCE** with the numbers; it is a render + product call and root
`CLAUDE.md` forbids deciding it unilaterally.

**Night is already right** — 21:00 puts the pane at 0.28 of the wall with the interior warm (R−B 23.4)
against a near-neutral pane. Any fix must not regress it.

**19:00 is the weak hour**: the pane is dimmer than the wall *and* tinted identically to it (R−B 22.1
vs 21.3) — zero separation at the hour the technique depends on. Partly honest physics (golden hour
lights sky and room from the same warm sun), but a sky both dimmer than the wall and the same colour
cannot read as sky.

### Incidental, and it matters: the wall falloff deviation is state-bound

The same three captures re-measured the wall falloff, which `.226`/`.231`/`.235` have treated as one of
the two remaining deviations:

| hour | far / near | vs photograph 0.85–0.86 |
| --- | --- | --- |
| 13:00 | **0.74** | too steep |
| 19:00 | **0.88** | in band (just above) |
| 21:00 | **1.20** | inverted — the far wall is BRIGHTER |

So "the app's wall falloff is too steep" is not a property of the app; it is a property of **the
strong single-window daylight state**. With the room lit by fixtures spread through it, the falloff is
right, and at night it inverts exactly as it should (light sources are interior, so the near-window
wall is the dark one).

That narrows the remaining GI deficit considerably. It is not that the app cannot distribute light with
distance — it is that a single bright window with no inter-reflection falls off faster than a real one.
The 0.85–0.86 reference is itself a single daylit photograph (`.227`), so the comparison was always
state-matched; what is new is knowing the deviation does not generalise.

Nothing changed in `src/`.

---

## `.237` — correcting `.236`'s window crop, and why a north window is warm at dusk

`.236` reported glazing figures from a rectangle covering the whole window. It never looked at that
crop. Looking at it now: the region is dominated by the window's **grilles**, and grilles are
interior-lit surfaces — so the "glazing" R−B was substantially the *interior's* light colour by
construction, compared against an interior-lit wall.

Re-measured on **pane interiors only**, four thin rects sampled between the bars (inspected, and they
still carry a sliver of bar at one edge — noted, not hidden):

| | `.236` (whole window) | `.237` (pane only) | wall |
| --- | --- | --- | --- |
| 13:00 lum / R−B | 163.8 / −4.1 | **171.3 / −3.9** | 124.2 / +1.4 |
| 19:00 lum / R−B | 160.0 / +22.1 | **170.4 / +21.0** | 199.4 / +21.3 |
| 21:00 lum / R−B | 54.6 / +5.7 | **75.6 / +12.0** | 193.4 / +23.4 |
| clipped, all hours | 0.0 % | **0.0 %** | — |

Corrected ratios: **1.38 / 0.85 / 0.39** (were 1.32 / 0.80 / 0.28). Open item **(l)** is updated.

**The conclusions hold.** Clipping is 0.0 % on pane-only pixels too, so the central finding — real panes
clip 15–39 %, the app's never clips — never depended on the bad crop. And the 19:00 warm/cool result
survives almost unchanged: the pane itself reads **+21.0** against a wall at **+21.3**. The grilles were
not what made it warm.

### So why is a NORTH-facing window warm at sunset?

Worth chasing, because it looked like a bug. It is not one:

- The default backdrop is **not** the preset path. `presetForDaylight` tints a whole painted preset by
  the sun's colour with no azimuth term — that *would* be the bug — but it only serves the photo
  backdrop kinds. The shipped `sky` kind goes through `bakeSkyEquirect` → `skyRadiance`, a **Perez**
  model with a real `gamma` term (angle between view and sun), so the anti-solar sky is genuinely
  cooler than the solar side.
- A walk camera looking out of a window is nearly **horizontal**, so it samples the horizon band, not
  the zenith. At a 2° sun the horizon is warm right around the compass, not only toward the sun — which
  is also true outdoors.

So the app is defensible here, and the honest statement of the dusk gap is narrower than `.236` put it:
not "the sky is tinted wrong", but "the pane is dimmer than the wall while sharing its colour, so it
reads as a lit surface rather than an opening" — which is the *same* deficiency as (l), not a second
one. `.236`'s framing of it as a separate finding is withdrawn.

Nothing changed in `src/`.

---

## `.238` — `.212` closed: ceiling ÷ wall cannot transport to a tiled room

`.212` parked the bathrooms because its one reference had **grey** tile against a white ceiling while the
app's is white — two albedo relationships, so the reference could not adjudicate. The screening method
built in `.233`–`.234` suggested a way to unpark it: find a bathroom photograph whose albedo relationship
matches the app's.

**It is not available.** Ten Commons bathrooms considered; two excluded on sight as SketchUp *renders*
rather than photographs (`Bad_-_Design_von_Architektin…`, `3D_bathroom`), and the eight fetched all
failed: monochrome (1), patterned or checkerboard tile (2), coloured or muralled walls (3), no ceiling
in frame (1), coffered spa ceiling (1). Zero qualified.

### But availability was never the real obstacle

Even a perfectly matched white-tile-on-white-ceiling photograph would not fix this. Glazed tile is
**glossy**: its apparent brightness depends on the angle between the camera, the surface and the light,
in a way matte paint does not. So the wall term in ceiling ÷ wall becomes view-dependent, and two
photographs of the same bathroom from two positions would disagree with each other.

`ceiling ÷ wall`'s domain is **matte-on-matte**. `.208` drew this boundary for floor ÷ wall and `.212`
drew it for tile-vs-paint; the general statement is that the metric isolates lighting only when both
surfaces are Lambertian and their albedos cancel. **`.212` is therefore closed on principle rather than
left waiting for a reference** — the reference cannot exist in a useful form.

### What the app actually does here, for the record

| pose | ceiling samples | ceiling ÷ wall |
| --- | --- | --- |
| bath1, canonical pitch −0.06 | **0** | — |
| bath1, pitch +0.28 | 731 | **0.70** |
| livingDining, pitch +0.28 (`.232`) | 2296 | 0.95 |
| mainBedroom, pitch +0.28 (`.232`) | 1961 | 0.96 |

Two things follow. First, **any bathroom ceiling figure in this arc came from a pose that barely sees
the ceiling** — bath1 clamps the standoff to 1.6 m and at the canonical pitch the ceiling leaves the
frame entirely, which is a sharper version of `.232`'s warning. Second, at a pose that does see it there
IS a real internal difference (0.70 against 0.95/0.96); it simply cannot be adjudicated against
photographs.

A plausible mechanism, offered as hypothesis and **not** tested here: a downlight throws light
downward, and the app's ceiling is lit mostly by the hemisphere's ground term, so a small room with a
small window puts little on its ceiling. That is defensible physics, which is exactly why it needs a
reference to refute — and cannot have one.

### One thing checked rather than assumed

The frame shows warm **beige** walls, which looked like it contradicted `.212`'s premise that the app's
bathroom is white tile. It does not: the first-load palette assigns `wall-tile-white`, and
`swatchHonesty.test.ts` pins any finish named "white" at swatch luma ≥ 190 with the suite green. The
window is `win-bath1-S` — **south-facing** — so at 13:00 the beige is direct warm sunlight on white
tile, not a mis-named finish.

Nothing changed in `src/`.

---

## `.239` — every target in this arc was calibrated at ONE tier, and they do not hold across the others

"Parity of the whole app" prompted a visual sweep of the photographic look at both extreme tiers —
`walk-tour PHOTO=1` at `performance` (44 frames, 13:38) and `maximum` (44 frames, 13:40). **Both are
artifact-free**: no black quads, no dropped walls, no missing geometry, and the look reads consistently
in every room. In particular the black-quad failure `.224`/`.225` saw for AO in the ORBIT camera does
not appear in walk at either tier.

But the two tours are not the same picture. Over the 44 shared poses:

> `performance` mean luminance **155.7**, `maximum` **138.6** — a **−17.1** shift, and up to **−43.7**
> on a single frame (`kitchen-y3`).

That is a deliberate consequence of tier-gated effects, not a bug. It does, however, raise a question
this arc never asked: **every reference band here was calibrated at `medium`.** So the canonical probe
was run at all four tiers, identical pose, identical hour.

| | performance | medium | high | maximum | reference |
| --- | --- | --- | --- | --- | --- |
| ceiling ÷ wall (hand-crop) | **1.080** | 0.930 | 0.948 | 0.934 | 0.91 – 1.03 |
| wall falloff far/near | **0.56** | 0.74 | 0.71 | 0.70 | 0.85 – 0.86 |
| floor micro/mean at ref scale | **0.0549** | 0.121 | 0.164 | 0.165 | 0.032 – 0.076 |

**Three findings, none of which the arc could have seen from `medium` alone.**

1. **Ceiling ÷ wall holds at medium/high/maximum** (0.930–0.948, all inside 0.91–1.03) and **fails at
   `performance`** (1.08, above the band). The `.234` conclusion — the app sits inside the qualifying
   photographs' spread — is a statement about three of four tiers.

2. **Wall falloff is worst at `performance`** (0.56 against a 0.85–0.86 reference) and roughly flat
   across the other three (0.70–0.74). The remaining GI deviation is therefore not one number; it is
   half again as large on the tier the capability veto hands most phones.

3. **The floor-grain overshoot is tier-dependent, and it inverts.** `.230` concluded the floor reads
   **1.6×** a photograph's micro-contrast and declined to retune a board-matched painter. That figure
   was medium's. At `performance` the floor is **0.0549 — inside** the real-floor band 0.032–0.076,
   while `high` and `maximum` sit at 0.164/0.165, more than double medium's deviation.

   **Caveat, and it matters:** being in band at `performance` may be *blur* rather than fidelity — lower
   texture resolution and coarser mips would suppress micro-contrast for reasons that have nothing to do
   with matching a real floor. I did not establish which; a crop I took to check this caught furniture
   and the HUD rather than the certified floor region, so it supports nothing and is not offered as
   evidence. **Untested hypothesis, recorded as such.**

### What this changes

No shipped constant changes on the strength of this. What changes is how conformance is stated: a claim
like "the app's ceiling ÷ wall is in band" or "the floor is 1.6× too grainy" is incomplete without a
tier, and the three rows above disagree with each other by more than the width of the reference bands
they are being compared to. Earlier rounds that quote a single number — `.230`, `.231`, `.234`, `.235`
— should be read as *medium* results.

`.220` did check the curtain ratio across all four tiers (1.35–1.48, all in band), so the practice
existed; it just was not applied to the rest of the set.

Nothing changed in `src/`.

---

## `.240` — the `performance` floor-grain result is NOT texture resolution

`.239` found the floor micro-contrast overshoot inverts by tier — `performance` **0.0549**, inside the
real-floor band, against medium 0.121 and high/maximum 0.164/0.165 — and recorded an untested
hypothesis: that `performance` is in band through *blur* rather than fidelity.

The code says that should be true. `effectivePatternSize` clamps to `BASE_SIZE`, and
`QualityController` sets `setProceduralBaseSize(tier === 'performance' ? 256 : 512)` — a quarter of the
texels per map. That is a textbook blur mechanism, and it would have been easy to write up as the
answer.

**It is not the answer.** Forcing `setProceduralBaseSize(512)` unconditionally and re-running
`performance`:

| | micro/mean at reference scale |
| --- | --- |
| `performance`, 256² (shipped) | 0.0549 |
| `performance`, forced 512² | **0.0520** |

No change — and slightly the *wrong* direction. Texture resolution does not explain it.
`QualityController.tsx` was restored from `/tmp/qc239.bak.tsx` and verified.

### Two confounds excluded while I was there

- **The certified floor region is identical at every tier** — 426×266 px, 0.72×0.83 m, 589 px/m at
  `performance`, `medium`, `high` and `maximum`. The cross-tier comparison is like-for-like.
- **`medium` reproduces exactly**: 0.1207 today against `.231`'s 0.1207. (The `586×366 px, 873 px/m`
  region quoted in earlier rounds belongs to an older probe revision — worth knowing before comparing
  any floor figure across the arc, but it does not affect `.239`, whose four numbers were all taken
  under today's probe.)

### A partial mechanism, and what it cannot explain

If the cause were shading rather than texturing, normal-mapped **walls** should drop at `performance`
too. Measured on the fixed `.233` wall patches, high-passed against a 3×3 box:

| tier | wall L | wall R |
| --- | --- | --- |
| performance | 0.0037 | **0.0025** |
| medium | 0.0040 | 0.0041 |
| high | 0.0066 | 0.0042 |
| maximum | 0.0066 | 0.0038 |

The walls **do** drop at `performance`, in the same direction — consistent with the tier having **no
IBL** (documented in `drapeTranslucency.ts` and `furnitureMaterials.ts`): a normal map perturbs
environment reflections strongly, and with only a hemisphere and a directional light it has much less
to modulate.

But the magnitudes do not match. The walls fall by roughly **1.4×**, the floor by **2.2×**. A
shading-wide effect is present and is part of the story; it cannot be the whole of it. Something
floor-specific remains — **named as the next hypothesis, not claimed as a finding.**

Nothing changed in `src/`.

---

## `.241` — the floor "micro-contrast" is mostly AO, and `.230`'s attribution was wrong

`.240` left a floor-specific residual: `performance` drops 2.2× on floor micro-contrast against 1.4× on
walls, and texture resolution was already refuted.

**First hypothesis, refuted.** If the driver were gloss × IBL — the floor being semi-gloss so an absent
environment map costs it more than matte plaster — then a matte floor should barely move across tiers.
Using the probe's `FLOOR=` knob:

| floor | performance | medium | drop |
| --- | --- | --- | --- |
| `floor-carpet` (matte) | 0.1652 | 0.3066 | **1.86×** |
| `floor-tile-marble` (glossy) | 0.0588 | 0.1368 | **2.33×** |
| `floor-vinyl-oak` (shipped default) | 0.0549 | 0.1207 | 2.20× |

Carpet drops nearly as much as marble. Gloss is not the discriminator.

**Second hypothesis, confirmed by intervention.** `EffectsImpl` gives `performance` the MINIMAL composer
— *"the view transform and nothing else"* — with **no AO**, while `medium` runs AO-only at
`AO.intensity` 4.5 and `high`/`maximum` run the full stack at `AO.intensityPost` 7. The four readings
order monotonically with AO dose, which is a dose-response curve. Testing it directly by setting
`AO.intensity` to 0.01 and re-running `medium`:

| | floor micro/mean at reference scale |
| --- | --- |
| `performance` — no AO | 0.0549 |
| **`medium` — AO forced to 0.01** | **0.0602** |
| `medium` — AO 4.5 (shipped) | 0.1207 |
| `high` / `maximum` — AO 7 | 0.164 / 0.165 |

Medium-without-AO lands next to performance-without-AO. **The metric this arc has called "floor
micro-contrast" is more than half ambient occlusion.**

### What this corrects

`.230` concluded the floor reads **1.6×** a photograph's micro-contrast, and declined to act because the
floor painters are board-matched ground truth (SNV-BOARDS) — *"retuning a board-matched painter to hit
0.076 would trade verified physical fidelity for a statistic"*. That reasoning was sound but aimed at
the wrong object: **the painters were never what the metric was measuring.** `.231` then swept
`PHOTO_FILL_SCALE` looking for the lever and found none, and `.239` read the tier inversion as possibly
"blur" — both are explained by this.

### And it turns the deviation from unfixable into a coupled trade

`.230` recorded that no lever was available. One is: **`AO.intensity`.** But it is not free, and it must
not be moved on this result alone — AO was tuned in `.222`/`.223` against the **shadowed ÷ lit floor**
ratio, where the shipped point reads 0.722 inside a 0.579–0.725 photographic band. So the shipped AO
satisfies one validated floor metric while pushing another out.

Note the comparison direction is the honest one: real photographs contain real ambient occlusion, so
app-**with**-AO against photo is the correct comparison, and 0.121–0.165 against 0.032–0.076 is a
genuine overshoot. The no-AO readings are diagnostic only.

**Next round, not this one:** sweep `AO.intensity` against *both* floor metrics together and find
whether a point exists that holds both bands — the same "retune both together or neither" discipline the
bounce/curtain pair needed (`.235`). Nothing is retuned here.

`src/scene/look.ts` restored from `/tmp/look240.bak.ts` and verified (`intensity: 4.5`, empty `src/`
diff). Nothing changed in `src/`.

---

## `.242` — the AO trade, swept: no point satisfies both floor metrics

`.241` established that the floor micro-contrast overshoot is mostly the AO pass, and that a lever
therefore exists — but that AO was tuned against a *different* floor metric. This round swept it, at
`medium`, measuring both bands (and a third that turned up on the way).

| AO radius / intensity | floor micro/mean<br>band 0.032–0.076 | under ÷ open<br>band 0.579–0.725 | open-floor sd/mean<br>glossy band 0.156–0.218 |
| --- | --- | --- | --- |
| 1.0 / **4.5 (shipped)** | 0.1207 ✗ | **0.712 ✓** | 0.293 ✗ |
| 1.0 / 3.0 | 0.0905 ✗ | 0.756 ✗ | 0.217 ✓ |
| 1.0 / 2.0 | **0.0743 ✓** | 0.785 ✗ | 0.173 ✓ |
| 1.0 / ~0 (`.241`) | 0.0602 ✓ | — | — |
| **0.4 / 6.5** | 0.1117 ✗ | 0.749 ✗ | 0.243 ✗ |

**No tested point satisfies both.** The two bands pull in opposite directions precisely *because* AO is
their shared cause: more AO deepens the contact shadow (helping under ÷ open) and simultaneously adds
broad floor variation (hurting micro-contrast). Getting floor micro into band needs intensity ≤ ~2.0;
holding under ÷ open needs ≥ ~4.5, since 3.0 already reads 0.756.

**The short-radius escape fails.** The idea was contact-only occlusion: a tight radius should darken
where surfaces meet without spraying variation across open floor. At 0.4 / 6.5 it is worse on **all
three** — 0.749 on the shadow ratio and 0.243 on floor variation. `.223` had already found a metre-scale
radius efficient; this is the other end of that curve, and it confirms the shipped choice from the
opposite direction.

### A third metric, and what the shipped point actually buys

`underside-shadow.mjs` also reports **open-floor sd/mean** against photographs at matte 0.037–0.051 and
glossy 0.156–0.218. The app's default floor is semi-gloss vinyl oak, so the glossy band applies — and at
shipped AO the app reads **0.293**, outside it; at 3.0 it would be 0.217, just inside.

So at the shipped point **two of three floor metrics are out of band and one is in**. That is not an
oversight, and it is the right call, but it should be stated explicitly rather than left implicit:

> The shipped AO protects **under ÷ open**, the one metric of the three with a *recorded visual defect*
> attached — `.183`'s underside defect, which `underside-shadow.mjs` prints as "a term that lifts this
> above ~0.73". The two it sacrifices are statistical. A measured picture defect outranks a statistic.

That is the same ordering `.187` used when it retracted a fabric retune, and `.230` when it refused to
trade a board-match for a number. **Nothing is retuned.**

`src/scene/look.ts` restored from `/tmp/look241.bak.ts` and verified (`aoRadius: 1.0`, `intensity: 4.5`,
empty `src/` diff).

### What would actually fix it

Not an AO constant. The two bands are only in conflict because one screen-space pass is doing two jobs —
contact occlusion and surface-scale shading. Real inter-reflection separates them, which puts this in the
same place as the wall falloff (`.226`, `.236`): reachable only by the feature this codebase has
repeatedly measured as too expensive, and not by a constant.

---

## `.243` — edge bevels: a real geometric difference with no visible signature at walk scale

Professional interior renderers ship a **rounded-edge** shader (Corona's `CoronaRoundEdges`, V-Ray's
`VRayEdgesTex`) on the reasoning that nothing in a real room has a mathematically sharp edge: every
manufactured edge carries a 1–3 mm radius, and that radius catches a highlight the eye reads as
"physical". Razor-sharp edges are a classic CG tell. This arc had never looked at it.

**The geometric fact is real.** Across `src/furniture`:

> **323 `<boxGeometry>` + 61 `new BoxGeometry` = 384 sharp boxes, against 9 `RoundedBoxGeometry`.**

A bevel facility does exist, but in the **GLB editor** (`glbEdit/editSpec.ts` — `ShapePart.bevel`, box →
`RoundedBoxGeometry`), i.e. for authored parts, not for the shipped primitives.

**The predicted visual signature is absent.** Luminance profiles across a table's top→side edge, seven
pixels wide, photograph against app:

| | profile across the edge | pre-edge rise | transition width |
| --- | --- | --- | --- |
| photograph (dark wood table) | 109 113 **117** 116 … 104 57 40 40 | +7 % | ~2 px |
| app (coffee table) | 70 70 … 68 74 **76** 71 59 51 46 | +8.5 % | ~4 px |

The app shows a *slightly larger* relative edge brightening than the photograph, and a *softer*
transition. There is no measurable bevel deficiency here.

### Why, and the scale argument that generalises it

The probe's certified floor region resolves **589 px/m**. A 2 mm edge radius is therefore **~1.2 px** at
floor distance in a 2560-wide capture — and less on anything further away. A bevel cannot produce a
highlight band it does not have the pixels to occupy.

So the honest conclusion is not "the app already does bevels" — it does not — but:

> **Rounded edges are a close-up technique.** They earn their cost in product and configurator renders,
> where an edge fills tens of pixels. At this app's walk camera, at room distances, the feature is
> sub-pixel and its absence is not a photorealism gap. That is presumably why the bevel support that
> exists lives in the GLB editor, which is exactly the close-up case.

**Evidence strength, stated plainly:** one edge in one photograph against one edge in one app frame, at
different materials, scales and angles. That is weak on its own; it is the **589 px/m scale argument**
that carries the conclusion, and the profiles are consistent with it rather than proof of it.

Nothing changed in `src/`.

---

## `.244` — the photographic look has no vignette on the tier most users get

Continuing the professional-technique checklist. `EffectsImpl.tsx` mounts a `Vignette` pass and its own
header explains why — *"subtle edge darkening so the frame reads 'shot, not rendered'"* — but it is
gated `if (full)`, i.e. the full post stack only. `medium` runs the AO-only minimal composer, so the
photographic look there gets the grain and not the lens.

The file argues the opposite case for the pass three lines below. PHOTO-GRAIN is deliberately in **both**
composer modes: *"`medium` … is the tier the adaptive ladder picks for most browsers, so a full-stack-only
grain would miss them."*

Measured across the `.239` captures (identical pose, so content cancels):

| corner ÷ centre | top-left | bottom-left |
| --- | --- | --- |
| performance | 0.868 | 0.738 |
| medium | 0.894 | 0.751 |
| high | 0.693 | 0.575 |
| maximum | 0.696 | 0.579 |

A hard split at the composer boundary, worth ~0.20 of corner ratio.

### Built, measured, reverted

`VIGNETTE = { offset: 0.32, darkness: 0.55 }` hoisted into `look.ts` so the two call sites cannot drift,
and the mount changed to `full || photographicLook`. Result at `medium`: **0.726 / 0.605**, just short of
`high`'s 0.693 / 0.575 — the residual being `high`'s heavier `AO.intensityPost`. So the pass behaves
exactly as it does on the tier that already ships it, and the frame reads more photographic.

**It was reverted anyway**, because it costs a validated metric:

> **wall falloff far/near 0.74 → 0.66**, against a photographic reference of **0.85–0.86**.
> (ceiling ÷ wall also 0.88 → 0.86.)

The far-wall band sits near the frame edge in the canonical pose, so the darkening lands squarely on it.
And the reference photograph carries whatever vignette its own lens had — 0.85–0.86 is already a
vignette-inclusive number, so this is a stylistic gain paid for with a real regression against it.

By this arc's own ordering, a *measured* result outranks a stylistic argument, and there is no measured
picture defect on the other side of the trade — only that the app looks more photographic to me, which is
exactly the kind of claim `.183` and `.230` refused to act on unsupported. Filed as open decision
**(m) PHOTO-VIGNETTE** with the numbers; it is a look call and changes shipped appearance, so it is not
mine to take.

Two facts for whoever decides: the photographic look is **opt-in** (`ui.photographicLook` defaults off),
and **every `medium` + photographic number in this arc was measured without the vignette**, so adopting it
re-bases them.

`src/scene/EffectsImpl.tsx` and `src/scene/look.ts` restored from `/tmp/eff243.bak.tsx` and
`/tmp/look243.bak.ts`; `git diff` on `src/` empty, `tsc` clean. Nothing changed in `src/`.

---

## `.245` — the GI diagnosis is now testable: the app's own path tracer runs headlessly

Since `.226` this arc has attributed the wall-falloff gap — 0.74 against a photographic 0.85–0.86 — to
absent inter-reflection, and reached that by **elimination**: `.189`–`.195` refuted the cheap stand-ins,
`.226` and `.235` showed the hemisphere ground term has no distance dependence, `.231` showed the fill
scale is not the lever. Elimination is weaker than demonstration, and the diagnosis has been load-bearing
for a dozen rounds.

It can be demonstrated. The app already owns a path tracer for HQ stills (`scene/pathtrace/
hqRenderSession.ts`, three-gpu-pathtracer), so the *same pose* can be rendered with real light transport
and its falloff measured. If the traced image reads ~0.85, GI is confirmed as the cause and the prize is
quantified. If it reads 0.74 too, the diagnosis is wrong and a dozen rounds need revisiting.

### First: is it even possible headlessly?

`hqRenderSession.ts` carries a **PT-BLANK-GUARD** — an abort for drivers that compile a context but
produce no pixels — which is precisely what a headless GPU tends to do. So this round built
`scripts/dev-probes/pt-feasibility.mjs` to answer only the go/no-go, on the same ANGLE/Metal launch the
other probes use.

**GO.** The modal opens from the store (`setHqRenderOpen(true)`), exposes `Full HD · 1920×1080`,
`256 samples`, `DoF off`, `Start render`; the render builds and accumulates:

> **47 samples in 97 s — ~0.5 samples/s at 1920×1080, real pixels, no blank-guard abort.**

256 samples would be ~9 minutes, but the experiment needs only a **band mean over thousands of pixels**,
where sampling noise averages out. ~40–60 samples is ample. So a traced falloff number costs ~2 minutes.

### The trap this probe walked straight into

The frame it produced is the **orbit dollhouse**, not a room interior — because the probe never enters
walk mode or poses the camera. That is exactly the failure `.218` found in three other probes, and it was
caught here the same way: by looking at the frame rather than trusting the log.

So the next step is deliberately *not* a standalone probe. `light-distribution.mjs` already owns ~180
lines of window-finding, standoff clamping and arrival-checked teleport; the traced capture belongs behind
a `PT=1` branch there, reusing all of it, so the raster and traced images are guaranteed to share a pose.
Duplicating that pose logic into a second probe is how it goes stale.

**Status: feasibility established, experiment not yet run.** The probe is committed as the instrument it
is, with the result and the dollhouse caveat in its header.

Nothing changed in `src/`.

---

## `.246` — a pose-matched path-traced still, and no trustworthy number from it yet

`.245` established the tracer runs headlessly. This round built the instrument and ran it.

**The instrument works.** `light-distribution.mjs` gained a `PT=1` branch, placed there rather than in a
standalone probe so it inherits the ~180 lines of window match, standoff clamp and arrival-checked
teleport — the pose must be identical in both images, and `.245`'s standalone attempt rendered the orbit
dollhouse for exactly that reason. Result: **49 samples in ~100 s**, and the still is unmistakably the
same walk pose as the raster frame — TV left, window centre, sofa right, fan overhead. The branch is
off by default and the raster path is unchanged (same run printed `far/near = 0.74`, identical to every
prior capture).

**No trustworthy measurement came out of it.** Three attempts, three contaminated crops, each caught by
looking:

| attempt | contamination |
| --- | --- |
| near/far wall bands | a pillar/corner shadow in the raster crop; a curtain edge in the traced crop |
| right-wall column profile | clean, but see below — wrong wall |
| ceiling ÷ wall hand-crop | the fan's downrod and a firefly smear in the traced ceiling crop |

The root problem is structural, not carelessness: the probe's falloff number comes from a **geometric
world-normal mask plus distance-from-window split** over thousands of samples, and that mask cannot be
applied to the tracer's canvas — there is no depth or normal readback for it. Hand-cropped bands are not
the same measurement, and a 49-sample image is dense with small features that make eyeball crops fragile.

**One observation worth keeping, offered as observation not measurement.** Column profiles across the
right wall, window-side → camera-side:

> raster 127 122 124 131 132 133 134 135 · traced 132 132 132 132 133 134 134 135

Both are essentially **flat** — the raster's dip at columns 2–3 is the corner shadow visible in the crop.
So the right wall is simply not where the falloff lives; the probe's 116 → 85 split draws on a much
larger wall population. That is useful for designing the next attempt rather than a result about GI.

**Next step, concrete:** render the still at the **viewport's 16:10 aspect** instead of 1920×1080. The
probe's original fixed *fractional* bands with HUD cutouts need no geometry at all, so at a matched aspect
they transfer to the traced image directly and both pictures get measured by identical code. The
resolution is a modal dropdown, so this is a probe change, not an app change.

**Status: instrument built and verified, GI diagnosis still untested.** It remains what it has been since
`.226` — a conclusion by elimination, now with a working way to test it that has not yet produced a
number I would stand behind.

---

## `.247` — the wall-falloff deviation is framing-dependent, and is withdrawn

The plan was `.246`'s next step: render the path-traced still at the viewport's aspect so both pictures
could be measured by identical code. Fixing the capture (`toDataURL` on the tracer canvas instead of an
element screenshot — `.246`'s screenshot let the modal footer bleed in, because an element screenshot
grabs the page region at that element's box) and switching the viewport to 16:9 worked. It also produced
something far more consequential than the GI test.

**The raster falloff changed with the viewport.** Isolated with a new `VH` knob so the aspect varies
without running the tracer at all, and run 800 → 720 → 800 to check reproducibility:

| viewport | near-window | far | far ÷ near |
| --- | --- | --- | --- |
| 1280×800 (16:10) | 116.2 (1377 samples) | 85.5 (346) | **0.74** |
| 1280×720 (16:9) | 115.3 (1238) | 107.2 (528) | **0.93** |
| 1280×800 again | 116.1 (1373) | 85.5 (346) | **0.74** |

Nothing else was touched — same tier, hour, window, pose, pitch. **0.19 of swing from aspect alone**,
which is more than *twice* the width of the 0.85–0.86 band it is compared against. And the direction
matters: at 16:9 the app reads **above** the band — too flat, not too steep. The app **brackets** the
reference depending on framing.

The mechanism is visible in the sample counts: the far bucket gains **182 samples** and its mean rises
**85.5 → 107.2**. A wider horizontal field admits different wall pixels, and the "far from window"
population is the one that changes most.

### This is `.232`'s error again, in the metric that replaced the others

`.226` adopted wall falloff on the reasoning that it is *"same material, same frame, so composition
cancels"*. Two surfaces in one frame do escape the frame-**mean** dependence `.201` hit on the curtain.
They do **not** escape depending on *which pixels are visible* — and that is framing. `.232` found exactly
this for ceiling ÷ wall (0.68 → 0.96 on pitch alone); `.239` found tier dependence; this is the third
member of the same family, and it lands on the metric the arc had left standing.

### What is withdrawn, and what survives

**Withdrawn:** the wall-falloff *deviation*. "The app's wall falloff is too steep at 0.74 against
0.85–0.86" is not established — the reference photograph's own aspect was never recorded (`.227` filed the
band as provisional from n=1), and the app spans 0.74–0.93 across two ordinary viewport shapes. The probe
now prints it as a diagnostic with the swing inline.

**Survives, untouched:** the *mechanism* arguments. Three's hemisphere ground term has no distance
dependence (`.226`, re-confirmed by intervention in `.235`); `.189`–`.195` refuted the cheap stand-ins on
their own measurements; `.231` showed the fill scale is not a lever. None of those rested on the falloff
number.

**But the GI diagnosis has lost its quantitative support.** Since `.226` the claim has been "the app's
light does not carry far enough into the room, and only inter-reflection fixes it". The evidence was this
metric. With the metric withdrawn, what remains is a mechanism story with no measured deficit attached —
and `.236` had already shown the number is state-bound (0.74 at 13:00, 0.88 at 19:00, 1.20 at 21:00),
which in hindsight was the first sign.

The path-traced instrument from `.246` still works and is still the right way to settle it; it now needs a
**framing-matched** target to be measured against, not just a matched pose. Two open questions the arc must
answer before it can claim a GI deficit again: what aspect the reference photograph was shot at, and
whether a framing-matched comparison shows any deficit at all.

Nothing changed in `src/`.

---

## `.249` — the wall-falloff metric never measured a wall

`.247` closed with two questions: what aspect the reference photograph was shot at, and whether a
framing-matched comparison shows any deficit. The first has an answer. The second turns out to be the
wrong question, because the app side was never measuring the surface it claimed to.

Runs 03:33–03:46 local (2026-09-02), probe server on `:5199` (`vite.probe.config.ts`), all figures
`medium` + photographic look + 13:00 + `livingDining` window + standoff 4.6 + pitch −0.06 + `walkFov` 50.

### The reference set's aspect distribution

Nine screened interior photographs survive on disk from the `.227`/`.233`/`.234` sweeps. Four further
`.jpg` files from the same sweeps are HTML or plain text — Pexels/Wikimedia fetch failures that were never
images — and are excluded here.

| file | pixels | aspect | role |
| --- | --- | --- | --- |
| `p233-Home_Staging_Beisp` | 1280×853 | 1.501 | `.233` ceiling qualifier, 1.03 |
| `ref-A_standard_living_room_i` | 1920×1279 | 1.501 | screened |
| `p233-ocean` | 1920×1280 | 1.500 | screened |
| `w-2029667` | 1600×1067 | 1.500 | `.227` falloff candidate, rejected (wall changes orientation) |
| `ref-7_5_Wohnzimmer` | 1200×803 | 1.494 | screened |
| `w-1643383` | 1600×1053 | 1.519 | `.227` falloff candidate, rejected (soffit in far crop) |
| `p233-Living_room_Irelan` | 1387×966 | 1.436 | `.234` ceiling qualifier, 0.91 |
| `p233-gibberd` | 1920×1440 | 1.333 | screened |
| `w-1866149` | 1600×1200 | 1.333 | screened |

**1.333–1.519, median 1.500, nothing above 1.52.** The mechanism is not a coincidence: 3:2 is the native
aspect of 35 mm and APS-C sensors and 4:3 of Four Thirds / compacts / phones, so interior photography lands
there by construction. **16:10 and 16:9 are display aspects. No camera shoots them** — and every app
falloff figure from `.226` to `.247` was taken at 1.60 or 1.78.

Caveat, stated because it matters: these are Wikimedia derivatives and may be crops of a differently-shaped
original, and **photo D itself — the falloff reference — is no longer on disk**. This is the screened set's
aspect distribution, not a measurement of photo D.

### The aspect curve, and that aspect is the only variable

`light-distribution.mjs` gained a **`VW`** knob (width at fixed height). `walkFov` is a *vertical* fov, so
height sets vertical world coverage and width sets horizontal — which means an aspect can be reached two
independent ways, and whether both give the same number is itself a test.

Sweep at `VH=800`:

| aspect | near-window (n) | far (n) | far / near |
| --- | --- | --- | --- |
| 1.200 | 116.9 (1142) | 70.6 (415) | 0.60 |
| 1.334 | 117.2 (1268) | 78.5 (353) | 0.67 |
| 1.430 | 114.8 (1378) | 71.8 (307) | 0.62 |
| **1.500** | 116.5 (1451) | 71.4 (286) | **0.61** |
| 1.600 | 116.2 (1378) | 85.6 (346) | 0.74 |
| 1.778 | 115.6 (1238) | 107.3 (529) | 0.93 |
| 2.000 | 117.1 (1082) | 114.4 (675) | 0.98 |

**0.38 of swing** — twice `.247`'s 0.19 — and **non-monotonic** (1.334 sits above both its neighbours).
1.600 → 0.74 (346) reproduces `.247`'s figure exactly, and 1.500 → 0.61 (286) reproduced on four separate
runs.

Two routes to one aspect, cross-checked:

| route | aspect | far / near | far n |
| --- | --- | --- | --- |
| 1280×853 (`VH`) | 1.500 | 0.61 | 286 |
| 1200×800 (`VW`) | 1.500 | 0.61 | 286 |
| 1280×960 (`VH`) | 1.333 | 0.66 | 353 |
| 1067×800 (`VW`) | 1.334 | 0.67 | 353 |

Identical sample counts and identical ratios. So the metric is a clean function of **aspect**, not of pixel
dimensions — the good news, and the thing that made the next step worth taking rather than guessing.

### What is actually in the buckets

Taken at face value the table says the app misses 0.85–0.86 at every camera aspect instead of bracketing
it. `OVERLAY=1` — new, paints every sample the falloff used onto the frame, green near / red far — says
why that reading is worthless. **The red dots are on the furniture.**

Tallied by geometry type + base colour (also new, printed every run), at aspect 1.500:

| bucket | population |
| --- | --- |
| near, `dWin ≤ 1.5` | `PlaneGeometry#f5f5f0` plaster 34 %, `BoxGeometry#bcd4e6` **window glazing 31 %**, `PlaneGeometry#b9b0a0` curtain 9 %, `#ffffff` 4 %, `#e6e7e4` 4 % |
| far, `dWin ≥ 3` | `ExtrudeGeometry#7a5c3c` **dark timber armchair backs 64 %**, `CylinderGeometry#f3e6c8` lampshade 21 %, `CylinderGeometry#2b2b2b` lamp pole 13 %, `BoxGeometry#f1efea` 1 %, **plaster 0 %** |

The classifier is `kind = 'wall'` iff `|n.y| < 0.3` — *any* near-vertical surface. A sideboard front, a TV,
a sofa back, a lampshade and a window pane all qualify. So the metric is
**(dark furniture near the camera) ÷ (the window glazing and the wall around it)**, and at every aspect a
camera shoots there is **no wall in the far bucket at all**.

At aspect 2.000 the far bucket becomes plaster 56 % / timber 24 % / lampshade 15 % / pole 5 %, because a
wide frame admits a column of the bright right wall — far mean 71.4 → 114.5, hence 0.98. So the aspect
dependence was never "which wall pixels are visible" (`.247`'s diagnosis); it is **how much furniture
versus wall** the frame admits, and the non-monotonicity is those two populations trading places.

### The method mismatch

Photo D's 0.85–0.86 came from **two hand crops of actual plaster** — 188 → 162 and 195 → 165 (`.226`). The
app's number is a screen-population mean dominated by armchairs. The two sides were never the same
measurement. This is `.233`'s lesson exactly — there, the app's geometric mask swept in a wall junction the
photo crop excluded, and half the apparent ceiling deficit was the two methods disagreeing — arriving on
the one axis the arc had left standing after `.247`.

### Retired

**The wall-falloff metric itself**, not just its deviation. `.226` justified it as "same material, same
frame, so composition cancels". `.247` killed *same frame*; this kills *same material*. It stays in the
output only as a regression tripwire between two builds at a byte-identical pose **and** viewport, printed
with the population tally and an explicit retirement so it cannot quietly become a target again.

**Survives.** The mechanism arguments (`.189`–`.195`, `.226`, `.231`, `.235`) — `.247` already recorded
that none rested on this number. `.226`'s *relative* finding that the photographic look sits lower than the
default at identical framing also survives; it is simply not a statement about walls. And `.234`'s ceiling
retirement survives, because it rests on a hand crop (0.93) and because the `'ceiling'` bucket is 92 %
ceiling plaster — clean.

**Newly suspect, for the next round.** The `'wall'` bucket that feeds the `ceiling/wall` diagnostic is
`plaster 49 % / glazing 14 % / timber 6 % / …` — contaminated, though far less than the far bucket, and the
0.92 it prints is therefore not a plaster reading either. The probe now prints that tally every run.
Re-deriving `ceiling/wall` over a plaster-only population is the obvious next step.

### What the GI question needs now

`.247` said the diagnosis had lost its quantitative support. This says the support was never evidence.

The falloff axis **cannot be repaired by matching framing**, because framing was the symptom. It needs a
**plaster-only, world-anchored** population: rays cast at fixed world points along one wall of constant
orientation to the window, at known distances from it, accepted only when every anchor is visible and every
hit is plaster. That is framing-invariant by construction — the population is defined in the world, not on
the screen — and it is the same measurement photo D got by hand, which is what would make the comparison
legal for the first time. `.246`'s traced still then becomes a decisive instrument rather than a blocked
one, because both pictures can be sampled at the same world anchors.

The `.227` criterion is unchanged and now applies to the app as well as to the photographs: **an
unobstructed wall of constant orientation, spanning near and far from a single window, with nothing mounted
on it.** `.227` rejected reference 2029667 for failing it. The app's own metric has been failing it since
`.226`.

Nothing changed in `src/` beyond the version bump.

---

## `.250` — the anchored wall metric, and the sign of the GI deficit

`.249` ended by specifying the replacement for the metric it retired: a plaster-only, world-anchored wall
population. This round builds it, validates the invariance claim by measurement rather than argument, and
gets a result that inverts the arc's diagnosis.

Runs 03:53–04:00 local (2026-09-02), probe server on `:5199`. Unless stated: `medium`, photographic look,
13:00, `livingDining` window, standoff 4.6, pitch −0.06, `walkFov` 50.

### Construction

`ANCHORS=1` in `light-distribution.mjs`, so it inherits the window match / standoff clamp / arrival-checked
teleport (`.245` learned what a standalone probe costs). For each `d` in 0.6…3.6 m along the window's
inward normal, at `y = 1.5 m`, shoot sideways to find the side wall. The anchor is accepted only if:

1. the surface is **vertical** (`|n.y| ≤ 0.3`);
2. its normal is **parallel to the window wall's run** — a wall of *constant orientation* relative to the
   window. This is `.227`'s criterion for a usable reference photograph, applied to the app for the first
   time. `.227` rejected reference 2029667 for failing it; `.249` showed the app's own metric had been
   failing it since `.226`;
3. a fixed **0.24 × 0.24 m** patch, sampled as **7×7 world points** on the wall plane, is *entirely*
   unoccluded (camera raycast distance matches the anchor's own distance to within 6 cm), on-screen, clear
   of the HUD rectangles, and one single geometry+colour signature.

Every rejection prints its cause and its counts (`occluded / offscreen / hud / mixed`), so a thinned
population is visible rather than silent.

**The first attempt rejected all 12 anchors** with `|n·n_win| = 0` — because it tested the side wall's
normal for *parallelism* to the window normal. A side wall runs *away* from the window, so its normal is
perpendicular to the window normal and parallel to the window wall's direction; 0 is the value a correct
side wall must have. Corrected and recorded in the code, because it is an easy inversion to repeat.

### Two knobs the round needed

**`LIGHTS=off`.** Every frame this arc has captured shows the walk HUD printing *"Turn off ceiling light"* —
i.e. the canonical pose stands under a lit fixture, and a daylit reference photograph has none. 19 of 87
items were on. Effect: frame mean 110.7 → 107.2, `%<64` 12.61 → 14.30 %, and on the measured wall
L(2.4) 132.4 → 131.1. Small, real, and now controllable instead of unknown.

**Anchor patches in `OVERLAY=1`** — cyan accepted, magenta rejected-but-surviving-points, so the patches
can be inspected on the frame.

### Framing invariance, measured

Photographic look, lights on, across exactly the aspect range over which `.249`'s screen-population metric
ran 0.61 → 0.98:

| aspect | L(1.2 m) | L(2.4 m) | L(3.0 m) | far/near, matched 1.2→2.4 |
| --- | --- | --- | --- | --- |
| 1.200 | 128.4 | 132.1 | offscreen | 1.029 |
| 1.500 | 128.6 | 132.4 | offscreen | 1.030 |
| 1.600 | 128.9 | 132.3 | offscreen | 1.026 |
| 1.778 | 128.7 | 132.2 | 134.8 | 1.027 |
| 2.000 | 128.6 | 132.2 | 134.9 | 1.028 |

Per-anchor luminance moves **0.4 %**; the matched ratio spans **1.026–1.030, spread 0.004**, against
**0.38** for the retired metric on the same sweep — about 90× tighter. Widening the aspect *adds* anchors
without moving the existing ones, which is the behaviour a world-defined population must have and the
screen-defined one could not.

### The result

Side B is the right wall, `PlaneGeometry#f5f5f0` plaster at every accepted anchor, span 1.65–1.70 m from
the room axis. Lights off, aspect 2.000:

| | L(1.2) | L(2.4) | L(3.0) | far/near over 1.8 m |
| --- | --- | --- | --- | --- |
| photographic look | 128.7 | 131.1 | 131.9 | **1.025** |
| default look | 132.0 | 134.6 | 135.3 | **1.025** |
| photo D (hand-cropped plaster, `.226`) | 188 → 162, 195 → 165 | | | **0.85–0.86** |

**A real wall falls about 15 % away from its window; the app's rises about 2.5 %.**

So a deficit is real and it is a GI signature — but **its sign is the opposite of what the arc has claimed
since `.226`**. The claim was that the app's light *does not carry far enough into the room*. The
measurement says it carries **too evenly**. The mechanism `.226` named was correct — *"the hemisphere ground
term lights every wall equally at half weight with no distance dependence"* — and the symptom was predicted
backwards from it. A distance-independent ambient fill does not make the far wall too dark. It makes the
whole wall too **flat**.

Every intervening round that reasoned "the far wall is too dark, GI would lift it" was reasoning from the
retired furniture metric. Nothing in `src/` was ever changed on that basis (`.226` was recorded, not
chased; `.189`–`.195`, `.231` and `.235` were all refutations), so no shipped behaviour rests on the
inverted sign — but the arc's stated diagnosis did, for 24 rounds.

### Correcting `.249`

`.249` recorded that `.226`'s *relative* finding survives — "measured identically, the photographic look's
falloff really is steeper" (0.74 against the default's 0.85). It does not. Anchored, both looks read
**1.025**. They differ in *level* — 128.7 against 132.0, the photographic look ~2.5 % darker on that wall —
and not at all in slope. That difference was furniture as well.

### Corroboration and a caught contaminant

`.246` eyeballed column profiles across this same right wall: raster `127 122 124 131 132 133 134 135`,
traced `132 132 132 132 133 134 134 135`. Flat, rising slightly, with the dip identified as a corner shadow.
It filed the observation as unusable because a hand crop is not the probe's measurement. It was right, and
it agrees with the anchored numbers to within a couple of counts — two independent methods on the same wall.

The contaminant, caught the way this arc always catches them. The first accepted **side A** anchor read
**L = 157.7** at signature `PlaneGeometry#ffffff`: **the TV screen**. Wall-mounted, vertical, correctly
oriented, unoccluded, and perfectly uniform across the whole 0.24 m patch — every per-patch test passed.
Only the overlay caught it. The probe now additionally requires **one signature along the run**, which is
`.233`'s "same plaster paint on both surfaces" rule applied lengthwise, and prints the material it measured.
Side A yields no profile at this pose; every published number is side B.

### Limits

One wall, one pose, one room, 2–3 anchors. `d = 0.6` is always occluded (the curtain and the window reveal),
`d = 1.8` straddles a pillar edge (14/49 mixed — visible in the overlay), `d ≥ 3.6` leaves the frame.

The material limit is on the reference side: **photo D's crop distances were never recorded.** So the
comparison is sign- and shape-matched but **not distance-matched** — the app rises where the photograph
falls, which no rescaling of distance can flip, but "15 % over how far" is unknown. Widening the reference
set under the `.233` criteria is the binding constraint again, and a qualifying photograph now also needs
its crop distances recorded, not just its aspect.

### What is now unblocked

`.246`'s path-traced still has a legal instrument for the first time. The anchors are **world points**, so
the tracer canvas can be sampled at exactly the same ones — the readback problem that defeated `.246`
(no depth or normal available on the tracer canvas) does not apply, because the anchor positions are known
before either picture is rendered and their screen projections are computed from the shared camera.

If the traced wall **falls** where the raster wall **rises**, GI is confirmed as the cause and the size of
the prize is finally quantified. That is the experiment `.245` set out to run.

Nothing changed in `src/` beyond the version bump.

---

## `.251` — the GI attribution is refuted by the app's own path tracer

`.250` built a world-anchored wall metric and noted what it unblocked: because the anchors are world points
chosen before either picture is rendered, the tracer canvas can be sampled at exactly the same ones. The
depth/normal readback problem that defeated `.246` does not arise. This is `.245`'s experiment, finally
runnable, and it comes back negative.

Runs 04:05–04:18 local (2026-09-02). `medium`, photographic look, 13:00, `livingDining`, standoff 4.6,
pitch −0.06, `walkFov` 50, walk viewport 16:9, tracer 1920×1080, `LIGHTS=off` (19 of 87 fixtures on).

### Three guards, because a shared projection is easy to get silently wrong

**Camera identity, checked numerically.** `PT=1` opens a modal and runs a tracer between the raster capture
and the anchor projection. If anything in that sequence nudged the camera, the anchors would be computed
for one pose and applied to a frame taken at another — and *looking would not catch it*, because the patches
would still land on plaster. So position, quaternion, fov and aspect are snapshotted at the raster capture
and compared.

The first run reported **drift**: `q.x` −0.272 against −0.030. That was my own guard, not the app —
the snapshot was being taken after the pitched-down floor capture, so it recorded `FLOOR_PITCH` (−0.55 rad)
rather than the frame's own −0.06. Moved to immediately after the raster shot; it now prints `YES` on every
run, and the reason is in the code, because a guard that cries wolf gets ignored and then a real drift walks
through it.

**Aspect match.** `camera.project` uses the camera aspect, so a shared projection is only valid if the two
pictures share a framing — the reason `PT=1` pins the walk viewport to 16:9 (`.247`). The probe prints both
aspects and refuses the comparison if they differ by more than 0.005.

**Looked at it.** The anchor patches are painted onto the traced still as well as the raster frame. They
land on the same plaster, in the same places, at the same sizes.

### The result

Side B, the right wall, `PlaneGeometry#f5f5f0` at every accepted anchor, 15×15 = 225 world samples per
0.24 × 0.24 m patch:

| | L(1.2) | L(2.4) | L(3.0) | far/near over 1.8 m |
| --- | --- | --- | --- | --- |
| raster | 128.4 | 131.2 | 131.7 | **1.026** |
| traced, 48 samples | 141.3 | 141.7 | 139.9 | **0.990** |
| traced, 101 samples | 132.1 | 133.3 | 132.6 | **1.004** |
| traced, 251 samples | 142.6 | 144.7 | 144.9 | **1.016** |
| photo D, hand-cropped plaster (`.226`) | | | | **0.85–0.86** |

**Real inter-reflection moves the ratio by about 0.02. The distance to the photograph is 0.17.** The traced
wall is flat, and visibly so — in the 251-sample still the right wall reads uniform from the window side to
the camera side.

So the wall-falloff gap is **not** absent inter-reflection. That attribution has been carried since `.226`,
reached by elimination (`.189`–`.195` refuted the cheap stand-ins, `.226`/`.235` showed the hemisphere ground
term has no distance dependence, `.231` ruled out the fill scale). `.245` said plainly that elimination is
weaker than demonstration and that the diagnosis had been load-bearing for a dozen rounds. Demonstration has
now been attempted, with the app's own renderer, and it refutes the attribution.

### Why the app's wall is flat, and why that is not a defect

The probe now prints the aperture alongside the falloff, because that turns out to be the governing fact:

> **the window is 2.45 m wide in a 3.45 m wall — 71 % of the end wall — in a 3.4 × 5.67 m room.**

The light source is essentially the entire end of the room. A 2.45 m aperture subtends a solid angle that
barely shrinks over the first 3 m of a 3.4 m-wide room, so a nearly flat wall is the **correct** answer for
this geometry — and the path tracer, computing real transport with no fill and no hemisphere shortcut,
independently arrives at it.

### The fourth confound, and the deepest

| round | the metric depends on | |
| --- | --- | --- |
| `.232` | **pose** | ceiling/wall 0.68 → 0.96 on pitch |
| `.233` | **method** | geometric mask 0.88 vs hand crop 0.93 |
| `.239` | **tier** | |
| `.247`/`.249` | **framing** | 0.60 → 0.98 on viewport aspect |
| **`.251`** | **scene** | 71 % aperture ⇒ flat is correct |

How much a wall falls off away from its window is a property of the **window-to-wall geometry** before it is
a property of the renderer. Photo D's room geometry was never recorded, and neither were its crop distances
(`.250`). So `0.74 vs 0.85` compared **two rooms as though they were two renderers**. No amount of pose,
method, tier or framing matching could have fixed that, which is why four rounds of matching kept finding
new artefacts instead of converging.

### `.245`'s convergence claim is falsified

`.245` reasoned that "a band MEAN over thousands of pixels averages sampling noise out, so ~40–60 samples
suffice — a traced falloff number costs ~2 minutes". A mean averages **noise**, not **bias**. The traced
absolute level on the same plaster patch reads **141.3 (48) → 132.1 (101) → 142.6 (251)** — an 8 % spread,
and not monotone, so it is not simple convergence either.

The **ratio** is much steadier — 0.990 / 1.004 / 1.016, spread 0.026 — because whatever moves the level
moves both anchors together. So:

- the traced instrument is usable for **ratios, quoted at ±0.02**;
- it is **not** usable for absolute levels without a convergence sweep;
- every traced figure must carry its sample count.

That also means `.246`'s single 49-sample capture, and this round's own 48-sample first pass, were never
safe to quote at face value. The ratio survives; the level does not.

### What survives, what dies

**Survives.** `.189`–`.195`, refuting the cheap GI stand-ins on their own measurements — independent of all
of this. `.226`/`.235`'s mechanical fact, that the hemisphere ground term has no distance dependence — still
true, simply no longer attached to a measured defect. Item **(l) WINDOW-LUMINANCE** — it rests on clipping
fraction and distribution shape, not on falloff, and is untouched.

**Dies.** The claim that the app has a wall-falloff deficit, and the claim that GI is what would fix it.
Both withdrawn. Nothing in `src/` was ever changed on either — `.226` was recorded rather than chased — so no
shipped behaviour is affected. But the arc's stated diagnosis was wrong in **population** (`.249`: the buckets
were furniture), in **sign** (`.250`: the app is too flat, not too steep) and in **mechanism** (`.251`: real GI
does not produce the photograph's falloff), and it took a world-anchored instrument plus the app's own path
tracer to establish that.

### Where the axis stands

The wall-falloff comparison may not be measurable across rooms at all. A qualifying reference photograph
would now need, cumulatively:

1. `.233`'s screen — same plaster on both surfaces, daylit, croppable clear of junctions, no flash/HDR, not
   AI stock;
2. `.227`'s wall — unobstructed, constant orientation, spanning near and far from a single window, nothing
   mounted on it;
3. `.250` — its **crop distances** recorded;
4. `.251` — its **window-to-wall aperture fraction** recorded.

Three of four photographs failed criterion 2 alone (`.227`). Adding 3 and 4 makes the screen demanding
enough that saying so is more useful than producing another n=1.

Nothing changed in `src/` beyond the version bump.

---

## `.252` — the path tracer is not a photograph-free reference

`.251` settled the GI question but left the reference problem standing: a photograph brings pose, method,
tier, framing, scene and crop-distance confounds, and the screen for a qualifying one is now so demanding
that `.251` said as much out loud. The tempting escape is that **the app's own path tracer needs no
photograph at all** — same scene, same pose, same world anchors, one rasterised and one path-traced, so a
difference is a rasteriser error with no confound left to explain it away. `.251` also showed traced
*levels* drift with sample count while *ratios* hold, so the instrument had to be a ratio **between
surfaces** rather than a level.

Built. Refuted. Runs 04:23–04:35 local (2026-09-02).

### Generalising the anchors, and a bug in `.250`

Ceiling (shoot up) and floor (shoot down) joined the two side walls, with the patch's in-plane basis derived
from the hit normal so one code path serves all three orientations.

That immediately exposed a bug in `.250`'s own visibility test. It offset each patch 2 cm off the surface
along the probe direction and then tested visibility by comparing the camera ray's hit **distance** against
the distance to the anchor, tolerance 6 cm. For a wall seen nearly head-on that works. For the ceiling and
floor, seen almost **edge-on** from eye height, 2 cm of *perpendicular* offset becomes **0.08–0.12 m along
the ray** — over tolerance — so every ceiling anchor reported `occluded 225/225` and side C produced nothing.

Fixed by removing the offset entirely (the camera ray never starts on the surface, so none is needed) and
testing **object identity plus 3-D proximity** instead. Consequences:

- previously published anchor values move by **≤ 0.5 %** (wall B d = 1.2: 128.9 → 129.4), so `.250` and
  `.251` stand unchanged;
- the fix also admits **d = 0.6 on wall B, which reads 108.0** against 129–132 further into the room. That
  patch sits in the **window-reveal / curtain shadow**, so including it turns a falloff measurement into a
  shadow measurement. Wall B's "near" anchor stays at 1.2 m, and the 0.6 m reading is reported separately.

### The comparison

251 samples, `medium`, photographic look, 13:00, standoff 4.6, pitch −0.06, 16:9, lights off, 15×15 = 225
world samples per 0.24 × 0.24 m patch. Camera identity verified `YES`; aspects matched.

| surface | material | raster | traced | raster / traced |
| --- | --- | --- | --- | --- |
| wall B plaster, d = 1.2 / 2.4 / 3.0 | `MeshStandardMaterial` rough 0.92 | 129.0 / 131.2 / 131.9 | 131.7 / 131.5 / 131.8 | **≤ 2 %** |
| ceiling, d = 0.6 / 1.2 / 1.8 | **`MeshLambertMaterial`** | 112.7 mean | 150.3 mean | **+33 %** |
| rug, d = 1.2 | `MeshPhysicalMaterial` rough 0.95 | 218.0 | 115.9 | **−47 %** |

As cross-surface ratios: wall B / ceiling raster 1.109 against traced 0.871 — **+27 %**; every pair
involving the floor off by roughly **−50 %**.

Taken at face value that is `.188`'s ceiling deficit resurrected — the raster's ceiling too dark relative to
its walls, now against a physically-based reference *in the same room*, immune to every confound that
retired it in `.234`.

### It is not. Looking killed it.

The traced ceiling **visibly reflects the window, the AC unit, the curtain rail and the ceiling fan** — a
specular reflection in plaster, with the window's rectangle plainly legible. The rasterised ceiling over the
identical crop is clean matte grey with a smooth gradient and no reflection whatsoever.

**The mechanism is exact.** The ceiling is `MeshLambertMaterial` — **14 meshes** — a legacy non-PBR material
that has **no `roughness` and no `metalness` field at all**. A PBR path tracer must interpret that, and
interprets absent roughness as **0**: a mirror.

The material census over the measured surfaces makes the pattern unambiguous:

| colour | geometry | material | roughness | agreement |
| --- | --- | --- | --- | --- |
| `f5f5f0` (wall plaster, ×99) | Plane | `MeshStandardMaterial` | 0.92 | ≤ 2 % |
| `ffffff` (×44) | Plane | `MeshStandardMaterial` | 0.85 | — |
| `fafafa` (ceiling, ×14) | Plane | **`MeshLambertMaterial`** | **none** | +33 % |
| `9c8f7a` (rug, ×1) | Box | `MeshPhysicalMaterial` | 0.95 | −47 % |

Every surface where the two renderers agree carries an explicit roughness on a `MeshStandardMaterial`. The
one that diverges upward has no roughness field. The rug diverges *downward* by a factor 1.9 despite a
roughness of 0.95, which roughness cannot explain — sheen or clearcoat interpretation is the suspect, it is
n = 1, and it is not resolved here.

### What that means for the instrument

**The path tracer is a valid reference only for surfaces whose material it interprets the same way the
rasteriser does.** A cross-surface ratio mixes material types by construction, so it measures
**material-interpretation mismatch, not light transport**. The instrument is off the table until the
mismatch is characterised per material type — and characterising it is a worthwhile round in itself, since
the answer is a per-material-type validity list for every future traced comparison.

### What it means for `.251`

It strengthens it. `.251`'s single measured surface — wall B plaster, `MeshStandardMaterial` roughness
0.92 — is exactly the case where the two renderers demonstrably agree to ≤ 2 %. Its conclusion that real
light transport also produces a flat wall therefore rests on the one surface class where the comparison is
legitimate. That was luck when it was published; it is now demonstrated, and the demonstration came from
the round that tried to extend the method and failed.

### A shipped defect, found incidentally

The HQ path-traced still is a **user-facing feature**, and it renders the ceiling as a mirror. Any user
producing an HQ still of this room gets the window reflected in the ceiling. Filed as open item
**(n) HQ-LAMBERT-CEILING** with two candidate fixes:

1. **HQ-scoped (recommended)** — substitute an equivalent `MeshStandardMaterial` (roughness ≈ 0.9) for every
   `MeshLambertMaterial` while building the tracer scene. Changes only the HQ path, so every raster
   measurement in this arc keeps its meaning.
2. **Scene-wide** — convert the 14 ceiling meshes in `src/`. More correct for plaster and fixes both paths,
   but Lambert and Standard shade differently in the raster too, so it changes shipped viewport appearance,
   re-bases every published ceiling figure, and costs a more expensive shader on a full-room surface at the
   `performance` tier.

Not fixed here: it is a `src` change to shipped appearance, and it deserves its own round with a
before/after HQ still.

Nothing changed in `src/` beyond the version bump.

---

## `.253` — fixing the tracer's mirror ceiling repairs the instrument, and the ceiling deficit returns

`.252` filed the HQ still's mirror ceiling as item (n) with two candidate fixes and did not take either.
This round builds the recommended one. The point worth stating up front: the fix is not only a product fix.
The mirror was the reason the cross-surface instrument had to be abandoned, so removing it is what makes
the second half of this section possible.

Runs 04:41–04:53 local (2026-09-02). `medium`, photographic look, 13:00, `livingDining`, standoff 4.6,
pitch −0.06, 16:9, `LIGHTS=off`, 15×15 = 225 world samples per 0.24 m patch, camera identity verified.

### Fix 1

`pbrStandInFor` in `hqRenderSession.ts` substitutes a matte `MeshStandardMaterial` for every
`MeshLambertMaterial` and `MeshPhongMaterial` **inside the tracer snapshot**, copying colour, maps, side,
transparency, emissive and vertex-colour state, setting `metalness: 0`, and setting roughness to 0.9 for
Lambert or mapping Phong's `shininess` monotonically back onto roughness so a deliberately shiny Phong
stays shinier than a matte one. Substitutes are cached one per source material and disposed on every
session exit path, since the live scene holds no reference to them.

Scoped to the snapshot on purpose. The live scene keeps its Lambert materials, so the rasterised viewport
cannot move, and every raster figure this arc has published keeps its meaning.

`MeshBasicMaterial` is deliberately **not** substituted. It is unlit by intent — window panes, screens, the
sky sphere — so giving it a PBR response would change what it is rather than correct how it is read. Whether
the tracer reads Basic correctly is a separate, unmeasured question.

**Verification.**

| | before (`.252`) | after (`.253`) |
| --- | --- | --- |
| traced ceiling, 3 anchors | 150.3 | **140.7** |
| traced ceiling reproducibility | 8 % drift across 48/101/251 (`.251`) | 140.2 @151, 140.7 @251 — **0.4 %** |
| raster anchors | 129.0 / 131.2 / 131.9 | 128.9 / 131.1 / 131.8 |
| the reflection | window rectangle, AC unit, curtain rail, ghost fan blade all legible | **none** |

Looked at, both times. The improved reproducibility is a bonus worth noting: a mirror surface converges
slowly and throws fireflies, so the artefact was itself a large part of the variance `.251` measured.

### Fix 2, answered by measurement rather than by argument

`.252` warned that converting the 14 ceiling meshes scene-wide would change viewport appearance and re-base
every published ceiling figure. `CEIL_STD=1` tests that directly, swapping the **live raster** ceiling to
Standard(0.9) with nothing else touched:

| raster ceiling (3 anchors) | frame mean | `%<64` |
| --- | --- | --- |
| `MeshLambertMaterial` (shipped) | 108.2 | 13.58 % |
| **113.0** | | |
| `MeshStandardMaterial` 0.9 | 108.2 | 13.58 % |
| **112.9** | | |

**0.09 % on the ceiling, nothing at all on the frame.** The re-basing worry was unfounded. Fix 2 is
therefore a **performance** question — Lambert is the cheaper shader and the ceiling is a full-room surface
at the `performance` tier — and it buys nothing visible now that fix 1 has repaired the path that was
broken. Recorded as: don't, absent a separate reason to unify materials.

### The instrument, repaired — and `.188` returns

`.252` had to abandon cross-surface raster-vs-traced ratios because they measured material-interpretation
mismatch. With Lambert substituted, the ceiling joins plaster on the valid list, and the comparison that
`.252` could not trust can now be run.

| pair | raster | traced | raster ÷ traced |
| --- | --- | --- | --- |
| wall A / wall B — **control** | 1.278 | 1.237 (251) · 1.245 (151) | **1.033 · 1.027** |
| **wall B / ceiling** | 1.115 · 1.109 | 0.938 (251) · 0.934 (151) | **1.189 · 1.186** |

Per-anchor, 251 samples: wall B raster 128.9 / 131.1 / 131.8 against traced 132.3 / 133.0 / 133.2 (≤ 2.6 %);
ceiling raster 100.7 / 114.5 / 121.1 against traced 142.8 / 137.0 / 142.4.

**The raster's ceiling is ~16 % too dark relative to its wall** (1 ÷ 1.187 = 0.842); the traced ceiling is
~25 % brighter in absolute terms.

`.234` retired `.188`'s ceiling deficit for a good reason: measured the way the photographs were measured,
the app's 0.93 sat inside their 0.91–1.03. `.251` then showed why that comparison could not have settled it
either way — ceiling brightness and wall falloff are properties of the window-to-wall geometry before they
are properties of the renderer, and photo D's geometry was never recorded. Against a physically-based
reference **in the same room**, the deficit is there.

Five controls, because a claim that reverses a retirement needs them:

1. **Same scene** — one camera, one set of world anchors, two renderers. None of the five confounds this
   arc has catalogued (`.232` pose, `.233` method, `.239` tier, `.247`/`.249` framing, `.251` scene) is
   available.
2. **A same-material control passes inside the same frame** — wall plaster, `MeshStandardMaterial` 0.92,
   agrees to ≤ 2.6 % per anchor and ~3 % on the wall A / wall B pair. So the traced picture is not
   uniformly offset; if it were, the walls would be offset too. This is the control that makes the ceiling
   number mean something.
3. **The material control passes** — the ceiling pair is raster-Lambert against traced-Standard, which
   looks cross-material, but the live-raster swap above moves the raster ceiling by 0.09 %.
4. **The artefact is removed** — `.252`'s +27 % contained a specular window reflection. +18.9 % survives
   its removal.
5. **Reproduced** at 151 and 251 samples, spread 0.003.

### This is the symptom `.226`'s mechanism actually produces

The ceiling receives almost no direct window light: the window sits below it and daylight enters going in
and down. So the ceiling is lit almost entirely by inter-reflection off the floor and walls — and
`.226`/`.235` established that the rasteriser's hemisphere ground term lights every surface equally at half
weight with **no distance dependence**, with `.189`–`.195` refuting the cheap stand-ins.

That mechanism has been correct since `.226`. What was wrong was the symptom attached to it: wall falloff
with distance, which `.251` refuted (real transport also produces a flat wall, because the aperture is 71 %
of the end wall). **The ceiling is the symptom absent inter-reflection actually produces**, and it is the
one `.188` guessed at first, three months and sixty rounds ago, without an instrument that could confirm it.

`PHOTO_GROUND_BOUNCE` (shipped at 3) exists precisely to lift the ceiling. `.234` retired its motivation
and explicitly parked the question of whether it still earns its keep. The motivation is back, and this
time with a target: **+16 % of ceiling relative to wall, measured against a physically-based reference in
the same scene.**

Filed as open item **(o) CEILING-BOUNCE**. Closing it means changing the fill/bounce model, which moves
shipped appearance on every tier and re-bases the `%<64` and region-ratio figures this arc is calibrated on
— so whether to close it is a call. Pricing it is a measurement, and it is the obvious next round: sweep
`PHOTO_GROUND_BOUNCE` and the hemisphere ground term against the new target and report what closes the
16 % and what it costs elsewhere.

### Still unexplained

The rug (`MeshPhysicalMaterial`, roughness 0.95) reads raster 218.0 against traced 105–116 — a factor ~2 in
the *other* direction, unaffected by this fix, n = 1. Roughness cannot explain it; sheen or clearcoat
interpretation is the suspect. Explicitly not claimed as anything.

The tracer's per-material validity list now stands at:

| material | valid as a reference? |
| --- | --- |
| `MeshStandardMaterial` | ✅ agrees ≤ 2.6 % |
| `MeshLambertMaterial` / `MeshPhongMaterial` | ✅ via the `.253` substitute |
| `MeshPhysicalMaterial` | ❌ factor ~2, unexplained |
| `MeshBasicMaterial` | untested (unlit by intent, not substituted) |

`src/` changed: `hqRenderSession.ts`, tracer snapshot only, plus three unit tests.

---

## `.254` — pricing the ceiling deficit, and two false negatives caught by a read-back

`.253` measured a ceiling deficit against the app's own path tracer and filed item (o) with a promise: sweep
the bounce term against the new target and report what closes it and what it costs. This is that round. The
deficit survives at a revised size, and the lever turns out to be the wrong shape for it.

Runs 04:59–05:15 local (2026-09-02). `medium`, photographic look, 13:00, `livingDining`, standoff 4.6,
pitch −0.06, `LIGHTS=off`, 15×15 = 225 world samples per 0.24 m patch.

### Two false negatives, and why assignment cannot work here

`GBOUNCE=<n>` re-scales `PHOTO_GROUND_BOUNCE` on the live scene, so a sweep point costs 20 s instead of an
edit-and-rebuild. `Lighting.tsx` applies the term as `hemi.groundColor *= photographicGroundBounce
(photographicLook)`, so scaling the live `groundColor` by `target / shipped` should be exactly equivalent to
shipping a different constant.

Applied by assignment, the sweep read **dead flat**: ceiling 113.4 and frame mean 108.2 at *every* value from
1 to 8. Twice — once with the patch applied before the pitch was set, once after, on the theory that
`setPitch` was re-triggering the lighting effect.

The post-capture read-back is what exposed it. It printed the **original** colour both times:

```
GBOUNCE=8  scale x2.6667  groundColor [1.25975,...] -> [3.35934,...]
GBOUNCE held at capture:                                [1.25975,...]
```

`Lighting.tsx` recomputes `groundColor` from the eased day/night curve **every frame**, not on state change,
so nothing written from outside survives to the next tick. Without that read-back this round would have
published *"`PHOTO_GROUND_BOUNCE` does nothing"* — flatly contradicting `look.ts`'s own recorded ×1/×3.5/×6.5
sweep, and a consequential false negative about a shipped term.

The method that works is to **intercept, not assign**: wrap `setRGB` on that one `Color` instance so every
per-frame write is scaled on its way in.

```
const orig = c.setRGB.bind(c)
c.setRGB = (r, g, b, ...rest) => orig(r * k, g * k, b * k, ...rest)
```

After that the knob bites hard — frame mean 99.3 at ×1 against 123.4 at ×8. **Never patch a light by
assignment in this app; and always read the patched value back after the capture, not before.**

### A second hazard: the anchor set was not stable

At `GBOUNCE=8` the `d = 1.2` ceiling anchor reported `BoxGeometry#6b4f34 span 0.76` — **a rotating fan
blade** — and clean plaster at the next sweep point. `.253`'s same-material rule rejected it correctly, so no
wrong number was produced, but an anchor set that changes between sweep points cannot be swept: the
ceiling mean would be over three anchors at one point and two at the next.

New `ANCHOR_OFF` shifts the ceiling/floor anchor line laterally off the room axis (the fan hangs on it).
At **−0.7 m** all three ceiling anchors read `PlaneGeometry#fafafa` on every run; at **+0.7 m** d = 1.8 still
catches a blade. Wall anchors are unaffected by construction — a sideways ray hits the same wall point
wherever along `perp` it starts — and the numbers confirm it: wall B reads **128.9 / 131.2** at both offsets.

This also revises `.253`. Its on-axis measurement had the unstable ceiling set *and* a wall mean that
included the d = 0.6 reveal-shadow anchor (108.0), which lowered the wall mean and so flattered the ratio in
the opposite direction. The fan-clear line is the trustworthy one.

### The sweep

Ceiling anchors 0.6 / 1.2 / 1.8 m, wall B 1.2 / 2.4 m, anchor line −0.7 m:

| `PHOTO_GROUND_BOUNCE` | groundColor.r | ceiling mean | wall mean | **C ÷ W** | frame mean | `%<64` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (off) | 0.420 | 92.5 | 120.2 | 0.770 | 99.3 | 18.47 % |
| 2 | 0.840 | 108.3 | 125.7 | 0.862 | 104.1 | 15.75 % |
| **3 (shipped)** | 1.260 | **120.4** | **130.4** | **0.923** | **108.2** | **13.57 %** |
| 4 | 1.680 | 129.9 | 134.7 | 0.964 | 111.8 | 12.21 % |
| 5 | 2.100 | 137.9 | 138.6 | 0.995 | 115.1 | 11.30 % |
| 6 | 2.519 | 144.3 | 142.2 | 1.015 | 118.0 | 10.63 % |
| 8 | 3.359 | 155.6 | 148.8 | 1.046 | 123.4 | 9.75 % |
| **traced target**, 252 samples | — | **139.7** | **132.65** | **1.053** | — | — |

Monotonic and smooth in every column, which is what a working knob looks like.

**Revised deficit: 12.3 %** (0.923 against 1.053), down from `.253`'s 16–19 %. Same sign, smaller magnitude.

*Self-consistency check worth recording:* the sweep ran at viewport aspect 1.60 and the traced target at
1.778 (`PT=1` pins 16:9 so the tracer and the walk camera share framing). Mixing them is only legitimate
because the anchored metric is framing-invariant — and it shows: raster ceiling 110.6 / 124.9 / 125.6 at 1.60
against 111.0 / 124.6 / 125.1 at 1.778, inside 0.5 %. `.250`'s invariance result earning its keep.

The traced overlay was inspected: all three ceiling patches sit well clear of the fan on clean traced
plaster, and `.253`'s mirror is still gone.

### The verdict

The target is reached at **`PHOTO_GROUND_BOUNCE` ≈ 8.5**, about 2.8× the shipped 3, and it costs:

- **frame mean +15 %** (108.2 → ~125);
- **`%<64` −4 points** (13.57 → ~9.5) — a real loss of the shadow depth calibrated across `.163`–`.168` and
  re-checked against four photographs in `.186`;
- **walls +14 %** (130.4 → 148.8 at ×8).

The term *does* favour down-facing normals: from ×3 to ×8 the ceiling gains **+29 %** against the walls'
**+14 %**. So there is real differential response, and it is why the ratio moves at all. But the efficiency
is about **1:1** — 13 % of ceiling-to-wall ratio for 14 % of overall brightness. A hemisphere ground term
lights everything with a downward normal component, which is most of a room.

`look.ts` recorded exactly this in `.195`, before any target existed to check it against: *"The wall RATIO
barely moves, but read that with care: the frame mean rises 17 % over the sweep, so the walls rise with it in
absolute terms … That is what a bounce does; it is not a targeted ceiling repair."* It is now measured
against a target, and the judgement holds.

**So: the deficit is real, and the cheap lever is the wrong shape.** Recommending against retuning
`PHOTO_GROUND_BOUNCE`, and recording the transfer function so the trade is explicit rather than
rediscovered a third time.

A targeted repair needs something that separates ceiling from wall, which a hemisphere cannot do by
construction. The candidates are a **ceiling-specific fill term** or **real single-bounce GI** — both
feature-sized, not tuning. Item (o) now carries the price and the recommendation; the remaining call is
whether 12.3 % on one surface is worth a feature-sized change to a look tuned over ~70 rounds.

Nothing changed in `src/` beyond the version bump.

---

## `.255` — CORRECTION: the tracer is lit by a different rig, and item (o) is withdrawn

This round set out to explain the one thing `.252`/`.253` left dangling: the rug's factor-2 raster-vs-traced
discrepancy, with `sheen` as the leading suspect. It found something upstream of materials that invalidates
my own last two rounds.

Runs 05:19–05:22 local (2026-09-02).

### The finding

`buildTracerScene` in `hqRenderSession.ts` snapshots the live scene and copies **only**
`DirectionalLight`, `PointLight` and `SpotLight`. `AmbientLight` and `HemisphereLight` are not copied, and
the environment becomes a hardcoded `GradientEquirectTexture` (top `0xbfd4e6`, bottom `0x5a5650`) whenever no
user HDRI is active.

The function's header explains, correctly, why the live PMREM probe environment cannot be ingested. What was
never measured is what dropping the two fill lights costs. At the pose every comparison in `.251`–`.254`
used — 13:00, `medium`, photographic look:

| light | intensity | copied? |
| --- | --- | --- |
| `AmbientLight` | 0.077 | **no** |
| `HemisphereLight` | 0.243 | **no** |
| `DirectionalLight` (sun) | 1.0 | yes |
| `PointLight` × 4 | 9 | yes — and `LIGHTS=off` zeroed them in every comparison |

*(A first census read `DirectionalLight` 0 and 19 point lights on, which looked like "the app has no sun".
It was taken at the default clock — 05:20, i.e. night. Re-run at the probe's actual state, the sun is 1.0.
Worth recording: a light census is meaningless without the hour it was taken at.)*

### Quantified

New `FILLOFF=1` zeroes exactly those two lights in the raster. `intensity` is a plain number that
`Lighting.tsx` rewrites every frame, so it has to be intercepted with a getter rather than assigned —
`.254`'s lesson, applied to a number instead of a Colour.

| | fill on (shipped) | fill zeroed | loss |
| --- | --- | --- | --- |
| ceiling mean, anchors 0.6 / 1.2 / 1.8 m | 120.2 | 37.7 | **−69 %** |
| wall B mean, anchors 1.2 / 2.4 m | 130.4 | 86.4 | **−34 %** |
| frame mean | 108.2 | 75.2 | −31 % |
| `%<64` | 13.56 % | 38.44 % | — |
| ceiling ÷ wall | 0.922 | 0.436 | — |

**The raster ceiling is 69 % lit by lights the path tracer does not have.** The traced ceiling is lit by a
gradient sky the raster does not have. They are not two renderings of one lighting setup; they are two
lighting setups.

### What is withdrawn

**`.253`'s ceiling deficit (+12.3 %) and `.254`'s target (C ÷ W = 1.053).** The gap was the difference
between `PHOTO_GROUND_BOUNCE`-scaled hemisphere fill and `GradientEquirectTexture(0xbfd4e6 → 0x5a5650)`, not
a measurement of absent inter-reflection. `.254`'s conclusion that the bounce term is "the wrong shape" also
goes, since it was defined relative to that target. `.188`'s ceiling deficit returns to **unproven** —
neither established (as `.253` said) nor retired (as `.234` said).

### The control that was not a control

`.253` listed five controls, and leaned hardest on this one: wall B agrees between the two renderers to
≤ 2.6 %, so *"the traced picture is not uniformly offset — if it were, the walls would be offset too."*

The wall is **also 34 % fill-lit**. Its agreement was a coincidence of level between two different rigs, and
I read it as evidence that the rigs were equivalent. It is the same species of error as `.226`'s "same
material, same frame, so composition cancels" — a plausible-sounding cancellation argument that was never
checked.

> **An agreement is not a control unless you know both sides share a mechanism.**

That belongs with the arc's other method rules. Five controls, and the load-bearing one was hollow, because
I never asked *what* was producing the agreement.

### What survives

- **`.251`'s refutation of the GI attribution for wall falloff.** Its weight is on the geometric argument —
  the window is 71 % of the end wall, so a broad source of any kind lights the first 3 m near-uniformly —
  and the traced still is real light transport through that aperture whatever its sky. The traced number
  is corroboration, not the load-bearing part.
- **`.252`'s conclusion that the tracer is not a photograph-free reference** — strengthened. The mismatch is
  not only materials but lights, and lights are upstream.
- **`.253`'s HQ mirror-ceiling fix** — untouched. That was a material-interpretation bug, confirmed by
  looking at the before/after crops, and it is still fixed and still shipped.
- **`.249`, `.250`, and `.254`'s sweep table** — pure raster measurements, unaffected.

### The tracer's validity list, honestly

`.252` produced a per-material validity list and `.253` extended it. Both are now void: the lighting
mismatch applies to every surface regardless of material, so the list is **nothing, at present**. Not
"Standard ✅, Physical ❌" — nothing, until (p) is fixed.

### The rug, honestly

Still unexplained, and `sheen` is no longer the leading suspect. The rug carries `sheen 0.4`,
`sheenRoughness 0.6`, `sheenColor bbb4a9` and a normal map, and the scene has 61 sheen, 37 anisotropy and 14
clearcoat `MeshPhysicalMaterial` surfaces — so the hypothesis was reasonable. But a factor-2 discrepancy sits
comfortably inside what a wholly different fill rig produces, so the material explanation is not needed and
nothing yet supports it.

### The new defect

Filed as **(p) HQ-FILL-RIG**. The shipped HQ still is not a higher-quality version of what the user sees; it
is a different lighting setup, missing two-thirds of the ceiling's light and a third of the walls', with a
fixed sky that cannot respond to the hour, the exposure grade, the photographic look, or
`PHOTO_GROUND_BOUNCE`.

The candidate fix is narrow and in the same family as (n): build the tracer's `GradientEquirectTexture` from
the live `HemisphereLight`'s own `color`/`groundColor`/`intensity` plus the `AmbientLight`, rather than from
two literals — a snapshot-only change, so the viewport cannot move. The judgement is the mapping (an
`AmbientLight` is not directionally a sky gradient), which is why it is filed rather than taken.

**It also blocks measurement**, which is the larger cost: fixing (p) would restore the most useful
instrument this arc has built and let `.188`'s ceiling deficit be settled either way. The cheap next
measurement, requiring no decision, is to render HQ stills at 13:00 and 21:00 and show how little the fill
changes while the viewport changes a great deal.

Nothing changed in `src/` beyond the version bump.

---

## `.256` — (p) proven by the hour test, and two more snapshot infidelities

`.255` withdrew item (o) on a code reading plus one `FILLOFF` intervention, and named the measurement that
would make **(p)** undeniable while requiring no decision from anyone: render HQ stills at two hours and see
what tracks between the renderers. It confirms (p), re-refutes `.253` by an independent route, hands the arc
its first genuine control, and — once I looked at the frames — turns up two further ways the tracer snapshot
is not the scene.

Runs 05:27–05:38 local (2026-09-02). `PT=1`, 152 samples per still, `medium`, photographic look, standoff
4.6, pitch −0.06, 16:9, world anchors at `ANCHOR_OFF −0.7`, lights **on** — the representative case, since
point lights *are* copied into the snapshot.

### The hour test

| | 13:00 | 21:00 | change |
| --- | --- | --- | --- |
| raster ceiling (3 anchors) | 120.1 | 180.3 | **+50 %** |
| traced ceiling | 140.8 | 152.7 | **+8 %** |
| raster wall B (2 anchors) | 130.6 | 179.6 | +38 % |
| traced wall B | 135.2 | 187.8 | +39 % |

| raster ÷ traced | 13:00 | 21:00 | swing |
| --- | --- | --- | --- |
| **wall B** — lit by point lights, **copied** | 0.965 | 0.956 | **−1 %** |
| **ceiling** — 69 % fill-lit (`.255`), **not copied** | 0.853 | 1.181 | **+38 %, sign inverts** |

Read the two rows together and (p) is not arguable. The surface whose light the snapshot *keeps* tracks
between the two renderers to within **1 %** across a day-to-night swing that moves it 38 %. The surface
whose light the snapshot *drops* swings 38 % in the ratio and changes sign. And the traced ceiling barely
registers the hour at all — **+8 %** against the raster's **+50 %** — because its light is a
`GradientEquirectTexture` with hardcoded colours that has no idea what time it is.

Visible as well as numeric: at 21:00 the traced ceiling carries a distinct cold blue cast from that fixed
daytime sky (`topColor 0xbfd4e6`) while the rasterised ceiling over the same crop is warm cream.

### It re-refutes `.253` from the opposite direction

`.253` claimed the raster ceiling was ~12–19 % too dark relative to its wall, and read that as the
inter-reflection deficit `.188` first guessed at. `.255` withdrew it from a code reading plus an
intervention.

**A genuine inter-reflection deficit cannot flip sign with the clock.** At 13:00 the traced ceiling is 17 %
brighter than the raster's; at 21:00 the raster's is 18 % brighter. Whatever that number measures, it is not
a property of the rasteriser's light transport. Two independent routes now agree, and they were reached
without touching each other's evidence.

### The arc's first real control

`.255`'s new rule was stated as a caution: *an agreement is not a control unless you know both sides share a
mechanism.* The wall row is that rule in its **positive** form. Wall B is lit substantially by the point
lights, which the snapshot copies, so the two pipelines *do* share a mechanism there — and they agree to
1 % across a large change. That is what licenses reading the ceiling's divergence as a real difference
rather than as ambiguity, and it is the kind of control `.253` thought it had and did not.

Worth keeping as a template: **the control and the measurement should differ in exactly one mechanism.**

### Then I looked at the frames

**Infidelity 2 — the HQ still's window is an opaque panel.** At native resolution, 21:00, same pose:

| | raster (viewport) | traced (HQ still) |
| --- | --- | --- |
| grille | ~20 vertical bars + horizontal rails, pale cream | **absent — only the cross mullion** |
| pane | near-black night sky | flat, *lighter* blue-grey |

A census of every transparent material in the scene found the cause immediately: the glazing is
`MeshPhysicalMaterial#bcd4e6` with **`opacity 0.22`** and **`transmission 0`**.

`opacity` is a rasteriser alpha-blend concept — the raster composites the pane over whatever is behind it,
so the grille bars and the night backdrop show through. A PBR path tracer has no alpha blend; it needs
**`transmission`** to see through a surface. At `transmission: 0` the pane is an opaque diffuse surface, so
it hides the grille and the sky and reads as a panel.

Filed as **(q) HQ-GLAZING-OPAQUE**. Note the connection to item **(l) WINDOW-LUMINANCE**, whose subject is
the window reading *"as a panel rather than an opening"* — in the HQ still it literally is one, and for a
completely different reason than (l) is about.

**Infidelity 3 — instanced geometry is dropped, and it matters less than I assumed.** `buildTracerScene`
skips `isInstancedMesh` outright: **17 instanced meshes, 231 instances**. My first inference was that these
*were* the missing grille bars. They are not. Hiding exactly the instanced meshes in the raster and diffing
changed **765 of 480 000 pixels — 0.16 %**. A real omission with small consequence, and the guess was killed
by a pixel diff before it reached a write-up. Cheap to fix (expand to per-instance clones); low priority.

**Flagged, not claimed.** 61 `MeshBasicMaterial` planes are transparent via opacity, **ten of them at
`opacity 0.00`** with `depthWrite: false` — fully invisible in the raster. Basic is copied to the snapshot
untouched (`.253` deliberately did not substitute it, since Basic is unlit by intent), and opacity is not
honoured, so ten invisible planes may be rendering as solid surfaces in the still. That is a plausible
explanation for the faint curved streaks visible across the traced ceiling, but I have not isolated it. A
hypothesis.

*(Small correction to my own reading along the way: the white speckles across the traced night pane are
path-tracer noise at 152 samples, not stars.)*

### Where the tracer stands as an instrument

Three independent infidelities, all in `buildTracerScene`, all fixable in the snapshot alone:

| # | infidelity | measured consequence | item |
| --- | --- | --- | --- |
| 1 | `AmbientLight` + `HemisphereLight` not copied; fixed gradient sky | ceiling 69 % of its light; ratio swings 38 % and inverts across the day | **(p)** |
| 2 | `opacity` transparency rendered opaque | window grille and night sky hidden; pane reads as a panel | **(q)** |
| 3 | `isInstancedMesh` skipped | 231 instances; 0.16 % of pixels | (q), noted |

`.252`'s per-material validity list stays void — these are all upstream of materials. The instrument is
clearly worth repairing: the hour test shows it agrees to **1 %** wherever the snapshot is faithful, which
is exactly the property a reference needs. But it is not usable for measurement until at least (p) and (q)
are fixed, and `.188`'s ceiling deficit stays unproven until then.

Nothing changed in `src/` beyond the version bump.

---

## `.257` — the snapshot fixes, built and measured: a real improvement, reverted anyway

`.255` filed (p) partly on the grounds that its mapping was "a real modelling choice". That deserved
re-examining, and it does not survive: a `HemisphereLight` **is** a gradient environment — sky colour above,
ground colour below — and an `AmbientLight` **is** a uniform one. That is precisely what a
`GradientEquirectTexture` expresses. So the mapping is nearer a definition than an approximation, and
`.256`'s hour test supplies a falsifiable success criterion: fix the rig and the ceiling should start
tracking the way the wall already does.

Built all four changes, measured against the `.256` baseline, looked at the frames, and reverted.

Runs 05:45–06:18 local (2026-09-02).

### What was built

All inside `buildTracerScene`, so the live scene and the rasterised viewport are untouched by construction:

1. **Fill derived from the live lights** — `top = Σ hemi.color·intensity + amb.color·intensity`,
   `bottom = Σ hemi.groundColor·intensity + amb.color·intensity`, in place of the two literals.
2. **`opacity` → `transmission`** for Standard/Physical at `opacity < 1, transmission 0`
   (`transmission = 1 − opacity`, `ior 1.5`).
3. **Compositing overlays excluded** — `transparent && depthWrite === false`, i.e. alpha-blended decoration
   that depends on a draw order a path tracer does not have. **61 planes skipped.**
4. **Instanced geometry expanded** to per-instance clones — **231 instances** that were being dropped.

A dev-only line confirms all four fired: `HQ snapshot: 231 instances expanded, 61 compositing overlays
skipped, fill from live lights`.

### The hour test, before and after

150 samples per still, `medium`, photographic look, 16:9, lights on, the same anchors as `.256`:

| raster ÷ traced | 13:00 | 21:00 | swing |
| --- | --- | --- | --- |
| ceiling — **before** | 0.853 | 1.181 | +38 % |
| ceiling — **after** | 0.825 | 1.022 | **+24 %** |
| wall — before | 0.965 | 0.956 | −1 % |
| wall — **after** | 0.927 | 0.927 | **0 %** |

Hour response of the traced picture:

| | before | after | raster |
| --- | --- | --- | --- |
| traced ceiling, 13:00 → 21:00 | +8 % | **+21 %** | +50 % |
| traced wall, 13:00 → 21:00 | +39 % | **+37 %** | +37 % |

The wall now matches the raster's hour response *exactly*, and its ratio is stable to the third decimal
across a day-to-night swing. The ceiling improved substantially but not enough.

### Two visible defects fixed

- **The window grille is back** — all ~20 bars, where `.256` found only the cross mullion. The transmission
  fix does exactly what it was meant to.
- **The 21:00 ceiling is warm cream instead of cold blue.** The fill mapping does too: the still is no
  longer lit by a hardcoded daytime sky.

### One visible regression, which is why it is reverted

With the glazing transmissive, the still now shows *through* it — to a **pale daylight-blue sky at 21:00**,
where the viewport shows a near-black night pane. An opaque panel traded for a daylit one.

**This is the round's most useful finding: (q) cannot be fixed in isolation.** Making the glass see-through
is necessary and correct, and it immediately raises a second question that was hidden while the pane was
opaque — *what should a refracted ray see?* The sky sphere is a `MeshBasicMaterial`, and the snapshot also
assigns `root.background` to the derived gradient, so which of the two wins is unresolved. Recorded on item
(q), because it changes what the decision is rather than just how to implement it.

### And it does not restore the instrument

24 % of ceiling swing survives, and the ratio still crosses unity between the two hours, so a ceiling
measurement remains untrustworthy. The residual is **energetic, not structural**: a
`GradientEquirectTexture` lights a surface by a cosine-weighted hemispherical integral, while three's
`HemisphereLight` uses a cheap `0.5 + 0.5·(n·up)` blend. Same shape, different energy — so the residual
concentrates on the ceiling, which faces straight down and is therefore the most orientation-sensitive
surface in the room. What (p) needs next is an **energy calibration with a measurable target (ceiling swing
→ 0)**, not a different mapping.

### A bug in my own implementation, recorded because the symptom lied

`MeshPhysicalMaterial.copy(source)` copies Physical-only *object* fields off the source —
`clearcoatNormalScale` is a `Vector2` — so copying from a plain `MeshStandardMaterial` throws
`Cannot read properties of undefined (reading 'x')`. The scene carries **seven** transparent Standard
materials beside the Physical glazing, so this killed every HQ render.

The symptom was a **ten-minute stall** ending in `PT: could not read a tracer canvas`, and my first reading
was that transmission had made tracing too expensive. It had not: with the copy fixed, the render reached
15/256 samples in ~20 s — the same rate as before any of this. **A stall is not evidence of cost.** The
right move was to capture the page error, which took one small probe and named the line immediately.

### Reverted, verified

`src/scene/pathtrace/hqRenderSession.ts` restored from a `cp` backup taken at the start of the round;
`git diff` on `src/` empty; `tsc` clean; full suite green.

### Where this leaves the two items

Both are better specified than when filed, and neither is a guess any more:

- **(p)** — mapping correct in shape, worth ~14 of the 38 points, makes the wall track exactly. Needs an
  energy calibration against a measurable target.
- **(q)** — fix works and restores the grille, but must be taken together with the backdrop question, which
  only became visible once the glass was transparent.

Nothing changed in `src/` beyond the version bump.

---

## `.258` — the window is a dynamic-range deficit, not a tone-mapping fight

Nine rounds went into the path tracer as an instrument; it now needs an energy calibration (`.257`) and a
backdrop decision, both blocked. This round deliberately leaves it alone, because the question below needs
only the rasteriser, and goes back to the strongest photographic result the arc owns — item (l)'s
**photographs blow their windows out (15–39 % of glazing pixels clipped, `.236`); the app clips 0.0 % at
every hour.**

Runs 06:25–06:29 local (2026-09-02).

### How professional interior renders actually get a blown window

Not with a post trick, and not by pushing a material. A daylit sky is roughly **2,000–15,000 cd/m²**; an
interior wall in the same room is roughly **50–300 cd/m²**. So the *scene* carries **~20–200:1** across the
glazing, and any exposure chosen to hold the interior at a mid-tone necessarily clips the window. The
blow-out is a consequence of physical range, and the view transform merely reveals it.

`.209` recorded the opposite reading — *"pushing the pane brighter fights the AgX view transform"* — and item
(l) has carried that framing ever since. It is testable: bypass the curve and look at what range the scene
has.

### The instrument

Two additions, both raster-only:

- **`LINEAR=1`** intercepts `gl.toneMapping` → `NoToneMapping` and `gl.toneMappingExposure`, with getters
  rather than assignment, because `Lighting.tsx` grades exposure every frame (`.254`'s lesson). Verified to
  bite: frame mean collapses 113.0 → 98.9 at exposure 1.0 and 9.4 at exposure 0.05, and the patched values
  are read back after the capture.
- **A glazing anchor** (side `W`) shooting back along the window normal, so the patch lands on the pane. It
  needed a **6 cm** patch and `ANCHOR_MINFRAC`: the window carries ~20 grille bars at ~12 cm pitch, so no
  patch large enough to measure fits wholly between them. Every point in the accepted population is already
  verified same-object, same-signature and unoccluded, so a partial patch is a *clean* population rather than
  a compromised one — which is exactly what `.237` did by hand when it sampled "pane interiors only, between
  the bars". The signature is confirmed as `BoxGeometry#bcd4e6` on every accepted anchor.

An 8-bit gotcha worth recording: at `LIN_EXPO=0.05` the wall read **v = 5**, where one code value is a 20 %
linear step. Quantisation, not signal. Re-run at exposure 1.0 the wall reads 98–116 and the glazing 168–170,
both well resolved and neither clipped.

### The measurement

13:00, photographic look, canonical pose, wall plaster anchors at 1.2 and 2.4 m:

| tier | wall (8-bit) | glazing (8-bit) | wall linear | glazing linear | **glazing : wall** |
| --- | --- | --- | --- | --- | --- |
| `medium` | 115.7 | 167.6 | 0.1736 | 0.3895 | **2.24 : 1** |
| `performance` | 98.2 | 169.9 | 0.1227 | 0.4015 | **3.27 : 1** |
| *physical daylight* | | | | | *~20–200 : 1* |

**The app's window carries 2.2–3.3× the wall where physics carries 20–200×.**

And the second half, which is the part that reframes the item:

| tier | linear ratio | ratio under the shipped curve | what the curve removes |
| --- | --- | --- | --- |
| `medium` | 2.24 : 1 | 2.06 : 1 | 8 % |
| `performance` | 3.27 : 1 | 2.88 : 1 | 12 % |

**The tone curve is doing almost nothing to the window.** It is not compressing a large range down to a
grey panel; there is no large range to compress. `.209`'s objection — that a brighter pane would be eaten by
AgX — is measurably not the binding constraint at these levels.

The 0.0 % clipping then needs no tone-mapping explanation at all: a pane at 2.2× the wall cannot clip while
the wall sits mid-grey, whatever curve is applied.

### Checks

**Robust to its one assumption.** The reading is sRGB-encoded (three's default output colour space) and is
decoded before ratioing. If the output were linear instead, the ratio would be **1.45:1** — *smaller*. The
conclusion does not depend on the decode, only its magnitude does.

**Cross-checked against a method 21 rounds older.** The tone-mapped 8-bit ratio at these anchors is
**1.389**. `.237` measured pane-only glazing ÷ wall at 13:00 as **1.38**, by hand-sampling between the bars
after `.236`'s whole-window rectangle was found to be dominated by grilles. Two entirely different methods
agreeing to 0.01 — which is the strongest validation the new glazing anchor could get.

**Looked at.** The linear frame is a coherent render, no artefacts, no error card — and the window in it is
still a **mid-grey panel, not a blown hole**. The defect survives removal of the curve, visibly, which is
the whole claim.

### Confounds, and which way they lean

This is a between-surface ratio, the family `.232`/`.233`/`.239`/`.247`/`.249`/`.251` spent ten rounds
demolishing, so it has to be justified rather than assumed:

| confound | status |
| --- | --- |
| framing | escaped — world anchors, invariant to viewport aspect (`.250`) |
| tier | stated: 2.24 (`medium`), 3.27 (`performance`) |
| pose | fixed world points, not screen bands |
| method | one method both sides, and cross-checked against `.237`'s independent one |
| **albedo** | **enters.** The wall is `#f5f5f0`, near-white, so its luminance sits at the *high* end of the plaster range |
| **scene** | **enters.** A 71 %-of-wall aperture (`.251`) brightens the wall further |

The last two both **raise the wall and so shrink the ratio**, which means they make the app look *better*
than it is. **The deficit is understated, not overstated** — the direction an honest claim should err in.

### What this changes

Item (l) is reframed, not decided. It has been filed as a product call about pane luminance versus the AgX
transform. The measurement says it is a **scene dynamic-range deficit with a quantified target**: the
backdrop needs roughly **10–100× more luminance relative to the interior**, and that is a
physical-correctness question before it is a look one.

The fix space is unchanged in kind — brighter backdrop, a bloom-carrying emissive pane, or a separate
exposure for the backdrop — but it now has a number attached, and the objection that AgX would eat it is
measurably not what stands in the way.

Still not decided here: it changes shipped appearance at every hour, and the **21:00 case `.236` recorded as
already correct must not regress** (glazing 0.39 of wall, interior warm at R−B 23.4 against a neutral pane).
A next round could price it exactly as `.254` priced the bounce term — sweep backdrop luminance and report
what reaches a photographic clipping fraction and what it costs at 19:00 and 21:00.

Nothing changed in `src/`.

---

## `.259` — pricing item (l): ≈×30 of exterior radiance, free in shadow depth

`.258` reframed (l) from a tone-mapping fight into a scene dynamic-range deficit and named the follow-up:
price it the way `.254` priced the bounce term. This round does that, and in the process corrects `.258`'s
own phrasing about the curve.

Runs 06:34–06:50 local (2026-09-02).

### Finding the lever took two wrong turns

**Wrong turn 1 — the sky dome.** `lighting/Sky.tsx` bakes a sky onto a `BackSide` sphere with a
`meshBasicMaterial`, so the dome's `color` is the obvious knob. The probe threw: *no sky dome found*. Checked
across modes rather than assumed:

| state | dome present? |
| --- | --- |
| walk, +4.5 s | no |
| walk, +16.5 s | no |
| **orbit, +8 s** | **yes** — radius 200, mapped `MeshBasicMaterial`, `BackSide` |
| walk again | no |

`Sky.tsx` computes `backdropActive = isPhotoBackdropActive(kind, cameraMode, hasCustom, proceduralSky)` and
returns `null` when it is set — and in walk mode it is. So the dome genuinely is not in the scene in the mode
this entire arc measures in.

**Wrong turn 2 — "the window has no exterior".** A raycast straight ahead through the glazing returns
**exactly one hit** (`BoxGeometry`, `MeshStandardMaterial#bcd4e6`, opacity 0.28, emissive `#cfe4f5` × 0.4)
and nothing beyond it. Read literally that says the window is a self-lit panel with nothing behind it, which
would have been a dramatic finding and is **wrong**. In walk mode the exterior is `scene.background` — a
`CanvasTexture` — which is not geometry and therefore cannot be raycast at all.

Checking the mechanism instead of publishing the raycast is what caught it. The right lever is the scalar
three provides for exactly this purpose: **`scene.backgroundIntensity`** (confirmed 1 at the shipped
setting, `background` a `CanvasTexture`, `backdrop = 'sky'`).

### A better glazing metric

`.236` measured clipping over a window **rectangle**; `.237` had to correct it because grilles dominate that
rectangle. This selects the population by **world-verified geometry+colour signature** from the existing
raycast grid, so it is pane interiors by construction — **n = 413** samples — and it reproduces this item's
headline exactly: **0.0 % clipped** at the shipped setting.

### The sweep

13:00, `medium`, photographic look, canonical pose, AgX, `backgroundIntensity` intercepted with a getter
(`.254`'s lesson) and read back after capture:

| ×  | glazing mean | **> 250** | > 240 | frame mean | `%<64` |
| --- | --- | --- | --- | --- | --- |
| **1 (shipped)** | 161.4 | **0.0 %** | 0.0 % | 113.0 | 11.85 % |
| 2 | 184.4 | 0.0 % | 0.0 % | 115.5 | 11.85 % |
| 4 | 206.6 | 0.0 % | 0.0 % | 117.9 | 11.85 % |
| 8 | 224.5 | 0.0 % | 0.0 % | 119.9 | 11.85 % |
| 16 | 237.2 | 0.0 % | 58.4 % | 121.3 | 11.85 % |
| 24 | 242.3 | 4.1 % | 82.6 % | 121.8 | 11.85 % |
| **32** | 245.3 | **39.7 %** | 90.3 % | 122.2 | 11.86 % |
| 64 | 250.2 | 86.2 % | 95.6 % | 122.7 | 11.85 % |
| *photographs (`.236`)* | | ***15–39 %*** | | | |

**≈×28–32 lands inside the photographic band.** Two features of the table matter as much as that number:

- **`%<64` is 11.85 % at every single point.** The lever costs *nothing* in shadow depth, because the
  background is not a light — it does not illuminate the room. `.254`'s ground bounce, by contrast, bought
  13 % of ceiling ratio for 14 % of overall brightness. This is the first lever this arc has priced that is
  close to free.
- **The response saturates**: each doubling adds less (161 → 184 → 207 → 225 → 237), which is the curve's
  shoulder and the subject of the correction below.

### Looked at

At ×32 the window is a blown white opening with the **grille bars silhouetted** against it. That is what a
daylit interior photograph looks like, and what this item describes as the target — *"a clipped white hole
with detail only at its edges"*. The interior is visibly unchanged: walls, floor and furniture match the
shipped frame, and no bloom artefact appears.

The honest caveat: a blown pane shows **no view**. That is photographically correct and simultaneously a
product question, since some users may want to see out.

### Correcting `.258` on the tone curve

`.258` concluded *"the tone curve is not what flattens it — it removes only 8–12 % of the ratio"*. That
holds at the **shipped operating point**, which sits in the curve's near-linear region. It does not hold once
the range is supplied: from ×16 to ×64 the input quadruples while the glazing mean moves 237 → 250.

Tested directly at ×32:

| view transform | glazing > 250 | frame mean | `%<64` |
| --- | --- | --- | --- |
| **AgX (shipped)** | 39.7 % | 122.2 | 11.86 % |
| filmic | 86.4 % | 109.9 | 24.72 % |
| neutral | 90.6 % | 95.1 | 32.80 % |

**AgX's long shoulder is what resists clipping — and it is protecting the interior while doing so.** The
other two curves clip the window readily and cost **13–21 points of `%<64`** and 12–27 of frame mean.

So `.209` (*"pushing the pane brighter fights the AgX view transform"*) and `.258` (*"the scene is short of
range"*) are **both correct, at different operating points**, and neither lever alone is the story. The
practical consequence is convenient: **keep AgX, supply the range** — the curve's interior protection is
worth more than the ~30× it costs at the window, since the 30× is nearly free.

### Cost at the hours `.236` recorded as already correct

The app **switches pane material by hour** — day `BoxGeometry#bcd4e6`, night `BoxGeometry#20272f` at opacity
0.73. The first 21:00 run found *no glazing samples at all* under the day signature, which is how this came
to light.

| | glazing ×1 | glazing ×32 | frame mean | `%<64` |
| --- | --- | --- | --- | --- |
| 19:00 (day pane) | 141.0, 0.0 % clipped | 228.2, **0.0 %** clipped | 156.0 → 165.3 | 3.68 → 3.69 % |
| 21:00 (night pane) | 23.0 | **43.0**, 0.0 % clipped | 133.9 → 136.0 | 15.65 → 14.09 % |

19:00 remains unclipped, which is arguably right for golden hour. **21:00 is the real cost: the night pane
roughly doubles.** It stays far from clipping and far below the wall, but `.236` recorded 21:00 as already
correct, so this is a genuine change to it — and it is exactly the regression that item's own note warned
against.

That the app already switches pane material by hour is the useful part: **the fix need not be a single
global scalar.** A per-hour or per-material exterior scale would reach the photographic band at midday and
leave 21:00 untouched.

### A method note, because it is a repeat

Two sweep rows were initially invalid: zsh does not word-split an unquoted variable, so `set -- $cfg` left
`BGMUL="16 neutral"`, `Number()` gave `NaN`, and the background rendered as nothing. It was caught only
because the numbers were impossible — glazing mean 103 where ×16 had given 237. **This is the same mistake
as `.249`**, which is why the re-run used an explicit argument list instead. Worth stating twice: in this
shell, build argument lists explicitly, never by word-splitting.

### Where item (l) now stands

Priced, not decided: **≈×30 of exterior radiance, +8 % frame mean, zero `%<64` cost, a visibly photographic
window, against a night pane that doubles.** The fix space is unchanged in kind but the numbers now exist,
and the per-hour material switch offers a route that avoids the one measured regression.

Nothing changed in `src/`.

---

## `.260` — the clipping band cannot be widened by automation, and it is the wrong shape of target

`.259` priced item (l) at ≈×30 of exterior radiance against a **15–39 % clipping band resting on n = 2**.
That band's width *is* the uncertainty in the answer: ×24 gives 4.1 % clipped, ×32 gives 39.7 %. So widening
the reference set (thread 2) was the obvious next round, and clipping looked like the tractable case —
a within-surface, distribution-based statistic needs none of the constant-orientation (`.227`), crop-distance
(`.250`) or aperture-fraction (`.251`) screening that made the ratio work intractable.

It did not widen. What came out instead is a reason the band was never a well-formed target.

Runs 06:54–07:00 local (2026-09-02).

### Automation does not work here

40 real images were inventoried on disk (44 candidate files, 4 of them HTML/text from failed fetches) and
screened on a contact sheet. A pane-finder then located the largest bright cluster in the upper three
quarters of each frame, inset it 18 % to clear frames and mullions, and measured the interior.

Every crop was looked at. They were:

| candidate | what the crop actually contained |
| --- | --- |
| `r1`, `r10` | **curtains** |
| `win-photos-1571460` | a **chandelier and ceiling** |
| `win-photos-1080721` | the **whole kitchen interior** |
| `q5`, `r2` | genuine glazing, but with a mullion or frame through it |
| `r6` | a genuine pane — trees and a trunk, well exposed, not blown at all |
| control `p233-Home_Staging` | the **brightest core** of one pane: **86.1 %** against `.236`'s **39.3 %** |

Hand-picking is not automatically better: three of my first six hand-drawn boxes were mostly wall and
ceiling, because y coordinates read off a grid overlay were about 0.08 too high. They were corrected only
because every crop was inspected. `.233` concluded that the criteria, not the measurement, are the
bottleneck. This is that bottleneck.

### The finding: clipping is population-dependent *inside one photograph*

The control's 86 % against 39 % is not an error to be fixed — it is the result. `Home_Staging` contains
three windows. Hand-cropped pane interiors, each visually verified:

| pane | what is behind it | mean | **> 250** | > 240 |
| --- | --- | --- | --- | --- |
| left | open sky, a neighbouring roof, bare branches | 229.1 | **58.9 %** | 63.1 % |
| middle | a sunlit neighbouring wall | 193.3 | **32.6 %** | 36.0 % |
| right | a **shaded** balcony with a wooden door and a lamp | 146.3 | **9.0 %** | 11.5 % |

**A 6.5× spread within a single image.** Each crop still carries a frame sliver, which pulls the figures
slightly down; the *spread* is the robust part and it is what matters.

The reason is physical and obvious once seen: a real window is several panes onto **different things**. One
faces open sky and blows out completely; one faces a sunlit wall and partly blows; one faces a shaded porch
and does not blow at all. `.236`'s aggregate 39.3 % is a **mixture of those three**, not a property of
glazing.

### What that does to `.259`

The app at ×32 reads **39.7 % across all 413 glazing samples** — it matches the aggregate almost exactly.
But the app has **one backdrop texture**, a smooth sky gradient, so every pane blows *together*. A
photograph that reaches ~39 % gets there by mixing a blown pane with an unblown one.

**A single global multiplier therefore buys the right statistic and the wrong picture.**

This is the same species of error the arc has hit repeatedly — `.226`'s "composition cancels", `.249`'s
furniture in the wall bucket, `.253`'s hollow control: a number that is right for the wrong reason. The
difference is that here it would have been matched *deliberately*, by aiming at an aggregate that no single
backdrop can produce honestly.

### Where item (l) actually stands

The limiting uncertainty is **not** the size of the reference set. It is the **population definition**.
*"Photographs clip 15–39 %"* is not a target without *"over what population"* attached — and once attached,
scaling one backdrop reaches the photographic **average** but not its **structure**.

`.259`'s ≈×30 stands as the aggregate-matching figure with that caveat now explicit. Whoever takes the
decision is buying a **uniformly blown** window: markedly more photographic than today's flat grey panel,
and still not what a photograph does.

### What would actually widen the set

Hand-cropped pane interiors, one pane at a time, **recording what each pane faces**, with provenance. That
is precisely the labour `.233` identified and precisely what automation was meant to avoid. The inventory
and the screening sheet now exist, so a future round can grind through it — but the unit of measurement has
to be **the pane, not the photograph**, or the aggregate hides the structure again.

*Provenance note, because it bears on any future use of this inventory: the `b*`, `q*` and `r*` files have
no recorded source in the arc's notes, so they cannot be certified against `.233`'s "not AI stock"
criterion. Only `p233-*`, `ref-*` and `win-photos-*` trace to the recorded Wikimedia sweeps. **No number
published in this round comes from the uncertified set** — the three pane measurements are all from
`p233-Home_Staging_Beisp`, the `.233` qualifier.*

Nothing changed in `src/`; the probe is unchanged this round.

---

## `.261` — a real window is blown and readable at once; the app can only be one or the other

`.260` established qualitatively that a photograph's glazing is a mixture while the app's is a uniform
gradient, and left item (l) resting on that. This round measures it on both sides with matched statistics,
and in doing so corrects `.260`'s own account of *why*.

Runs 07:01–07:06 local (2026-09-02).

### New statistics

The probe's glazing population (n = 413 world-verified pane samples, selected by geometry+colour signature
so grilles cannot dominate it) now also reports `sd`, percentiles, the `p95 − p05` spread, and the
**mid-tone fraction** — `60 < v ≤ 240`, i.e. the part of the glazing you can actually see through.

13:00, `medium`, photographic look, canonical pose:

| `backgroundIntensity` | clipped | sd | p05 | p50 | p95 | spread | mid-tone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1 (shipped)** | 0.0 % | 17.4 | 127 | 166 | 182 | 55 | **100.0 %** |
| 8 | 0.0 % | 17.4 | 193 | 230 | 238 | 45 | 100.0 % |
| **32** | 39.7 % | 16.5 | 233 | 250 | 253 | **20** | **9.4 %** |

The app's window **collapses** as it clips: the whole population migrates into 233–253.

### The photograph, measured the same way

A single **frame-free** pane of `p233-Home_Staging_Beisp` — the `.233` qualifier — containing a tiled roof
edge, a soffit, blown sky and a bare branch. Verified by looking, and measured at three progressively
tighter insets to show it is not a boundary artefact:

| inset | n | mean | clipped | sd | spread | mid-tone |
| --- | --- | --- | --- | --- | --- | --- |
| loose | 31 302 | 231.7 | 60.3 % | 33.7 | 90 | 36.0 % |
| mid | 21 620 | 228.5 | 57.0 % | 35.4 | 92 | 39.8 % |
| tight | 13 860 | 224.4 | 54.6 % | **37.7** | **95** | **43.7 %** |

Stable, and drifting the *right* way — tightening removes blown sky, so sd and mid-tone rise slightly.

### The comparison

| | clipped | sd | spread | mid-tone |
| --- | --- | --- | --- | --- |
| photograph, **one** pane | 54.6–60.3 % | **33.7–37.7** | 90–95 | **36–44 %** |
| app, **whole** window @ ×32 | 39.7 % | 16.5 | 20 | 9.4 % |

**At comparable clipping, one real pane carries about twice the internal variation of the app's entire
window and four times the spread.** The comparison is *generous* to the app: its 413 samples pool every pane
in the frame, which should give it more variation than a single pane, not less — and it still loses by 2×.

**The structural fact:** a real pane is **55–60 % blown and 36–44 % mid-tone at the same time.** The sky is
gone; the roof beneath it is still readable. The app is either all mid-tone and unclipped (×1) or nearly all
blown (×32). It has no operating point that is both, because a smooth gradient scaled by any factor stays a
smooth gradient.

### Correcting `.260`

`.260` attributed the photographic mixture to panes **facing different things** — open sky, a sunlit wall, a
shaded porch, clipping 59 / 33 / 9 %. That is real, but decomposing the pooled variance shows it is the
smaller half:

| component | sd |
| --- | --- |
| **within**-pane | **42.3** |
| between-pane | 20.9 |

The dominant term is variation **inside** a single pane. What makes a real window structurally rich is that
each pane **contains a scene with its own dynamic range**, not merely that panes differ from one another.
`.260`'s emphasis was the wrong way round.

### What this means for item (l)

It separates two routes that had been conflated:

| route | cost | what it buys |
| --- | --- | --- |
| **aggregate match** — ≈×30 exterior radiance (`.259`) | +8 % frame mean, **zero** `%<64`, night pane 23 → 43 (`.259`) | the right clipping *statistic*, and a **uniformly blown** window |
| **structural match** — backdrop **content** with its own range | unpriced; a content change, not a lighting one | blown sky over a readable near object — what a photograph does |

**No luminance multiplier can reach the structural target**, and the ×1 → ×32 table is the proof: mid-tone
goes 100 % → 9.4 % without ever passing through the photograph's 36–44 % *while also* clipping. The backdrop
today is `paintSkySurround`, a procedural sky gradient containing nothing but sky.

For an HDB flat the diagnosis is a fortunate one. The real view from most windows **is another block** —
near, mid-luminance, structured — which is exactly the content that would supply the range for free, and
would make the window read as an opening rather than a panel without touching the lighting at all.

That is a bigger and different decision than `.259` priced, and it is a content decision, so it is filed
rather than taken.

Nothing changed in `src/` beyond the version bump.

---

## `.262` — the experiment failed, provably, and `.259`'s lever has an unknown mechanism

`.261` proved one half of its claim and asserted the other:

- **Proved:** no luminance multiplier reaches the photographic *structure*. A real pane is 55–60 % blown
  **and** 36–44 % mid-tone simultaneously; the app runs 100 % → 9.4 % mid-tone across ×1 → ×32 without ever
  being both.
- **Asserted, never tested:** backdrop **content** would supply that range, and for an HDB flat the real
  view out of most windows is another block.

This round set out to test the assertion, entirely probe-side so that it reverts by construction.

Runs 07:07–07:14 local (2026-09-02).

### The intervention

`scene.background` in walk mode is a **1024×512 equirect `CanvasTexture`** with
`EquirectangularReflectionMapping` (mapping 303) and `srgb` colour space, whose `image` is a real `<canvas>`
— so it can be drawn on directly. Row *h*/2 is the horizon, and with the camera pitched −0.06 rad the
window's view spans roughly elevation −12°…+6°, i.e. rows ~239–290.

`BGBLOCK=1` paints a neighbouring block into rows 0.485*h*…0.66*h*: vertical bands so the facade has its own
internal structure the way a real block's columns and windows do, a roofline highlight, and a shadowed base.
Painted at **~5 % of sky luminance**, so that a ×32 boost clips the sky while the facade lands mid-tone —
and ~1/20 of sky luminance is roughly what a sunlit concrete facade is.

### It did nothing

| ×32 | clipped | sd | spread | mid-tone |
| --- | --- | --- | --- | --- |
| no facade | 39.7 % | 16.4 | 20 | 9.7 % |
| **with facade** | 39.5 % | 16.4 | 19 | 9.4 % |

### The control that turned a puzzle into a result

Rather than theorise, I blacked out the **entire** backdrop canvas and verified it was still black at
capture time — the read-back discipline `.254` taught, and the only reason this round has a conclusion:

| | frame mean | `%<64` | glazing mean | canvas at capture |
| --- | --- | --- | --- | --- |
| ×16, canvas normal | 121.3 | 11.85 % | 237.1 | — |
| **×16, canvas ENTIRELY BLACK** | **121.3** | 11.84 % | **237.2** | rows 30/50/55 = `[0,0,0]` |
| ×1, canvas entirely black | 113.0 | 11.84 % | 161.3 | rows 30/50/55 = `[0,0,0]` |

**Blacking the whole backdrop changes nothing, anywhere** — not the frame mean, not the shadow fraction, not
the glazing. And ×1-with-black-canvas reproduces the shipped ×1 glazing exactly (161.3 against 161.4).

### So the experiment failed rather than returning a negative

The canvas bound to `scene.background.image` is black and the renderer is sampling something else. That is a
failed intervention, not evidence about content, and the distinction is the whole point: reporting this as
*"content does not help"* would have been a false negative of exactly the kind `.254` produced and caught
when a light patch was silently reverted every frame.

**`.261`'s content hypothesis is untested, not refuted.** `BGBLOCK` stays in the probe, documented as
**proven-inert**, because knowing that an intervention never reaches the renderer is worth more than deleting
it — the next person to reach for "just paint the backdrop" will otherwise repeat this.

### The caveat this puts on `.259`

Two facts, both reproduced in this round:

- `backgroundIntensity` moves the glazing: **161.4 → 237.1 → 245.2** at ×1/×16/×32.
- The background's **content** moves the glazing by **0.1 counts**, even when replaced entirely by black.

Together they mean the ×30 lever is **not** "make the view brighter". It scales something whose content is
not the painted sky, and **the mechanism is not established.**

This does not change `.259`'s measured costs — +8 % frame mean, zero `%<64`, night pane 23 → 43 all stand as
measurements. It changes how much the *interpretation* attached to them should be trusted. This arc has now
retired four metrics for being right-looking and wrong-mechanism (`.249` furniture in the wall bucket, `.251`
scene-dependence, `.253` a hollow control, `.255` a different lighting rig). **A lever with a measured effect
and an unknown mechanism belongs in the same suspicious category until the mechanism is found**, and item (l)
is annotated accordingly.

### Leading hypothesis for the next round

Stated as a hypothesis, not a finding: `scene.environment` is also a texture, and if the renderer lights the
glazing from a **PMREM derived once** from the sky rather than from the live canvas, then mutating the canvas
would be inert while a scalar on the slot still scaled the derived result. The tests are cheap — check
whether `scene.environment === scene.background`, and whether forcing a PMREM rebuild makes the facade
appear.

### Method note, third occurrence

`set -- ${cfg}` does **not** word-split in zsh, so one comparison ran three times with `BGMUL="1 0"` → `NaN`
before the impossible numbers gave it away (glazing 103.2 where ×1 gives 161.4). This is the same mistake as
`.249` and `.259`. The rule that keeps being violated, stated once more: **in this shell, never build
argument lists by word-splitting** — use an explicit function with positional parameters, which is what the
final, correct comparison does.

Nothing changed in `src/` beyond the version bump.

---

## `.263` — mechanism resolved: the backdrop is cached and low-pass

`.262` ended on a contradiction it could not resolve. `backgroundIntensity` moves the glazing
161.4 → 237.1 → 245.2, yet blacking the **entire** backdrop canvas — verified black by read-back at capture
time — changed nothing anywhere. Its parting hypothesis was a cached conversion. That is what it is.

Runs 07:20–07:26 local (2026-09-02).

### The mechanism

three converts an equirect `scene.background` into a **CubeUV/PMREM** and caches the conversion **keyed on
the texture object**. `texture.needsUpdate` does not invalidate that cache. So:

- mutating the canvas bound to `scene.background.image` is **inert** — the renderer keeps sampling the
  conversion built from the original content;
- `scene.backgroundIntensity` still scales that cached conversion, so the scalar works;
- handing the scene a **new `CanvasTexture`** cannot hit the stale entry, so fresh content appears.

`BGBLOCK=3` does the last of those: it copies the current sky canvas, paints the facade into the copy, and
assigns a new `CanvasTexture` (same mapping, same colour space) to `scene.background`. It does not dispose
the old texture, which `SceneBackdrop` owns and restores.

### The controlled comparison

Identical painting code, identical rows, ×32, the only difference being **mutate versus fresh**:

| | clipped | sd | spread | mid-tone |
| --- | --- | --- | --- | --- |
| mode 1 — mutate the bound canvas (`.262`) | 39.5 % | 16.4 | **19** | **9.4 %** |
| **mode 3 — fresh texture object** | 8.7 % | 23.9 | **78** | **75.3 %** |

One variable, a 4× change in spread. That is as clean as this arc gets.

Also confirmed in passing: `scene.environment !== scene.background` — they are different textures, so the
effect is genuinely via the background slot and not via the IBL.

### Consequence 1 — `.259` is restored

The window **does** show the background, and `backgroundIntensity` scales what the window shows. `.262`'s
caveat — *"a lever with a measured effect and an unknown mechanism"* — is **withdrawn**. `.259`'s ≈×30
pricing and its costs (+8 % frame mean, zero `%<64`, night pane 23 → 43) stand with their interpretation
intact.

This is worth dwelling on as a method point. `.262` was right to raise the caveat and right not to publish a
false negative — but the caveat existed because an intervention had failed, not because the app was strange.
Distinguishing "my instrument failed" from "the app is wrong" took one more round, and the cost of *not*
distinguishing them would have been a permanently mistrusted result.

### Consequence 2 — `.261`'s content hypothesis is confirmed in direction

| backdrop | clipped | spread | mid-tone |
| --- | --- | --- | --- |
| app, sky only, ×32 | 39.7 % | 20 | 9.4 % |
| **app, facade, ×32** | 8.7 % | **78** | **75.3 %** |
| app, facade, ×48 | 19.1 % | 66 | 70.0 % |
| photograph, one pane | 54.6–60.3 % | 90–95 | 36–44 % |

Content raises glazing spread from 20 to 78 — roughly 4× — where `.261`'s luminance sweep (×1 → ×64) never
moved spread above 55 and drove it *down* to 20 at the clipping point. So the structural deficit is indeed a
content deficit, as `.261` argued.

### Consequence 3 — but the path is low-pass, and that is the real finding

**Looked at**, the facade arrives as a **soft blurred band**. The 8 px vertical bands painted into it — the
facade structure, the roofline highlight, the shadowed base — are all gone. What reaches the window is a
low-frequency luminance step, and the pane reads as **frosted glass rather than a view**.

Independent confirmation from the numbers: moving the facade's top edge across **0.485 / 0.520 / 0.535** of
the equirect changed clipped/spread/mid-tone by **≤ 0.1 %**. The pre-filter smears the edge so far that its
position barely matters.

The equirect → CubeUV conversion is *pre-filtered by construction* — that is what a PMREM is for — so the
background path **cannot carry high-frequency detail at all**.

### What that means for item (l)

The structural route needs more than a better backdrop image. It needs a **path that can carry detail**:
real geometry outside the window, or a background that bypasses the PMREM conversion. Painting a nicer sky
texture cannot get there, however much content is in it, because the content is filtered away before it
reaches the frame.

That is a larger change than "paint a block into the sky", and it is worth knowing *before* anyone attempts
the cheap version — which would have produced exactly the frosted-glass result seen here and been hard to
diagnose after the fact.

Nothing changed in `src/` beyond the version bump.

---

## `.264` — the app already ships the content route, and the path destroys it

`.263` concluded that item (l)'s structural route needs "real geometry outside the window, or a background
that bypasses the PMREM conversion". Before proposing that anyone author new content, there is an obvious
prior question: **the app already ships four exterior presets — `city`, `dusk`, `park`, `hills`. What do they
deliver?** For an HDB flat, `city` is exactly the near-object content `.261` argued for.

Runs 07:27–07:32 local (2026-09-02).

### The source asset is good

Dumped straight off `scene.background` with `toDataURL`: `city` is a **2048×1024** crisply drawn stylised
skyline — blocks with clearly defined windows, sharp edges, strong contrast against a blue sky, buildings
straddling the horizon exactly where a window looks. Entirely legible.

### What reaches the window is not

Looked at: **faint blue-grey blurred blobs** in the upper panes. Enough to tell that something
building-shaped is out there; not enough to read as a view. The pane looks like patterned or frosted glass.

| backdrop | source | glazing mean | sd | **spread** | mid-tone |
| --- | --- | --- | --- | --- | --- |
| `sky` (default) | 1024×512 procedural | 161.4 | 17.4 | **55** | 100 % |
| **`city`** | **2048×1024 skyline** | 172.0 | 18.8 | **58** | 100 % |
| `park` | 2048×1024 | 157.5 | 20.7 | **65** | 100 % |
| *photograph, one pane (`.261`)* | | | *33.7–37.7* | ***90–95*** | *36–44 %* |

**A crisp 2048×1024 city buys three points of spread — 55 → 58 — where the target needs 55 → 90.** `park`
manages 65, presumably because its content is lower-frequency to begin with and so survives the filter
better. Nothing clips under any preset.

Sharp input, mush output: the loss is **entirely in the path**. This is `.263`'s equirect → CubeUV pre-filter,
now demonstrated on shipped content rather than on a probe-painted facade, which is a considerably stronger
demonstration — the facade could always have been dismissed as an artefact of my painting.

### Filed as (r) BACKDROP-LOWPASS

A **viewport** defect, not an HQ-still one: every user who picks a backdrop and expects to see it is
affected, in ordinary use. `SceneBackdrop.tsx` configures presets *and* user uploads through the same
`configureBackdropTexture` as LDR equirectangulars, so the custom-photo path is affected identically.
`scene.backgroundBlurriness` is 0 — the blur is not deliberate.

### Why this matters more than it first looks

It **inverts the cost/benefit of item (l)'s structural route.** `.263` implied new content would be needed to
make the window read as an opening. It would not: the content exists, it is good, and it is being filtered
away. Fixing the *path* would unlock four presets at once, for every user, with nothing authored — a far
better trade than either `.259`'s aggregate luminance route or a content project.

### Method note — fourth shell-induced false result, second caught by a missing diagnostic

The first attempt at this round put the probe edit and a helper function named `b` in one command. `b` is a
shell alias, so zsh raised a **parse** error — which aborts the *entire* compound command, including the
heredoc that was supposed to apply the edit. The probe therefore never learned about the `BACKDROP`
environment variable, and three runs produced three near-identical rows for `sky` / `city` / `park`: a
perfectly plausible *"the presets make no difference"* result, which is very close to the finding this round
actually reports and would have been reported for entirely the wrong reason.

What caught it was not the numbers. It was that the **`BACKDROPCHECK` line was missing from the output.**

That generalises well past zsh, and it is now the third time it has mattered:

| round | what the diagnostic caught |
| --- | --- |
| `.254` | a light patch silently reverted every frame → a dead-flat sweep |
| `.262` | a canvas mutation that never reached the renderer |
| **`.264`** | an edit that never applied, so the knob did nothing |

**Print what the intervention actually did, and treat the absence of that print as a failure signal rather
than as noise.** Every one of those three would otherwise have shipped a confident false negative.

Nothing changed in `src/` beyond the version bump.

---

## `.265` — (r)'s blur is fully recoverable, and none of my numbers could see it

`.264` filed item (r): a crisp 2048×1024 `city` preset arrives at the window as faint blobs. The question
that decides whether (r) is worth a render call is simply **whether the detail is recoverable at all.**

Runs 07:35–07:38 local (2026-09-02).

### The test

`BGSHARP=uv` rehosts the same backdrop canvas in a **fresh** texture (required — the CubeUV cache is keyed
on the texture object, `.263`) with `UVMapping` instead of `EquirectangularReflectionMapping`. three renders
that as a flat screen background with **no CubeUV conversion**.

### The result, by eye

The window shows a **legible city skyline**: individual buildings, visible window grids, a clear roofline,
blue sky above — against `.264`'s faint blue-grey blobs, on the same asset, at the same pose, in the same
frame.

**So (r)'s blur is entirely the pre-filter, and the content is 100 % recoverable.** It reaches the GPU
intact; only the conversion destroys it. That upgrades (r) from "a defect with a speculative fix" to "a
defect with a demonstrated fix space".

`UVMapping` itself is **not** a candidate fix — a flat screen background has no parallax and is not
projectively correct through a window; it is pasted, not seen. It is a mechanism proof.

### And then the part that matters more

Every numeric metric available failed to detect the most visible improvement this arc has produced:

| metric | equirect (blobs) | UVMapping (legible city) | verdict |
| --- | --- | --- | --- |
| glazing spread p95−p05 | 56 | **50** | **worse** |
| glazing sd | 18.6 | **15.9** | **worse** |
| mid-tone fraction | 100 % | 100 % | unchanged |
| micro-contrast, tight crop | 0.0820 | 0.0817 | unchanged |
| micro-contrast, wide crop | 0.0897 | 0.0909 | unchanged |

Three independent statistics — one of them introduced in `.261` **specifically to capture "structure"** —
and all of them blind.

The two failure modes are different and both worth keeping:

- **Spread and sd measure dynamic range, not detail.** A blurred blob field with a wide soft gradient has
  *more* luminance range than a sharp skyline of similar tone, so the metric moves the wrong way. `.261`
  named this statistic "structure", which over-claims: it is the **dynamic-range** axis. `.261`'s comparison
  against the photograph (spread 20 vs 90–95) stands on that axis; it simply does not speak to legibility.
- **Micro-contrast is swamped by the grille.** The window carries ~20 bars at ~12 cm pitch — high-contrast
  geometry, identical in both frames — and it dominates the band a 4 px high-pass sees. Any crop large
  enough to measure contains bars, so the backdrop's contribution is a rounding error on top of them.

### What that means

**Item (r)'s severity cannot currently be tracked numerically**, and that is now recorded on the item, so
that nobody "verifies" a fix with a number that cannot see it.

More broadly it bounds this arc's method. Fifteen rounds of numeric work have been productive on
**luminance** questions — clipping fractions, falloff, surface ratios, dynamic range — and every metric
built here is a luminance metric. They are structurally unable to answer **legibility** questions: whether
you can tell what you are looking at. A photorealism programme needs both, and only one of them has an
instrument.

This is also the arc's first method rule — *always look at the crop, never trust the number alone* —
demonstrated rather than asserted. In `.233`, `.236`, `.243`, `.246`, `.252`, `.260` and `.264`, looking was
a **check** that caught a contaminated number. Here it was not a check: **it was the only instrument that
worked at all.**

Nothing changed in `src/` beyond the version bump.

---

## `.266` — the legibility metric cannot be built: the metric is fine, the signal is 5 %

`.265` found that no number could distinguish an illegible window from a legible one and left the gap open.
This round tried to close it, using the ground-truth pair `.265` established as a calibration target: the
same backdrop asset at the same pose, once via the equirect path (blobs) and once via `UVMapping` (legible
skyline). A metric that cannot separate those two is not a legibility metric.

Runs 07:41–07:46 local (2026-09-02).

### Twelve candidates against the known answer

High-pass at radii 2/4/8/16/32; difference-of-Gaussians band-passes at (4,16), (8,32), (16,64), (8,64);
vertical and horizontal gradient energy. All normalised by crop mean, on an identical glazing crop:

| metric | equirect (blobs) | UVMapping (legible) | ratio |
| --- | --- | --- | --- |
| `hp2` | 0.0491 | 0.0494 | 1.01 |
| `hp8` | 0.1217 | 0.1212 | 1.00 |
| `hp16` | 0.1439 | 0.1408 | 0.98 |
| `hp32` | 0.1560 | 0.1530 | 0.98 |
| `dog4_16` | 0.0851 | 0.0803 | 0.94 |
| `dog8_32` | 0.0713 | 0.0696 | 0.98 |
| **`dog16_64`** | 0.0566 | 0.0682 | **1.20** |
| `dog8_64` | 0.0852 | 0.0926 | 1.09 |
| `gradV` | 0.0119 | 0.0110 | 0.92 |
| `gradH` | 0.0155 | 0.0155 | 1.00 |

One candidate moved meaningfully, by 20 %. A tighter crop centred on the building mass gave 1.03 for the
same metric — so even that 20 % is not stable across framing.

### The diagnostic that explains it

The same metrics applied where the signal is **unobstructed** — the dumped source city texture against a
16 px-blurred copy of itself:

| metric | blurred | sharp | ratio |
| --- | --- | --- | --- |
| **`hp8`** | 0.0047 | 0.0631 | **13.3×** |
| `hp16` | 0.0137 | 0.0742 | 5.4× |
| `dog4_16` | 0.0126 | 0.0396 | 3.1× |
| `gradV` | 0.0031 | 0.0061 | 1.9× |

**The metric is not the problem. `hp8` detects a 16 px blur at 13.3× when it can see the signal.** Through
the window it detects the identical change at 1.05×.

### The arithmetic

The rendered window's high-frequency energy is `hp8 ≈ 0.12`. The **entire source image's** is `≈ 0.063`.

So the window's own geometry — grille bars, rails, mullions — carries roughly **twice the high-frequency
energy of the whole backdrop**, and the backdrop's contribution is a few percent of anything a high-pass
sees. A 13× change in 5 % of the signal is a 1.05× change in the total. There is no tuning of the metric
that escapes that; the information is drowned before it is measured.

### An attempt to drain the population, reported as failed

`HIDEGRILLE=1` hid 34 `BoxGeometry#e6e7e4` meshes, on the theory that removing the bars would restore
sensitivity. Looked at afterwards: **all ~20 vertical bars and the horizontal rails are still present** —
what was hidden is the window frame and reveal. The metrics did not move (`hp8` 0.1210 → 0.1206).

So the grille attribution is **neither confirmed nor refuted** by that knob — it identified the wrong meshes.
Kept in the probe and documented as mis-targeted, on the `.262` precedent that a known-broken tool is worth
more than a deleted one.

### Conclusion

**Item (r) must be verified by looking — permanently, not provisionally.** `.265` recorded that as a current
limitation of the instruments; this round establishes it as structural at this pose. The one weak indicator,
`dog16_64` at 1.18–1.20 on two of three crops, is too weak to gate a decision: this arc's metrics have moved
more than 20 % from pose and framing alone (`.232` 0.68 → 0.96, `.247` 0.74 → 0.93, `.249` 0.60 → 0.98).

### The general lesson

*A metric's sensitivity must be validated on the population it will be applied to, not on the phenomenon in
isolation.*

`hp8` is a superb blur detector — 13.3× on a clean image — and useless on this window. That is the same
error the arc has now made three times at different levels:

| round | the error |
| --- | --- |
| `.249` | the wall-falloff buckets were furniture, not wall |
| `.260` | the clipping fraction depended on which population it was taken over |
| **`.266`** | a metric validated against the phenomenon, not against the mixture it is measured in |

The first two were contaminated populations. This one is a *diluted* population, which is harder to notice:
nothing is wrong with the metric or the crop, and the number is simply insensitive. The only way it surfaced
was calibrating against a case where the answer was already known by eye.

Nothing changed in `src/` beyond the version bump.

---

## `.267` — chroma separation: the app is not deficient, and the reference set can never settle the hours that matter

`.266` established that the luminance metrics are exhausted for the window question. This round changes axis
to one the arc has never worked: **colour**.

There is an unfinished thread to pick up. `.237` measured the app's 19:00 pane at R−B 21.0 against a wall at
21.3 and concluded *"at the hour when interior photography most depends on warm-interior-against-cool-exterior
separation, the app has none."* Nothing followed it up for thirty rounds.

Runs 07:46–07:50 local (2026-09-02).

### The metric

**Chroma separation = (wall R−B) − (glazing R−B)**, both taken within the same image.

Absolute R−B is meaningless across images — it is set by white balance. The *difference between two surfaces
in one frame* is not: both share that frame's white balance, so the separation survives. That makes this the
first metric in the arc that is white-balance invariant by construction, which is a genuine advantage over
every luminance metric built since `.226`.

Implemented as a colour buffer alongside the existing luminance one, with per-anchor RGB and a
glazing-versus-wall separation printed every run (glazing by world-verified signature, wall by plaster
signature, n ≈ 1725).

### The app across the day

Canonical pose, `medium`, photographic look:

| hour | glazing RGB | glazing R−B | wall R−B | **separation** | reading |
| --- | --- | --- | --- | --- | --- |
| 09:00 | 147/145/145 | 1.5 | 5.9 | **4.4** | slight cool window |
| 13:00 | 160/162/165 | −5.0 | 4.4 | **9.4** | cool window, warm wall |
| 17:00 | 183/172/165 | 18.0 | 6.1 | **−11.8** | **inverted** — window warmer |
| 19:00 | 149/140/128 | 21.3 | 26.4 | **5.1** | both warm — `.237`'s case |
| 21:00 | 23/23/21 | 1.8 | 28.8 | **27.0** | neutral pane, warm interior |

This is a real day-curve, not a flat absence. The 17:00 **inversion** is worth noting: under a low warm sun
the window is warmer than the room, which is physically right and is arguably the correct photographic look
for that hour. `.237` saw only the 19:00 point and generalised from it.

### The reference, measured identically

`p233-Home_Staging_Beisp` — the `.233` qualifier — three hand-cropped pane interiors and a clean interior
wall, all visually verified:

| region | content | R−B | separation vs wall |
| --- | --- | --- | --- |
| wall | pale interior plaster | 9.0 | — |
| pane, left | open sky, roof, bare branches | 7.5 | **+1.5** |
| pane, middle | a sunlit neighbouring wall | 13.6 | **−4.6** |
| pane, right | a shaded porch, wooden door | 13.0 | **−4.0** |

**|separation| ≤ 4.6, and the sign varies from pane to pane.** That is the expected physics: in a daylit
interior, inside and outside are lit by the *same* daylight, so there is little to separate.

A second wall candidate was **rejected by looking** — it had a dark wooden ladder rail running through it,
which would have shifted R−B by pigment rather than by light.

### The result

**The app is not deficient on this axis.** At daylight hours it shows **4.4–9.4** against the photograph's
**≤ 4.6** — the same order, if anything slightly more separation than the reference. `.237`'s *"the app has
none"* is not supported as a defect anywhere a reference exists, and at 21:00 the app shows a strong **27.0**,
consistent with `.236` recording 21:00 as already correct.

### The structural finding, which is worth more than the negative

`.233`'s screening criteria **require daylit photographs** — that is criterion one, and it exists for good
reasons (`.233`/`.234` rejected flash, HDR and AI stock on it).

But chroma separation only becomes large at **golden hour and dusk**, when interior lamps burn against a blue
sky. So:

> **The arc's reference set is, by construction, incapable of adjudicating the hours where this axis
> matters** — including the 19:00 case `.237` flagged. Every screened photograph is daylit; every one of them
> will show ≈ 0 separation, forever.

This is not a gap that more screening effort closes. It needs a **deliberately different screen**: dusk
interiors, lamps on, sky still visible in frame — with its own confounds, since real-estate dusk shots are
frequently long exposures, mixed colour temperature, and heavily graded. That is a distinct piece of work,
and it is now specified rather than assumed.

It also generalises: a reference set screened for one axis can be structurally blind on another. The `.233`
criteria were designed for *luminance* comparisons of plaster, and they serve that well. Reusing them on a
new axis without re-deriving them is the same error as reusing a metric on a new population — `.249`, `.260`,
`.266`.

### Caveat

R−B conflates **paint** with **illumination**. The app's wall is `#f5f5f0`, whose own R−B is 5 — so the
13:00 wall reading of 4.4 is essentially all paint, and the app's daylight wall carries no warm illumination
tint beyond its pigment. The photograph's paint is unknown and cannot be decomposed. Within-image separation
is still the perceptually relevant quantity; it simply is not a pure measure of light.

Nothing changed in `src/` beyond the version bump.

---

## `.268` — colour bleed is exactly zero, and this is the GI test with no confound available

Every global-illumination test in this arc has died on a confound:

| round | test | how it died |
| --- | --- | --- |
| `.226` → `.251` | wall falloff with distance | a 71 %-of-wall aperture makes *flat* the correct answer; real transport gives 1.00 too |
| `.253` → `.255` | ceiling ÷ wall against the path tracer | the tracer runs a different lighting rig — it drops `AmbientLight` and `HemisphereLight` |

So this round picks the one GI signature a grey hemisphere ambient **structurally cannot fake**: **colour
bleed**. A hemisphere light is directionless and grey. It cannot tint a wall the colour of the object beside
it, at any intensity, under any tuning.

And crucially it can be tested as a **within-app A/B**: same pose, same framing, same tier, same material,
same lights, with *the colour of a neighbouring surface* as the only variable.

Runs 07:53–08:01 local (2026-09-02).

### Step 1 — the app's plaster is chromatically flat

Wall B, 13:00, `medium`, photographic look, anchored at fixed world points, per-anchor RGB (added `.267`):

| y | d = 1.2 m | d = 2.4 m |
| --- | --- | --- |
| 1.0 m | RGB 117/117/117 → R−B **−0.0** | R−B 0.6 |
| 1.5 m | RGB 129/129/129 → R−B **−0.0** | R−B 1.0 |
| 2.0 m | RGB 125/125/125 → R−B **−0.0** | R−B 1.5 |

**0.0 to 1.5 counts of R−B over 1.5 m of height.** (y = 0.5 rejected — occluded by furniture.) Worth noting
in passing: the paint is `#f5f5f0`, whose own R−B is 5, yet the rendered wall reads 0 — the illumination is
very slightly cool and cancels the pigment.

### Step 2 — a real wall beside a saturated object is not flat

`w-1866149`: saturated orange leather sofa against plain plaster.

The obvious vertical comparison **fails**: near-sofa vs high-above gives R−B 10.9 vs 17.7 and 11.2 vs 23.1 —
*backwards* — because luminance also differs sharply (239.4 vs 188.6) from a diagonal sun wedge across the
wall. Illumination gradient swamps bleed.

The usable design holds height constant, stays inside one shadow band, and varies only **distance from the
sofa**:

| distance | L | R−B |
| --- | --- | --- |
| adjacent | 214.1 | **13.8** |
| ~8 cm | 186.9 | 13.1 |
| ~15 cm | 177.3 | 9.6 |
| ~23 cm | 168.4 | **10.3** |

**~3.5 counts of chroma gradient over ~23 cm**, and luminance rises toward the sofa as well — the joint
signature of an orange bounce, which adds warm light and so lifts both at once.

### Step 3 — the decisive A/B

`RECOLOR=fafafa:ff5a00` repaints the ceiling — **14 meshes, 171 m², fully exposed, directly adjacent to the
measured wall** — saturated orange, and the same anchors are re-measured:

| | wall at y = 2.0, d = 1.2 |
| --- | --- |
| ceiling as shipped | L 125.1, RGB 125/125/125, R−B **−0.0** |
| **ceiling vivid orange** | L 125.2, RGB 125/125/125, R−B **−0.0** |

**Verified by looking:** the ceiling is unmistakably, vividly orange across the entire top of the frame. The
wall 30 cm beneath it is neutral to the last count.

An earlier attempt repainted the *floor* instead (99 materials) and also returned zero — but the floor near
those anchors is largely covered by the rug and sofa, so the exposed source was small and the null was weak.
The ceiling version has no such weakness, which is why it is the one reported. Both are recorded because the
first attempt is exactly the kind of under-powered null that would be easy to over-read.

### So colour bleed in the app is exactly zero

Not small — **zero to measurement precision**. A vivid orange ceiling is among the most visible GI effects
there is; a real room would throw an obvious warm cast down the upper walls.

### Why this result survives where the others did not

It is a one-variable A/B inside a single build:

- **no reference photograph in the load-bearing step**, so no screening, framing, aperture or paint confound;
- **no second renderer**, so no rig mismatch (`.255`);
- **no between-surface ratio**, so no albedo term (`.249`);
- **chroma, not luminance**, so white-balance invariant within the frame (`.267`);
- **same pose, framing and tier**, so none of `.232`/`.239`/`.247` applies.

The photograph supplies only the *scale* of the effect to expect. Even if that 3.5-count figure were wrong by
a factor of three, zero is still zero.

### What it means for the arc

The GI question has been open since `.226` and twice mis-attributed — falloff (refuted `.251`), ceiling
(withdrawn `.255`). **This is the first GI measurement in the arc that holds.** It does not resurrect either
of those claims, which were wrong on their own terms. It establishes positively and quantitatively that
inter-reflection is absent, and it identifies the axis on which that absence is both measurable and visible.

### Caveats

The photograph is a product-style shot under directional sun, so **3.5 counts is one measurement, not a
screened band**. The `.233` criteria were designed for luminance comparisons of plaster and are not a bleed
screen; a proper one would need diffuse lighting, a saturated object against same-paint plaster, and a
croppable run at constant height — reusing `.233` here would repeat the error `.267` identified.

Zero bleed is also **expected** from the architecture: a hemisphere plus an ambient is grey and directionless,
and cannot do otherwise. The contribution is the quantification and the instrument, not surprise at the sign.

Nothing changed in `src/` beyond the version bump.

---

## `.269` — sizing the bleed deficit: ~18 counts, from the app's own path tracer

`.268` established that colour bleed in the app is exactly zero, but sized the effect to expect against
**saturated orange leather** at 23 cm — a configuration no ordinary room contains. This round asks what the
deficit is actually worth.

Runs 08:04–08:13 local (2026-09-02).

### Photographs cannot supply the bound, and the reason is structural

Floor bleed is inherently a **vertical** comparison: floor below, wall above. Vertical comparisons in real
interiors are confounded by lighting gradients, and usually in the *opposite* direction.

`w-1643383` — dark walnut floor, plain white surfaces, a certified-provenance interior — measured down a
single column:

| band | L | R−B |
| --- | --- | --- |
| top | 169.5 | **27.8** |
| upper-middle | 173.9 | 21.0 |
| lower-middle | 173.4 | **8.5** |
| low | 99.4 | 16.5 |
| floor itself | 127.0 | 35.3 |

The wall is **warmest at the top**, which is the opposite of floor bleed — because the ceiling carries warm
downlights. Mixed lighting dominates the vertical axis.

And three of the five crops were contaminated, which only looking revealed: the top band is a **ceiling
soffit with a downlight in it**, two bands clip **cabinet edges**, and the low band is mostly a **dark
doorway** (its luminance of 99.4 against ~173 for the rest is the tell). The non-monotonic pattern was
entirely artefact. Fourth crop-selection error in this stretch — `.260`, `.267`, `.268`'s first attempt, and
now this.

`.268`'s clean result depended on a **horizontal** series at constant height beside a saturated object. That
is a special configuration, not something a general interior offers.

### The bound came from the app's own path tracer instead

`.255` disqualified the tracer for luminance comparisons because it runs a different lighting rig — it drops
`AmbientLight` and `HemisphereLight` and substitutes a hardcoded gradient.

**That objection does not apply to a within-tracer A/B.** Both sides share the rig, so it cancels in the
difference — exactly as the raster's rig cancels in `.268`'s raster A/B. The only variable is one surface's
colour.

Ceiling `fafafa` → `ff5a00` (14 meshes, 171 m², fully exposed, directly adjacent to the measured wall),
wall B anchors at y = 2.0 m, 150 samples per still:

| anchor | traced R−B shipped | traced R−B orange | **Δ traced** | **Δ raster** |
| --- | --- | --- | --- | --- |
| d = 1.2 m | −3.5 | 14.2 | **+17.7** | **0.0** |
| d = 2.4 m | 2.9 | 21.9 | **+19.0** | **0.0** |

**Real light transport moves the wall's hue by about 18 counts; the rasteriser moves it by zero.** Both
measured on the same anchors, in the same runs, from the same frames.

Traced **luminance** also falls, 144.0 → 122.2. An orange ceiling absorbs most of the spectrum, so there is
less bounce overall — the tracer gets the hue shift *and* the energy loss, which is what real transport does
and what a tint would not.

### So the deficit is worth ~18 counts

Five times the 3.5 counts the reference photograph showed beside saturated leather, and against a rasteriser
response of exactly zero.

### Caveat, and it matters for severity

A vivid orange ceiling is not a realistic interior. The realistic magnitude scales with the saturation of the
bouncing surface, and the app's own room is mostly neutral: white walls, pale ceiling, oak floor.

The shipped-room traced-versus-raster difference (R−B −3.5 against −0.1 at d = 1.2) *looks* like a realistic
bound, but it is **not clean** — in that comparison the rig mismatch is still present, and only the
difference-of-differences cancels it. Quoting it would repeat exactly the error `.255` caught.

**A realistic bound needs its own A/B with a realistic recolour** — a plausible feature-wall or floor tone
rather than a vivid one. That is a cheap next round now that the instrument exists, and it is the honest way
to turn "the deficit is real and large in principle" into "the deficit is worth *this much* in the rooms
users actually build".

### Where the GI thread stands

Open since `.226`, twice mis-attributed — falloff (refuted `.251`), ceiling (withdrawn `.255`). It now has:

- a **positive result** (`.268`: bleed is exactly zero, one-variable raster A/B, no confound available), and
- a **magnitude** (`.269`: ~18 counts under real transport, one-variable tracer A/B, rig cancelled).

Neither depends on a reference photograph in its load-bearing step. That is a firmer footing than the falloff
or ceiling claims ever had, and it was reached by abandoning between-renderer comparison in favour of
within-renderer difference.

Nothing changed in `src/` beyond the version bump.

---

## `.270` — the realistic bound: paint a feature wall and the rest of the room does not notice

`.269` sized the colour-bleed deficit at ~18 counts using a **vivid orange ceiling**, and said plainly that a
realistic bound needed its own A/B with a plausible recolour. There is a better way to do that than inventing
a colour: use a finish **the app already ships and a user can pick from a menu**.

Runs 08:16–08:24 local (2026-09-02).

### Design

`wall-paint-terracotta` (`#c08763`, procedural plaster) applied to the living/dining walls; everything else
untouched. The **measured** surface is the **ceiling**, which remains white plaster in both arms — so nothing
about the measured material changes, only what stands next to it.

**Intervention verified before anything was read** (`.264`'s lesson): the wall's geometry+colour signature
changes `PlaneGeometry#f5f5f0` → `PlaneGeometry#c08763`, and its rasterised colour goes RGB 108/108/108 →
83/53/36. The finish took, strongly.

### The ceiling's response

13:00, `medium`, photographic look, fan-clear anchor line (`ANCHOR_OFF −0.7`), 150 traced samples per still:

| ceiling anchor | raster R−B | traced R−B | Δ raster | **Δ traced** |
| --- | --- | --- | --- | --- |
| d = 0.6 m | 9.7 → 9.7 | −10.9 → −2.1 | **0.0** | **+8.8** |
| d = 1.2 m | 10.0 → 10.0 | −10.8 → +2.7 | **0.0** | **+13.5** |
| d = 1.8 m | 9.8 → 9.7 | −9.4 → +0.6 | **−0.1** | **+10.0** |

| ceiling anchor | raster L | traced L | Δ raster | **Δ traced** |
| --- | --- | --- | --- | --- |
| d = 0.6 m | 110.5 → 110.7 | 158.9 → 128.7 | +0.2 % | **−19.0 %** |
| d = 1.2 m | 124.2 → 124.4 | 161.4 → 129.1 | +0.2 % | **−20.0 %** |
| d = 1.8 m | 125.0 → 125.0 | 160.5 → 135.1 | 0.0 % | **−15.8 %** |

**The realistic bound is ~9–13 counts of hue** — about two-thirds of `.269`'s vivid-orange figure. More than
one might guess: a terracotta *wall* is a very large adjacent surface, so modest saturation over a big area
beats vivid saturation over a smaller one.

### The energy half, which may matter more than the colour

The traced ceiling does not only warm. It **darkens by 16–20 %**. The rasterised ceiling changes by **0.2 %**.

In user terms: **paint a feature wall dark terracotta in this app, and the rest of the room does not notice.**
In a real room a dark wall makes everything measurably darker and warmer — that is most of what choosing a
dark paint *does*.

This is the most concrete and most user-facing statement of the GI deficit the arc has produced. It is not a
ratio at a canonical pose defended against a screened photograph; it is shipped content, selected from a
menu, with a measurable and visible consequence that the renderer omits.

### Looked at

Side by side, the terracotta walls render correctly — deep warm brown on both side walls — and the ceiling is
**visibly identical** in the two frames: same pale grey, no warming, no darkening. The numbers and the picture
agree.

### Why the comparison is sound

Same one-variable A/B design as `.268` and `.269`: identical pose, framing, tier, hour, camera and anchors,
with one finish as the only change.

- The traced arm still runs the rig `.255` identified — but that rig is **identical in A and B**, so it
  cancels in the difference.
- Raster Δ and traced Δ are each computed **within their own renderer** before being compared, so no
  between-renderer term enters.
- Sample-count drift (`.251`) cancels the same way: both stills are 150 samples.

### Caveats

One finish, one room, one pose, one hour. Terracotta is warm and mid-saturation; the shipped `navy`
(`#3b4a63`) and `forest` (`#4a5e4a`) finishes would bleed **cool** and are untested. The ceiling was chosen
because it stays plaster in both arms — a floor-finish A/B is the natural companion and is equally cheap now
that the design is established.

### Where the GI thread stands

| round | result |
| --- | --- |
| `.268` | bleed exists as a deficit and is **exactly zero** in the raster — one-variable raster A/B |
| `.269` | **~18 counts** under an extreme source — one-variable tracer A/B, rig cancelled |
| **`.270`** | **~9–13 counts of hue and 16–20 % of luminance** under a realistic, shipped, user-selectable source |

All three avoid a reference photograph in the load-bearing step, which is what finally made the GI question
tractable after `.251` and `.255` killed the photograph- and between-renderer-based attempts.

This round required **no probe change at all** — it used `WALL`, `PT` and `ANCHORS` as they already stood,
which is a fair sign the instrument built over `.250`–`.269` is now doing useful work without further
scaffolding.

Nothing changed in `src/` beyond the version bump.

---

## `.271` — a cheap albedo-tinted fill recovers ~75 % of the measured GI response

`.270`'s numbers carried a hint worth chasing. The ceiling's response to a terracotta wall was nearly
**uniform** across anchors — +8.8 / +13.5 / +10.0 counts of hue, −19.0 / −20.0 / −15.8 % of luminance. A
uniform response is a **global** effect, and a global effect may have a cheap global approximation.

Runs 08:28–08:33 local (2026-09-02).

### The model

Bounced light is direct light × albedo, so the fill should scale with the room's average albedo. Repainting
a wall lowers and warms that average, which tints the fill warm **and** darkens it — precisely the two
effects `.270` measured.

It is **calibration-free**: only the *ratio* of average albedo between two rooms is applied, so there is no
constant to fit and no opportunity to tune the answer toward the target.

### Scope mattered more than the model

A whole-flat census (2186 m²) barely moves when one room is repainted:

| census scope | ratio (terracotta ÷ white) | predicted darkening |
| --- | --- | --- |
| whole flat, 2186 m² | 0.984 / 0.972 / 0.968 | −2.6 % |
| **living/dining only, 467 m²** | **0.9405 / 0.8960 / 0.8813** | −9.5 % |

Bounce is **local**. A global average over the whole plan dilutes the one room that changed, and predicts an
effect an order of magnitude too small. The census has to be scoped to the room — which is the same
population lesson as `.249`, `.260` and `.266`, arriving this time on the *input* side rather than the output.

Room-scoped area-weighted albedo:

| | r | g | b |
| --- | --- | --- | --- |
| white walls | 0.8115 | 0.8067 | 0.7876 |
| terracotta | 0.7632 | 0.7228 | 0.6941 |

### Three model strengths, bracketing the target

Ceiling anchors, 13:00, `medium`, photographic look, fan-clear line; Δ measured against the shipped
white-walled arm:

| fill model | per-channel scale | Δ L | Δ R−B | recovered |
| --- | --- | --- | --- | --- |
| single bounce, ρ | 0.9405 / 0.8960 / 0.8813 | −3.8 % | +2.6 | ~20 % |
| midpoint | 0.8446 / 0.7605 / 0.7466 | −8.4 % | +5.1 | ~45 % |
| **interreflection, ρ/(1−ρ)** | **0.7487 / 0.6250 / 0.6119** | **−14.1 %** | **+7.9** | **~75 %** |
| *traced target (`.270`)* | | *−18.3 %* | *+10.8* | |

The bracketing is the point: single-bounce **under**-predicts, full interreflection lands close, and the
truth sits just beyond it. That the physically-motivated form is the one that fits — rather than a fudge
factor chosen to fit — is what makes this worth reporting.

**~75 % of the real response** (77 % of the luminance change, 73 % of the hue change) from a **per-channel
scale on two lights that already exist**, driven by a room-albedo traverse. No probes, no irradiance volume,
no extra draw calls. That last point matters: `src/scene/CLAUDE.md` records an irradiance volume as spiked
and **rejected** — a 420-probe volume cost 6.19 ms.

### Looked at

Side by side with the untinted terracotta room, the tinted version is warmer and slightly darker, and the
room reads as coherently lit **by** its terracotta walls rather than unaware of them. Natural, not dingy. The
window is correctly unaffected, since the backdrop is not part of the fill.

### Why this is a different kind of result

`.254` priced the ground-bounce lever against the ceiling deficit and found it the **wrong shape** — it bought
13 % of ratio for 14 % of overall brightness, because a hemisphere brightens everything with a downward
normal. Here the lever is the *right* shape, because the effect being chased is genuinely global: a room's
average albedo changed, and every surface in it should respond.

The difference is that `.254` was chasing a *localised* deficit with a *global* tool, and this round is
chasing a global one. Matching the shape of the lever to the shape of the effect is the lesson, and it was
only possible once `.268`–`.270` had established what the effect's shape actually is.

### What it does not do

It reproduces the **global** part only. It cannot produce *localised* bleed — a wall redder near a red sofa —
and `.268`'s ceiling-recolour A/B would still read ~0 under it, because scaling a global fill cannot tint one
wall differently from another.

`.270`'s configuration is global, and repainting a wall is the common user action. But "colour bleed" in
general is not fully covered by this, and the 25 % shortfall is presumably where the localised part lives.

### Caveats

One finish, one room, one pose, one hour. The shipped `navy` (`#3b4a63`) and `forest` (`#4a5e4a`) finishes
bleed **cool** and are untested — a cool bleed is the more visually risky case, since the app's fill is
already slightly cool (`.268`: the wall's `#f5f5f0` pigment reads R−B 0 in render).

A real implementation needs the albedo census at runtime with a recompute when finishes change: cheap, being
a traverse, but not free. And the traced target inherits `.251`'s sample-count and `.255`'s rig caveats —
both cancel in the Δ, but neither is zero in absolute terms.

**Not shipped.** Probe-side only, and it changes shipped appearance in every room on every tier, so it is
filed as **(s) ALBEDO-FILL** with the recovery figures attached.

Nothing changed in `src/` beyond the version bump.

---

## `.272` — the albedo fill gets energy right and hue wrong-signed; ship half of it

`.271` recovered ~75 % of the measured GI response with a calibration-free albedo-ratio fill, and named the
untested risk plainly: it was validated on **one warm finish**. The shipped `navy` (`#3b4a63`) is cooler and
much darker, which makes ρ/(1−ρ) far more sensitive — the strongest test the shipped catalogue offers.

Runs 08:37–08:44 local (2026-09-02).

### The traced target, and it is counterintuitive

Room-scoped area-weighted albedo under navy: `0.7027 / 0.7010 / 0.6941`, against white
`0.8115 / 0.8067 / 0.7876`. Real transport on the ceiling anchors:

| anchor | Δ traced L | Δ traced R−B |
| --- | --- | --- |
| d = 0.6 m | −20.5 % | **+3.0** |
| d = 1.2 m | −22.3 % | **+5.4** |
| d = 1.8 m | −17.5 % | **+4.1** |

**A navy wall makes the ceiling warmer.** That is not the intuitive answer, and the mechanism is worth
recording: the dark wall **absorbs the blue sky bounce** that previously cooled the ceiling, so the light that
remains is more dominated by the warm direct sun. The room becomes bluer while the ceiling becomes warmer.

The raster, as ever, moves by nothing: +0.1 % and −0.1 counts under navy with no tint — so the bleed deficit
is not warm-specific.

### The model's verdict, split down the middle

| | Δ model | Δ traced target | verdict |
| --- | --- | --- | --- |
| luminance | −19.4 / −18.0 / −17.6 % | −20.5 / −22.3 / −17.5 % | **~90 % recovered** |
| hue R−B | **−2.9 / −2.8 / −2.6** | **+3.0 / +5.4 / +4.1** | **wrong sign** |

Energy is nearly exact — better than terracotta's 77 %. Hue is not merely wrong in magnitude; it points the
other way.

### The diagnosis

The model tints the fill by the room's **reflectance** colour: *"the room is bluer, so the bounce is bluer."*

Real transport is governed by what is **removed**: *"the wall absorbs the blue sky bounce, leaving the warm
sun."*

Those two reasonings agree for terracotta — a warm wall reflects warm *and* absorbs cool — and oppose for
navy, where the wall reflects cool but absorbs a cool source. **So `.271`'s ~75 % was partly luck.** The model
was never capturing hue; it agreed with it by accident on the single case tested.

This is precisely why `.271` flagged the cool finish as the risk, and it is a general point about
calibration-free models: being free of fitted constants makes a model *honest*, not *right*. It still needs a
second, adversarially-chosen data point before it can be trusted, and the second point is worth more than the
first.

### Revised proposal — luminance only

A **scalar** grey scale from ρ/(1−ρ):

| finish | per-channel ratio | **scalar luminance** | luminance recovered |
| --- | --- | --- | --- |
| terracotta | 0.7487 / 0.6250 / 0.6119 | **0.650** | 77 % |
| navy | 0.5490 / 0.5618 / 0.6119 | **0.563** | 90 % |

That holds across an albedo range of 0.81 → 0.76 → 0.70 with **no hue risk at all**. The hue half needs a
different model — one that accounts for the colour of the light being *absorbed* rather than the colour of the
surface absorbing it.

### Looked at, and the asymmetry is the argument

The tinted navy room is visibly darker and reads as a darker room — not broken, not dingy. The hue error is
±3 counts, **below visual threshold** at this scale; the luminance effect is −18 % and plainly visible.

**The part that is wrong is the part you cannot see, and the part you can see is the part that is right.**
That asymmetry is the whole case for shipping half the model, and it would not have been visible from the
numbers alone — the hue error and the luminance recovery are comparable as *fractions*, and only look at each
other's scale when rendered.

### Caveats

Two finishes now, still one room, one pose, one hour. The luminance recovery holding across 0.81 → 0.70 of
room albedo is encouraging, but `forest` (`#4a5e4a`) is untested, and a green finish is where a
reflectance-driven hue model would err differently again.

Item **(s)** is updated with both finishes and the narrowed proposal.

This round required **no probe change** — `WALL`, `ALBEDO`, `FILLTINT` and `PT` as they already stood.

Nothing changed in `src/` beyond the version bump.

---

## `.273` — the floor A/B is void, and diagnosing it found the albedo census is texture-blind

`.272` validated the luminance half of the albedo fill at two points, but both **lowered** room albedo
(0.81 → 0.76 → 0.70). If the model only works in the darkening direction that is a real limit, so this round
went after a **brightening** case, and a different surface class, using the shipped floor finishes
`floor-tile-white` (`#e6e3dc`) and `floor-wood-ebony` (`#43342a`).

Runs 08:45–08:55 local (2026-09-02).

### The A/B is void

The store took the finish — the probe's own state dump reads `"floor":"floor-tile-white"` and
`"floor":"floor-wood-ebony"`. The renderer did not:

| evidence | result |
| --- | --- |
| room albedo census | **identical to four decimals** in both arms |
| traced ceiling L | 158.7 / 161.0 / 159.2 and 159.2 / 160.8 / 158.8, baseline 158.9 / 161.4 / 160.5 |
| the two frames, looked at | visible floor **unchanged** |

Three independent signals agreeing that nothing happened. The finish reached the *state* and not the
*render* within the probe's timing — the `.264` lesson in a new guise: **verify the intervention reached the
render, not just the store.** Nothing is learned about the brightening direction, and that question stays
open.

### But diagnosing it found something that bears on `.271` and `.272`

The living/dining floor mesh is **`color: #ffffff, map: true`** — its albedo lives entirely in a texture, and
its `material.color` is byte-identical under every floor finish.

`.271`'s census reads `material.color`. So:

> **The albedo census is blind to texture-borne albedo.** It counts the floor as pure white when it is
> actually mid-brown oak.

### Sized honestly

The floor is **8.3 %** of the room's 467 m² of surface. Counting it white (1.0) instead of the catalogue's
oak swatch `#b88f5d` inflates ρ by about 0.046:

| | census ρ | corrected ρ |
| --- | --- | --- |
| white walls | 0.8115 / 0.8067 / 0.7876 | 0.7885 / 0.7704 / 0.7351 |
| terracotta | 0.7632 / 0.7228 / 0.6941 | 0.7402 / 0.6865 / 0.6416 |
| navy | 0.7027 / 0.7010 / 0.6941 | 0.6797 / 0.6647 / 0.6416 |

Crucially it inflates **both arms**, so most of it cancels in the ratio the model actually uses. Terracotta's
ρ/(1−ρ) ratio moves **0.7487 / 0.6248 / 0.6119 → 0.7642 / 0.6526 / 0.6451** — a few percent, not a factor.

**So `.271`/`.272`'s luminance conclusion survives and their scalars are approximate.** A 77–90 % recovery
does not become 20 % or 200 % under this correction. But those scalars were computed from a wrong baseline
and should not be quoted as final numbers.

This is worth stating carefully because the temptation runs both ways: it would be as wrong to declare the
previous two rounds void as it would be to ignore the flaw. The correction is small and mostly cancelling,
and saying so precisely is more useful than either.

### The implementation note, which is the useful part

A correct census should read the **finish catalogue's `swatch`** rather than `material.color`. Every finish
has one — `floor-wood-oak` `#b88f5d`, `floor-tile-white` `#e6e3dc`, `floor-wood-ebony` `#43342a`,
`wall-paint-terracotta` `#c08763` — and it is the authoritative description of what the finish looks like.

That is both more accurate than reading colours off materials **and** cheaper than averaging texture maps,
which is the obvious alternative and would cost a readback per surface.

### What remains open

The **brightening direction**. Both validated points lowered ρ, and ρ/(1−ρ) rises steeply as ρ → 1, so a
lighter room is exactly where the model might over-predict badly. Testing it needs the floor finish to reach
the renderer first, which is its own small problem to solve.

Item **(s)** carries the census flaw, the corrected figures, and the `swatch` recommendation.

Nothing changed in `src/` beyond the version bump.

---

## `.274` — CORRECTION: `.273`'s floor A/B was not void; I read the wrong frame

`.273` reported the floor-finish A/B as void, concluding that the store took the finish but the render did
not. **That is wrong**, and this round is the correction.

Runs 08:58–09:04 local (2026-09-02).

### The error

The probe captures **two** frames per run: the eye-level pose, and a pitched-down one (`FLOOR_PITCH −0.55`)
that exists precisely so the floor fills the lower frame instead of the furniture standing on it.

`.273` read the **eye-level** frame, in which the living/dining floor is almost entirely occluded by the sofa,
rug, coffee table and sideboard, saw no difference, and concluded the intervention had failed.

The **pitched-down** frames differ unmistakably: pale grey-lilac tiles under `floor-tile-white`, dark brown
planks under `floor-wood-ebony`. The finish reached the renderer all along.

### The method refinement

*Always look at the crop* is necessary and **not sufficient**. It has to be **the crop where the effect would
show**.

| round | looking did what |
| --- | --- |
| `.233`, `.236`, `.243`, `.246`, `.252`, `.260`, `.264` | caught a contaminated or impossible number |
| `.265` | was the **only** instrument that worked |
| **`.273`** | **misled**, because the crop chosen could not show the effect |

The failure mode is subtle precisely because the discipline was followed: a frame was inspected, a difference
was genuinely absent from it, and the conclusion followed. What was missing was asking *would this crop show
the change if it had happened?* — the same question `.266` had to ask about a metric's sensitivity, arriving
here about a crop's.

### `.273`'s other finding stands

The albedo census reads `material.color`, and the living/dining floor mesh is `color: #ffffff, map: true`
under **every** finish. That was established by inspecting materials, not frames, so it is untouched by the
error above. The census is genuinely texture-blind.

### A second census flaw, now quantified

New `FLOOREXPOSED=1` casts 3600 rays straight down over the room rect and tallies the first hit:

| surface | share of the floor plane |
| --- | --- |
| **floor** (`PlaneGeometry#ffffff`) | **56.0 %** |
| sofa (`ExtrudeGeometry#8aa1a8`) | 8.0 % |
| rug (`BoxGeometry#9c8f7a`) | 7.4 % |
| furniture, four wood tones | ~15 % |

So the floor is **56 % exposed**. An albedo census must weight by exposure: 38.6 m² × 0.56 = **21.6 m²
effective, 4.6 %** of the room's 467 m², against the 8.3 % `.271` used. This is a *second* correction, distinct
from the texture-blindness, and it pushes the same way — `.271` over-weighted the floor twice over.

It also **disproved my own first explanation**. On seeing the traced null I guessed the floor must be almost
entirely covered; it is not, 56 % is exposed. That guess was wrong within a minute of being formed, which is
why it was measured instead of written up.

### What remains genuinely unresolved

Why the traced ceiling barely moved across a white-tile → ebony floor swap
(L 158.7 / 161.0 / 159.2 against 159.2 / 160.8 / 158.8, baseline 158.9 / 161.4 / 160.5) is **not
established**. Attempts to sample a bare-floor strip in the traced stills landed on a wall and a sideboard —
a third crop error in this pair of rounds, caught by looking at the crop rather than trusting its numbers.

Rather than offer a third hypothesis, it is left open and labelled. Two candidate explanations remain
untested: that the tracer snapshot did not pick up the swapped floor material, or that the floor is a weak
bounce source in this room for reasons other than occlusion.

### Where item (s) stands

The albedo model's census needs **two** corrections before its scalars mean anything:

1. **swatch-based albedo** (`.273`) — read the finish catalogue's `swatch`, not `material.color`;
2. **exposure weighting** (`.274`) — weight each surface by its unoccluded fraction, for which
   `FLOOREXPOSED` now provides a method.

Neither overturns `.271`/`.272`'s luminance result, which is a **ratio** between two arms and so largely
cancels both errors. Both mean the published scalars are approximate rather than final.

Nothing changed in `src/` beyond the version bump.

---

## `.275` — the floor contributes ≲1 % of the ceiling's light, because it is dim, not because it is hidden

`.274` left one question open and noted that three crop errors across two rounds meant slowing down. So this
round does **one** thing, with the instrument built to avoid that failure mode: **world-verified anchors**,
which check signature and occlusion themselves, so no hand-picked crop is involved anywhere in the
load-bearing step.

The question: swapping the floor from `floor-tile-white` to `floor-wood-ebony` left the traced ceiling
unmoved. Was that because **(a)** the tracer never received the finish, or **(b)** the floor is a weak bounce
source?

Runs 09:04–09:19 local (2026-09-02).

### Method

`PITCH=-0.5` looks down, so the floor is visible in both the raster frame and the traced still and the same
anchors can be read in each.

The first attempt returned only the **rug** (`BoxGeometry#9c8f7a`) — which correctly does not change under a
floor finish — because the strict gate rejected the actual floor at **17/81 and 27/81 clean**.
`ANCHOR_MINFRAC=0.15` fixed that, and the relaxation is principled: every included point is already verified
same-object, same-signature and unoccluded (`.258`). The rejections are informative in themselves — they show
the floor is heavily interrupted at eye height by furniture legs and the rug edge.

### (a) is refuted — the tracer got the finish

World-verified floor anchors, signature `PlaneGeometry#ffffff` in every case:

| anchor | tile-white | ebony | change |
| --- | --- | --- | --- |
| d = 1.6 m, raster L | 49.5 | 29.2 | −41 % |
| d = 1.6 m, **traced L** | **74.9** | **29.1** | **−61 %** |
| d = 2.8 m, raster L | 57.4 | 17.9 | −69 % |
| d = 2.8 m, **traced L** | **113.9** | **41.4** | **−64 %** |

And confirmed by looking: the traced stills show a pale grey-lilac tiled floor against a dark brown plank
floor, unmistakably, with the rest of the room looking near-identical in both — which is the visual form of
the ceiling result.

### So (b), and the mechanism is not occlusion

`.274` established the floor is **56 % exposed**, so it is not hidden. It is **dim**. Even white-tiled, the
traced floor reads **L 74.9–113.9** against a ceiling at **~159**. A surface that is itself poorly lit bounces
little regardless of its albedo — reflectance sets the *fraction* returned, not the amount.

| quantity | change between the two finishes |
| --- | --- |
| traced **floor** | **−61 % to −64 %** |
| traced **ceiling** | **+0.3 % / −0.1 % / −0.3 %** |

A **>200× ratio**. The floor contributes on the order of **1 %** of the ceiling's light in this furnished
room.

### Why the wall tests worked and this one did not

`.270`–`.272` used *wall* finishes and got large, clean responses. Walls are brightly lit and close to the
window. The floor is the dimmest large surface in the room, which makes it the **worst** available A/B source
— not because the intervention fails, but because the surface has little light to give back.

That is worth recording as a design rule for future A/B choices: **pick the brightest surface you can change,
not the largest.**

### A third correction for item (s)

The albedo census now needs all of:

| # | correction | source | size for the floor |
| --- | --- | --- | --- |
| 1 | **swatch-based albedo** — read the catalogue `swatch`, not `material.color` | `.273` | counted as white instead of oak |
| 2 | **exposure weighting** — weight by unoccluded fraction | `.274` | ×0.56 |
| 3 | **illumination weighting** — weight by light actually *leaving* the surface | `.275` | 4.6 % of area → ~1 % of contribution |

The third is the physically correct form: bounce is governed by a **radiance**-weighted average, not a
reflectance average. It is also the largest of the three for the floor.

And it sharpens why `.271`/`.272` worked at all despite a flawed census: the surfaces they changed were
**walls** — bright, well-exposed and untextured, which is precisely the one case where a naïve reflectance
census is close to right. The model was validated on its easiest case.

### Method note

This round deliberately used anchors instead of hand-picked crops, because `.273`/`.274` produced three crop
errors between them. The anchors rejected the rug, rejected furniture, and reported the signature of whatever
they hit — every judgement the crops got wrong, made mechanically.

That is the durable answer to the pacing problem this arc ran into: not *look harder*, but **use instruments
that verify their own population**. The crop discipline depends on the operator choosing correctly; the anchor
discipline does not.

Nothing changed in `src/` beyond the version bump.

---

## `.276` — the scalar fill wins on hue too: right-signed at all three finishes

`.272` named `forest` (`#4a5e4a`) as the untested third finish — a green bleed, a third hue direction, a third
validation point. This round closes that gap, and the answer **reverses `.272`'s framing** of which model to
ship.

Runs 09:23–09:31 local (2026-09-02).

### Forest's target is almost identical to navy's

Room-scoped albedo under forest: `0.7058 / 0.7065 / 0.6871`, against navy's `0.7027 / 0.7010 / 0.6941`. Both
are mid-dark finishes of similar luminance, so the traced targets converge:

| finish | Δ traced L | Δ traced R−B |
| --- | --- | --- |
| terracotta | −19.0 / −20.0 / −15.8 % | +8.8 / +13.5 / +10.0 |
| navy | −20.5 / −22.3 / −17.5 % | +3.0 / +5.4 / +4.1 |
| **forest** | **−20.3 / −22.0 / −17.4 %** | **+3.7 / +6.3 / +4.2** |

**Forest also warms the ceiling.** So `.272`'s counterintuitive finding generalises: a dark wall of *any* hue
absorbs the blue sky bounce that was cooling the ceiling, and the light that remains is more dominated by the
warm sun. It is not a navy-specific curiosity; it is what dark walls do.

### The reversal

`.272` concluded: *ship luminance only; the hue half needs a different model.* But a **scalar** grey fill
scale gets the hue **sign right at all three finishes** — because darkening a cool fill lets the warm sun
dominate, which is **the same mechanism as the real effect**.

| finish | scalar | Δ L (model) | luminance recovered | Δ R−B (model) | hue recovered | hue sign |
| --- | --- | --- | --- | --- | --- | --- |
| terracotta | 0.650 | −14.9 / −13.8 / −13.7 % | ~78 % | +0.4 / +0.9 / +1.0 | ~7 % | **right** |
| navy | 0.563 | −19.4 / −18.1 / −17.9 % | ~90 % | +0.7 / +1.1 / +1.2 | ~23 % | **right** |
| forest | 0.574 | −18.9 / −17.6 / −17.4 % | ~89 % | +0.7 / +1.0 / +1.2 | ~20 % | **right** |

Against the **per-channel** version:

| finish | Δ R−B (per-channel) | target | sign |
| --- | --- | --- | --- |
| terracotta (`.271`) | +7.9 | +10.8 | right |
| navy (`.272`) | −2.9 | +3.0…+5.4 | **wrong** |
| forest (`.276`) | −1.3 / −1.0 / −0.9 | +3.7 / +6.3 / +4.2 | **wrong** |

### Why the cheaper model is the better one

The per-channel version buys more hue on warm finishes by reasoning that happens to be wrong — it tints the
fill by the room's *reflectance* colour. On cool and green finishes that reasoning inverts the sign.

The scalar version encodes no colour reasoning at all. It only removes energy, and the *hue* consequence
follows from the scene: less cool fill, relatively more warm sun. That is the actual mechanism, so the sign is
right by construction rather than by coincidence.

**A model with fewer parameters is more physically faithful here, because it declines to encode a mistaken
mechanism.** That is worth recording as a general caution: adding a colour term looked like strictly more
information, and was strictly worse.

### Also resolved — the "brightening direction"

`.272` and `.273` flagged it as an untested regime. It is largely **moot**: the model is a **ratio**, so
white → navy and navy → white are the same experiment read in either direction, and `.272` tested it.

The genuinely untested regime is ρ **above** the shipped 0.81, where ρ/(1−ρ) steepens sharply — reaching it
needs an all-white room (many surfaces changed at once), not a single finish swap, so it is not achievable
with one shipped selection.

### Looked at

Forest renders as deep green walls, and the scalar-tinted version is visibly dimmer throughout — reading as a
dark green room should. No colour cast, no dinginess, no artefact.

### Caveats

Three finishes, but all **wall** finishes, one room, one pose, one hour. Hue recovery is small (7–23 %), so
most of the hue effect remains unmodelled — it is simply no longer modelled *wrongly*. And the scalars still
come from the uncorrected census (`.273`/`.274`/`.275`), so they are approximate — though `.274` showed those
corrections largely cancel in a ratio.

Item **(s)** now recommends the scalar form and carries the three-finish table.

Nothing changed in `src/` beyond the version bump.

---

## `.277` — the deficit is twice as large in a bedroom, and the model recovers half as much

Item (s) was validated at three finishes but **one room**, and every metric in this arc has turned out
geometry-dependent (`.232` pose, `.239` tier, `.247` framing, `.251` scene). So this round generalised the
probe to any room and re-ran the test in a bedroom.

Runs 09:33–09:50 local (2026-09-02).

### A silent failure, worth recording

Generalising `livingDining` out of the probe took four edits. Three applied; the **albedo census kept its
hardcode**, because biome had collapsed that expression onto a single line after `.271` and my multi-line
search pattern matched nothing.

`grep -c` reported five matches and I read that as confirmation. What actually caught it was the
**behaviour**: bedroom2 reported livingDining's albedo, to four decimals, over an identical 467 m².

**A count is not a behaviour check.** Same lesson as `.264` — verify what the intervention *did*, not that
the edit *looks* applied — arriving this time through a find-and-replace rather than an env var. The
generalisable form: when an edit is meant to change behaviour, assert on the behaviour.

### Three rooms characterised

| room | ρ (area-weighted) | surface | **aperture** |
| --- | --- | --- | --- |
| livingDining | 0.8115 / 0.8067 / 0.7876 | 467 m² | **71 %** |
| **bedroom2** | 0.8249 / 0.8100 / 0.7768 | 360 m² | **27 %** |
| bedroom3 | 0.8280 / 0.8199 / 0.7912 | 395 m² | 66 % |

### The deficit doubles

Navy walls, traced ceiling anchors:

| | livingDining | **bedroom2** |
| --- | --- | --- |
| Δ traced L | −20.5 / −22.3 % | **−43.1 / −50.3 %** |
| Δ traced R−B | +3.0 / +5.4 | **+15.0 / +20.3** |
| Δ **raster** | 0.0 | **0.0** |

### Mechanism

bedroom2 has a 27 % aperture and is small with high-albedo surfaces, so ρ/(1−ρ) = **4.7** and interreflection
dominates its lighting.

The tell is in the absolute levels: the **traced** bedroom ceiling is *brighter* (175–181) than the living
room's (158–161) **despite a far smaller window**. A small bright room concentrates bounce — light makes more
trips before being absorbed.

The **raster's** fill knows nothing about room size or albedo, so its bedroom ceiling (118) is about the same
as the living room's. Real transport rewards the small bright room; the rasteriser does not. Hence the larger
shortfall.

### Which means the arc has been measuring its best room

`.268`–`.276` all used the living/dining room, which has the **largest aperture in the plan** (71 %). Most
rooms in an HDB flat are bedrooms with 27–66 % apertures. The deficit reported in those rounds is the
optimistic end of the range.

### And the model recovers half as much, exactly where it is needed most

| room | scalar | luminance recovered | hue recovered | hue sign |
| --- | --- | --- | --- | --- |
| livingDining — terracotta / navy / forest | 0.650 / 0.563 / 0.574 | 78 / 90 / 89 % | 7 / 23 / 20 % | right |
| **bedroom2 — navy** | **0.494** | **~46 %** | ~10 % | right |

The recovery is **room-dependent and worst where the deficit is largest** — the opposite of what one wants
from an approximation. Scaling the fill lights cannot express an effect driven by interreflection that the
fill does not model: the fill is a fixed hemisphere, and no scalar on it encodes "this room bounces light
more times".

The **per-channel** variant is wrong-signed again (−4.1 / −3.8 against +15.0 / +20.3). Third room, and it
retires conclusively.

### Looked at

The bedroom's navy walls render as deep navy, and the ceiling is **visibly identical** between the two arms.
In reality navy walls in a small bedroom would darken and warm the ceiling dramatically — the tracer says
−43 to −50 %.

### Caveat on pose

livingDining was measured at pitch −0.06; bedroom2 needed **pitch +0.30**, because in a 3.5 m-deep room the
ceiling is not in frame at all at the shipped pitch (all anchors rejected 0/81, offscreen). Each Δ is
internally pose-consistent, so the **recovery fractions** are comparable; the **absolute** Δs between rooms
are not pose-matched and should not be read as a like-for-like ratio.

### Where item (s) stands

Materially weakened. ~46 % recovery in the room type that dominates the plan is a much less attractive trade
than 78–90 % in the single room with a 71 % aperture. The proposal is not dead — 46 % of a *larger* deficit is
still a real improvement in absolute terms — but it can no longer be presented as "recovers most of it".

Nothing changed in `src/` beyond the version bump.

---

## `.278` — the lever is big enough; the estimator is 2–4× wrong in a bedroom

`.277` found the scalar fill recovers ~46 % in a bedroom against 78–90 % in the living/dining room, and could
say only that recovery is "room-dependent". This round asks why.

Runs 09:52–09:58 local (2026-09-02).

### The obvious hypothesis, refuted

If the fill carried a smaller share of the bedroom ceiling's light, the same scalar would move it less.
`FILLOFF=1` measures that share directly:

| | fill share of ceiling light |
| --- | --- |
| livingDining, d = 0.6 / 1.2 / 1.8 | 69.7 / 67.8 / 66.9 % |
| bedroom2, d = 0.6 / 1.2 | 66.9 / 61.4 % |

**Nearly identical.** A 4-point difference in fill share cannot halve a recovery. Hypothesis dead.

### Inverting the question

The fill-off run supplies a **second measured point** (scalar = 0), so the response can be interpolated in the
scalar rather than guessed. That gives what the scalar *should* have been to hit each traced target:

| room | fill-off Δ L | model scalar | **required scalar** | verdict |
| --- | --- | --- | --- | --- |
| livingDining d = 0.6 | −69.7 % | 0.563 | **0.551** | **2 % off** |
| livingDining d = 1.2 | −67.8 % | 0.563 | **0.515** | **9 % off** |
| bedroom2 d = 0.6 | −66.9 % | 0.494 | **0.262** | **1.9× under** |
| bedroom2 d = 1.2 | −61.4 % | 0.494 | **0.134** | **3.7× under** |

### Finding 1 — the lever is big enough

Zeroing the fill gives **−61 to −70 %**, which exceeds every target measured across this whole thread
(−17 % to −50 %). So scaling the ambient and hemisphere is an **adequate mechanism** in both rooms. The
problem is not that the fill is too small a handle.

That is the encouraging half, and it was not obvious: `.277` speculated that "no scalar on a fixed hemisphere
encodes 'this room bounces light more times'", which reads as a mechanism limit. It is not one — the range is
there.

### Finding 2 — the estimator is geometry-blind

ρ/(1−ρ) depends only on average albedo. The two rooms' albedos differ by **1.6 %** (0.8115 against 0.8249), so
the form returns nearly the same scalar — **0.563 against 0.494, 12 % apart** — while the *required* scalars
differ by **2–4×** (≈0.53 against ≈0.20).

**The missing variable is room geometry, not albedo.** livingDining leaks light out of a 71 %-of-wall aperture;
bedroom2 retains it behind a 27 % one. Same albedo, very different retention, and the closed-box form cannot
see the difference — it assumes no aperture at all.

### And the obvious geometric correction is ruled out

The natural fix is to treat the window as a perfect absorber and fold it into the average. It does not work,
by arithmetic: assuming a 2.0 m window height,

| room | enclosing surface | window | window share |
| --- | --- | --- | --- |
| livingDining | 85.7 m² | 4.9 m² | **5.7 %** |
| bedroom2 | 52.1 m² | 3.0 m² | **5.8 %** |

An area-weighted aperture term is **the same in both rooms**, so it cannot supply a 2–4× factor. Whatever the
missing geometry term is, it is not aperture *area* — it is presumably something like the aperture's solid
angle as seen from the interior, or the mean free path between bounces, neither of which is a one-line
correction.

### What this means for item (s)

The model is **well-calibrated where it was developed** — 2–9 % in livingDining — and wrong by 2–4 × in a
bedroom, with a geometry-blind form and no obvious analytic repair.

But because the lever is sufficient, there is a usable path: **calibrate a per-room scalar once against the
path tracer, offline, and bake it.** The tracer already runs headlessly (`.245`), the anchors already measure
the target, and the calibration is a one-time cost per room archetype rather than a runtime one. That trades
an analytic model for a lookup — less elegant, considerably more likely to be right, and it sidesteps the
missing geometry term entirely rather than pretending to model it.

### Looked at

The fill-off frame renders as a dramatically darker bedroom — ceiling and walls dim, only the window and
directly-lit surfaces retaining brightness — consistent with the −67 % measured drop. The intervention is
sane.

### Caveats

The interpolation assumes the response is linear in the scalar between s = 0 and the tested s. It is measured
at two points per anchor, not verified as linear between them; a mid-point check would firm it up. Two rooms,
one finish in the second. And the enclosure areas assume a 2.0 m window height, which the probe's aperture
readout does not report.

Nothing changed in `src/` beyond the version bump.

---

## `.279` — the response saturates, so `.278`'s numbers were optimistic

`.278` computed how far the albedo model's scalar sits from the one that would actually hit the traced target,
and flagged the assumption it rested on: *"the interpolation assumes the response is linear in the scalar
between s = 0 and the tested s… measured at two points per anchor, not verified between them."*

That assumption is load-bearing for the round's headline numbers, so this round tests it — and rather than a
bare linearity check, it tests `.278`'s **prediction**.

Runs 09:59–10:06 local (2026-09-02).

### The response saturates

bedroom2, navy walls, ΔL against the white-walled baseline, seven scalars:

| scalar | 0.05 | 0.134 | 0.262 | 0.40 | 0.494 | 0.75 | 1.0 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Δ L, d = 0.6 | −59.2 % | −49.4 % | −37.8 % | −27.9 % | −22.1 % | −9.6 % | −0.2 % |
| Δ L, d = 1.2 | −54.6 % | −45.3 % | −35.0 % | −25.6 % | −20.4 % | −8.5 % | +0.1 % |

`dL/ds` falls from about **138 to 45** across the range — strongly convex. The mechanism is the one `.259`
documented at the window: **the tone curve compresses the bright end**, so each increment of fill buys less
output. The s = 1.0 row also serves as a control: ΔL −0.2 % / +0.1 %, i.e. navy walls with an unmodified fill
change the ceiling by nothing, reproducing `.277`.

### `.278`'s prediction, tested

`.278` predicted s ≈ 0.262 would reach −43.1 %. **Measured at 0.262: −37.8 %.** The prediction was off, in the
direction convexity implies.

### Corrected required scalars

Read off the measured curve rather than interpolated between two points:

| | target | **required (measured)** | `.278` said | model | **off by** |
| --- | --- | --- | --- | --- | --- |
| bedroom2 d = 0.6 | −43.1 % | **0.204** | 0.262 | 0.494 | **2.4×** |
| bedroom2 d = 1.2 | −50.3 % | **0.089** | 0.134 | 0.494 | **5.6×** |
| livingDining d = 0.6 | −20.5 % | **0.543** | 0.551 | 0.563 | 1.04× |
| livingDining d = 1.2 | −22.3 % | **0.488** | 0.515 | 0.563 | 1.15× |
| livingDining d = 1.8 | −17.5 % | **0.572** | — | 0.563 | 0.98× |

### So `.278`'s conclusions stand, with corrected magnitudes

Both move the same way:

- **livingDining: well-calibrated.** Now *measured* at within **2–15 %** (mean ≈ 7 %), against `.278`'s
  interpolated 2–9 %. The conclusion holds and is now on firmer ground.
- **bedroom2: under-scales by 2.4–5.6×**, worse than the 1.9–3.7× reported.

### Why saturation makes it worse where it hurts

Because each increment of fill buys less output near s = 1, matching a **large** target requires a
**disproportionately small** scalar. −50 % needs s ≈ 0.09, where a linear reading suggests ≈0.25.

So the model's error is largest exactly where the target is largest. That compounds `.277`'s finding — the
deficit doubles in a bedroom *and* the estimator's error more than doubles there too — rather than softening
it.

### Looked at

The s = 0.134 frame renders as a plausibly dark bedroom: dimmer ceiling and walls, and the window correctly
unaffected because the backdrop is not part of the fill. Not degenerate, not broken.

### A note on flagged assumptions

`.278` flagged this assumption explicitly, and testing it changed the numbers by up to 50 %. That makes four
consecutive rounds where a flagged-but-untested assumption turned out to matter:

| flagged in | assumption | resolved in | outcome |
| --- | --- | --- | --- |
| `.271` | the albedo census is adequate | `.273` | texture-blind |
| `.272` | warm-finish validation generalises | `.276` | hue sign wrong on cool/green |
| `.277` | one room is representative | `.277` | deficit doubles in a bedroom |
| `.278` | the response is linear in s | **`.279`** | convex; numbers optimistic by ~50 % |

**In this arc, a flagged-but-untested assumption has not once turned out to be harmless.** That is worth
treating as a rule: the flag is a queue, not a disclaimer, and the next round should generally be the one that
retires the most load-bearing flag rather than the one that opens new ground.

### Where item (s) stands

Unchanged in kind: the lever is sufficient (`.278`), the estimator is geometry-blind (`.278`), and a per-room
scalar baked from an offline traced calibration is the usable path. But the analytic model is **further** from
usable than `.278` implied — 2.4–5.6× off in the room type that dominates the plan.

Nothing changed in `src/` beyond the version bump.

---

## `.280` — CORRECTION: the bedroom traced target was unconverged; `.277`–`.279`'s bedroom findings are withdrawn

`.279` closed with a rule — *retire the most load-bearing flag next* — and named two. The larger was that
every traced target in `.268`–`.279` comes from a **150-sample** still, while `.251` had measured 8 % level
drift with sample count and `.263` had only spot-checked it once.

Runs 10:07–10:46 local (2026-09-02).

### The bedroom's bright arm is not converged at 150 samples

Same room, pose, anchors and finish; only the sample count differs:

| white-walled bedroom2 | traced L, d = 0.6 | d = 1.2 |
| --- | --- | --- |
| **150 samples** | **175.4** | **181.1** |
| 250 samples | 120.1 | 118.0 |
| 256 samples | 118.6 | 117.3 |

250 and 256 agree within **1.3 %**; 150 is high by **31–35 %**. (`PTSAMPLES=400` returned 256 — the HQ modal
caps there, so 256 is the available ceiling.)

The **navy** arm is stable across the same range: 99.8/90.0 at 150 against 98.7/90.7 at 250, within 1 %. Only
the *bright* arm was bad — which is the diagnostic clue.

### Looked at, and it is not Monte Carlo noise

The 150-sample still is uniformly **washed out and flat**. The 250-sample still shows the cornice, tone across
the ceiling, and detail in the curtains. That is a **systematic** difference in appearance, not variance
around a mean.

The app runs an AI denoise stage (`hqAiDenoise.ts`), and a bright, bounce-dominated room is precisely where a
low-sample estimate plus aggressive denoise would read too bright and too smooth. Whatever the exact
mechanism, the empirical fact is what matters: **150 samples is not enough in this room, and it fails in a
direction that inflates the brighter arm.**

### The corrected target

| | 150 samples (as reported) | **converged** |
| --- | --- | --- |
| Δ traced L | −43.1 % / −50.3 % | **−16.8…−17.8 % / −22.7…−23.1 %** |
| Δ traced R−B | +15.0 / +20.3 | **−5.6 / −6.3** |

### What is withdrawn

1. **`.277`'s "the deficit doubles in a bedroom."** Corrected Δ L is −17 to −23 %, essentially **identical**
   to livingDining's −20.5 / −22.3 %.
2. **`.277`'s "the arc has been measuring its best room."** No measured room-to-room difference remains.
3. **`.278`'s "under-scales 1.9–3.7×" and `.279`'s "2.4–5.6×."** Against a −17 to −23 % target, the model's
   own −22.1 / −20.4 % at s = 0.494 is **close** — the model appears **well-calibrated in the bedroom too**.
4. **`.277`'s bedroom ceiling-warming (+15.0/+20.3).** Corrected to **−5.6/−6.3**: the bedroom ceiling goes
   *cooler* under navy, not warmer.

### What stands, and what is left without support

**Stands.** `.268`'s zero-bleed result is a raster-only A/B with no tracer in it at all. `.279`'s seven-point
response curve is raster-only. `.278`'s fill-fraction measurements are raster-only.

**Left without measured support.** `.278`'s conclusion that ρ/(1−ρ) is *geometry-blind* was argued from the
gap between two rooms' required scalars. With the bedroom target corrected, **there is no room-to-room gap
left for a geometry term to explain.** The claim is not disproved — it may still be true in principle — but
its evidence is gone.

### Residual risk, stated plainly

All the livingDining targets in `.269`–`.276` are also **150-sample**. Their convergence was spot-checked only
in `.263`, at a *nearby but not identical* configuration — eye-level pose, `ANCHOR_OFF 0` — where it was 0.4 %
across 151/251. That is reassuring and it is not the same test. **Those numbers carry the same class of risk
and have not been re-verified at their own settings.**

### New method rule

**Sample-count adequacy must be verified per room and per pose, not once.**

Convergence rate depends on how bounce-dominated the scene is. So the room where a GI measurement matters
most — small, bright, high-albedo, small aperture — is exactly the room where the tracer converges slowest,
and a spot-check in an easier room does not transfer. This is the same shape as `.266`'s lesson about metric
sensitivity: **validate the instrument on the population you will use it on.**

### And `.279`'s rule is vindicated harder than expected

One flagged assumption, tested, withdrew the headline conclusions of **three consecutive rounds**. That is
five in a row where a flagged-but-untested assumption turned out to matter:

| flagged in | assumption | resolved in | outcome |
| --- | --- | --- | --- |
| `.271` | the albedo census is adequate | `.273` | texture-blind |
| `.272` | warm-finish validation generalises | `.276` | hue sign wrong on cool/green |
| `.277` | one room is representative | `.277` | (appeared true, now withdrawn) |
| `.278` | the response is linear in s | `.279` | convex; numbers off ~50 % |
| `.279` | 150 samples is enough | **`.280`** | **unconverged by 31–35 %; three rounds withdrawn** |

### Where item (s) stands

Better than it did. The bedroom evidence against it is withdrawn, and the model may be well-calibrated across
rooms after all. But that is now resting on livingDining targets whose convergence has not been verified at
their own settings — so the honest next step is to re-verify those, not to celebrate.

Nothing changed in `src/` beyond the version bump.

---

## Round .281 — the 150-sample failure is a property of the room, not the aperture or the pose

`.280` closed by naming its own residual risk: every livingDining target in `.269`–`.276` is a 150-sample
still too, and their convergence had never been checked at their own settings. That is this round's first
job; the second is to find out what actually predicts the failure.

### livingDining is converged

Same room, pose, anchors, finish as `.270`; only sample count differs (run 10:55 +08, medium tier,
photographic look, hour 13, 1920×1080, `PITCH=-0.06`, anchors at y=1.5, off −0.7, side C, d = 0.6/1.2/1.8):

| | d = 0.6 | d = 1.2 | d = 1.8 |
| --- | --- | --- | --- |
| 150 samples (`.270`) | 158.9 | 161.4 | 160.5 |
| 250 samples | 159.1 | 161.7 | 160.4 |

0.06–0.19 %. `.269`–`.276` stand.

### Two predictors tested, two refuted

**Aperture.** livingDining 71 % converges, bedroom2 27 % does not — so a window-size story fits n = 2.
bedroom3 is 66 %, nearly livingDining's, and it fails just as hard (runs 10:58, 11:05 +08, `PITCH=0.30`,
white, side C, d = 0.6/1.2): 172.1/175.3 at 150 against 120.3/117.7 at 250, i.e. **30–33 % high**, matching
bedroom2's 31–35 %. Refuted.

**Pose.** Both failing rooms had been shot at `PITCH=+0.30` and the converging one at `−0.06`, so room and
pose were fully confounded — worth spending two runs to separate rather than publishing a confounded claim.
livingDining at the bedroom's pitch (runs 11:06, 11:11 +08): 158.5/161.4 at 150 against 159.0/161.5 at 250 —
**0.06–0.32 %**, converged. Refuted.

A useful by-product: livingDining reads the same traced L at both pitches (158.5/161.4 vs 158.9/161.4). A
world-anchored metric should be framing-invariant by construction, and here it demonstrably is.

### What survives

| room | floor area | aperture | converged at 150? |
| --- | --- | --- | --- |
| livingDining | ≈ 24.2 m² | 71 % | yes, at both pitches |
| bedroom3 | 10.1 m² | 66 % | no (−30 to −33 %) |
| bedroom2 | 9.7 m² | 27 % | no (−31 to −35 %) |

The two failures are the two small rooms. Physically plausible — a small bright room has a short mean free
path, so light bounces more times before escaping and each sample carries more interreflection variance. But
n = 3, and "small bedroom" differs from "large living room" in many ways besides area. **Candidate, not
result.**

### Looking changed the diagnosis

The bedroom3 150- and 250-sample stills were compared directly (first method rule). The 150-sample frame has
**no plaster grain anywhere**, a flattened cornice, a cold blue-grey cast and a milky haze. The 250-sample
frame has plaster texture on wall and ceiling, a cornice with a modelled bright top edge, and a warm neutral
cast. Monte Carlo variance is grainy and unbiased; this is smooth and systematically shifted in level *and*
hue. "Unconverged" is the wrong word for it.

`.280` attributed this to `hqAiDenoise.ts`. That is wrong, or at most partial. The AI pass is opt-in
(`aiDenoise`); what is on by default and is what the probe reads through `toDataURL` is the lib's
edge-preserving **`DenoiseMaterial` blit** (`src/scene/pathtrace/hqRenderSession.ts:408`), at **fixed**
strength — `sigma = 2.5`, `threshold = 0.1`, `kSigma = 1.0`, independent of sample count.

Fixed strength does not mean fixed effect: at high input noise the local variance swamps the filter's edge
criterion, so it smooths indiscriminately and takes the plaster grain with it. That is a reasonable account
of the **texture loss**. It is not an account of the **30 % level shift** — a symmetric blur preserves the
mean over a broad flat region like a wall.

So the low-sample frame differs from the converged one in two separable ways, and only one has a candidate
mechanism. The level shift is unexplained, and saying so is the point: `.280` closed the question with a
guess that is now known not to hold.

### Next

1. Sweep sample count on bedroom3 (50/100/150/200/250) and look at the **shape** of the level decay. A smooth
   asymptote means convergence; a step means a code path switching.
2. Only if it looks convergence-like, test room size directly — measure the kitchen and the master bedroom,
   rather than piling more n onto the extremes already measured.

Nothing changed in `src/` beyond the version bump.

---

## Round .282 — CORRECTION: the tracer canvas was never showing the path trace

`.281` set up a sample-count sweep on bedroom3 to decide between a smooth asymptote (convergence) and a step
(a code path switching). The answer is that there was no curve at all.

### The tell

bedroom3 at **50** samples (run 11:21 +08, medium tier, photographic look, hour 13, 1920×1080, `PITCH=0.30`,
white, side C, d = 0.6/1.2) read traced L **172.1 / 175.3** — the same to the last digit as `.281`'s
**150**-sample run. Measured offline on fixed patches of the two saved PNGs: L agrees to 0.1, sd to 0.01,
R−B to 0.0. No Monte Carlo estimator behaves that way across a 3× change in samples.

### Instrumenting the render instead of running more of them

`PTTRACE=1` samples a fixed 10 % patch of the tracer canvas on each 4 s poll, via `drawImage` onto a 2D
scratch canvas (`toDataURL` on a 1920×1080 WebGL canvas every 4 s would perturb the timing it is measuring).
One 256-sample bedroom3 render, 44 polls, 184 s (run 11:24 +08):

| t | samples | patch L | sd | R−B |
| --- | --- | --- | --- | --- |
| 4 s | 4 | 179.7 | 0.93 | −14.2 |
| 94 s | 132 | 179.7 | 0.93 | −14.2 |
| 184 s | 256 | 179.7 | 0.93 | −14.2 |

Every intermediate poll is identical too — unchanged to two decimal places from sample 4 to sample 256. The
displayed canvas does not accumulate.

`PTHOLD=90` then kept polling past completion (run 11:28 +08). The patch read `L=115.9 sd=1.14 R-B=+8.1` at
the first poll 5 s later and held there for 90 s; that run's anchors read 120.3 / 117.6.

### It is a different image, not a rougher one

| | mid-render | finished |
| --- | --- | --- |
| patch L | 179.7 | 115.9–116.3 |
| patch sd | 0.93 | 1.14–1.15 |
| patch R−B | −14.2 (cold) | +8.1 (warm) |
| plaster grain | absent | present |

A 55 % brighter, smoother, *colder* image is not an under-sampled version of a warmer textured one. Cold blue
with no grain is the signature of the hardcoded `GradientEquirectTexture` (top `0xbfd4e6`) that
`buildTracerScene` substitutes for the Ambient/Hemisphere lights it drops (item (p)), so the placeholder is
most consistent with an early pre-accumulation pass under the gradient environment alone. That identification
is inferred; what is proven is that the two images are different in kind.

### Corrected numbers

Measured at the cap (runs 11:28–12:02 +08):

| | placeholder (published) | finished |
| --- | --- | --- |
| bedroom3 white +0.30, d = 0.6/1.2 | 172.1 / 175.3 | 119.4 / 116.9; 120.3 / 117.6 |
| livingDining white −0.06, d = 0.6/1.2/1.8 | 158.9 / 161.4 / 160.5 | 137.3 / 137.3 / 143.1 |

The livingDining still was looked at and is unmistakably a real trace: plaster texture on the walls, weave on
the sofa, wood grain, soft contact shadows under the coffee table, warm bounce off the floor.

### Withdrawals

- `.281` conclusion 1 (livingDining converged at 150, 0.06–0.19 %) — **withdrawn**. That agreement was two
  reads of the same frozen placeholder. The true values are 10.8–14.9 % lower.
- `.281` conclusions 2 and 3 (aperture and pose refuted as predictors) — **void**. Placeholder compared to
  placeholder.
- `.280` — right that the 150-sample numbers were wrong, wrong that sample count or `hqAiDenoise` was why.
- `.269`–`.276` traced targets, and the within-tracer colour-bleed magnitudes — **suspect**, all read
  mid-render.
- Item (s) ALBEDO-FILL luminance calibration — **suspect**; its hue work was raster and survives.
- `.268` colour-bleed-is-exactly-zero — **stands**, a raster A/B. All raster figures are untouched.

### Three plausible fixes that failed

Recorded because each looked right:

1. Wait for the sample counter to settle → counter stopped at 256, waited 90 s, still saved the placeholder.
   A counter says nothing about canvas contents.
2. Also require the patch to hold still → the placeholder is perfectly stable, so "stable" selects the wrong
   image.
3. Require the patch to change with `!==` → tripped on 131.97 → 132.14, i.e. on noise.

Shipped: clamp the request to the 256 cap (a smaller `PTSAMPLES` never shortened the render — the modal always
runs to its own cap; it only made the probe read earlier), require the flip to exceed a magnitude threshold far
above noise, and **throw** if the canvas never moves. The guard fired on its own verification run: in 1 of 3
runs at the cap the flip never happens within 300 s. PT reads are now known-unreliable instead of silently
wrong.

Filed as item **(t) HQ-CANVAS-PLACEHOLDER**, a product defect as well as a probe one.

### Method rule

*Looking at the frame is necessary but not sufficient — an instrument must be able to fail loudly.* This arc
looked at frames for fifty rounds and still measured the wrong image, because the wrong image was plausible:
correctly framed, correctly furnished, lit like a room. What caught it was two runs that should have differed
and didn't. A measurement path that can silently return a plausible wrong answer is worse than no measurement.

### Next

Re-measure the `.269`–`.276` targets at the cap, budgeting for roughly 1 run in 3 to throw. Nothing in the arc
should rest on a traced number until that is done.

Nothing changed in `src/` beyond the version bump.

---

## Round .283 — CORRECTION to .282: no placeholder; it is the raw trace vs the AI-denoised output

`.282` concluded the HQ modal shows a frozen placeholder for a whole render, filed product defect (t) on that
basis, and withdrew every traced figure in the arc. The core claim is wrong, and it was wrong for a specific
and avoidable reason: it rested entirely on canvas pixel reads and never checked what was on screen.

### The check that settles it

`PTSHOT=1` screenshots the page each poll — the compositor, not a canvas read. One bedroom3 render
(run 12:20 +08, medium tier, photographic look, hour 13, 1920×1080, `PITCH=0.30`):

- 6 samples: heavily grainy path trace, noise across ceiling and walls.
- 256 samples: clean and converged, button flipped to "Re-render".

The render displays normally. No placeholder, no display defect. **(t) as filed is withdrawn.**

### What the two images are

`HqRenderModal.tsx:116-137` — `finalize()` runs on completion and, when `aiDenoise` is armed and
`applyAiDenoise()` returns non-null, clears the host and appends a *different* canvas: a plain 2D
`denoisedCanvas`. And `hqRenderSession.ts:622` returns `denoisedCanvas.toDataURL()` in preference to the
tracer canvas.

So the two states are the **raw path trace** and the **AI-denoised output**. Both real, both shipped.
`.282`'s "1 run in 3 never flips" is just runs where the denoise pass produced nothing.

### The defect, re-filed

| bedroom3, white, pitch +0.30 | raw trace | after AI denoise |
| --- | --- | --- |
| anchor traced L, d = 0.6 / 1.2 | 172.1 / 175.3 | 120.3 / 117.6 |
| patch L | 179.7 | 115.9 |
| patch R−B | −14.2 (cold) | +8.1 (warm) |

~30 % darker and a 22-count hue flip is not denoising. A linear/sRGB mismatch around a model trained on linear
HDR would look like this — **hypothesis, untested, deliberately not published as a cause.** `.280`, `.281` and
`.282` were each wrong in exactly that way. What is established: the magnitude, and that the saved PNG differs
from the watched render and differs run to run depending on whether the pass succeeded.

Which stage is *correct* is open. The raw trace is cold because the tracer environment is the hardcoded cold
`GradientEquirectTexture` (item (p)); the denoised frame is warm and closer to the raster. The denoise may be
masking (p) rather than causing an error.

### What this does to .282's withdrawals

`.282` withdrew `.269`–`.276` and all of `.281` citing a placeholder that does not exist, so those withdrawals
do not stand as reasoned. The narrower truth: those rounds consistently measured the **raw trace**; `.282`'s
"corrections" measured the **denoised output**. Two stages, each self-consistent. Status is **unknown pending
(t)**, not withdrawn — and not restored either, since which stage is the right target is precisely what (t)
now asks.

### Left unresolved, on purpose

`drawImage` and `gl.readPixels` on the tracer canvas agree with each other to the decimal and return constant
values across a whole render, while the composited display of that same canvas visibly denoises from grainy to
clean. `PTLIST=1` shows exactly two canvases, both 1920×1080 backing (live scene 1280×720 CSS, modal preview
694×390 CSS), and the correct one is selected. Both observations are solid and repeated. **No mechanism is
proposed.**

### Probe changes

PT capture waits for the sample counter to settle and takes a **clipped screenshot** of the modal canvas
(~1388×780, aspect 1.779 vs the raster's 1.778) instead of `toDataURL` — lower resolution, but the path proven
to match the display. `.282`'s flip guard and 256-clamp are removed as artefacts of the placeholder model.
Diagnostics kept: `PTSHOT`, `PTGL`, `PTLIST`, `PTTRACE`, `PTHOLD`.

### Method rule

`.282` said an instrument must be able to fail loudly. Sharper, and what would have caught this three rounds
earlier: **when an instrument disagrees with itself, check it against a completely different observation
channel before theorising.** One page screenshot would have pre-empted the mechanisms published in `.280`,
`.281` and `.282` — all three are refuted by it.

### Next

Settle (t): same pose with the denoise forced off and forced on, both compared against the raster's warmth,
and decide which stage is the measurement target. The rest of the arc is blocked behind that.

Nothing changed in `src/` beyond the version bump.

---

## Round .284 — resolved: the tracer converges normally; four rounds chased one variable and it was not sample count

`.280`, `.281`, `.282` and `.283` each published a different mechanism for the same observation. All four were
wrong. Measured properly, the answer is unremarkable.

### A single patch is not an instrument

`.282` declared the canvas frozen on the strength of one patch at normalized (0.45, 0.18) reading
`L=179.7 sd=0.93` at every sample count. Five patches across the same render's screenshots (bedroom3, medium
tier, photographic look, hour 13, 1920×1080, `PITCH=0.30`, run 12:20 +08) — L / sd:

| samples | ceil-orig | wall-L | wall-R | window | corner-L |
| --- | --- | --- | --- | --- | --- |
| 6 | 180.0 / 0.77 | 150.2 / 7.65 | 151.9 / 8.92 | 171.1 / 8.13 | 166.5 / 18.07 |
| 34 | 180.0 / 0.77 | 157.2 / 2.64 | 156.6 / 2.70 | 168.9 / 5.81 | 166.3 / 17.88 |
| 70 | 180.0 / 0.77 | 157.3 / 1.58 | 154.0 / 1.81 | 168.3 / 5.91 | 166.4 / 17.97 |
| 120 | 180.0 / 0.77 | 158.8 / 1.38 | 155.6 / 1.49 | 168.7 / 5.96 | 166.4 / 18.00 |
| 191 | 180.0 / 0.77 | 158.1 / 1.34 | 155.4 / 1.43 | 168.5 / 6.01 | 166.4 / 17.98 |
| 256 | 180.0 / 0.77 | 158.6 / 1.33 | 156.2 / 1.30 | 168.3 / 5.90 | 166.4 / 17.95 |

The wall patches converge textbook-style: sd 7.65 → 1.33 (5.8× noise reduction), mean 150.2 → 158.6 (+5.6 %).
`ceil-orig` is converged from sample 1; `corner-L` sits on a picture-frame edge so its sd 18 is structure and
also constant. `.282` happened to pick one of the two patches in the frame that could not show convergence.

### .283's "contradiction" was an impression, not a measurement

`.283` reported reads constant while the display visibly denoised, and left it unexplained. Measured, the
screenshot channel reads `L=179.7 sd=0.94 R-B=-14.2` at every sample count — matching the in-page reads to
0.1. The channels never disagreed. My reading of the screenshots was right about the walls and wrong about the
patch, because the patch was not on a wall.

Consequently `.283`'s capture change is reverted: back to `toDataURL` at the full 1920×1080 backing store
rather than the modal preview's ~1388×780. It traded resolution for a soundness problem that did not exist.

### The single variable

Whether `finalize()`'s AI-denoise swap had happened before the read. Nothing else:

- wall means move +5.6 % across 6 → 256 samples, and under 0.5 % across 120 → 256
- the raw-vs-denoised gap is ~30 % with an R−B sign flip

Five times the whole convergence drift, so it is not a convergence artefact. **150 samples is adequate** and
`.280`'s "not converged at 150" is refuted.

### Restored

`.269`–`.276` are valid **raw-trace** measurements at an adequate sample count; `.282` withdrew them on a
premise that does not exist and `.283` left them in limbo. `.281` stands as well — its livingDining
re-verification compared two raw-trace reads (0.06–0.19 %, consistent with the <0.5 % drift measured here), and
its aperture and pose refutations were like-for-like raw-trace comparisons.

Item (t) stands unchanged: the denoise shift is real, large, and unexplained by convergence.

### Stage labelling

Every traced figure now carries a `PT STAGE:` line reading `raw-trace` or `ai-denoised`. The first attempt
tested for a WebGL context and mislabelled — `getContext('webgl2')` returns null on a canvas already holding a
WebGL1 context, so it called a plainly raw frame (172.1/175.3) "ai-denoised". Caught because the label
contradicted the values. It now tests `getContext('2d')` (null on any WebGL canvas, a context on the denoised
2D one) and was verified reporting `ai-denoised` beside 120.1/117.1. The raw side gets confirmed next round
when the denoise is forced off.

### Method rule

*A stability or convergence claim needs patches on surfaces with different convergence rates.* A single patch
can sit in a dead region and report "nothing is changing" about a scene changing everywhere else. `.283`'s
rule — check a second observation channel — was right but insufficient here: the second channel agreed with the
first, because both were aimed at the same dead spot.

### Next

Item (t): same pose with `hqAiDenoise` forced off and on, both against the raster's warmth, and decide which
stage is the measurement target.

Nothing changed in `src/` beyond the version bump.

---

## Round .285 — item (t) refuted; the real fault is that the tracer returns one of two discrete outputs

`.283` filed (t) claiming the AI denoise darkens by ~30 % and flips hue. This round ran the A/B `.283` should
have run.

### Item (t), refuted

New `PTAI=off|on` forces the `hqAiDenoise` flag before the modal mounts, asserts the store took it, and reads
it back after the capture (`.254`'s lesson: interventions can silently revert). bedroom3, white, medium tier,
photographic look, hour 13, `PITCH=0.30`, 256 samples, anchors y=1.5 side C d=0.6/1.2 (runs 13:11, 13:19 +08):

| | stage | traced L, d = 0.6 / 1.2 |
| --- | --- | --- |
| denoise off | `raw-trace` | 119.3 / 117.6 |
| denoise on | `ai-denoised` | 118.0 / 115.7 |

1.1–1.6 %. Radiometrically neutral. `.283`'s ~30 % was two runs in different states of the fault below. Also
verifies `.284`'s stage label in both directions — previously confirmed only on the denoised side.

### The actual fault

Identical room, pose, hour, tier, sample count, exposure and denoise setting; the run lands in one of two
states:

| | frameL | frameRB | anchors d = 0.6 / 1.2 |
| --- | --- | --- | --- |
| state A | 156.1–156.5 | −9.7 to −9.8 (cold) | 172.1 / 175.3 |
| state B | 112.3–114.7 | +3.9 to +4.6 (neutral) | ~118–120 / ~116–118 |

~45 % apart at the anchors, opposite colour temperature, two tight clusters, no intermediates across 12 runs.

A 6×4 grid over one frame from each state: all 24 cells darker in B by a near-constant ~0.62–0.70, R−B cold →
neutral everywhere. A global exposure/environment difference; transport does not fail uniformly frame-wide.

### Ruled out by measurement

- Sample count — `.284`: +5.6 % over 6 → 256 samples, <0.5 % over 120 → 256.
- AI denoise stage — (t) above: 1.1–1.6 %, and both states occur under the same stage label.
- Exposure — two back-to-back runs, identical settings, both `gl.toneMappingExposure = 1.38`, `toneMapping = 6`
  at modal-open and at Start render, opposite states (13:27 → A, 13:31 → B).

### One lead, untested

`createHqRenderSession` takes `hdriUrl` and falls back to the hardcoded `GradientEquirectTexture` (top
`0xbfd4e6`) when absent. That fallback is brighter *and* colder — state A's signature — and a load race would
give this coin flip while staying invisible to exposure and denoise. **A lead, not a finding.** `.280`–`.284`
each published a mechanism a later round refuted; no sixth is being added.

### Shipped instrument

`PT FRAME STATE` prints on every run from the whole-frame mean of the already-loaded PNG. `frameRB` flips sign
between states so classification is unambiguous. Verified on a fresh run (13:40 +08): state A, frameL 156.2,
frameRB −9.8, anchors 172.1 / 175.3.

### Cost to the arc

No round before this recorded which state it measured, and the states are ~45 % apart. `.284` restored
`.269`–`.276`; that restoration is now **qualified** — valid only if taken in state B, never recorded, roughly
a coin flip per run. Filed as item (u). It is a shipped defect too: two users rendering the same scene get
images 45 % apart and of opposite colour temperature.

### Method note

Four of the five candidate causes were killed by measurements that already existed. The expensive part was
never the measuring — it was the five rounds of theorising before anyone built a discriminator. **Build the
discriminator first.** A one-line whole-frame mean, available since `.246`, would have separated these states
immediately and made `.280`–`.284` unnecessary.

### Next

Kill or confirm the HDRI-fallback lead: log whether `hdriUrl` resolved and which environment the session used,
correlate against `PT FRAME STATE` across several runs. A direct test, not another inference.

Nothing changed in `src/` beyond the version bump.

---

## Round .286 — the HDRI-fallback lead is refuted; the reason escalates item (p)

`.285` left one lead for item (u) with an instruction to kill or confirm it directly.

### Refuted by reading the default

For the cold `GradientEquirectTexture` fallback to select between states A and B it would have to vary:

- `store.hdriId` defaults to **null** (`src/state/slices/uiSlice.ts:385`; `hdri.test.ts` asserts it)
- `hqEnvironmentUrl(on, null)` → `hdriById(null)?.url ?? null` → null
- `hdriUrl` therefore reaches `createHqRenderSession` as `undefined` on every default run
- `resolveTracerEnvironment` returns null, `buildTracerScene` takes the gradient branch
  (`hqRenderSession.ts:352`) every time

Forcing `hdriEnvironment=false` (`PTHDRI=off`, flag asserted and read back, run 13:47 +08) gave state A,
frameL 155.7 / frameRB −10.1 — consistent with the branch being constant, not with it choosing the state. **A
constant cannot be the variable.** (u)'s cause remains unidentified; no replacement hypothesis is offered.

### The ON arm is void, caught only by looking

`PTHDRI=on` with `studio_small_09` (run 13:52 +08) returned frameL 182.8 / frameRB +14.7 and a clean-looking
still. Wrong room: setting `hdriId` reset `scene.environment` to null and moved the camera, so the capture is
livingDining at eye level rather than bedroom3 pitched up. Anchors, frame state and sample count all read
normally on a frame of a different room. Fifth time in this arc that looking caught a plausible number.

### The discriminator was too weak

`.285` classified on `frameRB < -4` alone — an implicit assumption that there are exactly two states — so it
labelled the 182.8 / +14.7 frame "B (expected)". Now three-way against both terms with an explicit
`UNKNOWN -- matches neither known state; do NOT compare against either`. A discriminator that cannot report
"neither" is how a studio-HDRI frame of the wrong room gets compared against gradient-lit bedroom numbers.

### Item (p), escalated

The chain above is not a probe curiosity: **every HQ render a user produces, unless they hand-pick an HDRI, is
lit by a hardcoded cold gradient** (top `0xbfd4e6`, bottom `0x5a5650`) rather than by the room they built.
Item (p) recorded that the tracer drops `AmbientLight`/`HemisphereLight` and substitutes a gradient; this round
establishes that this is the **default and only** path. The HQ still is the app's photoreal showcase and by
default it is not lit by the user's scene — which reframes (p) from a fidelity gap into the central defect of
the HQ path, and makes it the strongest candidate for the first fix this arc actually ships.

### Method note

The lead died to a default value and three lines of call chain; no render was required. `.285` had already
spent four probe runs before writing it down. **Check whether a candidate cause is even a variable before
building an A/B for it.** Roughly half of `.280`–`.285`'s cost went on A/Bs against constants.

### Next

(p) now outranks (u): confirm by direct observation which environment `buildTracerScene` installs on the
shipped path, rather than inferring it from the call chain; then return to (u) discriminator-first.

Nothing changed in `src/` beyond the version bump.

---

## Round .287 — (p) confirmed by observation; four more (u) candidates eliminated; and the probe had never listened to the console

### The missing observation channel

`page.on('console')` was never wired into the probe. For the whole arc, every diagnostic and warning the app
emitted was structurally invisible. Now added: tagged `[PROBE]` lines plus every warning and error, with
Vite/HMR chatter filtered. `hqRenderSession` logs `HQ AI denoise failed`, `HQ render failed` and a blank-render
guard behind `import.meta.env.DEV` — precisely the failures `.280`–`.283` speculated about while unable to see
them.

### Item (p), observed

Temporary instrumentation in `buildTracerScene` (added, observed, reverted; `src/` verified clean via
`git diff --stat`), default shipped path, bedroom3, medium tier, photographic look, hour 13, `PITCH=0.30`, 256
samples, runs 14:02 and 14:10 +08:

```
[PROBE] buildTracerScene: hdriUrl=undefined env=NULL -> gradient fallback
```

Two independent runs, one in each of (u)'s states. `.286`'s escalation is confirmed: the shipped HQ path
installs the hardcoded cold `GradientEquirectTexture` rather than the scene's own lighting.

### Two more (u) candidates, observed away

```
[PROBE] session opts: toneMapping=agx exposure=1.38 maxSamples=256 1920x1080 aiDenoise=true
```

- Tone mapping is `agx` and constant. State A being brighter *and* colder is what a missing AgX pass would look
  like, which made it the natural suspect; it is not missing. Refuted.
- The environment branch is identical across states — refuted by observation, not merely as a constant.
- No warnings or errors in either state: the denoise is not failing, the blank-render guard is not firing.

### Capture race, refuted

The continuum of whole-frame means across runs (112.7, 113.8, 139.5, 155.7) against only two discrete anchor
values looked like a partially-updated tiled blit (`tracer.tiles.set(n,n)`, 2×2–6×6). `PTDOUBLE=1` captured one
settled render three times, 5 s apart (run 14:25 +08): `frameL=112.7 frameRB=4.0` every time. The state is
fixed per run, not per capture.

### (u) elimination table — all measured, none argued

| candidate | verdict | round |
| --- | --- | --- |
| sample count | refuted (+5.6 % over 6→256; gap ~45 %) | .284 |
| AI denoise stage | refuted (1.1–1.6 %; both states share a label) | .285 |
| exposure | refuted (1.38 at open and at Start) | .285 |
| env branch as a constant | refuted | .286 |
| env branch by observation | refuted (same branch, both states) | .287 |
| tone mapping | refuted (`agx` both) | .287 |
| denoise / blank-render failure | refuted (no warnings either state) | .287 |
| per-capture tile race | refuted (3 identical recaptures) | .287 |

Cause still unidentified. Unexplained and recorded, not theorised: frame mean is a continuum, anchors are
binary.

### Method note

Every elimination here cost one line of logging and no reasoning. The listener that enabled three of them was
eight lines and could have existed since `.246`. **Wire up the observation channels before the hypotheses.**
Six rounds went on theorising about failures the probe could not see; four causes fell in one round once it
could.

### Next

(p) outranks (u) and is confirmed rather than inferred, so it is ready for a decision: it needs a real `src/`
fix (feed the tracer the scene's own lighting), which is a look-and-cost call and not mine to make.

Nothing changed in `src/` — the instrumentation was reverted and `src/` verified clean.

---

## Round .288 — the qualifying photograph set widens to n=3, and the new one carries the EXIF thread 1 was blocked on

(p) awaits a decision and (u)'s cause is unidentified, so this round takes the second standing thread: widen
the qualifying photograph set beyond n=2 on `.233`'s criteria. Nothing here touches the tracer, so none of it
is exposed to item (u).

### Screening

Wikimedia Commons category sweeps (`.234` established category listings as the usable route). Six categories
`.234` did not use → 223 files after a name filter → 53 after size/mime → nine plausible modern painted
interiors at full resolution, screened on a contact sheet.

| candidate | verdict |
| --- | --- |
| `2017-07-30 Haus am Kopf Sankt-Englmar 01` | reject — timber ceiling |
| `Brier Living Room` | reject — timber ceiling with beams |
| `Beach House Bridgehampton (12)` | reject — vaulted/trussed (`.234`'s explicit reject class) |
| `Antesala` | reject — patterned wallpaper |
| `Basic Malek Mansion` | reject — LED cove strip lighting the ceiling; reads as CG |
| `Bungalow N°10 - Living room` | reject — ceiling a sliver, not croppable |
| `A standard living room in Accra` | reject — thin ceiling strip with a pendant lamp in it; very even exposure with soft shadows (flash or HDR) |
| `Alternate Art & Design` | reject **on provenance** — uploader is the estate agency itself, i.e. a marketing asset |
| `At La Palma 2021 1854` | **qualifies** |

**A criterion `.233` lacked: screen provenance, not just appearance.** `Alternate Art & Design` passes every
visual test and is killed only by `extmetadata` (Alternate Immobilien GmbH, "own work"). Estate-agency
marketing images are routinely HDR-composited or virtually staged.

### The qualifier

`.233`'s method — a hand-picked patch on each surface, mean of each, ratio, crops written out and looked at:

```
ceiling  1008x221px at (1814,181)  L=172.3  R-B=16.0
wall      806x484px at (2923,644)  L=155.8  R-B= 2.4
ceiling / wall = 1.106
```

Both crops clean plaster, no junction/fixture/frame. Provenance: **Mike Peel, iPhone 12 Mini, 2021-12-04,
apartment at Rocamar, Spain.** Flat white ceiling across the frame top, large clean white wall right, daylit
from a balcony with a natural falloff (wall darkens away from the window — no flash), ceiling fixture unlit.

**Caveat, recorded not glossed:** ceiling R−B +16.0 against wall +2.4. Consistent with warm terrazzo bounce on
the ceiling and cool skylight on the wall — a real transport effect, not a bad sample. But "same plaster paint
on both surfaces" can only be *judged* from a photograph, not verified, and here it is judged.

### The set

| photograph | ceiling ÷ wall |
| --- | --- |
| `Home_Staging_Beispiel_Nachher` (.233) | 1.03 |
| `Living_room_(13152023964)` (.234) | 0.91 |
| `At_La_Palma_2021_1854` (.288) | 1.106 |
| the app, hand-cropped, canonical pose | 0.93 |

Band widens 0.91–1.03 → **0.91–1.11**. The app stays inside, so `.234`'s retirement of `.188`'s ceiling deficit
**survives a third reference** — the outcome that would have overturned it (a tight band excluding the app) did
not occur. The app sits in the band's lower third; that is a far weaker claim than a deficit and is not
actionable at n=3.

### Thread 1's blocker, answered

The standing brief requires a framing-matched reference before the GI comparison means anything, and asks what
aspect the reference was shot at. For this reference it is now known from metadata rather than inferred:
**iPhone 12 Mini, 4032×3024 = 4:3 (1.333), main camera ≈26 mm equivalent.** The PT branch pins the walk
viewport to 16:9 (1.778) so raster and tracer match each other; matching *this photograph* means **4:3 at
≈26 mm**. A concrete checkable target where the thread had none.

### Method note

Two of eight rejections came from metadata rather than the image: the estate-agency provenance, and the EXIF
that answered thread 1. `.233` and `.234` screened on appearance alone and never fetched `extmetadata` — one
API parameter. **Read the metadata that ships with the evidence.**

### Next

Either widen further (44 unscreened files already passed size/mime, and modern-interior categories beyond the
six used here are largely untouched), or spend the framing figure and re-run the GI comparison at 4:3 / ≈26 mm
against `At La Palma`. The second is worth more but depends on traced numbers, so it is blocked behind (u).

Nothing changed in `src/`. Docs only — the measurement scripts were temporary and removed.

---

## Round .289 — a negative round on the photograph hunt: 0 of 7, one dead seam, and a validated 20× fix for what stopped it

`.288` offered two continuations: widen further, or spend the framing figure. The second is blocked behind
item (u), so this widened. It found nothing — and the reason turned out to be fixable.

### Seam 2 — hospitality categories: 0 of 6

Eight categories (hotels/apartments in Spain, Portugal, France, Italy, Denmark, plus `Hotel rooms`) → 164 names
→ 33 past size/mime → six screened.

| candidate | verdict |
| --- | --- |
| `Albergue de peregrinos, A Laxe 04`, `06` | reject — bare concrete, fluorescents on |
| `Ponferrada - Hotel Temple 6` | reject — artificial downlights, dark timber |
| `Santo Domingo … Hospital de Peregrinos` | reject — stone gothic vaulting, artificial |
| `Santo Domingo …` dining room | reject — brick + spotlit mural |
| `Executive Suite (Spa Building)` | reject — ceiling a thin uncroppable strip; hard sun patches |

**Hospitality is a dead seam — do not sweep it again.** Commons hotel categories are lobbies, corridors,
restaurants and stone halls: artificially lit, rarely plaster on both surfaces. `.288`'s living-room categories
gave 1/9; this gave 0/6. Category choice dominates yield much more than volume.

### Seam 3 — domestic categories: one file retrieved, and it rejects

Six domestic categories → 216 names → 46 landscape JPEGs ≥1600 px. Only one download succeeded:
`Bedroom_twin_beds` — reject, **no ceiling in frame** (`.234`'s class), plus a fully clipped window.

### `.288`'s metadata screen rejected zero — negative on it as a general filter

The agency/marketing signal that killed `Alternate Art & Design` does not recur here (traveller uploads), and
`Software` is **empty on all 33** hospitality candidates, so the HDR-software screen is inert on Commons.
`.288`'s metadata win was real but is a special case, not a routine filter.

### What stopped the round, and the fix

`upload.wikimedia.org` returns **HTTP 429** after roughly seven full-resolution downloads per session; seven of
nine domestic candidates failed that way, and a 7 s-spaced retry failed too.

The thumbnail route works after all. `.288` tried `iiurlwidth`, got non-JSON, and fell back to full-res URLs —
**the parameter was never the problem; the API call was**, because titles containing `&` and `°` broke the query
string. On a clean title it returns `thumburl` directly: **351,898 bytes vs 6.9 MB, 20× smaller.**

And the metric is scale-invariant. Same normalized crops on `At La Palma`:

| source | ceiling | wall | ceiling ÷ wall |
| --- | --- | --- | --- |
| 1280×960 thumbnail | 172.4 | 155.8 | 1.106 |
| 4032×3024 original | 172.3 | 155.8 | 1.106 |

Identical to three decimals. Future rounds can screen **and measure** from thumbnails and never reach the limit.

**Scope caveat:** this validates **patch means**, a low-frequency statistic. It does *not* licence thumbnails
for micro-contrast/micro-sd work, which is resolution-dependent by construction (the floor micro-contrast
figures here are already normalised to ~300 px/m for that reason). Means: yes. Texture: no.

### Thread 2, priced

Qualifying rate across `.234` (1/10), `.288` (1/9), `.289` (0/7) = **2 of 26 ≈ 8 %**. n=5 needs ~40 more
screened candidates — ~5 sessions at full resolution against the 429 ceiling, one or two via thumbnails. The set
remains **n=3**: 1.03, 0.91, 1.106, app 0.93.

### Method note

Two of three findings here are corrections to `.288`, one round old: its metadata criterion does not
generalise, and its abandonment of the thumbnail route was a misdiagnosis of its own malformed API call.
**When a method step fails once, check whether the step or the plumbing failed before discarding the step.**
`.288` discarded a 20× saving on one bad URL and this round paid for it in 429s.

### Next

Re-run the domestic seam via thumbnails: 46 landscape candidates are already identified and provenance-screened,
at ~350 KB each — the whole batch for less than one full-res file.

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .290 — n=4, and the new reference lands on the app's own ratio to within 0.003

`.289` said to re-run the domestic seam through the thumbnail route it had validated. This is the first round in
the arc to screen *and* measure a reference entirely from a 1200 px thumbnail.

### The fix holds; a second limit appears

`.289` was stopped by `upload.wikimedia.org` 429ing after ~7 full-res downloads. Here: **19 of 19 thumbnails
downloaded 200**, ~350 KB each, no throttling.

But the **API** rate-limited independently — 9 of 15 `imageinfo` batches returned "too many requests", so the
sweep produced 19 rows instead of ~46. Two separate ceilings; payload size fixes `upload.`, the API needs
**request pacing**.

### Screening: 18 files, 9 independent interiors, 1 qualifier

A single upload batch (`2016_Grevillia_*`, one luxury villa) was **ten of the eighteen** files — all concealed
LED cove lighting in dropped ceilings, copper/marble panels. **Dedupe by upload batch before treating a sweep's
count as breadth.**

| candidate | verdict |
| --- | --- |
| `2016_Grevillia_*` ×10 (one villa) | reject — LED cove lighting, not plaster |
| `BB_chambredhote` | reject — firelight and lamps |
| `201_B_Gruppe_hos_Wilse`, `9557_Aulestad` | reject — monochrome historical |
| `9556_Aulestad` | reject — guitar close-up, no ceiling/wall |
| `Arenal_3b` | reject — red walls vs white ceiling, lamp-lit |
| `2023-07-30 Vogtsbauernhof Ortenauhaus 00` | **qualifies** |

### Looking caught a contaminated crop again — worth 6.3 %

| | L | sd | R−B |
| --- | --- | --- | --- |
| ceiling, 360×26 px | 149.2 | 4.57 | +8.1 |
| wall, first crop | 150.8 | **19.18** | +9.4 |
| wall, re-cropped clear | 161.0 | **5.79** | +7.0 |

sd 19.18 is not plaster; the crop showed a dark jug/headboard corner intruding at bottom-right.
**ceiling ÷ wall: 0.989 → 0.927.** Fifth time in this arc (`.233`, `.236`, `.243`, `.246`, `.234`) that a
contaminated crop gave a plausible number, and the first time the error has been quantified against its clean
counterpart.

### The qualifier

White lime plaster on walls and ceiling, daylit from a right-hand window with a natural falloff to the left (no
flash), no artificial light on, Commons photograph dated 2023-07-30. **Chroma match is the tightest in the set:
ceiling R−B +8.1 vs wall +7.0, a 1.1-count gap**, against `At La Palma`'s 13.6 — on the one criterion that can
only be judged, not verified, this is the strongest sample so far.

Caveats: the ceiling crop is a **thin strip** (26 px of 853, ~3 % of frame height) though clean; and the
building is an **open-air museum farmhouse**, a period reconstruction rather than a contemporary dwelling. Real
lime plaster and real daylight, so it meets the letter of `.233`, but it is a different building tradition and
is not interchangeable with the other three.

### The set, n=4

| photograph | ceiling ÷ wall |
| --- | --- |
| `Living_room_(13152023964)` (.234) | 0.910 |
| `Vogtsbauernhof_Ortenauhaus` (.290) | 0.927 |
| **the app**, hand-cropped, canonical pose | **0.930** |
| `Home_Staging_Beispiel_Nachher` (.233) | 1.030 |
| `At_La_Palma_2021_1854` (.288) | 1.106 |

The app is now **matched by a real photograph to within 0.003**. `.234` retired `.188`'s ceiling deficit because
the app sat inside a two-photograph spread; at n=4 it is coincident with a reference measured the same way.
`.288`'s observation that the app sits in the band's lower third is weaker still — a qualifying photograph sits
there too.

### Yield

`.234` 1/10, `.288` 1/9, `.289` 0/7, `.290` 1/18 → **3 of 44 ≈ 6.8 %**, close to `.289`'s 8 % estimate. n=5
needs ~15 more candidates; n=6, ~30.

### Next

Pace the API and finish the 46-candidate domestic list the sweep identified but could not fetch. The seam is
productive — domestic categories have supplied 2 of the set's 4 references.

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .291 — pacing works and the pool grows 6×, but 0 of ~19 qualify: the `Bedrooms` seam is exhausted

`.290` named the bottleneck (the API, needing pacing) and the work (the domestic candidate list). The sweep
worked; the screening did not.

### Pacing

2.2 s between API calls, `--data-urlencode` per field:

| | .290 | .291 |
| --- | --- | --- |
| names after filter | 154 | 313 |
| candidates past size/mime/provenance | 19 | 116 |
| API batch failures | 9 of 15 | 8 of ~26 |
| thumbnails downloaded | 19/19 | 26/26 |

6× the pool, no image throttling. The API still refuses ~a third of batches, so 2.2 s is not enough for
sustained use, but it no longer binds pool size. `.290`'s dedupe lesson is implemented: uploader + title stem,
cap 2 per batch (116 → 103).

### 0 of ~19

22 screened; one already in the set (`Vogtsbauernhof`), two known `.289`/`.290` rejects. The only candidate to
reach examination, `Bedroom_of_Canopy_Tower_in_Gamboa_Panama`, **rejects on looking**: what reads as ceiling
along the frame top is mostly wall *above the window* (the yellow trim marks the head), and the real ceiling is
crossed by a structural brace with a light fixture in it. No clean flat plaster patch — and ambiguity is a
reject, not a crop to force.

### The reject census is the output

| cause | count |
| --- | --- |
| wall colour not uniform / wall ≠ ceiling paint | 5 |
| artificial light on | 5 |
| period / château / museum-display | 4 |
| timber or OSB linings | 2 |
| ceiling not in frame | 2 |
| no planar ceiling (cave dwelling) | 1 |
| not a photograph (watercolour) | 1 |
| ceiling not confidently croppable | 1 |

Two causes are 45 %, and both are structural to the category: bedroom photography usually excludes the ceiling,
and bedrooms disproportionately have a coloured feature wall or lamps on. **The `Bedrooms` seam is exhausted for
this metric.** Productive seams were living-room categories (`.288`) and one museum farmhouse (`.290`).

### Thread 2, repriced

Cumulative yield **3 of ~63 ≈ 4.8 %**, down from `.289`'s 8 % and `.290`'s 6.8 %. The rate falls as the seam is
worked deeper — the easy qualifiers came first. n=6 would need ~60 more candidates. **Thread 2 has poor and
worsening marginal returns.**

### A measurable replacement for the judgement call

`.233`'s "same plaster paint on both surfaces" is the only screen criterion that cannot be verified — `.288`
and `.290` both had to record it as *judged*. `.290` supplies a proxy: **R−B agreement between the patches**,
**1.1 counts** on its strong sample versus **13.6** on `.288`'s marginal one. A chroma-agreement threshold would
replace judgement with a number, admit coloured-wall rooms where ceiling and wall match each other (the largest
reject class), and reject same-white rooms lit by very different sources. **Proposed, not adopted** — it needs
calibrating against the existing four references first, and doing that at n=4 is itself weak.

Set unchanged at n=4: 0.910, 0.927, [app 0.930], 1.030, 1.106.

### Next

Not more bedroom sweeps. Either calibrate the chroma criterion against the existing four and re-screen the
rejected coloured-wall rooms with it — mining the 103-candidate pool already fetched rather than fetching more —
or leave thread 2 at n=4 and say so. With (p) confirmed and awaiting a decision and (u) unidentified, 4.8 % is
no longer obviously the best use of a round.

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .292 — three corrections and a refuted hypothesis

An attempt to advance thread 1 without touching the tracer, which ended up auditing three of the previous four
rounds' claims. All four results are negative or corrective.

### The idea

Thread 1's stated blocker is already answered: the anchor metric is framing-invariant (`.285`) and `.288` gave
the reference aspect. What blocks it is (u), which affects only the **tracer**. `.268` proved the **raster** has
exactly zero colour bleed, and a real daylit ceiling should be warmed by floor bounce while the wall sees more
sky — so **ceiling-minus-wall R−B** would be a GI signature measurable from photographs alone.

### Refuted at n=3

| photograph | floor | ceiling R−B | wall R−B | Δ |
| --- | --- | --- | --- | --- |
| `At_La_Palma` | warm terrazzo | +16.0 | +2.4 | **+13.6** |
| `Vogtsbauernhof` | timber, small window | +8.1 | +7.0 | **+1.1** |
| `Home_Staging_Beispiel` | white tile | +6.0 | +8.8 | **−2.8** |

Straddles zero, and tracks **floor colour** rather than the presence of GI: a white-tiled room's bounce is
neutral so its ceiling is not warmed, and its wall is warmer than its ceiling because the wall carries warm
timber window reveals. No systematic ceiling-warming exists to hold the app to. The quantity cannot serve as a
tracer-free GI target.

### Which kills `.291`'s proposal one round after it was made

`.291` proposed replacing `.233`'s unverifiable "same plaster paint on both surfaces" with a **chroma-agreement
threshold**, on 1.1 counts (strong sample) vs 13.6 (marginal). Those values are now known to span **−2.8 to
+13.6 across photographs that all qualify**. Such a threshold would reject `At_La_Palma`, which passes every
other criterion and has documented provenance. **Refuted before adoption.** `.291` built it from the same two
points this round's third measurement overturned: two points looked like a criterion, three made it noise.

### Correction to `.288`: provenance over-rejects

`.288` rejected `Alternate Art & Design` solely because the uploader was the estate agency. Fetching `.233`'s
original reference exposed the inconsistency: `Home_Staging_Beispiel_Nachher` — the arc's first qualifying
photograph — was uploaded by *"Die Home Stagerin Senta Hoffmann"*, a home-staging business promoting itself.
Same provenance class; either both go or both stay.

Resolved by checking the property provenance stood in for:

- **`Home_Staging_Beispiel_Nachher` stays in** — hard cast shadows from the ladder and mullions, real
  left-to-right falloff, and clipped blown windows (an HDR merge would have recovered them). Single exposure.
- **`Alternate Art & Design` stays out, for the right reason** — no cast or contact shadow anywhere (desk
  chair, lamp base, coffee table) and no cross-room falloff, the far wall as bright as the window wall. A
  CG/composite signature, which is what "not AI stock" was actually about.

Both verdicts unchanged, both reasons now correct. **Criterion amended: provenance is a prior that says look
harder, not a verdict.** Reusable positive test for CG: **absent contact shadows + absent cross-room falloff.**

### Correction to `.290`: the headline exceeded the method's resolution

`.290` reported the app's 0.930 matched by a photograph to within **0.003**. Re-measuring
`Home_Staging_Beispiel_Nachher` with this round's own verified-clean crops gives **0.976** against `.233`'s
published **1.03** — same photograph, both crops clean, **5.4 % from crop choice alone**, eighteen times the gap
`.290` celebrated. **The band's endpoints carry ~±5 % crop-choice uncertainty, so "matched to 0.003" is not
meaningful.** What survives is `.234`'s original, weaker, robust claim: the app's ratio sits *inside* the
photographic spread, which ±5 % does not threaten because the spread is ~0.9–1.1.

The set stays n=4 and the published ratios stand (`.233`'s 1.03 retained rather than replaced by 0.976 —
re-cropping every historical reference is a separate job, but both numbers are now on record).

### Method note

`.288`–`.291` each proposed something the next round had to qualify or withdraw: a provenance criterion that
over-rejects, a chroma criterion built on n=2, a precision claim beyond the method's resolution. All three came
from generalising a single new measurement immediately. **Do not turn one measurement into a criterion.**

### Next

Thread 2 is at n=4 with 4.8 % marginal yield and its screen now audited. Thread 1's tracer-free route is closed
by this round's negative; its tracer route is blocked behind (u). (p) is confirmed and awaiting a decision.
**The measurement threads are at a genuine stopping point — the remaining work is the decisions.**

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .293 — item (u) is not two states; it is one spatially varying cold cast whose extent varies

Two of this round's own hypotheses were refuted, and the third finding overturns how (u) has been described
since `.285`.

### Pose refuted

The frame mean is a continuum while the anchors are binary; since world-anchored values are framing-invariant
(`.285`), a wandering camera would move the mean and leave anchors fixed — and `.286` showed the camera *can*
move. Two runs, full logs (15:07, 15:15 +08):

| | `reached` | drift | raster anchors | state | traced anchors |
| --- | --- | --- | --- | --- | --- |
| run 1 | [7.33, 3.4] | 0.37 | 118.2 / 128.3 | B (frameL 112.7) | 118.9 / 117.3 |
| run 2 | [7.33, 3.4] | 0.37 | 118.1 / 128.3 | A (frameL 156.2) | 172.1 / 175.3 |

Identical pose, identical raster, opposite states. (u) is downstream of pose and of the rasteriser.

### Spatially local, not global

3×3 grid compared cell-by-cell across frames, so content is controlled:

| cell | mixed (`tm-1`) | all-B (`u1`) | all-A (`u2`) |
| --- | --- | --- | --- |
| (0,0) | +2.6 | +7.4 | −11.9 |
| (0,2) | −12.9 | +3.3 | −14.0 |

One render contains both behaviours in different regions — which explains binary anchors, the continuum of
frame means, and `.287`'s recapture stability all at once.

### Not per-tile

`tracer.tiles` is 3 at 1920×1080, so per-tile assignment would step at x = 640/1280. A 24-column R−B profile
over y = 200–500:

```
tm-1   +1.3 +1.2 +1.2 +1.3 +1.2 +1.2 +1.0 +0.6 -0.3 -2.1 -4.0 -6.3 -8.7 -11.2 -13.5 -13.8 -13.8 ...
u2     -8.6 -8.7 -8.4 -8.9 -10.3 -11.6 -13.0 -13.7 -13.8 -13.8 -13.8 -13.8 ...
```

Smooth gradients, same right-hand asymptote (−13.8), differing only on the left (+1.3 vs −8.6).

### The correct description

**One spatially varying cold cast whose extent varies between runs.** Looking settles which is healthy: the
good frame is warm on the far side, cold near the glazing, with a clean diagonal transition across the ceiling
— cool skylight near the aperture, warmer bounce away from it. The anomalous frame is cold everywhere at the
saturated value. **The anomaly is a missing falloff, not a colour shift.**

This means `.285`'s discriminator measured the wrong thing: a whole-frame mean summarises a spatial field with
one number, so its "two tight clusters" were partly an artefact of that summary.

### A replacement built, failed, reverted

| frame | left | right | falloff | verdict |
| --- | --- | --- | --- | --- |
| `u1` (known healthy) | +3.8 | +5.6 | **−1.8** | would be ANOMALOUS |
| `tm-1` | −2.3 | −6.1 | +3.8 | ANOMALOUS |
| `u2` | −11.3 | −6.7 | −4.6 | ANOMALOUS |

Calls every frame anomalous including the healthy one: over the full frame height the warm furniture in the
lower third swamps a gradient that exists only in the upper wall/ceiling band. **Reverted** — revert-and-report
beats an unverified fix, and shipping a classifier that misclassifies the one known-good frame is worse than
keeping the flawed one. The profile ships as an opt-in diagnostic (`PTPROFILE=1`).

### Status

Known: (u) is downstream of pose and the rasteriser, spatially varying, not tiled; the near-glazing value is
invariant; the anomaly is a missing falloff. Unknown: what makes the extent vary. **Nine candidates eliminated
across `.284`–`.293`; no mechanism proposed.**

### Method note

The failed classifier failed the same way four earlier rounds did: **a statistic over a whole frame mixes
regions with different content.** `.282` measured one dead patch; `.285` averaged a field; `.293` averaged
across furniture. **A frame-wide statistic needs its region declared, or it measures nothing in particular.**

Nothing changed in `src/`. The probe gains `PTPROFILE=1`.

---

## Round .294 — (u) at n=24 instead of n=3: three discrete classes, and `.293`'s claim came from the wrong pair

`.293` asked whether the cold-cast extent is bimodal or continuous and answered the surrounding questions from
three frames. Every bedroom3 traced frame from `.280` on is still on disk at the same room, pose and finish, so
the distribution was free.

### Measurement

Upper wall/ceiling band (y = 0.19–0.46 — the region `.293` established the gradient lives in; the lower third
is furniture), left third vs right third R−B, plus whole-frame mean. All frames 1920×1080,
`WINDOW=bedroom3 PITCH=0.30`, white walls, medium tier, photographic look, hour 13.

| class | n | band L R−B | band R R−B | falloff | frameL |
| --- | --- | --- | --- | --- | --- |
| A | 12 | −10.1 … −10.6 | −12.8 | 2.2 – 2.7 | 155.7 – 156.5 |
| B | 10 | +6.0 … +7.1 | +2.6 … +3.0 | 3.3 – 4.1 | 112.3 – 114.9 |
| M | 2 | +1.1 … +1.4 | −12.6 … −12.7 | 13.8 – 14.0 | 139.5 – 139.7 |

Three classes, each tight to under one count across a dozen runs. **A 50 %, B 42 %, M 8 %.**

### `.293`'s central claim is wrong

It stated both states share the near-glazing asymptote (−13.8), hence (u) is "one spatially varying cold cast
whose extent varies". That came from profiling **`tm-1` against `u2`** — classes **M and A**, both cold on the
right. **No class-B frame was profiled.** Class B's right band is **+2.8**.

So **A and B differ globally across the upper band** — cold throughout versus warm throughout — not in the
extent of a gradient. Only the two M frames are spatial mixtures, and they are 8 % of runs. The error was
structural: with three frames to hand, two were the same class.

### Survives / withdrawn

Survives: pose and the rasteriser ruled out (identical arrival and raster anchors across opposite states); the
per-tile hypothesis dead (no step at tile edges); class M frames genuinely contain both behaviours spatially.
Withdrawn: the shared-asymptote claim, and the description of (u) as primarily a varying-extent phenomenon. It
is primarily a **global** upper-band difference with an occasional mixed class.

### `.285` partly vindicated, `.286` validated

`.285` reported two tight clusters with no intermediates and `.293` called that an artefact of averaging a
field. At n=24 the clusters are real and tight — `.285` was right about discreteness. And **`.286`'s UNKNOWN
bucket is exactly what catches class M**, at 8 % about one run in twelve: the single 139.5 outlier `.285` saw
and `.286` reclassified. Two rounds of criticism were each half right; the version now in the probe is correct.

### On the cause

The tracer's environment is the hardcoded cold `GradientEquirectTexture` (item (p), confirmed in `.287`). Class
A is cold throughout and ~43 counts brighter; class B warm throughout and darker. That reads as
environment-dominated vs bounce-dominated — **not published as a mechanism.** Ten candidates eliminated across
`.284`–`.294`, and every mechanism proposed in that span was refuted by a later round.

### Method note

`.282` measured one dead patch; `.293` compared two frames of the same class. Both published conclusions that
more of the *already available* data refuted. This round's data cost nothing — it sat in `/tmp` throughout
`.285`–`.293`, which spent ~twenty probe runs generating exactly the frames needed and then reasoned from three.
**Before running a new measurement, check whether the answer is already in the outputs of the old ones.**

Nothing changed in `src/` or in the probe — the discriminator in place classifies all three classes correctly.

---

## Round .295 — free audit of every saved traced frame: which past conclusions (u) actually corrupted

`.294` said to check old outputs before running anything new. Doing that again answers the arc's largest
outstanding risk — did the published within-tracer A/Bs compare frames from different (u) classes? — at zero
cost, since all ~48 traced frames from `.249` on are still on disk.

### Method, and its limit

`.294`'s classifier (upper band y = 0.19–0.46, left/right third R−B, plus frame mean) was calibrated on
**white-walled bedroom3**. Deliberately recoloured arms move those same bands by design, so they **cannot** be
class-assigned. Every claim below is confined to white-finish frames at a shared pose.

### 1. The floor-finish A/Bs are clean

| pair | band L | band R | frameL |
| --- | --- | --- | --- |
| `ld-floor-tile-white` / `-wood-ebony` | 3.5 / 2.9 | 0.9 / −0.1 | 135.8 / 133.7 |
| `ld-fa-floor-tile-white` / `-wood-ebony` | 15.5 / 14.7 | −2.7 / −4.7 | 116.5 / 105.7 |
| `ld-fb-floor-tile-white` / `-wood-ebony` | 19.4 / 22.3 | 2.3 / 6.0 | 118.9 / 99.3 |

Within-pair band differences are **0.6–2.9 counts** against the **~17** separating (u)'s classes (and ~43 in
frame mean). No pair straddles a class — those A/Bs measured the floor. First time any of the arc's traced A/Bs
has been *shown* clean rather than assumed so.

### 2. `.281`'s convergence pair was two class-A frames

`ld-lp150` / `ld-lp250`: band L −8.4 / −5.2, frame mean 158.8 / 160.7 — both cold-banded, both ~159–161, the
class-A signature, while white livingDining frames at the eye-level pose are warm-banded. `.281`'s "converged at
150, 0.06–0.32 % agreement" was two frames of the same class agreeing. `.282` suspected this and could not
demonstrate it; it is now demonstrated, and not because of a placeholder or a denoise swap.

### 3. The bedroom2 anomaly, finally attributed

`.277`–`.279` reported a bedroom2 white arm at 175.4 / 181.1, ~31–35 % high. `.280` blamed **sample count**;
`.284` blamed the **denoise swap**. The saved frame:

```
ld-b2t (bedroom2, white)   band L = -9.4   band R = -11.4   frameL = 160.0
```

The class-A signature, in a room and finish where comparable livingDining frames are warm-banded at ~125–137.
**The white arm was a class-A frame.** So the anomaly was neither sample count nor the denoise stage but (u)
class assignment. `.280`'s *withdrawal* of those rounds stands; its reason and `.284`'s replacement reason are
both wrong.

### Position on the arc's traced results

Not "all traced numbers are void" (`.282`), nor fully restored (`.284`). Specifically:

- **clean:** the three floor-finish A/Bs
- **same-class artefact:** `.281`'s convergence claim
- **class-straddled, void:** `.277`–`.279`'s bedroom2 comparison
- **not auditable by this method:** the recoloured arms of `.269`, `.270`, `.276` — status unknown, and saying
  the audit cannot reach them is better than guessing

### Method note

Three rounds attributed the bedroom2 discrepancy to three different causes — sample count, the denoise swap,
(u) class — and only the third used the frame that was on disk the whole time. `.280` and `.284` each reasoned
from the numbers those runs printed; the image they saved carried the answer. **"Look at the frame" applies to
old frames too, not only the one currently being produced.**

Nothing changed in `src/` or in the probe. (u)'s cause remains unidentified; this round identifies its
consequences.

---

## Round .296 — state of knowledge, `.230`–`.295`: what stands, what is withdrawn, what is unknown

Sixteen of the last twenty rounds corrected an earlier one. The record is therefore internally
self-contradictory when read front-to-back: several claims are asserted, withdrawn, restored and re-attributed
across separate entries, and three separate causes were published for one anomaly. **The pending decisions on
items (l)–(u) cannot be made from that without reading all sixty-six entries.** This round derives each claim's
*current* status from its chain of corrections. No new measurement; the deliverable is the index.

### Claims that STAND

| claim | round | why it survives |
| --- | --- | --- |
| **Colour bleed in the rasteriser is exactly zero** | `.268` | A raster A/B with no confound available. Never depended on the tracer, so untouched by items (t)/(u) and by every tracer correction since. **The arc's most load-bearing positive result.** |
| **Every HQ render is gradient-lit by default** | `.286`, `.287` | Inferred from `store.hdriId` defaulting to null, then **confirmed by direct observation** of the branch `buildTracerScene` takes. Item (p), escalated. |
| **(u) has three discrete classes: A 50 %, B 42 %, M 8 %** | `.294` | n=24, content-controlled, each class tight to <1 count. Superseded `.285`'s two-state and `.293`'s gradient descriptions. |
| **The three floor-finish A/Bs are class-clean** | `.295` | Within-pair band differences 0.6–2.9 counts against ~17 between classes. |
| **The qualifying photograph band is 0.91–1.11, app at 0.93 inside it** | `.234`, `.288`, `.290` | n=4. Robust to the ±5 % crop-choice uncertainty `.292` measured, because the spread is wide. |
| **A reference photograph's framing is known: 4:3, ≈26 mm** | `.288` | From Commons `extmetadata`, not inference. Answers half of thread 1's stated blocker. |
| **The anchor metric is framing-invariant** | `.285` | Same world point reads 158.5/161.4 vs 158.9/161.4 at two pitches. Answers the other half of thread 1's blocker. |
| **Patch means are scale-invariant; thumbnails are valid for them** | `.289` | 1.106 from both a 1280 px thumbnail and a 4032 px original. **Not** valid for micro-contrast. |
| **The HQ mirror ceiling is fixed** | `.253` | `pbrStandInFor`; the arc's only shipped `src/` change, with unit tests. |

### Claims that are WITHDRAWN

| claim | asserted | withdrawn | note |
| --- | --- | --- | --- |
| `.188`'s ceiling deficit | `.188` | `.234`, and again `.255` | Revived by `.253`, withdrawn again when `.255` found the tracer runs a different lighting rig. Retired. |
| The wall-falloff deviation | `.226`–`.236` | `.247`, metric retired `.249` | Framing-dependent; the metric never measured a wall. |
| "Absent interreflection causes the wall falloff" | `.226` | `.251` | Real GI does not produce the photograph's falloff. The arc's founding diagnosis. |
| `.277`–`.279`'s bedroom findings | `.277`–`.279` | `.280` | Withdrawal stands; its *reason* does not — see below. |
| `.282`'s "the canvas never showed the path trace" | `.282` | `.283` | Screenshots show the render displays normally. |
| Item (t), the AI-denoise radiometric shift | `.283` | `.285` | One-variable A/B: 1.1–1.6 %, not ~30 %. |
| `.293`'s shared-asymptote / varying-extent model of (u) | `.293` | `.294` | Built on two frames of the same class; no class-B frame was profiled. |
| `.291`'s chroma-agreement criterion | `.291` | `.292` | Refuted before adoption; would reject a qualifying reference. |
| `.290`'s "app matched to within 0.003" | `.290` | `.292` | Crop choice alone moves one photograph 5.4 %. |
| `.292`'s ceiling-warmth GI signature | `.292` | `.292` | Refuted in the same round at n=3; tracks floor colour, not GI. |

### Claims RE-ATTRIBUTED (the withdrawal stood, the reason did not)

The bedroom2 anomaly of `.277`–`.279` was explained three times:

| round | cause proposed | status |
| --- | --- | --- |
| `.280` | sample count (unconverged at 150) | refuted by `.284` (+5.6 % over 6→256 samples) |
| `.284` | the AI-denoise swap | refuted by `.285` (denoise is neutral) and `.295` |
| `.295` | **(u) class straddling** — the white arm was a class-A frame | current |

Similarly `.281`'s "livingDining converged at 150" was withdrawn by `.282` on a false premise, restored by
`.284`, and finally shown by `.295` to be a **same-class artefact** (both frames class A).

### UNKNOWN — genuinely open, not quietly assumed

- **(u)'s cause.** Ten candidates eliminated across `.284`–`.294`: sample count, denoise stage, exposure, the
  env branch (twice), tone mapping, denoise/blank-render failure, per-capture tile race, camera pose, per-tile
  assignment. Every mechanism proposed in that span was refuted by a later round. **No mechanism is proposed.**
- **The class status of the recoloured traced arms** in `.269`, `.270`, `.276`. `.295`'s classifier reads the
  same bands a deliberate recolour moves, so it cannot reach them. Their magnitudes are neither confirmed nor
  void.
- **`.281`'s aperture and pose refutations.** `.284` restored them as like-for-like raw-trace comparisons, but
  not every frame involved has a determinable class, so they are better described as unknown than as standing.
- **Whether class A or class B is the correct render.** `.293` argued B looks physically sensible (cool near the
  aperture, warm away from it) but that was on the mis-paired comparison `.294` overturned.

### Decisions outstanding — the actual blocking list

| item | state | what is needed |
| --- | --- | --- |
| **(p) HQ-FILL-RIG** | confirmed by direct observation `.287` | **A real `src/` fix** — feed the tracer the scene's own lighting instead of the hardcoded cold gradient. Look-and-cost call. **Highest value.** |
| (l) WINDOW-LUMINANCE | diagnosed, priced ≈×30 `.259` | look call |
| (m) PHOTO-VIGNETTE | built, measured, reverted `.244` | look call |
| (n) HQ-LAMBERT-CEILING | fix 1 shipped `.253` | fix 2 call (near-moot) |
| (q) HQ-GLAZING-OPAQUE | fix works but incomplete alone `.257` | call |
| (r) BACKDROP-LOWPASS | proven recoverable `.265` | render call |
| (s) ALBEDO-FILL | narrowed to luminance only `.272` | call; calibration used traced targets of unknown class |
| (u) HQ-TRACE-NONDETERMINISM | three classes measured `.294`, consequences audited `.295` | cause unidentified; **blocks thread 1** |

### Method rules the arc earned, consolidated

1. Look at the crop/frame — and **at old frames too** (`.295`: three rounds mis-attributed an anomaly whose
   answer was on disk).
2. **A frame-wide statistic needs its region declared** (`.282` measured a dead patch; `.293` averaged across
   furniture).
3. **Do not turn one measurement into a criterion** (`.291` built a criterion on n=2; `.292` killed it at n=3).
4. **Check whether a candidate cause is even a variable before A/B-ing it** (`.286`: the env branch is constant).
5. **Wire up the observation channels before the hypotheses** (`.287`: the probe had never listened to the page
   console; four causes fell in one round once it could).
6. **Before running a new measurement, check the outputs of the old ones** (`.294`, `.295`: both free, both
   overturned a published conclusion).
7. **When an instrument disagrees with itself, check a different observation channel before theorising**
   (`.283`).
8. Provenance is a prior that says look harder, not a verdict (`.292`).
9. Metrics are pose-, method-, tier-, framing- **and (u)-class-**dependent. Quote none without stating all.

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .298 — class A is physically impossible: its ceiling out-radiates the window

`.296` listed "which of (u)'s classes is the correct render" as unknown, `.293`'s attempt having rested on the
mis-paired comparison `.294` overturned. A physical constraint answers it without knowing (u)'s cause: **in a
room lit only through a window, no interior surface can be brighter than the aperture.** Measured on frames
already on disk; no probe runs.

| frame | class | glazing | ceiling | wall-L | wall-R | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `u1` | B | 166.9 | 115.2 | 116.1 | 106.2 | interior 51–61 counts below the aperture ✔ |
| `tm-1` | M | 169.5 | 127.4 | 138.2 | 153.4 | below ✔ |
| `u2` | **A** | 170.9 | **181.5** | 157.7 | 157.2 | **ceiling out-radiates the window by 10.6** ✘ |

Maxima agree (ceiling 184 vs glazing 173); all glazing/ceiling patches clean at sd 0.7–1.3. Looked at, since
this is a headline claim: side by side, class B's pane is plainly brighter than a warm-grey ceiling, while class
A's ceiling reads as light as the pane or slightly lighter. Both crops match their numbers.

AgX compresses the bright end, so 10.6 displayed counts near 175 correspond to a larger radiance gap — the
violation is **understated**.

### Consequences

- **Class B is the correct render; class A is a bug.** `.296`'s unknown is answered.
- **(u) is not nondeterminism, it is half of all HQ stills being wrong.** Class A is 12 of 24 runs at one pose,
  so a user pressing "Start render" has about even odds of a still whose ceiling emits more light than its
  window.
- **Class-A figures must be discarded, not merely labelled.** `.295`'s "record the class" is too weak: a class-A
  number measures an impossible render, not a dimmer one. Every class-A figure in the arc is void.
- **(u) now ranks level with (p)** — both make the photoreal showcase wrong by default, (p) always and (u) half
  the time.

### A constraint on the cause, and nothing more

Whatever (u) is, it adds energy to interior surfaces the aperture cannot account for. `root.environment` lights
every surface in three's IBL regardless of whether it can see the sky, and the tracer's environment is the
hardcoded cold gradient (item (p), confirmed `.287`) — which would also explain class A being *cold* as well as
bright. **Untested; not published as a mechanism.** Eleven candidates eliminated, and every mechanism proposed
in `.280`–`.294` was refuted by a later round.

### Reusable, and documented rather than shipped

"Does any interior surface out-radiate the aperture?" is cheap, physical and independent of (u)'s cause — a
better sanity check than any chroma statistic this arc built. It is **not** a probe knob: the patches are
pose-specific and `.293` shipped a pose-specific classifier that misclassified a known-good frame. It is in
`docs/hq-tracer-probe-notes.md` with the coordinates stated, so the caller declares the region.

Nothing changed in `src/` or in the probe. Docs only.

---

## Round .299 — (u) localised: the environment is identical in both classes, class A delivers 2.2× more of it inside

Eleven candidates eliminated, every mechanism refuted. `.298` left one lead and said it was one experiment from
confirmed or dead. It is confirmed as a **localisation** — the first real narrowing since `.284`.

### The experiment

Temporary `src/` instrumentation (added, observed, **reverted**, `src/` verified clean), same pattern as `.287`:
the tracer's `GradientEquirectTexture` set to **pure uniform green** (both colours `0x00ff00`, so no gradient
confounds the reading). `root.background` takes the same texture, so **the glazing shows the environment
directly and is a full-environment reference in the same frame**. Metric `green = G − (R+B)/2`.

Three runs, bedroom3 `PITCH=0.30`, white walls, medium tier, photographic look, hour 13, 256 samples
(15:49, 15:53, 16:01 +08):

| run | frame L | glazing green | ceiling green | wall-L | wall-R |
| --- | --- | --- | --- | --- | --- |
| `g1` bright | 170.9 | 59.9 | 79.0 | 71.9 | 77.8 |
| `g3` bright | 170.4 | 59.4 | 79.0 | 74.5 | 79.1 |
| `g2` dim | 128.2 | 58.2 | 36.5 | 42.0 | 43.2 |
| grey-env baseline | — | 1.1–1.2 | 1.1–1.3 | 2.1 | 2.1 |

### Three findings

1. **Interior lighting is environment-dominated** — greenness 36–79 vs ~2 baseline. Item (p) restated as a
   magnitude: the hardcoded gradient is the principal light on walls and ceiling, not a minor fill.
2. **The environment itself is invariant across classes** — glazing greenness 58.2 / 59.4 / 59.9, a 2.8 %
   spread spanning both classes. The control that makes finding 3 meaningful, and the reason `.287`'s "same env
   branch" was correct but insufficient.
3. **Interior surfaces receive 1.7–2.2× more environment light in the bright class** — ceiling 79.0 vs 36.5
   (2.16×), walls 1.71–1.83×. The bright class **replicates to the digit** (79.0 in both), so this is not noise.

### What it explains

(u) is a variation in the **transport** of environment light to interior surfaces, with the environment,
exposure, tone mapping, denoise stage, sample count, camera pose and tile structure all previously eliminated.
That accounts for the class-A signature the arc has puzzled over since `.285` — brighter **and** colder, because
more of the *cold* gradient reaches the interior — and for `.298`'s physical violation, since a ceiling can
out-radiate the aperture only if lit by something the aperture does not mediate.

### Still open, precisely

Two families, not separated by this experiment: a **visibility/occlusion** difference (the environment reaching
surfaces that cannot see it, e.g. an unoccluded IBL term) versus an **intensity/importance-sampling** difference
(same visibility, ~double weight). The discriminating test is a surface that **provably cannot see the
aperture** — a windowless room, or the underside of a slab — under the green environment: an occlusion fault
lights it green, an intensity fault leaves it dark in both classes. **No mechanism claimed until that runs.**

### Method note

Every earlier attempt compared the classes on quantities that mix all light sources, so none could attribute
anything. **When a suspect source cannot be removed, dye it** — a dyed source is separable, and putting the same
texture on `root.background` gives a built-in control in the same frame. Added to
`docs/hq-tracer-probe-notes.md`.

No `src/` change survives — the green environment was reverted and verified. Probe unchanged.

---

## Round .300 — the occlusion/intensity dichotomy was wrong: visibility is ignored in BOTH classes, and the class difference is saturation

`.299` named two families and one discriminating test: a surface that provably cannot see the aperture, under
the forced green environment. The test **refutes the dichotomy** rather than choosing a half.

### Placement verified first

Patches were composited onto the frame and looked at before anything rested on them — which corrected a
standing assumption: the `wall-R` patch used since `.298` (`0.84, 0.42`) is on the right **side** wall, not the
window wall. The new `winwall-L/R` patches do lie on the **window wall**, coplanar with the aperture, seeing
zero direct sky. Three of the arc's costliest errors were mis-placed patches (`.282`, `.291`, `.293`); marking
them cost one free render.

### Result

| | glazing | ceiling | winwall-L / -R (zero sky) | winwall ÷ ceiling |
| --- | --- | --- | --- | --- |
| `g1` bright | 59.9 · L=193 · sd 0.1 | 79.0 · L=193 · **sd 0.0** | 76.0 / 78.9 | 0.980 |
| `g3` bright | 59.4 · L=193 | 79.0 · L=193 · **sd 0.0** | 77.4 / 80.3 | 0.998 |
| `g2` dim | 58.2 · L=190 | 36.5 · L=127 · sd 1.1 | 38.5 / 46.7 | 1.168 |

1. **Environment light ignores sky visibility in both classes** — a zero-sky wall is as green as the ceiling
   every time (0.98 / 1.00 / 1.17). Present in the good class too, so **not** (u)'s differentiator; a separate
   defect, belonging with item (p).
2. **The class difference is the interior saturating at the environment's own level** — bright class ceiling
   **L = 193, sd = 0.0** (every pixel identical), matching the glazing's 193. That is a constant
   direction-independent environment term, not path-traced transport. Dim class: 127, sd 1.1.
3. **`.299`'s 2.2× is a lower bound** — a saturated patch cannot report energy arriving past saturation.

### What it explains, and what it does not

`.298`'s physical violation now has a clean account: the ceiling out-radiates the aperture because it is lit to
the environment's full level while the aperture's own view of that environment is attenuated by the glazing
tint. **Why the magnitude differs run to run is still unidentified** — thirteen candidates eliminated, and the
discipline holding since `.294` holds here: two measured signatures, no cause.

The fix target is sharper though: the interior should never render at the environment's own level with zero
variance, and a zero-sky surface should never match a sky-facing one.

### Method note

The most useful five minutes were spent drawing rectangles on a frame and looking at them, which overturned a
three-round-old assumption before it could contaminate a conclusion. **Mark the patch on the picture before you
trust the patch.** Added to `docs/hq-tracer-probe-notes.md`.

No `src/` change — `.299`'s green diagnostic was reverted and verified absent. Probe unchanged.

---

## Round .301 — the tracer's ceiling ignores its own albedo: recolour it black, raster goes to 0.9, traced still stays at 192

This round set out to check `.300`'s own first finding and found something larger by accident.

### The check .300 needed

`.300` concluded "environment light ignores sky visibility in both classes" because a zero-sky wall was as green
as the ceiling. But in a **white** room interreflection is strong and near-uniform, which produces that pattern
legitimately. The discriminator is to suppress bounce. `RECOLOR` was extended to take several `from:to` pairs
(one at a time left the ceiling bouncing), and the room was repainted `f5f5f0:141414;fafafa:141414` — 113
surfaces, 99 wall planes + 14 ceiling planes, per `RECOLORCHECK`.

| | glazing | ceiling | sidewall-L | winwall-L | winwall-R |
| --- | --- | --- | --- | --- | --- |
| white room (`g1`) | L=193 | L=193 | L=171 | L=164 | L=161 |
| dark room (`d1`) | L=192 | **L=192** | L=24 | L=9 | L=7 |

Walls fell 7–23× while the sky-facing glazing held. **So wall greenness tracks albedo as transport should, and
`.300`'s finding 1 is corrected: no occlusion fault is demonstrated on the walls.**

### The ceiling did not move

193 → 192, while every wall collapsed. Same run's raster settles which side is wrong:

| `d1`, ceiling patch | value |
| --- | --- |
| raster | **L = 0.9** |
| traced | **L = 192.1** |
| traced, white ceiling (`g1`) | L = 192.7 |

**The rasteriser renders the black ceiling correctly; the tracer renders 192 either way.** Filed as item (v).

And 192 is the environment's own level — the glazing, showing `root.background`, reads 192 in the same frame,
and `.300` measured this patch at L = 193 with **sd = 0.0**. Three independent observations that the traced
ceiling renders *as the environment*, not as a surface.

### Lead, untested

If the ceiling is **absent or transparent in the tracer snapshot**, the camera sees `root.background` through
it. Predicts and matches: equality with the glazing; zero variance; recolour immunity; greenness *higher* than
the glazing (78.2 vs 60.3, no glazing tint in the way); class A's cold cast under the grey gradient; `.298`'s
ceiling out-radiating the aperture; `.252`'s "mirror ceiling" that `.253` may have replaced with a hole. Six
matched predictions, zero tests, and fourteen mechanisms in this arc refuted by a later round. **A lead.**

Verification named: instrument `buildTracerScene` to report whether the ceiling mesh is in the snapshot and
what material it carries, correlated with the (u) class.

### Consequence

Every traced *ceiling* figure (`.253`, `.254`, `.255`, tracer-based ceiling ÷ wall) measured a quantity that
does not depend on the ceiling. `.255` withdrew `.253`'s deficit citing "a different lighting rig"; the reason
is sharper and worse. The photographic band and the app's 0.93 are raster measurements and unaffected.

### Method note

Two rounds running have corrected their immediate predecessor by testing its weakest assumption first.
**Budget a round for auditing the last one.**

Green diagnostic reverted, `src/` verified clean. The probe keeps multi-pair `RECOLOR`, which is what made this
measurable.

---

## Round .302 — the one-round-old lead is refuted: the ceiling IS in the snapshot, correctly dark and correctly PBR

`.301` proposed the traced ceiling renders at the environment's level because it is **absent or transparent in
the tracer snapshot**, with six matched predictions. One run kills it.

### Direct observation

Temporary instrumentation in `buildTracerScene` (added, observed, reverted, `src/` verified clean) censuses
`root` by geometry, material type, colour and roughness. Room repainted `f5f5f0:141414;fafafa:141414`:

```
[PROBE] snapshot meshes=1104 distinct=180
[PROBE]   x99 PlaneGeometry#141414 MeshStandardMaterial r=0.92     <- walls
[PROBE]   x14 PlaneGeometry#141414 MeshStandardMaterial r=0.9      <- CEILINGS
```

The fourteen ceiling planes are **present**, carry the **recoloured** `#141414`, and are **correctly
substituted** from Lambert to `MeshStandardMaterial` at `SUBSTITUTE_ROUGHNESS = 0.9`. `.253`'s `pbrStandInFor`
does exactly its job. Fifteenth mechanism proposed and refuted in this arc.

### Two more eliminated free, from source

- **Traceability gate:** `buildTracerScene` skips meshes failing `mats.every(isTraceableMaterial)`, and that gate
  runs *before* `pbrStandInFor` — but `isTraceableMaterial` explicitly accepts `isMeshLambertMaterial`.
- **Back-face culling:** `Ceiling.tsx` uses `rotation={[Math.PI/2,0,0]}`, mapping `PlaneGeometry`'s `+Z` normal
  to `(0,−1,0)` — down into the room — so default `FrontSide` is correct from below, and `pbrStandInFor` copies
  `side`. (`RoomCeiling.tsx` deliberately uses `BackSide` for the other ceiling implementation: a genuine
  asymmetry between the two, but not the fault here, since `r=0.9` identifies the Lambert path.)

### Item (v) reproduced, more starkly

| | traced ceiling | traced glazing | raster ceiling |
| --- | --- | --- | --- |
| `d1` | 192.1 | 192.0 | 0.9 |
| `c1` | **181.5** | 169.0 | 0.9 |

A **black** ceiling out-radiating the window by 12.5 counts — worse than `.298`'s white-ceiling violation.

### Where the fault is

**Downstream of the snapshot.** The material handed to the tracer is right in colour, type, roughness,
orientation and presence. Whatever renders it at the environment's level does so *after* a correct hand-off —
in the tracer's own material conversion or shading. Much narrower than "somewhere in the HQ path".

### Method note

`.301`'s lead matched six independent observations and was still wrong, because all six are consequences of
"the ceiling renders as the environment" (true) and none discriminates *why*. **Matching predictions of a
symptom does not validate a mechanism; only a prediction the rivals disagree about does.** Added to
`docs/hq-tracer-probe-notes.md`.

Instrumentation reverted, `src/` verified clean.

---

## Round .303 — (u) and (v) are one fault: in half of HQ renders the ceiling is not rendered as a surface

`.302` narrowed the defect to "downstream of the snapshot", and its own method note said to write down what the
rivals predict first. Doing that produced a discriminator that was already half measured.

### The discriminator

`.300` measured the ceiling at 193 in the bright class but **127 with real structure** in the dim class — so the
ceiling *is* a surface in class B. If (v) were **independent**, a black ceiling would read bright in **every**
run; if (v) is a **symptom of (u)**, only in class A. The rivals disagree, which is what makes it a test.

Two runs, room repainted `f5f5f0:141414;fafafa:141414`, normal grey environment, bedroom3 `PITCH=0.30`, medium
tier, photographic look, hour 13, 256 samples (16:31, 16:34 +08):

| | frame L | traced ceiling | traced sidewall-L | traced winwall-R | raster ceiling |
| --- | --- | --- | --- | --- | --- |
| `k1` bright | 104.5 | **181.5** | 16.1 | 2.7 | **0.9** |
| `k2` dim | 29.9 | **1.0** · sd 0.00 | 1.2 | 0.0 | **0.9** |

The rasters are byte-identical, so only the tracer differs.

### The unified statement

**In class B the tracer renders the black ceiling correctly (1.0 vs raster 0.9); in class A it renders 181.5.**
(v) is not independent — it is what class A is:

> In roughly half of HQ renders, the ceiling is not rendered as a surface; the ceiling region shows the
> environment instead.

One wrongly-lit surface then floods the room: the *same black wall* reads **16.1 in class A vs 1.2 in class B**,
13×. That single statement accounts for every class-A symptom since `.285` — global brightness, the cold cast,
`.298`'s ceiling out-radiating the aperture, `.300`'s zero-variance patch, `.301`'s albedo immunity. The
"saturation", "occlusion" and "transport" framings of `.299`–`.300` are no longer needed.

### Geometry refuted, from data in hand

The 99 wall planes are also `PlaneGeometry` and render correctly, collapsing 7–23× with albedo (`.301`). Not a
BVH-misses-planes fault, not orientation — the walls are the control.

### Lead, with a prediction the rivals disagree about

The ceiling's one distinguishing property in the census: **it is the only substituted material** — 14 Lambert
planes swapped to `MeshStandardMaterial` by `.253`'s `pbrStandInFor`, while the 99 walls are natively Standard.
The swap is applied *after* `root.add(clone)`, inside a promise collected in `pending`.

**Test:** a **finished** ceiling goes through `RoomCeiling.tsx` with a native `MeshStandardMaterial`, never
substituted (`Ceiling.tsx` states this in its own comment). Substitution-linked ⇒ the fault never appears on a
finished ceiling. Ceiling-as-such ⇒ it appears just as often. **No mechanism claimed until that runs.**

Nothing changed in `src/` or in the probe.

---

## Round .304 — the substitution hypothesis is refuted; `.253`'s `pbrStandInFor` is cleared

`.303` named the ceiling's one distinguishing property — being **the only substituted material** — and set a
test with disagreeing rival outcomes.

### The test, without touching `src/`

New probe knob `CEILSTD=1` replaces every `MeshLambertMaterial` in the **live scene** with an equivalent native
`MeshStandardMaterial` (same colour, roughness 1, metalness 0, same `side`), built by cloning an existing
un-mapped Standard material since the page does not expose the three constructors. `pbrStandInFor` then has
nothing to do — confirmed by `CEILSTDCHECK {"swapped":14,"kinds":{"PlaneGeometry#141414":14}}`.

### Result: identical to the decimal

Room repainted `f5f5f0:141414;fafafa:141414`, normal grey environment, bedroom3 `PITCH=0.30`, medium tier,
photographic look, hour 13, 256 samples (16:43, 16:48 +08):

| | ceiling, class B | ceiling, class A | sidewall B / A |
| --- | --- | --- | --- |
| with substitution (`k2`/`k1`) | 1.0 | 181.5 | 1.2 / 16.1 |
| without substitution (`s1`/`s2`) | 1.0 | 181.5 | 1.2 / 15.7 |

Same magnitude, same bimodality, one class-A and one class-B run in two attempts — exactly as before.
**Refuted**; the sixteenth mechanism refuted in this arc.

### Side effect worth recording: the arc's only shipped change is cleared

`.253`'s `pbrStandInFor` is the one code change to come out of these rounds, and `.301` had it under suspicion
since the ceiling is exactly the surface it touches. The fault survives its complete removal, and `.302` showed
it does its job correctly in the snapshot census. **It stays.**

### What still distinguishes the ceiling

Not material type (this round); not geometry type — the 99 correctly-rendering plaster planes are also
`PlaneGeometry` (`.301`); not back-face orientation (`.302`); not snapshot presence (`.302`). What remains is
**where it is**: topmost surface, only large down-facing one, the thing between camera and environment on an
upward pitch.

### Next test

Hide the ceiling entirely — `buildTracerScene` honours the visibility chain, so an invisible ceiling is
genuinely absent rather than mis-shaded.

- **Sole cause ⇒** every run dark and *stable*; no bimodality.
- **Bimodality persists ⇒** the ceiling is a victim, not the cause, and (u) is about the environment's
  contribution merely showing up most visibly there.

### Status

Sixteen mechanisms refuted; `.303`'s characterisation unchanged and unchallenged — *in roughly half of HQ
renders the ceiling is not rendered as a surface; the ceiling region shows the environment.* Each elimination
narrows the fix and none has touched the statement, which is why (u) stays fixable on its symptom without the
final mechanistic step.

No `src/` change. The probe keeps `CEILSTD=1`, which documents a refuted hypothesis and is the cheap way to take
`pbrStandInFor` out of any future experiment.

---

## Round .305 — class A is quantitatively identical to the ceiling not being in the scene

`.304` left one test with disagreeing predictions: hide the ceiling, since `buildTracerScene` honours the
visibility chain and an invisible ceiling is genuinely **absent** rather than mis-shaded. The answer is sharper
than either predicted outcome.

New knob `HIDECEIL=1` sets `visible = false` on the ceiling planes —
`HIDECEILCHECK {"hidden":14,"kinds":{"PlaneGeometry#141414":14}}`. Room repainted dark, normal grey environment,
bedroom3 `PITCH=0.30`, medium tier, photographic look, hour 13, 256 samples (16:55, 16:59 +08):

| | frame L | glazing | ceiling | sidewall-L | winwall-R |
| --- | --- | --- | --- | --- | --- |
| ceiling hidden (`h1`) | 104.5 | 168.8 | **181.5** sd 0.88 | **16.1** sd 0.94 | **2.7** sd 0.66 |
| ceiling hidden (`h2`) | 104.4 | 168.9 | 181.5 sd 0.88 | 15.8 sd 0.92 | 2.7 sd 0.64 |
| class A, present (`k1`) | 104.5 | 168.8 | **181.5** sd 0.88 | **16.1** sd 0.92 | **2.7** sd 0.67 |
| class B, present (`k2`) | 29.9 | 164.9 | 1.0 sd 0.00 | 1.2 sd 0.39 | 0.0 sd 0.00 |

Every figure matches class A **including the standard deviations**, and the hidden case is **stable** (both runs
to 0.1) where the present case is bimodal.

### The exact statement

> In roughly half of HQ renders, the tracer renders as if the ceiling were not in the scene at all.

**This refutes the last rival, mis-shading.** A ceiling shaded as emissive or background would put the right
colour in the ceiling *region* but would still occlude and still bounce. The sidewall matches to 0.3 counts and
the window wall to 0.1 — in class A the ceiling **neither occludes nor bounces**. Not mis-shaded: absent from
the light transport.

Combined with `.302` (the ceiling *is* in the snapshot), the ceiling is **in `root` and absent from the
trace** — dropped downstream of `root`, i.e. in the **BVH**. First time this investigation has pointed at a
component rather than a behaviour.

### By-products

- **Fix-verification criterion:** after any fix, the traced ceiling must never equal the hidden-ceiling value.
  Sharper and cheaper than "looks right".
- **One-frame detector:** the class-A signature is known exactly, so a single run classifies without a repeat.

### Next test

Instrument the tracer's geometry/BVH population per run, correlated with class. **Missing from the BVH ⇒**
counts differ by exactly the ceiling planes. **In the BVH but not intersected ⇒** identical counts, and the
fault is traversal or the geometry's own data.

No `src/` change. The probe gains `HIDECEIL=1`, which produced the equivalence and generates a reference
class-A frame on demand.

---

## Round .306 — bisection complete on the app's side: the snapshot at `setScene` is identical in both classes

`.305` narrowed (u) to "the ceiling is in `root` and absent from the trace — dropped downstream of `root`". This
round bisects that gap.

### The measurement

`.302`'s census ran *inside* `buildTracerScene`; the snapshot then travels before
`tracer.setScene(snapshot, renderCamera)`. Temporary instrumentation (added, observed, reverted, `src/` verified
clean) censuses it again **at the hand-off**:

| run | frame L | class | at `setScene` |
| --- | --- | --- | --- |
| `b1` (17:06 +08) | 29.9 | B — correct render | `meshes=1104 darkPlanes=113 visible=true` |
| `b3x` (17:16 +08) | 104.4 | A — ceiling absent from trace | `meshes=1104 darkPlanes=113 visible=true` |

Identical: all 113 dark planes — 99 walls plus the 14 ceilings — present in both classes.

### The app is cleared, end to end

| stage | verdict | round |
| --- | --- | --- |
| `buildTracerScene` populates the snapshot | ceiling present, correct in every respect | .302 |
| Lambert→Standard substitution | removing it changes nothing | .304 |
| snapshot → `setScene` hand-off | identical in both classes | **.306** |
| inside `setScene` / BVH / traversal | **← the fault is here** | — |

**(u) is not a defect in the app's scene construction.** It is in `three-gpu-pathtracer`'s ingestion of a scene
handed over correctly and identically every time — so the app's options are a **workaround** (force or verify
the BVH build, await completion, rebuild on failure), not a fix to its own logic. That is a materially different
decision from what (u) looked like at `.285`, and worth knowing before budgeting the work.

### Honest limitation

`.305`'s predicted discriminator is **not** answered. The BVH was unreadable at every path tried (`tracer._bvh`,
`tracer.bvh`, `tracer.material.uniforms.bvh.value` → `n/a`); the tracer's own keys are only
`[rasterizeScene, rasterizeSceneCallback, _previousScene, scene]`. The **upstream** half is settled (input
identical); missing-from-BVH versus present-but-not-intersected still needs an access path into this library
version. Saying which half was answered matters — `.301` and `.303` both over-reached by treating a partial
answer as a whole one.

### Incidental lead

The tracer exposes **`_previousScene`**: `setScene` keeps state across calls. Each session builds a fresh tracer
so it should be empty on first use, but a cache inside the component now known to hold the fault is the first
thing to inspect once the access path is found. **A lead.**

### Operational

Batching two PT runs in one shell call exceeded the 10-minute command timeout and killed the second mid-render.
One run per call. Added to `docs/hq-tracer-probe-notes.md`.

Instrumentation reverted, `src/` verified clean.

---

## Round .307 — the ceiling IS in the merged geometry and the BVH IS built; and `.305`'s refutation of mis-shading was wrong

`.306` could not answer `.305`'s question for want of an access path. Reading the library source supplied one.

### The access path and the exact test

`three-gpu-pathtracer@0.0.24`'s `WebGLPathTracer` keeps `_generator` (`PathTracingSceneGenerator`), which merges
every mesh into one `geometry` and builds `bvh` from it. 14 `PlaneGeometry` ceiling planes contribute exactly
**56 vertices / 28 triangles**, so the rivals differ by an exact number.

| run | frame L | class | merged geometry |
| --- | --- | --- | --- |
| `g307a` (17:24 +08) | 29.9 | B — correct | `positions=930573 index=984120 bvh=object` |
| `g307b` (17:29 +08) | 30.1 | B — correct | `positions=930573 index=984120 bvh=object` |
| `g307c` (17:34 +08) | 104.2 | **A** | `positions=930573 index=984120 bvh=object` |

Identical to the integer. **Present-but-not-contributing**; "missing from the BVH" is refuted.

### Correction to .305

`.305` claimed to have refuted mis-shading, reasoning that a ceiling shaded as emissive or background "would
still occlude and still bounce". **That does not hold.** A surface returning *exactly the environment's
radiance* sends the walls precisely the light they would receive through a hole — the two are **radiometrically
indistinguishable**. `.305`'s numbers stand; its inference does not, and **mis-shading was never excluded**.

`.305`'s statement weakens from "renders as if the ceiling were not in the scene" to what the data supports:
*the ceiling region and the room's bounce are indistinguishable from a scene with no ceiling.* Whether the
ceiling is skipped or shaded-as-environment is exactly what remains open.

### A refuted guess, recorded because it is the natural one

I expected an async BVH race — `setScene` returning a promise, called without `await`, with `session.start()`
accumulating before the BVH exists. The source refutes it: `setScene` is **synchronous** unless `_buildAsync` is
set, and that is set only by `setSceneAsync`, which the app never calls. `generator.generate()` and
`_updateFromResults` run inline. Forty lines of reading killed the most plausible mechanism in this
investigation before it cost a run.

### Next lead, specific and untested

`PathTracingSceneGenerator.generate()` calls `updateMaterialIndexAttribute(geometry, materials, materials)`
**conditionally**, on `needsMaterialIndexUpdate` computed from `result.changeType` and a material-UUID
comparison against `this._materialUuids`. A conditional material-index update is exactly the shape of fault that
intermittently leaves triangles pointing at the wrong material, and "shaded as the environment" is what that
could look like.

Rivals disagree observably: a material-index fault predicts the ceiling is shaded as some *specific other scene
material*, whose value need not equal the environment's; a skip predicts exactly the environment. Class A's
ceiling reads 181.5 against the glazing's 168.8, so these are distinguishable in principle. Next step: read the
ceiling triangles' material index and compare against the ceiling material's slot.

### Status

Eighteen mechanisms refuted (adding the async race), one of my own claims corrected, and (u) localised to
*within* `PathTracingSceneGenerator` with a named conditional to inspect. `.305`'s fix-verification criterion is
unaffected.

Instrumentation reverted, `src/` verified clean.

---

## Round .308 — the material-index lead dies to reading; a latent library bug; and the renderer string confirmed at last

`.307` showed that reading the library source is free and kills mechanisms before they cost runs. This round is
mostly reading.

### Material-index lead refuted, statically

`.307` named the **conditional** `updateMaterialIndexAttribute` in `PathTracingSceneGenerator.generate()`. It
cannot be the fault: the condition is effectively **always true**. On the first call
`this._materialUuids === null` short-circuits it, and `WebGLPathTracer`'s constructor itself calls
`setScene(new Scene(), new PerspectiveCamera())` — so the app's real `setScene` is the *second* call, where
`changeType` is a rebuild (empty → 1104 meshes) and forces it true again. Nineteenth mechanism refuted.

### A latent library bug

`PathTracingSceneGenerator.js:180` compares `this._materialUuids.length !== length`, where **`length` is not in
scope** — the intended `materials.length` is declared three lines below, scoped to the `for` statement. In a
browser module a bare `length` resolves to `window.length` (frame count, 0), so the test is
`_materialUuids.length !== 0`, true whenever a material exists. Benign here (forces the update *on*), but a real
defect worth reporting upstream.

### Recorded so it is not re-derived

- Mesh collection uses `traverseVisible` (`three-mesh-bvh`'s `StaticGeometryGenerator`) — a second visibility
  filter, consistent with the app's own chain; `.306`/`.307` confirm nothing is dropped.
- `.304` already kills "async substitution order": the substituted materials are created in promise-resolution
  order, which was an attractive candidate, but with `CEILSTD=1` there is no substitution and the fault persists.

**Everything CPU-side is now identical across classes** — snapshot (`.306`), merged geometry and BVH (`.307`),
material index (`.308`). The remaining variability must be downstream, in the GPU-side upload or shader path.

### The renderer string, confirmed for the first time

The playbook's real-GPU section warns that a wrong ANGLE backend *"silently gives you SwiftShader anyway"* and
says to **always confirm the renderer string**. This probe launches with `--use-angle=metal` and had never
checked. It now does, permanently:

```
WEBGL RENDERER: ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)
```

Exactly the expected string on this Mac. **The arc's path-traced measurements were real-GPU throughout** — now
established rather than assumed.

### A debt named rather than left implicit

The playbook also says *"Before calling a headless finding a product defect, ask whether a real browser sees
it."* (u) was called a product defect across `.298`–`.307` without that check. The renderer string makes it
considerably more likely to be real — a real Chrome on macOS runs the same ANGLE/Metal backend on the same GPU —
but headless flags, compositor state and driver timing remain unexcluded. **(u)'s product-defect framing is
provisional until a real browser sees it**, and that is the next round.

No `src/` change. The probe gains a permanent renderer-string assertion.

---

## Round .309 — (u) is not a headless artefact: it reproduces headed, same magnitude, same signature

`.308` named a debt: the playbook says *"before calling a headless finding a product defect, ask whether a real
browser sees it"*, and (u) had been escalated across `.298`–`.307` without that check. This round pays it as far
as the session allows, and the answer strengthens the finding.

### What was available

Claude-in-Chrome needs a connected Chrome, which a non-interactive session lacks. The approximation is **headed
Chromium** (`HEADED=1`), exercising the real compositor, window surface and swap chain instead of the headless
offscreen path. `.308` had already established both modes run the same real GPU.

### Result

Room repainted dark, bedroom3 `PITCH=0.30`, medium tier, photographic look, hour 13, 256 samples (17:53, 17:57
+08):

| | renderer | frame L | glazing | ceiling | sidewall-L |
| --- | --- | --- | --- | --- | --- |
| headed `hd1` | ANGLE Metal, Apple M4 | 104.4 | 168.9 | **181.5** sd 0.88 | 15.9 |
| headed `hd2` | ANGLE Metal, Apple M4 | 104.2 | 169.0 | **181.5** sd 0.88 | 15.4 |
| headless class A | ANGLE Metal, Apple M4 | 104.5 | 168.8 | **181.5** sd 0.88 | 16.1 |
| headless class B | ANGLE Metal, Apple M4 | 29.9 | 164.9 | 1.0 sd 0.00 | 1.2 |

**The fault reproduces headed, matching class A exactly — including the ceiling's sd of 0.88.** (u) is not an
artefact of the headless rendering path.

### Severity: provisional → supported

Excluded: SwiftShader (`.308`), the headless path (`.309`). Untested: a user's *own* Chrome — profile,
extensions, default flags rather than puppeteer's `--no-sandbox --use-gl=angle --use-angle=metal --enable-gpu`.
Those flags force the backend real Chrome on macOS picks by default, so they narrow rather than widen the gap.
**(u) reproduces on the real GPU with a real compositor; the only untested difference is the launch
configuration.**

Observation, not a claim: both headed runs were class A where headless is ~50/50 — at n = 2, P ≈ 25 %, so
nothing is read into it. Across the dark-ceiling arm the classes remain roughly balanced.

### What it settles

The *reality* of the defect, not its cause. Nineteen mechanisms remain refuted and the CPU side is identical
across classes (`.306`–`.308`), leaving the GPU-side upload or shader path. But it removes the one objection
that would have made the whole investigation moot, before anyone spends engineering time on the item.

### Method note

**A severity claim carries its own verification debt, and naming the debt in the write-up is what makes it get
paid.** Six earlier rounds asserted "half of all HQ stills are wrong" with no such note and none prompted the
check; `.308` wrote it down and `.309` paid it one round later.

No `src/` change. The probe gains `HEADED=1`.

---

## Round .310 — no GL error accompanies the fault, and (u) is per-render: both classes back-to-back in one session

### 1. The upload does not report failure

`.306`–`.308` left the GPU-side upload as the only place the variability could live. Temporary instrumentation
(added, observed, reverted, `src/` verified clean) drained `gl.getError()` either side of `setScene`, on a
**class-A** run:

```
gl errors before setScene: none
gl limits: maxTexture=16384 max3D=2048 maxArray=2048 maxRenderbuffer=16384 lost=false
gl errors after setScene: none
```

No error, no context loss, no size pressure (930,573 positions need 57 rows of a 16384-wide texture). The faulty
class carries a completely clean GL state. Twentieth candidate eliminated.

### 2. The fault is per-render, not per-page

New `PT2=1` clicks **Re-render** and captures a second still in the same page session (run 18:08 +08):

| | frame L | glazing | ceiling | sidewall-L |
| --- | --- | --- | --- | --- |
| render 1 | 104.4 | 168.9 | **181.5** sd 0.88 | 15.8 |
| render 2 (Re-render) | 29.7 | 164.7 | **1.0** sd 0.00 | 1.2 |

Class A then class B, each matching its signature exactly. **First time both classes have been produced back to
back with everything else held constant** — same page, in-memory scene graph, dev server, wall-clock minute,
GPU, renderer string.

**Eliminates** anything set once per page (module init, first-context state, one-time shader compilation, boot
sequence) and **slow drifts** (thermal, memory pressure, dev-server state), since both classes occurred within
three minutes in one process.

**Nuance:** each render constructs a new `WebGLRenderer` on a new canvas, so the two do not share a GL context.
This eliminates *page*-level state, not per-context state. "Per-render" = "per `createHqRenderSession` call".

### The efficiency win is worth as much as the finding

`PT2=1` yields two class samples per boot instead of one, halving the cost of every future (u) experiment and
removing page-boot variance as a confound. With twenty candidates eliminated, the next rounds need cheap paired
samples more than another hypothesis.

### Status

(u) is bounded as: **decided per `createHqRenderSession` call, on the real GPU with a real compositor, with a
clean GL state, from CPU-side inputs identical to the integer.** `.305`'s fix-verification criterion unchanged.

Instrumentation reverted, `src/` verified clean. The probe keeps `PT2=1`.

---

## Round .311 — the AOV/denoise path refuted, and a tempting pattern killed inside the same round

### 1. AOV/denoise is not the cause

`captureAovPasses` runs immediately after `setScene`, on the same renderer and snapshot, and only when AI
denoise is armed — a good candidate, left open because `.285`'s `PTAI=off` arm happened to draw two class-B
runs. With `PTAI=off` (AOV passes never run) one boot produced both classes:

| `PTAI=off`, one session | frame L | glazing | ceiling | sidewall-L | class |
| --- | --- | --- | --- | --- | --- |
| render 1 | 104.2 | 169.0 | **181.5** sd 0.88 | 15.4 | A |
| render 2 | 29.8 | 164.9 | **1.0** sd 0.00 | 1.2 | B |

Twenty-first candidate eliminated. By-products: re-confirms `.310`'s per-render finding in a different
configuration, and confirms the denoise is radiometrically neutral **in class A too** (181.5 sd 0.88 with it
off) — `.285` had only verified class B.

### 2. A pattern tested and killed in the same round

Two consecutive pairs came out A-then-B, implying a cold-first-render effect with an obvious workaround. The
third pair:

| pair | render 1 | render 2 |
| --- | --- | --- |
| `.310` `p2a` | A | B |
| `.311` `ai1` (denoise off) | A | B |
| `.311` `ai2` | **A** | **A** |

*"The second render is always correct"* is **refuted**. At n = 2 it would have entered the record as a finding
with a workaround attached, and a later round would have withdrawn it — the pattern `.291`, `.292` and `.301`
each paid for.

### 3. Tallies, not impressions

| | class A | class B | share A |
| --- | --- | --- | --- |
| first render of a session | 12 | 5 | 71 % |
| second render (paired) | 1 | 2 | 33 % |

A first-vs-second difference is possible but **not established** at n = 3 second-renders. Both classes occur in
both positions, so position is not determinative. The 71 % also sits against the ~50 % quoted since `.294`,
which came from 24 frames at one pose and may deserve re-derivation now that position is a known variable.

### Where (u) stands

Decided per `createHqRenderSession` call; real GPU, real compositor; clean GL state; CPU inputs identical to the
integer; not the substitution, AOV/denoise, page-level state, headless, geometry, material type, environment
branch, tone mapping, exposure or sample count. What remains is inside the tracer's per-session GPU setup —
shader compilation, texture upload ordering, uninitialised state — none of it reachable from the probe without
library-side instrumentation.

**Assessment:** twenty-one candidates have fallen and the last five rounds narrowed location without reaching
cause. The item is already actionable — acceptance test written (`.305`), reproduction cheap and paired
(`.310`), confirmed on real hardware (`.309`). **Further diagnosis is lower value than a decision on the
workaround.**

### Method note

`.302`'s rule applies to *emerging patterns*, not only stated hypotheses. Two same-shaped observations felt like
a result; testing cost one run and prevented a withdrawal.

No `src/` change, no probe change.

---

## Round .312 — (p) priced: the hardcoded gradient is the majority of an HQ still's interior light. And class A's ceiling follows the background to black

`.311` judged further (u) diagnosis worth less than a decision, so this round prices the item that is ready for
one. (p) is confirmed (`.287`) but its cost was never measured. Zeroing the gradient leaves exactly what the
scene's own copied lights provide.

### Measured

Temporary instrumentation (added, observed, reverted, `src/` verified clean); bedroom3 `PITCH=0.30`, medium
tier, photographic look, hour 13, 256 samples, white room (run 18:37 +08):

| | frame mean | glazing | ceiling | sidewall-L | winwall-R | lampshade |
| --- | --- | --- | --- | --- | --- | --- |
| gradient zeroed (scene lights only) | **38.4** | 111.0 | **0.0** | **69.2** | **49.3** | **36.5** |
| normal, class B (correct) | 112.7 | 166.9 | 115.2 | 116.1 | 102.7 | 74.6 |
| normal, class A | 156.2 | 170.9 | 181.5 | 157.7 | 147.6 | 103.1 |

Removing the gradient cuts the frame mean **66 %**, the interior wall **40 %**, the window wall **52 %**, the
lampshade **51 %**. **The hardcoded sky supplies the majority of the interior light.**

**Arithmetic caveat:** these are displayed counts after AgX tone mapping. AgX is not a power curve, so no linear
"% of photons" figure is quoted — an inverse-curve guess would be the false precision `.290` was corrected for.
The drops are large enough that the conclusion does not depend on the curve.

### What the decision looks like

Fixing (p) is **not** swapping a wrong tint for a right one — it **replaces the dominant light source** in every
HQ still. The direction is visible: with only the scene's own lights the walls read **warm, with a natural
falloff and visible plaster texture**, where the gradient's contribution is cooler and brighter. **The fix makes
HQ stills warmer and darker, closer to the rasteriser's look** — a larger look call than the item's filing
suggested.

### Bonus: the strongest confirmation yet of (u)'s characterisation

This run was class A, and with a black background its ceiling reads **0.0** — a pure void, plainly visible.
Across three independent manipulations the class-A ceiling **follows the background**:

| background | class-A ceiling |
| --- | --- |
| green (`.299`) | greenness 79.0, above the glazing's 60 |
| grey gradient (default) | 181.5, cold, sd 0.88 |
| black (`.312`) | 0.0 |

`.303`–`.307` inferred this from an equivalence with a hidden ceiling; this is a **dose-response on the
suspected source**, which is stronger. It also re-confirms class A is unrelated to the ceiling's own material —
a black-background void is not a shading of `#fafafa`.

### Looked at

The frame shows the ceiling as an unmistakable black void with the cornice lit around its edge, and the walls
warmly lit with real texture. Both readings match the numbers.

Instrumentation reverted, `src/` verified clean. No probe change.

---

## Round .313 — the HQ still agrees with the raster to 2.8 % when the tracer works, 19 % off when (u) bites — so ceiling ÷ wall cannot see item (p)

`.312` showed the HQ still is dominated by a light source the user never chose. That raises the question this
arc exists to answer and has never asked head-on: **is the HQ still less photorealistic than the real-time
raster?** The one metric with photographic references is ceiling ÷ wall, and the probe captures both renders
from the same camera in one run — so the comparison is free and **pose-matched**.

Patch placement verified by marking it on the raster and looking; the ceiling patch is clear of the HUD toolbar
(toolbar ends y ≈ 66 of 788, patch starts y ≈ 79).

| run | render | ceiling | wall | ceiling ÷ wall |
| --- | --- | --- | --- | --- |
| `u1` (class B — working) | raster | 128.8 sd 1.64 | 133.5 sd 3.20 | **0.965** |
| `u1` | traced | 115.2 sd 1.25 | 116.1 sd 3.00 | **0.992** |
| `u2` (class A — (u) biting) | raster | 128.8 sd 1.65 | 133.5 sd 3.19 | **0.965** |
| `u2` | traced | 181.5 sd 0.88 | 157.7 sd 1.31 | **1.151** |

1. **Working tracer agrees with the raster to 0.027 (2.8 %)** — reassuring, and unexpected given the two use
   entirely different lighting rigs.
2. **Class A departs by 0.186 (19 %)** — so (u), not (p), is what pushes the HQ still away from the real-time
   render on this metric.
3. **Rasters identical across runs** (128.8 / 133.5), re-confirming the nondeterminism is tracer-only.

### The uncomfortable consequence

`.312` measured that the hardcoded gradient supplies **66 %** of an HQ still's frame mean. Yet ceiling ÷ wall
moves only **2.8 %** between the gradient-lit tracer and the scene-lit raster.

**So ceiling ÷ wall is a weak discriminator of lighting-rig fidelity.** The arc has used it as its photographic
anchor since `.188`, and spent dozens of rounds deriving, correcting and defending it — and it cannot detect a
defect that replaces most of the light in the frame. That does not make it wrong as a *photographic*
comparison; it bounds what it can conclude. **A metric that a two-thirds change in the dominant light source
moves by 2.8 % must not be read as evidence that the lighting is right.**

### Caveat on the band

The photographic band is 0.91–1.11 (n = 4) at the **canonical pose**, and `.232` established the ratio swings
0.68 → 0.96 on pitch. Here the raster reads 0.965, not the canonical 0.93 — consistent with that. So class A
exceeding the band's upper edge is **rough orientation, not a pose-matched claim**. The raster-vs-traced
comparison is pose-matched and is the part to rely on.

### For the pending decisions

(u) is the larger defect on the arc's own photographic metric (19 % vs 2.8 %) even though (p) is physically
larger. And (p)'s invisibility to this metric means **a fix for (p) cannot be validated by ceiling ÷ wall** — it
needs a look call on the image, which is what `.312` concluded from the frame.

No `src/` change, no probe change. Measured entirely from frames already on disk.

---

## Round .314 — chroma is the sensitive metric ceiling ÷ wall is not; it localises (p) to the ceiling and corrects `.312`

`.313` found the arc's primary metric cannot see (p): a 66 % change in the dominant light moves ceiling ÷ wall
by 2.8 %. This round looks for a sensitive quantity, and finds one with a correction attached.

Frames already on disk; bedroom3 `PITCH=0.30`, white room, medium tier, photographic look, hour 13, 256
samples; patches verified in `.300` and `.313`:

| condition | ceiling R−B | wall-L R−B | winwall-R R−B |
| --- | --- | --- | --- |
| **raster** — scene's own lights (reference) | **+13.6** | **+5.8** | **+6.3** |
| traced class B — scene + cold gradient | **+7.5** | **+4.8** | **+7.3** |
| traced, gradient zeroed — no ambient at all | 0.0 (void) | **+8.3** | **+15.1** |
| traced class A — (u) biting | **−14.4** | **−8.5** | **−6.2** |

### 1. Sensitive where ceiling ÷ wall was not

Class A departs from the raster by **20–28 counts** on every surface, and the gradient's effect on the *working*
tracer is visible: ceiling **+7.5 vs the raster's +13.6**, a **6.1-count** gap that ceiling ÷ wall reported as
2.8 %. The arc had an instrument that can see (p); it was not using it.

### 2. It localises (p)'s error

The working tracer's **wall** chroma matches the raster to ~**1 count**. The error is concentrated on the
**ceiling** — 6.1 counts too cool — the surface most exposed to the gradient, and the same one (u) destroys.

### 3. Correction to `.312`

`.312` concluded the fix makes stills *"warmer and darker, closer to the rasteriser's look"*. **Darker stands**
(38.4 vs 112.7). **Warmer does not**: the gradient-zeroed arm is *warmer than the raster* (+8.3 vs +5.8; +15.1
vs +6.3), so warming **overshoots** the reference. The current cold gradient is closer to the raster's wall
chroma than no ambient at all. `.312`'s claim came from looking at the frame, not from measuring against a
reference.

### 4. A distinction `.312` blurred

The gradient-zeroed arm is the **null** — no ambient whatsoever — **not** a preview of the fix, which would
supply the scene's own Ambient/Hemisphere lights. It correctly prices the gradient's contribution but does not
show what a fixed still would look like. Conflating them produced the wrong direction.

### 5. An acceptance test for (p) with no photographs

Traced interior chroma should match the raster's — same room, same pipeline, same white balance. Currently
**walls pass (~1 count), ceiling fails by 6.1**. Photographic anchoring is unavailable: `.267` established R−B
is white-balance invariant only *within* a frame, so absolute chroma cannot cross to a photograph with its own
white balance. The raster is the right reference precisely because it shares the pipeline.

### Where the decisions stand

(p) costs **6.1 counts of ceiling chroma** plus `.312`'s luminance error, with walls already correct — smaller
and more localised than "the dominant light source is wrong" implied. (u) remains the larger defect on both
metrics: 19 % on ceiling ÷ wall (`.313`), 20–28 counts of chroma here.

### Method note

Two rounds running, a conclusion drawn from *looking* at a frame failed when measured against a reference.
Looking is what catches contaminated measurements; it is not a substitute for one. **Use the frame to decide
what to measure, not what to conclude.**

No `src/` change, no probe change.

---

## Round .315 — chroma does have a photographic anchor (the within-frame Δ); class A fails it, but the anchor is weak and the pose check could not be run

`.314` stated chroma cannot be anchored photographically because `.267` established R−B is WB-invariant only
*within* a frame. Right about **absolute** chroma, wrong about the **difference**: ceiling minus wall R−B is
within-frame, hence WB-invariant, and crosses to a photograph. `.292` had already measured it on all three
references.

| source | ceiling R−B | wall R−B | ceiling − wall Δ |
| --- | --- | --- | --- |
| `Home_Staging_Beispiel` | +6.0 | +8.8 | **−2.8** |
| `Vogtsbauernhof` | +8.1 | +7.0 | **+1.1** |
| `At_La_Palma` | +16.0 | +2.4 | **+13.6** |
| app — raster | +13.6 | +5.8 | **+7.8** inside |
| app — traced class B | +7.5 | +4.8 | **+2.7** inside |
| app — traced class A | −14.4 | −8.5 | **−5.9** outside |

First photographically-anchored chroma result in the arc, and class A fails it.

### Why it is weak, stated up front

1. **The band is a 16.4-count spread on n = 3.** Class A misses the lower edge by 3.1. "Inside" is close to
   unfalsifiable; "outside by 3.1" is not much of a failure.
2. **`.292` already showed the quantity is non-systematic** — it straddles zero and tracks **floor colour**
   (white tile −2.8, warm terrazzo +13.6), which is why `.292` refuted it as a GI signature.
3. **Pose-matching is unresolved.** `.232` showed ceiling ÷ wall luminance swings 0.68 → 0.96 on pitch; Δ
   chroma's pose-dependence is untested.

### The pose test was attempted and defeated

Two raster-only runs (40 s for both, no tracer) at `PITCH=-0.06` and `+0.30`. Marking the eye-level frame shows
both patches invalid there: "ceiling" lands on the **window wall** beside the curtain, "wall" lands on the
**framed picture**. bedroom3's eye-level view has almost no croppable ceiling — a thin strip, partly behind the
HUD. Pose-dependence of Δ chroma remains **unmeasured**.

### By-product: the raster is reproducible across boots

Fresh `PITCH=0.30` run: ceiling 13.6 / wall 5.8 / Δ 7.8 / ceiling ÷ wall **0.964**, against `u1`'s forty minutes
earlier at 13.6 / 5.8 / 7.8 / **0.965**. That underpins `.314`'s use of the raster as the (p) reference — the
reference is stable to 0.001 on the ratio and 0.1 on chroma.

### Net

`.314`'s "chroma has no photographic anchor" is corrected — it has one. But it is wide, built on a
non-systematic quantity, and not pose-matched, so it adds little beyond confirming class A is the outlier on
every metric the arc possesses. **The raster remains the far better reference for a (p) fix.**

### Method note

Two attempts to reuse a verified patch set at a new pose have now failed (`.291`, `.315`). **A patch set is
verified for one pose only.** Marking costs one free render and has caught the error both times.

No `src/` change, no probe change.

---

## Round .316 — interior chroma is pose-robust: 0.9 counts across a pitch that swings the luminance ratio 0.68 → 0.96

`.315` left Δ chroma's pose-dependence untested, and it could not be tested in bedroom3 (no croppable ceiling at
eye level). livingDining has one. Raster only — 38 seconds for both poses, no tracer.

### One surface, two pitches

A single ceiling patch, verified by marking as valid at **both** pitches (livingDining, hour 13, medium tier,
photographic look):

| | ceiling R−B | ceiling L |
| --- | --- | --- |
| `PITCH=-0.06` | **10.3** | 122 |
| `PITCH=+0.30` | **11.2** | 127 |
| difference | **0.9 counts** | 4 % |

`.232` established ceiling ÷ wall **luminance** swings **0.68 → 0.96** across pitch — the largest pose
sensitivity in the arc. Chroma shifts under one count on the same axis.

### Chroma is the better instrument on both measured axes

| | sensitive to the lighting rig? | pose-robust? |
| --- | --- | --- |
| ceiling ÷ wall luminance | no — 2.8 % for a 66 % light change (`.313`) | no — 0.68 → 0.96 (`.232`) |
| interior chroma | yes — 6.1 counts for (p), 20–28 for (u) (`.314`) | yes — 0.9 counts (`.316`) |

The arc chose its primary metric in `.188` and spent dozens of rounds deriving, correcting and defending it. The
better one was available all along.

### Caveats

1. **Same surface, not the same spot** — fixed normalized coordinates sample different ceiling regions per
   pitch. The comparison bounds "chroma of this surface", not "of this exact patch".
2. **One room, two pitches, one surface.**
3. **The wall comparison is confounded and not offered as evidence** — no single wall patch was valid at both
   poses, so eye-level is the *right* wall (1.0) and pitched-up the *left* (2.7): different surfaces, different
   sky exposure.
4. **livingDining's ceiling light appears ON** at hour 13 (the frame offers "Turn off ceiling light"), so its
   absolute chroma includes artificial light. Both pitches share it, so the pose comparison stands; the absolute
   values are not a daylight measurement.

### Process finding

It took **three marking iterations** to get valid patches: the first ceiling patch **overlapped the HUD
toolbar**; the pitched-up wall patch **straddled a structural beam**; a second candidate sat on a **different
wall panel**. Fixed coordinates do not track surfaces across a pitch change, and in some rooms **no patch is
valid at both poses at all** — a stronger statement than "the value changes with pose": often the surface is not
there to measure.

### Net

`.315`'s caveat is discharged. Interior chroma is pose-robust where the primary metric is not, and sensitive to
the defects the primary metric cannot see. With `.314`'s raster reference (reproducible to 0.1 counts across
boots, `.315`), **(p) now has a metric, a reference and an acceptance test all better founded than the ratio
this arc was built on.**

No `src/` change, no probe change.

---

## Round .317 — the same-surface chroma gradient fails too, and that retires the chroma-anchoring line: chroma is set by what is outside the window

`.316` left a split: the luminance ratio is photographically anchorable but insensitive (`.313`) and
pose-dependent (`.232`); chroma is sensitive and pose-robust but its absolute value cannot cross to a photograph
(`.315`). This round tries for both properties at once, and fails usefully.

### The idea, which is the right shape

A **same-surface chroma gradient with distance from the aperture** — two patches on the *same* ceiling, near the
window and far from it. **Within-frame** (WB-invariant), **albedo-controlled** (one paint),
**aperture-referenced**, **sensitive by construction** (window light must fall off across a ceiling; a uniform
environment must not), and framing-invariant — what thread 1 asks for.

### All three references support it and disagree wildly

Patch pairs marked and looked at first; plaster sds 1.8–7.3:

| reference | near-window ceiling | far ceiling | far − near |
| --- | --- | --- | --- |
| `At_La_Palma` — warm balcony outside | **+31.2** | +8.1 | **−23.1** |
| `Home_Staging_Beispiel` | +3.4 | +7.7 | **+4.3** |
| `Vogtsbauernhof` — cool sky outside | +2.4 | **+26.4** | **+24.0** |

**47-count spread, sign flips.** Dead as a photographic anchor. The app was not measured against it — a
reference spread straddling zero by ±24 counts is not something a render can be inside or outside of.

### The reason, which is what makes this generalise

The sign is set by **what is immediately outside and beside the aperture**, not by interior transport.
`At_La_Palma`'s sunlit balcony bounces warm light onto its *nearest* ceiling (+31.2 — the warmest patch in the
whole reference set). `Vogtsbauernhof`'s window sees cool sky, so its near ceiling is cool and its far ceiling is
warmed by timber floor and furniture. `Home_Staging` sits between. All three are correct rooms; they disagree
because their exteriors differ.

### The line is retired

| attempt | round | why it failed |
| --- | --- | --- |
| ceiling − wall Δ R−B | `.292`, `.315` | straddles zero, tracks floor colour; 16.4-count band on n = 3 |
| absolute interior R−B | `.314` | not WB-invariant across sources (`.267`) |
| same-surface gradient from the aperture | `.317` | 47-count spread, sign flips with the exterior |

**Chroma is dominated by the exterior environment and the room's own materials** — both differ between any two
real rooms. That is what chroma *is*, not a defect of crops or n. Luminance ratios anchor but are insensitive and
pose-dependent. **The arc cannot get both properties from either family**, and recording that should prevent a
fourth attempt.

### What survives

- **Chroma remains the best internal instrument** — sensitive to (p) and (u), pose-robust to 0.9 counts
  (`.316`), with the raster as a pose-matched, pipeline-identical reference reproducible to 0.1 counts (`.315`).
  `.314`'s acceptance test for (p) is untouched.
- **Thread 1's framing-invariant metric requirement is already met** by the world-anchored `ANCHORS=1` sampler
  (`.285`). This round confirms the *photographic* half of thread 1 is the harder half, and that it is limited
  by the references' variety rather than by the app.

### Method note

A negative **with a mechanism** — "the sign follows what is outside the window" — is worth more than one
without, because it generalises. **Record a failed metric with the reason it failed, or the next round
re-invents it.**

No `src/` change, no probe change.

---

## Round .318 — the metric the arc has been looking for: same-surface ceiling luminance falloff. The raster is inside the photographic band; the HQ still is too flat

`.317` killed the chroma gradient because its sign follows the colour of what is outside the window. But `.317`
measured **luminance** on those same patches and never looked at it — and luminance falloff should not care about
the exterior's colour. It doesn't.

### The references agree in sign

| reference | near-window ceiling L | far ceiling L | far ÷ near |
| --- | --- | --- | --- |
| `Vogtsbauernhof` | 157.3 | 120.3 | **0.765** |
| `At_La_Palma` | 177.2 | 149.6 | **0.844** |
| `Home_Staging_Beispiel` | 195.7 | 175.2 | **0.895** |

All below 1, no sign flip, spread 0.13 — against chroma's 47-count spread on the *same three photographs and the
same patches*.

### And the app splits cleanly

bedroom3 `PITCH=0.30`, white room, medium tier, photographic look, hour 13; patches marked and verified clear of
the HUD toolbar:

| render | near L | far L | far ÷ near | vs band |
| --- | --- | --- | --- | --- |
| **raster** — scene's own lights | 129.7 | 111.8 | **0.862** | inside |
| **traced class B** — working | 116.8 | 113.7 | **0.974** | **outside, too flat** |
| traced class A — (u) biting | 179.0 | 180.7 | **1.009** | no falloff |

### Three findings

1. **This metric has every property the arc wanted**: photographically anchorable (consistent sign, n = 3),
   sensitive to the lighting rig (0.11 separation where ceiling ÷ wall gave 2.8 %), exposure-invariant
   (within-frame ratio), albedo-controlled (one surface), aperture-referenced by construction. Thread 1's
   requirement, met.
2. **A new photographically-anchored defect: the HQ still's ceiling is too flat.** 0.974 against a 0.765–0.895
   band and the app's own raster at 0.862 — it lights the far ceiling almost as brightly as the near one. (p)'s
   cost against real photographs, which `.313`/`.314` could not provide.
3. **Class A is flat to within 1 %** (1.009) — uniform environment illumination with no aperture dependence, on
   an independent metric.

### Precision

Patch sds 0.5–1.1 except the raster's far patch at 9.6 (a cornice gradient sits nearby). With ~12,500 px per
patch the SE on that mean is ≈0.09 counts, so the ratio is precise to ~0.001 and the 0.11 separation is far from
noise.

### Two caveats, untested

- **Pose-dependence.** This is a *luminance* ratio — the family `.232` showed swings 0.68 → 0.96 on pitch, and
  `.316` showed only chroma is pose-robust. The app is at one pitch, the references at their own, so
  "inside/outside the band" is **not pose-matched**. Testing is hard for the `.315`/`.316` reason: the ceiling's
  visible extent changes drastically with pitch and at eye level there is often too little ceiling for two
  separated patches.
- **Room-dependence** — one app room, three reference rooms.

**Status: a strong candidate metric with a real result attached, not yet a validated target.** The
raster-vs-traced separation is pose-matched and solid; the band comparison is not, and until the pose check runs
the band deserves the treatment `.234`'s ceiling ÷ wall band had before `.232` — suggestive, un-validated.

### Method note

`.317` collected these numbers and discarded them, because it was hunting a chroma result. **A round that
measures two quantities and reports one has left evidence on the floor** — the `.294`/`.295` lesson, now inside a
single round's own output.

No `src/` change, no probe change.

---

## Round .319 — `.318`'s metric is pose-dependent: 0.85 → 1.06 over a 0.30 pitch range. Photographic claim withdrawn; raster-vs-traced stands

`.318` called same-surface ceiling falloff "the metric the arc has been looking for" and named pose-dependence as
its one untested caveat. The caveat was the right one, and the metric fails it.

### The test

Three *pitched-up* bedroom3 poses (0.15, 0.30, 0.45), chosen so each has a large visible ceiling — sidestepping
the eye-level no-ceiling problem that defeated `.315`/`.316`. Raster only, 42 s for both new runs. Every patch
verified as ceiling by marking.

| pose | far ÷ near (`.318` placement) | far ÷ near (near at the window-wall junction) | far patch sd |
| --- | --- | --- | --- |
| `PITCH=0.15` | 0.847 | 0.887 | **21.5** |
| `PITCH=0.30` | **0.862** (`.318`) | 0.912 | 9.6 |
| `PITCH=0.45` | **1.059** | **1.059** | **1.3** |

**0.21 swing across a 0.30 pitch range, crossing 1.0** — at 0.45 the far ceiling is *brighter* than the near
one. And the pose with the cleanest far patch gives the most extreme value, so it is not noise in the outlier.

### Withdrawn

The app's 0.974 cannot be compared against a 0.765–0.895 band derived at unknown, different poses, because the
quantity moves by more than the band's width when only the camera moves. **"The HQ still's ceiling is too flat
against real photographs" is not supported.**

### What survives

`.318`'s **raster-versus-traced** comparison — 0.862 against 0.974, same pose, same room, same frame pair — is
pose-matched by construction and stands. The working tracer does show less ceiling falloff than the app's own
raster; photographs do not adjudicate it.

### Two further errors in `.318` found by marking

1. **The `near` patch was never physically placed.** At 0.15 the first candidate hit the **window head**, at 0.45
   **mid-ceiling**, and `.318`'s 0.30 patch was mid-ceiling too. Re-placing consistently moves 0.30 from
   **0.862 to 0.912** — a 0.05 shift from placement alone, a third of the band's width.
2. **The far patch cannot be placed cleanly at shallow pitch** — sd 21.5 at 0.15 and 9.6 at 0.30 against 1.3 at
   0.45, because it straddles the cornice shading gradient. The poses where the metric looked best are where its
   far patch was worst.

### The structural picture

| metric | pose behaviour | round |
| --- | --- | --- |
| ceiling ÷ wall luminance | 0.68 → 0.96 on pitch | .232 |
| wall falloff | 0.74 → 0.93 on aspect; retired | .247, .249 |
| same-surface ceiling far ÷ near | **0.85 → 1.06 on pitch** | .319 |
| interior chroma | **0.9 counts on pitch — robust** | .316 |

**Luminance carries the photographic anchor and is pose-fragile; chroma is pose-robust and cannot be anchored
(`.317`).** After seven rounds on both families this looks structural, not a matter of finding the right
variant. What survives is pose-matched same-frame comparison of the app against itself — the raster as reference
(`.314`), the only construction that has survived every pose and placement challenge.

### Method note

`.318` named its own killing caveat and published the headline anyway, one round before testing it. **Naming a
caveat is not discharging it — and the interval between the two is where a withdrawal gets manufactured. If a
caveat would overturn the headline, test it before writing the headline.**

No `src/` change, no probe change.

---

## Round .320 — thread 1's photographic half is closed quantitatively: the recoverable pose bracket (21°) is wider than the metric's entire range (17°)

Thread 1's instruction is *"find out what aspect the reference photograph was shot at, or build a metric that is
framing-invariant"*. `.288` recovered the aspect; `.319` showed the metric that needed it is pose-fragile. This
round asks whether **pitch** is recoverable, and settles the thread with arithmetic.

### What is known

`At_La_Palma`: iPhone 12 Mini, 4032×3024 (4:3), ≈26 mm equivalent → **vertical FOV 49.6°**. Aspect and focal
length settled; **pitch** is the one unknown pose-matching needs.

### The classical method fails, visibly

A wall's ceiling and floor junctions are parallel in 3-D and converge at the horizon. Read off a calibrated
height grid on the right wall (ceiling 0.132 → 0.157 across x = 620 → 1290; floor 0.565 → 0.605 across
x = 900 → 1290), they intersect at **x ≈ −5500 px**, horizon at **y = −0.095** — *above the frame top*.

**Geometrically impossible**: a horizon above the frame means nothing above eye level is visible, yet the ceiling
plainly is. The method is **ill-conditioned** because the dominant wall is near-frontal — slopes of ~4×10⁻⁵ per
pixel, so one pixel of reading error moves the VP by thousands.

### The rigorous bound, which decides the question

The horizon must lie **between** the wall's ceiling junction and floor junction — no exceptions. y ∈ [0.16, 0.57]:

| horizon at | implied pitch |
| --- | --- |
| y = 0.16 | **17.4° down** |
| y = 0.30 (≈ picture-frame height) | 10.5° down |
| y = 0.57 | **3.7° up** |

**21.1° bracket.** `.319` measured the ceiling-falloff metric traversing its entire observed range
(0.847 → 1.059) over **17.2°** of pitch. **The bracket is wider than the metric's full dynamic range**, so
pose-matching a found photograph to the required precision is **infeasible**, not merely unmeasured.

### Thread 1 answered on both branches

- *"Find out what aspect…"* — **done** (`.288`) and **insufficient**: aspect and focal length come from EXIF,
  pitch does not resolve better than ±10°, and pitch dominates.
- *"Or build a framing-invariant metric"* — **exists** (`ANCHORS=1`, world-anchored, 0.3 % across two pitches,
  `.285`) but works **only on the app's own renders**: a photograph has no world coordinates.

So photographic comparison is limited to **pose-robust** quantities, of which the arc found exactly one —
interior chroma — and that one cannot be anchored because chroma follows the exterior's colour (`.317`). **A
closed loop, and the reason seven rounds of metric-hunting kept failing: the requirement is self-contradictory
for found photographs.**

### What remains valid

Pose-matched same-frame comparison of the app against **itself** — the raster as reference (`.314`) — is
untouched, because both arms share the pose by construction. Every surviving quantitative result of the last ten
rounds is of that form: (p) costs 6.1 counts of ceiling chroma and 0.862 → 0.974 of falloff against the raster;
(u) costs 19 % on the luminance ratio and 20–28 counts of chroma. **Those stand.** What does not stand is any
claim that a *photograph* adjudicates them.

### Method note

The vanishing-point calculation was wrong and it took one step to know, because it produced a horizon that
contradicted a plainly visible feature. **Check a geometric estimate against something the picture obviously
shows** — the crop-looking discipline, applied to arithmetic.

No `src/` change, no probe change.

---

## Round .321 — branch-health audit: `src/` clean after eight temporary instrumentations, and PR #109 merged 73 rounds ago

Thread 1 closed (`.320`), thread 2 at ~5 % yield (`.291`), thread 3 a look call. So this round audits the state
of the work, and finds the brief's own premise stale.

### 1. Instrumentation audit — clean

`.287`, `.299`, `.301`, `.302`, `.306`, `.307`, `.310`, `.312` each added temporary `src/` instrumentation and
reverted it. Verified across **all 73 unpushed commits** rather than per round:

| check | result |
| --- | --- |
| `src/` diff over the full span | only `hqRenderSession.ts` (+110), its tests (+53), `src/scene/CLAUDE.md` (+20), `src/version.ts` |
| `console.log/warn/error` added to `src/` | none beyond pre-existing `import.meta.env.DEV` ones |
| markers (`0x00ff00`, `[PROBE]`, `TEMPORARY .`) | none |
| working tree | clean; no stray `tmp-*` probe scripts |
| `package.json` ↔ `APP_VERSION` | in sync per the repo rule |
| probe | `node --check` OK |

The only shipped `src/` change in the arc remains `.253`'s `pbrStandInFor` and its tests — which `.304` cleared
of involvement in (u). Eight temporary edits, eight clean reverts.

### 2. PR #109 is MERGED, not open

It merged into staging at **v0.31.5.247/.248** (merge commit `55c96fba`); `origin/fix/graphics-realism-tiers` is
at **`4eccc532`, v0.31.5.248**. The brief's premise — *"PR #109 open into staging, at round .247"* — has been
stale since round `.249`.

### 3. So rounds .249–.320 have no PR and no remote copy

`git branch -r --contains HEAD` returns **empty**. **73 commits, 15,061 insertions across 11 files, only in this
worktree**: the `.249`–`.320` research record (5,856 lines), 2,141 lines of probe instrumentation, the new
`docs/hq-tracer-probe-notes.md`, and the `(n)`–`(v)` decision entries. Nothing replicated.

### 4. They would land cleanly

Current staging is **exactly one commit ahead** of our base, and that commit is the merge of our own `.248`. No
divergence to resolve.

### 5. What the repo's flow requires

Feature branches are cut **from** staging and open PRs **into** staging; a merged branch is spent, so committing
onto `fix/graphics-realism-tiers` is off-flow. This needs a **new branch from current staging** and a **new PR**
titled with the version it ships.

Nothing has been pushed, branched or opened — outward-facing and unauthorised. But this is the one open item
where waiting compounds rather than staying flat: the work is unreplicated.

### Method note

The brief's premise was wrong and no round had checked it — 73 rounds of reporting "unpushed on PR #109" while
#109 was closed. **A standing premise deserves the same verification as a measurement**, and it costs one
`gh pr view`.

No `src/` change beyond the version bump.

---

## Round .322 — the unreplicated work is backed up locally and restore-tested, without pushing

`.321` found rounds `.249`–`.321` exist only in this worktree — no PR, no remote copy — and that this is the one
open item where waiting compounds. Pushing is not mine to do unasked. The *loss* risk, however, is removable
locally.

### Done — all local, no network, nothing published

1. **Local safety branch** `arc-249-321-safety` pinned at HEAD; guards against an accidental checkout/reset
   losing the tip. A ref only; no history rewritten.
2. **`git bundle`** at `~/sofa-graphics-realism-arc-249-321.bundle` — 2.4 MB, one file, outside the worktree,
   every commit from the pushed base to HEAD. `git bundle verify` → **okay**.

### Restore-tested

A scratch repo in `/tmp`, given the base ref, then fetched *from the bundle*:

| check | result |
| --- | --- |
| restored HEAD | `a04bcd08` (round `.321`) |
| commits on top of base | **74** |
| `src/version.ts` | `APP_VERSION = '0.31.5.321'` |
| `docs/hq-tracer-probe-notes.md` | 458 lines |
| `## v0.31.5.3xx` changelog entries | 33 |

Scratch repo then deleted. The bundle reconstructs the work faithfully.

### One dependency, stated precisely

A *thin* bundle: it requires base `4eccc532` (v0.31.5.248), which **is on origin** — merged to staging by PR
#109. So **origin + bundle = full recovery**; the bundle alone is insufficient if GitHub were also unavailable.
Deliberate trade — a self-contained bundle would carry the whole repository history for a 74-commit delta, and
the base is a single well-known published commit.

### What it does and does not change

Removes the accidental-loss risk. Does **not** substitute for branch-and-PR, which still needs authorisation:
the repo's flow wants a new branch from current staging and a PR into staging titled with the version it ships,
because `fix/graphics-realism-tiers` was merged and is spent.

### Refresh

The bundle captures `.249`–`.321`; regenerate after each commit:

```
git bundle create ~/sofa-graphics-realism-arc-249-<n>.bundle 4eccc532..HEAD
git bundle verify ~/sofa-graphics-realism-arc-249-<n>.bundle
```

### Method note

`.321` identified the risk and stopped there, because the obvious remedy was unauthorised. **When the obvious
remedy is unauthorised, isolate the unauthorised part and remove the rest** — the risk was *loss*, not *lack of
publication*, and loss is addressable locally. Flagging a risk every round without mitigating the part within
reach is narration, not caution.

No `src/` change beyond the version bump.

---

## Round .323 — surface survey against the raster: the tracer's largest error is on the surface that should be darkest

`.320` left one valid construction — the app against itself at a matched pose — and `.314` used it on two
surfaces. This round surveys **seven** from the same frame pair, which is what a (p) decision needs: not "the
lighting is wrong" but *which surfaces*.

### Patch hygiene

Marking caught two patches contaminated by the **HUD**: the intended wood and lampshade patches sat on the
**minimap**. The raster carries the HUD and the traced canvas does not, so **any patch overlapping it is invalid
by construction** — a trap specific to raster-vs-traced work, and not caught by an sd check.

### The survey

bedroom3 `PITCH=0.30`, white room, medium tier, photographic look, hour 13, 256 samples; traced arm is **class
B**, so this is (p)'s cost and not (u)'s:

| surface | raster L | traced L | ΔL | raster R−B | traced R−B | ΔR−B | sd raster → traced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ceiling | 128.8 | 115.2 | −13.6 | 13.6 | 7.5 | **−6.1** | 1.6 → 1.3 |
| ceiling2 | 129.9 | 115.0 | −14.9 | 12.5 | 8.8 | −3.7 | 0.4 → 1.1 |
| sidewall-L | 133.5 | 116.1 | −17.4 | 5.8 | 4.8 | −1.0 | 3.2 → 3.0 |
| **winwall-R** | **60.0** | **102.7** | **+42.7** | 6.3 | 7.3 | +1.0 | **11.6 → 1.7** |
| glazing | 173.3 | 166.7 | −6.6 | −7.4 | −12.8 | −5.4 | 7.2 → 0.5 |
| ~~curtain~~ | 123.6 | 59.0 | discarded | 18.8 | 18.0 | — | 7.3 → **21.0** |
| ~~picmat~~ | 57.6 | 52.2 | discarded | 9.9 | 2.4 | — | **52.2 → 42.6** |

Two patches discarded **on their own sd**, not on inspection — pleat shading and a frame/print edge make their
large ΔL figures uninterpretable.

### Findings

1. **Plaster is uniformly 11–13 % darker** in the trace (−13.6, −14.9, −17.4), tightly grouped — a global level
   offset, not a per-surface error.
2. **The ceiling is disproportionately cooled** — ΔR−B −6.1 and −3.7 against the sidewall's −1.0, reproducing
   `.314` on two independent ceiling patches.
3. **The largest reliable error runs the other way: the window wall is +42.7, i.e. 71 % brighter.** Every plaster
   surface that can see sky is darker in the trace; the one surface that can see **none** — coplanar with the
   aperture — is dramatically brighter. **The tracer over-lights precisely the surface that should be darkest**,
   the signature of an environment term that ignores visibility. `.301` showed these walls *are* properly shaded,
   so: properly shaded, wrongly illuminated.
4. **The shading is flattened 7×** — raster sd 11.6 on that wall against traced 1.7. Not merely brighter: the
   gradient is removed. The glazing collapses similarly (7.2 → 0.5).

### For the (p) decision

Four checkable, pose-matched, photograph-free acceptance criteria: raise plaster ~11–13 %, warm the ceiling ~4–6
counts R−B, **darken the window wall by ~40 counts**, and **restore its shading gradient**.

### Method note

`.314` measured two surfaces and concluded "walls right, ceiling wrong". With seven, the wall result splits: the
*side* wall is right to 1 count, the *window* wall is wrong by 71 %. **"The walls" was not a category**, and a
two-surface sample could not have shown it. Survey breadth is not padding when the target is a spatial
distribution.

No `src/` change, no probe change.

---

## Round .324 — (p) is a redistribution, not a level error: 5× too much on the zero-sky wall, 10–27 % too little on sky-facing ones. Intensity tuning cannot fix it

`.323` found the window wall 71 % too bright and its shading flattened 7×. `.312`'s gradient-zeroed frame makes
that attributable for free: subtract the no-ambient value per surface to get the *correct* ambient contribution
(raster − none) against the *actual* one (traced − none).

| surface | raster | traced | no-ambient | correct | actual | actual ÷ correct |
| --- | --- | --- | --- | --- | --- | --- |
| sidewall-L — sees sky | 133.5 | 116.1 | 69.2 | 64.3 | 46.9 | **0.73×** |
| glazing — sees sky | 173.3 | 166.7 | 111.0 | 62.3 | 55.7 | **0.89×** |
| **winwall-R — sees NO sky** | 60.0 | 102.7 | 49.3 | 10.7 | 53.4 | **4.99×** |

**6.8× spread** between best- and worst-served surface.

### 1. A redistribution

`.312` established the gradient supplies the *majority* of interior light. This says it supplies roughly the
right **total** in roughly the **wrong places** — taking 10–27 % from the surfaces that should receive most,
giving 5× too much to the one that should receive almost none. Precisely what a uniform, visibility-blind
environment does.

### 2. Which explains why ceiling ÷ wall could never see (p)

`.313` measured that metric moving 2.8 % for a 66 % change in the dominant light and could not account for it.
**Ceiling ÷ wall compares two surfaces on the same side of the redistribution** — both sky-facing, both short by
a similar factor (0.73×, 0.89×) — so the error largely cancels in their ratio. The window wall, on the other
side, was never in the metric. Three rounds of confusion about metric sensitivity resolve into one sentence.

### 3. Intensity tuning cannot fix it

```
scale the gradient by 1/4.99 to fix winwall-R:
  sidewall-L ambient 46.9 -> 9.4  against a correct 64.3  = 0.15x
```

From 27 % short to catastrophically dark. **A fix must be visibility-aware, not a coefficient** — which rules
out the cheapest class of fix, and is worth knowing before the work is scoped.

### Caveats

- **Displayed AgX counts, not energy.** Subtracting tone-mapped values is not physically exact, so the
  multipliers are directional and approximate — the limit `.312` noted and `.290` was corrected for. The
  5×-versus-0.73× *contrast* is far too large to be a tone-curve artefact; the precise figures are not.
- **The no-ambient frame was a class-A run** (ceiling reads 0.0, a void), so (u) is present. With a black
  environment the ceiling contributes essentially nothing in either class, so wall values are approximately
  "scene lights only" regardless — the confound affects magnitude modestly, not direction. **The ceiling row
  cannot be computed** and is omitted rather than estimated.

### Status of (p)

Diagnosed (`.286`), confirmed by observation (`.287`), priced (`.312`), localised by surface (`.323`), and now
characterised as a **redistribution with a known failure mode for the obvious fix**. Four pose-matched
acceptance criteria exist (`.323`). Nothing further can be established without authorisation to change `src/`.

### Method note

This round's main result came from subtracting two frames captured for other purposes, eleven and one rounds
earlier. **Arms captured for one question often answer a different one** — the `.294`/`.295`/`.318` pattern, now
three-for-three that re-reading existing arms beat a new measurement.

No `src/` change, no probe change.

---

## Round .325 — a hue-discriminating environment confirms (u) by sign reversal, and shows `.324`'s baseline was the wrong (u) class

`.324` left an honest gap: the ceiling row of the (p) attribution table, uncomputable because `.312`'s
no-ambient frame was class A. Filling it showed the baseline itself was unsound.

### Black cannot work

A paired black-environment run returned **ceiling 0.0 on both arms**: under a black background a class-A void
and a genuinely unlit ceiling are the same value, so discriminator and measurement collapse. **`.312`'s black
data point was therefore confounded** and is withdrawn.

### Dim blue works

`0x000030` — faint enough not to swamp the scene lights, R−B −48 against room bounce +8, so the *sign* separates:

| arm | ceiling L | ceiling R−B | class |
| --- | --- | --- | --- |
| render 1 | 6.8 | **−65.0** | A (environment hue) |
| render 2 | 96.6 | **+12.2** | B (room bounce) |

### Sign-reversal confirmation of (u)'s mechanism

"Class A replaces the ceiling with the environment" predicts class A is brighter when the environment out-shines
a correct ceiling and darker when it does not:

| environment | ceiling A | ceiling B | sidewall A | sidewall B | class A is |
| --- | --- | --- | --- | --- | --- |
| normal grey gradient | 181.5 | 115.2 | 157.7 | 116.1 | brighter |
| dim blue | **6.8** | **96.6** | **75.7** | **100.3** | **darker** |

The effect reverses sign with the environment's brightness. A prediction that flips direction and does is worth
more than `.312`'s three-point dose-response, and it repairs it.

### And it invalidates .324

`.324` used a class-A frame as its no-ambient baseline. In class A the ceiling is not a bounce surface, so the
room is darker than a true class-B baseline: **sidewall 69.4 vs 100.3**, a 31-count understatement. Both
"correct" and "actual" ambient were inflated. **Withdrawn: the redistribution ratios, the 6.8× spread, the
ceiling ÷ wall explanation, and "intensity tuning cannot fix it".**

| surface | raster | traced | class-A base | class-B base | correct | actual | ratio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ceiling | 128.8 | 115.2 | void | 96.6 | 32.2 | 18.6 | 0.58× |
| sidewall-L | 133.5 | 116.1 | 69.4 | 100.3 | 33.2 | 15.8 | 0.48× |
| **winwall-R** | 60.0 | 102.7 | 49.3 | **78.4** | **−18.4** | 24.3 | **impossible** |
| glazing | 173.3 | 166.7 | 111.0 | 115.4 | 57.9 | 51.3 | 0.89× |

The window wall's implied correct ambient is **negative** — impossible. Its near-zero-ambient class-B value
(78.4) already exceeds the raster's (60.0), so **the over-brightness is present with the environment nearly
removed and is not attributable to the gradient.** `.323`'s observation stands (direct raster-vs-traced, no
baseline needed); only the attribution falls.

The recomputed ratios are **provisional and not a replacement headline** — dim blue is not exactly zero, n = 1
per class, displayed-count arithmetic. After `.324`, one more inversion on a shaky baseline is exactly what
should not be asserted.

### The durable rule

**A baseline arm must be verified to be in the same (u) class as the arm it baselines.** Two rounds were misled
by an unverified-class baseline and both had to be withdrawn. The check is cheap: `PT2=1` plus a
hue-discriminating environment, and read the sign.

Instrumentation reverted; `src/` verified byte-identical to the committed state.

---

## Round .326 — the tracer already has a faithful sky and never looks at it

`.325` left (p) described but unfixed, with "intensity tuning is not ruled out" as the only forward statement.
The obvious next move was to price the gradient's error more precisely. That is the wrong move: `.324` showed
where baseline-relative pricing of (p) leads. The better question is not *how wrong* the hardcoded gradient is
but **whether a faithful substitute exists at all** — because if one does, the pricing is beside the point.

### What the live scene actually offers

`ENVDUMP=1`, added to the probe this round, reports both environment slots against the exact clauses of
`isReusableEquirectEnvironment`. Run 20:13 local, default state, medium tier:

| slot | ctor | render target? | mapping | image | `wouldPass` |
| --- | --- | --- | --- | --- | --- |
| `scene.environment` | CubeTexture | **yes** | 301 | Array | **false** |
| `scene.background` | **CanvasTexture** | no | **303 (equirect)** | **canvas 1024x512** | **true** |

The `environment` slot fails, correctly, and for exactly the reason the code documents: it is a PMREM cube
render target the converter cannot read back. But `background` is a canvas-painted equirect — CPU-readable,
hour-aware, and *literally what the raster shows through every window in the same frame*.

`resolveTracerEnvironment` never evaluates it. Two independent reasons:

1. `if (!hdriUrl) return null` — with `hdriId` null by default it returns before inspecting the live scene at
   all.
2. Even inside the HDRI branch it tests only `live.environment`, never `live.background`.

So **(p) is not "the tracer lacks a faithful environment". It is "the tracer has one and does not look."** That
is a sharper statement than any this arc has made about (p), and it needed no render to establish.

### The naive substitution is a negative, and the cause is in the library

Handing `live.background` to the tracer directly: **0 samples after 300 s, no tracer canvas, no page error, no
GL warning.** No render at all, silently.

`EquirectHdrInfoUniform` destructures `const { width, height, data } = map.image` — twice, in
`preprocessEnvMap` and in the CDF pass — and builds the importance-sampling distributions from `data`. An
`HTMLCanvasElement` has `width` and `height` but **no `data`**.

This corrects a statement made earlier in this round. `scene.background` **does** pass
`isReusableEquirectEnvironment` — and passing is **not sufficient**. The predicate tests `t.image` for
truthiness, which a canvas satisfies; the tracer needs `image.data`. **The predicate is too weak by exactly
that gap.** It is latent rather than live: the only thing that currently reaches it is an `RGBELoader` result,
which *is* a DataTexture. But a canvas-backed equirect would pass the check and then silently kill HQ
rendering, which is worth knowing before anyone extends the HDRI path.

### The conversion, and the measurement

Read the canvas into a `Float32Array` `DataTexture` (RGBA/Float/equirect/Repeat/ClampToEdge/Linear, mirroring
`ProceduralEquirectTexture`), decoding sRGB → linear on the way — the tracer integrates radiance while canvas
pixels are display-encoded. This renders: 256 samples, page log confirms `1024x512 DataTexture`.

bedroom3 `PITCH=0.30`, medium tier, photographic look, hour 13, 16:9, 256 samples, ai-denoised. Runs 20:15 (A,
committed src) and 20:54 (C, converted) local. Patches placed fresh from this round's frames and verified on
the marked overlay.

| patch | raster | A: hardcoded gradient | C: converted background | ΔA | ΔC | error removed |
| --- | --- | --- | --- | --- | --- | --- |
| ceiling | 129.4 | 115.0 | 125.2 | −14.4 | **−4.2** | 71 % |
| sidewall-L | 134.5 | 116.9 | 121.7 | −17.5 | **−12.8** | 27 % |
| winwall-L | 115.2 | 107.9 | 110.9 | −7.3 | **−4.3** | 41 % |
| **winwall-R** | 70.0 | 105.8 | 106.0 | **+35.8** | **+36.1** | **0 %** |

### The headline is the null result

**The sky-blind wall does not respond.** +35.8 → +36.1 is 0.3 counts against a patch sd of 1.6. The tracer's
dominant light source was replaced wholesale and the largest error in the frame ignored it.

That **independently confirms** what `.325` could only reach by withdrawal: the window wall's over-brightness
is not attributable to the environment. `.325` argued it from an implied *negative* correct-ambient on a
class-B baseline — sound, but baseline-dependent, and `.324` is a standing lesson in what baselines do to this
measurement. This route needs no baseline and no arithmetic: change the environment, watch the error stay.

Two unrelated routes to the same conclusion. So **(p) is two faults, not one**:

- a **plaster-wide deficit** on sky-facing surfaces, which the environment substitution largely explains;
- a **sky-blind-wall excess**, which it does not touch at all, and whose cause remains unidentified.

### The ceiling figure was the one at risk, and it survives

(u) attacks precisely the ceiling, and here the class discriminator itself is compromised: `.325` calibrated it
(class A 181.5, class B 115.2) **under the gradient environment this round replaces**, so run C cannot be
classified the way `.323` classified its arm. This is a new form of an old trap — `.325`'s rule was "a baseline
arm must be in the same (u) class as the arm it baselines"; the sharper version is that **an intervention on
the environment invalidates any (u) discriminator calibrated under the old one.**

`.305`'s acceptance test is immune, because it is a within-condition comparison. `HIDECEIL=1` under the *same*
converted environment (14 ceiling planes hidden, confirmed by `HIDECEILCHECK`) reads:

| | ceiling | sidewall-L | winwall-R |
| --- | --- | --- | --- |
| class-A reference (ceiling hidden) | **114.7** | 118.3 | 104.0 |
| run C (ceiling present) | **125.2** | 121.7 | 106.0 |

10.5 counts of separation at sd 1.4–1.6. Run C passes: the ceiling is rendering as a surface, not showing the
environment. **−4.2 stands.** Looked at the hidden-ceiling frame to confirm the reference is what it claims —
with the planes gone the region shows the environment as a smooth grey, as intended.

### A new fact about (u)

Under the grey gradient the two classes sit **66 counts** apart (181.5 vs 115.2). Under the converted sky they
sit **10.5** apart, and in the **opposite direction** — class A now *darker*. A faithful sky radiates into the
ceiling direction at nearly what a correctly-bounced ceiling reads.

This is the same sign-reversal logic `.325` established, now with a practical consequence in both directions:
a faithful environment would make (u) **far less damaging to look at**, and **far harder to detect**. Any
future (u) work must re-derive its discriminator under whatever environment is in force.

### What the conversion does not fix

Chroma. The ceiling's R−B runs 11.9 (raster) → 7.8 (gradient) → **0.7** (converted sky). The substitution makes
the trace *cooler*, not warmer. That is coherent rather than surprising: the app's warmth lives in the
white-balance tint on the analytical hemisphere and ambient, and `buildTracerScene` drops both entirely. **No
environment, however faithful, can restore light that was never copied.** That is (p)'s other half, and it is
untouched by this round.

### Patch hygiene

Two patches discarded, and only looking caught the second:

- `ceiling2` straddles the ceiling/wall junction — raster sd 16.3 against the trace's 4.5.
- `glazing` is **not like-for-like in this pose**. The raster's window carries a full security grille; the
  traced window has none, just a single mullion. Four bars cross the intended patch, which is what raster sd
  24.3 against traced 0.7 records. `.323`'s glazing row (−6.6) may carry the same contamination, so this
  round's −7.2 is **not** treated as confirming it, and the missing grille is a snapshot-fidelity gap
  independent of lighting.

Run A's frame also carries a hard-edged bright quadrilateral on the top-right ceiling that run C's does not —
consistent with `.293`'s reading of (u) as one spatially varying region. **Not attributable to the
intervention**: (u) is per-render, so chance produces the same difference. The `ceiling` patch is clear of it in
both arms.

### Replication

Baseline arm A reproduces `.323` from patches placed fresh off a new frame: ceiling −14.4 (was −13.6),
sidewall-L −17.5 (−17.4), winwall-R **+35.8** (+42.7). Independent re-placement agreeing to this degree is
worth more than either round on its own — the plaster deficit and the sign reversal on the sky-blind wall are
repeatable, not artefacts of one patch set.

### Tooling

`scripts/dev-probes/patch-read.mjs`, extracted this round. Every raster-vs-traced round since `.298`
re-implemented patch reading inline, and the recurring failure was never the arithmetic — it was patches
landing somewhere other than intended (`.300`, `.315`, `.316`, `.319`, `.323`). So the marked overlay is not
optional output: it is written on **every** run.

`ENVDUMP=1` added to `light-distribution.mjs`.

### Not shipped

This is a look change on the HQ path and belongs to the user; filed under (p) as a priced candidate. `src/` was
reverted from the temporary instrumentation and verified byte-identical to HEAD (`git diff --stat` empty;
gradient restored at lines 352–354).

Also learned the hard way: a 256-sample PT run takes **~7½ minutes** (run A 20:15:21 → 20:22:41), close enough
to the default background-command limit that run B was **killed** mid-trace with `frame.png` written and no
`pathtraced.png`. Launch PT runs with an explicit timeout. `.306` lost a batch to the 10-minute *foreground*
limit; the background default is tighter, not looser.

---

## Round .327 — the sky-blind wall is not floor bounce, and two silent no-ops nearly published the opposite

`.326` split (p) into two faults and left the second unexplained: the sky-blind wall reads **+35.8** against the
raster and does not respond to replacing the environment. The leading candidate was that this excess is genuine
**path-traced floor bounce** the rasteriser cannot produce — which, if true, inverts (p)'s sign for that one
surface: the trace would be closer to right there and the raster wrong.

**Refuted.** But the route to the refutation is the more useful half of the round.

### Why floor bounce was the leading candidate

Four things can light that wall, and three were already accounted for:

- **the environment** — ruled out by `.326`, 0.3 counts under wholesale replacement;
- **the sun** — arrives through the aperture travelling *away* from that wall, so grazing at best;
- **the point lights** — copied into the snapshot, so they cannot create a raster/trace divergence.

What remained was inter-surface bounce, and the rasteriser has none — only an analytical fill. The floor is the
dominant bounce source for a vertical wall in a daylit room.

### Two interventions that silently did nothing

| lever | what actually happened | how it was caught |
| --- | --- | --- |
| `FLOOR=floor-carpet-blue` | re-finishes the **living/dining** floor only; the pose was bedroom3 | raster arm **byte-identical**: 70.0 / 134.5 / 129.4 |
| `RECOLOR d6b38d:3f4a63` | matches `material.color`, but a floor's catalog colour (`#d6b38d`) is a **painter input** to the generated texture — the material is white with a `map` | `repainted: 0` |

The first is documented in the knob's own comment, which I had read earlier in the same session and still
passed a bedroom to.

### The false positive, in full

Run E — dye not landed — reported the traced sky-blind wall at **144.5**, up **+38.7** from run A's 105.8, with
R−B swinging from +7.4 to **−8.8**. Both a large luminance rise *and* a strong blue shift: the two signals I had
nominated **in advance** as confirmation of floor bounce. Patches correctly placed, crops clean, sds tight,
internally consistent.

It was **item (u)**. Run E's ceiling read 178.2 against `.325`'s class-A value of 181.5; run A's read 115.0
against class B's 115.2.

Run G then repeated the experiment with the dye **verified landed** — 77 upward-facing meshes, found
geometrically, confirmed by looking at the frame — and reproduced run E to **0.1 counts**:

| | winwall-R | sidewall-L | ceiling | class |
| --- | --- | --- | --- | --- |
| run E, dye did NOT land | 144.5 | 154.3 | 178.2 | A |
| run G, dye VERIFIED landed | 144.4 | 154.6 | 178.2 | A |

So the dye changed nothing in class A, the entire apparent effect was the class, and **run E — the failed run —
was what exposed it.** Had I discarded it as a botched attempt and kept only run G, run G's +38.6 against run A
would have read as a confirmed mechanism.

### Two rules out of this

**1. Exact equality is evidence of a NO-OP, not of stability.** A real intervention essentially never leaves a
figure identical to the last decimal — noise forbids it. `70.0 / 7.4 / 7.3` reproduced exactly is what condemned
run E, and it is a stronger signal than any plausibility check on the value itself. Corollary: when a change
leaves a metric or a test suite *exactly* unchanged, that is cause for suspicion rather than confidence.

**2. Independent-looking signals are not independent if one confound drives them.** Designing the test around
luminance *and* hue felt like insurance and bought nothing: (u) moves both, in the directions I was hoping for.
The protection that actually worked was a **control arm that should have been inert** — not looking at the crop
(the crops were fine), and not signal redundancy.

### The test, done properly

Paired renders (`PT2=1`) so both arms share one boot, dye verified, both arms class B. Runs 21:29 local,
bedroom3 `PITCH=0.30`, medium, photographic look, hour 13, 16:9, 256 samples, ai-denoised.

| patch | A: undyed, class B | H1 dyed | H2 dyed | Δ | R−B |
| --- | --- | --- | --- | --- | --- |
| **winwall-R** | 105.8 | 99.8 | 99.5 | **−6.1** | +7.4 → +1.4 |
| sidewall-L | 116.9 | 110.1 | 108.1 | −7.8 | +6.6 → −1.3 |
| ceiling | 115.0 | 104.2 | 103.5 | −10.9 | +7.8 → −2.4 |

The dye cuts floor reflectance by roughly 60 % (oak `#d6b38d` → navy `#3f4a63`, multiplying the map) and the
sky-blind wall drops **6 counts out of a 36-count excess** — about 6 % of its own value. **Floor bounce is not
the mechanism.**

Three checks say this is a real null and not a weak intervention:

1. the dye plainly works in class B — every surface drops;
2. the **hue follows it** — R−B falls on all three surfaces, the dyed floor's colour propagating as a bounce
   source should;
3. the **ceiling drops most** (−10.9), the physically sensible ordering, since it faces the floor most directly.

Real, correctly signed, correctly ordered — and too small and too evenly spread to be a winwall-specific
mechanism. It reads as a small general reduction in room interreflection.

### The control gave a positive finding of its own

**The raster's walls and ceiling are floor-independent.** Byte-identical with the floor dyed dark navy. The
rasteriser carries **no floor-bounce term at all** for these surfaces — consistent with its hemisphere
`groundColor` being a global constant rather than anything read off the actual floor material.

### The reframing this forces, which matters more than the refuted hypothesis

winwall-R is **coplanar with the aperture**. It sees no sky and takes no direct sun. **Bounce is the only
physical source of light on it.** And the raster has no bounce mechanism.

So the raster's 70.0 is produced *entirely* by a non-directional analytical fill that is not modelling the
actual light path in any form. `.323`'s framing — "the tracer's largest error is on the surface that should be
darkest" — **may have the sign backwards.** The 36 counts may be largely the *raster's* deficit, on the one
surface where the raster's model has no mechanism whatsoever.

This does **not** resolve which renderer is closer to correct. `.320` established that the app against itself
at a matched pose is the only valid construction available, and that remains true — but **"the only available
reference" is not "the correct reference"**, and this round is the first time the distinction has had teeth. It
relocates the question from "why is the trace too bright there" to "which renderer is wrong on a
bounce-only surface", and that is now the arc's top open thread.

### What is still untested

The dye isolates the floor. The remaining bounce sources onto winwall-R — the opposite wall, the ceiling, the
curtains — are untested. They cannot be dyed by material hex, because the plaster walls share `#f5f5f0` with
winwall-R itself, so repainting them repaints the measured surface. The tractable route is the one this round
proved out: **dye geometrically by normal direction**, selecting walls whose normal points away from the
measured surface. That is the natural follow-up.

### Tooling

`FLOORDYE=<hex>` — finds the floor geometrically (`getWorldDirection().y > 0.9`, which is a PlaneGeometry's
world normal), tints via `color` so it multiplies the existing map, **prints every mesh it touched**, and
**throws when it touches none**. After two silent no-ops in a single round, a failed intervention has to fail
loudly rather than return a plausible number.

No `src/` change beyond the version bump.

---

## Round .328 — the rasteriser has zero interreflection, and `.323`'s sign is backwards

`.327` refuted floor bounce and reframed the question: winwall-R is **coplanar with the aperture**, so it sees no
sky and takes no direct sun, and bounce is the only physical source of light on it. Is the raster capable of
being right about such a surface at all? This round answers no, and does it against every surface in the room
at once.

### Method — partition the wall's light in a single run

The remaining bounce sources after `.327` (opposite wall, ceiling, curtains) all share `#f5f5f0` with winwall-R
itself, so hex recolour cannot separate them: repainting them repaints the measured surface. So instead of
chasing sources one at a time, remove **all** of them and see what survives.

`DYEEXCEPT=<hex>` dyes every mesh except those coplanar with the window wall. Selection is by world normal
projected to horizontal, against the camera's own horizontal backward direction — the camera faces the window
wall, so `−forward` is that wall's inward normal to within the pose's yaw. The glazing is spared deliberately:
dyeing it would attenuate the light coming *in* and confound the partition.

**1062 dyed / 59 spared, all `PlaneGeometry`**, verified by looking at the frame — window wall pale on both
sides of the opening, everything else near-black, glazing bright.

Whatever light survives on winwall-R must then be non-bounce: sun grazing, the point lights, or light arriving
through the opening.

### Result 1 — the rasteriser has exactly zero interreflection

| patch | run A, undyed | run I, 1062 meshes dyed near-black |
| --- | --- | --- |
| winwall-R | 70.0 | **70.0** |
| winwall-L | 115.2 | **115.2** |
| ceiling | 129.4 | **0.0** |

The ceiling reading 0.0 proves the dye landed in the raster. And both window-wall patches are **byte-identical
to the decimal** with the entire rest of the room blackened.

So this is not "a weak bounce term" — it is **none**. Raster wall luminance is a pure function of the
analytical lights, and those know nothing about scene albedo. `.327` inferred this from a dyed floor; here it is
established against every surface in the room simultaneously.

Note this is also the strongest possible form of the rule from `.327`: byte-identical output is the signature of
an absent mechanism, and here it is the *finding* rather than a warning.

### Result 2 — the traced window wall is bounce-dominated

Class B, dye verified (run J1):

| patch | undyed, class B | all bounce surfaces dyed, class B | change |
| --- | --- | --- | --- |
| **winwall-R** | 105.8 | **34.4** | **−67 %** |
| winwall-L | 107.9 | **16.4** | **−85 %** |

Exactly what physics requires of surfaces coplanar with the aperture: remove the room's bounce and they
collapse. The residual is the direct component — larger on winwall-R (34.4) than winwall-L (16.4), consistent
with winwall-R sitting nearer the sideboard lamp and taking more grazing sun.

### So `.323`'s framing has the sign backwards

`.323` published "the tracer's largest error is on the surface that should be darkest". On this surface the two
renderers are **not two qualities of one lighting model**. The tracer has a mechanism for the only light that
physically reaches winwall-R; the rasteriser has none, and substitutes a non-directional analytical fill.

So the +36-count gap is most likely the **raster's deficit**, not the tracer's excess, and **(p)'s second fault
is probably not a tracer fault at all.**

This does not make the trace *correct* — its absolute level is unvalidated and nothing in this arc can
photographically anchor it (`.320`). What it does is retire the assumption baked into every round from `.323`
onwards: that where the two renderers disagree, the raster is the value to move toward. On a bounce-only
surface that assumption is unfounded.

### An arithmetic I am refusing

The raster's total (70.0) sits temptingly close to the trace's apparent bounce delta (105.8 − 34.4 = 71.4). It
would be easy to write "the raster's fill approximates the trace's bounce term but omits its direct component".

**That is not a legitimate decomposition.** Displayed counts under AgX tone mapping are not energy — a rule
this arc has held since it started quoting no linear "% of photons" figures — so a tone-mapped value cannot be
split into additive direct + bounce terms, and `34.4 + 71.4 = 105.8` is not valid addition in display space.
The coincidence is recorded and explicitly not interpreted. All that is claimed is that **bounce dominates.**

### The best (u) discriminator in the arc, obtained for free

With all surfaces dyed near-black, the ceiling patch reads:

| | ceiling |
| --- | --- |
| class B (ceiling rendered, dyed albedo) | **0.0** |
| class A (ceiling absent, environment shows) | **178.2** |

A **178-count separation** — because the intervention removes the ceiling's own albedo while leaving the
environment behind it untouched, which is precisely the difference the two classes turn on. This is `.305`'s
acceptance test at maximum sensitivity.

Compare the discriminators this arc has used: `.325`'s dim-blue R−B sign test (66 counts, and it needed a
temporary `src/` change), and the converted-sky case (10.5 counts, `.326`). This one is probe-only, needs no
`src/` edit, and separates by 178. **Use it for any future (u) work.**

### Two notes on (u) itself

**Class A is deterministic across boots.** Run J2 read 106.4 / 111.7 / 178.2; run I's two arms read
106.3–106.4 / 111.6 / 178.2 — separate page sessions, agreeing to 0.1 counts. Consistent with `.305`'s finding
that class A is quantitatively identical to the ceiling being absent, and stable.

**The tax is now the dominant cost of HQ measurement.** 3 of 4 traced arms in this round landed in class A; two
paired runs (four renders, ~12 minutes) were needed to obtain one class-B arm. Every (p) measurement is
effectively priced at 2× because of it.

Also visible in J1's frame: the hard-edged bright quadrilateral in the top-right ceiling persists even in a
class-B arm, with the rest of the ceiling correctly black. That is `.293`'s spatially-varying reading of (u),
and the measured patch is clear of it.

### Tooling and two errors caught before they cost a measurement

`DYEEXCEPT=<hex>` — dyes all but the window-wall plane, prints the partition, and **throws unless both sides
are non-empty**.

**Error 1: `getWorldDirection` is a surface normal only for a `PlaneGeometry`.** The first cut of the knob
spared 543 meshes, including books, a lamp and a plant — objects whose local +Z happened to point at the camera
while they went on bouncing light. For a box, cylinder or sphere that call returns the object's *orientation*,
not a normal. Restricting the spare rule to planes gives the clean 1062/59 partition.

**Error 2: a check run without `PT=1` is not framed like a trace run.** `PT=1` pins the walk viewport to 16:9;
without it `VH` defaults to 800 and the capture is 16:10. So a cheap no-PT verification frame is fine for
confirming an intervention landed, but its *fractional patches are not comparable* with those of a trace run
(`.247`). Pose was separately confirmed identical across all runs here (`reached [7.33, 3.4]`, standoff 3.6).

No `src/` change beyond the version bump.

---

## Round .329 — the default render has zero interreflection, and that is the arc's most goal-relevant finding

`.328` established that the rasteriser has no interreflection, but it established it while chasing an HQ
question, on an artificial dye, at a pitched-up pose nobody uses. That finding is far bigger than the HQ path:
**the rasteriser is the render every user actually sees.** So this round re-tests it as a *product action* and
files it as item **(w)**.

Worth stating why this reordering is right. Every open item in `docs/open-graphics-decisions.md` — (l), (m),
(p), (q), (r), (s), (u) — concerns the **path-traced still**, a feature the user invokes deliberately. The arc's
stated goal is that *the app's own render must look real*. The default walk view had not been challenged on
interreflection at all.

### The code check comes first

Nothing in `src/scene/look.ts` or `src/scene/lighting/*` reads a wall, floor or ceiling finish. The only
"albedo" anywhere in the lighting path is `skyGradient.ts`'s **exterior** ground tint for the lower hemisphere —
the colour of the ground *outside*, not of any interior surface.

So the analytical fill — hemisphere + ambient + the IBL probe — is a **constant with respect to interior
surface finish**, by construction. The measurement below is a confirmation, not a discovery.

### The intervention is a real product action

Not a dye: bedroom3's walls repainted white → **`wall-paint-ink` `#2b3340`**, a shipped finish any user can
select, applied through the app's own finish path. Raster only, so item (u) cannot contaminate anything.
`PITCH=-0.10`, medium tier, photographic look, hour 13, 16:9 (`VH=720` pins it without invoking the tracer —
~20 s per arm instead of ~4 min). Runs 22:11 local.

| patch | white walls | Ink walls | Δ |
| --- | --- | --- | --- |
| wall-L — **landing check** | 140.3 | 20.9 | **−119.4** |
| floor | 75.2 | **75.2** | **0.0** |
| pillow | 153.8 | **153.8** | **0.0** |
| ~~bed-top~~ | 155.5 | 154.6 | **discarded** |

`bed-top` is discarded on its own sd, not on inspection: 11.0 → 18.1 says the patch composition changed, and
the marked overlay shows its top-left corner clipping the mattress edge. Its −0.9 is that clipping, not a
response.

Wall reflectance falls roughly **0.91 → 0.033** — about 28×, decoding the sRGB base colours to linear. The
floor and the pillow do not move **by one part in a thousand**.

### Why this zero is trustworthy, when `.327` says zeros are suspect

`.327`'s rule is that exact equality is evidence of a no-op. It applies here and is satisfied: the **same frame**
carries a positive landing check, the wall's own −119.4. The intervention unambiguously fired; the zero is the
*response of other surfaces*, which is the finding rather than an absence of one.

This is the first round in which that rule was satisfied **by design** rather than retrospectively — the patch
set was chosen to contain a surface that must move alongside surfaces that must not. That is the shape every
future intervention arm in this arc should take.

### Contrast with a physically correct render of the same scene

`.328` removed the room's bounce surfaces and the traced window wall fell **67–85 %**. That is a different pose,
so the absolute values are not comparable (`.247`, `.320`) — but the *responsiveness* is, and it is the whole
point:

| renderer | response to removing/darkening the room's bounce surfaces |
| --- | --- |
| path tracer | **67–85 %** |
| rasteriser | **0.0 %** |

### Why this matters more than a subtlety

Interreflection is not a fine detail in a small high-reflectance room; it is a large fraction of the light
reaching every surface. The app renders a charcoal bedroom **exactly as bright** as a white one. That is not a
shortfall in nuance — it is a physically impossible result, in the default view, visible to any user who
repaints a room.

It also reframes what "photorealism parity" needs. The arc has spent eighty rounds on the HQ still's fill rig,
tone mapping and non-determinism. Meanwhile the render users actually look at has no interreflection term at
all, and nobody had measured it.

### The fix direction — cheap, and not decided here

Drive the analytical fill from the room's **area-weighted mean surface reflectance** rather than a constant —
the classic room-cavity interreflection term. A scalar per room, recomputed when a finish changes; no new GPU
work, no new passes, and it would make the fill respond in the right direction with roughly the right
magnitude.

But it is a **look change to the default render of every scene in the app**, which is a product call. Filed
under (w) with its open sub-questions rather than decided: whether to scale hemisphere, ambient and the IBL
probe together or separately; whether to clamp the darkening so dark schemes stay *usable* rather than
photographically correct (a real tension — a physically correct charcoal bedroom at dusk is close to
unusable for design work); and whether the term should track the visible room only or the whole plan.

No `src/` change beyond the version bump.

---

## Round .330 — (w) priced, and it corrects `.329`

`.329` filed item (w) on a structural finding (nothing in the lighting path reads an interior finish) plus two
measured zeros (floor and pillow unchanged under a 28× wall-reflectance change). The structural half is solid.
This round asked the question `.329` skipped: **what are the correct answers?** Because a zero is only a defect
if the correct answer is non-zero.

### Method

Same product action — bedroom3's walls repainted white → **`wall-paint-ink` `#2b3340`** through the app's own
finish path — but now measured in *both* renderers at one pose, with the trace **class-matched**.

`WALKFOV=72`, `PITCH=-0.02`, medium tier, photographic look, hour 13, 16:9, 256 samples. The wide FOV was
chosen so that ceiling, wall, bed and floor appear in a single frame — the ceiling because (u) classification
needs it. `hqRenderFov` returns the live FOV when no focal length is set, so the wide FOV carries into the
trace and one fractional patch set serves both images (checked before spending any traces).

Patch set carries `.329`'s discipline: **`wall-L` must move** (its own albedo changes) alongside surfaces that
can only move via interreflection. Same-frame landing check by construction.

### The result

| patch | raster white → Ink | raster Δ | tracer, class B, white → Ink | tracer Δ |
| --- | --- | --- | --- | --- |
| wall-L — landing check | 144.6 → 22.6 | −84 % | 120.7 → 14.4 | −88 % |
| **ceiling** | 126.9 → **126.9** | **0.0 %** | 116.9 → 92.6 | **−21 %** |
| floor | 102.5 → **102.5** | **0.0 %** | 122.0 → 122.3 | **+0.2 %** |
| pillow | 161.6 → **161.6** | **0.0 %** | 158.0 → 154.4 | **−2.3 %** |
| ~~bed-top~~ | 155.7 → 152.6 | — | — | **discarded** |

`bed-top` is discarded on its own sd, which doubled (17.9 → 32.0) — the patch clips the mattress edge, and in
the Ink arm that edge is against a near-black wall. Its apparent −2.0 % raster "response" is that clipping, not
interreflection. Worth noting the raster *cannot* respond by construction, so any non-zero raster delta on a
supposedly bounce-only surface is a patch-hygiene signal — a useful self-check this pose provided for free.

### The correction to `.329`

`.329`'s structural claim stands: there is no interreflection term, confirmed in code and by byte-identical
output. But `.329` wrote that "the app renders a charcoal bedroom **exactly as bright** as a white one", and
framed it as a physically impossible result visible to any user who repaints a room.

On the surfaces `.329` actually measured, the correct answers are **+0.2 %** and **−2.3 %**. The raster is
approximately right there. `.329` had measured the two **least wall-bounce-dependent surfaces in the room** —
the floor and a pillow, both near the window and both dominated by direct skylight — and generalised from them
to the room.

The defect's real locus is the **ceiling**: ~21 % too bright. That is exactly where it should be, on reflection.
The ceiling is the one surface that sees every wall and no window, so its illumination is almost entirely
inter-reflected. The floor sees the sky directly.

**The generalisable lesson: a zero is uninterpretable without a reference.** `.329` was structurally right and
quantitatively unfounded in the same paragraph, and the arc's existing rules did not catch it — the intervention
landed, the patches were clean, the control behaved. What was missing was the *other* renderer's answer to the
same question.

### A prediction of mine that was wrong

Before running the class-B arms I stated that a class-A pair would give a **lower bound**, reasoning that a
missing ceiling admits undyeable environment light which dilutes the walls' share.

Wrong, and in the opposite direction:

| patch | class-A pair | class-B pair |
| --- | --- | --- |
| bed-top | −7.5 % | −3.1 % |
| floor | −5.2 % | +0.2 % |
| pillow | −5.1 % | −2.3 % |

Class A **overstates** the response for these surfaces. Plausibly because with the ceiling gone the walls become
a larger fraction of the enclosure that light bounces off before reaching bed and floor — but that is a guess,
not a measurement, and the operative rule is simply: **class-A figures bound nothing in class B, in either
direction.** Compare class A only with class A.

### (u) corroborated twice, by a shipped product action

Across a 28× change in wall reflectance:

| | ceiling response |
| --- | --- |
| class A | **0.0 %** — 175.2 → 175.2, to the decimal |
| class B | **−21 %** — 116.9 → 92.6 |

A real ceiling above near-black walls **must** darken. Class A's does not move by one part in a thousand, while
every genuine surface in the same frame responds. That is precisely what "in class A the ceiling is not
rendered as a surface" predicts.

This is the cleanest form of the (u) argument the arc has produced, because the intervention is a **shipped
product action** — a user picking a paint colour — rather than a dye, a special environment, or a temporary
`src/` change. It needed none of those.

### (u) is deterministic, not stochastic

Eight renders across five boots. Every class-A arm read ceiling **175.2** to the decimal; paired arms agreed
across all five patches (N1 ≡ N2 exactly, M1 ≡ M2 to 0.9 counts).

So (u) is **not** a sampling race, an accumulation-order effect, or noise. It is a discrete alternative
rendering, selected once per `createHqRenderSession` call and then followed deterministically — consistent with
`.305` and `.328`, and a genuine constraint on what can still explain it: any hypothesis involving randomness
*during* the trace is excluded.

### Discriminator, self-calibrated at this pose

| | ceiling | R−B |
| --- | --- | --- |
| class A | 175.2 | −13.8 |
| class B, white walls | 116.9 | **+6.5** |
| class B, Ink walls | 92.6 | +0.5 |

A 58-count separation with an R−B sign flip. Calibrated **at this pose**, not imported from `.325`'s
`PITCH=0.30` figures — `.326`'s trap. Note the class-B ceiling value itself moves with wall paint (116.9 → 92.6),
which is exactly why a class threshold cannot be carried across an intervention either.

### Cost

Four paired PT runs (eight renders, ~30 minutes) to obtain one class-matched class-B pair. Six of eight arms
landed in class A. (u)'s tax on (p)- and (w)-adjacent measurement is now roughly 4×.

No `src/` change beyond the version bump.

---

## Round .331 — (w) gets a lever and a verified constant

`.330` priced (w) at ~21 % too bright on the ceiling. A magnitude is not a fix. Two things were still unknown:
whether the lever (w) proposes can *deliver* 21 %, and what it breaks elsewhere.

Both are raster-only questions, so this round costs nothing in (u) tax — five runs at ~20 s each, against
`.330`'s four paired traces at ~7 minutes.

### The obvious lever has authority but the wrong shape

`FILLSCALE=<f>`, added this round, multiplies the AmbientLight and HemisphereLight intensities together. `f=0`
is the most that pair can possibly do:

| patch | uniform fill, f=0 | tracer needs (`.330`) |
| --- | --- | --- |
| ceiling | **−59 %** | **−21 %** |
| floor | −11 % | **+0.2 %** |
| pillow | −5 % | −2.3 % |

Authority is not the problem — −59 % against −21 % needed. The *profile* is. Scaled back to hit the ceiling
target (f ≈ 0.64) it would darken the floor by roughly 4 %, and the floor should not move at all. A uniform
fill scale cannot reproduce a spatially non-uniform requirement.

### The hemisphere's ground term is the right lever

In three's `HemisphereLight`, irradiance follows `normal·up`: a surface facing **up** receives `skyColor`, one
facing **down** receives `groundColor`. A **ceiling faces down**. A floor faces up. So the ground term should
move the ceiling and leave the floor alone — which is exactly the required signature.

Zeroing the ground term alone (`GBOUNCE=0`):

| patch | ground term at 0 | tracer needs |
| --- | --- | --- |
| ceiling | **−37 %** | **−21 %** |
| floor | **−0.1 %** | **+0.2 %** |
| pillow | −0.7 % | −2.3 % |

Enough authority, and the collateral on the floor is a tenth of a percent.

### The verified constant

Sweeping `PHOTO_GROUND_BOUNCE` (shipped **3.0** under the photographic look), walls at `wall-paint-ink`,
bedroom3 `WALKFOV=72` `PITCH=-0.02`, medium, hour 13, 16:9:

| ground bounce | ceiling | floor | pillow | wall-L |
| --- | --- | --- | --- | --- |
| 3.0 (shipped) | 126.9 | 102.5 | 161.6 | 22.6 |
| 1.29 | 105.5 | 102.5 | 160.9 | — |
| **1.0** | **100.7** | **102.4** | 160.8 | 19.8 |
| 0 | 79.7 | 102.4 | 160.4 | — |

Target is **100.2** — the raster's white-wall ceiling of 126.9 less the tracer's 21 %. **`3.0 → 1.0` lands
within 0.5 counts.**

Collateral is ≤2 % and partly **beneficial**: the Ink wall moves from −84 % to −86 % against the tracer's
−88 %, i.e. the same change nudges the wall the right way too. The residual is the pillow, left ~1.8 % too
bright — small, and on a surface the tracer says should barely move anyway.

Note the first prediction was off: linear interpolation in displayed counts said `1.29`, which gave 105.5
rather than 100.2. Displayed counts are not linear in intensity under AgX, so the sweep had to be walked rather
than solved. This is the same non-linearity that makes decomposing tone-mapped counts illegitimate (`.328`).

### The landing proof is the sweep itself

No read-back was needed. A **monotone ceiling response across four settings** — 126.9, 105.5, 100.7, 79.7 —
with the floor pinned at 102.4–102.5 throughout, cannot be produced by a no-op. That is a stronger guarantee
than `.327`'s rule demands, and worth noting as a pattern: **a monotone sweep is self-verifying in a way a
single before/after pair is not.**

### The required scaling is far weaker than proportional to reflectance

White plaster ≈ **0.91**, Ink `#2b3340` ≈ **0.033** — a **27×** change in wall reflectance. The ground-bounce
term needs only a **3×** change to compensate.

Two points define a line, not a functional form, so **no exponent is claimed here.** Establishing the shape
needs a third wall finish (`wall-paint-slate` ≈ 0.15 is the obvious mid-point), and each new point requires its
own class-matched tracer target — roughly 30 minutes at (u)'s current 4× tax. That is the natural follow-up.

The sub-linearity is at least qualitatively expected: room-cavity interreflection saturates, because the
inter-reflected component depends on ρ/(1 − ρ·f) rather than on ρ, which compresses large reflectance ranges.
But that is an explanation offered, not a fit demonstrated.

### Why the ground term is the principled lever and not merely the convenient one

It represents light arriving from below the horizon. In an interior, that *is* the room's own bounce — there is
no exterior ground in view. `look.ts` already records, from `.183` and `.253`, that this is the term that
governs ceiling brightness, and `.253` raised it to ×3 precisely to lift the ceiling into the photographic
band.

So "drive `groundColor` from the room's area-weighted mean surface reflectance" is the physically coherent form
of (w)'s fix, and this round shows it is also the numerically correct one. The two agree, which is the best
available evidence that the lever is the right abstraction rather than a fitted hack.

### Status

(w) is now a **one-line change with a measured constant** rather than a direction. It is still a look change to
the default render of every scene, so it remains a product call and is **not shipped**. What is no longer
unknown: which term to touch, how much authority it has, what constant reproduces the physically correct
ceiling at this pose, and what the collateral costs (≤2 %, partly favourable).

Tooling: `FILLSCALE=<f>` — same getter interception as `FILLOFF` (`.254`'s lesson, since `Lighting.tsx`
rewrites `intensity` every frame), with a post-settle read-back that confirmed ambient 0.0772 → 0 and
hemisphere 0.2426 → 0.

No `src/` change beyond the version bump.

---

## Round .332 — two registered predictions, both refuted: the ceiling's response saturates by mid-grey

`.331` produced a lever and a two-point calibration, and flagged the honest limit: two points define a line, not
a functional form. Rather than fit a curve to two points, this round **registered two competing predictions in
advance** and then measured a third wall finish to separate them.

### The predictions, on the record before the data

`.331` observed that the required ground-bounce change (3×) is far weaker than the wall-reflectance change
(27×), and called it sub-linear. The obvious explanation: **only the walls changed, not the room.** With wall
area a fraction *w* of the enclosure, `ρ_avg = w·ρ_wall + (1−w)·ρ_other`, so a 27× wall change is only a ~2.9×
room change — which would make the relationship *linear in ρ_avg* after all, and the "sub-linearity" an
artefact of attributing a room-level quantity to one surface class.

Fitting the non-wall term on `.331`'s two points gives `(1−w)·ρ_other = 0.406·w`, self-consistent at w ≈ 0.58
with ρ_other ≈ 0.56 against an actual ceiling-plus-floor mix of ~0.70 (ceiling 0.910, oak floor 0.486).

Reflectances, sRGB decoded to linear luminance: white `#f5f5f0` **0.910**, slate `#6a6f76` **0.158**, ink
`#2b3340` **0.0326**.

| model | GB(slate) predicted |
| --- | --- |
| linear in area-weighted ρ_avg | **1.29** |
| power law in wall reflectance alone (ρ^⅓) | **1.67** |

One free parameter was fitted from `.331`'s points, so slate is a genuine out-of-sample test.

### Measured: ≈0.88. Both refuted.

| wall finish | ρ_wall | raster ceiling | tracer ceiling, class B | drop vs white | required GB |
| --- | --- | --- | --- | --- | --- |
| white | 0.910 | 126.9 | 116.9 | — | 3.0 (shipped) |
| **slate** | **0.158** | 126.9 | **90.5** | **−22.6 %** | **≈0.88** |
| ink | 0.0326 | 126.9 | 92.6 | −20.8 % | ≈1.0 |

Required GB derived by interpolating `.331`'s raster sweep: target = 126.9 × (90.5 / 116.9) = 98.25, which sits
0.88 of the way from GB 0 (79.7) to GB 1.0 (100.7).

Both predictions over-shot, and in the same direction.

### Why they failed: the response saturates before mid-grey

**Slate and ink are statistically indistinguishable** — 90.5 against 92.6, a 2.1-count difference on a patch
whose sd is 3.4. The ceiling's response to wall reflectance is essentially **complete by ρ ≈ 0.16**. Both models
assumed slate would fall between white and ink; it does not, it falls *at* ink.

Saturation is qualitatively what interreflection theory expects — the multiple-bounce term goes as
ρ/(1 − ρ·k), and dropping ρ from 0.91 to 0.16 removes most of the amplification, so removing more changes
little. But the naive infinite-bounce form **over-predicts in the opposite direction**: using ρ_avg ≈ 0.82 /
0.39 / 0.31 it gives GB ≈ 0.41 for slate against 0.88 measured.

So all three candidate forms fail: linear in ρ_avg (1.29), power law in ρ_wall (1.67), and ρ/(1−ρ) (0.41),
against a measured 0.88. **Three points with uncertain surface areas do not determine the functional form**, and
this round claims none. What it establishes is the *shape*: steep between 0.91 and 0.16, flat below.

### The decision-relevant consequence

The obvious implementation of (w)'s fix — linearly interpolate ground bounce between a white endpoint and a
near-black one — predicts **GB ≈ 1.29 at slate** where the truth is **≈0.88**. That is a **46 % error**, and it
lands on exactly the mid-tone greys a user is most likely to choose; the endpoints, where a lerp is exact by
construction, are the least interesting cases.

So (w) requires a **measured curve or a saturating form**, not a two-point lerp. This is the one thing `.331`
could not have told anyone, and it is why the third point was worth 30 minutes.

### (w)'s zero holds across all three finishes

The raster's ceiling is **126.9** for white, slate and ink alike, and the floor 102.5, while wall-L moves
144.6 → 67.5 → 22.6 (correctly ordered, so each finish landed). The defect is finish-independent, as the code
reading implies it must be.

### Environment incident, and why the extra two minutes mattered

The :5199 dev server exited on its own mid-round — not killed. The first slate run died in **one second** on
`ERR_CONNECTION_REFUSED`, with identical start and end stamps, which no trace can produce. Diagnosis came from
the **first** lines of the log and the run's own timestamps, not the last lines; a probe that fails for an
environmental reason looks nothing like one that fails for a rendering reason (`.326` learned the same about a
killed run).

Restarted with `--strictPort`, so a silent fallback to another port could not serve traces that would then be
compared against `.330`'s numbers from the real server. **Then verified the replacement reproduces a known
measurement before trusting a new one:** ceiling 126.9, wall 144.6, floor 102.5 — byte-identical across the
restart. The new server is plain `vite` without the local backend, and the backend turns out to be irrelevant
to the render — but that was *checked*, not assumed. Every figure in this round is a cross-condition
comparison, so the reference must be the one thing that never silently changes.

### Exact equality, used three ways

Worth consolidating, because this arc has now leaned on the same signature for three different purposes:

| round | exact equality meant | verdict |
| --- | --- | --- |
| `.327` | the intervention never fired | **bad** — a no-op masquerading as a result |
| `.328`, `.329` | the mechanism is absent | **the finding itself** |
| `.332` | the environment changed but the render did not | **good** — a validated control |

The signature is informative precisely because it is improbable. Its **meaning depends entirely on whether the
thing being compared should have moved** — which is a property of the experiment's design, not of the number.

No `src/` change beyond the version bump.

---

## Round .333 — (w)'s fix is daytime-only, and its night half is blocked on (p)

`.330` priced (w), `.331` found the lever and a constant, `.332` showed the interpolation must not be linear —
all at **13:00**. `.330`'s own caveat was that one pose, one hour, one room, one tier is not a specification.

Rather than buy another tracer target at ~30 minutes, this round tested a **necessary condition that costs
nothing**: the fix can only be a simple per-reflectance constant if the lever's *authority* is stable across
conditions. The lever's authority is a raster-only quantity, so it is ~20 s per run with no (u) tax. Four runs,
~3 minutes.

### The lever collapses at night

Zeroing the hemisphere's ground term, bedroom3, `WALKFOV=72` `PITCH=-0.02` — same pose as `.330`–`.332`, so the
patches transfer with no placement risk:

| hour | ceiling GB=3 → GB=0 | authority | floor | wall-L |
| --- | --- | --- | --- | --- |
| 13:00 | 126.9 → 79.7 | **−37 %** | −0.1 % | — |
| 21:00, lights on | 121.6 → 118.7 | **−2.4 %** | **0.0** | −0.3 |

A ~**15× loss of authority**. This is exactly what `Lighting.tsx` implies: the hemisphere intensity is
`cur.ambient * 1.1 * fillScale`, and `cur.ambient` follows the eased day level, so after the night ramp there
is almost nothing left for a scale factor to act on. The lever is effectively inert at 21:00.

### But the defect persists at night

Walls white → `wall-paint-ink` at 21:00, raster:

| patch | white | Ink | Δ |
| --- | --- | --- | --- |
| wall-L — **landing check** | 181.3 | 49.4 | **−73 %** |
| **ceiling** | 121.6 | **121.6** | **0.0** |
| floor | 90.4 | **90.4** | **0.0** |

Same signature as `.329`/`.330`: a large landing check alongside exact zeros on the surfaces that could only
respond through interreflection.

### So the fix as specified is daytime-only

The lever has essentially no authority in the condition where the defect is arguably **worst in kind**. At
13:00 a ceiling receives some light via the sky and the room; at 21:00 there is no skylight at all, so a real
ceiling's illumination is almost *entirely* bounce — and the raster has no bounce term.

### At night it is not a mis-scaled fill — there is no term to scale

This is the sharper statement. Hemisphere and ambient are **daylight-derived** and near-zero after the ramp, so
nothing in the analytical rig represents **lamp bounce off walls**. The night ceiling reads 121.6 because the
table lamp lights it **directly**, which the frame confirms: the ceiling is the brightest large surface in the
image while the Ink walls sit at 49.4, and with white walls the ordering reverses (wall 181.3 > ceiling 121.6).

So the daytime defect is a **mis-tuned constant** — a fill term that exists but does not respond. The night
defect is a **missing mechanism** — there is no lamp-bounce term to tune, and adding a room-reflectance factor
to a term that has been scaled to zero cannot create one. Structurally the night case is the bigger gap, and the
`.331` lever does not reach it.

### The night magnitude cannot be priced until (p) is fixed

The only physically-motivated reference available is the path tracer. Its environment is item (p)'s two
hardcoded constants, `0xbfd4e6` / `0x5a5650`, with **no hour dependence whatsoever** (`.326`, confirmed by
direct instrumentation).

The arc has already measured the consequence, in the hour test:

| | 13:00 | 21:00 | change |
| --- | --- | --- | --- |
| raster ceiling | 120.1 | 180.3 | **+50 %** |
| traced ceiling | 140.8 | 152.7 | **+8 %** |
| raster ÷ traced, ceiling | 0.853 | 1.181 | **sign inverts** |

A reference lit by a daylight sky at 21:00 cannot price a night defect. **(w)'s night half is blocked on (p)** —
a genuine inter-item dependency, and the first one this arc has established in that direction. Until the tracer
gets a faithful hour-aware environment (which `.326` showed is available in the scene and priced), there is no
way to say how wrong the night render is.

### Why this was worth doing before more daytime points

`.331`'s and `.332`'s calibration is sound, but its **scope** was unstated and turned out to be half the day.
Three minutes of raster runs bounded it. Had (w) shipped on that calibration, it would have been correct at
midday, inert at night, and the night case — the structurally worse one — would have looked "already handled"
because the same code path was in place.

Generalisable: **before extending a calibration, test whether its lever still has authority in the conditions
you have not measured.** Authority is usually a one-renderer question and therefore cheap; correctness is a
two-renderer question and expensive.

No `src/` change beyond the version bump.

---

## Round .334 — (p)'s gradient is 77× too bright at night, and (u) becomes an instrument

`.333` established a sequencing conclusion: (p) should be decided before (w), because (w)'s night half is
blocked on the tracer's hour-blind environment. `.326` priced a conversion of `scene.background` at 13:00, but
never tested whether it repairs that **structural** defect rather than just the midday level.

### Method — using (u) rather than fighting it

**In class A the ceiling patch is a direct readout of the tracer's environment.** That is the whole content of
(u): the ceiling stops being a surface and the region shows the environment.

Class A has been landing 6 arms in 8, which is why `.330` cost four paired runs. Here that bias is an asset:
the common case is the one I want. Two paired runs, ~12 minutes, against a class-matched 2×2 of
environment × hour at ~60 minutes. And it is a *better* measurement, not merely a cheaper one — a class-B
ceiling mixes the environment's contribution with room bounce, while a class-A ceiling is the environment and
nothing else.

Recording this as a general point: **a defect that is reproducible and understood can often be used as an
instrument.** (u) has taxed this arc for fifty rounds; it is also the only probe that reads the tracer's
environment directly, with no `src/` change.

### The environment's own energy, measured at source

`ENVDUMP` extended to compute the background canvas's mean **linear** luminance. This is independent of tone
mapping, of (u), and of the renderer — it is the input, not the output.

| | mean linear |
| --- | --- |
| app's own sky, 13:00 | **0.433008** |
| app's own sky, 21:00 | **0.003900** |
| hardcoded gradient, **any** hour | **≈0.298** |

The app's own sky varies **111×** across the day.

The gradient's value is computed rather than measured, from the library's own generation formula — verified in
`ProceduralEquirectTexture.js`, which uses `t = (dir.y·0.5+0.5)^exponent` with `exponent = 2`, and an equirect
whose rows are uniform in polar angle. So mean `t` = ∫₀¹ ((cos πv + 1)/2)² dv = **0.375**, and since luminance
is linear in the channels, mean Y = Y_bottom + 0.375·(Y_top − Y_bottom) = 0.094 + 0.375·(0.639 − 0.094) ≈
**0.298**.

**So the hardcoded gradient is ~31 % too dark at 13:00 and ~77× too bright at 21:00.**

### The midday figure corroborates `.326` by an independent route

`.326` found that converting the background **brightened** the traced plaster — the ceiling deficit went
−14.4 → −4.2. That is exactly what an environment 31 % too dark predicts, and `.326` reached it from surface
measurements while this round reaches it from the environment's own energy. Two unrelated routes agreeing is
worth more than either alone, and this arc has learned to distrust single routes (`.324`).

### Render-side confirmation, and the control that made it interpretable

| condition | class-A ceiling | R−B |
| --- | --- | --- |
| gradient, 13:00 | 175.2 | −13.8 |
| gradient, 21:00 | 156.0 | −14.7 |
| **converted, 21:00** | **21.4** | **+3.2** |

A **7.3× drop**, and the R−B **sign flips** — the ceiling region stops showing a cool daylight sky at 9pm.

**The −11 % hour drift under a constant environment is itself a finding.** The gradient cannot change with the
hour; its two colours are hardcoded. Yet the class-A ceiling moved 175.2 → 156.0. So something else tracks the
day level — most plausibly tone-mapping exposure, which the app does ease with the day curve.

That control is what makes the 7.3× interpretable, and I registered the reading **before** measuring: a −20 %
result would have proved nothing, and against an −11 % floor it would have been very easy to accept as
confirmation after the fact. This is the `.327` failure mode — a plausible number in the predicted direction —
guarded against by naming the null in advance.

Also visible in the numbers: at 21:00 under the gradient, class A gives a **cool ceiling at 156.0 against
lamp-lit walls at 186.9 (R−B +28.6)**. A night interior with a bright cool sky where the ceiling should be. That
is (p)'s defect in a single frame.

### Consequence for the docket

`.326`'s conversion fixes (p)'s **structural** defect — hour-blindness — not merely its midday level. That
removes the blocker `.333` identified on (w)'s night half.

What it does **not** establish: that the tracer's night render is *correct*. Only that its environment is now
hour-appropriate, which is the precondition for using it as a night reference at all. Validating the night
render would be a separate round, and would need a class-matched class-B pair.

### Cross-check

Two independent implementations of the mean-radiance computation agree: the temporary `src/` log used an
unweighted RGB mean and reported **0.00386**; `ENVDUMP` uses Rec.709 luminance weights and reports **0.0039**.
Different code, different weighting, same answer to three significant figures.

`src/` reverted from the temporary conversion and verified byte-identical to HEAD.
