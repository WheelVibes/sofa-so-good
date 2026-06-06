/** Measurement unit system. Metric is the canonical/editing unit (Singapore
 *  HDB context); imperial is a display preference for international users. */
export type UnitSystem = 'metric' | 'imperial'

const M_PER_FT = 0.3048
const SQFT_PER_SQM = 10.7639

/** Format a length (metres) for display in the chosen unit system.
 *  Metric → "2.60 m". Imperial → feet + inches to the nearest inch
 *  ("8′ 6″"), carrying 12″ up to the next foot, sub-foot shown as inches. */
export function formatLength(metres: number, units: UnitSystem = 'metric'): string {
  if (!Number.isFinite(metres)) return units === 'imperial' ? '0″' : '0 m'
  if (units === 'imperial') {
    const sign = metres < 0 ? '-' : ''
    const totalInches = Math.abs(metres) / M_PER_FT / (1 / 12)
    let feet = Math.floor(totalInches / 12)
    let inches = Math.round(totalInches - feet * 12)
    if (inches === 12) {
      feet += 1
      inches = 0
    }
    if (feet === 0) return `${sign}${inches}″`
    return `${sign}${feet}′ ${inches}″`
  }
  return `${metres.toFixed(2)} m`
}

/** Format an area (square metres) in the chosen unit system.
 *  Metric → "12.2 m²" (1 dp). Imperial → "131 ft²" (whole sq ft). */
export function formatArea(squareMetres: number, units: UnitSystem = 'metric'): string {
  if (!Number.isFinite(squareMetres)) return units === 'imperial' ? '0 ft²' : '0 m²'
  if (units === 'imperial') return `${Math.round(squareMetres * SQFT_PER_SQM)} ft²`
  return `${squareMetres.toFixed(1)} m²`
}

/** Format a "width × depth" pair. Metric keeps a single trailing unit
 *  ("3.60 × 3.40 m"); imperial labels each dimension ("11′ 10″ × 11′ 2″"). */
export function formatDims(width: number, depth: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    return `${formatLength(width, 'imperial')} × ${formatLength(depth, 'imperial')}`
  }
  return `${width.toFixed(2)} × ${depth.toFixed(2)} m`
}

/** A length displayed as metres regardless of unit preference (back-compat). */
export function formatMeters(metres: number): string {
  return formatLength(metres, 'metric')
}

/** Compact small-object dimensions (furniture footprints): centimetres in
 *  metric ("60 × 45 cm"), whole inches in imperial ("24″ × 18″"). Keeps a
 *  single trailing unit for metric; labels each value for imperial. */
export function formatDimsShort(metres: number[], units: UnitSystem = 'metric'): string {
  const vals = metres.map((m) => (Number.isFinite(m) ? m : 0))
  if (units === 'imperial') {
    return vals.map((m) => `${Math.round(m / 0.0254)}″`).join(' × ')
  }
  return `${vals.map((m) => Math.round(m * 100)).join(' × ')} cm`
}

/** Room dimension + area summary: "3.60 × 3.40 m · 12.2 m²" (metric) or
 *  "11′ 10″ × 11′ 2″ · 132 ft²" (imperial). */
export function formatRoomSize(
  width: number,
  depth: number,
  area: number,
  units: UnitSystem = 'metric',
): string {
  return `${formatDims(width, depth, units)} · ${formatArea(area, units)}`
}
