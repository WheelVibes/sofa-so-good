import { Ceiling } from './Ceiling'
import { Doors } from './Door'
import { Floor } from './floor/Floor'
import { Skirting } from './Skirting'
import { Windows } from './Window'
import { Walls } from './walls/Walls'

export function Apartment() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <Walls />
      <Skirting />
      <Windows />
      <Doors />
    </group>
  )
}
