/**
 * Drapery opacity / light-blocking levels (CURTAIN-OPACITY).
 *
 * A curtain/blind's **opacity** is an axis separate from its weave: any fabric
 * can be woven loose (sheer) or lined for full blackout. Each level maps to two
 * numbers — the **visual** material opacity (how see-through the cloth renders)
 * and the **transmit** floor (the fraction of daylight that still passes when the
 * treatment fully covers a window, fed into `windowLightModifiers`). Pure +
 * unit-tested; shared by the primitives (visual) and the lighting model (transmit).
 */

export type DraperyOpacity = 'sheer' | 'light' | 'room' | 'blackout'

const DRAPERY_OPACITY: Record<DraperyOpacity, { visual: number; transmit: number }> = {
  // Loose weave: lots of daylight diffuses through; cloth reads translucent.
  sheer: { visual: 0.4, transmit: 0.45 },
  // Light-filtering: softens daylight; slightly translucent.
  light: { visual: 0.72, transmit: 0.3 },
  // Room-darkening (default): opaque cloth, most daylight blocked.
  room: { visual: 1.0, transmit: 0.12 },
  // Blackout: opaque + lined, blocks essentially all daylight.
  blackout: { visual: 1.0, transmit: 0.02 },
}

/** Props slice a drapery opacity is read from (loose-typed to avoid coupling). */
export interface DraperyOpacityProps {
  lightBlock?: unknown
  /** Legacy: a `material: 'sheer'` weave (pre-CURTAIN-OPACITY) maps to `sheer`. */
  material?: unknown
}

/** Resolve a treatment's opacity level from its props, with a `room` default and
 *  back-compat for the legacy `material: 'sheer'` weave. */
export function draperyOpacityLevel(props: DraperyOpacityProps): DraperyOpacity {
  const lb = props.lightBlock
  if (typeof lb === 'string' && lb in DRAPERY_OPACITY) return lb as DraperyOpacity
  if (props.material === 'sheer') return 'sheer'
  return 'room'
}

/** Visual material opacity (0..1) for an opacity level — <1 renders translucent. */
export function draperyVisualOpacity(level: DraperyOpacity): number {
  return DRAPERY_OPACITY[level].visual
}

/** Daylight transmission floor (0..1) for an opacity level — the fraction of
 *  light still passing when the treatment fully covers the window. */
export function draperyTransmit(level: DraperyOpacity): number {
  return DRAPERY_OPACITY[level].transmit
}
