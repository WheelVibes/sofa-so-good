/**
 * Does a texture have a lay direction? Measured from the PIXELS, not a list.
 *
 * The repetition break-up may only turn a cell 90° when doing so leaves the
 * material looking like itself. A hand-maintained list of "isotropic patterns"
 * answers that for today's catalog and silently rots the moment someone adds a
 * pattern, uploads a texture, or the ambientCG library grows — the new finish
 * gets whatever the default was, and a wood scan quietly turns into patchwork.
 *
 * So ask the image. Two independent signals, because "can I rotate this 90°?"
 * is really two questions:
 *
 *  1. **Is there a dominant direction?** The structure tensor of the image
 *     gradients — the standard orientation/coherence estimator. Planks, stripes,
 *     flutes and running-bond courses put most of their gradient energy on one
 *     axis (coherence → 1); terrazzo, concrete and carpet spread it evenly
 *     (coherence → 0).
 *  2. **Is the LATTICE square?** A hex grid has no dominant direction — its
 *     gradient energy is spread over three axes — yet a quarter turn still
 *     misaligns it. So compare the column profile against the row profile: a
 *     square grid gives two profiles of the same shape, a hex/staggered/
 *     rectangular one does not, and a random field is flat on both axes, with
 *     nothing to misalign.
 *
 * Pure: numbers in, numbers out — no canvas, no three, no React (the browser
 * adapter that hands it pixels is `analyzeTextureDirection.ts`). Textures tile,
 * so gradients and correlations wrap.
 */

/** Coherence above this counts as "has a direction" (planks, stripes, courses). */
export const COHERENCE_LIMIT = 0.25

/** A profile flatter than this (relative to the image's own contrast) carries
 *  no lattice — a random field, not a grid. */
const PROFILE_FLAT = 0.06

/** How far above the NOISE FLOOR a profile must sit to count as a lattice.
 *  Averaging `m` random pixels per bin already leaves a wobble of ~scale/√m, so
 *  a fixed threshold would read plain noise as a grid; a real grid line stands
 *  several times higher than that. */
const NOISE_MARGIN = 1.8

/** How alike the two axis profiles must look (best circular correlation) for
 *  the lattice to count as square, i.e. unchanged by a quarter turn. */
export const LATTICE_SIMILARITY = 0.6

export interface DirectionAnalysis {
  /** 0 = no dominant direction, 1 = perfectly directional. */
  coherence: number
  /** Dominant gradient orientation in radians (0 = features run along X). */
  angle: number
  /** How alike the column and row profiles are (best circular correlation),
   *  or null when at least one axis carries no lattice at all. */
  latticeSimilarity: number | null
  /** Is the lattice square — unchanged by a quarter turn? */
  latticeCompatible: boolean
  /** May the break-up turn a cell of this texture by 90°? */
  quarterTurnSafe: boolean
}

/** Luminance (0..1) from a tightly packed RGBA buffer. */
export function grayFromRgba(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    // Rec. 709 luma, in the same sRGB-encoded domain the pixels arrive in.
    out[i] = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255
  }
  return out
}

/**
 * Structure-tensor orientation: the dominant gradient direction and how
 * concentrated the gradient energy is on it. Gradients wrap (textures tile), so
 * a seamless pattern is not judged by its edges.
 */
export function structureCoherence(
  gray: Float32Array,
  w: number,
  h: number,
): { coherence: number; angle: number } {
  let jxx = 0
  let jyy = 0
  let jxy = 0
  for (let y = 0; y < h; y++) {
    const yUp = ((y - 1 + h) % h) * w
    const yDn = ((y + 1) % h) * w
    const row = y * w
    for (let x = 0; x < w; x++) {
      const gx = gray[row + ((x + 1) % w)] - gray[row + ((x - 1 + w) % w)]
      const gy = gray[yDn + x] - gray[yUp + x]
      jxx += gx * gx
      jyy += gy * gy
      jxy += gx * gy
    }
  }
  const trace = jxx + jyy
  if (trace < 1e-9) return { coherence: 0, angle: 0 }
  // Eigenvalue spread of the 2×2 tensor, normalised: (λ1−λ2)/(λ1+λ2).
  const diff = Math.hypot(jxx - jyy, 2 * jxy)
  return { coherence: diff / trace, angle: 0.5 * Math.atan2(2 * jxy, jxx - jyy) }
}

