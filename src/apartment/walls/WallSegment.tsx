import { Suspense, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { MeshStandardMaterial } from 'three';
import { FLAT, WALLS } from '../constants';
import {
  buildWallSegments,
  wallEndAbutmentThickness,
  wallThicknessMetres,
  type WallSegment as WallSegmentSpan,
} from '../wallSegments';
import { useStore } from '../../state/store';
import {
  useMaterialDef,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial';
import type { WallSpec, RoomId } from '../types';
import type {
  MaterialId,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types';
import { wallSidesSpans } from './wallRoomSides';

const FACE_OFFSET = 0.001; // lift face plane fractionally off the body box

interface FacePlaneProps {
  segLen: number;
  segHeight: number;
  segMid: number;
  segMidY: number;
  thickness: number;
  /** +1 = +Z face, -1 = -Z face in the wall's local frame. */
  sign: 1 | -1;
  material: MeshStandardMaterial;
}

function FacePlane({ segLen, segHeight, segMid, segMidY, thickness, sign, material }: FacePlaneProps) {
  const z = sign * (thickness / 2 + FACE_OFFSET);
  const yRot = sign === 1 ? 0 : Math.PI;
  return (
    <mesh position={[segMid, segMidY, z]} rotation={[0, yRot, 0]} material={material}>
      <planeGeometry args={[segLen, segHeight]} />
    </mesh>
  );
}

interface SegmentFaceProps extends Omit<FacePlaneProps, 'material'> {
  materialId: MaterialId;
}

function SolidSegmentFace({ def, ...rest }: Omit<FacePlaneProps, 'material'> & { def: SolidMaterialDef }) {
  const material = useSolidMaterial(def);
  return <FacePlane {...rest} material={material} />;
}

function TexturedSegmentFace({ def, ...rest }: Omit<FacePlaneProps, 'material'> & { def: TexturedMaterialDef }) {
  const material = useTexturedMaterial(def);
  return <FacePlane {...rest} material={material} />;
}

function SegmentFaceInner({ materialId, ...rest }: SegmentFaceProps) {
  const def = useMaterialDef(materialId);
  return def.kind === 'textured' ? (
    <TexturedSegmentFace def={def} {...rest} />
  ) : (
    <SolidSegmentFace def={def} {...rest} />
  );
}

const SegmentFace = memo(SegmentFaceInner);

interface WallSegmentProps {
  wall: WallSpec;
}

/** Renders one wall as: a generic body box per render-segment (structural
 *  concrete look) plus up to two interior face planes per segment, each
 *  painted with the adjacent room's wall finish. Sides are sampled per
 *  segment because some walls (e.g. wall-int-mid-S, wall-int-corridor-S)
 *  span multiple rooms — each segment's face must pick up its own room's
 *  finish, not the room that happens to sit at the whole-wall midpoint.
 *  External faces (no adjacent interior room) skip rendering. */
function WallSegmentInner({ wall }: WallSegmentProps) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const thickness = wallThicknessMetres(wall);
  // Half-thickness of the wall this end abuts (0 if the end is free). Used to
  // (a) extend the body box outward so corners close flush, and (b) pull the
  // interior face plane in to the inner edge of the abutting wall, so finish
  // textures stop exactly at the inner corner with no overlap into the body.
  const startAbut = wallEndAbutmentThickness(wall, WALLS, true) / 2;
  const endAbut = wallEndAbutmentThickness(wall, WALLS, false) / 2;
  const segments = buildWallSegments(wall, FLAT.ceilingHeight);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  // Subdivide each render segment further by room boundary projections
  // so a wall like wall-int-mid-S (which spans bath2/SY/HS on its north
  // face with no cutouts) gets one face-span per backing room.
  type FaceSpan = WallSegmentSpan & { positive: RoomId | null; negative: RoomId | null };
  const faceSpans: FaceSpan[] = [];
  for (const s of segments) {
    const spans = wallSidesSpans(wall, s.start, s.end);
    for (const span of spans) {
      faceSpans.push({
        start: span.start,
        end: span.end,
        bottom: s.bottom,
        top: s.top,
        positive: span.positive as RoomId | null,
        negative: span.negative as RoomId | null,
      });
    }
  }

  const wallFinishes = useStore(
    useShallow((s) => {
      const out: Partial<Record<RoomId, MaterialId>> = {};
      for (const span of faceSpans) {
        if (span.positive) out[span.positive] = s.finishes.walls[span.positive];
        if (span.negative) out[span.negative] = s.finishes.walls[span.negative];
      }
      return out;
    }),
  );

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {/* Body — one box per render segment (cutouts split the body). At the
          wall's absolute start/end, extend the body box by the abutting
          wall's half-thickness so it reaches that wall's outer face; without
          this, centerline-length boxes leave a notch at every outside corner. */}
      {segments.map((s, i) => {
        const extStart = s.start < 1e-6 ? startAbut : 0;
        const extEnd = s.end > length - 1e-6 ? endAbut : 0;
        const segLen = s.end - s.start + extStart + extEnd;
        const segMid = (s.start - extStart + s.end + extEnd) / 2 - length / 2;
        const segHeight = s.top - s.bottom;
        const segMidY = s.bottom + segHeight / 2;
        return (
          <mesh key={i} position={[segMid, segMidY, 0]} castShadow receiveShadow>
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial color="#dcd8d2" roughness={0.95} />
          </mesh>
        );
      })}
      {/* Interior face planes — one per (face-span, side), each painted
          with the room actually backing that span. Spans that touch the
          wall's absolute start/end are extended outward by the abutting
          wall's half-thickness so the finish reaches the outer corner edge
          (matching the body extension above). The extra portion sits inside
          the perpendicular wall's body and is hidden from view; visible
          finishes from adjacent walls now meet flush at the outer corner. */}
      {faceSpans.map((span, i) => {
        const extStart = span.start < 1e-6 ? startAbut : 0;
        const extEnd = span.end > length - 1e-6 ? endAbut : 0;
        const a = span.start - extStart;
        const b = span.end + extEnd;
        const segLen = b - a;
        const segMid = (a + b) / 2 - length / 2;
        const segHeight = span.top - span.bottom;
        const segMidY = span.bottom + segHeight / 2;
        const positiveMat = span.positive ? wallFinishes[span.positive] : null;
        const negativeMat = span.negative ? wallFinishes[span.negative] : null;
        return (
          <group key={i}>
            {positiveMat ? (
              <Suspense fallback={null}>
                <SegmentFace
                  segLen={segLen}
                  segHeight={segHeight}
                  segMid={segMid}
                  segMidY={segMidY}
                  thickness={thickness}
                  sign={1}
                  materialId={positiveMat}
                />
              </Suspense>
            ) : null}
            {negativeMat ? (
              <Suspense fallback={null}>
                <SegmentFace
                  segLen={segLen}
                  segHeight={segHeight}
                  segMid={segMid}
                  segMidY={segMidY}
                  thickness={thickness}
                  sign={-1}
                  materialId={negativeMat}
                />
              </Suspense>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export const WallSegment = memo(WallSegmentInner, (a, b) => a.wall === b.wall);

export type { WallSegmentSpan };
