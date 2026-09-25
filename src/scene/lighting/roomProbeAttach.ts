import type { Material, Mesh, Object3D, Texture } from 'three'
import { Box3, Vector3 } from 'three'
import { patchBoxProjectedEnv, ROOM_PROBE_UNIFORMS } from './boxProjectEnv'
import { probeAt, type RoomProbe } from './roomProbe'

/**
 * Attaching the box-projected room probe to the meshes that can show it (ROOM-PROBES, R7-L).
 *
 * Kept out of `RoomProbes.tsx` so the selection rules — which surfaces are glossy enough to be
 * worth a program variant, and when a shared material has to be cloned — are unit-testable
 * against plain objects, the way `applyVisibilityLightmaps.ts` is.
 */

/**
 * Roughness above which a per-room probe is invisible and therefore pure cost.
 *
 * `textureCubeUV` walks the PMREM mip chain with roughness, so by ~0.6 the lookup is reading a
 * tile of a handful of texels: a room and a studio average to very nearly the same colour, and
 * all that is left is an extra sampler, an extra program and an extra bind. This threshold is
 * what keeps an HDB's matt emulsion (roughness 0.9) and its plaster ceiling (1.0) out of the
 * feature entirely — they are most of the shell's area, and none of it reflects.
 */
export const ROOM_PROBE_MAX_ROUGHNESS = 0.6

/** Minimal shape of a three material this module needs. Lets the tests use plain objects. */
export interface ProbeableMaterial {
  uuid: string
  roughness?: number
  isMeshStandardMaterial?: boolean
  /** drei's `MeshReflectorMaterial` own-property marker — see `isProbeCandidate`. */
  _tDiffuse?: unknown
  /** three MULTIPLIES `roughness` by this map's green channel, so the scalar alone is not the
   *  surface's roughness — see `effectiveRoughness`. */
  roughnessMap?: { image?: unknown } | null
  onBeforeCompile?: (shader: ShaderLike) => void
  customProgramCacheKey?: () => string
  needsUpdate?: boolean
  userData: Record<string, unknown>
  clone?: () => ProbeableMaterial
  dispose?: () => void
}

/** The subset of three's `onBeforeCompile` shader object the patch touches. */
export interface ShaderLike {
  vertexShader: string
  fragmentShader: string
  uniforms: Record<string, { value: unknown }>
}

/** The live uniform objects one attached material owns. */
export interface RoomProbeUniforms {
  map: { value: Texture | null }
  boxMin: { value: Vector3 }
  boxMax: { value: Vector3 }
  center: { value: Vector3 }
  mix: { value: number }
}

interface AttachRecord {
  prevOnBeforeCompile?: (shader: ShaderLike) => void
  prevCacheKey?: () => string
  uniforms: RoomProbeUniforms
  cloned: boolean
}

const RECORD_KEY = 'roomProbeRecord'

/**
 * The roughness a surface actually renders with.
 *
 * **The scalar alone is a trap on this codebase.** `materials/cache.ts`'s procedural branch
 * leaves `material.roughness` at its 0.85 default and puts the painter's real value in a
 * `roughnessMap`; three multiplies the two (green channel). So `wall-tile-white` — the glazed
 * kitchen/bathroom tile this whole feature was diagnosed on — reports **0.85** and a scalar test
 * rejects it, while it actually renders at `0.85 x 0.16 ~= 0.14`. Measured the hard way: the
 * first A/B moved the steel sink and the worktop and left the tile at **0.0 linear counts**,
 * which is the opposite of the finding the feature was built on.
 *
 * The map's mean is read once per texture by drawing it into a 1x1 canvas — the browser's own
 * box filter, which is what a mip-0 average is. Cached weakly so a disposed texture is not
 * pinned. Falls back to 1 (i.e. to the scalar) where there is no DOM or the draw fails, which
 * is the conservative direction: a material is rejected rather than wrongly patched.
 */
const mapMeanCache = new WeakMap<object, number>()

