import { MeshReflectorMaterial, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BufferGeometry, Material, Object3D, Texture } from 'three'
import { Box3, Color, type Mesh, type MeshStandardMaterial, Triangle, Vector3 } from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { getSurfaceMaterial } from '../materials/furnitureMaterials'
import { effectiveAssetTier } from '../scene/quality'
import { useStore } from '../state/store'
import { type FinishTarget, listFinishTargets, meshMatchesTarget } from './gltf/finishTargets'
import { secureGltfLoader } from './gltf/loaderSecurity'
import { baseUrl, lodUrlsForBase, prewarmLod, resolveLodUrlSync } from './gltf/lod'
import { detectMirrorPlane, hideMirrorMesh, type MirrorPlane } from './gltf/mirrorPlane'
import { applyTextureBudget } from './gltf/textureBudget'
import { detectSupportPlaneY, type HorizontalBand } from './ikea/supportPlane'
import { MetalMaterial } from './primitives/MetalMaterial'
import { mirrorReflectorConfig } from './primitives/MirrorMaterial'
import { useMirrorRelevance } from './primitives/useMirrorRelevance'

/** Public footprint shape: axis-aligned size in metres at scale=1, plus the
 *  local-space center offset of that bbox. Many GLBs are not centered on their
 *  local origin, so consumers must add (ox, oz) — rotated by the item's yaw —
 *  to item.position when computing the OBB. */
export interface GltfFootprint {
  w: number
  d: number
  h: number
  ox: number
  oz: number
}

/** Module-level bbox cache, keyed by base (high-tier) url. `authoritative` is
 *  true when the footprint came from original (unsimplified) geometry or a
 *  scraper seed; a low/medium variant may seed a non-authoritative footprint
 *  that the original later overwrites. */
const FOOTPRINT_CACHE = new Map<string, GltfFootprint & { authoritative: boolean }>()

/** Reads the cached footprint for a GLB if available, else returns null.
 *  Normalises tier-variant urls to their base key, since the cache is always
 *  written under the base url (high-tier footprint is authoritative). */
export function getCachedGltfFootprint(url: string): GltfFootprint | null {
  const e = FOOTPRINT_CACHE.get(baseUrl(url))
  return e ? { w: e.w, d: e.d, h: e.h, ox: e.ox, oz: e.oz } : null
}

/** Recolourable finish targets (named material/mesh groups) discovered in a GLB
 *  once it loads, keyed by base url. Lets the inspector offer a per-part colour
 *  picker for uploaded / built-in models (the `finish:<key>` override mechanism
 *  already exists; this is the missing "what parts are there?" half). Listeners
 *  let the inspector re-render the moment a model's targets become known. */
const FINISH_TARGETS_CACHE = new Map<string, FinishTarget[]>()
const finishTargetListeners = new Set<() => void>()

/** Cached recolour targets for a GLB (by base or variant url), or null if the
 *  model hasn't loaded yet. */
export function getCachedFinishTargets(url: string): FinishTarget[] | null {
  return FINISH_TARGETS_CACHE.get(baseUrl(url)) ?? null
}

/** Subscribe to "a model's finish targets were just cached" (returns an
 *  unsubscribe). The inspector uses this to show pickers as soon as a freshly
 *  placed model finishes loading. */
export function subscribeFinishTargets(cb: () => void): () => void {
  finishTargetListeners.add(cb)
  return () => finishTargetListeners.delete(cb)
}

const SUPPORT_PLANE_CACHE = new Map<string, number | null>()
/** URLs whose cached plane came from original (non-LOD) geometry — never
 *  recomputed/overwritten by a later low/medium-tier render. */
const SUPPORT_PLANE_AUTH = new Set<string>()

export function getCachedSupportPlaneY(url: string): number | null {
  return SUPPORT_PLANE_CACHE.get(baseUrl(url)) ?? null
}

/** Pre-seed a known support plane (e.g. from a test). */
export function seedGltfSupportPlane(url: string, y: number | null): void {
  SUPPORT_PLANE_CACHE.set(baseUrl(url), y)
}

