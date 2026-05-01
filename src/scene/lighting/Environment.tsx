import { Environment as DreiEnvironment } from '@react-three/drei';
import { useSunPosition } from './useSunPosition';

const IBL_ENABLED = true;

type Preset = 'night' | 'sunset' | 'dawn' | 'apartment' | 'city';

function altitudeToPreset(altitudeRad: number): Preset {
  const altDeg = (altitudeRad * 180) / Math.PI;
  if (altDeg <= -6) return 'night';
  if (altDeg <= 2) return 'sunset';
  if (altDeg <= 12) return 'dawn';
  if (altDeg <= 30) return 'apartment';
  return 'city';
}

function EnvironmentInner() {
  const sun = useSunPosition();
  const preset = altitudeToPreset(sun.altitude);
  return <DreiEnvironment preset={preset} background={false} />;
}

export function Environment() {
  if (!IBL_ENABLED) return null;
  return <EnvironmentInner />;
}