function roughnessMapMean(map: { image?: unknown } | null | undefined): number {
  if (!map) return 1
  const cached = mapMeanCache.get(map)
  if (cached !== undefined) return cached
  let mean = 1
  const image = map.image as CanvasImageSource | undefined
  try {
    if (image && typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = 1
      c.height = 1
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(image, 0, 0, 1, 1)
        // GREEN: three samples `roughnessMap.g` for roughness (`.b` is metalness).
        mean = ctx.getImageData(0, 0, 1, 1).data[1]! / 255
      }
    }
  } catch {
    mean = 1
  }
  mapMeanCache.set(map, mean)
  return mean
}

/** `material.roughness` folded together with its map, the way the shader folds them. */
export function effectiveRoughness(material: ProbeableMaterial): number {
  const scalar = material.roughness
  if (typeof scalar !== 'number') return Number.POSITIVE_INFINITY
  return scalar * roughnessMapMean(material.roughnessMap)
}

/**
 * Is this material worth a probe at all?
 *
 * Excludes drei's `MeshReflectorMaterial`, which extends `MeshStandardMaterial` (so it passes
 * every other test) but already resolves a REAL planar reflection of this scene — the bathroom
 * mirrors on `realistic`. Layering a box-projected approximation under a true reflection buys
 * nothing and puts two shader patches on one material. Detected by an own property of its
 * constructor rather than by class name, which minifies.
 */
export function isProbeCandidate(material: ProbeableMaterial | null | undefined): boolean {
  if (!material) return false
  if (material.isMeshStandardMaterial !== true) return false
  if (material._tDiffuse !== undefined) return false
  if (material.userData[RECORD_KEY] !== undefined) return false
  return effectiveRoughness(material) <= ROOM_PROBE_MAX_ROUGHNESS
}

/**
 * Wrap a material's `onBeforeCompile` with the box-projection patch.
 *
 * COMPOSED, never replaced. The lightmapped shell materials already own an `onBeforeCompile`
 * (`visibilityLightmap.ts`) and clobbering it would delete the baked GI on exactly the surfaces
 * this feature is aimed at. Same for `customProgramCacheKey`: the lightmap encodes its own state
 * there, so this appends rather than assigns.
 *
 * Returns the live uniform objects. If the installed three no longer contains the chunks the
 * patch anchors on, the compile-time hook holds `mix` at 0 and leaves the shader as the previous
 * patch left it, rather than compiling a program that references samplers nothing binds.
 */
export function attachRoomProbe(
  material: ProbeableMaterial,
  probe: RoomProbe,
  texture: Texture,
  mix = 1,
): RoomProbeUniforms {
  const uniforms: RoomProbeUniforms = {
    map: { value: texture },
    boxMin: { value: new Vector3(...probe.boxMin) },
    boxMax: { value: new Vector3(...probe.boxMax) },
    center: { value: new Vector3(...probe.center) },
    mix: { value: mix },
  }
  const prevOnBeforeCompile = material.onBeforeCompile
  const prevCacheKey = material.customProgramCacheKey
  material.onBeforeCompile = (shader: ShaderLike) => {
    prevOnBeforeCompile?.call(material, shader)
    const patched = patchBoxProjectedEnv(shader)
    if (!patched) {
      // three moved the chunk. Leave the shader as the previous patch left it and hold the
      // uniforms at rest, rather than compiling a program that references samplers nothing binds.
      uniforms.mix.value = 0
      return
    }
    shader.vertexShader = patched.vertexShader
    shader.fragmentShader = patched.fragmentShader
    shader.uniforms[ROOM_PROBE_UNIFORMS.map] = uniforms.map
    shader.uniforms[ROOM_PROBE_UNIFORMS.boxMin] = uniforms.boxMin
    shader.uniforms[ROOM_PROBE_UNIFORMS.boxMax] = uniforms.boxMax
    shader.uniforms[ROOM_PROBE_UNIFORMS.center] = uniforms.center
    shader.uniforms[ROOM_PROBE_UNIFORMS.mix] = uniforms.mix
  }
  // One extra program per material family, not per room: the injected SOURCE is identical
  // everywhere and only the uniforms differ, so three reuses the compiled program — the same
  // property `lightmapNeighbour`'s 530-mesh inherit relies on for its +3 programs.
  material.customProgramCacheKey = () => `${prevCacheKey?.call(material) ?? ''}|roomProbe`
  const record: AttachRecord = { prevOnBeforeCompile, prevCacheKey, uniforms, cloned: false }
  material.userData[RECORD_KEY] = record
  material.needsUpdate = true
  return uniforms
}

