# Photorealism round 2 — where the app actually stands, and the one gap research ranks first

*Opened v0.31.5.132. Successor to `2026-06-19-photoreal-parity-deepdive.md`, whose twelve levers
(RD-401…RD-412) have all shipped or been closed — re-running that list would be redundant. This
note is about what the 2026-06 dossier did NOT contain.*

## What the app already has (checked in source, not assumed)

`scene/EffectsImpl.tsx` mounts a real cinematic stack: **N8AO** (SSAO, full-res on the upper
tiers), **DepthOfField**, **Bloom** (day-ramped, emissive-only), **ToneMapping** (AgX, the
TONE-CURVE-CHOICE decision), **HueSaturation**, **ChromaticAberration**, **Vignette** and
luminance-aware **Noise** grain. Lighting adds a sun + hemisphere + ambient split with an **IBL**
probe (`SceneEnvironment.tsx`), curtain-aware fill attenuation, and per-fixture point lights.

So the camera-realism and colour-grading half of the problem is largely done. Anisotropy, triplanar
UVs, bevels, decor density, light falloff, VSM shadows and the procedural sky all shipped as
RD-401…RD-412.

## What research says is the biggest remaining factor

Every current source ranks **indirect light bounce (global illumination)** first — above modelling
and above material work. The failure mode named repeatedly is the one to test against: *without
GI, shadows go pure black and a room reads as if lit by spotlights in a void.* Ray tracing and
Lumen-class solutions are out of reach in a WebGL client; the practical approximations are
screen-space GI (expensive, WebGPU-era), and **irradiance probes / light probes** — a grid of
directionally-resolved probes, which the literature notes is "optimal for diffuse indirect
transport and relatively inexpensive to encode and decode".

## The specific gap in THIS app

**The app's bounce light is global, and it does not know what any room is made of.**

- `SceneEnvironment.tsx` supplies a "Warm ground bounce" as a **hardcoded `#6b5b48` Lightformer**.
- `Lighting.tsx`'s hemisphere ground colour comes from `altitudeCurve.ts`, driven by **sun
  altitude** — the sky, not the room.

Neither reads the room's own surfaces. A bedroom with pale oak vinyl and a bathroom with grey-green
porcelain receive the **same** bounce tint. Real indirect light does the opposite: the floor and
walls are what colour the light arriving on everything else, which is why a timber-floored room
photographs warm and a tiled one photographs cool. That colour-bleed cue is the most legible part
of GI and the app currently has none of it.

**This is tractable here in a way it would not be in a general renderer**, because the app already
knows the answer: every room resolves a floor and wall material id (`FINISHES_INITIAL`, pinned by
`materials/defaultFirstLoadPalette.test.ts` in v0.31.5.126), and every material carries a `swatch`
hex. A per-room bounce colour is a pure function of data already in the store.

## Proposed lever (NOT yet built — must be measured first)

Derive a per-room indirect tint from that room's own floor + wall swatches (floor weighted higher —
it takes the sun) and drive the hemisphere ground colour / a room ambient from it as the camera
moves between rooms.

**Why it fits this codebase:** it is a *light colour*, not a render pass, so it adds no per-pixel
cost and cannot regress the weak-device tier (rule lxviii) — unlike SSGI. It is pure and unit-
testable. And it is falsifiable: `chroma-audit.mjs` and the per-room mean-luma method already in the
playbook can A/B it, and the prediction is specific — **the bath and the timber-floored bedroom
should stop having the same bounce**.

## ❌ BUILT, MEASURED, REVERTED (v0.31.5.133) — the hemisphere is the wrong lever

The lever above was implemented as a pure `roomBounceGround(ground, floorSwatch, strength)` that
multiplies the day curve's `groundColor` by the floor albedo **normalised to mean 1** (channel ratio
only, level preserved; identity at strength 0 or a null swatch), wired walk-mode-only and
level-gated into `hemiRef.groundColor`. Nine unit tests passed, including that oak and bath-green
must stay separable. **In the rendered frame it does essentially nothing, at any hour, and it has
been reverted.**

**Day — `/tmp/tw28` vs the `/tmp/tw20` baseline, identical arm** (medium/on/manual13, 44 frames,
354 meshes, 87486 tris): `dHue ≈ 0.0`, `dR−B` +0.0…+0.6, mean `|dLuma|` **0.02**. Oak-vs-bath
separation moved **−4.92 → −4.55** and stayed negative.

**Night — `/tmp/tw29` (with) vs `/tmp/tw30` (control), 21:00, same scene.** This was the
falsification arm: at night `iblFillScale` returns 1 instead of 0.5, so the analytical fill was
expected to dominate and the tint to appear. **It did not.** Max `|dR−B|` **0.12** — *smaller* than
in daylight — separation moved **−6.70 → −6.63**, mean `|dLuma|` 0.003.

**Attribution: the analytical hemisphere is a minor contributor to interior light at BOTH
extremes, for two different reasons.** In daylight `iblFillScale(true, 1) = 1 − 0.5 = 0.5` halves it
and the ceiling is lit mainly by the **IBL probe**; at night the scale is 1 but `cur.ambient` is
itself small because the day curve dials the whole sky fill down, and the room is carried by
**fixture point lights**. Either way, rotating the hue of ~0.136 intensity against a sun of ~0.999
(LIGHT-UNITS-RELATIVE) cannot move a ceiling. The physics of the function was right; the light it
was attached to is too small to matter.

**So the real lever is the IBL probe, not the hemisphere** — `SceneEnvironment.tsx`'s Lightformers,
including that hardcoded `#6b5b48` ground bounce. **And it is not a free win:** the probe is a baked
environment, so making it per-room means re-baking on every room change. That is a genuine
performance decision to measure, not a constant to edit. **Any approach that tints a single global
analytical light is dead on arrival** — a per-room bounce needs either per-room lights or a per-room
environment.

The pure module was deleted rather than left unused; an exported module with no consumer is dead
code. The design and both measurements are preserved here, which is what a future attempt needs.
