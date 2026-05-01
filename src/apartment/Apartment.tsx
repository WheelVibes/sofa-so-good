import { Ceiling } from './Ceiling';
import { Doors } from './Door';
import { Floor } from './floor/Floor';
import { Walls } from './walls/Walls';
import { Windows } from './Window';
import { RoomFillLights } from '../scene/lighting/RoomFillLights';

export function Apartment() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <Walls />
      <Windows />
      <Doors />
      <RoomFillLights />
    </group>
  );
}
