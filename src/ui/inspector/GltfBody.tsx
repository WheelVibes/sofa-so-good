import { useEffect, useReducer, useState } from 'react'
import { itemFootprint } from '../../collision/placement'
import {
  getCachedFinishTargets,
  getCachedGltfFootprint,
  subscribeFinishTargets,
} from '../../furniture/GltfModel'
import type { FurnitureItem, GltfDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { finishOverrideKey } from './ikeaBodyProps'

interface GltfBodyProps {
  item: FurnitureItem
  def: GltfDef
}

/** Texture finishes a model part can be re-skinned with (besides a flat colour).
 *  Each id is a `getSurfaceMaterial` kind, applied to the matched mesh. */
const PART_MATERIALS = [
  { id: 'wood', label: 'Wood' },
  { id: 'marble', label: 'Marble' },
  { id: 'stone', label: 'Stone' },
  { id: 'metal', label: 'Metal' },
  { id: 'rattan', label: 'Rattan' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'painted', label: 'Painted' },
  { id: 'gloss', label: 'Gloss' },
] as const

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

  // Base (scale = 1) extents in metres, so the user can size by exact dimension
  // — the W/D footprint divides out the current axis scale; the height comes
  // from the cached GLB bbox (falling back to the def's authored footprint).
  const url = def.source === 'builtin' ? def.url : def.runtimeUrl
  const baseH = (url ? getCachedGltfFootprint(url)?.h : null) ?? def.defaultFootprint.h

  // Per-part recolour: the GLB's named material/mesh groups, discovered once the
  // model loads (re-render via the subscribe notifier so pickers appear as soon
  // as a freshly placed model is ready). Each writes a `finish:<key>` override.
  const [, bumpTargets] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeFinishTargets(bumpTargets), [])
  const targets = url ? (getCachedFinishTargets(url) ?? []) : []
  const baseW = fp.hx * 2 > 0 ? (fp.hx * 2) / sx : def.defaultFootprint.w
  const baseD = fp.hz * 2 > 0 ? (fp.hz * 2) / sz : def.defaultFootprint.d
  const curW = baseW * sx
  const curD = baseD * sz
  const curH = baseH * sy

  // Write all four scale props so the per-axis values stay authoritative.
  const setUniform = (v: number) =>
    updateItemProps(item.id, { scale: v, scaleX: v, scaleY: v, scaleZ: v })

  // Size by exact metre dimension: back-solve the axis scale (clamped to a sane
  // range). With proportions locked, any axis drives a uniform rescale so the
  // model keeps its shape; unlocked, each field resizes only its own axis.
  const clampScale = (v: number) => Math.min(20, Math.max(0.05, v))
  const setDim = (axis: 'W' | 'D' | 'H', metres: number) => {
    if (!Number.isFinite(metres) || metres <= 0) return
    const base = axis === 'W' ? baseW : axis === 'D' ? baseD : baseH
    if (base <= 0) return
    const next = clampScale(metres / base)
    if (keepProportions) setUniform(next)
    else
      updateItemProps(item.id, {
        [axis === 'W' ? 'scaleX' : axis === 'D' ? 'scaleZ' : 'scaleY']: next,
      })
  }

  const DimField = ({
    label,
    axis,
    value,
  }: {
    label: string
    axis: 'W' | 'D' | 'H'
    value: number
  }) => (
    <label className="flex flex-1 items-center gap-1 text-[11px]">
      <span className="w-3.5 text-[var(--text-3)]">{label}</span>
      <input
        type="number"
        min={0.05}
        step={0.01}
        defaultValue={value.toFixed(2)}
        key={value.toFixed(2)}
        onBlur={(e) => setDim(axis, Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-full min-w-0 rounded border border-[var(--border-2)] bg-[var(--surface)] px-1 py-0.5 text-right font-mono"
      />
    </label>
  )

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
        className="flex-1 accent-[var(--accent)]"
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
            className="flex-1 accent-[var(--accent)]"
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
      {/* Exact-size entry (metres): type a real dimension and the scale is
          back-solved. Sliders above stay for quick coarse resizing. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-[var(--text-3)]">
          <span>Exact size (m)</span>
          <span className="font-mono">≈ {dims}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DimField label="W" axis="W" value={curW} />
          <DimField label="D" axis="D" value={curD} />
          <DimField label="H" axis="H" value={curH} />
        </div>
      </div>
      {/* Per-part finish: per named material in the model, pick a colour OR a
          texture (wood / marble / metal / rattan / painted / gloss) so a user can
          re-skin just the legs / seat / frame. Shown once the GLB has loaded and
          exposes 2+ parts. */}
      {targets.length >= 2 ? (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
            Part finishes
          </div>
          {targets.map((t) => {
            const key = finishOverrideKey(t.key)
            const override = typeof item.props[key] === 'string' ? (item.props[key] as string) : ''
            const isColour = override === '' || override.startsWith('#')
            const mode = isColour ? 'colour' : override
            return (
              <label key={t.key} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate" title={t.label}>
                  {t.label}
                </span>
                <select
                  value={mode}
                  onChange={(e) =>
                    updateItemProps(item.id, {
                      [key]:
                        e.target.value === 'colour'
                          ? override.startsWith('#')
                            ? override
                            : '#cfcfcf'
                          : e.target.value,
                    })
                  }
                  className="rounded border border-[var(--border-2)] bg-[var(--surface)] px-1 py-0.5 text-[10px]"
                >
                  <option value="colour">Colour</option>
                  {PART_MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {isColour ? (
                  <input
                    type="color"
                    value={override.startsWith('#') ? override : '#cfcfcf'}
                    onChange={(e) => updateItemProps(item.id, { [key]: e.target.value })}
                    className="h-6 w-9 cursor-pointer rounded border border-[var(--border-2)]"
                  />
                ) : null}
                {override ? (
                  <button
                    type="button"
                    onClick={() => updateItemProps(item.id, { [key]: '' })}
                    className="text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)]"
                  >
                    clear
                  </button>
                ) : null}
              </label>
            )
          })}
        </div>
      ) : null}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex-1">Tint {targets.length >= 2 ? '(all)' : ''}</span>
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
