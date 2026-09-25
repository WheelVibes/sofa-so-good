import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Texture, WebGLRenderer } from 'three'
import { CubeCamera, HalfFloatType, PMREMGenerator, type Scene, WebGLCubeRenderTarget } from 'three'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { subscribeLightmapsApplied } from '../lightmapApplied'
import { useQuality } from '../useQuality'
import { planRoomProbes, probeVramMb, type RoomProbe } from './roomProbe'
import {
  attachRoomProbes,
  detachAllRoomProbes,
  limitProbeRooms,
  selectProbeMeshes,
} from './roomProbeAttach'
import { useSunPosition } from './useSunPosition'

/**
 * Per-room box-projected SPECULAR probes (ROOM-PROBES, R7-L). Renders nothing.
 *
 * ## What it does
 *
 * Captures one small cubemap per room from that room's centroid, PMREM-filters it, and hands it
 * to every glossy surface in that room through `boxProjectEnv.ts`'s injection. Until this
 * existed, the *entire flat* shared one 64-256 px procedural Lightformer studio
 * (`SceneEnvironment.tsx`): a chrome tap in the bathroom and the hob in the kitchen reflected
 * the same imaginary softbox rig. The diffuse half of the light transport has been a Cycles
 * path-trace since `v0.31.7`; this is the specular half.
 *
 * ## Why the probes are captured at RUNTIME rather than baked in Blender
 *
 * The brief for this work assumed a Cycles bake, on the reasonable ground that `python/scripts/
 * blender/bake_material.py` already bakes the lightmaps. Two facts from the code say otherwise:
 *
 * 1. **There is no interior panorama path in the Blender tooling.** `render_equirect.py` is
 *    sky-only and explicitly imports no geometry ("No geometry is imported", its docstring),
 *    with the camera nailed to the world origin. Baking a per-room probe there means writing a
 *    new GLB-importing panorama script — *inventing* a parallel pipeline, which is the thing the
 *    brief asked not to do.
 * 2. **A baked probe would be wrong for most sessions.** This is a configurator. The flat's
 *    finishes are the core loop: the kitchen splashback tile, the bathroom tile and the floor
 *    are all user-chosen (`finishesSlice`), and they are precisely the surfaces a room probe
 *    reflects. A probe baked from the shipped default would reflect the *default* kitchen back
 *    at a user who has just retiled it. The same applies to the hour of day and the weather,
 *    both of which are live controls.
 *
 * The app already has arbitrary-eye cube capture (`scene/panorama/capturePanorama.ts` renders
 * six 90° faces from a given world point for the 360° tour), so a runtime capture is the
 * established pattern here, not a new one. And the cost argument in the research — "static
 * cubemaps cost zero per-frame draws, unlike `CubeCamera`" — is about a `CubeCamera` that
 * updates every frame. This one runs ONCE per room per bake and then never again, so it also
 * costs zero per-frame draws.
 *
 * ## The diffuse-leak guarantee
 *
 * The lightmap already contains the diffuse bounce. `boxProjectEnv.ts` therefore leaves
 * `getIBLIrradiance` byte-identical and leaves `material.envMap` null, so diffuse keeps sampling
 * the global probe and the room probe is reachable only from `getIBLRadiance`. There is no
 * tuning value that can leak it — see that module's docblock.
 *
 * ## Attach timing
 *
 * At the same moment `VisibilityLightmaps` attaches, and for the same reason: adding a sampler
 * compiles a new shader variant per material, and doing that mid-session cost a measured 216 ms
 * frame (`v0.31.7.15`). It additionally waits for the bake to have LANDED
 * (`lightmapApplied.ts`) — a probe captured before the Cycles irradiance is attached records the
 * brighter analytic fill, which is the look the probe exists to replace. If the maps never
 * arrive (flag off, unbaked plan) a grace timer captures anyway, and a later arrival re-captures
 * once.
 */
