import { Environment as DreiEnvironment } from '@react-three/drei';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { lightingFromAltitude } from './altitudeCurve';

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
  const gi = useStore((s) => s.quality.globalIllumination);
  const sun = useSunPosition();
  if (gi === 'off') return null;
  const preset = altitudeToPreset(sun.altitude);
  const { envIntensity } = lightingFromAltitude(sun.altitude);
  return (
    <DreiEnvironment
      preset={preset}
      background={false}
      environmentIntensity={envIntensity}
    />
  );
}

export function Environment() {
  return <EnvironmentInner />;
}
