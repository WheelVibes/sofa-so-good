// @vitest-environment happy-dom
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { shouldExcludeFromExport } from '../export/sceneGltf'
import { finishSurfaceUserData } from '../scene/finishDropTarget'
import { markWallOverlay } from './walls/wallReveal'

/**
 * FINISH-TARGET-EXPORT-AUDIT.
 *
 * `finishSurfaceUserData(kind, roomId)` is applied at five call sites so the canvas
 * finish-drag raycaster can classify a hit (`scene/finishDropTarget.ts`). A prior
 * investigation (`src/scene/CLAUDE.md`'s ORPHAN-CLASS note) found that SOME
 * finish-drop targets in the app are zero-thickness, camera-invisible pick planes
 * that only exist for raycasting — and that `bake_material.py` selects meshes to
 * bake by surface AREA, so a large pick plane can outrank real geometry and burn
 * bake budget on a surface with nothing to bake. `wallRevealPrepass.ts`'s
 * `wall-reveal-depth-prepass` twin was exactly that class and is already tagged
 * `noExport` (see that file's BAKE-TWIN-COLLISION comment) — this file is the
 * audit of the remaining five `finishSurfaceUserData` call sites to see whether
 * any of THEM are the same kind of helper in disguise.
 *
 * Verdict, read from what geometry and material each site actually builds:
 *
 * | call site | geometry | material | verdict |
 * | --- | --- | --- | --- |
 * | `RoomShell.tsx` `WallBox` | `extrudeWallBody(...)` — a real extruded solid with the wall's actual thickness | `[finish, structuralWhite]` — the finish IS painted on this mesh's own inner-face material group | DISPLAY |
 * | `PlanRoomShell.tsx` `WallBoxBody` | same `extrudeWallBody(...)` extrusion, real thickness | the resolved room finish (or plaster fallback) | DISPLAY |
 * | `WallSegment.tsx` `FacePlane` | zero-thickness `worldUvPlaneGeometry` plane, offset `FACE_OFFSET` (1 mm) proud of the wall body | the resolved room finish (paint/tile), `receiveShadow` | DISPLAY — this file's own comment says it outright: "This plane, not the wall body, is the surface the camera SEES: it sits FACE_OFFSET proud of the box and hides it entirely." The body underneath is deliberately left the plain structural colour; the finish is painted ONLY here. |
 * | `PlanWallFace.tsx` `FaceMesh` | same shape, for a custom-plan wall box | the resolved room finish | DISPLAY, same reasoning |
 * | `RoomFloor.tsx` / `PlanRoomFloor.tsx` | the room's only floor plane (rect or triangulated polygon) | the resolved floor finish | DISPLAY — this IS the floor; there is no other floor mesh underneath it |
 *
 * None of the five is a bare raycast-only plane: every one carries the material
 * the user actually sees (paint, tile, wood, or the floor finish), and three of
 * the five are the SOLE rendering of that surface (the wall body's own inner
 * face group, or the floor). So none is tagged `noExport` here.
 *
 * This directly narrows `src/scene/CLAUDE.md`'s ORPHAN-CLASS claim that "hiding all
 * 129 wall-kind [finishTarget] ones moves the frame 3.11 counts... essentially all
 * of it a ceiling fan" — read literally, that comparison attributes its entire
 * measured delta to a moving fan blade, which is the exact whole-frame-mean
 * confound this same file's ORBIT-STUDIO-LOOK note warns about elsewhere ("a
 * whole-frame diff is dominated by the CEILING FAN's blade angle, so localise one
 * before believing it"). It is not evidence that hiding these planes is
 * inconsequential to a GLB export's correctness: `WallSegment`'s own wall-kind
 * `FacePlane` is where the room's paint/tile colour is painted at all — the body
 * underneath is a flat structural white with no finish. Excluding it would ship an
 * export where every wall in the flat renders as undifferentiated white/grey
 * concrete, including the tiled bathrooms and kitchen. That would be a much worse
 * outcome than the wasted bake budget the orphan note is chasing, so nothing here
 * is tagged pending a masked (fan-excluded) re-measurement.
 *
 * Each test below builds the exact `userData` shape that call site attaches (not
 * a copy of its component — these are simple/leaf meshes and the render logic
 * itself is not under test) and asserts `shouldExcludeFromExport` still says NO —
 * i.e. a finish surface is never accidentally excluded by anything already tagged
 * on it.
 */
describe('finish-target surfaces stay in export (none are pick-only)', () => {
  it('RoomShell.tsx WallBox — the room-editor wall body, painted on its own material group', () => {
    const wall = new Mesh(new BoxGeometry(2, 2.6, 0.1), [
      new MeshStandardMaterial({ color: '#f5f5f0' }),
      new MeshStandardMaterial({ color: '#f1f0ec' }),
    ])
    wall.userData = finishSurfaceUserData('wall', 'livingDining')
    expect(shouldExcludeFromExport(wall as never)).toBe(false)
  })

  it('PlanRoomShell.tsx WallBoxBody — the custom-plan room-editor wall body', () => {
    const wall = new Mesh(
      new BoxGeometry(2, 2.6, 0.2),
      new MeshStandardMaterial({ color: '#ede9e2' }),
    )
    wall.userData = finishSurfaceUserData('wall', 'bedroom2')
    expect(shouldExcludeFromExport(wall as never)).toBe(false)
  })

  it('WallSegment.tsx FacePlane — the visible painted wall face, marked as a wall overlay but NOT noExport', () => {
    const wallBody = new Mesh(new BoxGeometry(2, 2.6, 0.1), new MeshStandardMaterial())
    const face = new Mesh(new PlaneGeometry(2, 2.6), new MeshStandardMaterial({ color: '#ffffff' }))
    face.userData = markWallOverlay(finishSurfaceUserData('wall', 'kitchen'))
    wallBody.add(face)
    // The overlay mark hides this plane for the DURATION of a camera-facing wall
    // fade (WALL-FADE-OVERLAY-CULL) — a runtime `visible` toggle, not an export
    // exclusion. It carries no `noExport` key, so it must still export.
    expect(shouldExcludeFromExport(face as never)).toBe(false)
  })

  it('PlanWallFace.tsx FaceMesh — the same visible-face pattern for a custom-plan wall box', () => {
    const wallBox = new Mesh(new BoxGeometry(2, 2.6, 0.1), new MeshStandardMaterial())
    const face = new Mesh(new PlaneGeometry(2, 2.6), new MeshStandardMaterial({ color: '#a9825c' }))
    face.userData = finishSurfaceUserData('wall', 'mainBedroom')
    wallBox.add(face)
    expect(shouldExcludeFromExport(face as never)).toBe(false)
  })

  it('RoomFloor.tsx / PlanRoomFloor.tsx — the room floor mesh, the only floor rendered for that room', () => {
    const floor = new Mesh(new PlaneGeometry(3, 3), new MeshStandardMaterial({ color: '#7d6243' }))
    floor.userData = finishSurfaceUserData('floor', 'bath1')
    expect(shouldExcludeFromExport(floor as never)).toBe(false)
  })

  it('a finishTarget tag alone never excludes a subtree, even nested under an untagged group', () => {
    const room = new Group()
    const floor = new Mesh(new PlaneGeometry(3, 3), new MeshStandardMaterial())
    floor.userData = finishSurfaceUserData('floor', 'kitchen')
    room.add(floor)
    expect(shouldExcludeFromExport(floor as never)).toBe(false)
  })
})
