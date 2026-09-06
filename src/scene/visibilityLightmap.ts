/**
 * Apply a baked **aperture-visibility** map to a material — item (w)'s fix, as a shader patch.
 *
 * The app's `HemisphereLight` + `AmbientLight` are visibility-blind: every surface receives the
 * same skylight whether or not it can see the sky. Measured against a Cycles reference, that is
 * a ~3× error on a wall in a normal living room, and the single largest defect the graphics arc
 * found (`docs/open-graphics-decisions.md`, item (w)). Modulating indirect irradiance by baked
 * visibility takes the spatial mismatch from **4.76× to 1.36×**.
 *
 * Every line below encodes a measured requirement, and each one was a round of debugging:
 *
 * 1. **`channel = 1`.** three selects a texture's UV set per texture and defaults to `0` — the
 *    `uv` attribute. The shell's `uv` is a *tiling* coordinate running −2.9…+2.9, so a map left
 *    on channel 0 samples the atlas with wrapping and reads noise. Setting `uv1` on the geometry
 *    is necessary and **not sufficient** (`v0.31.7.19`; it cost five rounds).
 * 2. **No mipmaps.** Every mip level averages across the 3×2 atlas's slot boundaries, mixing one
 *    face's visibility into another's — at mip 4 a 256 px atlas has 5×8-texel slots. The UV
 *    margin protects bilinear filtering at mip 0 and nothing beyond it.
 * 3. **A replaced `aomap_fragment`, not `aoMapIntensity`.** three's chunk lerps from 1 toward
 *    the texel, so it is capped at 1 and can only darken; the correction is `V / mean(V)`, which
 *    exceeds 1 wherever a surface sees more sky than the room's average. `aoMapIntensity` is a
 *    different curve and cannot express it (`v0.31.7.17`).
 * 4. **`customProgramCacheKey`.** Without it three reuses a program compiled from the unpatched
 *    chunk and the patch silently does nothing.
 * 5. **Diffuse only.** Attenuating `indirectSpecular` as well is physically tempting — a surface
 *    that cannot see the sky cannot reflect it — and measured *worse* (1.51× against 1.36×).
 *
 * **Call this where the material is built, never on a live material.** Adding an `aoMap` compiles
 * a new shader variant: ~19 extra programs across a plan, and doing it mid-session cost a
 * **216 ms** frame (`v0.31.7.15`). A flag that toggles this at runtime will stutter; read the flag
 * at construction. Steady-state cost is nil — measured 60 fps unchanged at `performance` and
 * `medium` with 331 distinct maps attached.
 */
import type { MeshStandardMaterial, Texture } from 'three'
import { LinearFilter, Vector3 } from 'three'

