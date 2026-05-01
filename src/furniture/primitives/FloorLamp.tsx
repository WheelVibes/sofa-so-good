import type { ParamProps } from '../types';

interface FloorLampProps {
  props: ParamProps;
}

/** Placeholder mesh for FloorLamp — replaced by a full primitive in a later task. */
export function FloorLamp(_: FloorLampProps) {
  return (
    <mesh>
      <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
      <meshStandardMaterial color="#888888" />
    </mesh>
  );
}
