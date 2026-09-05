import { Component, type ReactNode } from 'react'

interface Props {
  /** Footprint to size the fallback placeholder box (metres). */
  width: number
  depth: number
  height: number
  /** The item's def id + model url — logged when a load fails, so an invisible
   *  IKEA/GLB placement (bug #3) surfaces the actual error + URL for diagnosis
   *  instead of silently showing the placeholder box. */
  defId?: string
  url?: string
  /** What to render on failure instead of the placeholder box. PHOTOREAL-HERO passes
   *  the parametric primitive, so a 404'd hero GLB degrades to the ordinary render. */
  fallback?: ReactNode
  children: ReactNode
}

interface State {
  failed: boolean
}

/** The neutral placeholder box shown at a GLB item's footprint when its model
 *  can't render — a failed load (error boundary) OR an unresolved url (no
 *  runtimeUrl, e.g. a blob that didn't rehydrate after reload). Keeps the piece
 *  visible, selectable and movable instead of leaving truly-invisible furniture
 *  (bug #3). Shared so both failure paths render the identical box. */
export function GltfPlaceholderBox({
  width,
  depth,
  height,
}: {
  width: number
  depth: number
  height: number
}) {
  const h = Math.max(0.2, height)
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[Math.max(0.2, width), h, Math.max(0.2, depth)]} />
      <meshStandardMaterial color="#b9b4ad" roughness={0.9} transparent opacity={0.6} />
    </mesh>
  )
}

/**
 * Isolates a single GLB item's load/render failure so one corrupt upload or a
 * 404'd remote model can't blank the whole scene (a thrown `useGLTF` error would
 * otherwise propagate past `<Suspense>` to the app-level boundary). On error it
 * renders a neutral placeholder box at the item's footprint so the piece is
 * still visible, selectable and movable while the rest of the scene stays live.
 *
 * Must wrap (not be inside) the `<Suspense>` — Suspense catches the loading
 * promise; this catches a rejected one.
 */
export class GltfErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Surface WHY a model didn't render (bug #3 "can't see the furniture" — the
    // placeholder box below is a failed GLB load, not truly invisible furniture).
    // Logging the def id + url + error makes the failure diagnosable from the
    // console instead of guessing. Cheap; only fires on an actual load failure.
    const { defId, url } = this.props
    console.error(
      `[GltfErrorBoundary] model failed to load — showing placeholder box.`,
      { defId, url },
      error,
    )
  }

  componentDidUpdate(prev: Props) {
    // A new model url (e.g. the user re-points the item) gets a fresh attempt.
    if (this.state.failed && prev.children !== this.props.children) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) {
      const { width, depth, height, fallback } = this.props
      if (fallback !== undefined) return fallback
      return <GltfPlaceholderBox width={width} depth={depth} height={height} />
    }
    return this.props.children
  }
}
