import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../state/store';
import { detectDefaultTier, type QualityTier } from './quality';
import { useQuality } from './useQuality';

const ORDER: QualityTier[] = ['low', 'medium', 'high'];
/** Frame-rate floor. Sustained dips below this auto-drop the tier. */
const FPS_FLOOR = 30;

/**
 * Keeps the experience fluid:
 *   - picks a starting tier from the device on boot,
 *   - applies each tier's pixel-ratio clamp,
 *   - watches frame rate and steps the tier down if it sustains below
 *     ~30fps (unless the user has pinned a tier).
 * Auto-adjustments never raise the tier — users opt into heavier tiers
 * manually from the toolbar.
 */
export function QualityController() {
  const { gl } = useThree();
  const dprMax = useQuality().dprMax;

  // One-time device detection (skipped if the user already chose a tier).
  useEffect(() => {
    if (useStore.getState().qualityUserSet) return;
    const ctx = gl.getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    useStore.getState().autoSetQualityTier(detectDefaultTier(ctx));
  }, [gl]);

  // Apply the effective device-pixel-ratio clamp.
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprMax));
  }, [dprMax, gl]);

  // Adaptive frame-rate guard.
  const acc = useRef({ t: 0, frames: 0, lowWindows: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.t += dt;
    a.frames++;
    if (a.t < 1.5) return;
    const fps = a.frames / a.t;
    a.t = 0;
    a.frames = 0;
    if (useStore.getState().qualityUserSet) return;
    if (fps < FPS_FLOOR) {
      a.lowWindows++;
      if (a.lowWindows >= 2) {
        // ~3s sustained below floor → drop one tier, or — once bottomed out at
        // Low — shed the sun-shadow pass as a final fallback to hold 30fps.
        const st = useStore.getState();
        const i = ORDER.indexOf(st.qualityTier);
        if (i > 0) st.autoSetQualityTier(ORDER[i - 1]);
        else if (!st.autoShadowsOff) st.setAutoShadowsOff(true);
        a.lowWindows = 0;
      }
    } else {
      a.lowWindows = 0;
    }
  });

  return null;
}
