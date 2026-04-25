import { useStore } from '../../state/store';

const SETTINGS = {
  day: { sun: 1.0, ambient: 0.6, sunPos: [10, 20, 5] as [number, number, number], sunColor: '#fff5e0' },
  dusk: { sun: 0.4, ambient: 0.4, sunPos: [10, 4, 5] as [number, number, number], sunColor: '#ffb86b' },
  night: { sun: 0.05, ambient: 0.15, sunPos: [10, -5, 5] as [number, number, number], sunColor: '#3c4a6b' },
};

export function Lighting() {
  const time = useStore((s) => s.timeOfDay);
  const s = SETTINGS[time];
  return (
    <>
      <ambientLight intensity={s.ambient} />
      <directionalLight
        position={s.sunPos}
        intensity={s.sun}
        color={s.sunColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  );
}
