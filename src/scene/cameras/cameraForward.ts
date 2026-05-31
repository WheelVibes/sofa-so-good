import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

// Live camera-forward vector projected onto the world-XZ plane and normalised.
// Updated every frame by <CameraForwardTracker />. Read from non-R3F code
// (e.g. arrow-key nudge handler in App.tsx) to make movement camera-relative.
export const cameraForwardXZ = { x: 0, z: -1 }
// Live camera position projected onto the world-XZ plane (metres). Updated
// every frame alongside the forward vector; read by the minimap.
export const cameraPosXZ = { x: 0, z: 0 }

const tmp = new Vector3()

export function CameraForwardTracker() {
  const { camera } = useThree()
  useFrame(() => {
    camera.getWorldDirection(tmp)
    const len = Math.hypot(tmp.x, tmp.z)
    if (len > 1e-6) {
      cameraForwardXZ.x = tmp.x / len
      cameraForwardXZ.z = tmp.z / len
    }
    cameraPosXZ.x = camera.position.x
    cameraPosXZ.z = camera.position.z
  })
  return null
}
