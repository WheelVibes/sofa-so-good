import { type ReactNode, Suspense } from 'react'
import { useStore } from '../../state/store'
import { lazyWithRetry } from '../../ui/app/lazyWithRetry'

const XrProvider = lazyWithRetry(() =>
  import('./XrProvider').then((m) => ({ default: m.XrProvider })),
)

/**
 * Inert pass-through until a VR session is requested (F21): the @react-three/xr
 * provider (and its chunk) only mounts once `vrActive` flips, so the default
 * scene pays nothing. While loading the chunk the children render unwrapped —
 * the provider mounts around them a frame later (the store/session survive).
 */
export function MaybeXr({ children }: { children: ReactNode }) {
  const vrActive = useStore((s) => s.vrActive)
  if (!vrActive) return <>{children}</>
  return (
    <Suspense fallback={<>{children}</>}>
      <XrProvider>{children}</XrProvider>
    </Suspense>
  )
}
