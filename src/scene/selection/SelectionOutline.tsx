import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { useShallow } from 'zustand/react/shallow'
import {
  itemFootprint,
  itemFootprintPartsLocal,
  itemFootprintSpanLocal,
} from '../../collision/placement'
import { noExportUserData } from '../../export/sceneGltf'
import { useCatalogGetter } from '../../furniture/catalog'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { boxEdges, useDisposeGeometry } from '../geometryUtil'
import { APPEAR_MS, appearScale } from './selectionAppear'

/** Stable empty result so the selector returns the SAME reference when nothing is
 *  selected (useShallow no-op) and skips the per-change items scan (PERF-007). */
const NO_ITEMS: FurnitureItem[] = []

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
  // The selection box + resize brackets bound the TRUE geometry: the minimum
  // spanning box of the footprint parts (an L-sofa's 2× deeper main-run+chaise),
  // not the depth-only enclosing OBB. `span` is relative to the OBB centre, so
  // the brackets sit in an inner group offset by it.
  const span = itemFootprintSpanLocal(item, def)
  const w = span.hx * 2 + OUTLINE_PAD
  const d = span.hz * 2 + OUTLINE_PAD
  const wOuter = span.hx * 2 + OUTLINE_PAD_OUTER
  const dOuter = span.hz * 2 + OUTLINE_PAD_OUTER
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
  // Shape-accurate floor tint: one plane per collision-footprint part, so an
  // L-sofa / corner cabinet tints its true L (matching what collision uses).
  // Single-part pieces yield exactly the old centred rectangle.
  const tintParts = itemFootprintPartsLocal(item, def)

  const cx = w / 2
  const cz = d / 2
  const corners = [
    [cx, cz, 1, 1],
    [-cx, cz, -1, 1],
    [cx, -cz, 1, -1],
    [-cx, -cz, -1, -1],
  ] as const

  // Gentle scale-in on select (selectionAppear.ts): the whole indicator eases up
  // from slightly smaller instead of popping. Plays once on mount (the outline
  // mounts when the item enters the selection); a no-op thereafter. Short enough
  // to complete within the demand-mode settle tail, but we invalidate to be safe.
  const appearRef = useRef<Group>(null)
  const mountRef = useRef(performance.now())
  const invalidate = useThree((s) => s.invalidate)
  useFrame(() => {
    const g = appearRef.current
    if (!g) return
    const elapsed = performance.now() - mountRef.current
    g.scale.setScalar(appearScale(elapsed))
    if (elapsed < APPEAR_MS) invalidate()
  })

  return (
    <group
      ref={appearRef}
      position={[obb.cx, OUTLINE_LIFT, obb.cz]}
      rotation={[0, obb.rot, 0]}
      userData={noExportUserData()}
    >
      {tintParts.map((p, i) => (
        <mesh
          key={i}
          position={[p.ox, 0.0005, p.oz]}
          rotation={[-Math.PI / 2, 0, p.rot]}
          renderOrder={1}
        >
          <planeGeometry args={[p.hx * 2, p.hz * 2]} />
          <meshBasicMaterial
            color={tintColor}
            transparent
            opacity={isDragging ? 0.3 : 0.18}
            depthWrite={false}
          />
        </mesh>
      ))}
      <group position={[span.ox, 0, span.oz]}>
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
  // Short-circuit when nothing is selected (the common case) so a store change
  // doesn't scan all items; otherwise filter via Sets (O(n), not O(n·m)) — PERF-007.
  const items = useStore(
    useShallow((s) => {
      if (s.selectedItemIds.length === 0) return NO_ITEMS
      const sel = new Set(s.selectedItemIds)
      const hidden = new Set(s.hiddenItemIds)
      return s.items.filter((i) => sel.has(i.id) && !hidden.has(i.id))
    }),
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
