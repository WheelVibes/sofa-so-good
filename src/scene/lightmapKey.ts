/**
 * A stable identity for a baked lightmap — keyed by GEOMETRY IN PLACE, not by mesh name.
 *
 * **The problem this solves.** A baked aperture-visibility map (item (w)) is produced offline
 * by Blender from an exported GLB, where meshes are called `Mesh_116` — an index assigned by
 * the exporter. The live scene has no such names, and they would change the moment anything
 * upstream reorders. So a map keyed by name cannot be looked up at runtime, and a pipeline
 * built on those names would break silently on an unrelated change.
 *
 * **Why the key must include world placement.** Two identical wall boxes in different rooms
 * have *completely different* aperture visibility — one may face a window while the other sits
 * in an interior corridor. That is the entire quantity being baked. So local geometry alone is
 * not an identity here; the key hashes **world-space** vertex positions.
 *
 * **Why the digest is hand-rolled.** The Python twin
 * (`python/scripts/blender/bake_material.py:geometry_key`) must agree byte for byte, and
 * Blender's bundled Python and the browser share no hash implementation whose output is
 * guaranteed identical. FNV-1a is four lines in both languages and its result is fully
 * specified by the spec, so agreement is verifiable rather than hoped for —
 * `lightmapKey.test.ts` holds them to a Blender-generated fixture.
 *
 * The canonical form is deliberately boring: millimetre-rounded coordinates, fixed to three
 * decimals, negative zero normalised away, **sorted** so vertex order cannot matter, joined by
 * `;`. Every one of those choices exists because a floating-point or ordering difference between
 * the two toolchains would otherwise produce two keys for one wall.
 */

/** Rounding quantum for a coordinate, in metres. A millimetre is far finer than any
 *  difference that could matter to a room-scale visibility term, and coarse enough that
 *  float noise between two toolchains cannot cross it. */
const QUANTUM_DECIMALS = 3

/** Fixed-width, millimetre-rounded, with `-0.000` normalised to `0.000`. */
function canonical(value: number): string {
  const rounded = Number(value.toFixed(QUANTUM_DECIMALS))
  // `-0` formats as `-0.000` and would not match Python's, which normalises the same way.
  const safe = rounded === 0 ? 0 : rounded
  return safe.toFixed(QUANTUM_DECIMALS)
}

/** FNV-1a, 32-bit, as specified. Kept explicit so the Python twin can match it exactly. */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    // `Math.imul` because the spec's multiply is 32-bit and `*` would lose precision above 2^53.
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Key one mesh by its world-space vertices.
 *
 * `positions` are flat `xyz` triples already in world space — the caller applies the object's
 * matrix, since only it knows whether the matrix is current.
 */
export function lightmapKey(positions: ArrayLike<number>): string {
  const count = Math.floor(positions.length / 3)
  const triples: string[] = new Array(count)
  for (let v = 0; v < count; v += 1) {
    triples[v] =
      `${canonical(positions[v * 3])},` +
      `${canonical(positions[v * 3 + 1])},` +
      `${canonical(positions[v * 3 + 2])}`
  }
  triples.sort()
  return fnv1a32(triples.join(';'))
}
