import { isFeatureEnabled } from '../../features/featureFlags'
import type { MaterialId } from '../../materials/types'
import { useStore } from '../../state/store'
import { ROOMS } from '../constants'
import { roomOutline, roomParts } from '../roomGeometry'
import { RoomCeiling } from './RoomCeiling'
import { RoomCeilingTile } from './RoomCeilingTile'

export function Ceiling() {
  // Adjustable global ceiling height; per-room overrides (e.g. dropped bathroom
  // ceilings) win. The override is read live from the editable floor-plan rooms
  // (seeded from ROOMS, but user-editable via the plan editor), falling back to
  // the ROOMS constant then the global height.
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const planRooms = useStore((s) => s.floorPlan.rooms)
  // Per-room ceiling finish (CUSTOMIZE-CEILING) — absent → plain white.
  const ceilingFinishes = useStore((s) => s.finishes.ceiling)
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
            // A designed ceiling takes the room's whole outline (`buildCeiling`
            // falls back to a flat plane for a shape it can't tray/coffer).
            const poly = roomOutline(r).map(([x, z]) => [x, z] as [number, number])
            return [<RoomCeiling key={r.id} polygon={poly} height={h} config={cfg} />]
          }
          // One flat tile per rect piece — a room may have any number.
          const tiles = roomParts(r).map((rect, i) => ({
            cx: (rect.x0 + rect.x1) / 2,
            cz: (rect.z0 + rect.z1) / 2,
            w: rect.x1 - rect.x0,
            d: rect.z1 - rect.z0,
            key: i === 0 ? r.id : `${r.id}-part${i}`,
          }))
          // A per-room finish paints/textures the ceiling; otherwise plain white.
          const finishId =
            (ceilingFinishes?.[r.id] as MaterialId | undefined) ??
            (planRoom?.ceilingFinish as MaterialId | undefined)
          if (finishId && isFeatureEnabled('ceilingFinish')) {
            return tiles.map((t) => (
              <RoomCeilingTile
                key={t.key}
                materialId={finishId}
                cx={t.cx}
                cz={t.cz}
                y={h}
                w={t.w}
                d={t.d}
              />
            ))
          }
          return tiles.map((t) => (
            <mesh key={t.key} position={[t.cx, h, t.cz]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[t.w, t.d]} />
              {/* LAMBERT, not Standard. Three unrolls its point-light loop and
                  runs a full GGX BRDF per light per fragment; a plain white
                  ceiling at roughness 1 has no specular lobe worth evaluating,
                  and in walk mode it is one of the largest surfaces on screen —
                  so this is pure waste multiplied by the fixture-light count.
                  Lambert's per-light work is a dot product. Only valid because
                  this material is a fixed matte white with no finish: a ceiling
                  the user has FINISHED goes through `RoomCeilingTile` and keeps
                  its PBR material. */}
              <meshLambertMaterial color="#fafafa" />
            </mesh>
          ))
        })}
    </group>
  )
}
