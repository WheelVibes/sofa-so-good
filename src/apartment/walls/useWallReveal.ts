import { useFrame } from '@react-three/fiber'
import { type RefObject, useEffect, useRef } from 'react'
import { type Material, type Mesh, type MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import { registerAnimatedSource } from '../../scene/animatedSources'
import { useStore } from '../../state/store'
import { getWallOwnStrength, isWallOverlay, setWallOpacity, setWallOwnStrength } from './wallReveal'
import {
  cornerSpreadStrength,
  DEFAULT_WALL_REVEAL_STRENGTH,
  facingToward,
  revealStrength,
  revealTargetOpacityForFade,
  SPREAD_ONSET,
} from './wallRevealMath'

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
  /** Ids of the room's walls sharing a CORNER (endpoint) with this one, for the
   *  corner-spread rule (WALL-REVEAL-CORNER-SPREAD) — precompute per shell via
   *  `cornerNeighbors`. Omit to disable spread for this wall. */
  cornerWallIds?: readonly string[]
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
 * — reusing the same pure angle-graded curve (`facingToward`/`revealStrength`) +
 * the `wallRevealStrength`/`wallReveal` settings, so the editor behaves like orbit
 * by default. The fade is orientation-only (camera look direction), so zoom/pan
 * never change it.
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
  const { nx, nz, wallId, cornerWallIds, bias = 0 } = args
  const opacityRef = useRef(1)
  const transparentRef = useRef(false)
  const clonesRef = useRef<Material[]>([])
  // Handle for the RenderPump "animated source" registration held WHILE the fade
  // is lerping (see the note at the settling check below). Released the instant
  // the fade settles, and on unmount.
  const pumpReleaseRef = useRef<null | (() => void)>(null)
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
    setWallOwnStrength(wallId, 0)
    const fadeState = fadeStateRef.current
    return () => {
      setWallOwnStrength(wallId, 0)
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
    const fade = st.wallRevealStrength ?? DEFAULT_WALL_REVEAL_STRENGTH
    let target = 1
    if (orbit && revealEnabled && fade > 0) {
      // The editor isolates ONE room, so EVERY wall is treated as an exterior
      // (perimeter) wall of that room (WALL-REVEAL-EXTERIOR): fade only the walls
      // the camera looks THROUGH (outward normal opposes the camera forward) and
      // keep the far/back walls fully opaque — back walls never fade. Orientation-
      // only (camera look direction), so zoom/pan never change the fade; swivelling
      // flips which walls are "near", so the faded pair follows the camera.
      state.camera.getWorldDirection(FWD)
      // ANGLE-GRADED target (WALL-REVEAL-ANGLE-GRADED, matching orbit's
      // `WallSegment` — this deliberately REVERSES the retired
      // WALL-REVEAL-BINARY-TARGET + hysteresis). Fade strength ramps with how much
      // the wall's OUTWARD surface faces the camera (onset at a slight angle,
      // peak head-on) and the wall SETTLES anywhere along that curve. The binary
      // snap guarded against walls resting washed mid-band, but the walls that must
      // never rest mid-band are the FAR/back ones — excluded structurally here
      // (their `facingToward` ≤ 0 → strength exactly 0 → opaque); the NEAR pair is
      // the intended graded surface and may rest at any partial translucency.
      const toward = facingToward(FWD.x, FWD.z, nx, nz)
      const own = revealStrength(toward)
      // Publish OWN-facing strength (never the spread-inclusive final) so corner-
      // spread stays first-degree — no cascade around the room's perimeter.
      setWallOwnStrength(wallId, own)
      // Corner spread (WALL-REVEAL-CORNER-SPREAD): a wall sharing a corner with a
      // wall meaningfully fading by its OWN facing fades too — graded by its own
      // facing on the spread curve, smoothly gated on the strongest neighbour's
      // own strength. One-frame-lagged reads are fine.
      let strength = own
      if (cornerWallIds && cornerWallIds.length > 0 && toward > SPREAD_ONSET) {
        let maxNb = 0
        for (const id of cornerWallIds) {
          const s = getWallOwnStrength(id)
          if (s > maxNb) maxNb = s
        }
        strength = Math.max(strength, cornerSpreadStrength(toward, maxNb))
      }
      // Graded fade to the peak floor set by the "Wall fade" strength
      // (WALL-REVEAL-STRENGTH): head-on opacity floor is `1 − fade`.
      target = revealTargetOpacityForFade(fade, strength)
    } else {
      setWallOwnStrength(wallId, 0)
    }
    // Keep the demand-mode RenderPump rendering WHILE the fade is lerping toward
    // its target. This Canvas is `frameloop="demand"` and gates rendering through
    // RenderPump, which stays continuous only while an animated source is
    // registered — R3F's native `invalidate()` (below) does NOT sustain it.
    // Without this the fade starved after the ~300ms settle tail on a static camera
    // and froze part-way. Registered like a spinning fan / placement drop, released
    // the instant it settles.
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
    // Snap onto the target once within the settle threshold so a wall lands
    // EXACTLY on its (graded) target instead of parking asymptotically short
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
      // Overlays on the wall body (face planes, trim, highlights) are hidden for
      // the duration of the fade — each one is a second layer composited over
      // the body, which reads as a density band down the wall and a denser
      // stripe at every corner. See `markWallOverlay`.
      if (isWallOverlay(m.userData)) {
        m.visible = visible && !transparent
        if (transparent) return
      }
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
