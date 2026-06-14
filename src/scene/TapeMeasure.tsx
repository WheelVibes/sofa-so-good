import { Html } from '@react-three/drei'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { noExportUserData } from '../export/sceneGltf'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { useCatalogGetter } from '../furniture/catalog'
import { useStore } from '../state/store'
import { formatArea, formatDims, formatLength } from '../utils/measurement'
import { priorityRaycast } from './raycastPriority'
import { snapToNearest } from './tapeSnap'

const LIFT = 0.03
const MARKER = '#f59e0b' // amber — distinct from the blue selection/rotate UI
const PAD = 4 // metres of click-plane margin beyond the apartment box

/** A small ring marker laid flat on the floor at an endpoint. */
function Marker({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, LIFT, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <ringGeometry args={[0.04, 0.075, 24]} />
      <meshBasicMaterial color={MARKER} depthTest={false} depthWrite={false} transparent />
    </mesh>
  )
}

/**
 * Point-to-point tape measure. While `tapeMode` is on a transparent floor plane
 * captures clicks: the first drops the start point, the second the end (showing
 * the live distance), and a third starts a fresh measurement. A rubber-band line
 * + distance label follow the cursor between the first click and the second.
 * Floor-plane only (XZ); endpoints, line and label draw always-on-top so they
 * read over furniture. Amber to stay distinct from the blue selection/rotate UI.
 *
 * Mounted in the main scene; the click plane is only present while active, so it
 * never interferes with normal selection/placement.
 */
export function TapeMeasure() {
  const tapeMode = useStore((s) => s.tapeMode)
  const points = useStore(useShallow((s) => s.tapePoints))
  const addTapePoint = useStore((s) => s.addTapePoint)
  const units = useStore((s) => s.units)
  const tapeShape = useStore((s) => s.tapeShape)
  const addAnnotation = useStore((s) => s.addAnnotation)
  const clearTape = useStore((s) => s.clearTape)
  const { ref: catalogRef } = useCatalogGetter()
  const [cursor, setCursor] = useState<[number, number] | null>(null)

  if (!tapeMode) return null

  // Pin the *completed* measurement (both points placed) as a persistent
  // annotation, then clear the tape to start fresh.
  const complete = points.length === 2
  const pin = () => {
    if (points[0] && points[1]) {
      addAnnotation(points[0], points[1], tapeShape)
      clearTape()
    }
  }

  // Snap a clicked floor point to the nearest furniture corner or wall endpoint
  // (within TAPE_SNAP_DISTANCE) so measurements catch exact corners. Candidates
  // are gathered lazily on click (rare) to avoid extra subscriptions.
  const snapClick = (px: number, pz: number): [number, number] => {
    const st = useStore.getState()
    const cands: [number, number][] = []
    for (const it of st.items) {
      const def = catalogRef.current[it.defId]
      if (!def) continue
      for (const c of obbCorners(itemFootprint(it, def))) cands.push(c)
    }
    const walls = isDefaultPlan(st.floorPlan)
      ? buildCollisionWalls(st.doors)
      : planCollisionWalls(st.floorPlan, st.doors)
    for (const w of walls) {
      cands.push([w.ax, w.az], [w.bx, w.bz])
    }
    return snapToNearest(px, pz, cands)
  }

  // The segment to draw: a completed [a,b], or live [a, cursor] while placing.
  const a = points[0] ?? null
  const b = points[1] ?? (points.length === 1 ? cursor : null)
  let bar: { len: number; mx: number; mz: number; rot: number } | null = null
  let rect: { w: number; d: number; cx: number; cz: number } | null = null
  if (a && b) {
    if (tapeShape === 'rect') {
      const w = Math.abs(b[0] - a[0])
      const d = Math.abs(b[1] - a[1])
      if (w > 1e-4 && d > 1e-4) {
        rect = { w, d, cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2 }
      }
    } else {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len > 1e-4) {
        bar = {
          len,
          mx: (a[0] + b[0]) / 2,
          mz: (a[1] + b[1]) / 2,
          rot: Math.atan2(b[1] - a[1], b[0] - a[0]),
        }
      }
    }
  }

  return (
    <group userData={noExportUserData()}>
      {/* Transparent floor click/track plane (apartment-sized + margin). The
          priority raycast makes it win the pick over furniture/walls so a click
          anywhere drops a floor point (then snaps to nearby corners). */}
      <mesh
        ref={priorityRaycast}
        position={[APARTMENT_EXT_W / 2, LIFT, APARTMENT_EXT_D / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          addTapePoint(snapClick(e.point.x, e.point.z))
        }}
        onPointerMove={(e) => setCursor([e.point.x, e.point.z])}
      >
        <planeGeometry args={[APARTMENT_EXT_W + PAD * 2, APARTMENT_EXT_D + PAD * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {a ? <Marker x={a[0]} z={a[1]} /> : null}
      {points[1] ? <Marker x={points[1][0]} z={points[1][1]} /> : null}

      {bar ? (
        <>
          {/* Flat amber ruler bar running a→b on the floor. */}
          <group position={[bar.mx, LIFT, bar.mz]} rotation={[0, -bar.rot, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
              <planeGeometry args={[bar.len, 0.022]} />
              <meshBasicMaterial color={MARKER} depthTest={false} depthWrite={false} transparent />
            </mesh>
          </group>
          <Html position={[bar.mx, LIFT + 0.05, bar.mz]} center distanceFactor={9}>
            <div className="flex items-center gap-1.5 rounded bg-[var(--surface-solid)]/95 px-2 py-0.5 text-xs font-semibold text-[var(--text)] shadow whitespace-nowrap">
              <span className="pointer-events-none">{formatLength(bar.len, units)}</span>
              {complete ? <PinButton onClick={pin} /> : null}
            </div>
          </Html>
        </>
      ) : null}

      {rect ? (
        <>
          {/* Translucent amber fill over the measured rectangle. */}
          <mesh position={[rect.cx, LIFT, rect.cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
            <planeGeometry args={[rect.w, rect.d]} />
            <meshBasicMaterial
              color={MARKER}
              transparent
              opacity={0.22}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <Html position={[rect.cx, LIFT + 0.05, rect.cz]} center distanceFactor={9}>
            <div className="flex items-center gap-1.5 rounded bg-[var(--surface-solid)]/95 px-2 py-0.5 text-xs font-semibold text-[var(--text)] shadow whitespace-nowrap">
              <span className="pointer-events-none">{`${formatDims(rect.w, rect.d, units)} · ${formatArea(rect.w * rect.d, units)}`}</span>
              {complete ? <PinButton onClick={pin} /> : null}
            </div>
          </Html>
        </>
      ) : null}
    </group>
  )
}

/** A small "Pin" button shown on a completed measurement — saves it as a
 *  persistent annotation. */
function PinButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Pin this dimension to the design"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
    >
      📌 Pin
    </button>
  )
}
