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
  const surfaceMaterials = useSurfaceMaterialOptions()

  const setProp = (key: string, value: ParamValue) => updateItemProps(item.id, { [key]: value })

  if (def.paramSchema.length === 0) return null

  // Reset every schema-driven prop (size/form/finish/colour) back to the def's
  // defaults. Differs from the current props → only show when something changed.
  const defaults = defaultParamProps(def)
  const isModified = Object.keys(defaults).some((k) => item.props[k] !== defaults[k])
  return (
    <div className="sec">
      <div className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Properties</span>
        {isModified ? (
          <button
            type="button"
            className="prop-reset"
            onClick={() => updateItemProps(item.id, defaults)}
            title="Reset size, form, finish and colour to this item's defaults"
          >
            Reset
          </button>
        ) : null}
      </div>
      {def.paramSchema.map((rawField) => {
        // Surface "finish" enums (those offering a Wood option) gain extra
        // entries for any catalog / downloaded CC0 PBR material.
        const field: ParamField =
          rawField.kind === 'enum' &&
          rawField.key === 'finish' &&
          rawField.options.some((o) => o.value === 'wood') &&
          surfaceMaterials.length > 0
            ? { ...rawField, options: [...rawField.options, ...surfaceMaterials] }
            : rawField
        const v = item.props[field.key] ?? field.default
        switch (field.kind) {
          case 'number':
            return (
              <NumberField
                key={field.key}
                field={field}
                value={typeof v === 'number' ? v : field.default}
                onChange={(n) => setProp(field.key, n)}
              />
            )
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
              <EnumField
                key={field.key}
                field={field}
                value={typeof v === 'string' ? v : field.default}
                onChange={(s) => setProp(field.key, s)}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
