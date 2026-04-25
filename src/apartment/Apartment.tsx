import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Floor } from './Floor';
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
