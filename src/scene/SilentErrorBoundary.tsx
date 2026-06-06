import { Component, type ReactNode } from 'react'

interface Props {
  /** Rendered on error; defaults to nothing. */
  fallback?: ReactNode
  /** Bumped/changed to retry after a transient failure (e.g. a new url). */
  resetKey?: unknown
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Minimal R3F-safe error boundary that swallows a child's render/load failure
 * and renders `fallback` (nothing by default) instead of letting it propagate to
 * the app-level boundary. Used to isolate optional async sub-trees — e.g. a
 * downloaded CC0 material whose textures 404/CORS-fail should simply not apply
 * (the furniture keeps its procedural fallback), never blank the scene. Retries
 * when `resetKey` changes.
 */
export class SilentErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
