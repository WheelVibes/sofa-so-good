import { useEffect, useMemo } from 'react'
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three'
import { useShallow } from 'zustand/react/shallow'
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
 * 3D lux-coverage heatmap on the floor (LP5 tail): renders each visible
 * level's per-room illuminance grids (`lighting2d/luxGrid.ts`) as translucent
 * colour-mapped planes just above the floor, so bright/dark zones show in the
 * actual scene. Toggled from the Drawings panel's Lighting tab
 * (`luxOverlayOn`) and gated by the same `drawings` flag as the rest of the
 * lighting plan (pro tier). Recomputes via render-time memos on the same
 * inputs that drive the 2D lux numbers (items / plan / level view) plus the
 * scene's fixture/daylight balance — nothing runs per-frame.
 */
export function LuxOverlay() {
  const enabled = useFeature('drawings')
  const on = useStore((s) => s.luxOverlayOn)
  const items = useStore(useShallow((s) => s.items))
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const lightsMode = useStore((s) => s.lightsMode)
  // Non-reactive catalog accessor (scene rule): recompute on items/plan, never
  // on catalog churn.
  const { ref: catalogRef } = useCatalogGetter()
  const sun = useSunPosition()

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily; the grids recompute on items/plan/level/light-balance changes.
  const levels = useMemo(
    () =>
      show
        ? buildLuxGrids(plan, buildLightingPlan(items, catalogRef.current).lights, viewLevelId, {
            fixtureLevel: fq,
            daylightLevel: dq,
          })
        : [],
    [show, plan, items, viewLevelId, fq, dq],
  )

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
    <group>
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
