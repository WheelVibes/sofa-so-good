import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from '../apartment/constants';
import { mulberry32 } from '../materials/procedural/noise';
import { getFixtureGlow } from './lighting/fixtureGlow';

/**
 * Distant HDB-estate backdrop — the neighbouring blocks you always see out
 * an HDB window. A ring of low-poly towers (one shared unit-box geometry,
 * scaled per block) plus a far ground plane, rendered cheaply: no shadows,
 * a handful of shared materials, and one procedural façade texture. Window
 * emissive ramps up at night via the shared fixtureGlow signal, so the
 * skyline reads as lit windows after dark — at near-zero per-frame cost.
 */

const CX = APARTMENT_EXT_W / 2;
const CZ = APARTMENT_EXT_D / 2;

/** Build the shared façade albedo (concrete + recessed windows) and an
 *  emissive map where a fraction of windows are "lit" warm. */
function makeFacadeTextures(): { albedo: CanvasTexture; emissive: CanvasTexture } {
  const W = 128;
  const H = 256;
  const a = document.createElement('canvas');
  a.width = W;
  a.height = H;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const ac = a.getContext('2d')!;
  const ec = e.getContext('2d')!;

  ac.fillStyle = '#9498a0';
  ac.fillRect(0, 0, W, H);
  ec.fillStyle = '#000000';
  ec.fillRect(0, 0, W, H);

  const cols = 4;
  const rows = 8;
  const mx = W * 0.12;
  const my = H * 0.06;
  const gw = (W - mx * 2) / cols;
  const gh = (H - my * 2) / rows;
  const ww = gw * 0.64;
  const wh = gh * 0.6;
  const rnd = mulberry32(0x5eed);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mx + c * gw + (gw - ww) / 2;
      const y = my + r * gh + (gh - wh) / 2;
      // Recessed glazing on the albedo (cool dark blue-grey).
      ac.fillStyle = '#384350';
      ac.fillRect(x, y, ww, wh);
      // A subset of windows are lit at night (warm), with a little variety.
      const roll = rnd();
      if (roll < 0.42) {
        ec.fillStyle = roll < 0.1 ? '#cfe0ff' : '#ffd49a';
        ec.fillRect(x, y, ww, wh);
      }
    }
  }

  const albedo = new CanvasTexture(a);
  albedo.colorSpace = SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = RepeatWrapping;
  albedo.repeat.set(4, 6);
  const emissive = new CanvasTexture(e);
  emissive.wrapS = emissive.wrapT = RepeatWrapping;
  emissive.repeat.set(4, 6);
  return { albedo, emissive };
}

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  mat: number;
}

/** Deterministic ring of blocks around the flat, with a wide gap left clear
 *  so the skyline doesn't feel like a solid wall. */
function makeBlocks(): Block[] {
  const rnd = mulberry32(0xb10c);
  const blocks: Block[] = [];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.18;
    const radius = 34 + rnd() * 46;
    const x = CX + Math.cos(ang) * radius;
    const z = CZ + Math.sin(ang) * radius;
    const w = 16 + rnd() * 34;
    const d = 14 + rnd() * 26;
    const h = 26 + rnd() * 64;
    // Face roughly toward the flat, with jitter.
    const rot = -ang + (rnd() - 0.5) * 0.6;
    blocks.push({ x, z, w, d, h, rot, mat: i % 3 });
  }
  return blocks;
}

export function CityBackdrop() {
  const geom = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const { albedo, emissive } = useMemo(makeFacadeTextures, []);
  const blocks = useMemo(makeBlocks, []);

  // Three tinted variants share the one façade texture — varied concrete
  // tones at no extra texture memory.
  const materials = useMemo(() => {
    const tints = ['#aeb2b8', '#c4bcae', '#9aa6ad'];
    return tints.map(
      (color) =>
        new MeshStandardMaterial({
          color,
          map: albedo,
          emissive: '#ffce8a',
          emissiveMap: emissive,
          emissiveIntensity: 0,
          roughness: 0.85,
          metalness: 0,
        }),
    );
  }, [albedo, emissive]);

  const groundMat = useMemo(
    () => new MeshStandardMaterial({ color: '#6f7468', roughness: 1, metalness: 0 }),
    [],
  );

  // Night window glow tracks scene darkness (shared signal — O(1) per frame).
  useFrame(() => {
    const intensity = getFixtureGlow() * 1.35;
    for (const m of materials) m.emissiveIntensity = intensity;
  });

  return (
    <group renderOrder={-1}>
      {/* Far estate ground, just below the apartment slab. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, -0.2, CZ]}
        material={groundMat}
        receiveShadow={false}
      >
        <circleGeometry args={[240, 48]} />
      </mesh>
      {blocks.map((b, i) => (
        <mesh
          key={i}
          geometry={geom}
          material={materials[b.mat]}
          position={[b.x, b.h / 2 - 0.2, b.z]}
          rotation={[0, b.rot, 0]}
          scale={[b.w, b.h, b.d]}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}
