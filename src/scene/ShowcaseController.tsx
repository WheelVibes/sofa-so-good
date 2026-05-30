import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AccumulativeShadows, RandomizedLight } from '@react-three/drei';
import { Vector3 } from 'three';
import { useQuality } from './useQuality';
import { nextShowcaseState, type ShowcaseState } from './showcase';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from '../apartment/constants';

/**
 * While the camera is parked (see showcase.ts), drop in AccumulativeShadows so
 * the ground shadow converges to area-light-quality softness with no noise.
 * Any camera movement resets it and returns to the live render. Gated by the
 * `showcase` quality capability. Costs nothing while the camera moves.
 */
export function ShowcaseController() {
  const enabled = useQuality().showcase;
  const [state, setState] = useState<ShowcaseState>({ mode: 'live', stillSince: null });
  const prevPos = useRef(new Vector3());
  const stateRef = useRef(state);
  stateRef.current = state;

  useFrame(({ camera, clock }) => {
    if (!enabled) {
      if (stateRef.current.mode !== 'live') setState({ mode: 'live', stillSince: null });
      return;
    }
    const moved = prevPos.current.distanceToSquared(camera.position) > 1e-6;
    prevPos.current.copy(camera.position);
    const now = clock.getElapsedTime() * 1000;
    const next = nextShowcaseState(stateRef.current, { moved, now });
    if (next.mode !== stateRef.current.mode || next.stillSince !== stateRef.current.stillSince) {
      setState(next);
    }
  });

  if (!enabled || state.mode !== 'accumulate') return null;

  return (
    <AccumulativeShadows
      temporal
      frames={60}
      alphaTest={0.85}
      opacity={0.8}
      scale={Math.max(APARTMENT_EXT_W, APARTMENT_EXT_D) * 1.5}
      position={[APARTMENT_EXT_W / 2, 0.01, APARTMENT_EXT_D / 2]}
    >
      <RandomizedLight amount={8} radius={6} ambient={0.5} intensity={1} position={[5, 8, -3]} bias={0.001} />
    </AccumulativeShadows>
  );
}
