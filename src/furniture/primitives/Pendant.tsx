import type { ParamProps } from '../types';

interface PendantProps {
  props: ParamProps;
}

/** Placeholder mesh for Pendant — replaced by a full primitive in a later task. */
export function Pendant(_: PendantProps) {
  return (
    <mesh>
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshStandardMaterial color="#eeeeee" />
    </mesh>
  );
}
