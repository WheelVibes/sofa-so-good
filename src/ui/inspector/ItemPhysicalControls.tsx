import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { Button } from '../controls/Button'
import { SliderField } from '../controls/SliderField'
import { Icon } from '../toolbar/icons'

/**
 * Per-item elevation (off-floor height, SweetHome3DJS parity) slider + numeric
 * field. Gated by `elevationOn && !item.locked` in `InspectorPanel.tsx`.
 */
export function ElevationControl({ item }: { item: FurnitureItem }) {
  const setItemElevation = useStore((s) => s.setItemElevation)
  const ceiling = useStore((s) => s.floorPlan.ceilingHeight)
  return (
    <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
      <div
        className="label"
        style={{
          fontSize: 'var(--t-2xs)',
          color: 'var(--text-3)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Elevation (off floor)</span>
        <input
          type="number"
          min={0}
          max={Math.max(0.1, ceiling)}
          step={0.05}
          key={(item.elevation ?? 0).toFixed(2)}
          defaultValue={(item.elevation ?? 0).toFixed(2)}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v))
              setItemElevation(item.id, Math.min(Math.max(0.1, ceiling), Math.max(0, v)))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          aria-label="Elevation above floor (m)"
          style={{
            width: '58px',
            textAlign: 'right',
            background: 'var(--surface)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--r-1)',
            padding: '1px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--t-2xs)',
            color: 'var(--text)',
          }}
        />
      </div>
      <input
        type="range"
        className="slider"
        aria-label="Elevation above floor"
        min={0}
        max={Math.max(0.1, ceiling)}
        step={0.05}
        value={item.elevation ?? 0}
        onChange={(e) => setItemElevation(item.id, Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

/**
 * Per-item opacity (ghost) slider + "hide in 3D view" checkbox. Gated by
 * `itemOpacityOn` in `InspectorPanel.tsx`.
 */
export function OpacityControl({ item }: { item: FurnitureItem }) {
  const toggleItemHidden = useStore((s) => s.toggleItemHidden)
  const itemHidden = useStore((s) => s.hiddenItemIds.includes(item.id))
  return (
    <div className="fld" style={{ display: 'block', marginTop: 'var(--s-2)' }}>
      <SliderField
        label="Opacity"
        ariaLabel="Item opacity"
        min={0.15}
        max={1}
        step={0.05}
        value={item.props['opacity'] != null ? Number(item.props['opacity']) : 1}
        onChange={(v) => useStore.getState().updateItemProps(item.id, { opacity: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <label
        className="flex items-center gap-2"
        style={{ marginTop: 'var(--s-1)', fontSize: 'var(--t-sm)' }}
      >
        <input type="checkbox" checked={itemHidden} onChange={() => toggleItemHidden(item.id)} />
        <span>Hide in 3D view</span>
      </label>
    </div>
  )
}

/**
 * Isolate/solo toggle (FEAT-C): one-tap button that dims every OTHER placed
 * item so this piece stands out — Blender local-view / SketchUp isolate
 * parity for a dense furnished room. Gated by the `isolateSelection` flag in
 * `InspectorPanel.tsx`. Session-only (`isolateSlice.isolateActive`); the
 * button reflects live state and auto-clears (handled centrally in
 * `state/store.ts`) the moment the selection changes.
 */
export function IsolateControl() {
  const isolateActive = useStore((s) => s.isolateActive)
  const toggleIsolateSelection = useStore((s) => s.toggleIsolateSelection)
  return (
    <Button
      variant={isolateActive ? 'accent' : 'soft'}
      block
      icon={<Icon.Focus width={14} height={14} />}
      onClick={toggleIsolateSelection}
      title={
        isolateActive
          ? 'Exit isolate — show every item normally'
          : 'Isolate — dim everything else to focus on this item'
      }
      style={{ marginTop: 'var(--s-2)' }}
    >
      {isolateActive ? 'Exit isolate' : 'Isolate'}
    </Button>
  )
}
