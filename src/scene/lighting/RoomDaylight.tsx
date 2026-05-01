import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { PointLight } from 'three';
import { ROOMS } from '../../apartment/constants';
import { useStore } from '../../state/store';
import type { RoomId } from '../../apartment/types';
import { lightingFromAltitude } from './altitudeCurve';
import { roomCentroidPose, roomWindowedWallInjectors, type WallInjector } from './roomCentroids';
import { computeRoomDaylightIntensities } from './roomDaylightIntensities';
import { rotateAroundY, sunDirectionToScene } from './sunPosition';
import { useSunPosition } from './useSunPosition';

const TWEEN_DURATION = 0.6;
const FILL_DISTANCE = 5;
const FILL_DECAY = 2;
const INJECTOR_DECAY = 2;

interface RoomEntry {
  id: RoomId;
  centroid: { x: number; y: number; z: number };
  injectors: WallInjector[];
}

export function RoomDaylight() {
  const sun = useSunPosition();
  const orientation = useStore((s) => s.orientationDeg);

  const rooms = useMemo<RoomEntry[]>(() => {
    return (Object.keys(ROOMS) as RoomId[])
      .filter((id) => !ROOMS[id].external)
      .map((id) => ({
        id,
        centroid: roomCentroidPose(id),
        injectors: roomWindowedWallInjectors(id),
      }));
  }, []);

  const fillRefs = useRef<Map<RoomId, PointLight | null>>(new Map());
  const injectorRefs = useRef<Map<string, PointLight | null>>(new Map());
  const current = useRef<{
    fill: Map<RoomId, number>;
    inj: Map<string, number>;
    color: [number, number, number];
  }>({
    fill: new Map(rooms.map((r) => [r.id, 0])),
    inj: new Map(),
    color: [1, 1, 1],
  });

  useFrame((_, dt) => {
    // Read doors imperatively — useFrame already polls every frame, so subscribing
    // would only add unnecessary React re-renders on every door toggle.
    const doors = useStore.getState().doors;
    const rotated = rotateAroundY(sunDirectionToScene(sun), orientation);
    const intensities = computeRoomDaylightIntensities(rotated, sun.altitude, doors);
    const targetColor = lightingFromAltitude(sun.altitude).sunColor;
    const k = Math.min(1, dt / TWEEN_DURATION);

    const cur = current.current;
    cur.color[0] += (targetColor[0] - cur.color[0]) * k;
    cur.color[1] += (targetColor[1] - cur.color[1]) * k;
    cur.color[2] += (targetColor[2] - cur.color[2]) * k;

    for (const room of rooms) {
      const target = intensities[room.id];
      const curFill = cur.fill.get(room.id) ?? 0;
      const nextFill = curFill + (target.ambientFill - curFill) * k;
      cur.fill.set(room.id, nextFill);
      const fillLight = fillRefs.current.get(room.id);
      if (fillLight) {
        fillLight.intensity = nextFill;
        fillLight.color.setRGB(cur.color[0], cur.color[1], cur.color[2]);
      }
      for (let i = 0; i < room.injectors.length; i++) {
        const key = `${room.id}#${i}`;
        const curInj = cur.inj.get(key) ?? 0;
        const nextInj = curInj + (target.windowInjector - curInj) * k;
        cur.inj.set(key, nextInj);
        const inj = injectorRefs.current.get(key);
        if (inj) {
          inj.intensity = nextInj;
          inj.color.setRGB(cur.color[0], cur.color[1], cur.color[2]);
        }
      }
    }
  });

  return (
    <>
      {rooms.map((room) => (
        <group key={room.id}>
          <pointLight
            ref={(node) => { fillRefs.current.set(room.id, node); }}
            position={[room.centroid.x, room.centroid.y, room.centroid.z]}
            intensity={0}
            distance={FILL_DISTANCE}
            decay={FILL_DECAY}
            castShadow={false}
          />
          {room.injectors.map((inj, i) => {
            const key = `${room.id}#${i}`;
            return (
              <pointLight
                key={key}
                ref={(node) => { injectorRefs.current.set(key, node); }}
                position={inj.position}
                intensity={0}
                distance={inj.radius}
                decay={INJECTOR_DECAY}
                castShadow={false}
              />
            );
          })}
        </group>
      ))}
    </>
  );
}
