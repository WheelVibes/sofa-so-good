import { Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { useStore, type TimeOfDay } from '../../state/store';

type Preset = 'apartment' | 'sunset' | 'night';

const PRESET_BY_TIME: Record<TimeOfDay, Preset> = {
  day: 'apartment',
  dusk: 'sunset',
  night: 'night',
};

/**
 * HDRI environment map. Adds image-based-lighting irradiance and
 * reflections on top of the procedural Sky + sun rig — `background={false}`
 * keeps the visible backdrop driven by `<Sky />`. Mapped to the existing
 * time-of-day store so day/dusk/night each pull a matching preset.
 *
 * drei's `<Environment preset=...>` fetches HDRs from the drei CDN at
 * runtime; in the vitest happy-dom env, fetch is partial and the
 * Suspense boundary would dangle, so we short-circuit to `null` under
 * test mode.
 */
export function EnvironmentMap() {
  const time = useStore((s) => s.timeOfDay);
  if (import.meta.env?.MODE === 'test') return null;
  return (
    <Suspense fallback={null}>
      <Environment preset={PRESET_BY_TIME[time]} background={false} />
    </Suspense>
  );
}
