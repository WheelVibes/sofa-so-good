import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface KitchenCounterProps {
  props: ParamProps;
}

/**
 * Kitchen counter primitive: base cabinet + countertop. When `hasSink`
 * is on, a recessed plane stands in for a sink basin and a small
 * cylinder for a faucet. The counter extends along +X (`length`) and
 * has a fixed depth of 0.6 m.
 */
export function KitchenCounter({ props }: KitchenCounterProps) {
  const length = readNum(props, 'length', 2.4);
  const hasSink = readStr(props, 'hasSink', 'no') === 'yes';
  const color = readStr(props, 'color', '#e3dfd6');

  const depth = 0.6;
  const cabinetH = 0.85;
  const topThickness = 0.05;
  const totalH = cabinetH + topThickness;

  return (
    <group>
      {/* Base cabinet */}
      <mesh castShadow receiveShadow position={[0, cabinetH / 2, 0]}>
        <boxGeometry args={[length, cabinetH, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Countertop */}
      <mesh castShadow receiveShadow position={[0, cabinetH + topThickness / 2, 0]}>
        <boxGeometry args={[length, topThickness, depth]} />
        <meshStandardMaterial color="#cfcec8" roughness={0.4} metalness={0.1} />
      </mesh>
      {hasSink && (
        <>
          {/* Sink basin (recessed plane sits 0.04 m below the top) */}
          <mesh position={[length * 0.25, totalH - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.55, 0.4]} />
            <meshStandardMaterial color="#a9b3b8" roughness={0.3} metalness={0.4} />
          </mesh>
          {/* Faucet stem */}
          <mesh castShadow position={[length * 0.25 - 0.18, totalH + 0.12, -0.18]}>
            <cylinderGeometry args={[0.018, 0.018, 0.24, 8]} />
            <meshStandardMaterial color="#7e8285" roughness={0.3} metalness={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
}
