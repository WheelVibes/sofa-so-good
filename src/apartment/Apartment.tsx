import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Floor } from './floor/Floor';
import { Walls } from './walls/Walls';
import { Windows } from './Window';
import { APARTMENT_EXT_W, APARTMENT_EXT_D } from './constants';

export function Apartment() {
  return (
    <group>
      {/* Structural floor slab — grounds the model (so it doesn't float on
          sky in the dollhouse view) and blocks see-through from below. */}
      <mesh position={[APARTMENT_EXT_W / 2, -0.1, APARTMENT_EXT_D / 2]} receiveShadow>
        <boxGeometry args={[APARTMENT_EXT_W + 0.5, 0.2, APARTMENT_EXT_D + 0.5]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} metalness={0} />
      </mesh>
      <Floor />
      <Ceiling />
      <Walls />
      <Windows />
      <Doors />
    </group>
  );
}
