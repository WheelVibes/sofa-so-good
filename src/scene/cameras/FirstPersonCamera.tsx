import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { DOORS, WALLS } from '../../apartment/constants';
import { isLineOfSightBlocked, resolveMovement, type CollisionWall } from '../../collision/walls';
import { KEYBINDINGS } from '../../controls/keybindings';
import { useStore } from '../../state/store';

interface DoorSegment {
  id: string;
  sx: number;
  sz: number;
  segDx: number;
  segDz: number;
}

const DOOR_SEGMENTS: DoorSegment[] = (() => {
  const out: DoorSegment[] = [];
  for (const d of DOORS) {
    const wall = WALLS.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const wdx = wall.end[0] - wall.start[0];
    const wdz = wall.end[1] - wall.start[1];
    const wlen = Math.hypot(wdx, wdz);
    if (wlen === 0) continue;
    const ux = wdx / wlen;
    const uz = wdz / wlen;
    const sx = wall.start[0] + ux * d.offset;
    const sz = wall.start[1] + uz * d.offset;
    const ex = wall.start[0] + ux * (d.offset + d.width);
    const ez = wall.start[1] + uz * (d.offset + d.width);
    out.push({ id: d.id, sx, sz, segDx: ex - sx, segDz: ez - sz });
  }
  return out;
})();

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 3.2;
const POINTER_SPEED = 1.4;
const PLAYER_RADIUS = 0.25;
const INTERACT_RADIUS = 2.0;
const AIM_CHECK_INTERVAL = 0.1;

function buildCollisionWalls(doorState: Record<string, { open: boolean }>): CollisionWall[] {
  const segs: CollisionWall[] = [];
  for (const wall of WALLS) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const ux = dx / length;
    const uz = dz / length;

    const openSpans: Array<{ start: number; end: number }> = [];
    for (const c of wall.cutouts) {
      if (c.kind !== 'door') continue;
      const door = DOORS.find((d) => d.wallId === wall.id && d.offset === c.offset && d.width === c.width);
      if (!door) continue;
      const isOpen = doorState[door.id]?.open ?? door.defaultOpen;
      if (isOpen) openSpans.push({ start: c.offset, end: c.offset + c.width });
    }
    openSpans.sort((a, b) => a.start - b.start);

    const pointAt = (t: number): [number, number] => [wall.start[0] + ux * t, wall.start[1] + uz * t];

    let cursor = 0;
    for (const span of openSpans) {
      if (span.start > cursor) {
        const [ax, az] = pointAt(cursor);
        const [bx, bz] = pointAt(span.start);
        segs.push({ ax, az, bx, bz });
      }
      cursor = span.end;
    }
    if (cursor < length) {
      const [ax, az] = pointAt(cursor);
      const [bx, bz] = pointAt(length);
      segs.push({ ax, az, bx, bz });
    }
  }
  return segs;
}

export function FirstPersonCamera() {
  const { camera } = useThree();
  const pressed = useRef<Record<string, boolean>>({});
  const doors = useStore((s) => s.doors);
  const collisionWalls = useRef<CollisionWall[]>([]);

  useEffect(() => {
    collisionWalls.current = buildCollisionWalls(doors);
  }, [doors]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      pressed.current[e.code] = true;
    };
    const onUp = (e: KeyboardEvent) => {
      pressed.current[e.code] = false;
    };
    const clearAll = () => {
      pressed.current = {};
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clearAll);
    document.addEventListener('pointerlockchange', clearAll);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clearAll);
      document.removeEventListener('pointerlockchange', clearAll);
    };
  }, []);

  useEffect(() => {
    camera.position.set(11, EYE_HEIGHT, 6);
    return () => {
      useStore.getState().setNearbyDoor(null);
    };
  }, [camera]);

  const tmpForward = useRef(new Vector3());
  const tmpRight = useRef(new Vector3());
  const aimAccum = useRef(0);

  useFrame((_, dt) => {
    const dir = tmpForward.current;
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = tmpRight.current.set(-dir.z, 0, dir.x);

    let dx = 0,
      dz = 0;
    if (pressed.current[KEYBINDINGS.walkForward]) {
      dx += dir.x;
      dz += dir.z;
    }
    if (pressed.current[KEYBINDINGS.walkBack]) {
      dx -= dir.x;
      dz -= dir.z;
    }
    if (pressed.current[KEYBINDINGS.walkRight]) {
      dx += right.x;
      dz += right.z;
    }
    if (pressed.current[KEYBINDINGS.walkLeft]) {
      dx -= right.x;
      dz -= right.z;
    }

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const stepDt = Math.min(dt, 0.05);
      dx = (dx / len) * WALK_SPEED * stepDt;
      dz = (dz / len) * WALK_SPEED * stepDt;
      const from: [number, number] = [camera.position.x, camera.position.z];
      const to: [number, number] = [from[0] + dx, from[1] + dz];
      const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current);
      camera.position.set(next[0], EYE_HEIGHT, next[1]);
    }

    aimAccum.current += dt;
    if (aimAccum.current < AIM_CHECK_INTERVAL) return;
    aimAccum.current = 0;

    const setNearbyDoor = useStore.getState().setNearbyDoor;
    let aimedId: string | null = null;
    let bestHitDist = INTERACT_RADIUS;
    const ox = camera.position.x;
    const oz = camera.position.z;
    for (const seg of DOOR_SEGMENTS) {
      const denom = dir.x * seg.segDz - dir.z * seg.segDx;
      if (Math.abs(denom) < 1e-6) continue;
      const relX = seg.sx - ox;
      const relZ = seg.sz - oz;
      const t = (relX * seg.segDz - relZ * seg.segDx) / denom;
      const u = (relX * dir.z - relZ * dir.x) / denom;
      if (t <= 0 || t > bestHitDist) continue;
      if (u < 0 || u > 1) continue;
      const hitX = ox + dir.x * t;
      const hitZ = oz + dir.z * t;
      if (isLineOfSightBlocked(ox, oz, hitX, hitZ, collisionWalls.current)) continue;
      bestHitDist = t;
      aimedId = seg.id;
    }
    setNearbyDoor(aimedId);
  });

  return <PointerLockControls pointerSpeed={POINTER_SPEED} />;
}