/**
 *
 * ## CURRENT VALUE: 4.2, refitted in `v0.31.7.223` against a validated chain
 *
 * Everything below this section is the HISTORY of earlier fits and their corrections; read it for
 * the traps, not for the number. The 4.2 comes from the first measurement chain in this thread
 * that is validated end to end:
 *
 * - surfaces confirmed by raycast to be the surface claimed (`.214` found the old fit's "ceiling"
 *   was not a ceiling — the defect `.181` had already caught once);
 * - an EXPOSURE-MATCHED byte->linear curve (`.217` found a mismatched one manufactured a 0.65x
 *   error and eight rounds of false leads);
 * - a Cycles reference rendered from the app's OWN exported scene at the same camera pose and sun
 *   vector, through `Standard` so the reference inverts exactly (`scene-glb.mjs`, `.218`).
 *
 * Measured app total against that reference, 13:00 with the lamps off:
 *
 * | room / surface | gain 6 | gain 4.2 |
 * | --- | --- | --- |
 * | livingDining ceiling | 1.376 | **0.986** |
 * | livingDining wall | 1.380 | **0.977** |
 * | livingDining floor | 1.393 | **1.010** |
 * | bedroom2 ceiling | 1.486 | **1.031** |
 *
 * `bedroom2` is an independent point on the irradiance axis: its `E_baked` is 0.7985 against
 * livingDining's 0.4142. Across 09:00 / 13:00 / 17:00 the mean absolute error falls from **32.9 %
 * to 9.1 %** and the worst from 50.5 % to 27.6 %.
 *
 * **The residual is structural, not a gain error.** The worst case is 09:00, where the app is now
 * ~20-28 % DARK because a static bake cannot carry the sun's bounce (17-23 % of the interior
 * indirect at that hour, against 0.2-2.7 % at 13:00 and 17:00 — measured with `--sun-energy 0` in
 * `.222`). Undershooting there is the preferable direction by this file's own long-standing
 * principle: a surface pushed past its reference is a worse error than one left short of it.
 *
 * Frame cost: none. This is one float in a uniform that already exists, and the program cache key
 * already includes the gain, so the compiled-program count is unchanged.
 *
 * ### The 4.2 SURVIVED a map-set replacement (`v0.31.7.251`/`.252`)
 *
 * `v0.31.7.251` shipped 195 maps baked at `--min-area 1.5 --keep-glazing`, replacing 111, and this
 * constant did NOT need re-fitting — which is the strongest evidence yet that it is right rather
 * than merely tuned. At 4.2, against the same Cycles reference at the same raycast-verified
 * surfaces:
 *
 * | hour | surface | 111-map set | 195-map set |
 * | --- | --- | --- | --- |
 * | 09:00 | ceiling / wall / floor | 1.204 / 1.182 / 1.038 | 0.836 / 0.807 / 0.738 |
 * | 13:00 | ceiling / wall / floor | 0.986 / 0.977 / 1.010 | **1.001 / 0.974 / 1.010** |
 * | 17:00 | ceiling / wall / floor | 1.505 / 1.868 / 1.455 | 1.051 / 1.445 / 1.055 |
 *
 * Over those nine measurements the mean absolute error falls **25.5 % → 13.4 %** and the worst
 * **86.8 % → 44.5 %**. The set was chosen on 13:00 evidence alone, so the improvement at the other
 * two hours was not part of the case for shipping it.
 *
 * What is left is the residual `.222` predicted and no gain can reach: 09:00 now UNDER by 16-26 %,
 * because a static bake cannot carry the sun's bounce (17-23 % of the interior indirect at that
 * hour against 0.2-2.7 % at 13:00 and 17:00), and the 17:00 wall over by 44 %, which is direct sun
 * the app renders itself rather than anything this map set supplies.
 * Gain for an **irradiance** set in `'replace'` mode — a different quantity from
 * {@link VISIBILITY_GAIN}, kept separate even though it currently holds the same number.
 *
 * **Why the separation is still right.** `VISIBILITY_GAIN`'s fit describes a dimensionless [0,1]
 * occlusion ratio that MULTIPLIES the app's fill. An irradiance map IS the light and stands in for
 * the fill, so its factor is a unit conversion. The two are independent and either may move.
 *
 * **⚠️ `v0.31.7.183` set this to 3.59 and that was WRONG — corrected in `v0.31.7.184`.** The 3.59
 * came from inverting a rendered radiance to irradiance as `E = R * pi / rho`, taking `rho` from
 * `material.color`. But these materials carry a **base-colour map**, so the shader's
 * `diffuseColor` is `color * texture(map)` and the true albedo is well below `material.color`.
 * Dividing by the wrong albedo understated the required gain, and the same mistake produced
 * `.183`'s claim that 6 "would over-brighten by 50–87 %". It does not.
 *
 * **Fitted instead in DISPLAY space against Cycles references, which needs no albedo and no curve
 * inversion** — the two assumptions that have gone wrong repeatedly in this thread. Three surfaces,
 * each against a reference at its own pose, `TONE=neutral` on both sides:
 *
 * | gain | floor (target 160.3) | wall (196.4) | ceiling (192.6) |
 * | --- | --- | --- | --- |
 * | 3.59 | 135.0 | 160.3 | 59.4 |
 * | **6** | **156.5** | 184.0 | 85.7 |
 * | 9 | 172.9 — over | 190.6 | 109.3 |
 * | 14 | 189.4 — over | 194.0 | 138.4 |
 *
 * **The floor is the binding constraint**: it lands within 2 % at 6 and overshoots beyond it, while
 * the wall is still 6 % short and the ceiling 55 % short. Nothing overshoots at 6, and a surface
 * pushed past its reference is a worse error than one left short of it.
 *
 * **What that leaves.** The ceiling cannot be reached by ANY gain without blowing the floor past its
 * reference, so a residual spatial error remains after the glazing fix (`.182` closed the bake's
 * ceiling/wall ratio from 0.92 to 1.48 against a reference 2.18 — most of the way, not all). That
 * is the next thing to chase, and it is a bake-side question, not a gain.
 *
 * ---
 *
 * ## ⚠️ THE "CEILING" COLUMN ABOVE DOES NOT DESCRIBE A MAPPED CEILING (`v0.31.7.214`)
 *
 * The 85.7 in the gain-6 row is the number the whole ceiling-deficit thread was built on, and it
 * was measured at a patch that was never confirmed to be a room ceiling. `.181` already caught this
 * exact error once — a patch used as "ceiling" since `.170` turned out to be the TOP OF A WALL —
 * and the table was not re-derived afterwards.
 *
 * Measured at a ceiling confirmed three ways (`gi-point.mjs` reports a mapped surface with `uv1`
 * and a map file at the y = 2.6 ceiling plane; `aim-look.mjs`'s centre raycast lands on it at
 * 1.1 m; the patch is flat): the app renders that ceiling at **229.2 counts at 13:00**, i.e. ABOVE
 * this table's 192.6 target, not 55 % short of it.
 *
 * And the injected term is PRESENT at the predicted magnitude. One-variable control by detaching
 * every map from the live scene (`GI=off`, 107 detached, same pose, same frame):
 *
 * | arm | counts | scene linear |
 * | --- | --- | --- |
 * | 13:00 GI on | 229.2 | 1.777 |
 * | 13:00 GI off | 212.0 | 0.950 |
 * | 21:00 lights off, GI on | 227.7 | 1.657 |
 * | 21:00 lights off, GI off | 195.1 | 0.588 |
 *
 * so GI contributes **0.83–1.07** against `texel * scale * rho / pi * gain` = **0.844** at that
 * point (texel 0.2627, scale 1.7603, rho 0.956). Not the 13–18x shortfall the thread chased.
 *
 * **Read the error bars.** Both GI-on arms land in AgX's shoulder, where the transfer curve is
 * 0.08 linear per count, so these figures carry ±0.14 to ±0.51 and a gain-halving test came back
 * 3.57x for a 2x gain — consistent with linear only because the uncertainty is that wide. What is
 * robust is the ORDER: the term is there at roughly the right size. Tightening it needs a
 * measurement out of the shoulder, which means removing the direct/ambient pedestal (0.588 at
 * night with lamps off, already 4x the per-unit-gain GI signal) or reading linear values back
 * before tone mapping.
 *
 * **So this whole gain table wants re-deriving against verified surfaces**, and the ceiling may
 * turn out to be over-bright rather than short. The shipped gain 6 is unaffected in the meantime:
 * it was fitted on the FLOOR, which is the binding constraint and was never in doubt.
 *
 * ### RE-DERIVED against Cycles at verified surfaces (`v0.31.7.218`)
 *
 * Same three surfaces, same camera position, 13:00 with the lamps off (daylight only), against a
 * Cycles render of the app's OWN exported scene at the same pose and the same sun vector, through
 * the `Standard` view transform so its bytes invert exactly. App bytes inverted with a curve
 * measured in the SAME state (exposure 1.38), which is the step `.217` showed everything hinges on.
 *
 * | surface | app linear | Cycles linear | app / Cycles |
 * | --- | --- | --- | --- |
 * | ceiling | 0.8027 | 0.5834 | 1.376 |
 * | wall | 0.7755 | 0.5622 | 1.379 |
 * | floor | 0.3157 | 0.2266 | 1.393 |
 *
 * **The DISTRIBUTION is right to about a percent** — ceiling/floor 2.543 against 2.575 (1.2 %),
 * wall/floor 2.456 against 2.481 (1.0 %), ceiling/wall 1.035 against 1.038 (0.3 %). That is what
 * the table above was really trying to fix, and it needs no fixing: the bake's spatial
 * distribution matches a physically-based render of the same room. **The "ceiling 55 % short" line
 * is refuted** — it was the wrong patch (`.214`).
 *
 * What IS off is the absolute level: uniformly **~1.38x brighter than the physical reference**.
 * Uniform across three surfaces means a global lighting-level offset, not a GI distribution error,
 * so it is not addressable by this gain at all. Note two things before acting on it: the absolute
 * comparison inherits `render_still.py`'s physical-sky calibration, and the app's exposure is an
 * artistic choice (`grade(altitude).exposure * toneExposureBias * st.exposure`). The numerical
 * coincidence between the ratio and `toneMappingExposure` = 1.38 is striking, and `v0.31.7.219`
 * TESTED it: it is a coincidence. Dropping the user exposure to its 0.6 floor takes
 * `gl.toneMappingExposure` to 0.828, and each byte inverted with a curve measured at its OWN
 * exposure gives the same scene radiance — ceiling 0.8027 -> 0.8507, wall 0.7755 -> 0.8060, i.e.
 * ratios 1.06 and 1.04 while the exposure itself moved by 0.600. A grade applied twice would have
 * moved them by 0.6. So exposure is a display transform applied exactly once, and the 1.38x is a
 * genuine global lighting-level offset against the reference.
 *
 * ### DO NOT try to fix this with a sun-dependent gain (`v0.31.7.221`)
 *
 * The obvious cheap fix — make this constant a function of sun position, since a uniform already
 * exists and it would cost no frame time — was measured and REFUTED before being built. It needs
 * the app's spatial distribution to be right at every hour, and it is only right at ONE:
 *
 * | hour | app/Cycles ceiling | wall | floor | ceiling/floor error | wall/floor error |
 * | --- | --- | --- | --- | --- | --- |
 * | 09:00 | 1.204 | 1.182 | 1.038 | **15.9 %** | **13.9 %** |
 * | 13:00 | 1.376 | 1.380 | 1.393 | 1.3 % | 1.0 % |
 * | 17:00 | 1.505 | 1.868 | 1.455 | 3.4 % | **28.3 %** |
 *
 * At 13:00 the three surfaces share one ratio, which is what makes a scalar look sufficient. At
 * 09:00 the floor is nearly correct (1.038) while the ceiling is 1.204, and at 17:00 the wall is
 * 1.868 against a floor of 1.455. No single multiplier can fix a distribution error, so a
 * sun-dependent gain would only move the error between surfaces.
 *
 * The mechanism is visible in the same table: the WALL responds to the sun (byte 205.7 at 13:00,
 * 214.1 at 17:00) because direct sun reaches it at runtime, while the CEILING does not (207.1 vs
 * 208.6) because it is lit almost entirely by the static bake. What is missing is the
 * sun-dependent INDIRECT term, and that has a spatial shape, not just a level.
 *
 * ### The BAKE's own distribution is off 1.61x, and the runtime ambient hides it (`v0.31.7.222`)
 *
 * Decomposing BOTH sides at 13:00 with the lamps off — the app by detaching every map (`GI=off`),
 * Cycles by zeroing the sky's sun disc (`--sun-energy 0`). For these two patches that leaves a
 * pure-indirect reference, since neither receives direct sun: the sun's share is 0.0155 on the
 * ceiling and 0.0048 on the floor.
 *
 * | surface | app runtime only | bake adds | app total | physical indirect | bake / physical |
 * | --- | --- | --- | --- | --- | --- |
 * | ceiling | 0.0913 | 0.7114 | 0.8027 | 0.5679 | **1.25x too strong** |
 * | floor | 0.1431 | 0.1726 | 0.3157 | 0.2217 | **0.78x too weak** |
 *
 * So the bake's own ceiling/floor distribution is wrong by **1.61x**, and in the OPPOSITE direction
 * to the table at the top of this docstring: the ceiling is too STRONG relative to the floor, not
 * 55 % short.
 *
 * It is hidden because the app's runtime ambient/IBL already delivers a large share of the floor's
 * total — 0.1431 against a physical total of 0.2266, i.e. **63 %** — and only 16 % of the
 * ceiling's. The bake then adds a full indirect term on top, so the runtime term and the bake
 * OVERLAP, and at this hour the overlap compensates the bake's distribution error almost exactly.
 * `v0.31.7.218` measured the TOTAL distribution as right to ~1 %, and that reading stands, but it
 * is two errors cancelling rather than a bake that is right.
 *
 * Any correction has to address the overlap first. Re-fitting this gain against the TOTALS would
 * preserve the cancellation and stay wrong per-term; re-fitting against the physical INDIRECT would
 * fix the ceiling and break the floor, because the floor's runtime share is four times the
 * ceiling's.
 */
