import { useShallow } from 'zustand/react/shallow';
import { Furniture } from './Furniture';
import { useCatalog } from './catalog';
import { useStore } from '../state/store';
import { useQuality } from '../scene/useQuality';

/**
 * Mounts one <Furniture> per item in the store. Each instance receives
 * its def by reference so memoised children only re-render when the
 * item or its def actually changes.
 */
export function FurnitureLayer() {
  const items = useStore(useShallow((s) => s.items));
  const catalog = useCatalog();
  // Suppress per-item contact-shadow blobs while the showcase
  // AccumulativeShadows ground plane is converging, so contacts don't
  // double-darken.
  const accumulating = useStore((s) => s.showcaseAccumulating);
  const contactShadow = useQuality().contactShadows && !accumulating;
  // Re-render furniture whenever a DLC/catalog material finishes building so
  // the primitives' synchronous material lookup picks up the new texture.
  const materialEpoch = useStore((s) => s.materialEpoch);
  return (
    <group>
      {items.map((item) => {
        const def = catalog[item.defId];
        if (!def) return null;
        return (
          <Furniture
            key={item.id}
            item={item}
            def={def}
            contactShadow={contactShadow}
            materialEpoch={materialEpoch}
          />
        );
      })}
    </group>
  );
}