/** Mean value per column (axis 'x') or per row (axis 'y'). */
export function axisProfile(
  gray: Float32Array,
  w: number,
  h: number,
  axis: 'x' | 'y',
): Float32Array {
  const n = axis === 'x' ? w : h
  const m = axis === 'x' ? h : w
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < m; j++) sum += axis === 'x' ? gray[j * w + i] : gray[i * w + j]
    out[i] = sum / m
  }
  return out
}

/** Mean-centred copy of a profile plus its magnitude — the pieces a normalised
 *  correlation needs. `null` when the profile is too flat to carry a lattice
 *  (a random field: nothing on this axis for a rotation to misalign). */
function centred(
  profile: Float32Array,
  scale: number,
  samplesPerBin: number,
): { v: Float32Array; norm: number } | null {
  const n = profile.length
  let mean = 0
  for (const p of profile) mean += p
  mean /= n
  const v = new Float32Array(n)
  let sq = 0
  for (let i = 0; i < n; i++) {
    v[i] = profile[i] - mean
    sq += v[i] * v[i]
  }
  const std = Math.sqrt(sq / n)
  const floor = Math.max(PROFILE_FLAT, NOISE_MARGIN / Math.sqrt(Math.max(1, samplesPerBin)))
  if (scale <= 1e-6 || std / scale < floor) return null
  return { v, norm: Math.sqrt(sq) }
}

/**
 * Is this texture's lattice square — would a quarter turn land its grid lines
 * back where they were?
 *
 * Comparing the column profile with the row profile answers that directly, and
 * far more robustly than trying to pin a repeat length on each axis (a 64 px
 * read of a real, noisy scan produces spurious short-lag peaks). A square
 * ceramic grid gives two profiles of the same shape; a hex or staggered lattice
 * does not; a plank floor has a lattice on one axis and none on the other; a
 * random aggregate has neither, and there is nothing to misalign.
 *
 * The comparison is over all circular shifts, since the two axes' grid phases
 * need not agree. Returns the best correlation, or `null` when at least one
 * axis is flat (see `latticeCompatible` for the verdict that folds that in).
 */
export function axisProfileSimilarity(
  profileX: Float32Array,
  profileY: Float32Array,
  scale: number,
  samplesPerBin: number,
): { similarity: number | null; compatible: boolean } {
  const a = centred(profileX, scale, samplesPerBin)
  const b = centred(profileY, scale, samplesPerBin)
  // Both flat → a random field, no lattice at all → any rotation is fine.
  if (!a && !b) return { similarity: null, compatible: true }
  // One flat, one not → stripes / courses: a quarter turn would stand them up.
  if (!a || !b) return { similarity: null, compatible: false }
  const n = Math.min(a.v.length, b.v.length)
  let best = -1
  for (let shift = 0; shift < n; shift++) {
    let dot = 0
    for (let i = 0; i < n; i++) dot += a.v[i] * b.v[(i + shift) % n]
    best = Math.max(best, dot / (a.norm * b.norm))
  }
  return { similarity: best, compatible: best >= LATTICE_SIMILARITY }
}

/**
 * Full analysis for one texture. `quarterTurnSafe` is the answer the break-up
 * wants: no dominant direction AND a square (or absent) lattice.
 */
export function analyzeDirection(gray: Float32Array, w: number, h: number): DirectionAnalysis {
  const { coherence, angle } = structureCoherence(gray, w, h)
  let mean = 0
  for (const v of gray) mean += v
  mean /= gray.length
  let variance = 0
  for (const v of gray) variance += (v - mean) ** 2
  const scale = Math.sqrt(variance / gray.length)
  const { similarity, compatible } = axisProfileSimilarity(
    axisProfile(gray, w, h, 'x'),
    axisProfile(gray, w, h, 'y'),
    scale,
    // Each column bin averages `h` pixels, each row bin `w` — equal for the
    // square samples this runs on; take the smaller to stay conservative.
    Math.min(w, h),
  )
  return {
    coherence,
    angle,
    latticeSimilarity: similarity,
    latticeCompatible: compatible,
    quarterTurnSafe: coherence < COHERENCE_LIMIT && compatible,
  }
}
