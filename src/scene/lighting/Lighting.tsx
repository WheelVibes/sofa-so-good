import { ROOMS, FLAT } from '../../apartment/constants';
import { roomCentroid } from '../../apartment/rooms';
import { useStore } from '../../state/store';

const SETTINGS = {
  day: { sun: 1.0, ambient: 0.6, sunPos: [10, 20, 5] as [number, number, number], sunColor: '#fff5e0' },
  dusk: { sun: 0.4, ambient: 0.4, sunPos: [10, 4, 5] as [number, number, number], sunColor: '#ffb86b' },
  night: { sun: 0.05, ambient: 0.15, sunPos: [10, -5, 5] as [number, number, number], sunColor: '#3c4a6b' },
};

function InteriorLights() {
  const time = useStore((s) => s.timeOfDay);
  const intensity = time === 'night' ? 1.2 : time === 'dusk' ? 0.4 : 0;
  if (intensity === 0) return null;
  return (
    <group>
      {Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => {
          const [cx, cz] = roomCentroid(r.id);
          const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) - 0.05;
          return (
            <pointLight
              key={r.id}
              position={[cx, cy, cz]}
              intensity={intensity}
              distance={6}
              color="#ffd9a3"
              castShadow={false}
            />
          );
        })}
    </group>
  );
}

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
      <InteriorLights />
    </>
  );
}
