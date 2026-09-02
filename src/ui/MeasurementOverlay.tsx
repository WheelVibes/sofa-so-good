import { Html, Line } from '@react-three/drei'
import { ROOMS } from '../apartment/constants'
import { noExportUserData } from '../export/sceneGltf'
import { allPlanRooms, levelOfRoom, planLevels } from '../floorplan/levels'
import { type PlanRoom, planRoomArea } from '../floorplan/types'
import { useStore } from '../state/store'
import type { UnitSystem } from '../utils/measurement'
import { formatArea, formatLength } from '../utils/measurement'

/** Label anchor for a room: polygon centroid when free-form, else rect centre
 *  (which equals the default-apartment `roomCentroid` for seeded rooms). */
function roomLabelCentre(r: PlanRoom): [number, number] {
  if (r.polygon && r.polygon.length > 0) {
    const n = r.polygon.length
    return [
      r.polygon.reduce((a, p) => a + p[0], 0) / n,
      r.polygon.reduce((a, p) => a + p[1], 0) / n,
    ]
  }
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

/** Colour of the dimension lines/ticks. A fixed brand-terracotta reads on the
 *  full range of floor finishes under the room editor's flat neutral lighting;
 *  the numeric pills carry the themed contrast (DOM, token-styled). */
const DIM_COLOR = '#c2673d'
/** Half-length of the perpendicular end ticks (m). */
const TICK = 0.12
/** Floor clearance for the horizontal dimension lines so they read above the
 *  floor finish without z-fighting it. */
const DIM_Y = 0.04

/** A single numeric dimension label pill. */
function DimLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center distanceFactor={10} zIndexRange={[15, 0]}>
      <div className="dim-label">{text}</div>
    </Html>
  )
}

/**
 * Architectural dimension markers for the room being edited: the width (along
 * the near X edge), the depth (along the left Z edge) and the ceiling height
 * (up the shared corner), each drawn as a ticked line with a numeric label —
 * so the measurements toggle marks the room's borders instead of just floating
 * a text summary. Uses the room's bounding box (exact for rectangular rooms;
 * the bbox for free-form polygons).
 */
function DimensionMarkers({
  room,
  height,
  units,
  baseY = 0,
}: {
  room: PlanRoom
  height: number
  units: UnitSystem
  /** The storey's floor height (m). `PlanShell` renders each level in a group at
   *  `level.elevation`, but this overlay is mounted OUTSIDE those groups, so it
   *  has to lift its own markers. 0 in the per-room editor, which draws the
   *  single room at ground level regardless of which storey it is on. */
  baseY?: number
}) {
  const dimY = baseY + DIM_Y
  const [ox, oz] = room.origin
  const w = room.width
  const d = room.depth
  const x0 = ox
  const x1 = ox + w
  const z0 = oz
  const z1 = oz + d
  return (
    <group userData={noExportUserData()}>
      {/* Width — along the near (min-Z) edge */}
      <Line
        points={[
          [x0, dimY, z0],
          [x1, dimY, z0],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <Line
        points={[
          [x0, dimY, z0 - TICK],
          [x0, dimY, z0 + TICK],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <Line
        points={[
          [x1, dimY, z0 - TICK],
          [x1, dimY, z0 + TICK],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <DimLabel position={[(x0 + x1) / 2, dimY, z0]} text={formatLength(w, units)} />

      {/* Depth — along the left (min-X) edge */}
      <Line
        points={[
          [x0, dimY, z0],
          [x0, dimY, z1],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <Line
        points={[
          [x0 - TICK, dimY, z1],
          [x0 + TICK, dimY, z1],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <DimLabel position={[x0, dimY, (z0 + z1) / 2]} text={formatLength(d, units)} />

      {/* Height — up the shared (min-X, min-Z) corner */}
      <Line
        points={[
          [x0, 0, z0],
          [x0, height, z0],
        ]}
        color={DIM_COLOR}
        lineWidth={2}
      />
      <DimLabel position={[x0, height / 2, z0]} text={formatLength(height, units)} />
    </group>
  )
}

export function MeasurementOverlay() {
  const show = useStore((s) => s.showMeasurements)
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  // Iterate the ACTIVE plan's rooms (custom plans render their own rooms; the
  // default plan's rooms are seeded from ROOMS so this matches the old output).
  // Per-room ceiling overrides live on the plan room, falling back to the ROOMS
  // constant then the global height — matching Ceiling.tsx.
  // The PLAN, not a derived room list — `allPlanRooms` returns a fresh array on
  // a multi-storey plan, which as a selector re-renders forever.
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  // Hide the drei <Html> labels while the 2D floor-plan editor covers the scene
  // (its <Html> sits above the editor's z-index otherwise).
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  // In the per-room editor only the room being edited is on screen, so its label
  // is the only one that should show — never the whole apartment's.
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const roomEditorId = useStore((s) => s.roomEditor.roomId)
  if (!show || floorPlanEditing) return null

  // The room's own override, else the ROOMS constant, else the STOREY's ceiling
  // height (F13) and only then the plan's — an upper level with its own
  // `ceilingHeight` was being measured against the ground floor's.
  const ceilingOf = (r: PlanRoom, levelHeight?: number) =>
    r.ceilingHeight ??
    ROOMS[r.id as keyof typeof ROOMS]?.ceilingHeight ??
    levelHeight ??
    ceilingHeight

  // Per-room editor: draw dimension markers on the edited room's borders rather
  // than a floating text label (the area lives on the top pill).
  if (roomEditorActive && roomEditorId) {
    // EVERY storey (F13): a ground-only lookup found no room for an upstairs id
    // and returned null, so an upstairs room had NO dimension markers at all.
    // `baseY` stays 0 — `RoomEditorScene` draws the single room at ground level
    // whichever storey it belongs to (it applies no `level.elevation`).
    const room = allPlanRooms(plan).find((r) => r.id === roomEditorId)
    if (!room) return null
    const level = levelOfRoom(plan, room.id)
    return (
      <DimensionMarkers room={room} height={ceilingOf(room, level?.ceilingHeight)} units={units} />
    )
  }

  // Whole-plan overview: the SAME dimension markers on every room's borders,
  // plus a minimal centre label (name + area on separate lines) — the dims live
  // on the markers now, so the label no longer repeats the size/ceiling.
  // EVERY storey (F13), each lifted to its own elevation: `PlanShell` renders
  // level N inside a group at `level.elevation`, but this overlay sits outside
  // those groups, so an upstairs room's markers and label have to be raised here
  // or they would be drawn on the ground floor's slab.
  return (
    <group userData={noExportUserData()}>
      {planLevels(plan).flatMap((level) =>
        level.rooms.map((r) => {
          const [cx, cz] = roomLabelCentre(r)
          const height = ceilingOf(r, level.ceilingHeight)
          const area = planRoomArea(r)
          return (
            <group key={r.id}>
              <DimensionMarkers room={r} height={height} units={units} baseY={level.elevation} />
              <Html
                position={[cx, level.elevation + height / 2, cz]}
                center
                distanceFactor={10}
                zIndexRange={[15, 0]}
              >
                <div className="dim-room-label">
                  <div className="dim-room-name">{r.name}</div>
                  <div className="dim-room-area">{formatArea(area, units)}</div>
                </div>
              </Html>
            </group>
          )
        }),
      )}
    </group>
  )
}
