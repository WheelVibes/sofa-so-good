import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getUpholsteryMaterial, getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * L-shaped sectional sofa — a main run plus a perpendicular chaise return on
 * one end (the staple of modern open-concept living rooms). Centred on the
 * footprint bounding box (width × (depth + chaise)); the back faces −Z. The
 * chaise sits on `chaiseSide` (+1 right / −1 left). Reuses the upholstery
 * material system so colour / material / sheen / weave all apply.
 */
export function SofaSectional({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 2.5); // main run along X
  const depth = readNum(props, 'depth', 0.95);
  const chaise = readNum(props, 'chaise', 1.0); // how far the chaise extends forward
  const color = readStr(props, 'color', '#8a9098');
  const pillowColor = readStr(props, 'pillowColor', '#b5683f');
  const material = readStr(props, 'material', 'fabric');
  const sheen = readNum(props, 'sheen', 0);
  const pattern = readStr(props, 'pattern', 'plain');
  const chaiseSide = readStr(props, 'chaiseSide', 'right') === 'left' ? -1 : 1;

  const mat = getUpholsteryMaterial(material, color, sheen, pattern);
  const r = 0.05;

  // Bounding box: X ∈ [-W/2, W/2], Z ∈ [-fd/2, fd/2], fd = depth + chaise.
  const fd = depth + chaise;
  const backZ = -fd / 2; // main sofa back plane
  const footH = 0.08;
  const baseH = 0.18;
  const baseTop = footH + baseH; // seat cushions rest here
  const cushionH = 0.18;
  const seatTop = baseTop + cushionH;
  const backH = 0.56;
  const recline = 0.11;
  const armW = 0.16;
  const backThick = 0.16;

  // Main run frame (full width, depth D), back at backZ.
  const mainCz = backZ + depth / 2;
  // Chaise occupies the forward area on chaiseSide; ~depth wide in X.
  const chaiseW = depth; // square-ish chaise
  const chaiseCx = chaiseSide * (width / 2 - chaiseW / 2);
  const chaiseCz = backZ + depth + chaise / 2; // forward of the main seat
  const chaiseDepthZ = chaise + 0.02;

  // Seat cushions fill the main run between the outer arm (one side) and the
  // chaise return (the other), so the usable span excludes both.
  const cushionCount = 3;
  const cushionGap = 0.03;
  const usableW = width - armW - chaiseW;
  const cw = (usableW - cushionGap * (cushionCount - 1)) / cushionCount;
  // Left edge of the cushion run: inboard of the arm when the chaise is on the
  // right (arm on the left), inboard of the chaise when it's on the left.
  const cushionLeft = chaiseSide > 0 ? -width / 2 + armW : -width / 2 + chaiseW;

  return (
    <group>
      {/* Main run upholstered frame */}
      <RoundedBox args={[width, baseH, depth]} radius={r} smoothness={2} castShadow receiveShadow position={[0, footH + baseH / 2, mainCz]} material={mat} />
      {/* Chaise base */}
      <RoundedBox args={[chaiseW, baseH, chaiseDepthZ]} radius={r} smoothness={2} castShadow receiveShadow position={[chaiseCx, footH + baseH / 2, chaiseCz]} material={mat} />

      {/* Reclined back along the main run */}
      <group position={[0, baseTop, backZ + backThick / 2 + 0.01]} rotation={[recline, 0, 0]}>
        <RoundedBox args={[width - armW * 2, backH, backThick]} radius={0.05} smoothness={2} castShadow position={[0, backH / 2, 0]} material={mat} />
      </group>
      {/* Outer arm (on the side away from the chaise) + arm at the back corner */}
      <RoundedBox args={[armW, baseTop + 0.2 - footH, depth]} radius={0.06} smoothness={2} castShadow position={[-chaiseSide * (width - armW) / 2, footH + (baseTop + 0.2 - footH) / 2, mainCz]} material={mat} />

      {/* Main seat cushions */}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = cushionLeft + cw / 2 + i * (cw + cushionGap);
        return (
          <RoundedBox key={i} args={[cw, cushionH, depth - 0.26]} radius={0.06} smoothness={3} castShadow position={[x, baseTop + cushionH / 2, mainCz + 0.04]} material={mat} />
        );
      })}
      {/* Main back cushions */}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = cushionLeft + cw / 2 + i * (cw + cushionGap);
        return (
          <RoundedBox key={`b${i}`} args={[cw - 0.02, 0.34, 0.14]} radius={0.06} smoothness={3} castShadow position={[x, seatTop + 0.15, backZ + 0.2]} rotation={[recline, 0, 0]} material={mat} />
        );
      })}
      {/* Chaise seat cushion */}
      <RoundedBox args={[chaiseW - 0.06, cushionH, chaiseDepthZ - 0.08]} radius={0.06} smoothness={3} castShadow position={[chaiseCx, baseTop + cushionH / 2, chaiseCz]} material={mat} />

      {/* Accent throw pillows in the corner */}
      {[-1, 1].map((s) => (
        <RoundedBox key={`p${s}`} args={[0.34, 0.34, 0.12]} radius={0.05} smoothness={2} castShadow position={[chaiseSide * (width / 2 - 0.5) - s * 0.3 * chaiseSide, seatTop + 0.16, backZ + 0.32]} rotation={[0.3, s * 0.2, s * 0.1]} material={getFabricMaterial(pillowColor, 0.95, pattern)} />
      ))}

      {/* Tapered feet at the bounding-box-ish corners */}
      {[
        [-width / 2 + 0.1, backZ + 0.1],
        [width / 2 - 0.1, backZ + 0.1],
        [chaiseCx - chaiseW / 2 + 0.1, chaiseCz + chaiseDepthZ / 2 - 0.1],
        [chaiseCx + chaiseW / 2 - 0.1, chaiseCz + chaiseDepthZ / 2 - 0.1],
        [-chaiseSide * (width / 2 - 0.1), mainCz + depth / 2 - 0.1],
      ].map(([fx, fz], i) => (
        <mesh key={`f${i}`} position={[fx, footH / 2, fz]} castShadow>
          <cylinderGeometry args={[0.03, 0.022, footH, 12]} />
          <meshStandardMaterial color="#2c2620" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
