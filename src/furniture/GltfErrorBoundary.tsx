import { Component, type ReactNode } from 'react'

interface Props {
  /** Footprint to size the fallback placeholder box (metres). */
  width: number
  depth: number
  height: number
  children: ReactNode
}

interface State {
  failed: boolean
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

  componentDidUpdate(prev: Props) {
    // A new model url (e.g. the user re-points the item) gets a fresh attempt.
    if (this.state.failed && prev.children !== this.props.children) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) {
      const { width, depth, height } = this.props
      const h = Math.max(0.2, height)
      return (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[Math.max(0.2, width), h, Math.max(0.2, depth)]} />
          <meshStandardMaterial color="#b9b4ad" roughness={0.9} transparent opacity={0.6} />
        </mesh>
      )
    }
    return this.props.children
  }
}
