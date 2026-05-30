import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useStore } from '../state/store';

/** Custom event the toolbar fires to request a PNG export. */
export const EXPORT_EVENT = 'sofa:export';

/**
 * Captures the current canvas to a downloaded PNG on demand. Renders one
 * fresh frame and reads it back synchronously, so we avoid the per-frame
 * cost of `preserveDrawingBuffer` while still getting a non-blank image.
 */
export function ScreenshotController() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const onExport = () => {
      const store = useStore.getState();
      const prevTier = store.qualityTier;
      const prevOverrides = store.qualityOverrides;
      try {
        // Force the highest-fidelity look for the exported frame regardless of
        // the live tier: high tier + every capability on.
        store.setQualityTier('high');
        store.setQualityOverride('showcase', true);
        store.setQualityOverride('postprocessing', true);
        // A single synchronous render won't let AccumulativeShadows fully
        // converge in one frame — that's acceptable; the dominant fidelity gain
        // for the PNG is the high tier + postprocessing. The converged
        // accumulation benefits the live parked view.
        gl.render(scene, camera);
        const url = gl.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `hdb-design-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        /* tainted canvas / unsupported — ignore */
      } finally {
        // Always restore the user's live settings, even if capture threw.
        // setQualityTier resets overrides to {}, so restore the tier FIRST,
        // then overwrite qualityOverrides with the saved object.
        store.setQualityTier(prevTier);
        useStore.setState({ qualityOverrides: prevOverrides });
      }
    };
    window.addEventListener(EXPORT_EVENT, onExport);
    return () => window.removeEventListener(EXPORT_EVENT, onExport);
  }, [gl, scene, camera]);
  return null;
}
