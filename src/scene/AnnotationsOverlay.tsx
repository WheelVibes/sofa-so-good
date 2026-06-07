import { Html } from '@react-three/drei'
import { useShallow } from 'zustand/react/shallow'
import type { MeasurementAnnotation } from '../state/slices/measurementsSlice'
import { useStore } from '../state/store'
import { formatArea, formatDims, formatLength } from '../utils/measurement'

const LIFT = 0.028 // just below the active tape (0.03) so live tape draws above
const COLOR = '#475569' // slate — distinct from the amber tape + blue selection

/** Renders the persisted dimension callouts (`measurementsSlice.annotations`) —
 *  flat slate bars (line) / fills (rect) with a distance/area label and a small
 *  ✕ to remove each. Read-only display (no click plane), always shown when any
 *  exist, in both orbit and walk. Distinct slate colour separates pinned
 *  callouts from the live amber tape. */
export function AnnotationsOverlay() {
  const annotations = useStore(useShallow((s) => s.annotations))
  const units = useStore((s) => s.units)
  const removeAnnotation = useStore((s) => s.removeAnnotation)
  if (annotations.length === 0) return null
  return (
    <group>
      {annotations.map((ann) => (
        <Annotation
          key={ann.id}
          ann={ann}
          units={units}
          onRemove={() => removeAnnotation(ann.id)}
        />
      ))}
    </group>
  )
}

function Annotation({
  ann,
  units,
  onRemove,
}: {
  ann: MeasurementAnnotation
  units: 'metric' | 'imperial'
  onRemove: () => void
}) {
  const { a, b, shape } = ann
  const cx = (a[0] + b[0]) / 2
  const cz = (a[1] + b[1]) / 2

  if (shape === 'rect') {
    const w = Math.abs(b[0] - a[0])
    const d = Math.abs(b[1] - a[1])
    if (w < 1e-4 || d < 1e-4) return null
    return (
      <group>
        <mesh position={[cx, LIFT, cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial
            color={COLOR}
            transparent
            opacity={0.16}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <Label
          cx={cx}
          cz={cz}
          text={`${formatDims(w, d, units)} · ${formatArea(w * d, units)}`}
          onRemove={onRemove}
        />
      </group>
    )
  }

  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1e-4) return null
  const rot = Math.atan2(b[1] - a[1], b[0] - a[0])
  return (
    <group>
      <group position={[cx, LIFT, cz]} rotation={[0, -rot, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
          <planeGeometry args={[len, 0.02]} />
          <meshBasicMaterial color={COLOR} depthTest={false} depthWrite={false} transparent />
        </mesh>
      </group>
      <Label cx={cx} cz={cz} text={formatLength(len, units)} onRemove={onRemove} />
    </group>
  )
}

/** A themed callout label with a small ✕ to delete the pin. */
function Label({
  cx,
  cz,
  text,
  onRemove,
}: {
  cx: number
  cz: number
  text: string
  onRemove: () => void
}) {
  return (
    <Html position={[cx, LIFT + 0.05, cz]} center distanceFactor={9}>
      <div className="flex items-center gap-1 rounded bg-[var(--surface-solid)]/95 px-1.5 py-0.5 text-xs font-semibold text-[var(--text)] shadow whitespace-nowrap">
        <span className="pointer-events-none">{text}</span>
        <button
          type="button"
          aria-label="Remove dimension"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="leading-none text-[var(--text-3)] hover:text-[var(--danger)]"
          style={{ fontSize: 13 }}
        >
          ×
        </button>
      </div>
    </Html>
  )
}
