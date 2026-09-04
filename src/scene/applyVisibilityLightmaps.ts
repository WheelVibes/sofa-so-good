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
import {
  applyVisibilityLightmap,
  detachVisibilityLightmap,
  gainForPlanMean,
  type LightmapMode,
} from './visibilityLightmap'

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
  /**
   * How the map enters the shading. Derived from the INDEX's own `pass` field by
   * the caller, not configured: a `visibility` map is a dimensionless occlusion
   * ratio that must MULTIPLY the fill, and an `irradiance` map is the light
   * itself and must REPLACE it. Getting that backwards is not a tuning error —
   * `v0.31.7.67` measured multiplying by irradiance as *worse* than multiplying
   * by visibility, because the app's ambient/hemisphere fill stays in place and
   * gets scaled instead of stood in for.
   */
  mode?: LightmapMode
}

/**
 * Strip the injection from every material under `root`. Returns how many were stripped.
 *
 * **Exported because turning the feature OFF has to be a real removal.** The apply path detaches
 * as its first step, so re-applying was always safe; but a caller that simply stops calling apply
 * — which is what a tier gate or a flag toggle does — left the previous state attached forever.
 * `v0.31.7.114` gated the GI to `realistic`, and without this a `realistic -> performance` switch
 * would keep the baked light on the tier chosen for responsiveness.
 */
export function detachAllVisibilityLightmaps(root: Object3D): number {
  let detached = 0
  root.traverse((o) => {
    const m = (o as Mesh).material
    if (!m || Array.isArray(m)) return
    if (detachVisibilityLightmap(m as never)) detached += 1
  })
  return detached
}

