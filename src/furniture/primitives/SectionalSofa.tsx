import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface SectionalSofaProps {
  props: ParamProps;
}

const SEAT_H = 0.42;
const BASE_H = 0.18;
const BACK_H = 0.45;
const ARM_W = 0.12;
const CUSHION_H = 0.16;
const BACK_T = 0.16;

/**
 * SectionalSofa primitive: an L-shaped sofa built from a main run + a
 * perpendicular chaise extension. Mirrors `Sofa.tsx`'s base/seat/back/arm/
 * cushion structure for the main run; the chaise is a depth-by-chaiseLength
 * extension joined at one end. The chaise side has no inner arm so the two
 * runs share a corner cleanly. Convention: a person seated on the main run
 * faces +Z; the chaise tucks into the -Z corner.
 */
export function SectionalSofa({ props }: SectionalSofaProps) {
  const mainLength = readNum(props, 'mainLength', 2.4);
  const chaiseLength = readNum(props, 'chaiseLength', 1.5);
  const depth = readNum(props, 'depth', 1.0);
  const chaiseSide = readStr(props, 'chaiseSide', 'right');
  const cushionCount = Math.max(1, Math.floor(readNum(props, 'cushionCount', 3)));
  const color = readStr(props, 'color', '#8aa1a8');

  const sideSign = chaiseSide === 'left' ? -1 : 1;

  // Bounding-box origin is the centre of the L's enclosing rectangle:
  // [-mainLength/2, mainLength/2] × [-chaiseLength/2, chaiseLength/2].
  // The main run occupies the +Z half (depth ≤ chaiseLength so it fits).
  const mainCenterZ = chaiseLength / 2 - depth / 2;

  const innerW = mainLength - ARM_W * 2;
  const cushionGap = 0.02;
  const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
  const cushionD = depth - 0.18;

  const mainCushions = Array.from({ length: cushionCount }, (_, i) => {
    const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
    return (
      <mesh key={i} castShadow position={[x, SEAT_H + CUSHION_H / 2, 0.04]}>
        <boxGeometry args={[cushionW, CUSHION_H, cushionD]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
      </mesh>
    );
  });

  // Chaise sits in the -Z half. Its long axis is along Z; depth-axis along X.
  // Length along Z = chaiseLength - depth (so the inner corner overlaps the main
  // run by `depth` and they share the corner block once).
  const chaiseRunLength = Math.max(0.01, chaiseLength - depth);
  const chaiseCenterX = sideSign * (mainLength / 2 - depth / 2);
  const chaiseCenterZ = -depth / 2 - chaiseRunLength / 2;
  const chaiseSeatInnerLen = chaiseRunLength - 0.1;
  const chaiseCushionLen = chaiseRunLength - 0.18;

  return (
    <group>
      {/* ── Main run, centred on (0, mainCenterZ) ───────────────────────── */}
      <group position={[0, 0, mainCenterZ]}>
        {/* Base */}
        <mesh castShadow receiveShadow position={[0, BASE_H / 2, 0]}>
          <boxGeometry args={[mainLength, BASE_H, depth]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Seat platform */}
        <mesh castShadow position={[0, SEAT_H, 0]}>
          <boxGeometry args={[innerW, 0.04, depth - 0.1]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Back */}
        <mesh castShadow position={[0, SEAT_H + BACK_H / 2, -depth / 2 + BACK_T / 2]}>
          <boxGeometry args={[mainLength, BACK_H, BACK_T]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Outer arm only — the chaise-side end is open so the runs join cleanly */}
        <mesh
          castShadow
          position={[-sideSign * (mainLength - ARM_W) / 2, (SEAT_H + BACK_H * 0.5) / 2 + 0.05, 0]}
        >
          <boxGeometry args={[ARM_W, SEAT_H + BACK_H * 0.5, depth]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {mainCushions}
      </group>

      {/* ── Chaise run, centred on (chaiseCenterX, chaiseCenterZ) ───────── */}
      <group position={[chaiseCenterX, 0, chaiseCenterZ]}>
        {/* Base */}
        <mesh castShadow receiveShadow position={[0, BASE_H / 2, 0]}>
          <boxGeometry args={[depth, BASE_H, chaiseRunLength]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Seat platform */}
        <mesh castShadow position={[0, SEAT_H, 0]}>
          <boxGeometry args={[depth - 0.1, 0.04, chaiseSeatInnerLen]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Back along the outer (chaise-side) face */}
        <mesh
          castShadow
          position={[sideSign * (depth / 2 - BACK_T / 2), SEAT_H + BACK_H / 2, 0]}
        >
          <boxGeometry args={[BACK_T, BACK_H, chaiseRunLength]} />
          <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        </mesh>
        {/* Single long chaise cushion */}
        <mesh castShadow position={[-sideSign * 0.04, SEAT_H + CUSHION_H / 2, 0]}>
          <boxGeometry args={[depth - 0.18, CUSHION_H, chaiseCushionLen]} />
          <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
        </mesh>
      </group>
    </group>
  );
}
