import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { itemFootprint } from '../collision/placement'
import { useCatalogGetter } from '../furniture/catalog'
import type { FurnitureDef } from '../furniture/types'
import { useStore } from '../state/store'
import {
  createDragHandlers,
  type DragGridCache,
  type RoomBoundsCache,
} from './dragControllerHandlers'
import { boxEdges, useDisposeGeometry } from './geometryUtil'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)

/**
 * Tracks the active furniture drag started by Furniture.onPointerDown.
 * Each pointer-move unprojects to the floor, live-updates the item's
 * position via moveItem, and writes the placement validity so the red
 * tint highlight can react. On pointer-up: if the latest position is
 * invalid the item is reverted to its drag-start transform.
 *
 * Lives inside the Canvas because it needs access to the active camera
 * and the GL DOM element for raycasting.
 */
export function DragController() {
  const { camera, gl } = useThree()
  // Stable getter — does NOT re-render this in-canvas controller when the
  // catalog changes (a bulk import would otherwise re-render it thousands of
  // times, starving the render loop → white flicker). `catalogRef` mirrors the
  // existing lazy-read pattern in the handlers below.
  const { ref: catalogRef } = useCatalogGetter()

  const ndc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const target = useMemo(() => new Vector3(), [])

  // Id of the compatible base the dragged item would snug-stack onto, or null.
  // Mirrored in a ref so the window listeners (which read it on drop) see the
  // latest value without re-subscribing; state drives the highlight render.
  const [snapBaseId, setSnapBaseId] = useState<string | null>(null)
  const snapBaseIdRef = useRef<string | null>(null)
  // Broadphase cache for the current pointer drag (PERF-003): the non-moved items
  // don't move during a drag, so their spatial grid + AABBs are built once and
  // reused across every pointermove to restrict the snug-stack + canPlace scans to
  // the dragged item's neighbourhood. Keyed by the drag's moved-id signature so a
  // new drag rebuilds it; cleared on drop.
  const dragGridRef = useRef<DragGridCache | null>(null)
  // Per-room editor: cache the active room's footprint rects so a single-item
  // drag can be clamped inside the room (IKEA-style boundary) without rebuilding
  // the shell every pointermove. Keyed on the room id; null outside the editor.
  const roomBoundsRef = useRef<RoomBoundsCache | null>(null)
  const setSnap = (id: string | null) => {
    if (snapBaseIdRef.current === id) return
    snapBaseIdRef.current = id
    setSnapBaseId(id)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily inside handlers (intentionally not a dep — re-subscribing per catalog change is exactly what we're avoiding); setSnap is a stable state setter.
  useEffect(() => {
    const dom = gl.domElement

    const project = (clientX: number, clientY: number): [number, number] | null => {
      const rect = dom.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, target)
      if (!hit) return null
      return [target.x, target.z]
    }

    // Orchestration (BUG-1 gating, snug-stack commit, invalid-release revert/
    // soft-push, alignment + equal-spacing guides) lives in the extracted
    // `createDragHandlers` factory (TEST-7) so it's unit-testable headlessly —
    // this component supplies the real camera-backed `project` + its refs.
    const { onMove, onUp } = createDragHandlers({
      project,
      catalogRef,
      dragGridRef,
      roomBoundsRef,
      snapBaseIdRef,
      setSnap,
    })

    // Bug #11: a SECOND touch finger arriving mid-drag means the user is
    // starting a pinch/zoom — abandon the one-finger item drag (revert it) so
    // OrbitControls (frozen while dragging) re-enables and the camera gesture
    // takes over, instead of the piece jumping + the pinch being swallowed.
    const onSecondPointer = (ev: PointerEvent) => {
      if (ev.pointerType !== 'touch') return
      const s = useStore.getState()
      if (s.draggingItemId && s.dragPointerId != null && ev.pointerId !== s.dragPointerId) {
        s.cancelDrag()
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('pointerdown', onSecondPointer)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointerdown', onSecondPointer)
    }
  }, [camera, gl, ndc, raycaster, target])

  return <SnapBaseHighlight baseId={snapBaseId} catalog={catalogRef.current} />
}

/** Outline around the compatible base the dragged item will snug-stack onto —
 *  mirrors HoverHighlight's edges-box styling, tinted green to read as a valid
 *  snap target. Rendered only while a snap candidate is active mid-drag. */
function SnapBaseHighlight({
  baseId,
  catalog,
}: {
  baseId: string | null
  catalog: Record<string, FurnitureDef>
}) {
  const items = useStore((s) => s.items)
  const item = baseId ? items.find((i) => i.id === baseId) : null
  const def = item ? catalog[item.defId] : null
  const obb = useMemo(() => (item && def ? itemFootprint(item, def) : null), [item, def])
  const geom = useMemo(
    () => (obb ? boxEdges(obb.hx * 2 + 0.08, 0.001, obb.hz * 2 + 0.08) : null),
    [obb],
  )
  useDisposeGeometry(geom)

  if (!obb || !geom) return null
  return (
    <lineSegments
      geometry={geom}
      position={[obb.cx, 0.02, obb.cz]}
      rotation={[0, obb.rot, 0]}
      renderOrder={3}
    >
      <lineBasicMaterial color="#34d399" transparent opacity={0.9} depthWrite={false} />
    </lineSegments>
  )
}
