import type { ParamProps } from '../types';

interface CeilingSpotProps {
  props: ParamProps;
}

/** Placeholder mesh for CeilingSpot — replaced by a full primitive in a later task. */
export function CeilingSpot(_: CeilingSpotProps) {
  return (
    <mesh>
      <cylinderGeometry args={[0.06, 0.06, 0.1, 8]} />
      <meshStandardMaterial color="#999999" />
    </mesh>
  );
}
