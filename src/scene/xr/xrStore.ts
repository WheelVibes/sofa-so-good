/**
 * Singleton XR store (F21) — created lazily so @react-three/xr stays out of
 * the boot path until the VR feature is actually used. The Scene mounts the
 * <XR> provider with this store; UI calls `enterVr()`.
 */

import type { createXRStore } from '@react-three/xr'

type XRStore = ReturnType<typeof createXRStore>

let store: XRStore | null = null

export async function getXrStore(): Promise<XRStore> {
  if (!store) {
    const { createXRStore } = await import('@react-three/xr')
    store = createXRStore({ emulate: false })
  }
  return store
}

/** The store if it has been created (the Scene provider mounts on demand). */
export function peekXrStore(): XRStore | null {
  return store
}

/** Enter an immersive-VR session (creates the store on first use). */
export async function enterVr(): Promise<void> {
  const s = await getXrStore()
  await s.enterVR()
}
