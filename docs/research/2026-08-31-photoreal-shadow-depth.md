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

The clean next experiment is a four-arm knock-out at a fixed pose: baseline, lamps off, analytical
fill zeroed, IBL off — reporting `%<64` for each. That attributes the lift before anything is
changed.

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