/** Pre-seed the footprint cache from known GLB accessor data (e.g. the IKEA
 *  scraper's footprint) so collision is correct before first render. No-op if
 *  the key is already cached. anchorOffset is the local-space center [x,y,z];
 *  only x/z (→ ox/oz) matter for the OBB. */
export function seedGltfFootprint(
  url: string,
  fp: { w: number; d: number; h: number; anchorOffset: [number, number, number] },
): void {
  const key = baseUrl(url)
  if (FOOTPRINT_CACHE.has(key)) return
  // Scraper footprint is from the original GLB accessors → authoritative.
  FOOTPRINT_CACHE.set(key, {
    w: Math.max(0.05, fp.w),
    d: Math.max(0.05, fp.d),
    h: Math.max(0.05, fp.h),
    ox: fp.anchorOffset[0],
    oz: fp.anchorOffset[2],
    authoritative: true,
  })
}

/** Original (unclone) GLTF scenes returned by `useGLTF`, keyed by base url.
 *  drei's `useGLTF.clear(url)` drops the loader/suspense CACHE entry but does
 *  NOT dispose the GPU geometry/textures it parsed — those only free when
 *  three's renderer sees `.dispose()` on the original geometries/materials/
 *  textures. We hold a reference per base url so {@link evictGltfAsset} can
 *  dispose them on removal. A url maps to a set because tier variants
 *  (low/medium/original) of one asset all collapse to the same base key. */
const LOADED_SCENES = new Map<string, Set<Object3D>>()

/** Record an original GLTF scene under its base url so it can be disposed on
 *  eviction. Called from render once the asset is loaded. */
function trackLoadedScene(url: string, scene: Object3D): void {
  const key = baseUrl(url)
  let set = LOADED_SCENES.get(key)
  if (!set) {
    set = new Set()
    LOADED_SCENES.set(key, set)
  }
  set.add(scene)
}

/** Dispose every geometry / material / texture reachable from a scene so the
 *  WebGL renderer frees the GPU resources. Safe to call once the cloned,
 *  still-mounted instances (which share these refs) have unmounted. */
function disposeSceneResources(scene: Object3D): void {
  const seenGeo = new Set<BufferGeometry>()
  const seenMat = new Set<Material>()
  const disposeMaterial = (mat: Material): void => {
    if (seenMat.has(mat)) return
    seenMat.add(mat)
    for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
      const tex = value as Texture | null
      if (tex && (tex as { isTexture?: boolean }).isTexture) tex.dispose()
    }
    mat.dispose()
  }
  scene.traverse((obj) => {
    const mesh = obj as Mesh
    if (mesh.geometry && !seenGeo.has(mesh.geometry)) {
      seenGeo.add(mesh.geometry)
      mesh.geometry.dispose()
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) disposeMaterial(m)
    }
  })
}

/** Schedule work after React has had a chance to commit the unmount of the
 *  removed asset's instances. The store `set(...)` that drops the def + its
 *  placed items only *schedules* a re-render; the meshes (which share the
 *  original geometry we are about to dispose) unmount during React's commit
 *  phase, AFTER the current synchronous tick. `requestAnimationFrame` runs
 *  after that commit; `setTimeout` is the non-DOM (test/SSR) fallback. */
function afterUnmount(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn())
  else setTimeout(fn, 0)
}

/** Evict a removed/replaced asset from every GPU + module-level cache it
 *  occupies, keyed by its base url:
 *   - drei `useGLTF.clear(url)` for the base AND each tier variant url
 *     (low/medium siblings + registered upload blob variants), so the parsed
 *     scene leaves the loader/suspense cache and can be GC'd.
 *   - dispose the original geometries/materials/textures so the renderer
 *     actually releases GPU memory (clear alone does not).
 *   - prune the footprint + support-plane caches for the base key.
 *
 *  Cache clear + module-cache prune run synchronously (safe — they touch no
 *  live GPU object). GPU disposal is deferred to after React commits the
 *  unmount of the asset's placed instances (the caller's `set(...)` dropped
 *  the def + items but the meshes that share these geometries unmount on the
 *  next commit) — disposing earlier would break a still-mounted clone.
 *  Idempotent: a url that was never loaded is a harmless no-op. */
