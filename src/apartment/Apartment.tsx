import { Ceiling } from './Ceiling'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from './constants'
import { Doors } from './Door'
import { Floor } from './floor/Floor'
import { Skirting } from './Skirting'
import { Windows } from './Window'
import { Walls } from './walls/Walls'

export function Apartment() {
  return (
    <group>
      {/* Structural floor slab — grounds the model (so it doesn't float on
          sky in the dollhouse view) and blocks see-through from below.
          Its top sits 10 cm below the room floors (which lift to y=0.001):
          a 1 mm gap z-fought the floors on low-precision mobile depth
          buffers, producing triangle artifacts that flickered on rotation. */}
      <mesh position={[APARTMENT_EXT_W / 2, -0.2, APARTMENT_EXT_D / 2]} receiveShadow>
        <boxGeometry args={[APARTMENT_EXT_W + 0.5, 0.2, APARTMENT_EXT_D + 0.5]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} metalness={0} />
      </mesh>
      <Floor />
      <Ceiling />
      <Walls />
      <Skirting />
      <Windows />
      <Doors />
    </group>
  )
}
