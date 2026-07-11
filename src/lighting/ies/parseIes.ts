/**
 * IESNA LM-63 (1986 / 1991 / 1995 / 2002) ASCII photometric-file parser.
 *
 * Pure + render-agnostic: parses a `.ies` luminaire file into a structured
 * {@link IesProfile} (header keywords, the 10-value photometric params, the
 * vertical + horizontal angle arrays, and the candela grid). No three.js / DOM
 * dependency — see `iesProfile.ts` for derived beam metrics and `spotMapping.ts`
 * for the SpotLight mapping.
 *
 * What's handled:
 *  - Optional `IESNA…` magic first line (LM-63-1991/1995/2002) — also tolerant of
 *    a 1986 file with no magic line at all.
 *  - `[KEYWORD] value` header lines (collected into {@link IesProfile.keywords}).
 *  - The `TILT=` line (`NONE`, `INCLUDE`, or `<filename>`); an inline `TILT=INCLUDE`
 *    block (its own lamp-geometry + angle/multiplier pairs) is read and skipped.
 *  - The 10 photometric parameters and the 3 ballast/units line values, robust to
 *    arbitrary whitespace/newline wrapping (LM-63 is free-form token stream after
 *    the TILT line).
 *  - The vertical + horizontal angle arrays and the row-major candela grid
 *    (`numHoriz` rows of `numVert` values).
 *  - The candela multiplier applied to every value so callers read true candela.
 *
 * Malformed input throws an {@link IesParseError} with a clear message rather
 * than crashing or returning a half-built object.
 */

/** Photometry goniometer type (LM-63 field). */
type PhotometricType = 'C' | 'B' | 'A'

/** Luminous-opening units (LM-63 field): feet or metres. */
type IesUnits = 'feet' | 'meters'

export interface IesProfile {
  /** `[KEYWORD] → value` header map (e.g. `MANUFAC`, `LUMCAT`, `TEST`). */
  keywords: Record<string, string>
  /** Number of lamps. */
  lampCount: number
  /** Rated lumens per lamp (or −1 for absolute photometry). */
  lumensPerLamp: number
  /** Candela multiplier already applied to {@link candela}; kept for reference. */
  candelaMultiplier: number
  /** Vertical angles in degrees (ascending), length = numVert. */
  verticalAngles: number[]
  /** Horizontal angles in degrees (ascending), length = numHoriz. */
  horizontalAngles: number[]
  /** Photometry type — C is the common downlight goniometer. */
  photometricType: PhotometricType
  /** Luminous-opening units. */
  units: IesUnits
  /** Luminous-opening width / length / height (in {@link units}). */
  width: number
  length: number
  height: number
  /** Ballast factor (multiplies the lamp output). */
  ballastFactor: number
  /** Rated input watts (informational). */
  inputWatts: number
  /**
   * Candela grid, **multiplier already applied**, indexed `[horizIndex][vertIndex]`
   * so `candela[h][v]` is the intensity at `horizontalAngles[h]`,
   * `verticalAngles[v]`. For a single horizontal plane there is one row.
   */
  candela: number[][]
}

/** Thrown for any malformed / unreadable IES input. */
export class IesParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IesParseError'
  }
}

/** Strip the optional inline TILT=INCLUDE block, returning the remaining tokens.
 *  The block is: 1 value (lamp-to-luminaire geometry), 1 value (# of angle pairs
 *  `n`), then `n` angles and `n` multipliers. */
function consumeTiltBlock(tokens: string[]): string[] {
  // tokens[0] = lamp-to-luminaire geom flag; tokens[1] = number of pairs.
  const numPairs = Number.parseInt(tokens[1] ?? '', 10)
  if (!Number.isFinite(numPairs) || numPairs < 0) {
    throw new IesParseError('TILT=INCLUDE block: invalid number of angle/multiplier pairs')
  }
  const consumed = 2 + numPairs * 2
  if (tokens.length < consumed) {
    throw new IesParseError('TILT=INCLUDE block is truncated')
  }
  return tokens.slice(consumed)
}

function nextNumber(tokens: string[], i: number, what: string): number {
  const raw = tokens[i]
  if (raw === undefined) {
    throw new IesParseError(`Unexpected end of file while reading ${what}`)
  }
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) {
    throw new IesParseError(`Expected a number for ${what} but got "${raw}"`)
  }
  return n
}