export function evictGltfAsset(url: string): void {
  const key = baseUrl(url)
  // Clear every cache entry the asset may occupy (compute urls BEFORE the
  // caller unregisters the upload variants in freeResource()).
  for (const u of lodUrlsForBase(key)) useGLTF.clear(u)
  FOOTPRINT_CACHE.delete(key)
  SUPPORT_PLANE_CACHE.delete(key)
  SUPPORT_PLANE_AUTH.delete(key)
  const scenes = LOADED_SCENES.get(key)
  if (!scenes) return
  LOADED_SCENES.delete(key)
  afterUnmount(() => {
    for (const scene of scenes) disposeSceneResources(scene)
  })
}

/** Test-only: reset the loaded-scene registry between cases. */
export function __resetLoadedScenesForTest(): void {
  LOADED_SCENES.clear()
}

interface GltfModelProps {
  url: string
  /** Uniform scale, or a per-axis [x, y, z] tuple (non-uniform resize). */
  scale?: number | [number, number, number]
  /** Optional hex tint multiplied into every cloned material's base colour. */
  tint?: string
  /** Per-finish-target hex tint, keyed by target key. */
  finishOverrides?: Record<string, string>
  /** Make the model's largest flat surface a real planar mirror (High/Maximum
   *  render tiers only); the original surface is hidden and replaced. */
  reflective?: boolean
}

/**
 * Renders a GLB by URL. Handles two reuse cases:
 *   1. Built-in URLs are stable strings → useGLTF hits its internal cache.
 *   2. User-upload blob URLs are stable per asset id → same cache hit.
 *
 * The original scene is cloned (skeleton-aware) so multiple instances of the
 * same GLB don't share transforms. Materials are cloned only when a tint is
 * applied to keep the common case (no tint) cheap.
 */
