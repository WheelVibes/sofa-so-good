// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { useWallTexTransform, wallFaceKey } from './wallTexTransform'

describe('useWallTexTransform — face overrides room', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('falls back to the room when the face has no override', () => {
    useStore.getState().setSurfaceTexture('livingDining', 'wall', { angle: 0.5, scale: 2 })
    const { result } = renderHook(() => useWallTexTransform('livingDining', 'wall-int-b3-LD'))
    expect(result.current).toEqual({ scale: 2, angle: 0.5 })
  })

  it('uses the face override where it has one', () => {
    const st = useStore.getState()
    st.setSurfaceTexture('livingDining', 'wall', { angle: 0.5 })
    st.setWallFaceTexture(wallFaceKey('wall-int-b3-LD', 'livingDining'), { angle: 1.2 })
    const { result } = renderHook(() => useWallTexTransform('livingDining', 'wall-int-b3-LD'))
    expect(result.current?.angle).toBe(1.2)
  })

  it('leaves the room’s OTHER walls on the room direction', () => {
    const st = useStore.getState()
    st.setSurfaceTexture('livingDining', 'wall', { angle: 0.5 })
    st.setWallFaceTexture(wallFaceKey('wall-int-b3-LD', 'livingDining'), { angle: 1.2 })
    const { result } = renderHook(() => useWallTexTransform('livingDining', 'wall-int-shelter-LD'))
    expect(result.current?.angle).toBe(0.5)
  })

  it('is undefined when neither the face nor the room sets anything', () => {
    const { result } = renderHook(() => useWallTexTransform('livingDining', 'wall-int-b3-LD'))
    expect(result.current).toBeUndefined()
  })

  it('still answers at room level for a renderer with no wall id', () => {
    useStore.getState().setSurfaceTexture('livingDining', 'wall', { angle: 0.3 })
    const { result } = renderHook(() => useWallTexTransform('livingDining'))
    expect(result.current?.angle).toBe(0.3)
  })
})
