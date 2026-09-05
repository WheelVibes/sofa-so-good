/**
 * PR3c — material-realism decision logic. Pure functions (no GPU / no three
 * imports) that decide which physically-based finishing layers a finish earns
 * and how strong they are, plus the tier-gate for the expensive ones. Kept
 * separate from `furnitureMaterials.ts` so the decisions are unit-testable
 * without a WebGL context.
 *
 * Three layers are added on top of the base PBR finish:
 *  - **sheen** — the soft retroreflective halo real velvet / satin / brushed
 *    upholstery shows at grazing angles. Cheap; only visible with IBL, so it is
 *    effectively free on Performance (no IBL there) and never regresses it.
 *  - **clearcoat** — a thin glossy lacquer film over an otherwise matte base
 *    (lacquered wood, ceramic, glossy plastic). Also cheap + IBL-driven.
 *  - **transmission** — real refractive glass (windows, glass table tops,
 *    cabinet/vase glass). This one is GPU-expensive (an extra transmission
 *    render pass), so it is **tier-gated**: only High / Maximum get true
 *    transmission; Performance / Medium keep the cheap transparent+opacity look.
 */
import type { DeviceClass, RenderTier } from '../scene/quality'

/** Render tiers that can afford real glass transmission (extra render pass).
 *  Performance + Medium stay on cheap transparency so the flat default and the
 *  mid tier never pay for it. Mirrors `mirrorReflectorConfig`'s High/Maximum
 *  gate. */
export function transmissionTiers(tier: RenderTier): boolean {
  return tier === 'realistic'
}

/** Physical glass parameters for the transmission-capable tiers. `transmission`
 *  drives the refractive pass; `ior` ≈ 1.5 is window / architectural glass;
 *  `thickness` feeds the volume tint; low `roughness` keeps it clear. */
export interface GlassPhysical {
  transmission: number
  ior: number
  thickness: number
  roughness: number
  metalness: number
}

/** Cheap fallback glass (transparent + opacity) for Performance / Medium — no
 *  transmission pass. Mirrors the look the inline primitives already used, plus
 *  a cheap fresnel + sky-reflection so panes read as glass without the pass
 *  (RD-405). */
export interface GlassCheap {
  transparent: true
  opacity: number
  roughness: number
  metalness: number
  /** Index of refraction (≈1.5 architectural glass). On a `MeshPhysicalMaterial`
   *  this drives a physically-correct fresnel rim — brighter reflection toward
   *  grazing angles — even with no transmission pass, on any tier that has
   *  lighting/IBL. */
  ior: number
  /** Reflection strength against the IBL sky probe. Medium has IBL, so cheap
   *  glassware/panes catch a faint sky reflection there; Performance has no IBL,
   *  so it's a no-op on the flat default (no regression). */
  envMapIntensity: number
}

/**
 * Resolve glass material parameters for a tier. `opacity` is the legacy cheap
 * opacity the caller used (so each piece keeps its own clarity); on the
 * transmission tiers it is mapped to a transmission strength (clearer glass =
 * higher transmission) and a matching thickness.
 */
export function glassConfig(
  tier: RenderTier,
  opacity = 0.3,
  tint = 0,
): { physical: GlassPhysical | null; cheap: GlassCheap | null } {
  if (transmissionTiers(tier)) {
    // A nearly-clear pane (low opacity) transmits almost fully; a frosted /
    // tinted pane (high opacity) transmits less. Clamp so it never hits the
    // degenerate 0 / 1 ends.
    const transmission = clamp(1 - opacity * 0.85, 0.55, 0.98)
    return {
      physical: {
        transmission,
        ior: 1.5,
        // Thicker volume for tinted glass so the tint reads; thin for clear.
        thickness: 0.02 + tint * 0.3,
        roughness: 0.04,
        metalness: 0,
      },
      cheap: null,
    }
  }
  return {
    physical: null,
    // Cheap glass gains a fresnel rim (`ior`) + a faint sky reflection
    // (`envMapIntensity`) so panes read as glass on Medium without a transmission
    // pass; both are inert on the IBL-less Performance tier (RD-405).
    cheap: {
      transparent: true,
      opacity,
      roughness: 0.05,
      metalness: 0.1,
      ior: 1.5,
      envMapIntensity: 0.6,
    },
  }
}

