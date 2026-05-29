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

  // Cabinet door fronts with handles along the base run.
  const cabs = Math.max(1, Math.round(length / 0.6));
  const cabGap = 0.012;
  const cabW = (length - cabGap * (cabs + 1)) / cabs;

  return (
    <group>
      {/* Base cabinet */}
      <mesh castShadow receiveShadow position={[0, cabinetH / 2, 0]}>
        <boxGeometry args={[length, cabinetH, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Door fronts + handles */}
      {Array.from({ length: cabs }, (_, i) => {
        const x = -length / 2 + cabGap + cabW / 2 + i * (cabW + cabGap);
        return (
          <group key={i}>
            <mesh position={[x, cabinetH / 2, depth / 2 - 0.005]}>
              <boxGeometry args={[cabW, cabinetH - 0.06, 0.016]} />
              <meshStandardMaterial color={color} roughness={0.6} metalness={STYLISED_METALNESS} />
            </mesh>
            <mesh position={[x + (i % 2 ? -1 : 1) * (cabW / 2 - 0.04), cabinetH - 0.12, depth / 2 + 0.01]}>
              <boxGeometry args={[0.018, 0.12, 0.018]} />
              <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
      {/* Countertop */}
      <mesh castShadow receiveShadow position={[0, cabinetH + topThickness / 2, 0]}>
        <boxGeometry args={[length, topThickness, depth]} />
        {/* Polished dark-granite worktop — low roughness picks up the IBL. */}
        <meshStandardMaterial color="#34373d" roughness={0.22} metalness={0.15} />
      </mesh>
      {/* Tiled backsplash up the wall behind the run (countertop → uppers). */}
      <mesh receiveShadow position={[0, totalH + 0.24, -depth / 2 + 0.012]}>
        <boxGeometry args={[length, 0.48, 0.015]} />
        <meshStandardMaterial color="#e4e7e3" roughness={0.3} metalness={0.05} />
      </mesh>
      {hasSink && (() => {
        const sx = length * 0.25;
        const steel = { color: '#b7bdc2', roughness: 0.25, metalness: 0.8 } as const;
        return (
          <group>
            {/* Recessed stainless basin */}
            <mesh position={[sx, totalH - 0.06, 0]}>
              <boxGeometry args={[0.5, 0.12, 0.36]} />
              <meshStandardMaterial color="#9aa1a6" roughness={0.3} metalness={0.5} />
            </mesh>
            {/* Faucet base + riser + curved spout */}
            <mesh castShadow position={[sx, totalH + 0.02, -0.15]}>
              <cylinderGeometry args={[0.03, 0.035, 0.04, 12]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            <mesh castShadow position={[sx, totalH + 0.15, -0.15]}>
              <cylinderGeometry args={[0.014, 0.014, 0.26, 10]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            <mesh castShadow position={[sx, totalH + 0.27, -0.08]} rotation={[Math.PI / 2.2, 0, 0]}>
              <cylinderGeometry args={[0.013, 0.013, 0.18, 10]} />
              <meshStandardMaterial {...steel} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}
