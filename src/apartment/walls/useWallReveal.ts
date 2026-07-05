import { useFrame } from '@react-three/fiber'
import { type RefObject, useEffect, useRef } from 'react'
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { useStore } from '../../state/store'
import { setWallOpacity } from './wallReveal'
import { nearWallRevealFactor } from './wallRevealMath'

export interface WallRevealArgs {
  /** Wall midpoint (world XZ). */
  midX: number
  midZ: number
  /** Outward wall normal (room centre → wall mid). */
  nx: number
  nz: number
  /** Reference point the reveal fades toward (the isolated room's centre). */
  center: [number, number]
  /** Host wall id — published so the room's windows/doors on it fade too. */
  wallId: string
}

/** Lerp speed toward the target opacity (matches orbit `WallSegment`). */
const LERP = 0.18

/**
 * Per-room-editor wall reveal (ROOM-EDITOR-WALL-REVEAL): fades a clipped wall to
 * **translucent** when the orbit camera fronts it (the wall sits between the
 * camera and the room), exactly like the main orbit scene's `WallSegment` —
 * reusing the same pure `wallRevealFactor` + the `wallRevealMode`/`wallReveal`
 * settings, so the editor behaves like orbit by default (translucent).
 *
 * Applied to an Object3D (the wall mesh or its group). Because every wall of an
 * isolated room shares ONE finish material, fading it in place would fade the
 * whole room; so while a wall is faded we swap each mesh onto a **per-mesh clone**
 * (captured original restored when it returns to opaque), and re-assert the clone
 * each frame so a React re-render can't reset it. Demand-loop friendly: holds
 * frames via `invalidate()` only while the fade is settling.
 */
export function useWallReveal(objRef: RefObject<Object3D | null>, args: WallRevealArgs): void {
  const { midX, midZ, center, wallId } = args
  const opacityRef = useRef(1)
  const transparentRef = useRef(false)
  const clonesRef = useRef<Material[]>([])

  // Clear any stale opacity this wall id carried over from the main orbit scene
  // when the editor opens; restore originals + dispose clones on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on wallId; objRef is a stable ref.
  useEffect(() => {
    setWallOpacity(wallId, 1)
    return () => {
      const root = objRef.current
      root?.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        const orig = m.userData.__revealOrig as Material | Material[] | undefined
        if (orig) {
          m.material = orig
          m.userData.__revealOrig = undefined
          m.userData.__revealMat = undefined
        }
      })
      for (const c of clonesRef.current) c.dispose()
      clonesRef.current = []
    }
  }, [wallId])

  useFrame((state) => {
    const root = objRef.current
    if (!root) return
    const st = useStore.getState()
    const orbit = st.cameraMode === 'orbit'
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const revealMode = st.wallRevealMode ?? 'translucent'
    const cam = state.camera.position
    let target = 1
    if (orbit && revealEnabled && revealMode !== 'opaque') {
      // NEAREST-WALLS reveal (ROOM-EDITOR-FADE): fade the walls closest to the
      // camera (in front of the room centre), keep the far/back walls opaque.
      // Measured by nearness normalised to the ROOM's own size — NOT the camera's
      // fit-distance, which is nearly equal for every wall in a small isolated
      // room and made even the back walls drift translucent + flip on tiny camera
      // moves. See `nearWallRevealFactor`.
      const faded = nearWallRevealFactor(cam.x, cam.z, midX, midZ, center[0], center[1])
      // translucent: never fully disappear (min 0.15); auto-hide: can vanish.
      target = revealMode === 'auto-hide' ? faded : Math.max(0.15, faded)
    }
    // Settled, fully opaque, nothing cloned → the common case, skip.
    if (
      Math.abs(target - opacityRef.current) < 0.004 &&
      target >= 0.999 &&
      !transparentRef.current
    ) {
      return
    }
    const cur = opacityRef.current + (target - opacityRef.current) * LERP
    opacityRef.current = cur
    if (Math.abs(cur - target) > 0.005) state.invalidate()
    setWallOpacity(wallId, cur)
    const visible = cur > 0.02
    const transparent = cur < 0.985
    const changed = transparent !== transparentRef.current
    transparentRef.current = transparent
    root.visible = visible
    root.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || !m.material) return
      if (transparent) {
        let clone = m.userData.__revealMat as Material | Material[] | undefined
        if (!clone) {
          const orig = m.material
          m.userData.__revealOrig = orig
          clone = Array.isArray(orig) ? orig.map((mm) => mm.clone()) : orig.clone()
          m.userData.__revealMat = clone
          for (const c of Array.isArray(clone) ? clone : [clone]) clonesRef.current.push(c)
        }
        // Re-assert against a React re-render that would reset mesh.material.
        if (m.material !== clone) m.material = clone
        for (const c of Array.isArray(clone) ? clone : [clone]) {
          const cm = c as MeshStandardMaterial
          cm.transparent = true
          cm.opacity = cur
          // depthWrite stays ON through the fade (WALL-FADE-DEPTHWRITE, matching
          // WallSegment) — flipping it off popped the wall between solid and
          // see-through at the ~0.985 threshold and made faded walls sort
          // inconsistently against glass/openings (bright bleed). With it on the
          // clone reads as one clean translucent surface and the 0.985 clone swap
          // becomes visually negligible (no dw change across it).
          cm.depthWrite = true
          if (changed) cm.needsUpdate = true
        }
      } else {
        const orig = m.userData.__revealOrig as Material | Material[] | undefined
        if (orig && m.material !== orig) m.material = orig
      }
    })
  })
}
