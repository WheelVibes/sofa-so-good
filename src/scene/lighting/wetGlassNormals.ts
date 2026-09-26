/**
 * WET-GLASS — paint a {@link Droplet} field into a **tangent-space normal map**.
 *
 * Pure (fills a caller-supplied buffer; no canvas, no three.js) so the encoding is unit-testable
 * without a GPU — the same split `backdropHorizon.ts` / `backdropEquirect.ts` already uses.
 *
 * ## Why a normal map and not a height map or a screen-space pass
 *
 * The pane on the `realistic` tier is already a `MeshPhysicalMaterial` running a transmission pass.
 * A `normalMap` on that material perturbs the **refracted** ray as well as the specular lobe, so
 * the view behind the glass genuinely bends inside each drop for the cost of one texture fetch —
 * no extra render target, no extra pass, no new pass ordering to get wrong. A screen-space
 * droplet-refraction pass would buy a slightly better drop (real inverted image inside the bead)
 * for a full-screen pass the phone tier could never afford and the desktop tier does not need,
 * because at showroom distance a 3 mm drop is a few pixels across.
 *
 * ## Encoding
 *
 * OpenGL convention (`+Y` up), which is what three.js expects: `rgb = normal * 0.5 + 0.5`, flat is
 * `(128, 128, 255)`. Row 0 of the buffer is the **top** of the tile, and the default `flipY` on a
 * `CanvasTexture` maps that row to `v = 1`, so a point below a drop's centre (larger row index)
 * must push the normal **down** — hence the green channel is negated against the row axis. Getting
 * that sign wrong does nothing to a symmetric bead and inverts every runnel, which is why it is
 * spelled out here rather than discovered in a frame.
 *
 * Drops are composited **by slope magnitude**, not painted in order: where two drops overlap the
 * steeper one wins. Last-writer-wins left visible rectangular seams where a wrap duplicate crossed
 * an existing drop.
 */
import type { Droplet } from './dropletField'

/** Flat tangent-space normal, encoded. */
const FLAT = [128, 128, 255] as const

/**
 * Fill `data` (RGBA, `w * h * 4`) with the normal map of `drops`.
 *
 * `strength` scales the in-plane slope before normalising — it is the authoring knob for how
 * pronounced the relief is, distinct from the material's own `normalScale`, which is the *runtime*
 * knob. Both exist because one is baked into bytes once and the other can ramp with wetness.
 */
export function paintDropletNormals(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  drops: readonly Droplet[],
  strength = 1,
): void {
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = FLAT[0]
    data[i * 4 + 1] = FLAT[1]
    data[i * 4 + 2] = FLAT[2]
    data[i * 4 + 3] = 255
  }
  // Slope magnitude already written at each texel, so an overlap can be resolved by steepness.
  const owned = new Float32Array(w * h)

  for (const d of drops) {
    const rx = d.r * w
    const ry = d.r * h
    const cx = d.cx * w
    const cy = d.cy * h
    const x0 = Math.max(0, Math.floor(cx - rx))
    const x1 = Math.min(w - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry))
    const y1 = Math.min(h - 1, Math.ceil(cy + ry))
    for (let y = y0; y <= y1; y++) {
      const v = (y + 0.5 - cy) / ry
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx) / rx
        const s = u * u + v * v
        if (s >= 1) continue
        // Spherical cap: the unit-sphere normal, flattened in-plane by `bulge` so the drop reads
        // as a shallow sessile cap rather than a bead of mercury.
        const k = d.bulge * strength
        const nx = u * k
        const ny = -v * k
        const nz = Math.sqrt(Math.max(1e-6, 1 - s))
        const len = Math.hypot(nx, ny, nz)
        const slope = Math.hypot(nx, ny) / len
        const p = y * w + x
        if (slope <= owned[p]) continue
        owned[p] = slope
        data[p * 4] = Math.round((nx / len) * 127.5 + 127.5)
        data[p * 4 + 1] = Math.round((ny / len) * 127.5 + 127.5)
        data[p * 4 + 2] = Math.round((nz / len) * 127.5 + 127.5)
      }
    }
  }
}
