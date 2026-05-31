import { useStore } from '../../state/store'
import { FirstPersonCamera } from './FirstPersonCamera'
import { OrbitCamera } from './OrbitCamera'

export function CameraRig() {
  const mode = useStore((s) => s.cameraMode)
  return mode === 'orbit' ? <OrbitCamera /> : <FirstPersonCamera />
}
