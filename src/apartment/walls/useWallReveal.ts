import { useFrame } from '@react-three/fiber'
import { type RefObject, useEffect, useRef } from 'react'
import { type Material, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import { registerAnimatedSource } from '../../scene/animatedSources'
import { useStore } from '../../state/store'
import { setWallOpacity } from './wallReveal'
import { WALL_TRANSLUCENT_MIN, wallRevealFacing } from './wallRevealMath'

// Scratch vector for the camera forward direction (avoids per-frame allocation).
const FWD = new Vector3()

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
  /** A small per-wall depth bias (polygonOffsetUnits) applied to the faded clone
   *  so two DIFFERENT translucent walls that OVERLAP at a corner (each extended by
   *  the abutment to close it) don't z-fight on their now-coplanar top/side faces.
   *  Distinct per wall ⇒ a deterministic winner ⇒ a stable, seamless corner
   *  instead of a flickering one. Unused (0) leaves depth unbiased. */
  bias?: number
}

/** Lerp speed toward the target opacity (matches orbit `WallSegment`). */
const LERP = 0.18

/**
 * Per-room-editor wall reveal (ROOM-EDITOR-WALL-REVEAL): fades a clipped wall to
 * **translucent** when the orbit camera looks THROUGH it (its outward normal
 * opposes the camera forward), exactly like the main orbit scene's `WallSegment`
 * — reusing the same pure `wallRevealFacing` + the `wallRevealMode`/`wallReveal`
 * settings, so the editor behaves like orbit by default (translucent). The fade
 * is orientation-only (camera look direction), so zoom/pan never change it.
 *
 * Applied to an Object3D (the wall mesh or its group). Because every wall of an
 * isolated room shares ONE finish material, fading it in place would fade the
 * whole room; so while a wall is faded we swap each mesh onto a **per-mesh clone**
 * (captured original restored when it returns to opaque), and re-assert the clone
 * each frame so a React re-render can't reset it. Demand-loop friendly: registers
 * a RenderPump animated source only while the fade is settling (see below), so the
 * fade runs to completion instead of starving after the settle tail.
 */
export function useWallReveal(objRef: RefObject<Object3D | null>, args: WallRevealArgs): void {
  const { nx, nz, wallId, bias = 0 } = args
  const opacityRef = useRef(1)
  const transparentRef = useRef(false)
  const clonesRef = useRef<Material[]>([])
  // Handle for the RenderPump "animated source" registration held WHILE the fade
  // is lerping (see the note at the settling check below). Released the instant
  // the fade settles, and on unmount.
  const pumpReleaseRef = useRef<null | (() => void)>(null)

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
      pumpReleaseRef.current?.()
      pumpReleaseRef.current = null
    }
  }, [wallId])

  useFrame((state) => {
    const root = objRef.current
    if (!root) return
    const st = useStore.getState()
    const orbit = st.cameraMode === 'orbit'
    const revealEnabled = st.qualityOverrides.wallReveal ?? true
    const revealMode = st.wallRevealMode ?? 'translucent'
    let target = 1
    if (orbit && revealEnabled && revealMode !== 'opaque') {
      // The editor isolates ONE room, so EVERY wall is treated as an exterior
      // (perimeter) wall of that room (WALL-REVEAL-EXTERIOR): fade only the walls
      // the camera looks THROUGH (outward normal opposes the camera forward) and
      // keep the far/back walls fully opaque — back walls never fade. Orientation-
      // only (camera look direction), so zoom/pan never change the fade; swivelling
      // flips which walls are "near", so the faded pair follows the camera.
      state.camera.getWorldDirection(FWD)
      const faded = wallRevealFacing(FWD.x, FWD.z, nx, nz)
      // translucent: never fully disappear (strongly see-through floor);
      // auto-hide: can vanish.
      target = revealMode === 'auto-hide' ? faded : Math.max(WALL_TRANSLUCENT_MIN, faded)
    }
    // Keep the demand-mode RenderPump rendering WHILE the fade is lerping. This
    // Canvas is `frameloop="demand"` and gates rendering through RenderPump, which
    // only stays continuous while an animated source is registered — R3F's native
    // `invalidate()` (called below) does NOT sustain it. Without this the fade
    // starved after the ~300ms settle tail on a static camera (entering the editor),
    // freezing a front wall PART-WAY (~0.6–0.84) as a washed, emissive-lifted
    // translucent pane instead of reaching its target — the "super-white slightly
    // translucent wall" bug. Registered exactly like a spinning fan / placement drop
    // and released the instant it settles (and on unmount).
    const settling = Math.abs(target - opacityRef.current) > 0.005
    if (settling && !pumpReleaseRef.current) pumpReleaseRef.current = registerAnimatedSource()
    else if (!settling && pumpReleaseRef.current) {
      pumpReleaseRef.current()
      pumpReleaseRef.current = null
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
          // Per-wall depth bias so overlapping translucent corner walls resolve
          // to a deterministic winner instead of z-fighting (see `bias`).
          if (bias) {
            cm.polygonOffset = true
            cm.polygonOffsetFactor = 0
            cm.polygonOffsetUnits = bias
          }
          // depthWrite stays ON through the fade (WALL-FADE-DEPTHWRITE, matching
          // WallSegment) — flipping it off popped the wall between solid and
          // see-through at the ~0.985 threshold and made faded walls sort
          // inconsistently against glass/openings (bright bleed). With it on the
          // clone reads as one clean translucent surface and the 0.985 clone swap
          // becomes visually negligible (no dw change across it).
          cm.depthWrite = true
          // NO reveal-through-tint lift in the room editor (WALL-REVEAL-EDITOR-NOTINT).
          // Orbit's `WallSegment` lifts a faded pane toward a light neutral to stop its
          // dark unlit exterior side from casting a murky veil when seen over the *dark*
          // outdoors/sky. The room editor deliberately uses a flat, LIGHT backdrop
          // (`#e6eaef`, RoomEditorScene) — there is no dark scene to compensate for, so
          // that same lift instead glared as a bright "whitewash" on exactly the two
          // camera-facing walls (they fade; the far two stay opaque). Keep the faded
          // pane's own material emissive (black for plaster) so it reads as clean glass
          // you see the room through, not a frosted-white panel.
          cm.emissive.setRGB(0, 0, 0)
          cm.emissiveIntensity = 1
          if (changed) cm.needsUpdate = true
        }
      } else {
        const orig = m.userData.__revealOrig as Material | Material[] | undefined
        if (orig && m.material !== orig) m.material = orig
      }
    })
  })
}
