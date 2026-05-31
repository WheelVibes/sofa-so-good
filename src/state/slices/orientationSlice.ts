import type { RootState } from '../store'
import type { SliceCreator } from './types'

export interface OrientationSlice {
  orientationDeg: number
  setOrientationDeg: (deg: number) => void
}

const normalize = (deg: number): number => {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

export const ORIENTATION_INITIAL: Pick<OrientationSlice, 'orientationDeg'> = {
  orientationDeg: 0,
}

export const createOrientationSlice: SliceCreator<OrientationSlice, RootState> = (set) => ({
  ...ORIENTATION_INITIAL,
  setOrientationDeg: (deg) => set({ orientationDeg: normalize(deg) }),
})
