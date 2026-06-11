/**
 * WebXR immersive-VR support detection (F21). Pure async check, safe on every
 * browser: resolves false when `navigator.xr` is absent (desktop Safari,
 * headless) or the query throws (permissions policy).
 */

export interface XrNavigator {
  xr?: { isSessionSupported(mode: string): Promise<boolean> }
}

export async function detectVrSupport(
  nav: XrNavigator = navigator as XrNavigator,
): Promise<boolean> {
  try {
    return (await nav.xr?.isSessionSupported('immersive-vr')) ?? false
  } catch {
    return false
  }
}
