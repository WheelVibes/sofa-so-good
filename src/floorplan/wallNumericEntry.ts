/**
 * Pure geometry helpers for numeric wall-length/angle entry while drawing.
 *
 * Angle convention: 0° = +X (right), 90° = +Z (down), counter-clockwise
 * positive — matching `Math.atan2(dz, dx) * 180 / Math.PI`. This aligns with
 * the SVG coordinate system where Y (Z in world space) increases downward.
 *
 * All maths is render-agnostic (no three/React imports).
 */

/** The endpoint given a start point, a length (metres), and an angle (degrees). */
export function endpointFromLengthAngle(
  start: [number, number],
  lengthM: number,
  angleDeg: number,
): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [start[0] + Math.cos(rad) * lengthM, start[1] + Math.sin(rad) * lengthM]
}

/** Compute the length (metres) and angle (degrees, 0–360) of a wall segment. */
export function segmentLengthAngle(
  start: [number, number],
  end: [number, number],
): { length: number; angle: number } {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.hypot(dx, dz)
  let angle = (Math.atan2(dz, dx) * 180) / Math.PI
  if (angle < 0) angle += 360
  return { length, angle }
}

/** Parse a user-supplied length string to metres.
 *
 * Accepts:
 *   - Metric: "3.5", "3.5m", "3.5 m", "350cm", "350 cm"
 *   - Imperial: "3'6\"", "3' 6\"", "3ft 6in", "42\"", "42in", "3.5'"
 *
 * Returns `null` for empty/non-numeric input (ignore, keep dragging).
 * Returns `NaN` for recognisably invalid input (e.g. negative, zero, absurd).
 */
export function parseLengthInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null

  // Feet-and-inches patterns: 3'6", 3' 6", 3'6, 3ft 6in, etc.
  const feetInches = s.match(
    /^(-?)(\d+(?:\.\d+)?)\s*(?:ft|'|′)\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"|″)?)?$/i,
  )
  if (feetInches) {
    const neg = feetInches[1] === '-'
    const ft = parseFloat(feetInches[2])
    const inches = feetInches[3] ? parseFloat(feetInches[3]) : 0
    const metres = (ft + inches / 12) * 0.3048
    return neg ? -metres : metres
  }

  // Inches-only: 42", 42in
  const inchesOnly = s.match(/^(-?)(\d+(?:\.\d+)?)\s*(?:in|"|″)$/i)
  if (inchesOnly) {
    const neg = inchesOnly[1] === '-'
    const metres = parseFloat(inchesOnly[2]) * 0.0254
    return neg ? -metres : metres
  }

  // Centimetres: 350cm, 350 cm
  const cm = s.match(/^(-?)(\d+(?:\.\d+)?)\s*cm$/i)
  if (cm) {
    const neg = cm[1] === '-'
    return neg ? -parseFloat(cm[2]) / 100 : parseFloat(cm[2]) / 100
  }

  // Metres (plain number, or with "m")
  const metres = s.match(/^(-?)(\d+(?:\.\d+)?)\s*m?$/i)
  if (metres) {
    const neg = metres[1] === '-'
    return neg ? -parseFloat(metres[2]) : parseFloat(metres[2])
  }

  // Unrecognisable
  return NaN
}

/** Parse an angle string to degrees (0–360).
 * Accepts plain number (e.g. "90", "45.5"); empty → null; invalid → NaN. */
export function parseAngleInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  // Anchored so trailing garbage is rejected (NaN) rather than silently parsed,
  // e.g. "90xyz"/"45 deg!"/"90o" — matching parseLengthInput's strictness (BUG-010).
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN
  const n = parseFloat(s)
  if (Number.isNaN(n)) return NaN
  // Normalise to [0, 360)
  return ((n % 360) + 360) % 360
}

/** Validation: is `metres` a plausible wall length?
 * Returns `null` when valid; an error string when not. */
export function validateLength(metres: number | null): string | null {
  if (metres === null) return null // empty input — fine
  if (!Number.isFinite(metres) || Number.isNaN(metres)) return 'Invalid length'
  if (metres <= 0) return 'Length must be greater than 0'
  if (metres > 500) return 'Length seems too large (max 500 m)'
  return null
}

/** Validation: is `deg` a plausible angle? */
export function validateAngle(deg: number | null): string | null {
  if (deg === null) return null
  if (!Number.isFinite(deg) || Number.isNaN(deg)) return 'Invalid angle'
  return null
}