/** Soft sky-blue a window pane's "sky-catch" emissive uses (RZ2). */
export const GLASS_SKYCATCH_COLOR = '#cfe4f5'

/**
 * WINDOW-pane physical glass parameters (PHOTO-GLASS). High/Maximum only —
 * same `transmissionTiers` gate as glassware's `getGlassMaterial` (transmission
 * costs an extra transmissive render pass). Returns `null` on Performance /
 * Medium so those tiers keep the cheap transparent+opacity pane BYTE-IDENTICAL.
 *
 * A window pane keeps `transparent: true` (unlike glassware) because the wall
 * reveal composes the pane's fade through `opacity` — transmission and alpha
 * blending stack fine; opacity just scales the whole result.
 */
export interface WindowGlassPhysical {
  ior: number
  /** Pane volume depth (m) feeding the refraction/attenuation — real HDB pane ~6 mm. */
  thickness: number
  /** Faint green edge tint real float glass shows (KHR_materials_volume). */
  attenuationColor: string
  attenuationDistance: number
  /**
   * **Currently inert, and deliberately kept anyway (v0.31.5.175).** Both panes
   * apply it as `Math.max(glassPhysical.roughness, glassParams.roughness)` so a
   * frosted/reeded glass KIND can only ever be rougher, never smoother, than the
   * physical baseline. `glassConfig`'s clear-glass roughness is 0.1, which is
   * above this 0.05, so this value never wins for any shipped kind.
   *
   * Swept anyway, because a round was spent assuming it mattered: driving the
   * pane's ACTUAL roughness 0.1 → 0.02 → 0 moves the window's micro-contrast
   * 19.96 → 20.18 → 20.18, i.e. **+1 %**. Transmission blur is not what makes a
   * window read as a pale slab — see the `.174`/`.175` entries in
   * `docs/research/2026-08-31-photoreal-shadow-depth.md`. Do not tune this
   * expecting a visible change.
   */
  roughness: number
  metalness: number
}

export function windowGlassPhysical(tier: RenderTier): WindowGlassPhysical | null {
  if (!transmissionTiers(tier)) return null
  return {
    ior: 1.5,
    thickness: 0.006,
    attenuationColor: '#d7efe4',
    attenuationDistance: 0.5,
    roughness: 0.05,
    metalness: 0,
  }
}

/**
 * Transmission strength for a window pane by daylight (PHOTO-GLASS). Preserves
 * the day/night glass story the cheap tiers tell with opacity: by day the pane
 * transmits almost fully (clear glass, subtle refraction); at night it drops
 * toward a dark reflective pane (interior reads its own reflection, not a
 * see-through hole into the void). `daylight` is 0 (night) … 1 (full day).
 */
export function windowTransmission(daylight: number): number {
  return 0.2 + clamp(daylight, 0, 1) * 0.72
}

/**
 * Renderer-level `transmissionResolutionScale` per tier (PHOTO-GLASS): High
 * renders the shared transmissive pass at 75% resolution to bound the cost of
 * full-wall window panes; Maximum keeps full res. Tiers without transmission
 * never render the pass, so the value is inert there — keep it 1.
 */
export function transmissionResolutionScaleForTier(tier: RenderTier, device: DeviceClass): number {
  return tier === 'realistic' && device === 'weak' ? 0.75 : 1
}

