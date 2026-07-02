import { useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Box3, type Object3D, Vector3 } from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { selectGltfRender } from '../../furniture/gltfRender'
import { PRIMITIVE_COMPONENTS } from '../../furniture/primitives'
import {
  defaultParamProps,
  type FurnitureDef,
  type FurnitureItem,
  type GltfDef,
} from '../../furniture/types'

/** Resolve the url + scale to render a GLB def's thumbnail, or null if the def
 *  carries its own image (IKEA photo / pack thumbnail) or has no resolvable url
 *  yet (e.g. an un-hydrated user upload). */
function gltfThumbSource(def: FurnitureDef): { url: string; scale: number } | null {
  if (def.kind !== 'gltf') return null
  if (def.source === 'ikea') return null // uses the scraped product photo
  if (def.source === 'pack' && def.thumbUrl) return null // captured at install
  const probe = { id: '', defId: def.id, position: [0, 0], rotation: 0, props: {} } as FurnitureItem
  const r = selectGltfRender(probe, def as GltfDef)
  return r ? { url: r.url, scale: r.scale } : null
}

const THUMB_W = 256
const THUMB_H = 192

const cache = new Map<string, string>()
const queued = new Set<string>()
const queue: FurnitureDef[] = []
const subscribers = new Set<() => void>()

function notify() {
  for (const fn of subscribers) fn()
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/** Enqueue a thumbnail render for `def`. No-ops if cached or already queued.
 *  Parametric primitives render their component; GLB user uploads + bundled
 *  GLBs render the loaded model. IKEA (photo) / pack (install thumb) defs carry
 *  their own image and are skipped. */
export function requestThumbnail(def: FurnitureDef) {
  if (def.kind === 'gltf' && !gltfThumbSource(def)) return
  if (def.kind !== 'parametric' && def.kind !== 'gltf') return
  if (cache.has(def.id) || queued.has(def.id)) return
  queued.add(def.id)
  queue.push(def)
  notify()
}

/** Subscribe to the cache + queue change stream. Used by the host. */
function useTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [])
  return tick
}

/** Returns a thumbnail URL for `def`, or null while pending.
 *  - Pack-installed GLBs already carry a JPEG thumbnail captured at
 *    install time; we surface it directly.
 *  - Parametric primitives are rendered on demand via the off-screen
 *    Canvas host. */
export function useBuiltinThumbnail(def: FurnitureDef): string | null {
  useEffect(() => {
    requestThumbnail(def)
  }, [def])
  const rendered = useSyncExternalStore(
    subscribe,
    () => cache.get(def.id) ?? null,
    () => null,
  )
  if (def.kind === 'gltf' && def.source === 'ikea') {
    const active = def.variants.find((v) => v.finish === def.activeVariant)
    if (active?.runtimeImageUrl) return active.runtimeImageUrl
  }
  if (def.kind === 'gltf' && def.source === 'pack' && def.thumbUrl) {
    return def.thumbUrl
  }
  return rendered
}

/** True when `def` will eventually produce a *rendered* builtin thumbnail
 *  (parametric primitives, or a GLB with a resolvable render source) — the
 *  P17 "genuinely loading" signal for the `.skeleton` fill. False for defs
 *  that carry their own synchronous image (IKEA product photo / pack install
 *  thumbnail) or have no resolvable source: those never enqueue a render, so
 *  a permanent `CategoryIcon` is correct and a skeleton would shimmer forever. */
export function expectsBuiltinThumbnail(def: FurnitureDef): boolean {
  if (def.kind === 'parametric') return true
  if (def.kind === 'gltf') return gltfThumbSource(def) !== null
  return false
}

interface SceneProps {
  active: FurnitureDef | null
  onReady: (id: string, dataUrl: string) => void
}

const THUMB_LIGHTS = (
  <>
    <hemisphereLight args={['#ffffff', '#888888', 0.9]} />
    <directionalLight position={[3, 5, 4]} intensity={0.9} />
    <ambientLight intensity={0.25} />
  </>
)

function ThumbnailScene({ active, onReady }: SceneProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  // Parametric: render the primitive synchronously, capture on the next frame.
  useEffect(() => {
    if (active?.kind !== 'parametric') return
    const cam = cameraForDef(active)
    camera.position.set(...cam.position)
    camera.lookAt(...cam.target)
    if ('updateProjectionMatrix' in camera) camera.updateProjectionMatrix()

    const id = requestAnimationFrame(() => {
      gl.render(scene, camera)
      const url = gl.domElement.toDataURL('image/png')
      onReady(active.id, url)
    })
    return () => cancelAnimationFrame(id)
  }, [active, gl, scene, camera, onReady])

  if (active?.kind === 'parametric') {
    const Component = PRIMITIVE_COMPONENTS[active.primitive]
    const props = defaultParamProps(active)
    return (
      <>
        {THUMB_LIGHTS}
        <group>
          <Component props={props} />
        </group>
      </>
    )
  }

  if (active?.kind === 'gltf') {
    const src = gltfThumbSource(active)
    if (!src) return null
    return (
      <>
        {THUMB_LIGHTS}
        <Suspense fallback={null}>
          <GltfThumbnailCapture id={active.id} url={src.url} scale={src.scale} onReady={onReady} />
        </Suspense>
      </>
    )
  }
  return null
}

