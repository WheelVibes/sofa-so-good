import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Object3D, type DirectionalLight, type AmbientLight, type HemisphereLight } from 'three';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene, type SunPosition } from './sunPosition';
import { lightingFromAltitude } from './altitudeCurve';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from '../../apartment/constants';
import { useQuality } from '../useQuality';
import { grade, SOFT_SHADOW } from '../look';

/** Distance from the apartment centre where the directional light sits (m). */
const SUN_DISTANCE = 25;
const TWEEN_DURATION = 0.6;

/** Apartment centre — the sun shadow frustum is aimed here so the limited
 *  shadow-map resolution is spent on the floor plan, not empty space. */
const CENTER: [number, number, number] = [APARTMENT_EXT_W / 2, 0, APARTMENT_EXT_D / 2];
/** Half-extent of the shadow frustum (m). Sized to wrap the apartment plus a
 *  margin for furniture and the swing of low-angle shadows. */
const SHADOW_HALF = 9.5;

interface Vals {
  sun: number;
  ambient: number;
  sunPos: [number, number, number];
  sunColor: [number, number, number];
  skyColor: [number, number, number];
  groundColor: [number, number, number];
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
  const rotated = rotateY(scaled, orientation);
  return {
    sun: lighting.sun,
    ambient: lighting.ambient,
    // Offset the light so its shadow frustum is centred on the apartment.
    sunPos: [rotated[0] + CENTER[0], rotated[1] + CENTER[1], rotated[2] + CENTER[2]],
    sunColor: lighting.sunColor,
    skyColor: lighting.skyColor,
    groundColor: lighting.groundColor,
  };
}

export function Lighting() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const shadowMapSize = useQuality().shadowMapSize;
  const gl = useThree((s) => s.gl);
  const sunRef = useRef<DirectionalLight>(null!);
  const ambientRef = useRef<AmbientLight>(null!);
  const hemiRef = useRef<HemisphereLight>(null!);
  // A persistent target so the directional light always points at the
  // apartment centre regardless of where the sun sits.
  const sunTarget = useMemo(() => {
    const o = new Object3D();
    o.position.set(...CENTER);
    return o;
  }, []);
  const initial = targetVals(sunPos, orientation);
  const current = useRef<Vals>({
    sun: initial.sun,
    ambient: initial.ambient,
    sunPos: [...initial.sunPos] as [number, number, number],
    sunColor: [...initial.sunColor] as [number, number, number],
    skyColor: [...initial.skyColor] as [number, number, number],
    groundColor: [...initial.groundColor] as [number, number, number],
  });

  useFrame((_, dt) => {
    const target = targetVals(sunPos, orientation);
    const cur = current.current;
    const k = Math.min(1, dt / TWEEN_DURATION);

    const approach = (a: number, b: number) => a + (b - a) * k;
    const dArr = (a: [number, number, number], b: [number, number, number]) => {
      a[0] = approach(a[0], b[0]);
      a[1] = approach(a[1], b[1]);
      a[2] = approach(a[2], b[2]);
    };

    // Drive tone-mapping exposure from the sun altitude every frame — cheap,
    // and it must keep tracking even after the light tween settles.
    gl.toneMappingExposure = grade(sunPos.altitude).exposure;

    // Cheap settle check on the dominant channels.
    const settled =
      Math.abs(target.sun - cur.sun) < 1e-3 &&
      Math.abs(target.ambient - cur.ambient) < 1e-3 &&
      Math.abs(target.sunPos[1] - cur.sunPos[1]) < 1e-2 &&
      Math.abs(target.skyColor[2] - cur.skyColor[2]) < 1e-3;
    if (settled) return;

    cur.sun = approach(cur.sun, target.sun);
    cur.ambient = approach(cur.ambient, target.ambient);
    dArr(cur.sunPos, target.sunPos);
    dArr(cur.sunColor, target.sunColor);
    dArr(cur.skyColor, target.skyColor);
    dArr(cur.groundColor, target.groundColor);

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun;
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2]);
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2]);
    }
    // Split the fill budget: a directional hemisphere (sky/ground) reads as
    // soft GI and gives objects form, while a small flat ambient lifts the
    // deepest interior shadows so nothing crushes to black.
    if (hemiRef.current) {
      hemiRef.current.intensity = cur.ambient * 1.1;
      hemiRef.current.color.setRGB(cur.skyColor[0], cur.skyColor[1], cur.skyColor[2]);
      hemiRef.current.groundColor.setRGB(cur.groundColor[0], cur.groundColor[1], cur.groundColor[2]);
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient * 0.35;
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <hemisphereLight ref={hemiRef} />
      <primitive object={sunTarget} />
      <directionalLight
        key={shadowMapSize}
        ref={sunRef}
        castShadow={shadowMapSize > 0}
        target={sunTarget}
        shadow-mapSize-width={shadowMapSize || 1024}
        shadow-mapSize-height={shadowMapSize || 1024}
        shadow-bias={SOFT_SHADOW.bias}
        shadow-normalBias={SOFT_SHADOW.normalBias}
        shadow-radius={SOFT_SHADOW.radius}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
      />
    </>
  );
}
