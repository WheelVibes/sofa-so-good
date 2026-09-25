import { useThree } from '@react-three/fiber'
import { useDeferredValue, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Texture, WebGLRenderer } from 'three'
import { CubeCamera, HalfFloatType, PMREMGenerator, type Scene, WebGLCubeRenderTarget } from 'three'
import { useFeature } from '../../features/useFeature'
import {
  getProceduralBaseSizeVersion,
  subscribeProceduralBaseSize,
} from '../../materials/proceduralBaseSizeSignal'
import { useStore } from '../../state/store'
import { createSettleEmitter, type ThrottledEmitter } from '../../ui/controls/throttledEmitter'
import { lightmapGeneration, subscribeLightmapsApplied } from '../lightmapApplied'
import { useQuality } from '../useQuality'
import { planRoomProbes, probeVramMb, type RoomProbe } from './roomProbe'
import {
  attachRoomProbes,
  detachAllRoomProbes,
  limitProbeRooms,
  rankProbeRooms,
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
 *
 * ## The probe follows the MATERIAL SET, not just the light (R7-N)
 *
 * The patch lives on a `MeshStandardMaterial`, and this app replaces the material instance a mesh
 * holds far more often than it looks. Two producers, both invisible from here:
 *
 * 1. **A tier change rebuilds the procedural cache.** `QualityController` writes
 *    `setProceduralBaseSize(tier === 'performance' ? 256 : 512)` from an effect, every
 *    `useProceduralMaterial` surface re-resolves at the new cache key, and each one mounts a
 *    DIFFERENT material. A `performance` -> `realistic` promotion therefore attached the probe to
 *    one generation of materials and left it there while the meshes moved to another.
 * 2. **A finish change swaps a room's walls/floor/ceiling** for whatever the new id resolves to.
 *    Re-tiling the kitchen is exactly the case the probe exists for, and it used not to re-capture
 *    until the hour moved.
 *
 * Both are covered by the two extra deps below, and both use the ordering inversion
 * `proceduralBaseSizeSignal.ts` documents: subscribe to the thing that is written LAST, so the
 * notification cannot arrive before the new value is readable. `useDeferredValue` on the finishes
 * is FINISH-DEFER for the same reason — a photo finish suspends, so an eager re-capture would
 * photograph the OLD tile.
 *
 * ## Captures are COALESCED (R7-N)
 *
 * A capture is 130-180 ms, and the hour is a free-scrub slider: dragging it through several whole
 * sun buckets paid that per bucket. Requests go through `createSettleEmitter`, the leading-edge
 * debounce in `ui/controls/throttledEmitter.ts` — a deliberate single change still applies
 * instantly, and a drag pays once at the start and once when it stops.
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
  // MATERIAL-SET DEPS (R7-N) — see the docblock. Neither is a value this body reads; both are
  // invalidation keys for "the meshes are holding different materials than the ones we patched".
  const baseSizeVersion = useSyncExternalStore(
    subscribeProceduralBaseSize,
    getProceduralBaseSizeVersion,
    getProceduralBaseSizeVersion,
  )
  const finishes = useDeferredValue(useStore((s) => s.finishes))
  // GATED TO `realistic`, like the baked GI it completes: `roomProbeResolution` is 0 on both
  // `performance` variants, and `ibl: false` on `performance/weak` means there is no
  // `scene.environment`, hence no `USE_ENVMAP`, hence nothing to patch.
  const resolution = quality.roomProbeResolution
  const maxRooms = quality.roomProbeMaxRooms
  const enabled = flagOn && tier === 'realistic' && quality.ibl && resolution > 0 && maxRooms > 0

  // PMREM targets live across renders so a re-capture can dispose the previous set.
  const targetsRef = useRef<Map<string, { texture: Texture; dispose: () => void }>>(new Map())

  // The capture the emitter should run next. Held in a ref because the EMITTER has to outlive the
  // effect: a fresh one per effect run would open a fresh window on every hour bucket and coalesce
  // nothing, which is the whole point of the thing.
  const jobRef = useRef<(() => void) | null>(null)
  const emitterRef = useRef<ThrottledEmitter<void> | undefined>(undefined)
  if (!emitterRef.current) {
    emitterRef.current = createSettleEmitter<void>(() => {
      const job = jobRef.current
      jobRef.current = null
      job?.()
    }, ROOM_PROBE_SETTLE_MS)
  }
  const sceneRef = useRef<Scene>(scene)
  sceneRef.current = scene

  // Unmount ONLY (empty deps), and deliberately separate from the effect below: that one re-runs on
  // every re-capture key, so a `cancel()` in its cleanup would close the coalescing window before
  // each new request and turn every bucket of a drag back into a leading edge. The teardown lives
  // here instead, which is also the only place it belongs — a dep change is not a teardown, it is a
  // re-capture, and detaching there made the reflection blink off for the settle window.
  useEffect(() => {
    const targets = targetsRef.current
    return () => {
      emitterRef.current?.cancel()
      jobRef.current = null
      detachAllRoomProbes(sceneRef.current)
      disposeTargets(targets)
    }
  }, [])

  // `hourBucket`, `weather`, `baseSizeVersion` and `finishes` below are deliberate RE-CAPTURE
  // TRIGGERS, not values this body reads — the same device `VisibilityLightmaps` uses for
  // `floorPlan`. A linter cannot see a dependency whose only purpose is invalidation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hourBucket/weather/baseSizeVersion/finishes are re-capture keys
  useEffect(() => {
    const emitter = emitterRef.current
    if (!enabled) {
      // NOT just an early return — materials outlive the effect, and a gate that only works in
      // one direction is not a gate (`detachAllVisibilityLightmaps`'s lesson). Immediate, never
      // coalesced: a kill switch that takes a settle window to bite is not a kill switch.
      emitter?.cancel()
      jobRef.current = null
      const removed = detachAllRoomProbes(scene)
      disposeTargets(targetsRef.current)
      if (removed > 0) invalidate()
      return
    }
    let cancelled = false
    // The bake generation this effect run has already captured against; -1 = nothing captured yet.
    // A GENERATION rather than a boolean so a later attach pass (a plan swap re-applies the maps)
    // still re-captures, while the pass we already photographed does not.
    let capturedGen = -1

    const capture = (gen: number) => {
      if (cancelled) return
      if (capturedGen === gen) return
      capturedGen = gen
      const planned = planRoomProbes(floorPlan, viewLevelId)
      // Detach FIRST and unconditionally: a plan with nothing to probe must not keep the previous
      // plan's boxes, and every later return in this function is an early one.
      detachAllRoomProbes(scene)
      disposeTargets(targetsRef.current)
      if (planned.length === 0) return
      // SELECT BEFORE CAPTURING. A PMREM target is the expensive part of this feature —
      // 3 x max(N,112) x 4N at RGBA16F, i.e. 6.3 MB per room at 256 px — and a plan has rooms
      // with nothing glossy in them at all (the household shelter, the AC ledge, the service
      // yard). Capturing only the rooms that have a candidate mesh is the difference between
      // paying for the flat and paying for the three rooms that show it.
      const selected = selectProbeMeshes(scene, planned)
      const ranking = rankProbeRooms(selected)
      const assignments = limitProbeRooms(selected, maxRooms)
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
          `room probes: gen=${gen} [${probes.map((p) => p.roomId).join(', ')}] ` +
            // The RANKING, not just the winners: "bath2 lost" does not say whether it lost by a
            // nose or by an order of magnitude, and that is the whole cap question (R7-N).
            `of ${ranking.map(([id, score]) => `${id} ${score.toFixed(2)}`).join(' > ')} — ` +
            `${probes.length}/${planned.length} rooms captured at ${resolution}px in ` +
            `${tCapture.toFixed(1)} ms (${probeVramMb(resolution, probes.length).toFixed(1)} MB) — ` +
            `${result.attached} meshes, ${result.materials} materials (${result.cloned} cloned)` +
            `${gen > 0 ? '' : ' [provisional: baked GI not attached yet]'}`,
        )
      }
      invalidate()
    }

    /** Ask for a capture. Coalesced — see the emitter's contract. */
    const request = (gen: number) => {
      jobRef.current = () => capture(gen)
      emitter?.emit()
    }

    const unsubscribe = subscribeLightmapsApplied(() => request(lightmapGeneration()))
    const landed = lightmapGeneration()
    let grace: ReturnType<typeof setTimeout> | undefined
    if (landed > 0) {
      // THE BAKE IS ALREADY ON. Without this the only path to a re-capture was the grace timer
      // below, so every hour change waited it out and then logged itself `[provisional]` on a flat
      // whose GI had been attached for a minute — measured at 5.6 s from the store write to the new
      // probe (R7-N). A subscription with no memory cannot tell "not yet" from "long ago".
      request(landed)
    } else {
      // The maps are fetched, so they may never come (flag off, unbaked plan, offline). Capture
      // anyway rather than leaving the feature silently inert — the commonest way a lighting
      // feature "ships" without ever running.
      grace = setTimeout(() => {
        if (capturedGen < 0) request(0)
      }, LIGHTMAP_GRACE_MS)
    }
    return () => {
      cancelled = true
      unsubscribe()
      if (grace !== undefined) clearTimeout(grace)
    }
    // `floorPlan`, `hourBucket`, `weather`, `baseSizeVersion` and `finishes` are RE-CAPTURE
    // TRIGGERS: the probe is a picture of the room, so it is stale whenever the room's geometry,
    // its light, or the set of materials it is made of changes.
  }, [
    enabled,
    scene,
    gl,
    invalidate,
    floorPlan,
    viewLevelId,
    resolution,
    maxRooms,
    hourBucket,
    weather,
    baseSizeVersion,
    finishes,
  ])

  return null
}

/** How long to wait for the Cycles bake before capturing the analytic room instead. */
const LIGHTMAP_GRACE_MS = 2500

/**
 * How quiet the re-capture triggers must go before the coalesced capture runs (ms).
 *
 * Only the TRAILING half of a stream waits this long — the leading edge is immediate, so a
 * deliberate single change never pays it (see `createSettleEmitter`). Sits between the
 * ColorPicker's 150 ms throttle and `interactiveDegrade`'s 350 ms gesture-release debounce, both
 * of which are this codebase's existing answers to "how long after an input has stopped is the
 * gesture over".
 */
const ROOM_PROBE_SETTLE_MS = 300

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
