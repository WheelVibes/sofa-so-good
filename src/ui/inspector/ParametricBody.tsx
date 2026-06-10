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
 *  `mat:<materialId>` so the furniture material loader picks them up. */
function useSurfaceMaterialOptions(): { value: string; label: string }[] {
  const materials = useMaterials()
  return Object.values(materials)
    .filter((m) => m.kind === 'textured' || m.category === 'floor')
    .map((m) => ({
      value: `mat:${m.id}`,
      label: m.kind === 'textured' ? `${m.name} — CC0 DLC` : `${m.name}`,
    }))
}

/** Renders one schema-driven control per ParamField. dispatches via
 *  updateItemProps so the change is reflected in the scene immediately
 *  (memoised Furniture re-renders only this item). */
export function ParametricBody({ item, def }: ParametricBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const surfaceMaterials = useSurfaceMaterialOptions()
  const mountPresetsOn = useFeature('mountHeights')

  const setProp = (key: string, value: ParamValue) => updateItemProps(item.id, { [key]: value })

  if (def.paramSchema.length === 0) return null

  // Reset every schema-driven prop (size/form/finish/colour) back to the def's
  // defaults. Differs from the current props → only show when something changed.
  const defaults = defaultParamProps(def)
  const isModified = Object.keys(defaults).some((k) => item.props[k] !== defaults[k])
  return (
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
                <NumberField field={field} value={numVal} onChange={(n) => setProp(field.key, n)} />
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
  )
}