export const IRRADIANCE_GAIN = 4.2

/** three's chunk that writes the final colour. Replaced only by the DEV visualiser. */
const OUTPUT_INCLUDE = '#include <opaque_fragment>'
/** Where the indirect-diffuse term is available to modify. */
const LIGHTS_END = '#include <lights_fragment_end>'

/**
 * Prepare a texture as a visibility map. Idempotent, so a shared texture is safe.
 *
 * **No `channel` is set, because the map no longer goes through three's `aoMap` slot** — the
 * shader below declares its own sampler and its own `uv1` varying. See
 * `applyVisibilityLightmap` for why.
 *
 * **`needsUpdate` is only raised when the texture already has image data** — the caller attaches
 * this to a `TextureLoader` texture before its async fetch resolves, and an unconditional flag
 * here used to make three warn (`no image data found`) on every boot; `TextureLoader.load`'s own
 * `ImageLoader` callback sets `image` and `needsUpdate` together once the fetch lands, so this
 * function only needs to cover a texture that already has data when it is prepared.
 */
export function prepareVisibilityTexture(texture: Texture): Texture {
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  if (textureHasImageData(texture)) {
    texture.needsUpdate = true
  }
  return texture
}

function textureHasImageData(texture: Texture): boolean {
  const image = texture.image as { width?: number; data?: ArrayLike<number> } | null | undefined
  if (!image) return false
  if (typeof image.width === 'number' && image.width > 0) return true
  if (image.data && image.data.length > 0) return true
  return false
}

