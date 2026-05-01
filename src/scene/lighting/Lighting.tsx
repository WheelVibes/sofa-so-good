import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, AmbientLight } from 'three';
import { useStore } from '../../state/store';
import { ROOMS } from '../../apartment/constants';
import { useSunPosition } from './useSunPosition';
import { rotateAroundY, sunDirectionToScene, type SunPosition } from './sunPosition';
import { lightingFromAltitude } from './altitudeCurve';

/** Distance from origin where the directional light sits (metres). */
const SUN_DISTANCE = 25;
const TWEEN_DURATION = 0.6;

function apartmentAABB() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of Object.values(ROOMS)) {
    minX = Math.min(minX, r.origin[0]);
    maxX = Math.max(maxX, r.origin[0] + r.width);
    minZ = Math.min(minZ, r.origin[1]);
    maxZ = Math.max(maxZ, r.origin[1] + r.depth);
  }
  return { minX, maxX, minZ, maxZ };
}

interface Vals {
  sun: number;
  ambient: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
  exposure: number;
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
    sunPos: rotateAroundY(scaled, orientation),
    sunColor: lighting.sunColor,
    exposure: lighting.exposure,
  };
}

export function Lighting() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const shadows = useStore((s) => s.quality.shadows);
  const shadowsEnabled = shadows !== 'off';
  const shadowMapSize = shadows === 'high' ? 2048 : 1024;
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const gl = useThree((s) => s.gl);
  const initial = targetVals(sunPos, orientation);

  const aabb = apartmentAABB();
  const margin = 4;
  const halfX = (aabb.maxX - aabb.minX) / 2 + margin;
  const halfZ = (aabb.maxZ - aabb.minZ) / 2 + margin;
  const shadowExtent = Math.max(halfX, halfZ);
  const current = useRef<Vals>({
    sun: initial.sun,
    ambient: initial.ambient,
    sunPos: [...initial.sunPos] as [number, number, number],
    sunColor: [...initial.sunColor] as [number, number, number],
    exposure: initial.exposure,
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
    const dExp = target.exposure - cur.exposure;
    const settled =
      Math.abs(dSun) < 1e-3 &&
      Math.abs(dAmb) < 1e-3 &&
      Math.abs(dPx) < 1e-2 &&
      Math.abs(dPy) < 1e-2 &&
      Math.abs(dPz) < 1e-2 &&
      Math.abs(dCr) < 1e-3 &&
      Math.abs(dCg) < 1e-3 &&
      Math.abs(dCb) < 1e-3 &&
      Math.abs(dExp) < 1e-3;

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
    cur.exposure += dExp * k;

    if (gl) gl.toneMappingExposure = cur.exposure;
    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient;
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={initial.ambient} />
      <directionalLight
        ref={sunRef}
        intensity={initial.sun}
        position={initial.sunPos}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={SUN_DISTANCE * 2.5}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0005}
      />
    </>
  );
}
