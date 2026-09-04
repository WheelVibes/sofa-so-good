/**
 * Resample an equirectangular image into six cube faces.
 *
 * **Why this exists.** `(r)` BACKDROP-LOWPASS: three converts an equirect `scene.background` into a
 * **CubeUV/PMREM**, which is pre-filtered by construction, so a crisp 2048x1024 skyline arrives at
 * the window as faint blobs. `v0.31.5.265` proved the content survives to the GPU intact — rehosting
 * the same canvas with `UVMapping` shows a legible skyline — so the loss is entirely the pre-filter.
 * `UVMapping` is not a shippable fix (a flat screen background has no parallax and is not
 * projectively correct through a window); a **cube texture** is the candidate that keeps
 * `scene.background`'s structure, and this is what lets that be tested on the existing assets rather
 * than after re-authoring four presets.
 *
 * Face order is three's: `+X, -X, +Y, -Y, +Z, -Z`.
 *
 * **Direction convention matches `equirectDir` in `skyGradient.ts`** — `+X` east, `+Y` up, `+Z`
 * south, `u = 0` at `-Z` wrapping east. Getting this wrong yields a backdrop that is sharp and
 * pointing the wrong way, which reads as "the fix worked" from a numeric probe and as nonsense from
 * the window.
 */

/** A minimal 2D pixel source: what `getImageData` returns. */
export interface Rgba {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Direction (unit) for a pixel on cube face `face` at normalised face coords `s, t` in `[0, 1)`.
 *
 * `s` runs left→right and `t` top→bottom of the face image, which is how canvas rows are laid out.
 */
export function cubeFaceDir(face: number, s: number, t: number): [number, number, number] {
  // Face-local coordinates in [-1, 1], y flipped because `t` grows downward.
  const a = 2 * s - 1
  const b = 1 - 2 * t
  switch (face) {
    case 0:
      return norm(1, b, -a) // +X
    case 1:
      return norm(-1, b, a) // -X
    case 2:
      return norm(a, 1, -b) // +Y
    case 3:
      return norm(a, -1, b) // -Y
    case 4:
      return norm(a, b, 1) // +Z
    default:
      return norm(-a, b, -1) // -Z
  }
}

function norm(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

/**
 * Equirect pixel coordinates for a direction, matching `skyGradient.ts:equirectDir`'s inverse.
 *
 * Returned as floats so a caller can choose its own filtering; the sampler below uses bilinear,
 * because nearest-sampling a 2048-wide source into a 512 face is what would actually alias.
 */
export function dirToEquirectUv(d: readonly [number, number, number]): [number, number] {
  const u = (Math.atan2(d[0], -d[2]) / (2 * Math.PI) + 0.5) % 1
  const v = Math.acos(Math.max(-1, Math.min(1, d[1]))) / Math.PI
  return [u, v]
}

/** Bilinear sample, wrapping in u and clamping in v. */
function sample(src: Rgba, u: number, v: number, out: number[]): void {
  const x = u * src.width - 0.5
  const y = v * src.height - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const wrap = (i: number) => ((i % src.width) + src.width) % src.width
  const clamp = (i: number) => Math.max(0, Math.min(src.height - 1, i))
  for (let c = 0; c < 4; c += 1) {
    const p = (xi: number, yi: number) => src.data[(clamp(yi) * src.width + wrap(xi)) * 4 + c] ?? 0
    const top = p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx
    const bot = p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx
    out[c] = top * (1 - fy) + bot * fy
  }
}

/**
 * Resample `src` into six `size x size` RGBA faces.
 *
 * `size` should be about `src.width / 4` to preserve detail without inventing it: a 2048-wide
 * equirect spans 360 degrees, a cube face spans 90, so 512 is the matched resolution.
 */
export function equirectToCubeFaces(src: Rgba, size: number): Rgba[] {
  const faces: Rgba[] = []
  const px: number[] = [0, 0, 0, 0]
  for (let face = 0; face < 6; face += 1) {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const [u, v] = dirToEquirectUv(cubeFaceDir(face, (x + 0.5) / size, (y + 0.5) / size))
        sample(src, u, v, px)
        const o = (y * size + x) * 4
        data[o] = px[0]!
        data[o + 1] = px[1]!
        data[o + 2] = px[2]!
        data[o + 3] = px[3]!
      }
    }
    faces.push({ width: size, height: size, data })
  }
  return faces
}
