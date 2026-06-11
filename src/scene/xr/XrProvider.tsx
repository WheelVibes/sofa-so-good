import { XR } from '@react-three/xr'
import { type ReactNode, useEffect, useState } from 'react'
import { useStore } from '../../state/store'
import { getXrStore } from './xrStore'

type Store = Awaited<ReturnType<typeof getXrStore>>

/** Mounts the XR provider around the scene and clears `vrActive` when the
 *  headset session ends, so the wrapper unmounts back to the inert path. */
export function XrProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null)
  useEffect(() => {
    let disposed = false
    let unsub: (() => void) | undefined
    void getXrStore().then((s) => {
      if (disposed) return
      setStore(s)
      let hadSession = false
      unsub = s.subscribe((state) => {
        if (state.session) hadSession = true
        else if (hadSession) useStore.getState().setVrActive(false)
      })
    })
    return () => {
      disposed = true
      unsub?.()
    }
  }, [])
  if (!store) return <>{children}</>
  return <XR store={store}>{children}</XR>
}
