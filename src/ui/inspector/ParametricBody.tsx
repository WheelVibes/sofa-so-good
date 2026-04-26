import type { FurnitureItem, ParametricDef, ParamValue } from '../../furniture/types';
import { useStore } from '../../state/store';
import { ColorField, EnumField, IntegerField, NumberField } from './fields';

interface ParametricBodyProps {
  item: FurnitureItem;
  def: ParametricDef;
}

/** Renders one schema-driven control per ParamField. dispatches via
 *  updateItemProps so the change is reflected in the scene immediately
 *  (memoised Furniture re-renders only this item). */
export function ParametricBody({ item, def }: ParametricBodyProps) {
  const updateItemProps = useStore((s) => s.updateItemProps);

  const setProp = (key: string, value: ParamValue) =>
    updateItemProps(item.id, { [key]: value });

  return (
    <div className="space-y-2">
      {def.paramSchema.map((field) => {
        const v = item.props[field.key] ?? field.default;
        switch (field.kind) {
          case 'number':
            return (
              <NumberField
                key={field.key}
                field={field}
                value={typeof v === 'number' ? v : field.default}
                onChange={(n) => setProp(field.key, n)}
              />
            );
          case 'integer':
            return (
              <IntegerField
                key={field.key}
                field={field}
                value={typeof v === 'number' ? v : field.default}
                onChange={(n) => setProp(field.key, n)}
              />
            );
          case 'color':
            return (
              <ColorField
                key={field.key}
                field={field}
                value={typeof v === 'string' ? v : field.default}
                onChange={(s) => setProp(field.key, s)}
              />
            );
          case 'enum':
            return (
              <EnumField
                key={field.key}
                field={field}
                value={typeof v === 'string' ? v : field.default}
                onChange={(s) => setProp(field.key, s)}
              />
            );
        }
      })}
    </div>
  );
}
