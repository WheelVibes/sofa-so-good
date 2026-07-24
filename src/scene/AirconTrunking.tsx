import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildAirconSystemPlan } from '../analysis/airconSystem'
import { buildAirconTrunkingPlan, resolveAirconTrunkingInput } from '../analysis/airconTrunking'
import { noExportUserData } from '../export/sceneGltf'
import { useFeature } from '../features/useFeature'
import { getPaintedMaterial } from '../materials/furnitureMaterials'
import { useStore } from '../state/store'

/** Trunking duct cross-section (m) — a small square PVC-white run, per the
 *  module brief (~60×40mm). */
const DUCT_W = 0.06
const DUCT_H = 0.04
/** Light PVC-white — the standard SG aircon trunking colour. */
const DUCT_COLOR = '#f2f0ea'

/**
 * Renders the modeled refrigerant-trunking route (BSJ-2 follow-up) as a thin
 * ducted run at ceiling height, one polyline per served room, mounted in the
 * main orbit scene alongside `PlanShell`/`Apartment`. Gated on the
 * `airconTrunking` pro flag AND only when the aircon-system section is
 * actually relevant — FCUs are placed, or the plan has at least one served
 * room (mirrors `DaylightPanel`'s own `systemPlan.systems.length > 0` gate,
 * so the route never appears for a flat with no habitable rooms to cool).
 *
 * Custom (`PlanShell`) plans only, for now — the curated default flat's fixed
 * `apartment/constants.ts` geometry has no room-graph/door-opening model this
 * router can traverse (`planRoomShell` is plan-model-only), so extending this
 * to the default flat would need a parallel default-flat room graph. Noted as
 * a follow-up rather than attempted here.
 */
export function AirconTrunking() {
  const on = useFeature('airconTrunking')
  const plan = useStore((s) => s.floorPlan)
  const orientationDeg = useStore((s) => s.orientationDeg)
  const items = useStore(useShallow((s) => s.items))

  const systemPlan = useMemo(
    () => (on ? buildAirconSystemPlan(plan, orientationDeg) : null),
    [on, plan, orientationDeg],
  )

  const runs = useMemo(() => {
    if (!on || !systemPlan || systemPlan.systems.length === 0) return []
    const input = resolveAirconTrunkingInput(plan, systemPlan, items)
    return buildAirconTrunkingPlan(plan, systemPlan, input).runs.filter((r) => r.resolved)
  }, [on, systemPlan, plan, items])

  const material = useMemo(() => getPaintedMaterial(DUCT_COLOR, false, 0.6), [])

  if (!on || runs.length === 0) return null

  return (
    <group userData={noExportUserData()}>
      {runs.map((run) =>
        run.waypoints.slice(1).map((end, i) => {
          const start = run.waypoints[i]!
          return (
            <DuctSegment
              key={`${run.systemIndex}-${run.roomId}-${i}`}
              start={start}
              end={end}
              material={material}
            />
          )
        }),
      )}
    </group>
  )
}

/** One straight axis-aligned duct box between two ceiling-height waypoints. */
function DuctSegment({
  start,
  end,
  material,
}: {
  start: [number, number, number]
  end: [number, number, number]
  material: ReturnType<typeof getPaintedMaterial>
}) {
  const dx = end[0] - start[0]
  const dz = end[2] - start[2]
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) return null
  const midX = (start[0] + end[0]) / 2
  const midY = (start[1] + end[1]) / 2
  const midZ = (start[2] + end[2]) / 2
  // Runs along X when dz≈0, else along Z — the router only ever emits
  // axis-aligned segments (`manhattanDogleg`), so no arbitrary yaw is needed.
  const alongX = Math.abs(dz) < Math.abs(dx)
  return (
    <mesh
      position={[midX, midY, midZ]}
      rotation={alongX ? [0, 0, 0] : [0, Math.PI / 2, 0]}
      material={material}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[len, DUCT_H, DUCT_W]} />
    </mesh>
  )
}