/**
 * Emissive intensity for a window pane's **sky-catch** (RZ2): by day the glass
 * reads as bright, lit by the sky; at night it goes dark (a reflective pane).
 * Cheap (emissive only, no transmission pass) so it works on every tier —
 * including the flat Performance default where windows otherwise read as flat
 * dark panes. `daylight` is 0 (night) … 1 (full day).
 *
 * ## `d³ · 5.2` is item `(l)`'s fix — the magnitude and the CURVE are both measured
 *
 * **Why 5.2 (×13 the old 0.4).** `(l)` WINDOW-LUMINANCE: photographs blow their windows out,
 * clipping **15–39 %** of the glazing, while the app clipped **0.0 % at every hour** — so a pane
 * read as a panel, not an opening. The item's fix space pointed at `scene.background`, and
 * `v0.31.7.152` proved that **cannot work**: a pane never reads the background, it reads this
 * emissive. Four arms (analytic/Cycles sky × intensity 1/4) all measured 0.0 % above 240. Swept on
 * the real lever, ×13 gives **33.0 %** at 13:00 and **27.5 %** at 18:00 — both in band.
 *
 * **Why cubed, and not linear.** At flat ×13 the 19:00 frame **blooms**: a glow spills onto the wall
 * and ceiling and the grille bars lose definition (`v0.31.7.156`), while the statistics looked
 * harmless — pane mean 231.6, `> 240` 0.0 %. `bloomIntensityForDay(d) = BLOOM.intensity · (1 − d)`
 * is non-zero for every `d < 1`, so the overlap cannot be removed by reshaping this function; the
 * cube **narrows** it, holding the pane under the old `< 1.05` threshold until `d ≈ 0.59`:
 *
 * | day level | bloom | linear `d·5.2` | **cubic `d³·5.2`** |
 * | --- | --- | --- | --- |
 * | 0.4 | 60 % | 2.08 | **0.33** |
 * | 0.6 | 40 % | 3.12 | **1.12** |
 * | 0.8 | 20 % | 4.16 | 2.66 |
 * | 1.0 | **0 %** | 5.2 | 5.2 |
 *
 * **Night cannot regress, by construction rather than by guard** — `(l)`'s standing constraint. At
 * `daylight = 0` this is exactly 0, so no coefficient has anything to scale; the test below pins it.
 *
 * `> 250` stays at 0.0 % for every multiplier tried, including ×16 at a mean of 240.6: that is AgX's
 * shoulder. A clipping metric defined at `> 250` would call every setting a failure.
 *
 * **`d⁴ · 8.32`, raised from `d³ · 5.2` in v0.31.7.281, and the sweep that justified it had been
 * misread twice.** `patch-read` reporting **p95** finally separated the glass from the grille bars
 * that share the patch, and against the Cycles reference the glass was **243 where physics reads
 * 254** — a real 11-count deficit that `.279` had written off as "the emissive saturates". That
 * conclusion came from a MEAN (bar-dominated, so blind to the glass) and from a `SKYCATCH` sweep
 * read as absolute intensities when the knob is a MULTIPLIER: "5.2, 9, 13" were ×5.2, ×9, ×13 on
 * top of the default, i.e. ~27 to ~68, every one of them clipped at p95 255. Swept properly, the
 * glass responds: ×1.25 → p95 246, **×1.6 → 248**, ×2.2 → 251.
 *
 * ×1.6 is taken, not ×2.2: at ×2.2 the bars' p05 falls 187 → 163, so pushing the glass further
 * starts undoing `grilleGlareIntensity`'s match. And the EXPONENT rises with the coefficient for
 * the reason `.156` went linear → cubic in the first place. The ratio to the old curve is exactly
 * **`1.6 · d`**, so the two CROSS at `d = 0.625`: the new curve is brighter only from there to
 * full daylight, and strictly lower through the deep-dusk band below it (0.520 against 0.650 at
 * `d = 0.5`; 0.213 against 0.333 at 0.4). A curve that is higher at 1 and lower below has to cross
 * somewhere — the point is WHERE, and 0.625 puts the extra brightness where `bloomIntensityForDay`
 * has ramped down to 37 % and under, while both codified dusk guards gain margin rather than
 * losing it. Note also that `daylightFromAltitude` is 1.0 for any sun above the horizon, so this
 * entire ramp lives in the −8°..0° twilight window, not across the afternoon.
 *
 * **`backdropVisible` retires it (GLASS-SKYCATCH-VEIL, v0.31.8.50).** The
 * sky-catch is a *stand-in* for sky luminance, for the case where there is
 * nothing behind the pane to see. In walk mode with a backdrop painted there IS
 * something behind the pane, and the stand-in then double-counts: a CONSTANT
 * emissive term added to every pane pixel, which raises the floor uniformly and
 * so compresses whatever the backdrop carries. Measured at the living-room
 * window of the default 4-room flat, 13:00, `medium`, dropping it to 0:
 *
 * | backdrop | pane sd | pane spread p95−p05 |
 * | --- | --- | --- |
 * | `sky` (default) | 15.9 → **20.1** | 47 → **63** |
 * | `city` | 10.5 → **11.5** | 31 → **38** |
 *
 * i.e. the stand-in was costing **23–34 % of the window's luminance range** at
 * exactly the hour and pose WINDOW-LUMINANCE `(l)` is measured at. It cannot
 * regress the 21:00 case `(l)` records as already correct, because at night
 * `daylight` → 0 and the sky-catch is already 0 there by construction. Orbit /
 * dollhouse and every backdrop-less path keep it — that is the case RZ2 added
 * it for, and it is untouched.
 *
 * **The estate is the SECOND real view behind the pane, retired the same way
 * (ESTATE-SKYCATCH-VEIL).** `backdropVisible` only tracks the PHOTO backdrop
 * (`backdropVisibleNow`, `SceneBackdrop.tsx`'s `isPhotoBackdropActive`) — it knows
 * nothing about `<Estate>`, the real HDB-neighbour geometry drawn behind the same
 * glass (`estateSignal.ts`'s `estateVisibleNow`). The two are NOT the same
 * condition: `Estate.tsx`'s own gate mounts the estate whenever the backdrop is
 * `'sky'` **or** `'none'`, so a walk with `backdrop: 'none'` still has a real, lit
 * neighbour block right behind the pane while `backdropVisibleNow()` reads
 * `false` — exactly the double-count this function exists to prevent, just from
 * the other signal. Both call sites (`apartment/Window.tsx`, `apartment/
 * PlanShell.tsx`) now pass `backdropVisibleNow() || estateVisibleNow()`.
 * Measured on the default 4-room flat's living-room window, 13:00, `realistic`,
 * `backdrop: 'none'` (the config that reaches the gap — the default `sky`
 * backdrop already reads `backdropVisibleNow() === true` via `proceduralSky`,
 * so it never needed the estate signal and is untouched):
 *
 * | | mean | pane sd | pane spread p95−p05 | % > 240 |
 * | --- | --- | --- | --- | --- |
 * | before (ei = 8.32) | 233.5 | 25.4 | 64 | **61.2 %** |
 * | after (ei = 0) | 183.6 | 28.2 | 96 | **0.3 %** |
 *
 * i.e. the veil was clipping **61 % of the pane** to a flat white haze that hid
 * the neighbour block entirely; after the fix the pane matches the `sky`-backdrop
 * numbers exactly (183.5 mean / 28.2 sd / 0.3 % at the same pose), because both
 * paths now retire the same way. Cannot regress night (sky-catch already 0
 * there by construction) or the default `sky`-backdrop path (already
 * byte-identical before and after, since `backdropVisibleNow()` alone already
 * covered it).
 */
