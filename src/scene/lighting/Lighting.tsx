import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight } from 'three';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene, type SunPosition } from './sunPosition';
import { lightingFromAltitude } from './altitudeCurve';

/** Distance from origin where the directional light sits (metres). */
const SUN_DISTANCE = 25;
const TWEEN_DURATION = 0.6;

interface Vals {
  sun: number;
  ambient: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
}

// Clockwise around Y when viewed from above, matching compass bearings
// (N=0° → E=90° → S=180° → W=270°). Same convention as Sky.tsx.
function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = pos;
  return [x * c - z * s, y, x * s + z * c];
}

function targetVals(sun: SunPosition, orientation: number): Vals {
  const lighting = lightingFromAltitude(sun.altitude);
  const dir = sunDirectionToScene(sun);
  const scaled: [number, number, number] = [
    dir[0] * SUN_DISTANCE,
    dir[1] * SUN_DISTANCE,
    dir[2] * SUN_DISTANCE,
  ];
  return {
    sun: lighting.sun,
    ambient: lighting.ambient,
    sunPos: rotateY(scaled, orientation),
    sunColor: lighting.sunColor,
  };
}

export function Lighting() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const initial = targetVals(sunPos, orientation);
  const current = useRef<Vals>({
    sun: initial.sun,
    ambient: initial.ambient,
    sunPos: [...initial.sunPos] as [number, number, number],
    sunColor: [...initial.sunColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = targetVals(sunPos, orientation);
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
