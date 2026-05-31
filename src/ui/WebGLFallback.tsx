import type { ReactNode } from 'react'

function isWebGL2Supported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

export function WebGLFallback({ children }: { children: ReactNode }) {
  if (typeof window !== 'undefined' && !isWebGL2Supported()) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50 p-8 text-center">
        <div className="max-w-md">
          <h1 className="mb-2 text-xl font-semibold text-neutral-800">WebGL not supported</h1>
          <p className="text-neutral-600">
            sofa-so-good needs WebGL 2 to render the 3D apartment. Try a recent version of Chrome,
            Firefox, Edge, or Safari with hardware acceleration enabled.
          </p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