export function glassSkyCatchIntensity(daylight: number, backdropVisible = false): number {
  // GLASS-SKYCATCH-VEIL takes precedence over the curve: when a real view is painted behind
  // the pane there is nothing for a stand-in to stand in for, so no coefficient applies.
  if (backdropVisible) return 0
  const d = clamp(daylight, 0, 1)
  // `v0.31.7.281`: `d⁴ · 8.32`, was `d³ · 5.2`. Brighter ONLY near full daylight and
  // strictly SAFER through the deep-dusk band -- see the note above.
  return d * d * d * d * 8.32
}

/**
 * VEILING GLARE on the safety grille's bars, as an emissive keyed to daylight.
 *
 * **The measurement, and it is a PERCENTILE one (`(l)`, v0.31.7.280).** At the reference window
 * pose, daylight-only and exposure-matched, the pane region splits into two populations that a
 * mean cannot separate — thin bars and bright glass:
 *
 * | | mean | p05 (bars) | p95 (glass) |
 * | --- | --- | --- | --- |
 * | Cycles | 244.8 | **187** | **254** |
 * | app, before | 217.4 | **91** | 243 |
 *
 * So the app's GLASS is nearly right (243 against 254) and the BARS are **96 counts too dark**.
 * Physics puts a very bright aperture behind the grille and veiling glare washes the bars out;
 * the app renders them crisp and dark. That is the whole of the 27-count mean gap.
 *
 * Two earlier conclusions were artefacts of reading the MEAN of those two populations:
 * `v0.31.7.279`'s "the pane emissive saturates" (a 5.2 -> 13 sweep moved the mean 1.4 counts
 * because bars dominate it, not because the glass failed to brighten), and this function's own
 * first calibration, which hit the mean target and overshot the bars to p05 213.
 *
 * **Why not bloom, which is the physically honest answer.** `bloomIntensityForDay(d) =
 * BLOOM.intensity * (1 - d)` is exactly 0 at full daylight and the pass is UNMOUNTED once it ramps
 * to zero (BLOOM-MIP-FLASH: cheaper, and one less way to blank a frame on ANGLE/Metal). Re-keying
 * it to aperture luminance collides with that and with `v0.31.7.156`, where a bright pane plus
 * bloom spilled onto wall and ceiling and destroyed grille definition — and it would add a midday
 * blur chain the daylight path does not pay for.
 *
 * So this is deliberately a LOCAL approximation: it lifts the bars, which is where the measured
 * error is, and does not spill onto the surrounding wall. Calibrated on **p05**, not the mean.
 *
 * **Night cannot regress, by construction rather than by guard**, the same discipline as
 * `glassSkyCatchIntensity`: cubed, so exactly 0 at `daylight = 0` and negligible through the dusk
 * band where `.156`'s bloom overlap lives.
 */
