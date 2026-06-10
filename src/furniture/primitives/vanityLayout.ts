/**
 * Pure layout maths for the Vanity (dressing table) configurator — the
 * `layout` param reshapes the base the same way the wardrobe's `interior`
 * param reshapes the open wardrobe (C205). Render-agnostic so the
 * param→geometry mapping is unit-testable without a GPU; `Vanity.tsx` maps
 * the returned parts onto meshes.
 *
 * Layouts (grounded in real dressing tables):
 * - `legs`            — open four-leg table with a slim apron drawer band.
 * - `single-pedestal` — a drawer pedestal on the left, slender legs on the
 *                       right, knee space beside the pedestal.
 * - `double-pedestal` — classic kneehole desk: drawer pedestals both sides
 *                       of a centred knee space, plus a slim centre drawer.
 *
 * All parts are centre+size boxes in the primitive's local frame
 * (floor-anchored, footprint-centred, facing +Z, metres).
 */

export type VanityLayoutKind = 'legs' | 'single-pedestal' | 'double-pedestal'

/** A centre+size box part (x/y/z centre, w/h/d size, metres). */
export interface VanityPart {
  key: string
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

export interface VanityBuild {
  /** Tabletop slab (top face at {@link VANITY_TABLE_H}). */
  top: VanityPart
  /** Floor-reaching supports: legs and/or pedestal carcasses. */
  supports: VanityPart[]
  /** Apron / drawer-band boxes attached under the tabletop. */
  aprons: VanityPart[]
  /** Drawer fronts on the front face — every front stays inside the footprint. */
  drawerFronts: VanityPart[]
  /** Clear knee-space width between the inner faces of the supports (m). */
  kneeWidth: number
}

/** Tabletop top-face height (standard dressing-table height). */
export const VANITY_TABLE_H = 0.75
/** Tabletop slab thickness. */
export const VANITY_TOP_T = 0.03
/** Square leg side. */
const LEG_T = 0.04
/** Drawer-front slab thickness. */
const FRONT_T = 0.018
/** Gap between stacked pedestal drawer fronts. */
const DRAWER_GAP = 0.012
/** Minimum knee-space width preserved by the double-pedestal layout. */
export const MIN_KNEE = 0.35

/** Pedestal width for a layout: capped so the knee space stays usable. */
export function pedestalWidth(width: number, layout: VanityLayoutKind): number {
  if (layout === 'double-pedestal') return Math.min(0.35, (width - MIN_KNEE) / 2)
  return Math.min(0.4, width * 0.38)
}

/** Body (support) height: floor → underside of the tabletop. */
const bodyH = VANITY_TABLE_H - VANITY_TOP_T

/** A square leg centred `LEG_T` inside a footprint corner. */
function leg(key: string, x: number, z: number): VanityPart {
  return { key, x, y: bodyH / 2, z, w: LEG_T, h: bodyH, d: LEG_T }
}

/** A drawer pedestal carcass at centre x `cx`, set back so its fronts sit
 *  proud of the carcass yet still inside the footprint depth. */
function pedestal(key: string, cx: number, pedW: number, depth: number): VanityPart {
  const setback = FRONT_T + 0.004
  return { key, x: cx, y: bodyH / 2, z: -setback / 2, w: pedW, h: bodyH, d: depth - setback }
}

/** Three stacked drawer fronts down a pedestal at centre x `cx`. */
function pedestalFronts(keyPrefix: string, cx: number, pedW: number, depth: number): VanityPart[] {
  const rows = 3
  const inset = 0.03 // plinth gap below + reveal above
  const frontH = (bodyH - inset - DRAWER_GAP * (rows - 1)) / rows
  // Backed flush against the carcass front face, still inside the footprint.
  const z = depth / 2 - (FRONT_T + 0.004) + FRONT_T / 2
  return Array.from({ length: rows }, (_, i) => ({
    key: `${keyPrefix}-${i}`,
    x: cx,
    y: 0.02 + frontH / 2 + i * (frontH + DRAWER_GAP),
    z,
    w: pedW - 0.02,
    h: frontH,
    d: FRONT_T,
  }))
}

/** Build the vanity base parts for a footprint + layout. */
export function buildVanity(width: number, depth: number, layout: VanityLayoutKind): VanityBuild {
  const top: VanityPart = {
    key: 'top',
    x: 0,
    y: VANITY_TABLE_H - VANITY_TOP_T / 2,
    z: 0,
    w: width,
    h: VANITY_TOP_T,
    d: depth,
  }
  const legX = width / 2 - LEG_T
  const legZ = depth / 2 - LEG_T

  if (layout === 'single-pedestal') {
    const pedW = pedestalWidth(width, layout)
    const pedX = -width / 2 + pedW / 2
    return {
      top,
      supports: [
        pedestal('ped', pedX, pedW, depth),
        leg('leg-front', legX, legZ),
        leg('leg-back', legX, -legZ),
      ],
      aprons: [],
      drawerFronts: pedestalFronts('ped', pedX, pedW, depth),
      kneeWidth: width - pedW - LEG_T * 1.5,
    }
  }

  if (layout === 'double-pedestal') {
    const pedW = pedestalWidth(width, layout)
    const pedX = width / 2 - pedW / 2
    const kneeWidth = width - pedW * 2
    // Slim centre drawer bridging the knee space, attached under the top.
    const apronH = 0.12
    const apron: VanityPart = {
      key: 'apron-centre',
      x: 0,
      y: bodyH - apronH / 2,
      z: -0.01,
      w: kneeWidth,
      h: apronH,
      d: depth - 0.04,
    }
    const centreFront: VanityPart = {
      key: 'apron-front',
      x: 0,
      y: bodyH - apronH / 2,
      // Backed flush against the apron's front face.
      z: apron.z + apron.d / 2 + FRONT_T / 2,
      w: kneeWidth - 0.02,
      h: apronH - 0.02,
      d: FRONT_T,
    }
    return {
      top,
      supports: [pedestal('ped-l', -pedX, pedW, depth), pedestal('ped-r', pedX, pedW, depth)],
      aprons: [apron],
      drawerFronts: [
        ...pedestalFronts('ped-l', -pedX, pedW, depth),
        ...pedestalFronts('ped-r', pedX, pedW, depth),
        centreFront,
      ],
      kneeWidth,
    }
  }

  // 'legs' (default): four corner legs + a slim apron drawer band with two fronts.
  const apronH = 0.14
  const apron: VanityPart = {
    key: 'apron',
    x: 0,
    y: bodyH - apronH / 2,
    z: -0.01,
    w: width - 0.1,
    h: apronH,
    d: depth - 0.04,
  }
  const frontW = (apron.w - 0.03 * 3) / 2
  const drawerFronts: VanityPart[] = [-1, 1].map((s) => ({
    key: `apron-front-${s}`,
    x: s * (frontW / 2 + 0.015),
    y: apron.y,
    // Backed flush against the apron's front face.
    z: apron.z + apron.d / 2 + FRONT_T / 2,
    w: frontW,
    h: apronH - 0.03,
    d: FRONT_T,
  }))
  return {
    top,
    supports: [
      leg('leg-fl', -legX, legZ),
      leg('leg-fr', legX, legZ),
      leg('leg-bl', -legX, -legZ),
      leg('leg-br', legX, -legZ),
    ],
    aprons: [apron],
    drawerFronts,
    kneeWidth: width - LEG_T * 3,
  }
}