/**
 * Attach `texture` to `material` as a gained visibility map, via a **self-contained shader
 * injection** rather than three's `aoMap` slot.
 *
 * **Why not `aoMap`.** It was the obvious slot and it does not work here. Routed through it, the
 * mapped materials compiled **without `USE_AOMAP`** — proven by painting the sampled value out as
 * the fragment colour with a sentinel for "branch never ran": the mapped walls came back
 * **magenta** (`v0.31.7.36`). three derives that define from `!!material.aoMap` *at program-build
 * time* and pairs it with an `aoMapUv` channel parameter and a matching vertex attribute, and
 * something in that chain does not hold for a map attached after the material exists. Nine
 * hypotheses were eliminated chasing it.
 *
 * So this stops depending on that chain. It declares its own `visMap` sampler, its own `visGain`
 * uniform, and its own `uv1` attribute → varying, and multiplies `reflectedLight.indirectDiffuse`
 * immediately after `lights_fragment_end`. Nothing here is conditional on a three define, so
 * there is no branch that can be compiled out. It is more code than a slot assignment and it is
 * the code that runs.
 *
 * **Diffuse only** — attenuating `indirectSpecular` too is physically tempting and measured
 * *worse* (1.51× against 1.36×).
 *
 * **Call this where the material is built, never on a live material.** Adding the injection
 * compiles a new shader variant — ~19 across a plan — and doing it mid-session cost a measured
 * **216 ms** frame (`v0.31.7.15`). Steady-state cost is nil: 60 fps unchanged at `performance`
 * and `medium` with 331 distinct maps attached.
 */