export function grilleGlareIntensity(daylight: number): number {
  const d = clamp(daylight, 0, 1)
  return d * d * d * GRILLE_GLARE
}

/** Coefficient for {@link grilleGlareIntensity}, CALIBRATED on p05 against the Cycles reference. */
const GRILLE_GLARE = 1.4

/** Sheen layer for a soft-fabric finish kind. Velvet shows the strongest, most
 *  coloured sheen; satin / woven fabric a subtler one; leather a faint specular
 *  sheen. Returns `null` for finishes that should stay matte. `sheenColorLift`
 *  is how far the caller lifts the body colour toward white for the sheen lobe
 *  (a brighter lobe than the body reads as real pile). */
export interface SheenLayer {
  sheen: number
  sheenRoughness: number
  /** 0..1 — how much to lift the body colour toward white for the sheen lobe. */
  sheenColorLift: number
}

export function sheenLayer(kind: string): SheenLayer | null {
  switch (kind) {
    case 'velvet':
      return { sheen: 1, sheenRoughness: 0.3, sheenColorLift: 0.45 }
    case 'leather':
      return { sheen: 0.35, sheenRoughness: 0.5, sheenColorLift: 0.2 }
    // Woven fabric gets a gentle satin sheen so linen / cotton catch grazing
    // light without looking plasticky.
    case 'fabric':
      return { sheen: 0.4, sheenRoughness: 0.6, sheenColorLift: 0.25 }
    default:
      return null
  }
}

/** Clearcoat layer for a hard finish kind. Lacquered (gloss) surfaces and
 *  polished stone get a thin, fairly smooth coat; ceramic a glossier one. Matte
 *  paint / wood / concrete / rattan get none. */
export interface ClearcoatLayer {
  clearcoat: number
  clearcoatRoughness: number
}

export function clearcoatLayer(kind: string): ClearcoatLayer | null {
  switch (kind) {
    case 'gloss': // lacquered / high-gloss laminate
      return { clearcoat: 0.8, clearcoatRoughness: 0.12 }
    case 'ceramic':
      return { clearcoat: 1, clearcoatRoughness: 0.06 }
    case 'marble':
    case 'stone': // polished stone reads wet under a faint coat
      return { clearcoat: 0.5, clearcoatRoughness: 0.18 }
    default:
      return null
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
