import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

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
      try {
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
      }
    };
    window.addEventListener(EXPORT_EVENT, onExport);
    return () => window.removeEventListener(EXPORT_EVENT, onExport);
  }, [gl, scene, camera]);
  return null;
}
