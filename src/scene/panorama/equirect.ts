/**
 * Equirectangular (360°) panorama assembly from six 90° cube faces.
 *
 * Pure math + CPU resampling, deliberately NOT a cubemap shader: each face is
 * captured through the app's normal screen render path (so tone mapping,
 * exposure and colour space match the on-screen look exactly — renders to
 * offscreen targets in three skip tone mapping), then the equirect image is
 * assembled here by bilinear-sampling those faces per output pixel.
 *
 * Conventions (right-handed, three.js world):
 *  - longitude λ ∈ [-π, π): u = (λ + π) / 2π; u = 0.5 looks down -Z (the
 *    camera's default forward).
 *  - latitude φ ∈ [-π/2, π/2]: row 0 (v = 0) is the zenith (φ = +π/2).
 *  - direction(λ, φ) = (cosφ·sinλ, sinφ, -cosφ·cosλ).
 */

export type FaceName = 'front' | 'back' | 'left' | 'right' | 'up' | 'down'

export interface FaceBasis {
  name: FaceName
  /** Unit forward (view direction) of the face camera. */
  forward: [number, number, number]
  /** Unit screen-right of the face camera. */
  right: [number, number, number]
  /** Unit screen-up of the face camera. */
  up: [number, number, number]
}

/** The six face cameras. ±Y use explicit ups (lookAt is degenerate there). */
export const FACES: FaceBasis[] = [
  { name: 'front', forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] },
  { name: 'back', forward: [0, 0, 1], right: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'left', forward: [-1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  { name: 'right', forward: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { name: 'up', forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { name: 'down', forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
]

/** World direction for an equirect pixel centre (u, v ∈ [0, 1]). */
export function dirFromEquirect(u: number, v: number): [number, number, number] {
  const lon = u * 2 * Math.PI - Math.PI
  const lat = Math.PI / 2 - v * Math.PI
  const cl = Math.cos(lat)
  return [cl * Math.sin(lon), Math.sin(lat), -cl * Math.cos(lon)]
}

export interface FaceSample {
  face: FaceName
  /** Face-local pixel coords in [0, 1] (u right, v down). */
  u: number
  v: number
}

const dot = (a: [number, number, number], b: [number, number, number]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Which face a world direction lands on, and where on it (90° fov faces). */
export function sampleForDir(dir: [number, number, number]): FaceSample {
  let best: FaceBasis = FACES[0]
  let bestD = Number.NEGATIVE_INFINITY
  for (const f of FACES) {
    const d = dot(dir, f.forward)
    if (d > bestD) {
      bestD = d
      best = f
    }
  }
  // Perspective projection onto the face plane at distance 1.
  const x = dot(dir, best.right) / bestD
  const y = dot(dir, best.up) / bestD
  return { face: best.name, u: (x + 1) / 2, v: (1 - y) / 2 }
}

/** Minimal ImageData shape so the assembler is testable without a DOM.
 *  The buffer is pinned to ArrayBuffer so outputs satisfy DOM `ImageData`. */
export interface PixelGrid {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/**
 * Assemble the equirect image (width × width/2) from six equally-sized square
 * faces. Bilinear sampling, edge-clamped — face borders meet exactly because
 * adjacent faces share their boundary rays. Returns the output grid (caller
 * wraps it in a real ImageData / canvas).
 */
export function assembleEquirect(faces: Record<FaceName, PixelGrid>, outWidth: number): PixelGrid {
  const W = Math.max(8, Math.floor(outWidth))
  const H = Math.floor(W / 2)
  const out = new Uint8ClampedArray(W * H * 4)
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / H
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W
      const s = sampleForDir(dirFromEquirect(u, v))
      const grid = faces[s.face]
      const fx = Math.min(Math.max(s.u * grid.width - 0.5, 0), grid.width - 1)
      const fy = Math.min(Math.max(s.v * grid.height - 0.5, 0), grid.height - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, grid.width - 1)
      const y1 = Math.min(y0 + 1, grid.height - 1)
      const tx = fx - x0
      const ty = fy - y0
      const o = (py * W + px) * 4
      for (let c = 0; c < 4; c++) {
        const p00 = grid.data[(y0 * grid.width + x0) * 4 + c]
        const p10 = grid.data[(y0 * grid.width + x1) * 4 + c]
        const p01 = grid.data[(y1 * grid.width + x0) * 4 + c]
        const p11 = grid.data[(y1 * grid.width + x1) * 4 + c]
        out[o + c] =
          p00 * (1 - tx) * (1 - ty) + p10 * tx * (1 - ty) + p01 * (1 - tx) * ty + p11 * tx * ty
      }
    }
  }
  return { data: out, width: W, height: H }
}
