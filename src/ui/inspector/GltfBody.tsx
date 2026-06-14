import { useState } from 'react'
import { itemFootprint } from '../../collision/placement'
import type { FurnitureItem, GltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'

interface GltfBodyProps {
  item: FurnitureItem
  def: GltfDef
}

/** GLTF-backed items expose a small set of generic controls — scale (uniform or
 *  per-axis W/D/H), optional tint, and (for built-ins) the attribution string so
 *  users can credit the asset author. */
export function GltfBody({ item, def }: GltfBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps)
  const units = useStore((s) => s.units)
  const scale = typeof item.props['scale'] === 'number' ? item.props['scale'] : (def.scale ?? 1)
  const ax = (k: string) => (typeof item.props[k] === 'number' ? (item.props[k] as number) : scale)
  const sx = ax('scaleX')
  const sy = ax('scaleY')
  const sz = ax('scaleZ')
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : ''
  const reflective = item.props['reflective'] === 1
  // Keep-proportions defaults on for an unscaled/uniform item (SH3D resize UX).
  const [keepProportions, setKeepProportions] = useState(sx === sy && sy === sz)

  // Resulting real-world footprint at the current scale (unrotated), so the
  // user sizes in real dimensions rather than a bare multiplier.
  const fp = itemFootprint({ ...item, rotation: 0 }, def)
  const dims = formatDimsShort([fp.hx * 2, fp.hz * 2], units)

  // Write all four scale props so the per-axis values stay authoritative.
  const setUniform = (v: number) =>
    updateItemProps(item.id, { scale: v, scaleX: v, scaleY: v, scaleZ: v })

  const AxisSlider = ({ label, prop, value }: { label: string; prop: string; value: number }) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="w-12">{label}</span>
      <input
        type="range"
        min={0.25}
        max={3}
        step={0.05}
        value={value}
        onChange={(e) => updateItemProps(item.id, { [prop]: Number(e.target.value) })}
        className="flex-1 accent-blue-500"
      />
      <span className="w-12 text-right font-mono">{value.toFixed(2)}×</span>
    </label>
  )

  return (
    <div className="space-y-2">
      {keepProportions ? (
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="flex-1">Scale</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={sx}
            onChange={(e) => setUniform(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="w-12 text-right font-mono">{sx.toFixed(2)}×</span>
        </label>
      ) : (
        <>
          <AxisSlider label="Width" prop="scaleX" value={sx} />
          <AxisSlider label="Height" prop="scaleY" value={sy} />
          <AxisSlider label="Depth" prop="scaleZ" value={sz} />
        </>
      )}
      <label className="flex items-center gap-2 text-[11px] text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={keepProportions}
          onChange={(e) => {
            const on = e.target.checked
            setKeepProportions(on)
            if (on) setUniform(sx) // collapse to the current width on re-lock
          }}
        />
        <span>Keep proportions</span>
      </label>
      <p className="text-right text-[10px] text-[var(--text-3)] font-mono">≈ {dims}</p>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex-1">Tint</span>
        <input
          type="color"
          value={tint || '#ffffff'}
          onChange={(e) => updateItemProps(item.id, { tint: e.target.value })}
          className="h-6 w-10 cursor-pointer rounded border border-[var(--border-2)]"
        />
        {tint ? (
          <button
            onClick={() => updateItemProps(item.id, { tint: '' })}
            className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
          >
            clear
          </button>
        ) : null}
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={reflective}
          onChange={(e) => updateItemProps(item.id, { reflective: e.target.checked ? 1 : 0 })}
        />
        <span className="flex-1">Reflective surface (mirror)</span>
      </label>
      {reflective ? (
        <p className="text-[10px] text-[var(--text-3)]">
          Reflects the room on the High / Maximum graphics tiers; the model's largest flat face
          becomes the mirror.
        </p>
      ) : null}
      {/* Built-in attribution + licence is rendered once by <SourceLine> in
          InspectorPanel (with a source link), so it's not repeated here. */}
      {def.source === 'user' ? (
        <p className="pt-1 text-[10px] text-[var(--text-3)]">
          Uploaded {new Date(def.uploadedAt).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  )
}