/** Undo {@link attachRoomProbe}, restoring three's own hooks. */
export function detachRoomProbe(material: ProbeableMaterial): boolean {
  const record = material.userData[RECORD_KEY] as AttachRecord | undefined
  if (!record) return false
  // Restore, never null: `onBeforeCompile`/`customProgramCacheKey` are three's own prototype
  // members and assigning `undefined` would break `instanceof`-free duck typing downstream.
  material.onBeforeCompile = record.prevOnBeforeCompile ?? (() => {})
  material.customProgramCacheKey = record.prevCacheKey ?? (() => '')
  delete material.userData[RECORD_KEY]
  material.needsUpdate = true
  return true
}

/** A mesh the walk selected, with the probe it should use. */
export interface ProbeAssignment {
  mesh: Mesh
  probe: RoomProbe
}

const _box = new Box3()
const _centre = new Vector3()
const _size = new Vector3()

/**
 * Which meshes in `root` should take which probe.
 *
 * The room is resolved from the mesh's WORLD bounding-box centre in x/z, which is the same
 * "where does this thing live" test `daylitRooms.fixtureSurvivesDaylight` makes for fixtures.
 * A mesh spanning two rooms (a long corridor wall) lands in whichever box holds its centre; the
 * projection's `max(t, 0)` guard keeps the overhanging half from sampling the far side.
 */
export function selectProbeMeshes(root: Object3D, probes: readonly RoomProbe[]): ProbeAssignment[] {
  const out: ProbeAssignment[] = []
  if (probes.length === 0) return out
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
    if (Array.isArray(mesh.material)) return
    if (!isProbeCandidate(mesh.material as unknown as ProbeableMaterial)) return
    _box.setFromObject(mesh, true)
    if (_box.isEmpty()) return
    _box.getCenter(_centre)
    const probe = probeAt(probes, _centre.x, _centre.z)
    if (!probe) return
    out.push({ mesh, probe })
  })
  return out
}

/**
 * How many rooms may hold a probe at once.
 *
 * **This is a VRAM budget, and it is the one real cost of the feature.** A PMREM target is
 * `3 * max(cubeSize, 112)` x `4 * cubeSize` at RGBA16F — 6.0 MB per room at a 256 cube, 1.5 MB
 * at 128. Measured on the default 4-room flat, *every* one of its 11 rooms has at least one
 * candidate mesh (a window pane at roughness 0.04, a door lever at 0.30), so an unbounded
 * feature allocated **69 MB** on `realistic/capable` — immediately after a whole brief spent
 * reclaiming VRAM with KTX2. Capped at 4, that is 24 MB there and 6 MB on `realistic/weak`.
 *
 * Four rather than three because the gloss census (`src/materials/CLAUDE.md` CENSUS-KEYING plus
 * the R7-L inventory) finds the effect concentrated in exactly three rooms on THIS plan — the
 * kitchen and both bathrooms, the only rooms defaulting to `wall-tile-white` at an effective
 * roughness of 0.136 — and one spare keeps a differently-finished plan from being cut to the
 * bone. Rooms are ranked, so the ones that lose are the ones with least to show.
 */
const ROOM_PROBE_MAX_ROOMS = 4

/**
 * Keep only the `maxRooms` rooms with the most SHOWABLE reflection in them.
 *
 * Ranked by summed candidate footprint (the world bounding box's largest face) **weighted by
 * how sharp that surface's reflection is**, `(1 - roughness / max)^2`. Area alone was measured
 * and is wrong: it picked `mainBedroom, corridor, bath1, livingDining` and dropped the KITCHEN,
 * because a bedroom's 10 m² vinyl floor at an effective roughness of 0.49 outweighs a small
 * kitchen's glazed splashback at 0.14 — and at 0.49 the PMREM lookup is so blurred that a room
 * and a studio average to the same colour (measured: 0.0 linear counts on the kitchen floor
 * tile). The weight is quadratic, so the 0.14 tile counts ~18x the 0.49 vinyl per m², which is
 * the right order: the probe is worth paying for exactly where it is legible.
 */
