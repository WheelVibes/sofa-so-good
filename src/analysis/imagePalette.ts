// Dominant-colour palette extraction (feature F28 core).
//
// Pure, dependency-free median-cut colour quantization operating on raw RGBA
// pixel data — no canvas/DOM, so it is fully unit-testable in node. A caller
// (browser-side) is responsible for turning an <img>/file into the
// `Uint8ClampedArray` of RGBA bytes that this module consumes.

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface PaletteColor extends Rgb {
  /** Lowercase `#rrggbb` hex string. */
  hex: string
  /** Fraction of sampled pixels belonging to this cluster, in 0..1. */
  weight: number
}

export interface ExtractPaletteOptions {
  /** Maximum number of palette colours to return (default 6). */
  count?: number
  /**
   * Sample every Nth opaque pixel. When omitted it is derived from the image
   * size to keep the working set at roughly <= 20k samples.
   */
  sampleStep?: number
}

const DEFAULT_COUNT = 6
const TARGET_SAMPLES = 20_000
const ALPHA_THRESHOLD = 128

/** Clamp to a valid 0..255 byte and round to an integer. */
const toByte = (n: number): number => {
  const r = Math.round(n)
  if (r < 0) return 0
  if (r > 255) return 255
  return r
}

const channelHex = (n: number): string => toByte(n).toString(16).padStart(2, '0')

/** Convert an RGB colour to a lowercase `#rrggbb` hex string. */
export const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`

/**
 * Relative luminance per WCAG (sRGB → linear → weighted sum), in 0..1.
 * Useful for sorting palette colours light↔dark or picking text contrast.
 */
export const relativeLuminance = (c: Rgb): number => {
  const linear = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
}

/**
 * Return the candidate nearest to `target` by Euclidean distance in RGB.
 * Returns `undefined` for an empty candidate list. Deterministic: the first
 * candidate wins ties.
 */
export const nearestColor = <T extends Rgb>(
  target: Rgb,
  candidates: readonly T[],
): T | undefined => {
  let best: T | undefined
  let bestDist = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    const dr = c.r - target.r
    const dg = c.g - target.g
    const db = c.b - target.b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

interface Box {
  /** Indices into the flat sample list this box owns. */
  pixels: number[]
}

type Channel = 0 | 1 | 2

interface ChannelRange {
  channel: Channel
  range: number
}

/** Find the channel (r/g/b) with the widest value spread within a box. */
const widestChannel = (box: Box, samples: Uint8ClampedArray): ChannelRange => {
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0
  for (const idx of box.pixels) {
    const o = idx * 3
    const r = samples[o]
    const g = samples[o + 1]
    const b = samples[o + 2]
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (g < gMin) gMin = g
    if (g > gMax) gMax = g
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  const rRange = rMax - rMin
  const gRange = gMax - gMin
  const bRange = bMax - bMin
  // Deterministic tie-break: prefer r, then g, then b.
  if (rRange >= gRange && rRange >= bRange) return { channel: 0, range: rRange }
  if (gRange >= bRange) return { channel: 1, range: gRange }
  return { channel: 2, range: bRange }
}

/**
 * Extract a dominant-colour palette from raw RGBA pixel data using median-cut.
 *
 * Pixels with alpha < 128 are skipped. The result is sorted by descending
 * weight, has length <= `count`, and contains no empty or duplicate clusters.
 * Empty / zero-size / fully-transparent input yields `[]`.
 */
export const extractPalette = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opts: ExtractPaletteOptions = {},
): PaletteColor[] => {
  const count = Math.max(1, Math.floor(opts.count ?? DEFAULT_COUNT))

  if (width <= 0 || height <= 0 || pixels.length < 4) return []

  const totalPixels = width * height
  // Derive a step that keeps the sample count near TARGET_SAMPLES unless the
  // caller pinned one explicitly.
  const derivedStep = Math.max(1, Math.floor(Math.sqrt(totalPixels / TARGET_SAMPLES)))
  const sampleStep = Math.max(1, Math.floor(opts.sampleStep ?? derivedStep))

  // Collect opaque samples into a flat r,g,b triplet array.
  const triplets: number[] = []
  for (let i = 0; i < totalPixels; i += sampleStep) {
    const o = i * 4
    if (o + 3 >= pixels.length) break
    if (pixels[o + 3] < ALPHA_THRESHOLD) continue
    triplets.push(pixels[o], pixels[o + 1], pixels[o + 2])
  }

  const sampleCount = triplets.length / 3
  if (sampleCount === 0) return []

  const samples = Uint8ClampedArray.from(triplets)

  // Seed a single box holding every sample index.
  const allIndices = new Array<number>(sampleCount)
  for (let i = 0; i < sampleCount; i++) allIndices[i] = i
  const boxes: Box[] = [{ pixels: allIndices }]

  // Median-cut: repeatedly split the box whose widest channel has the largest
  // range, until we reach `count` boxes or no box can be split further.
  while (boxes.length < count) {
    let target = -1
    let targetRange = -1
    let targetChannel: Channel = 0
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length < 2) continue
      const { channel, range } = widestChannel(boxes[i], samples)
      if (range > targetRange) {
        targetRange = range
        target = i
        targetChannel = channel
      }
    }
    // No splittable box (everything is a single point) or no colour spread.
    if (target === -1 || targetRange === 0) break

    const box = boxes[target]
    const ch = targetChannel
    const sorted = box.pixels.slice().sort((a, b) => samples[a * 3 + ch] - samples[b * 3 + ch])
    // Split at the widest gap between consecutive values along the channel: that
    // is the natural colour boundary, so solid regions stay intact instead of
    // being bisected at the population median (which cross-contaminates two
    // clusters when their populations differ). Fall back to the median when the
    // values form an unbroken ramp with no dominant gap.
    let cut = sorted.length >> 1
    let widestGap = -1
    for (let i = 1; i < sorted.length; i++) {
      const gap = samples[sorted[i] * 3 + ch] - samples[sorted[i - 1] * 3 + ch]
      if (gap > widestGap) {
        widestGap = gap
        cut = i
      }
    }
    const lower: Box = { pixels: sorted.slice(0, cut) }
    const upper: Box = { pixels: sorted.slice(cut) }
    boxes.splice(target, 1, lower, upper)
  }

  // Average each box into a representative colour; weight = population share.
  const palette: PaletteColor[] = []
  for (const box of boxes) {
    const n = box.pixels.length
    if (n === 0) continue
    let sr = 0
    let sg = 0
    let sb = 0
    for (const idx of box.pixels) {
      const o = idx * 3
      sr += samples[o]
      sg += samples[o + 1]
      sb += samples[o + 2]
    }
    const r = toByte(sr / n)
    const g = toByte(sg / n)
    const b = toByte(sb / n)
    palette.push({ r, g, b, hex: rgbToHex({ r, g, b }), weight: n / sampleCount })
  }

  // Merge clusters that collapsed onto identical representative colours so the
  // result has no duplicates (their weights add up).
  const byHex = new Map<string, PaletteColor>()
  for (const c of palette) {
    const existing = byHex.get(c.hex)
    if (existing) existing.weight += c.weight
    else byHex.set(c.hex, { ...c })
  }

  return [...byHex.values()].sort((a, b) => b.weight - a.weight)
}
