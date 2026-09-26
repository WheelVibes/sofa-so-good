/**
 * WET-GLASS — what `rain` does to a window PANE. Pure, no three.js.
 *
 * `weather.ts` ships the light: under `rain` the beam is exactly zero, the fill drops to 0.48, the
 * deck cools to 7300 K and the window stops blowing out. Nothing looked WET. For a showroom whose
 * windows are the main connection to the outside, rain that leaves bone-dry glass is a hole in the
 * illusion at the exact place the eye goes.
 *
 * ## The three things that actually make glass read as wet — and the two that do not
 *
 * Lagarde's physically-based wet-surface model (*Water drop 3b*, 2013-04-14,
 * https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/) is the
 * reference every engine still cribs from, and its two headline terms are **albedo darkening**
 * (diffuse attenuates toward 0.2, driven by *porosity*) and a **specular boost**. Both are
 * derived from the water soaking INTO the substrate. Glass has no porosity and no diffuse term at
 * all — `materialRealism.ts:windowTransmissionRealView` already records that a diffuse lobe on a
 * pane is a BUG, not a feature. So the headline wet-surface model is a **no-op on a window**, and
 * applying it anyway would darken the view through the glass, which is the opposite of wet.
 *
 * What is left is what a real pane actually does:
 *
 * | term | how it is applied here | why |
 * | --- | --- | --- |
 * | droplet **normals** | `normalMap` = the pinned bead field | perturbs the TRANSMITTED ray as well as the specular lobe, so the view genuinely bends inside each drop |
 * | **roughness variation** | `roughnessMap` = the runnel tracks | the pane hazes over and the runnels cut CLEAR tracks through it |
 * | droplet **refraction** | free — it is the same `normalMap` through the existing transmission pass | no second pass, no new render target |
 *
 * ## Why there is no clearcoat, and that is a deliberate saving
 *
 * Modelling the water film as a second specular layer is the obvious move and it is the wrong one
 * twice over. Filament's material docs are explicit: *"The clear coat layer effectively doubles the
 * cost of specular computations. Do not assign a value, even 0.0, to the clear coat property if you
 * don't need this second layer"* (https://google.github.io/filament/Materials.md.html). And in
 * three.js `clearcoat` crossing zero changes the program key, so switching the weather picker to
 * `rain` would pay a shader COMPILE on every pane — the class of hitch `src/scene/CLAUDE.md`'s
 * TIER-GESTURE-END already records. The droplet normals carry the wet read on their own; the coat
 * would only add a second highlight the deck has no sun to put in it.
 *
 * ## Why transmission is NOT scaled
 *
 * The tempting third term is "a wet pane transmits a little less". It does, and applying it here
 * would be the exact error GLASS-NIGHT-VEIL was filed against: `MeshPhysicalMaterial` treats the
 * non-transmitted remainder as **diffuse of the pane's own colour**, so taking transmission down
 * by 3 % does not dim the view, it lays a 3 % grey veil over it. The haze of a wet pane belongs to
 * `roughness`, which blurs the transmitted view rather than veiling it. {@link WetGlassGrade} has
 * no transmission field on purpose.
 *
 * ## Tiers
 *
 * | tier | what it gets | cost |
 * | --- | --- | --- |
 * | `performance` | roughness + a touch of opacity on the existing alpha-blended pane | zero — two scalars on a material that is already drawn |
 * | `realistic` | the above plus two 256² textures and a scrolling offset | two texture fetches inside a transmission pass that already runs |
 *
 * The phone tier gets no droplets at all, and that is the documented recommendation rather than a
 * shortcut: three.js's own docs warn that `MeshPhysicalMaterial` "has a higher performance cost,
 * per pixel, than other three.js materials", and the phone tier does not run the transmission pass
 * the droplets would refract through, so a normal map there would buy a specular wobble and
 * nothing else.
 *
 * ## Motion, and why it is the smaller half
 *
 * Only the runnel layer moves, and it moves slowly. The pinned beads never move — a sessile drop is
 * held by contact-angle hysteresis and stays exactly where it landed, so scrolling a single texture
 * containing both layers would slide the whole window, which is the tell that separates a game
 * windscreen from a room.
 *
 * Motion is suppressed entirely under {@link WetGlassOptions.reduceMotion}. This is not only the
 * `prefers-reduced-motion` courtesy (MDN: the query asks to "minimize the amount of non-essential
 * motion", and calls out that "scaling or panning large objects can be vestibular motion
 * triggers" — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion,
 * 2026-06-10). A continuously looping ambient animation that starts by itself, runs past five
 * seconds and sits in parallel with the rest of the UI is squarely what **WCAG 2.2.2 Pause, Stop,
 * Hide (Level A)** asks for a mechanism against
 * (https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html) — and unlike
 * `prefers-reduced-motion`, which only maps to the AAA criterion 2.3.3, that one is Level A. The
 * in-app `reduceMotion` control (`ui/motionPreference.ts`, shipped this round) IS that mechanism.
 * The reduced state is **wet glass, frozen** — the beads, the tracks and the haze all stay, because
 * the request was to remove motion, not to make it stop raining.
 */

import type { WeatherCondition } from '../../state/slices/timeSlice'
import type { RenderTier } from '../quality'

/** How much of a wet-glass treatment a tier can carry. */
export type WetGlassLevel = 'none' | 'film' | 'droplets'

export interface WetGlassOptions {
  condition: WeatherCondition
  tier: RenderTier
  /** The resolved `weatherWetGlass` feature flag. */
  enabled: boolean
  /** `ui/motionPreference.ts:shouldReduceMotion()`. */
  reduceMotion: boolean
  /** `quality.ts:DeviceClass`. A weak device keeps the droplets but freezes them. */
  weakDevice?: boolean
}

