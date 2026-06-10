import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'
import { RoomCeiling } from './ceiling/RoomCeiling'
import { ROOMS } from './constants'

export function Ceiling() {
  // Adjustable global ceiling height; per-room overrides (e.g. dropped bathroom
  // ceilings) win. The override is read live from the editable floor-plan rooms
  // (seeded from ROOMS, but user-editable via the plan editor), falling back to
  // the ROOMS constant then the global height.
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const planRooms = useStore((s) => s.floorPlan.rooms)
  return (
    <group>
      {Object.values(ROOMS)
        .filter((r) => !r.external)
        .flatMap((r) => {
          const planRoom = planRooms.find((p) => p.id === r.id)
          const h = planRoom?.ceilingHeight ?? r.ceilingHeight ?? ceilingHeight
          // A designed ceiling (tray/coffered/dropped) replaces the flat tile(s)
          // for the room's main rectangle.
          const cfg = planRoom?.ceiling
          if (cfg && cfg.style !== 'flat' && isFeatureEnabled('ceilingDesign')) {
            const poly: [number, number][] = [
              [r.origin[0], r.origin[1]],
              [r.origin[0] + r.width, r.origin[1]],
              [r.origin[0] + r.width, r.origin[1] + r.depth],
              [r.origin[0], r.origin[1] + r.depth],
            ]
            return [<RoomCeiling key={r.id} polygon={poly} height={h} config={cfg} />]
          }
          const tiles: { cx: number; cz: number; w: number; d: number; key: string }[] = [
            {
              cx: r.origin[0] + r.width / 2,
              cz: r.origin[1] + r.depth / 2,
              w: r.width,
              d: r.depth,
              key: r.id,
            },
          ]
          if (r.extension) {
            const ex = r.origin[0] + r.extension.offset[0]
            const ez = r.origin[1] + r.extension.offset[1]
            tiles.push({
              cx: ex + r.extension.width / 2,
              cz: ez + r.extension.depth / 2,
              w: r.extension.width,
              d: r.extension.depth,
              key: `${r.id}-ext`,
            })
          }
          return tiles.map((t) => (
            <mesh key={t.key} position={[t.cx, h, t.cz]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[t.w, t.d]} />
              <meshStandardMaterial color="#fafafa" roughness={1} />
            </mesh>
          ))
        })}
    </group>
  )
}
