import type { ParamProps } from '../types';

interface TableLampProps {
  props: ParamProps;
}

/** Placeholder mesh for TableLamp — replaced by a full primitive in a later task. */
export function TableLamp(_: TableLampProps) {
  return (
    <mesh>
      <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
      <meshStandardMaterial color="#cccccc" />
    </mesh>
  );
}
