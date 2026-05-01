import type { ParamProps } from '../types';

interface SconceProps {
  props: ParamProps;
}

/** Placeholder mesh for Sconce — replaced by a full primitive in a later task. */
export function Sconce(_: SconceProps) {
  return (
    <mesh>
      <boxGeometry args={[0.15, 0.2, 0.1]} />
      <meshStandardMaterial color="#aaaaaa" />
    </mesh>
  );
}
