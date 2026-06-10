import { useMemo } from 'react'
import { BackSide, MeshStandardMaterial } from 'three'
import type { CeilingConfig } from '../../floorplan/types'
import { worldUvShapeGeometry } from '../../materials/worldUv'
import { RENDER_TIERS } from '../../scene/quality'
import { useStore } from '../../state/store'
import { buildCeiling, type CeilingPart } from './ceilingModel'

/** Matte white, back-faces only (down-facing) — shared across every ceiling
 *  plane so we don't allocate a material per part. */
const CEILING_MAT = new MeshStandardMaterial({ color: '#fafafa', roughness: 1, side: BackSide })
/** Slightly shaded matte for the vertical riser / box-wall strips. */
const SIDE_MAT = new MeshStandardMaterial({ color: '#eef0f2', roughness: 1 })

/**
 * Renders a per-room ceiling treatment (tray / coffered / dropped) from the pure
 * {@link buildCeiling} engine. Falls back to a flat polygon plane when the room
 * can't take the treatment (non-rect / too small). Tier-gated: the vertical
 * riser/box strips + cove light render only on High/Maximum (Performance/Medium
 * get the flat planes only, bounding triangle + light cost).
 *
 * The down-facing planes use BackSide so the ceiling reads from below (walk mode)
 * but is culled from the orbit/dollhouse view above — matching `PlanRoomCeiling`.
 */
export function RoomCeiling({
  polygon,
  height,
  config,
}: {
  polygon: [number, number][]
  height: number
  config: CeilingConfig
}) {
  const tier = useStore((s) => s.qualityTier)
  const highPlus = RENDER_TIERS.indexOf(tier) >= RENDER_TIERS.indexOf('high')
  const model = useMemo(() => buildCeiling(polygon, height, config), [polygon, height, config])

  // Fallback (non-rect / too small / flat) → a single flat polygon plane.
  const flatGeom = useMemo(
    () => (model.fallback ? worldUvShapeGeometry(polygon) : null),
    [model.fallback, polygon],
  )
  if (model.fallback) {
    return (
      <mesh
        position={[0, height, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={CEILING_MAT}
        geometry={flatGeom ?? undefined}
      />
    )
  }

  const coveColor = config.coveColor ?? '#ffe6c0'
  return (
    <group>
      {model.parts.map((p, i) => renderPart(p, i, highPlus))}
      {model.cove && highPlus ? (
        <CoveStrips
          cx={model.cove.cx}
          cz={model.cove.cz}
          w={model.cove.w}
          d={model.cove.d}
          y={model.cove.y}
          color={coveColor}
        />
      ) : null}
    </group>
  )
}

function renderPart(p: CeilingPart, i: number, highPlus: boolean) {
  if (p.kind === 'plane') {
    return (
      <mesh
        key={`p${i}`}
        position={[p.cx, p.y, p.cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={CEILING_MAT}
      >
        <planeGeometry args={[p.w, p.d]} />
      </mesh>
    )
  }
  // Vertical riser / box-wall strip — only on High/Maximum (cosmetic depth).
  if (!highPlus) return null
  const hgt = p.yHigh - p.yLow
  return (
    <mesh key={`s${i}`} position={[p.cx, (p.yLow + p.yHigh) / 2, p.cz]} material={SIDE_MAT}>
      <boxGeometry args={[p.w, hgt, p.d]} />
    </mesh>
  )
}

/** Four thin emissive strips tracing the inner rect — a soft cove-light glow.
 *  Emissive-only (no real light) so it costs nothing in the shadow/fixture-light
 *  budget; sits just below the lip so it reads as indirect perimeter lighting. */
function CoveStrips({
  cx,
  cz,
  w,
  d,
  y,
  color,
}: {
  cx: number
  cz: number
  w: number
  d: number
  y: number
  color: string
}) {
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.1,
        roughness: 1,
      }),
    [color],
  )
  const t = 0.05
  const yy = y - 0.01
  return (
    <group>
      <mesh position={[cx, yy, cz - d / 2]} material={mat}>
        <boxGeometry args={[w, 0.012, t]} />
      </mesh>
      <mesh position={[cx, yy, cz + d / 2]} material={mat}>
        <boxGeometry args={[w, 0.012, t]} />
      </mesh>
      <mesh position={[cx - w / 2, yy, cz]} material={mat}>
        <boxGeometry args={[t, 0.012, d]} />
      </mesh>
      <mesh position={[cx + w / 2, yy, cz]} material={mat}>
        <boxGeometry args={[t, 0.012, d]} />
      </mesh>
    </group>
  )
}
