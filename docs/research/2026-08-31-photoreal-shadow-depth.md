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

**Not yet measured, and the next step:** how much of the window's light actually reaches the room —
compare the app's illuminance falloff from the window plane against the inverse-square-plus-bounce
behaviour a real room shows, and find whether the shortfall is in the sun/sky intensity, the window
glass transmission, or the absence of bounce off the room's own surfaces.

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