/** Loads a GLB (suspends until ready), frames the camera to its bounding box,
 *  then captures the canvas — so a user-uploaded / bundled GLB gets a rendered
 *  catalog thumbnail instead of a name-only card. */
function GltfThumbnailCapture({
  id,
  url,
  scale,
  onReady,
}: {
  id: string
  url: string
  scale: number
  onReady: (id: string, dataUrl: string) => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const gltf = useGLTF(url)
  const obj = useMemo(() => SkeletonUtils.clone(gltf.scene as unknown as Object3D), [gltf.scene])

  useEffect(() => {
    obj.updateWorldMatrix(true, true)
    const box = new Box3().setFromObject(obj)
    if (box.isEmpty()) {
      onReady(id, gl.domElement.toDataURL('image/png'))
      return
    }
    const size = new Vector3()
    const center = new Vector3()
    box.getSize(size).multiplyScalar(scale)
    box.getCenter(center).multiplyScalar(scale)
    const radius = Math.max(size.x, size.y, size.z) * 0.6 || 1
    const dist = radius * 2.6
    camera.position.set(center.x + dist * 0.75, center.y + radius * 0.9, center.z + dist * 0.95)
    camera.lookAt(center)
    if ('updateProjectionMatrix' in camera) camera.updateProjectionMatrix()
    // Two frames so textures/Draco geometry settle before the readback.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        gl.render(scene, camera)
        onReady(id, gl.domElement.toDataURL('image/png'))
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [obj, scale, id, gl, scene, camera, onReady])

  return <primitive object={obj} scale={scale} />
}

function cameraForDef(def: FurnitureDef): {
  position: [number, number, number]
  target: [number, number, number]
} {
  if (def.kind !== 'parametric') {
    return { position: [2, 1.6, 2], target: [0, 0.5, 0] }
  }
  const { w, d, h } = def.defaultFootprint
  // Mounted/elevated items (wall aircon, ceiling lights, wall TV, mirror…)
  // render their geometry high in Y, so frame around the vertical span centre
  // rather than assuming the piece sits on the floor at the origin.
  const span = def.verticalSpan
  const centerY = span ? (span.base + span.top) / 2 : h * 0.5
  const vExtent = span ? span.top - span.base : h
  const radius = Math.max(w, d, vExtent) * 0.85 || 1
  const distance = radius * 2.4
  return {
    position: [distance * 0.75, centerY + radius * 0.9, distance * 0.95],
    target: [0, centerY, 0],
  }
}

/** Hidden host: drives the queue using a single persistent off-screen
 *  Canvas (one WebGL context for its lifetime). Children swap as the
 *  queue advances; the context is never recreated. Mount once inside
 *  the catalog drawer so the context only exists while needed. */
export function ThumbnailHost() {
  const tick = useTick()
  const [active, setActive] = useState<FurnitureDef | null>(null)

  useEffect(() => {
    // `tick` bumps whenever the queue changes — reading it here makes this
    // effect re-run so a newly-enqueued def is picked up while the host is idle.
    void tick
    if (active) return
    const next = queue.shift()
    if (next) setActive(next)
  }, [active, tick])

  // Stable identity: ThumbnailScene's capture effect lists `onReady` in its deps,
  // so a fresh function each render would re-run that effect and cancel the
  // pending requestAnimationFrame before it captures — starving items behind the
  // active one in the single-Canvas queue (the "wardrobe has no thumbnail" bug,
  // where a notify storm kept re-creating this callback). Only module-level
  // state + the stable `setActive` are used, so an empty dep list is correct.
  const handleReady = useCallback((id: string, url: string) => {
    cache.set(id, url)
    queued.delete(id)
    setActive(null)
    notify()
  }, [])

  // Watchdog: the host renders ONE def at a time, so a single def that never
  // calls `onReady` — a remote GLB whose fetch hangs/404s under `<Suspense>`,
  // or any stalled capture — would block EVERY queued def behind it (the
  // "wardrobe / later items have no thumbnail" bug: an earlier stuck item starves
  // the rest). If the active def hasn't completed within the budget, drop it and
  // advance so the rest of the queue still renders. The skipped def just falls
  // back to its category icon.
  useEffect(() => {
    if (!active) return
    const stuckId = active.id
    const timer = setTimeout(() => {
      queued.delete(stuckId)
      setActive((cur) => (cur?.id === stuckId ? null : cur))
      notify()
    }, 8000)
    return () => clearTimeout(timer)
  }, [active])

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: -9999,
        top: -9999,
        width: THUMB_W,
        height: THUMB_H,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        dpr={1}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [2, 1.6, 2], fov: 30, near: 0.01, far: 100 }}
        style={{ width: THUMB_W, height: THUMB_H, background: 'transparent' }}
      >
        <ThumbnailScene active={active} onReady={handleReady} />
      </Canvas>
    </div>
  )
}
