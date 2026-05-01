import { useFrame } from '@react-three/fiber';
import { useStore } from '../../state/store';

/** Drives the in-world clock when timeMode === 'accelerated'. Reads dt from
 *  three's frame loop and pushes an hour delta into the time slice each frame. */
export function AcceleratedClock() {
  useFrame((_, dt) => {
    const s = useStore.getState();
    if (s.timeMode !== 'accelerated') return;
    s.tickAccelerated(dt);
  });
  return null;
}