/**
 * How a baked map enters the shading.
 *
 * - `'multiply'` — `indirectDiffuse *= map * gain`. Correct for a *visibility*
 *   map, which is a dimensionless [0,1] occlusion ratio: it modulates the fill the
 *   app already computes.
 * - `'replace'` — `indirectDiffuse = map * gain`. Required for an *irradiance*
 *   map, which is the light itself. `v0.31.7.67` measured that multiplying by
 *   irradiance is **worse** than multiplying by visibility (+58 % vs +79 % on the
 *   one view where either helps), which is exactly what double-counting looks
 *   like: the app's ambient/hemisphere fill is still there, and the map scales it
 *   instead of standing in for it.
 *
 * The map fed to `'replace'` must be **indirect-only** — `bake_material.py
 * --pass irradiance` bakes it that way by default, because the app computes
 * direct sun itself and a baked direct term would be double-counted in turn.
 */
/**
 * Rec. 709 luminance of the `visGain` uniform.
 *
 * `visGain` became a `vec3` so the injected irradiance could carry illuminant chroma (`(z4)`).
 * The tint that colours it is luminance-preserving by construction, so this returns the SCALAR
 * gain that went in — which makes it the natural assertion for the scale-threading tests, and a
 * stronger one than reading a bare float was: it fails if a tint ever smuggles in a brightness
 * change, which is the one way this feature could silently invalidate `IRRADIANCE_GAIN`.
 */
export function visGainLuminance(v: { x: number; y: number; z: number }): number {
  return 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z
}

/**
 * LAMP-BOUNCE shader side (see `lampBounce.ts` for the model and its measurement). Each patched
 * material carries its own `lampBounce` uniform whose `base` is that surface's per-room,
 * per-orientation bounce; `setLampBounce` scales every registered uniform by the lights level
 * (0 off … 1 on) in one pass, so the switch reaches the whole flat without touching the
 * materials. The DEV seam `?lampBounce=<k>` multiplies every base for a sweep.
 */
interface LampUniform {
  value: number
  base: number
}
const lampUniforms = new Set<LampUniform>()
let lampLevel = 0
function lampSeam(): number {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 1
  const q = new URLSearchParams(window.location.search)
  const v = Number(q.get('lampBounce'))
  return q.has('lampBounce') && Number.isFinite(v) && v >= 0 ? v : 1
}
export function setLampBounce(lightsLevel: number): void {
  lampLevel = Math.max(0, Math.min(1, lightsLevel))
  const k = lampSeam()
  for (const u of lampUniforms) u.value = u.base * lampLevel * k
}

/**
 * EXTERIOR-FACE-DAYLIGHT: how much irradiance an EXTERIOR shell face takes on top of three's
 * analytic fill at full daylight, in the same units as the injected `visGain`.
 *
 * **Why a boost at all.** `markExteriorFaces` gives an outward-pointing shell face
 * `uv1 = (-2,-2)` so it escapes the interior bake (`(ab)`), which left it on the analytic
 * hemisphere/ambient/IBL fill — a flat mid-grey. That fill is tuned for INTERIOR surfaces, and an
 * exterior face is not one: it sees the whole sky dome, and a Cycles reference of the living
 * near-down pose renders it near-white. The estate solves exactly this problem for its own boxes
 * with an emissive `EXTERIOR_DAY_BOOST` (1.1x albedo by day, `estate/Estate.tsx`) — this is the
 * same correction for the flat's own shell, applied in the one place that already knows which
 * faces are outside.
 *
 * **Through `BRDF_Lambert`, not as an emissive**, so a dark face stays dark: this is light
 * arriving, not light emitted, and it must be multiplied by the surface's own albedo. That also
 * means the estate's 1.1 is NOT this number in different clothes — `BRDF_Lambert` divides by PI,
 * and the estate's boost sits on materials that additionally carry their own albedo as an
 * `emissiveMap`. The two are not comparable arithmetically, so this one is FITTED.
 *
 * **Measured against the Cycles reference** (`/tmp/photoreal/bref-mottle/cyc.png`, 64 samples, the
 * living near-down pose x = 10.9, z = 2.3, yaw 0, pitch −0.18 at 13:00) on a 26x26 patch of the
 * flat's own exterior wall seen THROUGH the pane, chosen as the brightest window in the region
 * with `sd < 3` so it carries no grille bar (the bars do not move with this term and a rect that
 * includes them holds its own p05 flat through the whole sweep — the first two rects tried did):
 *
 * | boost | wall patch mean | vs Cycles 243.5 |
 * | --- | --- | --- |
 * | 0 (before) | 163.7 | −79.8 |
 * | 3.6 | 213.8 | −29.7 |
 * | 8 | 230.2 | −13.3 |
 * | 10 | 234.1 | −9.4 |
 * | **12** | **237.0** | **−6.5** |
 * | 16 | 240.9 | −2.6 |
 *
 * **12 rather than 16, deliberately.** Both are inside the ±10 target and neither clips (the
 * patch's p95 is 238 at 12), and this file's standing principle is that a surface pushed past its
 * reference is a worse error than one left short of it. The reference itself argues the same way:
 * the Cycles scene carries no estate, so its wall sees an unoccluded sky where the app's sees a
 * neighbour block 50 m away — the honest app value is a little UNDER 243.5, not at it.
 */
