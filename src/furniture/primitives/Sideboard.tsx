import { readNum, readStr } from './shared';
import { getSurfaceMaterial, getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Sideboard / credenza — a low, long storage cabinet for a dining or living
 * area (TV stand, crockery store, display top). `front` lays out the fronts:
 *   - 'doors'   — a row of flat cabinet doors;
 *   - 'drawers' — a row of stacked drawers;
 *   - 'mixed'   — a central stack of drawers flanked by a door each side.
 * `legs` picks the base (mid-century tapered / metal hairpin / recessed
 * plinth) and `handle` the hardware. Floor-anchored, centred, faces +Z.
 */
export function Sideboard({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.6);
  const depth = readNum(props, 'depth', 0.42);
  const color = readStr(props, 'color', '#7a5c3c');
  const legColor = readStr(props, 'legColor', '#3a2c1d');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const front = readStr(props, 'front', 'doors');
  const legs = readStr(props, 'legs', 'tapered');
  const handle = readStr(props, 'handle', 'bar');
  const bays = Math.max(2, Math.round(readNum(props, 'bays', 3)));

  const legH = legs === 'plinth' ? 0.08 : 0.16;
  const bodyH = 0.62;
  const wood = getSurfaceMaterial(finish, color, 1.6, sheen);
  const legMat = getWoodMaterial(legColor, 0.45);
  const metal = { color: '#2b2b2b', roughness: 0.35, metalness: 0.65 } as const;
  const brass = { color: '#b08d57', roughness: 0.4, metalness: 0.7 } as const;

  const gap = 0.02;
  const bayW = (width - gap * (bays + 1)) / bays;
  const faceZ = depth / 2 + 0.004;

  // For 'mixed', interior bays alternate: a central drawer stack, side doors.
  const centreBay = Math.floor(bays / 2);

  const Pull = ({ x, y }: { x: number; y: number }) => {
    if (handle === 'none') return null;
    if (handle === 'knob')
      return (
        <mesh position={[x, y, faceZ + 0.022]}>
          <sphereGeometry args={[0.018, 12, 10]} />
          <meshStandardMaterial {...brass} />
        </mesh>
      );
    if (handle === 'recessed')
      return (
        <mesh position={[x, y + 0.05, faceZ - 0.002]}>
          <boxGeometry args={[Math.min(bayW * 0.5, 0.18), 0.012, 0.012]} />
          <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.4} />
        </mesh>
      );
    // bar pull (default)
    return (
      <mesh position={[x, y, faceZ + 0.02]}>
        <boxGeometry args={[Math.min(bayW * 0.55, 0.2), 0.016, 0.016]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    );
  };

  return (
    <group>
      {/* Carcass */}
      <mesh castShadow receiveShadow position={[0, legH + bodyH / 2, 0]} material={wood}>
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>

      {/* Fronts, bay by bay */}
      {Array.from({ length: bays }, (_, b) => {
        const x = -width / 2 + gap + bayW / 2 + b * (bayW + gap);
        const isDrawerBay =
          front === 'drawers' || (front === 'mixed' && b === centreBay);
        if (isDrawerBay) {
          // Two stacked drawers in this bay.
          const rows = 2;
          const dh = (bodyH - gap * (rows + 1)) / rows;
          return (
            <group key={b}>
              {Array.from({ length: rows }, (_, r) => {
                const y = legH + gap + dh / 2 + r * (dh + gap);
                return (
                  <group key={r}>
                    <mesh position={[x, y, faceZ]} material={wood}>
                      <boxGeometry args={[bayW, dh, 0.02]} />
                    </mesh>
                    <Pull x={x} y={y} />
                  </group>
                );
              })}
            </group>
          );
        }
        // A single door front for this bay.
        const y = legH + bodyH / 2;
        // Hinge side alternates so handles meet at the centre of door pairs.
        const hingeLeft = b % 2 === 0;
        return (
          <group key={b}>
            <mesh position={[x, y, faceZ]} material={wood}>
              <boxGeometry args={[bayW, bodyH - gap * 2, 0.02]} />
            </mesh>
            <Pull x={x + (hingeLeft ? bayW / 2 - 0.04 : -bayW / 2 + 0.04)} y={y} />
          </group>
        );
      })}

      {/* Base */}
      {legs === 'plinth' ? (
        <mesh castShadow receiveShadow position={[0, legH / 2, 0.01]} material={wood}>
          <boxGeometry args={[width - 0.1, legH, depth - 0.06]} />
        </mesh>
      ) : (
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => {
            const lx = sx * (width / 2 - 0.1);
            const lz = sz * (depth / 2 - 0.06);
            if (legs === 'hairpin') {
              return (
                <mesh key={`${sx}.${sz}`} castShadow position={[lx, legH / 2, lz]}>
                  <cylinderGeometry args={[0.008, 0.008, legH, 8]} />
                  <meshStandardMaterial {...metal} />
                </mesh>
              );
            }
            // Tapered mid-century leg: a thin box, splayed slightly outward.
            return (
              <mesh
                key={`${sx}.${sz}`}
                castShadow
                position={[lx + sx * 0.02, legH / 2, lz + sz * 0.02]}
                rotation={[sz * 0.12, 0, -sx * 0.12]}
                material={legMat}
              >
                <boxGeometry args={[0.035, legH, 0.035]} />
              </mesh>
            );
          }),
        )
      )}
    </group>
  );
}
