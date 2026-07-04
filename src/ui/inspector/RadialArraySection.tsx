import { useState } from 'react'
import { canPlace } from '../../collision/placement'
import { placementWalls } from '../../collision/placementWalls'
import { radialArrayPlacements } from '../../furniture/radialArray'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * Radial/polar array (e.g. chairs around a round table). Places N copies
 * evenly around a circle centred on the selected item; each is
 * collision-checked, and copies that don't fit are skipped (not contiguous
 * like the linear array — a blocked slot shouldn't break the full ring).
 *
 * Pure placement math lives in `radialArray.ts`; this component owns only the
 * inspector controls + the collision-checked, single-undo-step commit
 * (mirroring `PathArraySection`/`ScatterFillSection`). Rendered as a sibling
 * of the other array sections in `InspectorPanel`, gated by `proMode &&
 * radialArrayOn`.
 */
export function RadialArraySection({
  item,
  def,
  catalog,
}: {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
}) {
  const [radialCount, setRadialCount] = useState(6)
  const [radialRadius, setRadialRadius] = useState(1.0)
  const [radialStartAngle, setRadialStartAngle] = useState(0)
  const [radialSweep, setRadialSweep] = useState(360)
  const [radialFaceCenter, setRadialFaceCenter] = useState(true)

  const duplicateRadial = () => {
    const st = useStore.getState()
    const count = Math.max(2, Math.min(36, Math.round(radialCount)))
    const r = Math.max(0.01, radialRadius)
    const sweep = Math.max(0, Math.min(360, radialSweep))
    if (sweep === 0) return
    const placements = radialArrayPlacements({
      center: item.position,
      radius: r,
      count,
      startAngle: (radialStartAngle * Math.PI) / 180,
      sweep: (sweep * Math.PI) / 180,
      faceCenter: radialFaceCenter,
      baseRotation: item.rotation,
    })
    const gid =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `grp-${Date.now()}`
    const newItems: FurnitureItem[] = []
    let others = st.items
    for (const { position: pos, rotation: rot } of placements) {
      const probe = {
        id: 'radial-probe',
        defId: item.defId,
        position: pos,
        rotation: rot,
        props: item.props,
      }
      // Skip blocked slots (unlike linear array, we don't stop at first blocked —
      // a ring should fill as many valid positions as possible).
      if (
        !canPlace(probe, def, { others, defs: catalog, doors: st.doors, walls: placementWalls(st) })
      )
        continue
      const ni: FurnitureItem = {
        ...item,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `id-${Date.now()}-${newItems.length}`,
        position: pos,
        rotation: rot,
        props: { ...item.props },
        groupId: gid,
      }
      newItems.push(ni)
      others = [...others, ni]
    }
    if (newItems.length === 0) return
    st.pushHistory()
    st.setItems(
      st.items.map((it) => (it.id === item.id ? { ...it, groupId: gid } : it)).concat(newItems),
    )
  }

  return (
    <div
      className="act-array act-array--radial"
      title="Place copies evenly around a circle (e.g. chairs around a round table)"
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-2)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Radial array</span>
        <button
          type="button"
          className="act-array-go"
          onClick={duplicateRadial}
          style={{ marginLeft: 'auto' }}
        >
          <Icon.Copy width={13} height={13} />
          Go
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Count
          </span>
          <input
            type="number"
            min={2}
            max={36}
            value={radialCount}
            onChange={(e) => setRadialCount(Number(e.target.value) || 2)}
            aria-label="Number of copies in the radial array"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Radius (m)
          </span>
          <input
            type="number"
            min={0.05}
            max={20}
            step={0.05}
            value={radialRadius}
            onChange={(e) => setRadialRadius(Number(e.target.value) || 0.5)}
            aria-label="Ring radius in metres"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Start angle (°)
          </span>
          <input
            type="number"
            min={-360}
            max={360}
            step={15}
            value={radialStartAngle}
            onChange={(e) => setRadialStartAngle(Number(e.target.value))}
            aria-label="Starting angle in degrees"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
        <label className="fld" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label" style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
            Sweep (°)
          </span>
          <input
            type="number"
            min={1}
            max={360}
            step={15}
            value={radialSweep}
            onChange={(e) => setRadialSweep(Number(e.target.value) || 360)}
            aria-label="Total angular sweep in degrees"
            className="input"
            style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}
          />
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={radialFaceCenter}
          onChange={(e) => setRadialFaceCenter(e.target.checked)}
          aria-label="Face center — rotate each copy to face the ring centre"
        />
        <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-2)' }}>Face centre</span>
      </label>
    </div>
  )
}
