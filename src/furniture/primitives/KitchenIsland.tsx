import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Freestanding kitchen island — a base cabinet with a stone worktop that
 * overhangs one long side (+Z) as a breakfast bar (knee space for stools),
 * cabinet fronts on the other side. Optional sink or hob inset. Faces +Z
 * (the seating/overhang side). Floor-anchored, centred, real-world metres.
 */
export function KitchenIsland({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 1.6); // along X
  const depth = readNum(props, 'depth', 0.95); // along Z (incl. overhang)
  const color = readStr(props, 'color', '#3a4754');
  const worktopColor = readStr(props, 'worktopColor', '#2c2f34');
  const finish = readStr(props, 'finish', 'painted');
  const sheen = readNum(props, 'sheen', 0.1);
  const top = readStr(props, 'top', 'plain'); // plain / sink / hob

  const cabinetH = 0.85;
  const topT = 0.05;
  const overhang = 0.28;
  const cabDepth = depth - overhang;
  const cabMat = getSurfaceMaterial(finish, color, 1.2, sheen);
  const stone = getSurfaceMaterial('marble', worktopColor, 1.4, 0.55);
  const handle = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const;
  const metal = { color: '#cfd2d6', roughness: 0.2, metalness: 0.85 } as const;

  // Cabinet sits toward −Z; worktop spans the full depth (overhangs +Z).
  const cabCz = -overhang / 2;
  const cabs = Math.max(1, Math.round(length / 0.6));
  const gap = 0.012;
  const cabW = (length - gap * (cabs + 1)) / cabs;

  return (
    <group>
      {/* Base cabinet */}
      <mesh castShadow receiveShadow position={[0, cabinetH / 2, cabCz]} material={cabMat}>
        <boxGeometry args={[length, cabinetH, cabDepth]} />
      </mesh>
      {/* Cabinet door fronts on the −Z face */}
      {Array.from({ length: cabs }, (_, i) => {
        const x = -length / 2 + gap + cabW / 2 + i * (cabW + gap);
        return (
          <group key={i}>
            <mesh position={[x, cabinetH / 2, cabCz - cabDepth / 2 - 0.003]} material={cabMat}>
              <boxGeometry args={[cabW, cabinetH - 0.06, 0.02]} />
            </mesh>
            <mesh position={[x, cabinetH - 0.14, cabCz - cabDepth / 2 - 0.02]}>
              <boxGeometry args={[Math.min(cabW * 0.4, 0.16), 0.016, 0.016]} />
              <meshStandardMaterial {...handle} />
            </mesh>
          </group>
        );
      })}
      {/* Worktop (overhangs +Z) */}
      <mesh castShadow receiveShadow position={[0, cabinetH + topT / 2, 0]} material={stone}>
        <boxGeometry args={[length + 0.04, topT, depth]} />
      </mesh>

      {/* Inset sink or hob */}
      {top === 'sink' && (
        <>
          <mesh position={[0, cabinetH + topT - 0.01, cabCz]}>
            <boxGeometry args={[0.5, 0.05, 0.36]} />
            <meshStandardMaterial color="#b9bcc0" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[0, cabinetH + topT + 0.12, cabCz - 0.14]}>
            <cylinderGeometry args={[0.012, 0.012, 0.24, 10]} />
            <meshStandardMaterial {...metal} />
          </mesh>
        </>
      )}
      {top === 'hob' &&
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}.${sz}`} position={[sx * 0.16, cabinetH + topT + 0.005, cabCz + sz * 0.13]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.08, 20]} />
              <meshStandardMaterial color="#1c1c1e" roughness={0.4} metalness={0.3} />
            </mesh>
          )),
        )}
    </group>
  );
}