const EXTERIOR_BOOST = 12

/**
 * Per-material `exteriorBoost` uniform, scaled live by the day level exactly the way
 * {@link setLampBounce} scales the lamp bounce by the lights level.
 *
 * `base` is 0 for a material no exterior face was found on, so the uniform is present in EVERY
 * injected program (rule 1 of `src/scene/CLAUDE.md`'s lightmap bullet: no `#ifdef`, nothing for the
 * engine to compile out, and the program cache key is untouched) and inert wherever it does not
 * apply.
 */
interface ExteriorUniform {
  value: number
  base: number
}
const exteriorUniforms = new Set<ExteriorUniform>()
let exteriorLevel = 0
/**
 * Set the day level (0 night … 1 full day) that scales every exterior face's daylight boost.
 *
 * Driven from `daylightFromAltitude(sun.altitude)` in `VisibilityLightmaps.tsx`, the same ramp
 * `Estate.tsx` scales its own `EXTERIOR_DAY_BOOST` by, so the flat's shell and the neighbour
 * block brighten and darken together through the day.
 */
export function setExteriorBoostLevel(daylight: number): void {
  exteriorLevel = Math.max(0, Math.min(1, daylight))
  for (const u of exteriorUniforms) u.value = u.base * exteriorLevel
}

/** The boost base for a material, given whether the exterior pass marked any face on it. */
export function exteriorBoostBase(hasExteriorFaces: boolean, enabled: boolean): number {
  return hasExteriorFaces && enabled ? EXTERIOR_BOOST : 0
}