export interface ApplyResult {
  /** Meshes considered — large enough, and carrying a material with an `aoMap` slot. */
  candidates: number
  /** Meshes that matched a baked key and now carry a map. */
  applied: number
  /** Materials whose PREVIOUS map was removed first — non-zero on a plan change. */
  detached: number
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
  /** Meshes skipped because a vertex was shared across two atlas slots. */
  conflicts: number
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
  {
    baseUrl = LIGHTMAP_BASE,
    expectCoverage = false,
    gain,
    debug = false,
    mode = 'multiply',
  }: ApplyOptions = {},
): ApplyResult {
  const resolver = createLightmapResolver(index, baseUrl)
  // DETACH FIRST. Materials survive a plan change, so anything patched for the previous plan is
  // still carrying that plan's visibility; adding the new plan's maps on top leaves the reused
  // materials wrong and the result stubbornly unchanged (`v0.31.7.45`).
  const detached = detachAllVisibilityLightmaps(root)
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
  // The bake's `scale` multiplies back IN, restoring the map to the units it was baked in before
  // any artistic gain applies. Kept separate from `gain` on purpose: one is a measured unit
  // conversion recorded by the producer, the other is a fitted look constant, and collapsing them
  // is how `v0.31.7.104`'s clipped set came to be "explained" by a gain of ~14.
  const scale = index.scale ?? 1
  const baseGain = gain ?? gainForPlanMean(ctx ? index.contexts?.[ctx]?.mean : undefined)
  // HOW MANY MESHES RIDE EACH MATERIAL, counted over the WHOLE root rather than the candidate set.
  // `applyVisibilityLightmap` patches a MATERIAL while `uv1` is built per GEOMETRY, so a material
  // shared by N meshes gets one map and one gain for all of them — and any sharer that was never
  // keyed has no `uv1`, samples undefined coordinates, and in `'replace'` mode is ASSIGNED that,
  // which is a cliff to black rather than a dim surface. Measured in `v0.31.7.174`: the bedroom3
  // wood floor read 126.7 counts with the feature off and 24.4 with it on, warm cast gone. 18 of
  // 52 mapped meshes rode just 2 shared materials, one of them 10 meshes with only 2 `uv1`s.
  //
  // Counted over every mesh, not just candidates, because the sharers that break are exactly the
  // ones the candidate filter EXCLUDED — a mesh too small to key still renders the material it
  // shares with a big one.
  const meshesPerMaterial = new Map<unknown, number>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const m = mesh.material
    if (Array.isArray(m) || !m) return
    meshesPerMaterial.set(m, (meshesPerMaterial.get(m) ?? 0) + 1)
  })
  // Which map each keyed mesh WOULD get, so a shared material can be checked for agreement before
  // anything is patched.
  // Per material: which maps its meshes want, and HOW MANY of its meshes will actually receive
  // one. The count is the load-bearing half — a mesh can be keyed and still get no map, and that
  // is precisely the mesh that breaks: it renders the patched material with no `uv1` of its own.
  const urlByMaterial = new Map<unknown, { urls: Set<string>; withMap: number }>()
  for (const { mesh: o, key } of keyed) {
    const u = ctx ? resolver.urlFor(key, ctx) : null
    if (!u) continue
    const m = o.material
    if (Array.isArray(m) || !m) continue
    const e = urlByMaterial.get(m) ?? { urls: new Set<string>(), withMap: 0 }
    e.urls.add(u)
    e.withMap += 1
    urlByMaterial.set(m, e)
  }

  let applied = 0
  /** Meshes skipped because their material is shared in a way that cannot be represented. */
  let sharedSkipped = 0
  // Faces relocated to the mirror atlas row because the bake put the data there.
  let flippedFaces = 0
  let conflictMeshes = 0
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
      // Hand the bake's own slot occupancy to the UV builder. Without it a
      // winding disagreement puts the lookup on the empty mirror row and the
      // surface renders black (`v0.31.7.98`).
      const { uv, conflicts, flipped } = computeBoxAtlasUv({
        positions: local,
        indices,
        occupiedSlots: ctx ? resolver.slotsFor(key, ctx) : null,
      })
      if (flipped > 0) flippedFaces += flipped
      // A conflict means two faces in different atlas slots share a vertex, so a per-vertex
      // attribute cannot represent the layout and the map would land wrong. Skip rather than
      // render something subtly incorrect.
      if (conflicts > 0) {
        // COUNTED, not just acted on. `conflicts` has gated this `continue` since the UV builder
        // existed and was never surfaced, so "the mesh was skipped" and "the mesh had no map" were
        // indistinguishable from outside — and a skipped mesh sitting next to a mapped one is a
        // candidate for the edge artefact `v0.31.7.129` has now eliminated five other causes for.
        // Third time in this arc that the number needed was already being computed (`.123`'s
        // `textured_share`, `.127`'s `padded`).
        conflictMeshes += 1
        continue
      }
      geometry.setAttribute('uv1', new BufferAttribute(uv, 2))
    }
    // PER MAP, not once for the set. Under `--per-map-scale` each map is normalised to its own
    // maximum, so a single factor would rescale every mesh by the wrong amount and flatten the
    // between-mesh ratios a GI bake exists to carry. The entry's own divisor wins; the
    // index-level one is the fallback for a globally scaled set.
    // A material may only be patched when every mesh that renders it agrees on the map. One
    // texture and one gain live on the material, so a disagreement cannot be represented — and the
    // failure is silent and severe (see the count above).
    //
    // CLONING per mesh was the obvious alternative and is not taken: materials here come from the
    // shared cache that finish changes are applied through, so a clone would quietly stop
    // responding to a floor or wall re-finish. Losing GI on a shared surface is recoverable;
    // a surface that stops taking finishes is not.
    const mat = o.material
    const sharers = meshesPerMaterial.get(mat) ?? 1
    const share = urlByMaterial.get(mat)
    // Safe only when every mesh rendering this material receives a map AND they all agree on
    // which one. `withMap`, not the keyed count: a mesh can be keyed and still resolve to no map,
    // and that mesh is exactly the one that renders the patch with no `uv1`.
    if (sharers > 1 && (share?.urls.size !== 1 || share.withMap !== sharers)) {
      sharedSkipped += 1
      continue
    }
    const mapGain = (resolver.scaleFor(key, ctx ?? '') ?? scale) * baseGain
    applyVisibilityLightmap(o.material as never, loadTexture(url), mapGain, debug, mode)
    if (import.meta.env.DEV) {
      // DEV-only pairing handle. A probe needs to know WHICH map a mesh was
      // handed to compare its `uv1` against that map's texels, and the texture
      // itself may carry an `ImageBitmap` with no `src` to read back.
      ;(o.material as { userData: Record<string, unknown> }).userData.visMapUrl = url
    }
    applied += 1
  }
  const { message, suspect } = resolver.describeHitRate(expectCoverage)
  const extras = [
    flippedFaces > 0 ? `${flippedFaces} face(s) mirrored` : null,
    conflictMeshes > 0 ? `${conflictMeshes} mesh(es) SKIPPED on uv1 conflict` : null,
    sharedSkipped > 0 ? `${sharedSkipped} mesh(es) SKIPPED on a shared material` : null,
  ].filter(Boolean)
  const report = extras.length ? `${message}, ${extras.join(', ')}` : message
  return { candidates, applied, detached, conflicts: conflictMeshes, context: ctx, report, suspect }
}
