import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getUpholsteryMaterial, getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface SofaProps {
  props: ParamProps;
}

/**
 * Sofa primitive: base + back + two arms + N evenly-spaced cushions, all
 * with softly rounded edges so the upholstery reads as cushioned fabric.
 * Faces +Z (a person seated on it looks toward +Z).
 */
export function Sofa({ props }: SofaProps) {
  const width = readNum(props, 'width', 2.1);
  const depth = readNum(props, 'depth', 0.9);
  const cushionCount = Math.max(1, Math.floor(readNum(props, 'cushionCount', 3)));
  const color = readStr(props, 'color', '#8aa1a8');
  const pillowColor = readStr(props, 'pillowColor', '#c8775c');
  const material = readStr(props, 'material', 'fabric');
  const sheen = readNum(props, 'sheen', 0);
  const pattern = readStr(props, 'pattern', 'plain');
  const pillowPattern = readStr(props, 'pillowPattern', 'plain');
  const armStyle = readStr(props, 'armStyle', 'standard');

  // Proportions grounded in real 3-seater dimensions: seat surface ~44cm,
  // back top ~82cm, overall depth ~90cm, the frame raised on low feet.
  const footH = 0.08;
  const baseH = 0.18; // upholstered frame block
  const baseTop = footH + baseH; // 0.26 — where seat cushions rest
  const cushionH = 0.18;
  const seatTop = baseTop + cushionH; // ~0.44
  const backH = 0.56; // back top ≈ baseTop + backH = 0.82
  const recline = 0.11; // ~6° back lean for comfort
  const hasArms = armStyle !== 'armless';
  const armW = hasArms ? 0.16 : 0;
  const armTop = armStyle === 'low' ? 0.47 : 0.64;
  const armH = armTop - footH;

  const innerW = width - armW * 2;
  const cushionGap = 0.03;
  const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
  const cushionD = depth - 0.26;
  const backThick = 0.16;

  const mat = getUpholsteryMaterial(material, color, sheen, pattern);
  const r = 0.05;

  return (
    <group>
      {/* Upholstered frame, raised on the feet */}
      <RoundedBox args={[width, baseH, depth]} radius={r} smoothness={2} castShadow receiveShadow position={[0, footH + baseH / 2, 0]} material={mat} />
      {/* Reclined back — pivoted at its base so the top leans back ~6° */}
      <group position={[0, baseTop, -depth / 2 + backThick / 2 + 0.01]} rotation={[recline, 0, 0]}>
        <RoundedBox args={[innerW, backH, backThick]} radius={0.05} smoothness={2} castShadow position={[0, backH / 2, 0]} material={mat} />
      </group>
      {/* Arms (omitted when armless; lower profile for the 'low' style) */}
      {hasArms &&
        [-1, 1].map((s) => (
          <RoundedBox
            key={s}
            args={[armW, armH, depth]}
            radius={0.06}
            smoothness={2}
            castShadow
            position={[(s * (width - armW)) / 2, footH + armH / 2, 0]}
            material={mat}
          />
        ))}
      {/* Seat cushions, pulled slightly forward off the back */}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
        return (
          <RoundedBox
            key={i}
            args={[cushionW, cushionH, cushionD]}
            radius={0.06}
            smoothness={3}
            castShadow
            position={[x, baseTop + cushionH / 2, 0.04]}
            material={mat}
          />
        );
      })}
      {/* Back cushions — one per seat, resting on the seat against the back */}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
        return (
          <RoundedBox
            key={`bc${i}`}
            args={[cushionW - 0.02, 0.34, 0.14]}
            radius={0.06}
            smoothness={3}
            castShadow
            position={[x, seatTop + 0.15, -depth / 2 + 0.2]}
            rotation={[recline, 0, 0]}
            material={mat}
          />
        );
      })}
      {/* Accent throw pillows against the back, near each arm */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={`p${s}`}
          args={[0.34, 0.34, 0.12]}
          radius={0.05}
          smoothness={2}
          castShadow
          position={[s * (innerW / 2 - 0.22), seatTop + 0.16, -depth / 2 + 0.32]}
          rotation={[0.32, s * 0.18, s * 0.12]}
          material={getFabricMaterial(pillowColor, 0.95, pillowPattern)}
        />
      ))}
      {/* Tapered feet */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}.${sz}`} position={[sx * (width / 2 - 0.1), footH / 2, sz * (depth / 2 - 0.1)]} castShadow>
            <cylinderGeometry args={[0.03, 0.022, footH, 12]} />
            <meshStandardMaterial color="#2c2620" roughness={0.4} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}
