import { Sky as DreiSky } from '@react-three/drei'
import { noExportUserData } from '../../export/sceneGltf'
import { useStore } from '../../state/store'
import { isPhotoBackdropActive } from '../SceneBackdrop'
import { skyFromAltitude } from './altitudeCurve'
import { rotateY, sunDirectionToScene } from './sunPosition'
import { useSunPosition } from './useSunPosition'

/** Sky sun-position is rendered far away so DreiSky's shader places
 *  the disc near the horizon plane. */
const SKY_SUN_DISTANCE = 1000

export function Sky() {
  const sunPos = useSunPosition()
  const orientation = useStore((s) => s.orientationDeg)
  // In walk mode an active photo backdrop paints its own equirectangular sky into
  // `scene.background`; the DreiSky dome would occlude it, so hide it then. In
  // orbit (and for the `none` backdrop) the dome provides the plain sky.
  const kind = useStore((s) => s.backdrop)
  const cameraMode = useStore((s) => s.cameraMode)
  const hasCustom = useStore((s) => !!s.customBackdropUrl)
  if (isPhotoBackdropActive(kind, cameraMode, hasCustom)) return null
  const dir = sunDirectionToScene(sunPos)
  const scaled: [number, number, number] = [
    dir[0] * SKY_SUN_DISTANCE,
    dir[1] * SKY_SUN_DISTANCE,
    dir[2] * SKY_SUN_DISTANCE,
  ]
  const sunPosition = rotateY(scaled, orientation)
  const sky = skyFromAltitude(sunPos.altitude)
  return (
    <group userData={noExportUserData()}>
      <DreiSky
        sunPosition={sunPosition}
        turbidity={sky.turbidity}
        rayleigh={sky.rayleigh}
        mieCoefficient={sky.mieCoefficient}
        mieDirectionalG={sky.mieDirectionalG}
      />
    </group>
  )
}
