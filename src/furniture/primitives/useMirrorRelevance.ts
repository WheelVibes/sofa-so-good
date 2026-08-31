import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react'
import type { Material, Mesh, PerspectiveCamera } from 'three'
import { Sphere, Vector3 } from 'three'
import { isCameraGestureActive } from '../../scene/cameraMotionSignal'
import { MIRROR_REAL_BUDGET, mirrorScreenFraction, rankRealMirrors } from '../mirrorRelevance'

/**
 * Live gate for a real planar reflection (MIRROR-RELEVANCE). Returns whether
 * THIS pane should render drei's `<MeshReflectorMaterial>` (an entire extra
 * scene pass — see `mirrorRelevance.ts` for the measurements) or the tier-cheap
 * fake-shiny fallback.
 *
 * Four things keep this cheap, stable and correct:
 *
 *  - **One authority, not N independent votes.** Each pane publishes its screen
 *    fraction to the module-level registry below; the registry resolves
 *    hysteresis AND the budget over the whole set at once and notifies every
 *    pane. Letting each pane decide for itself looks like it works and quietly
 *    doesn't: a pane can't see that a bigger mirror already claimed the budget,
 *    so two bathroom mirrors both rendered a full extra scene pass (caught by
 *    `scripts/dev-probes/mirror-gate.mjs`). This is the same module-signal +
 *    `useSyncExternalStore` shape the scene layer already uses for cross-tree
 *    per-frame state.
 *  - **Throttled, not per-frame.** Re-published only when the camera has moved
 *    past `CAMERA_MOVE_EPS_SQ` — the trick the retired `lighting/chooseEmitters.ts` used
 *    to keep the fixture-light budget off the per-frame path. A parked camera
 *    costs one squared-distance compare per frame.
 *  - **Never flips mid-gesture.** Each flip swaps the material, which means a
 *    shader recompile; doing that while the user is dragging the camera would
 *    hitch in exactly the moment frames are most expensive. The decision is
 *    deferred until the gesture releases (mirroring `InteractiveDprController`'s
 *    "shed cost while the camera is driven").
 *  - **Starts cheap.** Nothing is granted until the first evaluation, so first
 *    paint never pays for a reflection nobody has looked at yet.
 *
 * Size comes from the parent mesh's own bounding sphere rather than from props,
 * so it works for every caller (`Mirror`, `WallMirror`, `FloorMirror`,
 * `Wardrobe`, and `GltfModel`'s detected-GLB overlay) and follows a user-resized
 * item for free.
 */

/**
 * The mesh a material is attached to.
 *
 * `THREE.Material` has no `parent` in the type definitions (only `Object3D`
 * does), but r3f's `attach: "material"` reconciler sets one at runtime and also
 * records the owner on the internal `__r3f` handle. drei's own
 * `MeshReflectorMaterial` reads exactly this pair to find the plane it is
 * reflecting, so following it keeps us consistent with the library rather than
 * inventing a second convention. Both are probed because which one is populated
 * depends on the r3f version.
 */
function parentMeshOf(material: Material | null): Mesh | undefined {
  if (!material) return undefined
  const m = material as unknown as { parent?: unknown; __r3f?: { parent?: { object?: unknown } } }
  const direct = m.parent
  if (direct && (direct as Mesh).isMesh) return direct as Mesh
  const viaR3f = m.__r3f?.parent?.object
  if (viaR3f && (viaR3f as Mesh).isMesh) return viaR3f as Mesh
  return undefined
}

/** Squared metres of camera movement before the gate is re-evaluated. */
const CAMERA_MOVE_EPS_SQ = 0.25 * 0.25

// --- Shared registry -------------------------------------------------------
// Module-level so the budget is global across every mirror in the scene; a
// single hook instance can only ever see itself.

const fractions = new Map<string, number>()
const listeners = new Set<() => void>()
/** Ids currently granted a real reflection. Referentially stable while
 *  unchanged, so `useSyncExternalStore` doesn't re-render on every publish. */
let granted: readonly string[] = []

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Recompute the grant set from all published fractions; notify only on change. */
function republish(): void {
  const next = rankRealMirrors(
    [...fractions].map(([id, screenFraction]) => ({ id, screenFraction })),
    granted,
    MIRROR_REAL_BUDGET,
  )
  if (next.length === granted.length && next.every((id, i) => id === granted[i])) return
  granted = next
  for (const fn of listeners) fn()
}

export function useMirrorRelevance(tierAllowsReal: boolean): {
  real: boolean
  attachRef: (m: Material | null) => void
} {
  const id = useId()
  const camera = useThree((s) => s.camera)
  const matRef = useRef<Material | null>(null)
  const lastCamPos = useRef(new Vector3(Number.NaN, Number.NaN, Number.NaN))
  const sphere = useRef(new Sphere())

  const isGranted = useSyncExternalStore(
    subscribe,
    () => granted.includes(id),
    () => false,
  )

  // Stop competing for the budget when this pane unmounts, or the last mirror in
  // a deleted room would keep its slot forever.
  useEffect(
    () => () => {
      fractions.delete(id)
      republish()
    },
    [id],
  )

  const attachRef = useCallback((m: Material | null) => {
    matRef.current = m
  }, [])

  useFrame(() => {
    if (!tierAllowsReal) return
    // A material swap mid-drag is a shader recompile — wait for the release.
    if (isCameraGestureActive()) return
    const cam = camera as PerspectiveCamera
    if (lastCamPos.current.distanceToSquared(cam.position) < CAMERA_MOVE_EPS_SQ) return
    lastCamPos.current.copy(cam.position)

    const mesh = parentMeshOf(matRef.current)
    const geom = mesh?.geometry
    if (!mesh || !geom) return
    if (!geom.boundingSphere) geom.computeBoundingSphere()
    const bs = geom.boundingSphere
    if (!bs) return

    // World-space centre + radius (the pane may sit under an item's
    // `props.scale` group, so take the scale from the world matrix).
    const world = sphere.current.set(bs.center, bs.radius).applyMatrix4(mesh.matrixWorld)
    const fraction = mirrorScreenFraction(
      world.radius * 2,
      cam.position.distanceTo(world.center),
      cam.fov ?? 50,
    )
    fractions.set(id, fraction)
    republish()
  })

  return { real: tierAllowsReal && isGranted, attachRef }
}
