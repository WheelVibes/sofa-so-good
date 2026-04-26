import { WALLS } from '../constants';
import { WallSegment } from './WallSegment';

/** Maps over the wall registry and mounts one WallSegment per wall.
 *  Each WallSegment renders its body box + per-side interior face
 *  planes, picking up the adjacent room's wall material from the
 *  finishes slice. */
export function Walls() {
  return (
    <group>
      {WALLS.map((w) => (
        <WallSegment key={w.id} wall={w} />
      ))}
    </group>
  );
}
