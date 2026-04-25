import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight, PointLight } from 'three';
import { ROOMS, FLAT } from '../../apartment/constants';
import { roomCentroid } from '../../apartment/rooms';
import { useStore, type TimeOfDay } from '../../state/store';

interface Vals {
  sun: number;
  ambient: number;
  interior: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
}

const PRESETS: Record<TimeOfDay, Vals> = {
  day: { sun: 1.0, ambient: 0.6, interior: 0.0, sunPos: [10, 20, 5], sunColor: [1.0, 0.96, 0.88] },
  dusk: { sun: 0.4, ambient: 0.4, interior: 0.4, sunPos: [10, 4, 5], sunColor: [1.0, 0.72, 0.42] },
  night: { sun: 0.05, ambient: 0.15, interior: 1.2, sunPos: [10, -5, 5], sunColor: [0.24, 0.29, 0.42] },
};

const TWEEN_DURATION = 0.6;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function Lighting() {
  const time = useStore((s) => s.timeOfDay);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const interiorRefs = useRef<(PointLight | null)[]>([]);
  const current = useRef<Vals>({
    sun: PRESETS[time].sun,
    ambient: PRESETS[time].ambient,
    interior: PRESETS[time].interior,
    sunPos: [...PRESETS[time].sunPos] as [number, number, number],
    sunColor: [...PRESETS[time].sunColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = PRESETS[time];
    const k = Math.min(1, dt / TWEEN_DURATION);
    const cur = current.current;
    cur.sun = lerp(cur.sun, target.sun, k);
    cur.ambient = lerp(cur.ambient, target.ambient, k);
    cur.interior = lerp(cur.interior, target.interior, k);
    for (let i = 0; i < 3; i++) {
      cur.sunPos[i] = lerp(cur.sunPos[i], target.sunPos[i], k);
      cur.sunColor[i] = lerp(cur.sunColor[i], target.sunColor[i], k);
    }

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient;
    for (const p of interiorRefs.current) if (p) p.intensity = cur.interior;
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
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
      <group>
        {Object.values(ROOMS)
          .filter((r) => !r.external)
          .map((r, idx) => {
            const [cx, cz] = roomCentroid(r.id);
            const cy = (r.ceilingHeight ?? FLAT.ceilingHeight) - 0.05;
            return (
              <pointLight
                key={r.id}
                ref={(el) => {
                  interiorRefs.current[idx] = el;
                }}
                position={[cx, cy, cz]}
                distance={6}
                color="#ffd9a3"
                castShadow={false}
              />
            );
          })}
      </group>
    </>
  );
}
