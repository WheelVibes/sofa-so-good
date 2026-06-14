import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { itemFootprint } from '../../collision/placement'
import { noExportUserData } from '../../export/sceneGltf'
import { useCatalogGetter } from '../../furniture/catalog'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { boxEdges, useDisposeGeometry } from '../geometryUtil'

const OUTLINE_COLOR_DEFAULT = '#3b82f6'
const OUTLINE_COLOR_VALID = '#22c55e'
const OUTLINE_COLOR_INVALID = '#ef4444'
const TINT_DEFAULT = '#3b82f6'
const TINT_VALID = '#22c55e'
const TINT_INVALID = '#ef4444'
const OUTLINE_LIFT = 0.005
const OUTLINE_PAD = 0.06
const OUTLINE_PAD_OUTER = 0.18
const CORNER_LEN = 0.25
const CORNER_THICK = 0.04

interface ItemOutlineProps {
  item: FurnitureItem
  def: FurnitureDef
  isDragging: boolean
  dragValid: boolean
}

function ItemOutline({ item, def, isDragging, dragValid }: ItemOutlineProps) {
  const obb = itemFootprint(item, def)
  const w = obb.hx * 2 + OUTLINE_PAD
  const d = obb.hz * 2 + OUTLINE_PAD
  const wOuter = obb.hx * 2 + OUTLINE_PAD_OUTER
  const dOuter = obb.hz * 2 + OUTLINE_PAD_OUTER
  const geom = useMemo(() => boxEdges(w, 0.001, d), [w, d])
  const geomOuter = useMemo(() => boxEdges(wOuter, 0.001, dOuter), [wOuter, dOuter])
  useDisposeGeometry(geom)
  useDisposeGeometry(geomOuter)

  const outlineColor = isDragging
    ? dragValid
      ? OUTLINE_COLOR_VALID
      : OUTLINE_COLOR_INVALID
    : OUTLINE_COLOR_DEFAULT
  const tintColor = isDragging ? (dragValid ? TINT_VALID : TINT_INVALID) : TINT_DEFAULT

  const cx = w / 2
  const cz = d / 2
  const corners = [
    [cx, cz, 1, 1],
    [-cx, cz, -1, 1],
    [cx, -cz, 1, -1],
    [-cx, -cz, -1, -1],
  ] as const

  return (
    <group
      position={[obb.cx, OUTLINE_LIFT, obb.cz]}
      rotation={[0, obb.rot, 0]}
      userData={noExportUserData()}
    >
      <mesh position={[0, 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[obb.hx * 2, obb.hz * 2]} />
        <meshBasicMaterial
          color={tintColor}
          transparent
          opacity={isDragging ? 0.3 : 0.18}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={geomOuter} renderOrder={2}>
        <lineBasicMaterial color={outlineColor} transparent opacity={0.5} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geom} renderOrder={3}>
        <lineBasicMaterial color={outlineColor} depthTest={false} />
      </lineSegments>
      {corners.map(([x, z, sx, sz], i) => (
        <group key={i} position={[x, 0.0015, z]}>
          <mesh
            position={[(-sx * CORNER_LEN) / 2, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={4}
          >
            <planeGeometry args={[CORNER_LEN, CORNER_THICK]} />
            <meshBasicMaterial color={outlineColor} depthTest={false} />
          </mesh>
          <mesh
            position={[0, 0, (-sz * CORNER_LEN) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={4}
          >
            <planeGeometry args={[CORNER_THICK, CORNER_LEN]} />
            <meshBasicMaterial color={outlineColor} depthTest={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Draws an outline + floor tint under every selected item. Most of the
 * time `selectedItemIds` is single-element (plain click); marquee drag
 * and shift-click can populate it with several. While the primary item
 * is being dragged its outline turns green/red based on placement
 * validity; non-primary outlines stay default-coloured.
 */
export function SelectionOutline() {
  const ids = useStore(useShallow((s) => s.selectedItemIds))
  // Skip hidden items — no outline floating over a piece that isn't rendered.
  const items = useStore(
    useShallow((s) =>
      s.items.filter((i) => s.selectedItemIds.includes(i.id) && !s.hiddenItemIds.includes(i.id)),
    ),
  )
  const draggingItemId = useStore((s) => s.draggingItemId)
  const dragGroupIds = useStore(useShallow((s) => s.dragGroupOriginals.map((g) => g.id)))
  const dragValid = useStore((s) => s.dragValid)
  // Non-reactive accessor — re-renders on selection/items/drag, not catalog churn.
  const { ref: catalogRef } = useCatalogGetter()

  if (ids.length === 0) return null

  // During a group drag, colour every member's outline by validity (not
  // just the anchor) so the feedback matches the visual translation.
  const draggingSet = new Set(
    dragGroupIds.length > 0 ? dragGroupIds : draggingItemId ? [draggingItemId] : [],
  )

  return (
    <>
      {items.map((item) => {
        const def = catalogRef.current[item.defId]
        if (!def) return null
        return (
          <ItemOutline
            key={item.id}
            item={item}
            def={def}
            isDragging={draggingSet.has(item.id)}
            dragValid={dragValid}
          />
        )
      })}
    </>
  )
}
