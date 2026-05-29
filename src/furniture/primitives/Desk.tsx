import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface DeskProps {
  props: ParamProps;
}

/**
 * Desk primitive. `legStyle` chooses the support: 'panel' (a side leg-plate
 * + a pedestal drawer block, the existing office desk), 'legs' (four square
 * wooden legs, a clean writing desk), or 'hairpin' (slim splayed metal
 * hairpin legs, mid-century). Faces +Z (a person seated looks toward -Z).
 */
export function Desk({ props }: DeskProps) {
  const width = readNum(props, 'width', 1.4);
  const depth = readNum(props, 'depth', 0.6);
  const color = readStr(props, 'color', '#d5c2a3');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const legStyle = readStr(props, 'legStyle', 'panel');

  const height = 0.74;
  const topThickness = 0.04;
  const legThickness = 0.04;
  const drawerW = 0.34;
  const drawerH = 0.36;
  const legY = height - topThickness;

  const wood = getSurfaceMaterial(finish, color, 1.5, sheen);
  const metal = { color: '#2c2e30', roughness: 0.35, metalness: 0.75 };
  const inset = 0.07;
  const corners: [number, number][] = [
    [-width / 2 + inset, -depth / 2 + inset],
    [width / 2 - inset, -depth / 2 + inset],
    [-width / 2 + inset, depth / 2 - inset],
    [width / 2 - inset, depth / 2 - inset],
  ];

  return (
    <group>
      {/* Top */}
      <mesh castShadow receiveShadow position={[0, height - topThickness / 2, 0]} material={wood}>
        <boxGeometry args={[width, topThickness, depth]} />
      </mesh>

      {legStyle === 'panel' && (
        <>
          {/* Left leg plate */}
          <mesh castShadow position={[-width / 2 + legThickness / 2, (height - topThickness) / 2, 0]} material={wood}>
            <boxGeometry args={[legThickness, height - topThickness, depth - 0.04]} />
          </mesh>
          {/* Right drawer block */}
          <mesh castShadow position={[width / 2 - drawerW / 2, height - topThickness - drawerH / 2, 0]} material={wood}>
            <boxGeometry args={[drawerW, drawerH, depth - 0.06]} />
          </mesh>
          {/* Drawer knob */}
          <mesh castShadow position={[width / 2 - drawerW / 2, height - topThickness - drawerH * 0.32, depth / 2 - 0.02]}>
            <boxGeometry args={[0.1, 0.02, 0.02]} />
            <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
          </mesh>
        </>
      )}

      {legStyle === 'legs' &&
        corners.map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, legY / 2, z]} material={wood}>
            <boxGeometry args={[legThickness, legY, legThickness]} />
          </mesh>
        ))}

      {legStyle === 'hairpin' &&
        corners.map(([x, z], i) => {
          // Two slim rods splaying apart toward the floor — a hairpin leg.
          const splay = 0.09;
          return [-1, 1].map((s) => {
            const dz = s * splay * Math.sign(z || 1);
            const legH = Math.hypot(legY, splay);
            const lean = Math.atan2(splay, legY);
            return (
              <mesh key={`${i}.${s}`} castShadow position={[x, legY / 2, z - dz / 2]} rotation={[s * lean * Math.sign(z || 1), 0, 0]}>
                <cylinderGeometry args={[0.008, 0.008, legH, 8]} />
                <meshStandardMaterial {...metal} />
              </mesh>
            );
          });
        })}
    </group>
  );
}
