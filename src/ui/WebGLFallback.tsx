import type { ReactNode } from 'react'

/** Cached once — probing on every render leaked WebGL contexts (browser cap ~8–16)
 *  and could evict the real Scene renderer ("Context Lost"). */
let webgl2Supported: boolean | null = null

function isWebGL2Supported(): boolean {
  if (webgl2Supported !== null) return webgl2Supported
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    webgl2Supported = !!gl
    // Drop the probe context so it doesn't count against the browser limit.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl2Supported = false
  }
  return webgl2Supported
}

export function WebGLFallback({ children }: { children: ReactNode }) {
  if (typeof window !== 'undefined' && !isWebGL2Supported()) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center text-center"
        style={{ background: 'var(--surface-2)', padding: 'var(--s-7)' }}
      >
        <div className="max-w-md">
          <h1
            style={{
              fontSize: 'var(--t-xl)',
              fontWeight: 800,
              lineHeight: 'var(--lh-tight)',
              color: 'var(--text)',
              marginBottom: 'var(--s-2)',
            }}
          >
            WebGL not supported
          </h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 'var(--lh-body)' }}>
            sofa-so-good needs WebGL 2 to render the 3D apartment. Try a recent version of Chrome,
            Firefox, Edge, or Safari with hardware acceleration enabled.
          </p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
