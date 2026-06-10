import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { canPlace, itemFootprint } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { useCatalogGetter } from '../furniture/catalog'
import { Furniture } from '../furniture/Furniture'
import {
  defaultParamProps,
  type FurnitureDef,
  type FurnitureItem,
  type ParamProps,
} from '../furniture/types'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { snapToGrid } from './snap'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def)
  return def.scale != null ? { scale: def.scale } : {}
}

/**
 * Live preview that follows the cursor while a catalog card is being
 * dragged. Reads the cursor from the placement slice (CatalogCard
 * writes it) and unprojects to the floor plane each frame so the
 * pointer-tracking stays cheap and avoids re-rendering the whole
 * scene graph.
 */
export function PlacementGhost() {
  const activeDefId = useStore((s) => s.activeDefId)
  // Placement is editing, so the ghost only shows inside the per-room editor
  // (no ghost ⇒ the commit handler reads a null ghostWorld and swallows clicks).
  const editing = useStore(canEditScene)
  const cursor = useStore(useShallow((s) => s.cursor))
  // R-dialed rotation before commit — re-renders the ghost (preview + footprint)
  // so it previews the orientation it'll land in.
  const ghostRotation = useStore((s) => s.ghostRotation)
  const items = useStore(useShallow((s) => s.items))
  const doors = useStore(useShallow((s) => s.doors))
  // Non-reactive accessor — the ghost re-renders on activeDefId/cursor/rotation,
  // and the per-frame loop reads the catalog ref lazily (no catalog-churn renders).
  const { ref: catalogRef } = useCatalogGetter()
  const { camera, gl } = useThree()

  const def = activeDefId ? catalogRef.current[activeDefId] : null
  const ghostItem = useMemo<FurnitureItem | null>(() => {
    if (!def) return null
    return {
      id: '__ghost',
      defId: def.id,
      position: [0, 0],
      rotation: (def.defaultRotation ?? 0) + ghostRotation,
      props: defaultProps(def),
    }
  }, [def, ghostRotation])

  const groupRef = useRef<import('three').Group>(null)
  const validRef = useRef(true)
  const pointerNDC = useRef(new Vector2())
  const raycaster = useRef(new Raycaster())
  const target = useRef(new Vector3())
  // Pre-build the OBB tint material so we can mutate its color directly
  // each frame without forcing React re-renders.
  const tintMaterial = useMemo(() => {
    const m = new MeshBasicMaterial({
      color: '#22c55e',
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
    return m
  }, [])
  const greenColor = useMemo(() => new Color('#22c55e'), [])
  const redColor = useMemo(() => new Color('#ef4444'), [])

  useFrame(() => {
    if (!def || !ghostItem || !cursor || !groupRef.current) return
    const rect = gl.domElement.getBoundingClientRect()
    pointerNDC.current.set(
      ((cursor.x - rect.left) / rect.width) * 2 - 1,
      -(((cursor.y - rect.top) / rect.height) * 2 - 1),
    )
    raycaster.current.setFromCamera(pointerNDC.current, camera)
    const hit = raycaster.current.ray.intersectPlane(FLOOR_PLANE, target.current)
    if (!hit) return
    // Snap the drop preview to the alignment grid when enabled, so what the
    // user sees (and the committed position) lands on the grid.
    const st = useStore.getState()
    let px = target.current.x
    let pz = target.current.z
    if (st.snapEnabled) [px, pz] = snapToGrid([px, pz], st.gridSize)
    groupRef.current.position.set(px, 0, pz)
    ghostItem.position = [px, pz]
    const valid = canPlace(ghostItem, def, {
      others: items,
      defs: catalogRef.current,
      doors,
      // Bound to the same walls as a drag — the room's perimeter in the editor.
      walls: placementWalls(st),
    })
    if (valid !== validRef.current) {
      validRef.current = valid
      tintMaterial.color.copy(valid ? greenColor : redColor)
    }
    useStore.getState().setGhostWorld([px, pz], valid)
  })

  if (!def || !ghostItem || !editing) return null

  // Render an OBB-shaped translucent disc under the ghost so the
  // collision result is visible without disturbing the Furniture
  // primitive's own material.
  const obb = itemFootprint(ghostItem, def)
  return (
    <group ref={groupRef}>
      <Furniture item={ghostItem} def={def} passive />
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={tintMaterial}>
        <planeGeometry args={[obb.hx * 2, obb.hz * 2]} />
      </mesh>
    </group>
  )
}
