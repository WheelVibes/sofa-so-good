import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Floor } from './floor/Floor';
import { Walls } from './Walls';
import { Windows } from './Window';

export function Apartment() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <Walls />
      <Windows />
      <Doors />
    </group>
  );
}
