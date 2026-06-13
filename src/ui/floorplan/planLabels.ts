/**
 * 2D-plan furniture label mode (Sweet Home 3D parity, PARITY-PLANLABELS): show
 * each placed item's name — and optionally its estimated price — on the plan so
 * a layout reads at a glance without selecting every footprint. Pure helpers so
 * the label text + toggle cycle are unit-testable independent of the SVG.
 */
export type PlanLabelMode = 'off' | 'name' | 'price'

/** The toolbar cycle order. */
export const PLAN_LABEL_CYCLE: PlanLabelMode[] = ['off', 'name', 'price']

/** Short human label for the toolbar button. */
export const PLAN_LABEL_TEXT: Record<PlanLabelMode, string> = {
  off: 'Labels: off',
  name: 'Labels: name',
  price: 'Labels: + price',
}

/** Next mode in the cycle (off → name → price → off). */
export function nextPlanLabelMode(mode: PlanLabelMode): PlanLabelMode {
  return PLAN_LABEL_CYCLE[(PLAN_LABEL_CYCLE.indexOf(mode) + 1) % PLAN_LABEL_CYCLE.length]
}

const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

/**
 * Label lines for one footprint given the active mode: `[]` when off / no name,
 * `[name]` for `name`, and `[name, "$1,234"]` for `price` (the price line is
 * dropped when there's no positive price so a free/unpriced item shows just its
 * name).
 */
export function planLabelLines(
  name: string | undefined,
  price: number | undefined,
  mode: PlanLabelMode,
): string[] {
  if (mode === 'off' || !name) return []
  const lines = [name]
  if (mode === 'price' && typeof price === 'number' && price > 0) lines.push(sgd(price))
  return lines
}
