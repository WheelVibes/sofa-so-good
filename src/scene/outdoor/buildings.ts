import { ROOMS } from '../../apartment/constants';

export interface BuildingSpec {
  /** xz offset from the apartment centroid. */
  position: [number, number];
  width: number;
  depth: number;
  height: number;
  /** [0.78, 1.0] multiplier on the base building colour. */
  shade: number;
}

export const BUILDING_COUNT = 22;
export const R_MIN = 80;
export const R_MAX = 160;
export const APARTMENT_SAFETY_MARGIN = 35;
export const DEFAULT_SEED = 0xc0ffee;

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }

function apartmentAABB(): AABB & { cx: number; cz: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of Object.values(ROOMS)) {
    minX = Math.min(minX, r.origin[0]);
    maxX = Math.max(maxX, r.origin[0] + r.width);
    minZ = Math.min(minZ, r.origin[1]);
    maxZ = Math.max(maxZ, r.origin[1] + r.depth);
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

function intersects(a: AABB, b: AABB): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
}

export function generateBuildings(seed: number = DEFAULT_SEED): BuildingSpec[] {
  const rng = mulberry32(seed);
  const apt = apartmentAABB();
  const inflated: AABB = {
    minX: apt.minX - APARTMENT_SAFETY_MARGIN,
    maxX: apt.maxX + APARTMENT_SAFETY_MARGIN,
    minZ: apt.minZ - APARTMENT_SAFETY_MARGIN,
    maxZ: apt.maxZ + APARTMENT_SAFETY_MARGIN,
  };

  const buildings: BuildingSpec[] = [];
  for (let i = 0; i < BUILDING_COUNT; i++) {
    let placed: BuildingSpec | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const theta = (i / BUILDING_COUNT) * Math.PI * 2 + rng() * (Math.PI * 2 / BUILDING_COUNT) * 0.5;
      const r = R_MIN + (R_MAX - R_MIN) * rng();
      const w = 12 + rng() * 12;
      const d = 12 + rng() * 12;
      const hRng = Math.pow(rng(), 1.4);
      // 6 floors (~18m) up to 20 floors (~60m), assuming 3m per floor.
      const h = 18 + hRng * (60 - 18);
      const shade = 0.78 + rng() * 0.22;
      const ox = apt.cx + Math.cos(theta) * r;
      const oz = apt.cz + Math.sin(theta) * r;
      const bbox: AABB = {
        minX: ox - w / 2,
        maxX: ox + w / 2,
        minZ: oz - d / 2,
        maxZ: oz + d / 2,
      };
      if (intersects(bbox, inflated)) continue;
      placed = {
        position: [ox - apt.cx, oz - apt.cz],
        width: w,
        depth: d,
        height: h,
        shade,
      };
      break;
    }
    if (placed) buildings.push(placed);
  }
  return buildings;
}

export function apartmentCentroid(): [number, number] {
  const a = apartmentAABB();
  return [a.cx, a.cz];
}
