import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Fixtures } from './Fixtures';
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
      <Fixtures />
    </group>
  );
}
