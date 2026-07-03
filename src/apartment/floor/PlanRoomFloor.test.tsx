// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import type { BufferGeometry } from 'three'
import { MeshStandardMaterial } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The floor mesh hosts (`<mesh>` etc.) are R3F custom elements with no DOM
// equivalent; render them as inert hosts so we can drive the component's
// geometry lifecycle with plain @testing-library/react (matching geometryUtil's
// approach of probing resource disposal without a full WebGL canvas). Object
// props like `geometry=` don't survive to the DOM node, so instead we spy on the
// geometry factories and capture/track the actual buffers they hand back.
vi.mock('../../scene/SilentErrorBoundary', () => ({
  SilentErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

const sharedMaterial = new MeshStandardMaterial()
vi.mock('../../materials/useMaterial', () => ({
  useMaterialDef: () => ({ kind: 'solid', color: '#fff' }),
  useSolidMaterial: () => sharedMaterial,
  useTexturedMaterial: () => sharedMaterial,
  useProceduralMaterial: () => sharedMaterial,
}))

// Wrap the real geometry factories so we observe exactly which buffers the
// component builds (and can assert each one's dispose() over its lifecycle).
const built: BufferGeometry[] = []
vi.mock('../../materials/worldUv', async () => {
  const actual =
    await vi.importActual<typeof import('../../materials/worldUv')>('../../materials/worldUv')
  return {
    ...actual,
    worldUvPlaneGeometry: (...args: Parameters<typeof actual.worldUvPlaneGeometry>) => {
      const g = actual.worldUvPlaneGeometry(...args)
      built.push(g)
      return g
    },
    worldUvShapeGeometry: (...args: Parameters<typeof actual.worldUvShapeGeometry>) => {
      const g = actual.worldUvShapeGeometry(...args)
      built.push(g)
      return g
    },
  }
})

import { PlanRoomFloor } from './PlanRoomFloor'

beforeEach(() => {
  built.length = 0
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PlanRoomFloor geometry lifecycle (BUG-002)', () => {
  it('memoises the rectangular floor geometry across re-renders (no rebuild per render)', () => {
    const { rerender } = render(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={4} />,
    )
    expect(built).toHaveLength(1)
    const first = built[0]
    const disposeSpy = vi.spyOn(first, 'dispose')

    // Re-render with identical props: must NOT build a new geometry buffer.
    rerender(<PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={4} />)
    rerender(<PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={4} />)
    expect(built).toHaveLength(1)
    expect(disposeSpy).not.toHaveBeenCalled()
  })

  it('disposes the old rectangular geometry when dimensions change', () => {
    const { rerender } = render(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={4} />,
    )
    const first = built[0]
    const disposeSpy = vi.spyOn(first, 'dispose')

    rerender(<PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={5} depth={4} />)
    expect(built).toHaveLength(2)
    expect(built[1]).not.toBe(first)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('disposes the rectangular geometry on unmount', () => {
    const { unmount } = render(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={4} />,
    )
    const disposeSpy = vi.spyOn(built[0], 'dispose')
    unmount()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  it('guards degenerate (zero/negative) sizes — builds no geometry', () => {
    render(<PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={0} depth={4} />)
    render(<PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={-1} />)
    expect(built).toHaveLength(0)
  })

  it('memoises + disposes the polygon floor geometry too', () => {
    const triA: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
    ]
    const triB: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 3],
    ]
    const { rerender, unmount } = render(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={2} depth={2} polygon={triA} />,
    )
    expect(built).toHaveLength(1)
    const first = built[0]
    const disposeSpy = vi.spyOn(first, 'dispose')

    // Same polygon ref → stable geometry, no rebuild.
    rerender(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={2} depth={2} polygon={triA} />,
    )
    expect(built).toHaveLength(1)
    expect(disposeSpy).not.toHaveBeenCalled()

    // New polygon → old geometry disposed, new one built.
    rerender(
      <PlanRoomFloor materialId="solid:white" origin={[0, 0]} width={3} depth={3} polygon={triB} />,
    )
    expect(built).toHaveLength(2)
    expect(disposeSpy).toHaveBeenCalledTimes(1)

    const secondSpy = vi.spyOn(built[1], 'dispose')
    unmount()
    expect(secondSpy).toHaveBeenCalledTimes(1)
  })
})
