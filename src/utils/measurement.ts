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

/**
 * Format a length (metres) as a DRAWING dimension — the number a contractor
 * measures and builds from, which follows a different convention from the
 * friendly on-screen readout {@link formatLength} produces.
 *
 * Metric -> **integer millimetres, no unit suffix** (`2745`). This is the
 * near-universal convention on metric architectural/interior drawings: mm are
 * the trade's working unit (joinery and setting-out are specified to 1 mm), the
 * suffix is stated once in the title block instead of on every label, and
 * suffix-free integers are shorter -- which matters on a crowded running-
 * dimension row. `formatLength`'s `"2.75 m"` both loses 5 mm to rounding and
 * reads as a decimal no tape can resolve.
 *
 * Imperial -> feet + inches to the nearest **1/8 inch** (`8′ 6 1/2″`), matching
 * `formatLength`'s existing prime-glyph style. `formatLength` rounds imperial to
 * the nearest whole inch, a 25.4 mm quantisation far too coarse for a
 * construction reference.
 *
 * Callers: dimension lines, setting-out running dimensions and elevation
 * dimensions. Screen UI (inspector, tape measure, HUDs) deliberately keeps
 * `formatLength` -- "2.60 m" is the better reading there.
 */
export function formatDrawingLength(metres: number, units: UnitSystem = 'metric'): string {
  if (!Number.isFinite(metres)) return units === 'imperial' ? '0″' : '0'
  if (units === 'imperial') {
    const sign = metres < 0 ? '-' : ''
    // Work in eighths of an inch so the fraction is exact, then carry up.
    const eighths = Math.round(Math.abs(metres) / M_PER_FT / (1 / 12) / (1 / 8))
    let feet = Math.floor(eighths / 96)
    const remEighths = eighths - feet * 96
    let inches = Math.floor(remEighths / 8)
    const frac = remEighths - inches * 8
    if (inches === 12) {
      feet += 1
      inches = 0
    }
    // Reduce eighths to lowest terms (2/8 -> 1/4, 4/8 -> 1/2, 6/8 -> 3/4).
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const g = frac === 0 ? 1 : gcd(frac, 8)
    const fracText = frac === 0 ? '' : ` ${frac / g}/${8 / g}`
    if (feet === 0) return `${sign}${inches}${fracText}″`
    return `${sign}${feet}′ ${inches}${fracText}″`
  }
  return String(Math.round(metres * 1000))
}

/**
 * The title-block note that states a drawing's dimension unit once, so the
 * individual labels can stay suffix-free (see {@link formatDrawingLength}).
 */
export function drawingUnitsNote(units: UnitSystem = 'metric'): string {
  return units === 'imperial'
    ? 'ALL DIMENSIONS IN FEET AND INCHES'
    : 'ALL DIMENSIONS IN MILLIMETRES'
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

/** Human-readable byte size (B / KB / MB), e.g. "12 MB" / "840 KB". Shared by the
 *  remote-catalog cards and the model-info tooltip. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
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
