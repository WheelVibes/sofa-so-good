import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../state/store';

/**
 * Demand-driven shadow maps. Camera orbiting never changes world-space
 * shadows, yet the default renderer re-renders the shadow map every frame —
 * roughly half the GPU/CPU draw cost. We freeze the shadow map and only
 * refresh it when something that affects shadows changes: furniture moves,
 * a door swings, or the sun/orientation/time shifts. A slow periodic refresh
 * catches system-clock sun drift and any missed trigger.
 *
 * This is the single biggest idle-cost saving for the CPU-first baseline.
 */
export function ShadowController() {
  const { gl } = useThree();
  const dirtyUntil = useRef(0);
  const lastPeriodic = useRef(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    dirtyUntil.current = performance.now() + 1000;
    const markDirty = () => {
      dirtyUntil.current = performance.now() + 800;
    };
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.items !== prev.items ||
        s.doors !== prev.doors ||
        s.manualHour !== prev.manualHour ||
        s.timeMode !== prev.timeMode ||
        s.orientationDeg !== prev.orientationDeg ||
        s.location !== prev.location ||
        s.qualityTier !== prev.qualityTier ||
        s.qualityOverrides !== prev.qualityOverrides
      ) {
        markDirty();
      }
    });
    return () => {
      unsub();
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useFrame(() => {
    const now = performance.now();
    // Cheap periodic refresh (~every 3s) so slow system-clock sun drift and
    // any missed event still settle.
    if (now - lastPeriodic.current > 3000) {
      lastPeriodic.current = now;
      if (now > dirtyUntil.current) dirtyUntil.current = now + 30;
    }
    if (now <= dirtyUntil.current) gl.shadowMap.needsUpdate = true;
  });

  return null;
}
