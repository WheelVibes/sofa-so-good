import { Sky as DreiSky } from '@react-three/drei';
import { useStore } from '../../state/store';

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

export function Sky() {
  const time = useStore((s) => s.timeOfDay);
  const p = PRESETS[time];
  return (
    <DreiSky
      sunPosition={p.sunPosition as unknown as [number, number, number]}
      turbidity={p.turbidity}
      rayleigh={p.rayleigh}
      mieCoefficient={p.mieCoefficient}
      mieDirectionalG={p.mieDirectionalG}
    />
  );
}