export function GltfModel({ url, scale = 1, tint, finishOverrides, reflective }: GltfModelProps) {
  // Asset detail (mesh/texture LOD) is decoupled from render effects: it
  // follows `assetTier` when explicitly set, else the render `qualityTier`.
  const renderTier = useStore((s) => s.qualityTier)
  const assetTier = useStore((s) => s.assetTier)
  const qualityTier = effectiveAssetTier(assetTier, renderTier)
  // Kick the existence probe outside render so a future render upgrades to the
  // variant url; harmless/no-op if already cached or on 'high'.
  useEffect(() => {
    void prewarmLod(url, qualityTier)
  }, [url, qualityTier])
  const resolvedUrl = resolveLodUrlSync(url, qualityTier)
  const servingOriginal = resolvedUrl === url
  // SEC-1: install the shared foreign-URL-blocking LoadingManager on drei's
  // memoized GLTFLoader (see `gltf/loaderSecurity.ts`) so a crafted model's
  // embedded buffer/image `uri` can't trigger a fetch to an attacker host at
  // render time — the same policy the convert path already applies. `true,
  // true` preserve useGLTF's own DRACO/meshopt defaults (its default params
  // only apply when the args are omitted entirely).
  const gltf = useGLTF(resolvedUrl, true, true, secureGltfLoader)
  // Record the original scene under its base url so a later removal can
  // dispose its GPU geometry/textures (drei's useGLTF.clear only drops the
  // loader cache entry). Keyed by base so all tier variants share one bucket.
  useEffect(() => {
    trackLoadedScene(url, gltf.scene as unknown as Object3D)
  }, [url, gltf.scene])
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene as unknown as Object3D), [gltf.scene])
  const tintRef = useRef<string | undefined>(undefined)
  // Materials this component cloned (per recolour effect). The originals come
  // from the shared useGLTF cache and must never be disposed; only these clones
  // are ours to free when a recolour re-runs or the component unmounts.
  const tintMatsRef = useRef<Material[]>([])
  const finishMatsRef = useRef<Material[]>([])
  const [mirrorPlane, setMirrorPlane] = useState<MirrorPlane | null>(null)
  // Real reflections only on High/Maximum (mirrorReflectorConfig gates this).
  const reflectorCfg = mirrorReflectorConfig(renderTier)
  const wantMirror = !!reflective && reflectorCfg.real

  // Cache footprint, keyed by the base (high-tier) url so collision is
  // consistent across tiers. Simplified low/medium variants can shift the bbox
  // slightly, so the original geometry is authoritative: a variant may seed the
  // cache (so collision works if only it ever renders), but the original
  // overwrites it when loaded. `servingOriginal` is true on high and on the
  // runtime-texture fallback (geometry untouched there).
  useEffect(() => {
    const fpKey = baseUrl(url)
    const existing = FOOTPRINT_CACHE.get(fpKey)
    // Skip only when an authoritative (original-geometry) footprint is cached.
    if (existing && (existing.authoritative || !servingOriginal)) return
    // Compute bbox from visible meshes only. setFromObject traverses every
    // descendant including lights, empties, collision proxies, and hidden
    // helper geometry that some GLBs ship with — those can inflate the
    // footprint well beyond the rendered shape.
    cloned.updateWorldMatrix(true, true)
    const box = new Box3()
    const meshBox = new Box3()
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const gb = mesh.geometry.boundingBox
      if (!gb) return
      meshBox.copy(gb).applyMatrix4(mesh.matrixWorld)
      box.union(meshBox)
    })
    const size = new Vector3()
    const center = new Vector3()
    if (box.isEmpty()) {
      box.setFromObject(cloned)
    }
    box.getSize(size)
    box.getCenter(center)
    FOOTPRINT_CACHE.set(fpKey, {
      w: Math.max(0.05, size.x),
      d: Math.max(0.05, size.z),
      h: Math.max(0.05, size.y),
      ox: center.x,
      oz: center.z,
      authoritative: servingOriginal,
    })
  }, [url, cloned, servingOriginal])

  // Discover the model's recolourable finish targets (named material/mesh
  // groups) once, so the inspector can offer a per-part colour picker. The
  // original (high-tier) scene names materials best, so only it is authoritative
  // — a LOD variant may seed but the original overwrites. Notify listeners so an
  // open inspector shows the pickers the moment the model loads.
  useEffect(() => {
    const key = baseUrl(url)
    if (FINISH_TARGETS_CACHE.has(key) && !servingOriginal) return
    const targets = listFinishTargets(cloned)
    if (targets.length === 0) return
    FINISH_TARGETS_CACHE.set(key, targets)
    for (const cb of finishTargetListeners) cb()
  }, [url, cloned, servingOriginal])

  // Support-plane detection (its own effect — must NOT be short-circuited by the
  // footprint cache above). Histograms near-horizontal triangle area by Y (2cm
  // bins) over triangles whose centroid lies inside the footprint interior
  // (within 80% of half-extents, to drop rim/rail overhangs), then picks the
  // highest substantial band below the head/footboard region — the slat plane a
  // mattress rests on, not the bbox top. Computed from whatever LOD is loaded
  // (the plane Y is robust to triangle decimation); an original-geometry result
  // is marked authoritative and never overwritten by a later LOD render.
  useEffect(() => {
    const fpKeyPlane = baseUrl(url)
    if (SUPPORT_PLANE_AUTH.has(fpKeyPlane)) return
    cloned.updateWorldMatrix(true, true)
    const box = new Box3()
    const meshBox = new Box3()
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const gb = mesh.geometry.boundingBox
      if (!gb) return
      meshBox.copy(gb).applyMatrix4(mesh.matrixWorld)
      box.union(meshBox)
    })
    if (box.isEmpty()) return
    const size = new Vector3()
    const center = new Vector3()
    box.getSize(size)
    box.getCenter(center)

    const bins = new Map<number, number>()
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    const tri = new Triangle()
    const nrm = new Vector3()
    const cen = new Vector3()
    const halfX = (size.x / 2) * 0.8
    const halfZ = (size.z / 2) * 0.8
    const BIN = 0.02
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
      const pos = mesh.geometry.attributes.position
      const idx = mesh.geometry.index
      if (!pos) return
      const triCount = idx ? idx.count / 3 : pos.count / 3
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
        a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld)
        b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld)
        tri.set(a, b, c)
        tri.getNormal(nrm)
        if (Math.abs(nrm.y) < 0.9) continue
        tri.getMidpoint(cen)
        if (Math.abs(cen.x - center.x) > halfX || Math.abs(cen.z - center.z) > halfZ) continue
        const bin = Math.round(cen.y / BIN) * BIN
        bins.set(bin, (bins.get(bin) ?? 0) + tri.getArea())
      }
    })
    const bands: HorizontalBand[] = [...bins.entries()].map(([y, area]) => ({ y, area }))
    SUPPORT_PLANE_CACHE.set(fpKeyPlane, detectSupportPlaneY(bands, Math.max(0.05, size.y)))
    if (servingOriginal) SUPPORT_PLANE_AUTH.add(fpKeyPlane)
  }, [url, cloned, servingOriginal])

  // Apply tint by walking the cloned tree once when it changes.
  useEffect(() => {
    if (tint === tintRef.current) return
    tintRef.current = tint
    // Free the clones from the previous tint pass before re-cloning (or before
    // bailing on an empty tint) so churning the configurator doesn't leak GPU
    // material memory.
    for (const m of tintMatsRef.current) m.dispose()
    tintMatsRef.current = []
    if (!tint) return
    const c = new Color(tint)
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.material = mats.map((m) => {
        const clone = (m as MeshStandardMaterial).clone()
        if ('color' in clone && clone.color) {
          clone.color = clone.color.clone().multiply(c)
        }
        tintMatsRef.current.push(clone)
        return clone
      }) as MeshStandardMaterial | MeshStandardMaterial[]
      // If the original was a single material, keep it as such.
      if (!Array.isArray(mesh.material) || mesh.material.length === 1) {
        mesh.material = (mesh.material as MeshStandardMaterial[])[0]
      }
    })
  }, [cloned, tint])

  // Per-target finish overrides (key → a hex `#colour` OR a material/texture
  // token like `wood` / `marble` / `metal` / `rattan` / `painted` / `gloss` /
  // `mat:<id>`). Cloned so instances don't share materials.
  //
  // Each pass first restores every previously-touched mesh to its captured
  // ORIGINAL material (stored once in `userData.__finishOrig`), so clearing /
  // removing one override among several reverts that part cleanly (instead of
  // leaving it on a just-disposed clone). Then it re-applies the current set.
  //
  // NOTE: this effect and the global `tint` effect both mutate `cloned`
  // materials; for one piece a user sets one or the other (last-effect-wins on
  // any overlap — this runs after tint).
  useEffect(() => {
    for (const m of finishMatsRef.current) m.dispose()
    finishMatsRef.current = []
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      const orig = mesh.userData.__finishOrig as
        | MeshStandardMaterial
        | MeshStandardMaterial[]
        | undefined
      if (orig) mesh.material = orig
    })
    const overrides = finishOverrides ?? {}
    if (Object.keys(overrides).length === 0) return
    cloned.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      for (const [key, value] of Object.entries(overrides)) {
        if (!meshMatchesTarget(mesh, key)) continue
        // Capture the untouched material once so a later clear can revert to it.
        if (mesh.userData.__finishOrig == null) mesh.userData.__finishOrig = mesh.material
        const skin = (m: MeshStandardMaterial): MeshStandardMaterial => {
          if (value.startsWith('#')) {
            // Colour: keep the part's own material (maps/roughness), retint it.
            const clone = m.clone()
            if ('color' in clone && clone.color) clone.color = new Color(value)
            finishMatsRef.current.push(clone)
            return clone
          }
          // Material/texture: swap in a furniture surface material (wood grain,
          // marble, brushed metal, …). Cloned so per-instance disposal is safe.
          const surf = getSurfaceMaterial(value, '#cfcfcf', 1).clone()
          finishMatsRef.current.push(surf)
          return surf
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mesh.material = mats.map((m) => skin(m as MeshStandardMaterial)) as
          | MeshStandardMaterial
          | MeshStandardMaterial[]
        if (!Array.isArray(mesh.material) || mesh.material.length === 1) {
          mesh.material = (mesh.material as MeshStandardMaterial[])[0]
        }
        break
      }
    })
  }, [cloned, finishOverrides])

  // Dispose any clones we still own when the component unmounts.
  useEffect(
    () => () => {
      for (const m of tintMatsRef.current) m.dispose()
      for (const m of finishMatsRef.current) m.dispose()
      tintMatsRef.current = []
      finishMatsRef.current = []
    },
    [],
  )

  // Runtime texture-budget fallback: only when we're serving the original asset
  // (no offline variant exists) on a non-high tier.
  useEffect(() => {
    if (servingOriginal && qualityTier !== 'high') {
      applyTextureBudget(cloned, qualityTier)
    }
  }, [cloned, servingOriginal, qualityTier])

  // Reflective surface: detect the model's largest flat mesh, hide it, and let
  // the overlaid <MeshReflectorMaterial> plane below replace it with a true
  // planar reflection. Restores the hidden mesh when toggled off / on unmount.
  useEffect(() => {
    if (!wantMirror) {
      setMirrorPlane(null)
      return
    }
    const plane = detectMirrorPlane(cloned)
    setMirrorPlane(plane)
    if (!plane) return
    const hidden = hideMirrorMesh(cloned, plane)
    return () => {
      for (const m of hidden) m.visible = true
    }
  }, [cloned, wantMirror])

  return (
    <group scale={scale}>
      <primitive object={cloned} dispose={null} />
      {wantMirror && mirrorPlane ? (
        <ReflectorOverlay plane={mirrorPlane} resolution={reflectorCfg.resolution} />
      ) : null}
    </group>
  )
}