/**
 * Which treatment applies. Pure so the tier/flag matrix is unit-testable without a GPU.
 *
 * **Not ramped by daylight, and that is a deliberate departure from `src/scene/CLAUDE.md`'s rule 8**
 * ("every term the injection writes must be scaled by the source it came from"). Every term in
 * `weather.ts` fades to identity at night because its source is DAYLIGHT and a lamp-lit room looks
 * the same under any sky. Wetness's source is PRECIPITATION, which does not stop at dusk — and at
 * night the estate's lit neighbour blocks sit right behind the pane, so a droplet field is *more*
 * legible then, not less. Rule 8 is satisfied by naming the right source, not by ramping anyway.
 */
export function wetGlassLevel(o: WetGlassOptions): WetGlassLevel {
  if (!o.enabled || o.condition !== 'rain') return 'none'
  return o.tier === 'realistic' ? 'droplets' : 'film'
}

export interface WetGlassGrade {
  /**
   * Roughness the pane runs at while wet. On the transmission tier this IS the blur of the view
   * behind the glass (GLASS-CLARITY), so it is the single number that decides whether the frame
   * reads as a rainy window or as a broken one.
   */
  roughness: number
  /** Added to the cheap tier's alpha-blended opacity — a water film scatters a little. */
  opacityAdd: number
  /** `normalMap` strength for the pinned bead field; 0 on tiers that bind no map. */
  normalScale: number
  /** Downward scroll of the runnel layer, in tile heights per second. 0 = frozen. */
  trailSpeed: number
  /** Whether the two droplet textures should be bound at all. */
  maps: boolean
}

/** The dry identity. Exact literals, so `clear` and every non-rain condition are byte-identical. */
const DRY: WetGlassGrade = {
  roughness: 0,
  opacityAdd: 0,
  normalScale: 0,
  trailSpeed: 0,
  maps: false,
}

/**
 * The pane's roughness under a rain film, on the transmission tier.
 *
 * **This is the number the whole feature lives or dies on**, because roughness on a transmissive
 * pane is real blur of the view. The published three.js rainy-window recipe
 * (https://cprimozic.net/notes/posts/building-realistic-rainy-window-pane-in-threejs/, 2023-11-12)
 * runs **0.64** — but that is a hero material whose subject IS the glass, and its own author warns
 * to "keep the surface texture subtle or it swamps the transmission". A showroom window's subject
 * is what is behind it.
 *
 * **0.14, and the first shipped candidate was 0.18 until a frame said otherwise.** At 0.18 the
 * cropped `living-far` pane read visibly milky — the skyline behind it lost its edges and the
 * grille bars in front of it picked up a halo — which is exactly the failure the recipe's author
 * warns about, arriving at less than a third of his number because this pane is also carrying an
 * emissive sky-catch. 0.14 against the pane's dry 0.05 keeps the skyline a skyline and still reads
 * as "not crisp", which is what a rained-on window looks like from three metres inside a room.
 */
const FILM_ROUGHNESS = 0.14

/**
 * The cheap tier's extra opacity. Small on purpose: on `performance` the pane is an alpha blend
 * over the wall behind it, so opacity is the only lever that reads at all, and every count of it
 * is a count of view lost. 0.05 over a 0.28 day pane is a film, not frosting.
 */
const FILM_OPACITY_ADD = 0.05

/**
 * Bead normal strength. Restrained by construction — see the module doc's note that the published
 * recipe's own author warns a strong surface texture swamps the transmission. At 0.4 a drop bends
 * the view inside itself visibly at a metre and is invisible as texture at five.
 */
const BEAD_NORMAL_SCALE = 0.4

/**
 * Runnel scroll speed, tile heights per second. The tile is 0.25 m of glass
 * (`wetGlassTexture.ts:TILE_METRES`), so this is **~1.5 cm/s** of apparent travel.
 *
 * Deliberately an order of magnitude below a real falling drop. A drop that runs at its true speed
 * crosses a window in well under a second and is a flicker; what the eye actually registers on a
 * rainy window is the slow creep of the trails that are *not* running, and that is the part worth
 * animating. Cyanilux's rain breakdown (https://www.cyanilux.com/tutorials/rain-effects-breakdown/,
 * 2023-07-04) puts game-facing slide speeds at 0.7–1.7 in the same units; this is 1/25th of the
 * bottom of that range, which is the difference between a weather effect and a windscreen.
 */
const RUNNEL_SPEED = 0.06

/** The grade for a level. */
export function wetGlassGrade(level: WetGlassLevel, o: WetGlassOptions): WetGlassGrade {
  if (level === 'none') return DRY
  if (level === 'film') {
    return { ...DRY, roughness: FILM_ROUGHNESS, opacityAdd: FILM_OPACITY_ADD }
  }
  return {
    roughness: FILM_ROUGHNESS,
    opacityAdd: 0,
    normalScale: BEAD_NORMAL_SCALE,
    // Frozen on a weak device as well as under reduce-motion: the trails are the only continuous
    // render source this feature adds (`useAnimatedSource`), and a phone-class GPU running the
    // `realistic` tier is exactly where holding the demand loop open costs the most.
    trailSpeed: o.reduceMotion || o.weakDevice ? 0 : RUNNEL_SPEED,
    maps: true,
  }
}

/** Whether the grade needs the demand-mode render loop held open. */
export function wetGlassAnimates(grade: WetGlassGrade): boolean {
  return grade.maps && grade.trailSpeed > 0
}
