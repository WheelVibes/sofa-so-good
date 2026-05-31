import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { PRIMITIVE_COMPONENTS } from '../../furniture/primitives'
import { defaultParamProps, type FurnitureDef } from '../../furniture/types'

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
 *  Only parametric defs are supported here — GLB defs already ship with
 *  pack-side thumbnails via a separate path. */
export function requestThumbnail(def: FurnitureDef) {
  if (def.kind !== 'parametric') return
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
    if (def.kind === 'parametric') requestThumbnail(def)
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

interface SceneProps {
  active: FurnitureDef | null
  onReady: (id: string, dataUrl: string) => void
}

function ThumbnailScene({ active, onReady }: SceneProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

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

  if (active?.kind !== 'parametric') return null
  const Component = PRIMITIVE_COMPONENTS[active.primitive]
  const props = defaultParamProps(active)
  return (
    <>
      <hemisphereLight args={['#ffffff', '#888888', 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={0.9} />
      <ambientLight intensity={0.25} />
      <group>
        <Component props={props} />
      </group>
    </>
  )
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
    if (active) return
    const next = queue.shift()
    if (next) setActive(next)
  }, [active, tick])

  const handleReady = (id: string, url: string) => {
    cache.set(id, url)
    queued.delete(id)
    setActive(null)
    notify()
  }

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
