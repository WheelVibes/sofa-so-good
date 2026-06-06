import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label shown in the heading, e.g. "3D scene". Defaults to "app". */
  scope?: string
  /**
   * Optional custom fallback renderer. Receives the error + a reset callback
   * that re-mounts the subtree. When omitted the default recovery card shows.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-level React error boundary. A render/lifecycle throw anywhere below this
 * boundary is caught here and turns into a themed recovery card instead of a
 * blank white screen — the single worst failure mode for a commercial app.
 *
 * Recovery options:
 *  - **Try again** re-mounts the subtree (good for transient/render-only faults).
 *  - **Reload** does a hard reload.
 *  - **Reset layout & reload** clears the autosave key so a corrupt persisted
 *    layout can't crash-loop the app, then reloads.
 *
 * WebGL context loss is handled separately (ContextLossGuard); this catches the
 * React-side failures that context guard cannot.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console for diagnostics; no remote telemetry is sent.
    console.error('[ErrorBoundary] caught a render error:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  private hardReload = () => window.location.reload()

  private resetAndReload = () => {
    try {
      // Only the autosave slot is restored on boot, so it's the sole key that
      // can crash-loop the app. Named save slots load on explicit user action,
      // so leave them (and appearance/onboarding prefs) untouched — this keeps
      // the recovery minimally destructive.
      localStorage.removeItem('sofa-so-good:save:autosave')
    } catch {
      // localStorage may be unavailable; reload regardless.
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const scope = this.props.scope ?? 'app'
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-[var(--surface-2)] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-xl">
          <div className="mb-3 text-3xl">🛋️</div>
          <h1 className="mb-2 text-xl font-semibold text-[var(--text)]">
            Something went wrong in the {scope}
          </h1>
          <p className="mb-5 text-sm text-[var(--text-2)]">
            The {scope} hit an unexpected error. Your saved design is on disk — try recovering
            below. If it keeps happening, resetting the in-progress layout usually clears it.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent,#fff)]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.resetAndReload}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-2)]"
            >
              Reset layout & reload
            </button>
          </div>
          {error.message ? (
            <details className="mt-5 text-left">
              <summary className="cursor-pointer text-xs text-[var(--text-2)]">
                Technical details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-left text-[11px] text-[var(--text-2)]">
                {error.message}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    )
  }
}
