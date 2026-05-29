import { RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { readNum, readStr } from './shared';
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Upholstered armchair. Styles: 'standard' (boxy lounge chair), 'wingback'
 *  (tall winged back + rolled arms on tapered wood legs, STRANDMON-style),
 *  and 'tub' (a low curved barrel back wrapping into the arms). Faces +Z. */
export function Armchair({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.85);
  const depth = readNum(props, 'depth', 0.85);
  const color = readStr(props, 'color', '#b06a52');
  const material = readStr(props, 'material', 'fabric');
  const sheen = readNum(props, 'sheen', 0);
  const style = readStr(props, 'style', 'standard');

  const mat = getUpholsteryMaterial(material, color, sheen);
  // The open-ended barrel shell needs both faces lit; clone so we don't
  // mutate the shared cached material (which other items reuse).
  const shellMat = useMemo(() => {
    const m = mat.clone();
    m.side = DoubleSide;
    return m;
  }, [mat]);

  if (style === 'tub') {
    // Low barrel chair: a curved upholstered shell (open-ended cylinder
    // segment) wrapping the back and arms, with a thick seat cushion.
    const r = Math.min(width, depth) / 2;
    const shellH = 0.62;
    const seatH = 0.42;
    return (
      <group>
        {/* Curved back/arm shell — a ~230° arc opening toward +Z */}
        <mesh castShadow receiveShadow position={[0, shellH / 2 + 0.06, 0]} material={shellMat}>
          <cylinderGeometry args={[r, r * 0.96, shellH, 40, 1, true, Math.PI * 0.89, Math.PI * 1.22]} />
        </mesh>
        {/* Solid base block under the shell so it doesn't read as hollow */}
        <RoundedBox args={[width * 0.92, 0.2, depth * 0.92]} radius={0.06} smoothness={2} castShadow position={[0, 0.13, 0]} material={mat} />
        {/* Seat cushion */}
        <RoundedBox args={[width * 0.78, 0.16, depth * 0.7]} radius={0.06} smoothness={3} castShadow position={[0, seatH + 0.02, 0.05]} material={mat} />
        {/* Short tapered feet */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}.${sz}`} castShadow position={[sx * (r - 0.1), 0.025, sz * (r - 0.1)]}>
              <cylinderGeometry args={[0.022, 0.018, 0.05, 10]} />
              <meshStandardMaterial color="#2c2118" roughness={0.45} metalness={0.2} />
            </mesh>
          )),
        )}
      </group>
    );
  }

  const wing = style === 'wingback';
  // Wingback rides higher on tapered wood legs and has a taller back.
  const legH = wing ? 0.16 : 0.06;
  const baseH = 0.2;
  const baseY = legH;
  const seatH = legH + 0.36;
  const backH = wing ? 0.62 : 0.5;
  const armW = wing ? 0.12 : 0.14;
  const cushionH = 0.16;
  const innerW = width - armW * 2;
  const armTopY = wing ? seatH + 0.06 : seatH * 0.75;
  const armH = wing ? 0.42 : seatH * 0.9 + cushionH;

  return (
    <group>
      {/* Base */}
      <RoundedBox args={[width, baseH, depth]} radius={0.05} smoothness={2} castShadow receiveShadow position={[0, baseY + baseH / 2, 0]} material={mat} />
      {/* Seat cushion */}
      <RoundedBox args={[innerW, cushionH, depth - 0.18]} radius={0.05} smoothness={2} castShadow position={[0, seatH + cushionH / 2, 0.03]} material={mat} />
      {/* Back cushion (slightly reclined on the wingback) */}
      <group position={[0, seatH, -depth / 2 + 0.1]} rotation={[wing ? 0.06 : 0, 0, 0]}>
        <RoundedBox args={[innerW, backH, 0.18]} radius={0.05} smoothness={2} castShadow position={[0, backH / 2, 0]} material={mat} />
      </group>
      {/* Wings: angled panels flanking the top of the back */}
      {wing &&
        [-1, 1].map((s) => (
          <RoundedBox
            key={`w${s}`}
            args={[0.1, backH * 0.62, 0.26]}
            radius={0.04}
            smoothness={2}
            castShadow
            position={[s * (innerW / 2 - 0.01), seatH + backH * 0.62, -depth / 2 + 0.26]}
            rotation={[0, 0, s * 0.12]}
            material={mat}
          />
        ))}
      {/* Arms */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[armW, armH, depth]} radius={wing ? 0.06 : 0.05} smoothness={2} castShadow position={[(s * (width - armW)) / 2, armTopY, 0]} material={mat} />
      ))}
      {/* Feet — tapered wood splayed legs on the wingback, stubby otherwise */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}.${sz}`}
            castShadow
            position={[sx * (width / 2 - 0.08), legH / 2, sz * (depth / 2 - 0.08)]}
            rotation={wing ? [sz * -0.12, 0, sx * 0.12] : [0, 0, 0]}
          >
            <cylinderGeometry args={[0.025, wing ? 0.015 : 0.025, wing ? legH : 0.06, wing ? 10 : 8]} />
            <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.2} />
          </mesh>
        )),
      )}
    </group>
  );
}
