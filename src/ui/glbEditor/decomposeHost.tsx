/**
 * GLB Asset Designer — offscreen render host for decomposing a PROCEDURAL def
 * into editable parts (Asset Studio Stage 9a). The ~110 builtin primitives are
 * React components with no pure geometry builder, so "Make parts editable" on a
 * procedural def must render the primitive to a three scene graph and read it
 * back. This mirrors the catalog `ThumbnailHost` pattern: a hidden `<Canvas>`
 * mounts the armed primitive, and after a couple of frames the built `<group>` is
 * handed to the pure `decomposeObject` (bake mode) and the pending promise
 * resolves.
 *
 * `requestPrimitiveDecompose(def)` is the imperative entry point the designer
 * context awaits; `DecomposeHost` (mounted once inside the open designer dialog)
 * fulfils it. A watchdog resolves `null` if a primitive never settles, so a
 * decompose can never hang.
 */

import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Group } from 'three'
import { type DecomposeResult, decomposeObject } from '../../furniture/glbEdit/decompose'
import { PRIMITIVE_COMPONENTS } from '../../furniture/primitives'
import { defaultParamProps, type ParametricDef } from '../../furniture/types'

interface PendingRequest {
  def: ParametricDef
  resolve: (result: DecomposeResult | null) => void
}

let pending: PendingRequest | null = null
const listeners = new Set<() => void>()

function notifyPending(): void {
  for (const l of listeners) l()
}

function subscribePending(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function snapshotPending(): PendingRequest | null {
  return pending
}

/** Resolve + clear the active request (stable module fn — no React identity), then
 *  notify so the host unmounts the Canvas. */
function resolveActive(result: DecomposeResult | null): void {
  const p = pending
  pending = null
  p?.resolve(result)
  notifyPending()
}

/**
 * Request an offscreen decompose of a procedural def (Stage 9a). Resolves with the
 * decomposed parts/groups, or `null` if the host isn't mounted / the render never
 * settles. One request at a time — a new request supersedes an unfinished one
 * (resolving it `null`).
 */
export function requestPrimitiveDecompose(def: ParametricDef): Promise<DecomposeResult | null> {
  resolveActive(null)
  return new Promise((resolve) => {
    pending = { def, resolve }
    notifyPending()
  })
}

/** Renders the armed primitive, then reads the built group + decomposes it. */
function DecomposeScene({ req }: { req: PendingRequest }) {
  const groupRef = useRef<Group | null>(null)
  const Component = PRIMITIVE_COMPONENTS[req.def.primitive]
  useEffect(() => {
    let raf2 = 0
    // Two frames so the primitive's children mount + their geometry is built
    // before we read the group (the ThumbnailScene precedent).
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const g = groupRef.current
        if (!g) {
          resolveActive(null)
          return
        }
        try {
          resolveActive(decomposeObject(g, { ref: null }))
        } catch {
          resolveActive(null)
        }
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [])
  if (!Component) return null
  return (
    <group ref={groupRef}>
      <Component props={defaultParamProps(req.def)} />
    </group>
  )
}

/**
 * Hidden offscreen host that fulfils `requestPrimitiveDecompose`. Mount once inside
 * the open designer dialog. A WebGL context is only created while a request is in
 * flight (the Canvas mounts on demand, keyed per request so each renders fresh).
 */
export function DecomposeHost() {
  const req = useSyncExternalStore(subscribePending, snapshotPending, () => null)

  // Watchdog: a primitive that never settles must not hang the decompose. Resolves
  // the active request `null` if it hasn't finished within the budget.
  useEffect(() => {
    if (!req) return
    const timer = setTimeout(() => {
      if (pending?.def.id === req.def.id) resolveActive(null)
    }, 6000)
    return () => clearTimeout(timer)
  }, [req])

  if (!req) return null
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: -9999,
        top: -9999,
        width: 64,
        height: 64,
        pointerEvents: 'none',
      }}
    >
      <Canvas
        key={req.def.id}
        dpr={1}
        frameloop="always"
        gl={{ alpha: true, antialias: false }}
        camera={{ position: [2, 1.6, 2], fov: 30, near: 0.01, far: 100 }}
        style={{ width: 64, height: 64 }}
      >
        <ambientLight intensity={0.8} />
        <DecomposeScene req={req} />
      </Canvas>
    </div>
  )
}
