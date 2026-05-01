import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { PointLight } from 'three';
import { useStore } from '../../state/store';
import { ROOMS, FLAT } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';
import { roomDaylightFactor } from '../../apartment/daylight';
import { buildRoomGraph, relaxDaylight } from '../../apartment/roomGraph';
import { useSunPosition } from './useSunPosition';
import { sunDirectionToScene } from './sunPosition';

const FILL_ENABLED = true;
const BLEED_ENABLED = true;
const FILL_INTENSITY = 0.45;
const FILL_HEIGHT_FRAC = 0.85;
const FILL_TWEEN_DURATION = 0.6;

const ROOM_IDS = (Object.keys(ROOMS) as RoomId[]).filter((id) => !ROOMS[id].external);

function RoomFillLightsInner() {
  const sun = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);
  const doors = useStore((s) => s.doors);

  const target = useMemo(() => {
    const dir = sunDirectionToScene(sun);
    // Apply orientation: rotate dir on XZ by -orientation (lights live in scene-space).
    const rad = (-orientation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const sceneDir: [number, number, number] = [
      dir[0] * cos - dir[2] * sin,
      dir[1],
      dir[0] * sin + dir[2] * cos,
    ];
    const base: Record<RoomId, number> = {} as Record<RoomId, number>;
    for (const id of Object.keys(ROOMS) as RoomId[]) {
      base[id] = roomDaylightFactor(id, sceneDir);
    }
    const relaxed = BLEED_ENABLED
      ? relaxDaylight(base, buildRoomGraph(doors))
      : base;
    const intensities: Record<RoomId, number> = {} as Record<RoomId, number>;
    for (const id of ROOM_IDS) {
      intensities[id] = (1 - relaxed[id]) * FILL_INTENSITY;
    }
    return intensities;
  }, [sun, orientation, doors]);

  const refs = useRef<Record<RoomId, PointLight | null>>({} as Record<RoomId, PointLight | null>);
  const current = useRef<Record<RoomId, number>>(
    Object.fromEntries(ROOM_IDS.map((id) => [id, target[id]])) as Record<RoomId, number>,
  );

  useFrame((_, dt) => {
    const k = Math.min(1, dt / FILL_TWEEN_DURATION);
    for (const id of ROOM_IDS) {
      const t = target[id];
      const c = current.current[id];
      const next = c + (t - c) * k;
      current.current[id] = next;
      const light = refs.current[id];
      if (light) light.intensity = next;
    }
  });

  return (
    <>
      {ROOM_IDS.map((id) => {
        const r = ROOMS[id];
        const cx = r.origin[0] + r.width / 2;
        const cz = r.origin[1] + r.depth / 2;
        const ceiling = r.ceilingHeight ?? FLAT.ceilingHeight;
        const y = ceiling * FILL_HEIGHT_FRAC;
        return (
          <pointLight
            key={id}
            ref={(o) => { refs.current[id] = o; }}
            position={[cx, y, cz]}
            intensity={target[id]}
            distance={Math.max(r.width, r.depth) * 1.2}
            decay={2}
          />
        );
      })}
    </>
  );
}

export function RoomFillLights() {
  if (!FILL_ENABLED) return null;
  return <RoomFillLightsInner />;
}
