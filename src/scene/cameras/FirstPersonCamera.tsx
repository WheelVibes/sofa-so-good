import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { DOORS, WALLS } from '../../apartment/constants';
import { resolveMovement, type CollisionWall } from '../../collision/walls';
import { KEYBINDINGS } from '../../controls/keybindings';
import { useStore } from '../../state/store';

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 1.4;
const PLAYER_RADIUS = 0.25;

function buildCollisionWalls(doorState: Record<string, { open: boolean }>): CollisionWall[] {
  const segs: CollisionWall[] = WALLS.map((w) => ({
    ax: w.start[0],
    az: w.start[1],
    bx: w.end[0],
    bz: w.end[1],
  }));
  for (const d of DOORS) {
    const isOpen = doorState[d.id]?.open ?? d.defaultOpen;
    if (isOpen) continue;
    const wall = WALLS.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    const ux = dx / length;
    const uz = dz / length;
    const sx = wall.start[0] + ux * d.offset;
    const sz = wall.start[1] + uz * d.offset;
    const ex = wall.start[0] + ux * (d.offset + d.width);
    const ez = wall.start[1] + uz * (d.offset + d.width);
    segs.push({ ax: sx, az: sz, bx: ex, bz: ez });
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
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    camera.position.set(11, EYE_HEIGHT, 6);
  }, [camera]);

  const tmpForward = useRef(new Vector3());
  const tmpRight = useRef(new Vector3());

  useFrame((_, dt) => {
    const dir = tmpForward.current;
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = tmpRight.current.set(dir.z, 0, -dir.x);

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
    if (dx === 0 && dz === 0) return;

    const len = Math.hypot(dx, dz);
    dx = (dx / len) * WALK_SPEED * dt;
    dz = (dz / len) * WALK_SPEED * dt;
    const from: [number, number] = [camera.position.x, camera.position.z];
    const to: [number, number] = [from[0] + dx, from[1] + dz];
    const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current);
    camera.position.set(next[0], EYE_HEIGHT, next[1]);

    const setDoorOpen = useStore.getState().setDoorOpen;
    for (const d of DOORS) {
      if (doors[d.id]?.open) continue;
      const wall = WALLS.find((w) => w.id === d.wallId);
      if (!wall) continue;
      const wdx = wall.end[0] - wall.start[0];
      const wdz = wall.end[1] - wall.start[1];
      const wlen = Math.hypot(wdx, wdz);
      const ux = wdx / wlen;
      const uz = wdz / wlen;
      const cx = wall.start[0] + ux * (d.offset + d.width / 2);
      const cz = wall.start[1] + uz * (d.offset + d.width / 2);
      const dist = Math.hypot(camera.position.x - cx, camera.position.z - cz);
      if (dist < 0.7) {
        setDoorOpen(d.id, true);
        break;
      }
    }
  });

  return <PointerLockControls />;
}
