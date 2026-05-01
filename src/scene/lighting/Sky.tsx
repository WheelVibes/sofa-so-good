import { Sky as DreiSky } from '@react-three/drei';
import { useEffectiveHour } from './useEffectiveHour';
import { hourToPreset } from './hourToPreset';

const PRESETS = {
  day: {
    sunPosition: [10, 20, 5] as const,
    turbidity: 5,
    rayleigh: 1,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
  },
  dusk: {
    sunPosition: [10, 1.5, 5] as const,
    turbidity: 8,
    rayleigh: 3,
    mieCoefficient: 0.01,
    mieDirectionalG: 0.9,
  },
  night: {
    sunPosition: [10, -5, 5] as const,
    turbidity: 10,
    rayleigh: 0.1,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
  },
};

function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = pos;
  return [x * c + z * s, y, -x * s + z * c];
}

export function Sky() {
  const time = hourToPreset(useEffectiveHour());
  const orientation = useStore((s) => s.orientationDeg);
  const p = PRESETS[time];
  const sunPosition = rotateY(p.sunPosition, orientation);
  return (
    <DreiSky
      sunPosition={sunPosition}
      turbidity={p.turbidity}
      rayleigh={p.rayleigh}
      mieCoefficient={p.mieCoefficient}
      mieDirectionalG={p.mieDirectionalG}
    />
  );
}
