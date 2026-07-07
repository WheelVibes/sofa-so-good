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
  // Hysteresis latch for the binary fade decision (see the target block below).
  const wasFadedRef = useRef(false)
  // Per-mesh fade bookkeeping (captured opaque original + its faded clone), keyed
  // by the mesh itself. MUST live here, NOT in `mesh.userData`
  // (WALL-REVEAL-STATE-OFF-USERDATA): `RoomShell`/`PlanRoomShell` pass a FRESH
  // `userData` object (`finishSurfaceUserData(...)`) and a fresh `material` array on
  // every render, so R3F reconciliation wipes any `userData` we stash — which
  // previously desynced the clone tracking mid-fade and stranded a wall at a
  // half-faded opacity (the "washed back wall" that never recovered, since the hook
  // then re-captured a stale clone as the "original" and restored TO it). A
  // hook-owned WeakMap is immune to prop reconciliation; entries GC with the mesh.
  const fadeStateRef = useRef(
    new WeakMap<Object3D, { orig: Material | Material[]; clone: Material | Material[] }>(),
  )

  // Clear any stale opacity this wall id carried over from the main orbit scene
  // when the editor opens; restore originals + dispose clones on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on wallId; objRef is a stable ref.
  useEffect(() => {
    setWallOpacity(wallId, 1)
    const fadeState = fadeStateRef.current
    return () => {
      const root = objRef.current
      root?.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        const entry = fadeState.get(o)
        if (entry) {
          m.material = entry.orig
          fadeState.delete(o)
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
      const facing = wallRevealFacing(FWD.x, FWD.z, nx, nz)
      // BINARY target with hysteresis (WALL-REVEAL-BINARY-TARGET). `wallRevealFacing`
      // is a smoothstep, so a wall viewed at a grazing/oblique angle would otherwise
      // REST at a mid-band opacity (~0.6–0.8) — which renders as a permanently
      // "washed"/half-translucent pane in the editor (the field bug: a wall settles
      // at its true 0.79 target and just looks broken). The dollhouse wants each wall
      // either clearly see-through OR solid, never parked half-way. So the TARGET is
      // binary — the smooth `LERP` below still animates the transition, so a wall
      // fades/solidifies smoothly as you swivel, but always SETTLES crisp. Hysteresis
      // (start fading below 0.35, stop fading above 0.65) gives a dead-band so a wall
      // hovering near the threshold can't flip-flop.
      const shouldFade = wasFadedRef.current ? facing < 0.65 : facing < 0.35
      wasFadedRef.current = shouldFade
      // translucent: never fully disappear (strongly see-through floor);
      // auto-hide: can vanish.
      target = shouldFade ? (revealMode === 'auto-hide' ? 0 : WALL_TRANSLUCENT_MIN) : 1
    } else {
      wasFadedRef.current = false
    }
    // Keep the demand-mode RenderPump rendering WHILE the fade is lerping toward its
    // (now always-crisp) target. This Canvas is `frameloop="demand"` and gates
    // rendering through RenderPump, which stays continuous only while an animated
    // source is registered — R3F's native `invalidate()` (below) does NOT sustain it.
    // Without this the fade starved after the ~300ms settle tail on a static camera
    // and froze part-way. Registered like a spinning fan / placement drop, released
    // the instant it settles. (The target is binary now, so "settled" is always a
    // crisp endpoint — no mid-band parking to guard against.)
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
    // Snap onto the target once within the settle threshold so a wall lands on
    // EXACT endpoints (1 / the floor) instead of parking asymptotically short
    // (0.996 / 0.103 — harmless but noisy in every field probe).
    let cur = opacityRef.current + (target - opacityRef.current) * LERP
    if (Math.abs(cur - target) <= 0.005) cur = target
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
        let entry = fadeStateRef.current.get(m)
        if (!entry) {
          const orig = m.material
          const clone = Array.isArray(orig) ? orig.map((mm) => mm.clone()) : orig.clone()
          entry = { orig, clone }
          fadeStateRef.current.set(m, entry)
          for (const c of Array.isArray(clone) ? clone : [clone]) clonesRef.current.push(c)
        }
        const clone = entry.clone
        // Re-assert against a React re-render that would reset mesh.material back to
        // the (opaque) original array/instance — the WeakMap entry survives the
        // re-render, so this always restores THIS wall's faded clone.
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
        const entry = fadeStateRef.current.get(m)
        if (entry && m.material !== entry.orig) m.material = entry.orig
      }
    })
  })
}
