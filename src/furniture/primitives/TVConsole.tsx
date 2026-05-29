import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
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
  const finish = readStr(props, 'finish', 'wood');

  const depth = 0.4;
  const height = 0.45;
  const drawerInset = 0.015;
  const drawerW = (width - 0.06) / 2;

  const wood = getSurfaceMaterial(finish, color, 1.6);
  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={wood}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      {/* Drawer faces (inset on +Z front) + bar handles */}
      {[-1, 1].map((s) => {
        const cx = s * (drawerW / 2 + 0.015);
        return (
          <group key={s}>
            <mesh castShadow position={[cx, height / 2, depth / 2 - drawerInset]} material={wood}>
              <boxGeometry args={[drawerW, height - 0.04, 0.012]} />
            </mesh>
            <mesh castShadow position={[cx, height / 2, depth / 2 + 0.01]}>
              <boxGeometry args={[drawerW * 0.45, 0.018, 0.018]} />
              <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
