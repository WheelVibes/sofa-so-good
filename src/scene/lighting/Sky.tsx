import { Sky as DreiSky } from '@react-three/drei';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene } from './sunPosition';
import { skyFromAltitude, weatherTurbidityMultiplier } from './altitudeCurve';

/** Sky sun-position is rendered far away so DreiSky's shader places
 *  the disc near the horizon plane. */
const SKY_SUN_DISTANCE = 1000;

// Clockwise around Y when viewed from above, matching compass bearings
// (N=0° → E=90° → S=180° → W=270°). Same convention as Lighting.tsx.
function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = pos;
  return [x * c - z * s, y, x * s + z * c];
}

export function Sky() {
  const sunPos = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const dir = sunDirectionToScene(sunPos);
  const scaled: [number, number, number] = [
    dir[0] * SKY_SUN_DISTANCE,
    dir[1] * SKY_SUN_DISTANCE,
    dir[2] * SKY_SUN_DISTANCE,
  ];
  const sunPosition = rotateY(scaled, orientation);
  const sky = skyFromAltitude(sunPos.altitude);
  const weather = useStore((s) => s.quality.weather);
  const turbidity = sky.turbidity * weatherTurbidityMultiplier(weather);
  return (
    <DreiSky
      sunPosition={sunPosition}
      turbidity={turbidity}
      rayleigh={sky.rayleigh}
      mieCoefficient={sky.mieCoefficient}
      mieDirectionalG={sky.mieDirectionalG}
    />
  );
}
