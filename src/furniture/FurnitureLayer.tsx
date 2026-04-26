import { useShallow } from 'zustand/react/shallow';
import { Furniture } from './Furniture';
import { useCatalog } from './catalog';
import { useStore } from '../state/store';

/**
 * Mounts one <Furniture> per item in the store. Each instance receives
 * its def by reference so memoised children only re-render when the
 * item or its def actually changes.
 */
export function FurnitureLayer() {
  const items = useStore(useShallow((s) => s.items));
  const catalog = useCatalog();
  return (
    <group>
      {items.map((item) => {
        const def = catalog[item.defId];
        if (!def) return null;
        return <Furniture key={item.id} item={item} def={def} />;
      })}
    </group>
  );
}
