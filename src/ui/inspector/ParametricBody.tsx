import { useState } from 'react'
import { itemFootprint } from '../../collision/placement'
import { useFeature } from '../../features/useFeature'
import {
  defaultParamProps,
  type FurnitureItem,
  type ParametricDef,
  type ParamField,
  type ParamValue,
} from '../../furniture/types'
import { useMaterials } from '../../materials/useMaterial'
import { useStore } from '../../state/store'
import { formatDimsShort } from '../../utils/measurement'
import { ColorField, EnumField, IntegerField, NumberField } from './fields'
import { InspectorSection } from './InspectorSection'
import { MountHeightPresets } from './MountHeightPresets'
import { QuickFinishes } from './QuickFinishes'

interface ParametricBodyProps {
  item: FurnitureItem
  def: ParametricDef
}

/** Builds the extra "apply a catalog / downloaded CC0 material" options for a
 *  wood/surface `finish` dropdown. Offers surface-like procedural finishes
 *  (wood, marble, tile, …) and any downloaded PBR materials, encoded as
 *  `mat:<materialId>` so the furniture material loader picks them up.
 *  Shared with the GLB designer's per-part texture picker (`PartInspector`). */
export function useSurfaceMaterialOptions(): { value: string; label: string }[] {
  const materials = useMaterials()
  return Object.values(materials)
    .filter((m) => m.kind === 'textured' || m.category === 'floor')
    .map((m) => ({
      value: `mat:${m.id}`,
      label: m.kind === 'textured' ? `${m.name} — CC0 DLC` : `${m.name}`,
    }))
}

/**
 * Inspector body for a parametric item: the schema-driven property controls
 * (size/form/finish/colour) plus a **universal Size** section that scales the
 * whole primitive (CUSTOMIZE-PARAM-SIZE) — uniform or per-axis, by multiplier or
 * exact metres — mirroring the GLB scale UI. The scale rides `props.scale` /
 * `scaleX/Y/Z`, which `Furniture` applies as a render-group scale and
 * `itemFootprint` already folds into collision, so the two stay consistent.
 */
export function ParametricBody({ item, def }: ParametricBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const units = useStore((s) => s.units)
  const surfaceMaterials = useSurfaceMaterialOptions()
  const mountPresetsOn = useFeature('mountHeights')

  const setProp = (key: string, value: ParamValue) => updateItemProps(item.id, { [key]: value })

  // ── Universal size (scale) ────────────────────────────────────────────────
  const scale = typeof item.props['scale'] === 'number' ? (item.props['scale'] as number) : 1
  const ax = (k: string) => (typeof item.props[k] === 'number' ? (item.props[k] as number) : scale)
  const sx = ax('scaleX')
  const sy = ax('scaleY')
  const sz = ax('scaleZ')
  const [keepProportions, setKeepProportions] = useState(sx === sy && sy === sz)
  // Real-world footprint at the current scale (W/D from itemFootprint, which
  // already applies scaleX/scaleZ; H from the def's authored footprint × scaleY).
  const fp = itemFootprint({ ...item, rotation: 0 }, def)
  const baseW = fp.hx * 2 > 0 ? (fp.hx * 2) / sx : def.defaultFootprint.w
  const baseD = fp.hz * 2 > 0 ? (fp.hz * 2) / sz : def.defaultFootprint.d
  const baseH = def.defaultFootprint.h
  const dims = formatDimsShort([baseW * sx, baseD * sz], units)
  const setUniform = (v: number) =>
    updateItemProps(item.id, { scale: v, scaleX: v, scaleY: v, scaleZ: v })
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
  const resized = sx !== 1 || sy !== 1 || sz !== 1

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

  const sizeSection = (
    <InspectorSection
      title="Size"
      defaultOpen={proMode}
      headerRight={
        resized ? (
          <button
            type="button"
            className="prop-reset"
            onClick={() => updateItemProps(item.id, { scale: 1, scaleX: 1, scaleY: 1, scaleZ: 1 })}
            title="Reset to the original size"
          >
            Reset
          </button>
        ) : null
      }
    >
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
              if (on) setUniform(sx)
            }}
          />
          <span>Keep proportions</span>
        </label>
        {/* Exact-size entry (metres): type a real dimension and the scale is
            back-solved. Sliders above stay for quick coarse resizing. */}
        <div className="flex items-center gap-1">
          <DimField label="W" axis="W" value={baseW * sx} />
          <DimField label="D" axis="D" value={baseD * sz} />
          <DimField label="H" axis="H" value={baseH * sy} />
        </div>
        <div className="text-[11px] text-[var(--text-3)]">{dims}</div>
      </div>
    </InspectorSection>
  )

  if (def.paramSchema.length === 0) return sizeSection

  // Reset every schema-driven prop (size/form/finish/colour) back to the def's
  // defaults. Differs from the current props → only show when something changed.
  const defaults = defaultParamProps(def)
  const isModified = Object.keys(defaults).some((k) => item.props[k] !== defaults[k])
  return (
    <>
      <InspectorSection
        title="Properties"
        defaultOpen={proMode}
        headerRight={
          isModified ? (
            <button
              type="button"
              className="prop-reset"
              onClick={() => updateItemProps(item.id, defaults)}
              title="Reset size, form, finish and colour to this item's defaults"
            >
              Reset
            </button>
          ) : null
        }
      >
        {def.paramSchema.map((rawField) => {
          // A wood/surface "finish" enum (one offering a Wood option) gains extra
          // entries for any catalog / downloaded CC0 PBR material, plus a curated
          // one-tap quick-finish swatch row.
          const isSurfaceFinish =
            rawField.kind === 'enum' &&
            rawField.key === 'finish' &&
            rawField.options.some((o) => o.value === 'wood')
          const field: ParamField =
            isSurfaceFinish && surfaceMaterials.length > 0
              ? { ...rawField, options: [...rawField.options, ...surfaceMaterials] }
              : rawField
          const v = item.props[field.key] ?? field.default
          switch (field.kind) {
            case 'number': {
              const numVal = typeof v === 'number' ? v : field.default
              return (
                <div key={field.key}>
                  <NumberField
                    field={field}
                    value={numVal}
                    onChange={(n) => setProp(field.key, n)}
                  />
                  {mountPresetsOn && field.key === 'mountHeight' ? (
                    <MountHeightPresets
                      defId={def.id}
                      value={numVal}
                      min={field.min}
                      max={field.max}
                      onPick={(h) => setProp(field.key, h)}
                    />
                  ) : null}
                </div>
              )
            }
            case 'integer':
              return (
                <IntegerField
                  key={field.key}
                  field={field}
                  value={typeof v === 'number' ? v : field.default}
                  onChange={(n) => setProp(field.key, n)}
                />
              )
            case 'color':
              return (
                <ColorField
                  key={field.key}
                  field={field}
                  value={typeof v === 'string' ? v : field.default}
                  onChange={(s) => setProp(field.key, s)}
                />
              )
            case 'enum':
              return (
                <div key={field.key}>
                  <EnumField
                    field={field}
                    value={typeof v === 'string' ? v : field.default}
                    onChange={(s) => setProp(field.key, s)}
                  />
                  {isSurfaceFinish ? (
                    <QuickFinishes
                      value={typeof v === 'string' ? v : field.default}
                      onPick={(val) => setProp(field.key, val)}
                    />
                  ) : null}
                </div>
              )
            default:
              return null
          }
        })}
      </InspectorSection>
      {sizeSection}
    </>
  )
}
