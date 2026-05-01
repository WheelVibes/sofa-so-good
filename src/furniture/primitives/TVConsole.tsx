import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface TVConsoleProps {
  props: ParamProps;
}

/**
 * TV console primitive: long low cabinet with two visible drawer faces.
 */
export function TVConsole({ props }: TVConsoleProps) {
  const width = readNum(props, 'width', 1.8);
  const color = readStr(props, 'color', '#3a2f24');

  const depth = 0.4;
  const height = 0.45;
  const drawerInset = 0.015;
  const drawerW = (width - 0.06) / 2;

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Drawer faces (inset on +Z front) */}
      <mesh castShadow receiveShadow position={[-drawerW / 2 - 0.015, height / 2, depth / 2 - drawerInset]}>
        <boxGeometry args={[drawerW, height - 0.04, 0.012]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      <mesh castShadow receiveShadow position={[drawerW / 2 + 0.015, height / 2, depth / 2 - drawerInset]}>
        <boxGeometry args={[drawerW, height - 0.04, 0.012]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
    </group>
  );
}
