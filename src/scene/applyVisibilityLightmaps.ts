/**
 * Attach baked aperture-visibility maps to the meshes of a live scene — item (w)'s wiring.
 *
 * Pulls together the four pure modules: `lightmapIndex` (which maps exist), `lightmapKey` (what
 * a live mesh is called in that set), `lightmapUv` (the `uv1` the maps were baked in), and
 * `visibilityLightmap` (the shader patch and its gain).
 *
 * **Attach cost, stated because it constrains the caller.** Adding an `aoMap` compiles a new
 * shader variant per material — ~19 across a plan — and doing it mid-session cost a **216 ms**
 * frame (`v0.31.7.15`). Steady-state cost is nil: 60 fps unchanged at `performance` and `medium`
 * with 331 distinct maps attached. So call this **once, while the scene is still loading**, and
 * never in response to a live toggle.
 *
 * Every failure path degrades to today's render rather than throwing. A missing asset, a stale
 * index, an unbaked plan — all of them must leave a working scene, because the alternative is
 * trading a fidelity improvement for a blank canvas.
 */
import type { BufferGeometry, Mesh, Object3D, Texture } from 'three'
import { BufferAttribute } from 'three'
import { createLightmapResolver, type LightmapIndex } from './lightmapIndex'
import { lightmapKey } from './lightmapKey'
import { computeBoxAtlasUv } from './lightmapUv'
import { applyVisibilityLightmap, gainForPlanMean } from './visibilityLightmap'

/** Where the baked set lives, base-path aware so it survives a non-root deployment.
 *  Not exported: it is the default for `baseUrl` below, and an export nothing imports fails
 *  `npm run deadcode`. */
const LIGHTMAP_BASE = `${import.meta.env.BASE_URL}assets/lightmaps`

export interface ApplyOptions {
  baseUrl?: string
  expectCoverage?: boolean
  /** Override the fitted `VISIBILITY_GAIN`. Diagnostic only — see `VisibilityLightmaps`. */
  gain?: number
  /** DEV visualiser: paint the sampled occlusion value instead of shading. */
  debug?: boolean
}

export interface ApplyResult {
  /** Meshes considered — large enough, and carrying a material with an `aoMap` slot. */
  candidates: number
  /** Meshes that matched a baked key and now carry a map. */
  applied: number
  /**
   * Which baked plan was chosen, or `null` if none matched or the evidence tied.
   *
   * Reported because it is the field that distinguishes the three states a caller cares about:
   * maps applied from plan X, no plan recognised (normal for an unbaked layout), and *ambiguous*
   * — and the last two are indistinguishable from `applied: 0` alone.
   */
  context: string | null
  /** Human-readable hit-rate line, and whether it looks wrong. */
  report: string
  suspect: boolean
}

/**
 * Only shell-sized meshes are baked (`bake_material.py --min-area 3.0`), so keying every teacup
 * would spend a hash per mesh to learn nothing. 1.5 m is deliberately below the bake's threshold
 * — a mesh just over 3 m² can be under 1.5 m in its longest axis — so the filter never excludes
 * something the set actually has.
 */
const MIN_SPAN_M = 1.5

/** World-space vertex positions of a geometry, flat `xyz`, for keying. */
function worldPositions(mesh: Mesh): Float64Array | null {
  const geometry = mesh.geometry as BufferGeometry
  const pos = geometry.getAttribute('position')
  if (!pos) return null
  const out = new Float64Array(pos.count * 3)
  const m = mesh.matrixWorld.elements
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Inlined rather than via Vector3.applyMatrix4: one allocation per vertex across ~400
    // meshes is thousands of throwaway objects during load.
    out[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

/** A mesh worth keying: big enough, and with a material that has an `aoMap` slot. */
function isCandidate(o: Object3D): o is Mesh {
  const mesh = o as Mesh
  if (!mesh.isMesh || !mesh.geometry) return false
  const material = mesh.material
  if (Array.isArray(material) || !material || !('aoMap' in material)) return false
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox
  if (!bb) return false
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)
  return span >= MIN_SPAN_M
}

/**
 * Apply maps from an already-parsed index to `root`.
 *
 * Separated from fetching so it is testable without a network or a GPU: `loadTexture` is injected
 * and can return a stub.
 *
 * `expectCoverage` is passed through to the hit-rate diagnostic — see `lightmapIndex`. Zero hits
 * is a bug on a plan known to be baked and completely normal on one that is not.
 */
export function applyLightmapsFromIndex(
  root: Object3D,
  index: LightmapIndex,
  loadTexture: (url: string) => Texture,
  { baseUrl = LIGHTMAP_BASE, expectCoverage = false, gain, debug = false }: ApplyOptions = {},
): ApplyResult {
  const resolver = createLightmapResolver(index, baseUrl)
  root.updateMatrixWorld(true)
  // TWO PASSES, because a key can belong to more than one baked plan. Pass one keys every
  // candidate and asks which plan they belong to; pass two applies only that plan's maps.
  // Applying per-key as they are found would mix two plans' visibility on real data -- 20 of 65
  // meshes in the 5-Room plan share a key with the 4-Room set.
  const keyed: { mesh: Mesh; key: string }[] = []
  let candidates = 0
  root.traverse((o) => {
    if (!isCandidate(o)) return
    candidates += 1
    const positions = worldPositions(o)
    if (!positions) return
    keyed.push({ mesh: o, key: lightmapKey(positions) })
  })
  const ctx = resolver.chooseContext(keyed.map((k) => k.key))
  // Scaled per plan unless the caller overrides. A plan whose surfaces see more sky needs less
  // gain, and the index records each plan's mean so one fitted measurement calibrates all of
  // them (`v0.31.7.44`).
  const planGain = gain ?? gainForPlanMean(ctx ? index.contexts?.[ctx]?.mean : undefined)
  let applied = 0
  for (const { mesh: o, key } of keyed) {
    const url = ctx ? resolver.urlFor(key, ctx) : null
    if (!url) continue
    const geometry = o.geometry as BufferGeometry
    if (!geometry.getAttribute('uv1')) {
      // Read through the ACCESSORS, not `attribute.array`. A raw array is only plain xyz
      // triples for a tightly-packed, non-normalised, non-interleaved buffer -- three makes no
      // such promise, and an interleaved geometry would silently produce garbage UVs that look
      // like a tuning problem rather than a data one.
      const pos = geometry.getAttribute('position')
      const local = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i += 1) {
        local[i * 3] = pos.getX(i)
        local[i * 3 + 1] = pos.getY(i)
        local[i * 3 + 2] = pos.getZ(i)
      }
      const idx = geometry.index
      let indices: Uint32Array | null = null
      if (idx) {
        indices = new Uint32Array(idx.count)
        for (let i = 0; i < idx.count; i += 1) indices[i] = idx.getX(i)
      }
      const { uv, conflicts } = computeBoxAtlasUv({ positions: local, indices })
      // A conflict means two faces in different atlas slots share a vertex, so a per-vertex
      // attribute cannot represent the layout and the map would land wrong. Skip rather than
      // render something subtly incorrect.
      if (conflicts > 0) continue
      geometry.setAttribute('uv1', new BufferAttribute(uv, 2))
    }
    applyVisibilityLightmap(o.material as never, loadTexture(url), planGain, debug)
    applied += 1
  }
  const { message, suspect } = resolver.describeHitRate(expectCoverage)
  return { candidates, applied, context: ctx, report: message, suspect }
}