/**
 * Parse an IESNA LM-63 ASCII string into an {@link IesProfile}.
 * @throws {IesParseError} on empty or malformed input.
 */
export function parseIes(text: string): IesProfile {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new IesParseError('Empty IES file')
  }
  // Normalise line endings; LM-63 is line-oriented only down to the TILT line.
  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  const keywords: Record<string, string> = {}
  let idx = 0

  // Optional magic line (IESNA:LM-63-1995 / IESNA91 / IESNA:LM-63-2002 / …).
  if (lines[0]?.trimStart().toUpperCase().startsWith('IESNA')) {
    idx = 1
  }

  // Header keyword block until the TILT= line. Keywords look like `[KEY] value`.
  let tiltLine: string | null = null
  for (; idx < lines.length; idx++) {
    const line = lines[idx]
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.toUpperCase().startsWith('TILT=')) {
      tiltLine = trimmed
      idx++
      break
    }
    const kw = trimmed.match(/^\[([^\]]*)\]\s*(.*)$/)
    if (kw) {
      const key = kw[1].trim().toUpperCase()
      keywords[key] = key in keywords ? `${keywords[key]} ${kw[2].trim()}` : kw[2].trim()
    }
    // Non-keyword, non-TILT lines before TILT= are tolerated (some legacy files
    // wrap free comment text); they're ignored.
  }

  if (tiltLine === null) {
    throw new IesParseError('Missing TILT= line (not a valid LM-63 file)')
  }

  // Everything after the TILT line is a free-form whitespace/newline token stream.
  let tokens = lines
    .slice(idx)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')

  // An inline TILT=INCLUDE block precedes the photometric data.
  const tiltMode = tiltLine.slice('TILT='.length).trim().toUpperCase()
  if (tiltMode === 'INCLUDE') {
    tokens = consumeTiltBlock(tokens)
  }
  // TILT=NONE and TILT=<filename> carry no inline block here.

  let t = 0
  const lampCount = Math.round(nextNumber(tokens, t++, 'lamp count'))
  const lumensPerLamp = nextNumber(tokens, t++, 'lumens per lamp')
  const candelaMultiplier = nextNumber(tokens, t++, 'candela multiplier')
  const numVert = Math.round(nextNumber(tokens, t++, 'number of vertical angles'))
  const numHoriz = Math.round(nextNumber(tokens, t++, 'number of horizontal angles'))
  const photTypeRaw = Math.round(nextNumber(tokens, t++, 'photometric type'))
  const unitsRaw = Math.round(nextNumber(tokens, t++, 'units type'))
  const width = nextNumber(tokens, t++, 'luminous opening width')
  const length = nextNumber(tokens, t++, 'luminous opening length')
  const heightVal = nextNumber(tokens, t++, 'luminous opening height')
  const ballastFactor = nextNumber(tokens, t++, 'ballast factor')
  // Field 12 is "future use" / ballast-lamp factor — read and ignore.
  t++
  const inputWatts = nextNumber(tokens, t++, 'input watts')

  if (numVert <= 0 || numHoriz <= 0) {
    throw new IesParseError(`Invalid angle counts (vertical=${numVert}, horizontal=${numHoriz})`)
  }

  const photometricType: PhotometricType = photTypeRaw === 2 ? 'B' : photTypeRaw === 3 ? 'A' : 'C'
  const units: IesUnits = unitsRaw === 1 ? 'feet' : 'meters'

  const verticalAngles: number[] = []
  for (let i = 0; i < numVert; i++) {
    verticalAngles.push(nextNumber(tokens, t++, `vertical angle #${i + 1}`))
  }
  const horizontalAngles: number[] = []
  for (let i = 0; i < numHoriz; i++) {
    horizontalAngles.push(nextNumber(tokens, t++, `horizontal angle #${i + 1}`))
  }

  const mult = candelaMultiplier === 0 ? 1 : candelaMultiplier
  const candela: number[][] = []
  for (let h = 0; h < numHoriz; h++) {
    const row: number[] = []
    for (let v = 0; v < numVert; v++) {
      row.push(nextNumber(tokens, t++, `candela value [h${h + 1}, v${v + 1}]`) * mult)
    }
    candela.push(row)
  }

  return {
    keywords,
    lampCount,
    lumensPerLamp,
    candelaMultiplier: mult,
    verticalAngles,
    horizontalAngles,
    photometricType,
    units,
    width,
    length,
    height: heightVal,
    ballastFactor,
    inputWatts,
    candela,
  }
}
