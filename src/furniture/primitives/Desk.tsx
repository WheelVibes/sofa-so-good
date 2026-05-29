import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface DeskProps {
  props: ParamProps;
}

/**
 * Desk primitive: top + two leg plates + a single drawer block on the
 * right. Faces +Z (a person seated at the desk looks toward -Z).
 */
export function Desk({ props }: DeskProps) {
  const width = readNum(props, 'width', 1.4);
  const depth = readNum(props, 'depth', 0.6);
  const color = readStr(props, 'color', '#d5c2a3');

  const height = 0.74;
  const topThickness = 0.04;
  const legThickness = 0.04;
  const drawerW = 0.34;
  const drawerH = 0.36;

  const wood = getWoodMaterial(color, 1.5);
  return (
    <group>
      {/* Top */}
      <mesh castShadow receiveShadow position={[0, height - topThickness / 2, 0]} material={wood}>
        <boxGeometry args={[width, topThickness, depth]} />
      </mesh>
      {/* Left leg plate */}
      <mesh castShadow position={[-width / 2 + legThickness / 2, (height - topThickness) / 2, 0]} material={wood}>
        <boxGeometry args={[legThickness, height - topThickness, depth - 0.04]} />
      </mesh>
      {/* Right drawer block */}
      <mesh
        castShadow
        position={[width / 2 - drawerW / 2, height - topThickness - drawerH / 2, 0]}
        material={wood}
      >
        <boxGeometry args={[drawerW, drawerH, depth - 0.06]} />
      </mesh>
      {/* Drawer knob */}
      <mesh castShadow position={[width / 2 - drawerW / 2, height - topThickness - drawerH * 0.32, depth / 2 - 0.02]}>
        <boxGeometry args={[0.1, 0.02, 0.02]} />
        <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}
