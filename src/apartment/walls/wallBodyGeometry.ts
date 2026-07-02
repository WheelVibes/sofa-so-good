import { ExtrudeGeometry, Path, Shape } from 'three'
import type { WallBodyOutline } from './wallBodyShape'

/** Turn a wall-body cross-section (outline + holes, in the wall's centred
 *  along-axis × height frame) into a three `Shape` with hole paths. */
function wallBodyShape({ outline, holes }: WallBodyOutline): Shape {
  const shape = new Shape()
  shape.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1])
  shape.closePath()
  for (const h of holes) {
    const p = new Path()
    p.moveTo(h[0][0], h[0][1])
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1])
    p.closePath()
    shape.holes.push(p)
  }
  return shape
}

/**
 * Extrude a wall body from its cross-section outline + holes into ONE watertight
 * mesh (no internal seams), centred on the wall's thickness so it straddles the
 * centreline (floor at y = 0, +Z / −Z faces at ±thickness/2). Shared by the
 * orbit scene (`WallSegment`) and the per-room editor (`RoomShell` /
 * `PlanRoomShell`) so a wall's door/window openings carve real holes in EVERY
 * scene — otherwise an opaque room-editor wall box occludes the door/window
 * sitting inside it.
 */
export function extrudeWallBody(body: WallBodyOutline, thickness: number): ExtrudeGeometry {
  const geo = new ExtrudeGeometry(wallBodyShape(body), {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  })
  // ExtrudeGeometry runs the profile along +Z from 0..depth; centre it on the
  // wall's thickness so the body straddles the centreline.
  geo.translate(0, 0, -thickness / 2)
  geo.computeVertexNormals()
  return geo
}