/** A flat reflector plane fitted to a detected GLB mirror surface. The plane's
 *  default normal is +Z; rotate so it faces the surface's thin (normal) axis,
 *  and size it to the two large bbox extents. */
function ReflectorOverlay({ plane, resolution }: { plane: MirrorPlane; resolution: number }) {
  const { center, axis, sx, sy, sz } = plane
  // MIRROR-RELEVANCE: a detected GLB mirror pays the same extra-scene-pass cost
  // as a parametric one, so it goes through the same relevance + budget gate.
  // `true` because reaching here already means the tier permits a reflection.
  const { real, attachRef } = useMirrorRelevance(true)
  const rotation: [number, number, number] =
    axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]
  // Plane local X/Y → world extents depend on which axis is the normal.
  const args: [number, number] = axis === 'x' ? [sz, sy] : axis === 'y' ? [sx, sz] : [sx, sy]
  return (
    <mesh position={center} rotation={rotation}>
      <planeGeometry args={args} />
      {real ? (
        <MeshReflectorMaterial
          ref={attachRef}
          resolution={resolution}
          mirror={1}
          blur={[0, 0]}
          mixBlur={0}
          mixStrength={1.1}
          roughness={0}
          metalness={0}
          color="#dfe8ee"
          side={2}
        />
      ) : (
        <MetalMaterial
          ref={attachRef}
          color="#dfe8ee"
          roughness={0.07}
          metalness={0.7}
          envMapIntensity={2.0}
          emissive="#b9c6d0"
          emissiveIntensity={0.16}
          side={2}
        />
      )}
    </mesh>
  )
}
