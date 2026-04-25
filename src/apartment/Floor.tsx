import { useMemo } from 'react';
import * as THREE from 'three';

const BARE_CONCRETE = '#a8a39c';

// Apartment external perimeter (clockwise from NW), matching the external
// WALLS chain in constants.ts. Coordinates are interior-frame metres.
const APARTMENT_OUTER: [number, number][] = [
  [0.10, 0.10],
  [9.05, 0.10],
  [9.05, 1.30],
  [12.65, 1.30],
  [12.65, 8.00],
  [10.10, 8.00],
  [10.10, 9.25],
  [3.90, 9.25],
  [3.90, 7.60],
  [1.35, 7.60],
  [1.35, 5.05],
  [0.10, 5.05],
];

// External regions inside the polygon with no floor: the AC-ledge strip
// south of bath1. The SW lower notch is already outside the perimeter; the
// service yard is floored (it has a concrete slab in real flats).
const EXTERNAL_HOLES: [number, number, number, number][] = [
  [1.35, 6.75, 3.90, 7.60],
];

export function Floor() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    APARTMENT_OUTER.forEach(([x, z], i) => {
      // Negate z so the shape (built in its local XY) maps correctly to world
      // XZ after the mesh's −π/2 X rotation (local +Y → world −Z).
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    });
    s.closePath();
    EXTERNAL_HOLES.forEach(([x1, z1, x2, z2]) => {
      const h = new THREE.Path();
      h.moveTo(x1, -z1);
      h.lineTo(x2, -z1);
      h.lineTo(x2, -z2);
      h.lineTo(x1, -z2);
      h.closePath();
      s.holes.push(h);
    });
    return s;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={BARE_CONCRETE} roughness={0.95} />
    </mesh>
  );
}
