import { useEffect, useMemo, useRef } from 'react'
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { noExportUserData } from '../export/sceneGltf'
import { useFeature } from '../features/useFeature'
import { useCatalogGetter } from '../furniture/catalog'
import { buildLightingPlan } from '../lighting2d/lightingPlan'
import { luxGridRgba } from '../lighting2d/luxColor'
import { buildLuxGrids, type RoomLuxGrid } from '../lighting2d/luxGrid'
import { useStore } from '../state/store'
import { lightingFromAltitude } from './lighting/altitudeCurve'
import { useSunPosition } from './lighting/useSunPosition'

/** Height above the floor slab — clears z-fighting without visibly floating. */
const FLOOR_OFFSET = 0.005
/** Overlay opacity — strong enough to read, light enough to see the floor. */
const OPACITY = 0.62

/** How fast the auto-play advances, in fractional hours per second. */
const PLAY_SPEED_HRS_PER_SEC = 1

interface OverlayLayer {
  key: string
  /** World centre of the grid plane. */
  cx: number
  cz: number
  y: number
  width: number
  depth: number
  texture: DataTexture
}

function gridTexture(grid: RoomLuxGrid): DataTexture {
  const tex = new DataTexture(luxGridRgba(grid), grid.cols, grid.rows, RGBAFormat)
  // Linear filtering smooths the coarse sample grid into a continuous ramp.
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * 3D lux-coverage heatmap on the floor (LP5 tail / LP6 enhancements):
 * renders each visible level's per-room illuminance grids as translucent
 * colour-mapped planes just above the floor. Toggled from the Drawings panel's
 * Lighting tab (`luxOverlayOn`) and gated by the same `drawings` flag (pro tier).
 *
 * LP6 extensions:
 * - Reacts to `manualHour` (time-scrub) — the existing time-of-day state drives
 *   `useSunPosition`, so scrubbing the Scene slider updates the heatmap live.
 *   Debouncing is implicit: the memo only recomputes when the quantised
 *   fixture/daylight levels change (per-% steps), keeping scrubbing smooth.
 * - Per-fixture exclusion: item IDs in `luxExcludedIds` are filtered out before
 *   computing grids, so the user can isolate each fixture's contribution.
 * - Optional auto-play: `luxPlaying` advances `manualHour` at 1 hr/s via a
 *   rAF loop, so the heatmap animates across the day. The RenderPump already
 *   reacts to store changes, so no extra invalidate call is needed.
 */
export function LuxOverlay() {
  const enabled = useFeature('drawings')
  const on = useStore((s) => s.luxOverlayOn)
  const items = useStore(useShallow((s) => s.items))
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const lightsMode = useStore((s) => s.lightsMode)
  const luxExcludedIds = useStore(useShallow((s) => s.luxExcludedIds))
  const doors = useStore(useShallow((s) => s.doors))
  const luxPlaying = useStore((s) => s.luxPlaying)
  // Non-reactive catalog accessor (scene rule): recompute on items/plan, never
  // on catalog churn.
  const { ref: catalogRef } = useCatalogGetter()
  const sun = useSunPosition()

  // Auto-play rAF loop — advances manualHour when luxPlaying is on.
  // Runs as a plain side-effect (not a useFrame) so it works in any Canvas.
  const lastTsRef = useRef<number | null>(null)
  const playingRef = useRef(luxPlaying)
  playingRef.current = luxPlaying

  useEffect(() => {
    if (!luxPlaying) {
      lastTsRef.current = null
      return
    }
    let raf = 0
    const loop = (ts: number) => {
      if (lastTsRef.current !== null) {
        const dt = (ts - lastTsRef.current) / 1000
        const { setManualHour, manualHour } = useStore.getState()
        setManualHour(manualHour + dt * PLAY_SPEED_HRS_PER_SEC)
      }
      lastTsRef.current = ts
      if (playingRef.current) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lastTsRef.current = null
    }
  }, [luxPlaying])

  const show = enabled && on
  // Same day/night balance FurnitureLights drives the real point lights with:
  // fixtures fade in as the sun sets; the lights-mode override forces them.
  const sunLevel = lightingFromAltitude(sun.altitude).sun
  const darkness = Math.min(1, Math.max(0, 1 - sunLevel / 0.85))
  const fixtureLevel = lightsMode === 'on' ? 1 : lightsMode === 'off' ? 0 : darkness
  const daylightLevel = Math.min(1, Math.max(0, sunLevel / 0.85))
  // Quantised so sub-percent sun drift doesn't churn the memo.
  const fq = Math.round(fixtureLevel * 100) / 100
  const dq = Math.round(daylightLevel * 100) / 100

  // Build the visible lights list, filtering out excluded fixtures.
  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily; the grids recompute on items/plan/level/light-balance/exclusion changes.
  const levels = useMemo(() => {
    if (!show) return []
    const allLights = buildLightingPlan(items, catalogRef.current).lights
    const lights =
      luxExcludedIds.length === 0
        ? allLights
        : allLights.filter((l) => !luxExcludedIds.includes(l.id))
    return buildLuxGrids(plan, lights, viewLevelId, {
      fixtureLevel: fq,
      daylightLevel: dq,
      doors,
    })
  }, [show, plan, items, viewLevelId, fq, dq, luxExcludedIds, doors])

  const layers = useMemo<OverlayLayer[]>(
    () =>
      levels.flatMap((level) =>
        level.grids.map((g) => ({
          key: `${level.levelId}:${g.roomId}`,
          cx: g.x0 + (g.cols * g.cell) / 2,
          cz: g.z0 + (g.rows * g.cell) / 2,
          y: level.elevation + FLOOR_OFFSET,
          width: g.cols * g.cell,
          depth: g.rows * g.cell,
          texture: gridTexture(g),
        })),
      ),
    [levels],
  )

  // Dispose superseded textures (and on unmount) — no GPU leaks across
  // recomputes or when the overlay is toggled off.
  useEffect(
    () => () => {
      for (const l of layers) l.texture.dispose()
    },
    [layers],
  )

  if (layers.length === 0) return null
  return (
    <group userData={noExportUserData()}>
      {layers.map((l) => (
        <mesh key={l.key} position={[l.cx, l.y, l.cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[l.width, l.depth]} />
          {/* toneMapped=false: the heatmap is data, not lit scenery — its
              colours must not shift with exposure/time-of-day grading.
              (r3f disposes the declarative material/geometry on unmount;
              the DataTexture is ours, disposed in the effect above.) */}
          <meshBasicMaterial
            map={l.texture}
            transparent
            opacity={OPACITY}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
