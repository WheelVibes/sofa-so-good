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
import type { RenderTier } from '../scene/quality'

/** Render tiers that can afford real glass transmission (extra render pass).
 *  Performance + Medium stay on cheap transparency so the flat default and the
 *  mid tier never pay for it. Mirrors `mirrorReflectorConfig`'s High/Maximum
 *  gate. */
export function transmissionTiers(tier: RenderTier): boolean {
  return tier === 'high' || tier === 'maximum'
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
export function transmissionResolutionScaleForTier(tier: RenderTier): number {
  return tier === 'high' ? 0.75 : 1
}

/**
 * Emissive intensity for a window pane's **sky-catch** (RZ2): by day the glass
 * reads as bright, lit by the sky; at night it goes dark (a reflective pane).
 * Cheap (emissive only, no transmission pass) so it works on every tier —
 * including the flat Performance default where windows otherwise read as flat
 * dark panes. `daylight` is 0 (night) … 1 (full day).
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
 */
export function glassSkyCatchIntensity(daylight: number, backdropVisible = false): number {
  return backdropVisible ? 0 : clamp(daylight, 0, 1) * 0.4
}

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