export function RoomProbes() {
  const flagOn = useFeature('roomProbes')
  const quality = useQuality()
  const tier = useStore((s) => s.qualityTier)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const floorPlan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const weather = useStore((s) => s.weather)
  // The captured room carries the hour's light, so a probe taken at 13:00 and used at 21:00
  // shows a daylit room in a dark one. `scene.environmentIntensity` already dims it (the room
  // probe rides `envMapIntensity` exactly as the global one does), but the CHROMA would be
  // stale, so the capture is redone as the sun moves. Bucketed to whole hours: the hour slider
  // is continuous and a capture per pixel of travel would be absurd.
  const hourBucket = Math.round(useSunPosition().altitude * 8)
  // GATED TO `realistic`, like the baked GI it completes: `roomProbeResolution` is 0 on both
  // `performance` variants, and `ibl: false` on `performance/weak` means there is no
  // `scene.environment`, hence no `USE_ENVMAP`, hence nothing to patch.
  const resolution = quality.roomProbeResolution
  const enabled = flagOn && tier === 'realistic' && quality.ibl && resolution > 0

  // PMREM targets live across renders so a re-capture can dispose the previous set.
  const targetsRef = useRef<Map<string, { texture: Texture; dispose: () => void }>>(new Map())

  // `hourBucket` and `weather` below are deliberate RE-CAPTURE TRIGGERS, not values this body
  // reads — the same device `VisibilityLightmaps` uses for `floorPlan`. A linter cannot see a
  // dependency whose only purpose is invalidation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hourBucket/weather are re-capture keys
  useEffect(() => {
    if (!enabled) {
      // NOT just an early return — materials outlive the effect, and a gate that only works in
      // one direction is not a gate (`detachAllVisibilityLightmaps`'s lesson).
      const removed = detachAllRoomProbes(scene)
      disposeTargets(targetsRef.current)
      if (removed > 0) invalidate()
      return
    }
    let cancelled = false
    let captured = false
    let withLightmaps = false

    const capture = (lightmapsReady: boolean) => {
      if (cancelled) return
      // Two captures at most: one provisional (the maps never arrived in time) and one once
      // they land. A third would be a re-compile for nothing.
      if (captured && (!lightmapsReady || withLightmaps)) return
      captured = true
      withLightmaps = lightmapsReady
      const planned = planRoomProbes(floorPlan, viewLevelId)
      if (planned.length === 0) return
      detachAllRoomProbes(scene)
      disposeTargets(targetsRef.current)
      // SELECT BEFORE CAPTURING. A PMREM target is the expensive part of this feature —
      // 3 x max(N,112) x 4N at RGBA16F, i.e. 6.3 MB per room at 256 px — and a plan has rooms
      // with nothing glossy in them at all (the household shelter, the AC ledge, the service
      // yard). Capturing only the rooms that have a candidate mesh is the difference between
      // paying for the flat and paying for the three rooms that show it.
      const assignments = limitProbeRooms(selectProbeMeshes(scene, planned))
      const needed = new Set(assignments.map((a) => a.probe.roomId))
      const probes = planned.filter((p) => needed.has(p.roomId))
      if (probes.length === 0) return
      const t0 = now()
      targetsRef.current = captureRoomProbes(gl, scene, probes, resolution)
      const tCapture = now() - t0
      const result = attachRoomProbes(assignments, (roomId) => {
        return targetsRef.current.get(roomId)?.texture ?? null
      })
      if (import.meta.env.DEV) {
        console.info(
          `room probes: [${probes.map((p) => p.roomId).join(', ')}] ` +
            `${probes.length}/${planned.length} rooms captured at ${resolution}px in ` +
            `${tCapture.toFixed(1)} ms (${probeVramMb(resolution, probes.length).toFixed(1)} MB) — ` +
            `${result.attached} meshes, ${result.materials} materials (${result.cloned} cloned)` +
            `${lightmapsReady ? '' : ' [provisional: baked GI not attached yet]'}`,
        )
      }
      invalidate()
    }

    const unsubscribe = subscribeLightmapsApplied(() => capture(true))
    // The maps are fetched, so they may never come (flag off, unbaked plan, offline). Capture
    // anyway rather than leaving the feature silently inert — the commonest way a lighting
    // feature "ships" without ever running.
    const grace = setTimeout(() => capture(false), LIGHTMAP_GRACE_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearTimeout(grace)
      detachAllRoomProbes(scene)
      disposeTargets(targetsRef.current)
    }
    // `floorPlan`, `hourBucket` and `weather` are RE-CAPTURE TRIGGERS: the probe is a picture of
    // the room, so it is stale whenever the room's geometry or its light changes.
  }, [enabled, scene, gl, invalidate, floorPlan, viewLevelId, resolution, hourBucket, weather])

  return null
}

/** How long to wait for the Cycles bake before capturing the analytic room instead. */
const LIGHTMAP_GRACE_MS = 2500

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

interface ProbeTarget {
  texture: Texture
  dispose: () => void
}

function disposeTargets(map: Map<string, ProbeTarget>): void {
  for (const t of map.values()) t.dispose()
  map.clear()
}

/**
 * Render one cubemap per room and PMREM-filter it.
 *
 * Rendering to a render target rather than the canvas is what makes the capture usable as a
 * light probe: three applies `renderer.toneMapping` only on the final pass to the default
 * framebuffer, so a cube target receives LINEAR radiance — the same reason `linearView.ts`
 * exists for measurement. A tone-mapped probe would be doubly graded once AgX ran over the
 * frame that samples it.
 */
function captureRoomProbes(
  gl: WebGLRenderer,
  scene: Scene,
  probes: readonly RoomProbe[],
  resolution: number,
): Map<string, ProbeTarget> {
  const out = new Map<string, ProbeTarget>()
  const pmrem = new PMREMGenerator(gl)
  try {
    pmrem.compileCubemapShader()
    for (const probe of probes) {
      const cubeTarget = new WebGLCubeRenderTarget(resolution, { type: HalfFloatType })
      const camera = new CubeCamera(NEAR_M, FAR_M, cubeTarget)
      camera.position.set(probe.center[0], probe.center[1], probe.center[2])
      camera.updateMatrixWorld(true)
      camera.update(gl, scene)
      const rendered = pmrem.fromCubemap(cubeTarget.texture)
      cubeTarget.dispose()
      out.set(probe.roomId, {
        texture: rendered.texture,
        dispose: () => rendered.dispose(),
      })
    }
  } finally {
    pmrem.dispose()
  }
  return out
}

/** 50 mm: a probe sits mid-room, but a 1.7 m bathroom puts a wall 850 mm away and the default
 *  0.1 would clip a skirting the reflection needs. */
const NEAR_M = 0.05
/** Far enough for the estate backdrop through a window, near enough to keep depth precision. */
const FAR_M = 120
