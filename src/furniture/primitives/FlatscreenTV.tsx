import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Soft abstract "content" for a powered-on screen — a sky/landscape gradient
 *  with a warm sun. Generated once and shared by every TV. */
let tvContentTex: Texture | null = null;
function getTvContent(): Texture {
  if (tvContentTex) return tvContentTex;
  const W = 128;
  const H = 72;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a4a7a');
  sky.addColorStop(0.55, '#7fa6c8');
  sky.addColorStop(0.6, '#d8c9a8');
  sky.addColorStop(1, '#2e3a32');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Warm sun glow.
  const sun = ctx.createRadialGradient(W * 0.7, H * 0.42, 1, W * 0.7, H * 0.42, 22);
  sun.addColorStop(0, '#fff3d0');
  sun.addColorStop(1, 'rgba(255,243,208,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  // Distant hills silhouette.
  ctx.fillStyle = '#3a4a44';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  ctx.quadraticCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.6);
  ctx.quadraticCurveTo(W * 0.8, H * 0.7, W, H * 0.58);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tvContentTex = tex;
  return tex;
}

/** Free-standing flatscreen TV: thin bezelled panel on a central neck +
 *  plate foot, sized so it sits on a TV console. */
export function FlatscreenTV({ props }: { props: ParamProps }) {
  // `size` is an enum of inch strings ('43'/'55'/…); parse to a number.
  const diagIn = Number(readStr(props, 'size', '55')) || 55;
  const screenColor = readStr(props, 'screenColor', '#0e1014');
  const on = readStr(props, 'screen', 'off') === 'on';
  const wallMounted = readStr(props, 'mount', 'stand') === 'wall';

  // 16:9 panel from the diagonal (inches → metres).
  const diagM = (diagIn * 0.0254);
  const w = diagM * 0.871;
  const h = diagM * 0.49;
  const standH = 0.06;
  // Wall-mounted: centre the panel at a viewing height; stand: sit on a foot.
  const panelY = wallMounted ? readNum(props, 'mountHeight', 1.35) : standH + 0.04 + h / 2;

  return (
    <group>
      {!wallMounted && (
        <>
          {/* Foot plate */}
          <mesh castShadow receiveShadow position={[0, standH / 2, 0]}>
            <boxGeometry args={[w * 0.42, standH, 0.22]} />
            <meshStandardMaterial color="#2a2c30" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Neck */}
          <mesh castShadow position={[0, standH + 0.04, 0]}>
            <boxGeometry args={[0.08, 0.1, 0.05]} />
            <meshStandardMaterial color="#2a2c30" roughness={0.5} metalness={0.4} />
          </mesh>
        </>
      )}
      {/* Bezel */}
      <mesh castShadow position={[0, panelY, 0]}>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color="#15171b" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Screen — dark glossy when off; lit content that self-illuminates
          when on (glows, and blooms at night on the high tier). */}
      <mesh position={[0, panelY, 0.021]}>
        <planeGeometry args={[w - 0.03, h - 0.03]} />
        {on ? (
          <meshStandardMaterial
            map={getTvContent()}
            emissiveMap={getTvContent()}
            emissive="#ffffff"
            emissiveIntensity={0.85}
            roughness={0.2}
            metalness={0}
            toneMapped={false}
          />
        ) : (
          <meshStandardMaterial
            color={screenColor}
            roughness={0.18}
            metalness={0.1}
            emissive={screenColor}
            emissiveIntensity={0.12}
          />
        )}
      </mesh>
    </group>
  );
}
