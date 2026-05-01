import { useMemo } from 'react';
import { Color, RepeatWrapping, type Texture } from 'three';
import { useStore } from '../../state/store';
import { useSunPosition } from '../lighting/useSunPosition';
import { generateBuildings, apartmentCentroid, type BuildingSpec } from './buildings';
import { buildingColorTexture, buildingEmissiveTexture } from './buildingTexture';

const GROUND_RADIUS = 250;
/** Height of the apartment's floor above outdoor ground level. Singapore
 *  HDBs are ~3 m per floor; 30 m ≈ 10th storey, a typical mid-block unit. */
const APARTMENT_FLOOR_HEIGHT = 30;
const BASE_BUILDING = new Color('#3a3a40');
const EMISSIVE_WARM = new Color('#f0c878');
const EMISSIVE_MAX = 0.9;
/** One texture tile (2×2 window cells) covers TILE_W × TILE_H of wall.
 *  Sized so the repeat works out to ~one window per 4 m bay and ~one
 *  window per 3 m floor. A 60 m / 20-floor tower becomes repeat.y = 10. */
const TILE_W = 8;
const TILE_H = 6;
/** Slight baseline emissive so distant blocks aren't pure-black silhouettes
 *  during the daytime when their camera-facing side is in shadow. */
const AMBIENT_FILL = 0.04;

/** Emissive ramp: 0 above +2° (full daylight, no glow), full at −6° and below.
 *  Distant building windows only really light up around civil twilight. */
function buildingEmissiveLevel(altitudeRad: number): number {
  const altDeg = (altitudeRad * 180) / Math.PI;
  if (altDeg >= 2) return 0;
  if (altDeg <= -6) return 1;
  return (2 - altDeg) / 8;
}

function cloneRepeating(tex: Texture, w: number, h: number): Texture {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(w / TILE_W, h / TILE_H);
  return t;
}

function Building({
  spec,
  cx,
  cz,
  emissiveIntensity,
}: {
  spec: BuildingSpec;
  cx: number;
  cz: number;
  emissiveIntensity: number;
}) {
  const { mapTex, emissiveTex, color } = useMemo(() => {
    const baseColor = buildingColorTexture();
    const baseEm = buildingEmissiveTexture();
    return {
      mapTex: cloneRepeating(baseColor, spec.width, spec.height),
      emissiveTex: cloneRepeating(baseEm, spec.width, spec.height),
      color: BASE_BUILDING.clone().multiplyScalar(spec.shade),
    };
  }, [spec.width, spec.height, spec.shade]);

  return (
    <mesh
      position={[cx + spec.position[0], spec.height / 2, cz + spec.position[1]]}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[spec.width, spec.height, spec.depth]} />
      <meshStandardMaterial
        color={color}
        roughness={0.9}
        metalness={0}
        map={mapTex}
        emissiveMap={emissiveTex}
        emissive={EMISSIVE_WARM}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export function OutdoorScene() {
  const enabled = useStore((s) => s.quality.outdoor);
  const sun = useSunPosition();
  const buildings = useMemo(() => generateBuildings(), []);
  const [cx, cz] = useMemo(() => apartmentCentroid(), []);

  if (!enabled) return null;
  const emissive = buildingEmissiveLevel(sun.altitude) * EMISSIVE_MAX + AMBIENT_FILL;

  return (
    <group position={[0, -APARTMENT_FLOOR_HEIGHT, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[cx, -0.005, cz]}
        receiveShadow={false}
      >
        <circleGeometry args={[GROUND_RADIUS, 48]} />
        <meshStandardMaterial color="#2a2e2a" roughness={0.95} metalness={0} />
      </mesh>
      {buildings.map((spec, i) => (
        <Building
          key={i}
          spec={spec}
          cx={cx}
          cz={cz}
          emissiveIntensity={emissive}
        />
      ))}
    </group>
  );
}