export function applyVisibilityLightmap(
  material: MeshStandardMaterial,
  texture: Texture,
  gain: number = IRRADIANCE_GAIN,
  /**
   * DEV visualiser: write the sampled value out as the fragment colour instead of shading, with
   * magenta for "never sampled". Every *indirect* measurement of this term was exhausted before
   * it existed, and it found the fault in one frame. Not a feature: unusable by design.
   */
  debug = false,
  /**
   * Illuminant CHROMA for the injected irradiance, as a linear RGB multiplier.
   *
   * **Why this exists (`(z4)`, measured v0.31.7.264).** Both factors below were scalar — a
   * `float` gain and the map's `.r` channel — so `indirectDiffuse` came out as
   * `grey * BRDF_Lambert( albedo )`. That makes every shadowed surface render at its OWN
   * albedo hue and nothing else: indirect light in this renderer had no colour. Measured
   * against an exposure-matched Cycles reference at the `livingDining` east wall, 17:00, the
   * app's shadowed wall read **R−B +12.4** against the reference's **−14.9** — 27 counts, in
   * the wrong direction. Real shadow fill is sky-coloured and therefore blue.
   *
   * Proof it was the injection and not the light rig: setting the hemisphere's warm
   * `groundColor` to its blue `skyColor` at all three daytime keys moved that patch **0.0
   * counts**, because `replace` mode discards ambient, hemisphere and IBL alike. The light
   * rig had no authority over the surface at all.
   *
   * Defaults to white, so an unset call is byte-identical to the scalar version and the
   * `IRRADIANCE_GAIN` calibration behind it is untouched. Pass a LUMINANCE-PRESERVING tint
   * (`skyTintForAltitude`) so adding chroma cannot smuggle in a brightness change — that
   * separation is what keeps this measurable against the nine-measurement error record.
   */
  tint: readonly [number, number, number] = [1, 1, 1],
  /** This surface's lamp bounce at lights level 1, in the map's irradiance units (`lampBounce.ts`). */
  lampBase = 0,
  /**
   * EXTERIOR-FACE-DAYLIGHT: this material's daylight boost at day level 1 — `EXTERIOR_BOOST` when
   * the exterior pass marked a face on it and the feature is on, 0 otherwise (see
   * {@link exteriorBoostBase}). Only fragments carrying the exterior sentinel ever read it.
   */
  exteriorBase = 0,
): void {
  const map = prepareVisibilityTexture(texture)
  const lampU: LampUniform = { value: lampBase * lampLevel * lampSeam(), base: lampBase }
  lampUniforms.add(lampU)
  material.userData.visLampUniform = lampU
  const exteriorU: ExteriorUniform = { value: exteriorBase * exteriorLevel, base: exteriorBase }
  exteriorUniforms.add(exteriorU)
  material.userData.visExteriorUniform = exteriorU
  material.onBeforeCompile = (shader) => {
    shader.uniforms.visMap = { value: map }
    // Per-material object registered above: one `setLampBounce` write reaches every program.
    shader.uniforms.lampBounce = lampU
    // Same pattern for the day level (EXTERIOR-FACE-DAYLIGHT): one `setExteriorBoostLevel` write
    // reaches every program.
    shader.uniforms.exteriorBoost = exteriorU
    shader.uniforms.visGain = {
      value: new Vector3(gain * tint[0], gain * tint[1], gain * tint[2]),
    }
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 uv1;\nvarying vec2 vVisUv;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvVisUv = uv1;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform sampler2D visMap;\nuniform vec3 visGain;\nuniform float lampBounce;\n' +
          'uniform float exteriorBoost;\nvarying vec2 vVisUv;\n' +
          `${debug ? 'float visDebug = -1.0;\n' : ''}void main() {`,
      )
      .replace(
        LIGHTS_END,
        `${LIGHTS_END}\n\tfloat visOcclusion = texture2D( visMap, vVisUv ).r;\n` +
          // The map IS the incoming light, so it stands in for the fill rather
          // than scaling it -- anything already accumulated into
          // `indirectDiffuse` (ambient + hemisphere + IBL) is discarded on
          // purpose, because keeping it is the double-count `.67` measured.
          //
          // But `indirectDiffuse` is NOT irradiance. Read from three's own
          // source: `RE_IndirectDiffuse_Physical` computes
          // `irradiance * BRDF_Lambert( material.diffuseContribution )`, i.e.
          // irradiance x albedo/PI. Assigning a bare grey value therefore
          // ERASES ALBEDO on every mapped surface -- a dark floor and a white
          // wall get the same number. So the map goes through the same Lambert
          // BRDF three would have applied.
          //
          // `material.diffuseColor`, NOT `diffuseContribution`. Only
          // `PhysicalMaterial` declares the latter -- `BlinnPhongMaterial` and
          // `ToonMaterial` do not -- and this injection is applied to whatever
          // material a baked mesh happens to carry. Referencing a
          // physical-only field made the program fail to compile
          // (`VALIDATE_STATUS false`), and a failed program renders as if the
          // term were zero, which is indistinguishable from a real result:
          // `v0.31.7.90`-`.92`'s app-side numbers were all that failure.
          // `diffuseColor` exists in every struct. For physical materials
          // three's own path uses `diffuseContribution`, which additionally
          // accounts for transmission/sheen energy, so this is a slight
          // simplification -- and a compiling one.
          // EXTERIOR-FACE-LIGHTMAP: `uv1 = (-1,-1)` is the applier's sentinel for a face that
          // points OUT of the building (`lightmapExterior.ts`). The bake only fills a shell box's
          // ROOM-FACING atlas slots, so such a face would otherwise be handed the INTERIOR face's
          // irradiance by the UV builder's mirror-row reconciliation — the wrong data at the wrong
          // scale, seen through the living-room pane as a 10-20 cm grey-brown mottle on the flat's
          // own outside wall. For those fragments the whole replace is skipped, so three's own
          // analytic hemisphere/ambient/IBL fill stands — and the lamp bounce is skipped with it,
          // because an exterior face receives no interior lamp interreflection either.
          //
          // Unconditional GLSL (a runtime branch on a varying, not an `#ifdef`), so it neither
          // changes the program cache key nor gives the engine anything to compile out — the
          // property rule 1 of `src/scene/CLAUDE.md`'s lightmap bullet exists to protect.
          '\tif ( vVisUv.x < -1.5 ) {\n' +
          // ASCII only: GLSL ES source is specified as ASCII, so no em dash or curly quote here.
          '\t\t// exterior face: analytic fill, plus the daylight boost (EXTERIOR-FACE-DAYLIGHT)\n' +
          // `diffuseColor.a` is the WALL-REVEAL fade (1 for every opaque surface, so walk mode is
          // unaffected). A faded wall is a UI device for looking INTO the dollhouse, and a sky-lit
          // exterior face composited over the room behind it veils exactly what the fade exists to
          // show -- measured in orbit as the kitchen disappearing behind its own front wall. Alpha
          // blending already scales the result once, so this makes the boost fall off as the
          // SQUARE of the fade: full where the wall is solid, ~0.14x at the 0.37 fade floor.
          '\t\treflectedLight.indirectDiffuse += exteriorBoost * diffuseColor.a * BRDF_Lambert( material.diffuseColor );\n' +
          '\t} else if ( vVisUv.x < 0.0 ) {\n' +
          '\t\t// section cut cap: keep the analytic fill, and nothing else -- a cut is not a surface\n' +
          '\t} else {\n' +
          // LAMP-BOUNCE: the lamps' first bounce, added in the same irradiance units (see above).
          '\t\treflectedLight.indirectDiffuse = ( visOcclusion * visGain + vec3( lampBounce ) ) * BRDF_Lambert( material.diffuseColor );\n' +
          (debug ? '\t\tvisDebug = visOcclusion;\n' : '') +
          '\t}',
      )
    if (debug) {
      shader.fragmentShader = shader.fragmentShader.replace(
        OUTPUT_INCLUDE,
        'gl_FragColor = visDebug < 0.0\n' +
          '  ? vec4( 1.0, 0.0, 1.0, 1.0 )\n' +
          '  : vec4( vec3( clamp( visDebug, 0.0, 1.0 ) ), 1.0 );',
      )
    }
  }
  // Encodes the gain and the debug mode, so two variants cannot share one cached program.
  // Mode is in the key: `replace` and `multiply` are different programs, and a
  // constant key already collapsed two variants once (`v0.31.7.44`).
  // PER-MATERIAL GENERATION, not the gain. `(z9)`.
  //
  // The key used to encode the gain, which made a plan compile **~195 distinct programs** for its
  // baked materials -- and at `.15`'s measured 216 ms per compile that is the `(z)`6 load hitch:
  // the worst frame ran **1130-1224 ms**, against 13-344 ms with a single program.
  //
  // The gain was in the key to stop a re-application silently keeping the old value
  // (`v0.31.7.44`), and that hazard is real, though narrower than it was once stated. Read three's
  // `getProgram`: `materialProperties.programs` is a Map on the MATERIAL, so a key only dedupes
  // variants WITHIN one material -- two materials can never bleed uniforms into each other. But on
  // a key HIT it returns early, skipping `onBeforeCompile` AND the `materialProperties.uniforms`
  // assignment, so re-attaching with a new gain would never reach the GPU. Materials outlive a plan
  // change here (see `visClonedFrom`), so that path is live.
  //
  // A generation satisfies both. Every attach bumps it, so an attach ALWAYS misses for that
  // material and `onBeforeCompile` always re-runs with the new values -- exactly `.44`'s guarantee,
  // and stronger than keying on the gain, which missed a change of MAP at an unchanged gain.
  // Meanwhile every material attached once shares generation 1, so the whole plan compiles ONE
  // program instead of one per distinct gain.
  //
  // Deliberately NOT reset by `detachVisibilityLightmap`: after a detach the material recompiles
  // to its stock program with a FRESH uniforms object that has no `visMap`/`visGain`, so a
  // re-attach that reused an earlier generation would hit that generation's injected program and
  // find those uniforms missing -- an indirect term of zero, which looks like a bake problem
  // rather than a cache one. Monotonic means a re-attach can never land on a stale entry.
  const generation = ((material.userData.visGeneration as number | undefined) ?? 0) + 1
  material.userData.visGeneration = generation
  material.customProgramCacheKey = () => `visLightmap:${generation}${debug ? ':dbg' : ''}`
  // Marked so it can be found and DETACHED again. Materials outlive a plan change -- they are
  // shared/cached across plans -- so a re-run that only adds maps leaves the previous plan's
  // visibility on any material the new plan reuses (`v0.31.7.45`).
  material.userData.visLightmap = true
  if (import.meta.env.DEV) {
    // DEV-only handle so a probe can check the texture actually LOADED, not just
    // that the injection ran. `v0.31.7.93`: three irradiance bakes produced
    // identical statistics because the fetch had failed and `replace` was
    // assigning zero -- indistinguishable, from outside, from a real result.
    ;(material as unknown as { __visMapForProbe?: unknown }).__visMapForProbe = map
  }
  material.needsUpdate = true
}

