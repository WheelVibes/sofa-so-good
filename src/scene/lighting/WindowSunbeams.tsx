import { useMemo } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color } from 'three';
import { ROOMS, WALLS, WINDOWS } from '../../apartment/constants';
import type { WindowSpec } from '../../apartment/types';
import { useStore } from '../../state/store';
import { WINDOW_TINT_RGB } from '../../state/slices/windowsSlice';
import { useSunPosition } from './useSunPosition';
import { rotateAroundY, sunDirectionToScene } from './sunPosition';
import { daylightAdmittance, lightingFromAltitude } from './altitudeCurve';

const BEAM_OPACITY_MAX = 0.45;
const FLOOR_Y = 0.005;
const AABB_MARGIN = 0.5;

interface BeamGeom {
  /** Four floor-plane points, world space (y omitted; always FLOOR_Y). */
  pts: [[number, number], [number, number], [number, number], [number, number]];
}

function apartmentBounds() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of Object.values(ROOMS)) {
    minX = Math.min(minX, r.origin[0]);
    maxX = Math.max(maxX, r.origin[0] + r.width);
    minZ = Math.min(minZ, r.origin[1]);
    maxZ = Math.max(maxZ, r.origin[1] + r.depth);
  }
  return { minX: minX - AABB_MARGIN, maxX: maxX + AABB_MARGIN, minZ: minZ - AABB_MARGIN, maxZ: maxZ + AABB_MARGIN };
}

/** Project a window's four corners along the light-flow direction (-sunDir)
 *  onto the floor plane. Returns null if the resulting parallelogram's
 *  centroid lands outside the apartment AABB (i.e. the window faces away
 *  from the sun and would paint a beam outside the building). */
export function projectWindowToFloor(
  spec: WindowSpec,
  sunDir: readonly [number, number, number],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): BeamGeom | null {
  if (sunDir[1] <= 1e-3) return null;
  const wall = WALLS.find((w) => w.id === spec.wallId);
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uz = dz / len;
  const ax = wall.start[0] + ux * spec.offset;
  const az = wall.start[1] + uz * spec.offset;
  const bx = ax + ux * spec.width;
  const bz = az + uz * spec.width;

  const corners: [number, number, number][] = [
    [ax, spec.sill, az],
    [bx, spec.sill, bz],
    [bx, spec.head, bz],
    [ax, spec.head, az],
  ];

  const project = ([cx, cy, cz]: [number, number, number]): [number, number] => {
    const t = cy / sunDir[1];
    return [cx - t * sunDir[0], cz - t * sunDir[2]];
  };
  const pts: BeamGeom['pts'] = [
    project(corners[0]),
    project(corners[1]),
    project(corners[2]),
    project(corners[3]),
  ];

  const cxAvg = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const czAvg = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  if (
    cxAvg < bounds.minX ||
    cxAvg > bounds.maxX ||
    czAvg < bounds.minZ ||
    czAvg > bounds.maxZ
  ) {
    return null;
  }
  return { pts };
}

function makeBeamGeometry(pts: BeamGeom['pts']): BufferGeometry {
  const g = new BufferGeometry();
  const positions = new Float32Array(12);
  for (let i = 0; i < 4; i++) {
    positions[i * 3 + 0] = pts[i][0];
    positions[i * 3 + 1] = FLOOR_Y;
    positions[i * 3 + 2] = pts[i][1];
  }
  g.setAttribute('position', new BufferAttribute(positions, 3));
  // two triangles: 0-1-2, 0-2-3
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export function WindowSunbeams() {
  const tintPreset = useStore((s) => s.windowTint);
  const curtainsClosed = useStore((s) => s.curtainsClosed);
  const curtainOpacity = useStore((s) => s.curtainOpacity);
  const sun = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);

  const tint = WINDOW_TINT_RGB[tintPreset];
  const blocked = curtainsClosed && curtainOpacity >= 1;

  const bounds = useMemo(() => apartmentBounds(), []);

  const sunDir = useMemo(
    () => rotateAroundY(sunDirectionToScene(sun), orientation),
    [sun, orientation],
  );

  const beams = useMemo(() => {
    if (!tint || blocked) return [];
    return WINDOWS.map((spec) => {
      const proj = projectWindowToFloor(spec, sunDir, bounds);
      if (!proj) return null;
      return { id: spec.id, geom: makeBeamGeometry(proj.pts) };
    }).filter((x): x is { id: string; geom: BufferGeometry } => x !== null);
  }, [tint, blocked, sunDir, bounds]);

  if (!tint || blocked || beams.length === 0) return null;

  const lighting = lightingFromAltitude(sun.altitude);
  const admit = daylightAdmittance(sun.altitude);
  const r = tint[0] * lighting.sunColor[0];
  const g = tint[1] * lighting.sunColor[1];
  const b = tint[2] * lighting.sunColor[2];
  const opacity = admit * BEAM_OPACITY_MAX * (curtainsClosed ? 1 - curtainOpacity : 1);
  if (opacity <= 1e-3) return null;
  const color = new Color(r, g, b);

  return (
    <group renderOrder={2}>
      {beams.map(({ id, geom }) => (
        <mesh key={id} geometry={geom} renderOrder={2}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