export function limitProbeRooms(
  assignments: readonly ProbeAssignment[],
  maxRooms = ROOM_PROBE_MAX_ROOMS,
): ProbeAssignment[] {
  const area = new Map<string, number>()
  for (const a of assignments) {
    _box.setFromObject(a.mesh, true)
    if (_box.isEmpty()) continue
    _box.getSize(_size)
    const dims = [_size.x, _size.y, _size.z].sort((p, q) => q - p)
    const eff = effectiveRoughness(a.mesh.material as unknown as ProbeableMaterial)
    const sharpness = (1 - Math.min(eff, ROOM_PROBE_MAX_ROUGHNESS) / ROOM_PROBE_MAX_ROUGHNESS) ** 2
    area.set(a.probe.roomId, (area.get(a.probe.roomId) ?? 0) + dims[0]! * dims[1]! * sharpness)
  }
  const keep = new Set(
    [...area.entries()]
      // Ties broken by room id so the selection is deterministic across runs — an unstable
      // probe set would make two captures of the same scene disagree.
      .sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))
      .slice(0, maxRooms)
      .map(([id]) => id),
  )
  return assignments.filter((a) => keep.has(a.probe.roomId))
}

/** What one attach pass did, for the dev log and for the tests. */
export interface RoomProbeAttachResult {
  /** Meshes that ended up with a probe. */
  attached: number
  /** Distinct materials patched (one program variant each, shared across meshes). */
  materials: number
  /** Materials cloned because one material was shared across rooms. */
  cloned: number
}

/**
 * Attach probes to a selection, cloning a material only where it is genuinely shared across two
 * different rooms.
 *
 * The clone is unavoidable and is the one real cost of per-room probes over one global one: the
 * box uniforms live on the MATERIAL, so a chrome tap material shared by both bathrooms cannot
 * carry two boxes. Cloning only on conflict keeps that to the handful of materials that actually
 * span rooms rather than duplicating the whole catalogue.
 */
export function attachRoomProbes(
  assignments: readonly ProbeAssignment[],
  textureFor: (roomId: string) => Texture | null,
  mix = 1,
): RoomProbeAttachResult {
  // First pass: which rooms does each material serve?
  const rooms = new Map<string, Set<string>>()
  for (const a of assignments) {
    const m = a.mesh.material as unknown as ProbeableMaterial
    const set = rooms.get(m.uuid) ?? new Set<string>()
    set.add(a.probe.roomId)
    rooms.set(m.uuid, set)
  }
  const done = new Set<string>()
  let attached = 0
  let materials = 0
  let cloned = 0
  for (const a of assignments) {
    const texture = textureFor(a.probe.roomId)
    if (!texture) continue
    const original = a.mesh.material as unknown as ProbeableMaterial
    const shared = (rooms.get(original.uuid)?.size ?? 1) > 1
    if (shared) {
      const copy = original.clone?.()
      if (!copy) continue
      copy.userData = { ...copy.userData, roomProbeClone: true }
      attachRoomProbe(copy, a.probe, texture, mix)
      a.mesh.userData.roomProbeOriginalMaterial = a.mesh.material
      a.mesh.material = copy as unknown as Material
      cloned++
      materials++
      attached++
      continue
    }
    const key = `${original.uuid}`
    if (!done.has(key)) {
      attachRoomProbe(original, a.probe, texture, mix)
      done.add(key)
      materials++
    }
    attached++
  }
  return { attached, materials, cloned }
}

/**
 * Detach every probe under `root`, restoring and disposing the clones this feature created.
 *
 * NOT just an early return in the component: materials outlive the effect, so leaving them
 * patched would keep a stale room's reflection after a plan change or a flag toggle — the same
 * one-directional-gate defect `detachAllVisibilityLightmaps` exists to avoid.
 */
export function detachAllRoomProbes(root: Object3D): number {
  let removed = 0
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return
    if (Array.isArray(mesh.material)) return
    const material = mesh.material as unknown as ProbeableMaterial | undefined
    if (!material) return
    if (!detachRoomProbe(material)) return
    removed++
    const original = mesh.userData.roomProbeOriginalMaterial as Material | undefined
    if (original && material.userData.roomProbeClone === true) {
      mesh.material = original
      material.dispose?.()
    }
    delete mesh.userData.roomProbeOriginalMaterial
  })
  return removed
}