/**
 * Remove a visibility lightmap from a material, restoring three's own shading.
 *
 * Needed because **materials survive a plan change**. The maps are per-plan, so re-running the
 * apply pass without first detaching leaves the old plan's visibility attached to every material
 * the new plan happens to reuse — which is indistinguishable from the feature working, and was
 * measured as a plan-2 result that did not move across three different code states.
 *
 * Restores rather than nulls: `onBeforeCompile` and `customProgramCacheKey` are three's own
 * no-op/default when untouched, so putting those back is what actually returns the material to
 * its stock program.
 */
export function detachVisibilityLightmap(material: MeshStandardMaterial): boolean {
  if (!material.userData?.visLightmap) return false
  material.onBeforeCompile = () => {}
  const lampU = material.userData.visLampUniform as LampUniform | undefined
  if (lampU) lampUniforms.delete(lampU)
  delete material.userData.visLampUniform
  const extU = material.userData.visExteriorUniform as ExteriorUniform | undefined
  if (extU) exteriorUniforms.delete(extU)
  delete material.userData.visExteriorUniform
  // Deleting restores `Material.prototype.customProgramCacheKey`, which is what three uses when
  // a material has not overridden it. Assigning `undefined` would break that lookup.
  delete (material as { customProgramCacheKey?: unknown }).customProgramCacheKey
  delete material.userData.visLightmap
  material.needsUpdate = true
  return true
}
