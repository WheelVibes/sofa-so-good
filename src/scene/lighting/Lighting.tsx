import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight } from 'three';
import { useStore, type TimeOfDay } from '../../state/store';

interface Vals {
  sun: number;
  ambient: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
}

const PRESETS: Record<TimeOfDay, Vals> = {
  day: { sun: 1.0, ambient: 0.6, sunPos: [10, 20, 5], sunColor: [1.0, 0.96, 0.88] },
  dusk: { sun: 0.4, ambient: 0.4, sunPos: [10, 4, 5], sunColor: [1.0, 0.72, 0.42] },
  night: { sun: 0.05, ambient: 0.15, sunPos: [10, -5, 5], sunColor: [0.24, 0.29, 0.42] },
};

const TWEEN_DURATION = 0.6;

export function Lighting() {
  const time = useStore((s) => s.timeOfDay);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const current = useRef<Vals>({
    sun: PRESETS[time].sun,
    ambient: PRESETS[time].ambient,
    sunPos: [...PRESETS[time].sunPos] as [number, number, number],
    sunColor: [...PRESETS[time].sunColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = PRESETS[time];
    const cur = current.current;
    const dSun = target.sun - cur.sun;
    const dAmb = target.ambient - cur.ambient;
    const dPx = target.sunPos[0] - cur.sunPos[0];
    const dPy = target.sunPos[1] - cur.sunPos[1];
    const dPz = target.sunPos[2] - cur.sunPos[2];
    const dCr = target.sunColor[0] - cur.sunColor[0];
    const dCg = target.sunColor[1] - cur.sunColor[1];
    const dCb = target.sunColor[2] - cur.sunColor[2];
    const settled =
      Math.abs(dSun) < 1e-3 &&
      Math.abs(dAmb) < 1e-3 &&
      Math.abs(dPx) < 1e-2 &&
      Math.abs(dPy) < 1e-2 &&
      Math.abs(dPz) < 1e-2 &&
      Math.abs(dCr) < 1e-3 &&
      Math.abs(dCg) < 1e-3 &&
      Math.abs(dCb) < 1e-3;

    if (settled) return;

    const k = Math.min(1, dt / TWEEN_DURATION);
    cur.sun += dSun * k;
    cur.ambient += dAmb * k;
    cur.sunPos[0] += dPx * k;
    cur.sunPos[1] += dPy * k;
    cur.sunPos[2] += dPz * k;
    cur.sunColor[0] += dCr * k;
    cur.sunColor[1] += dCg * k;
    cur.sunColor[2] += dCb * k;

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient;
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
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
