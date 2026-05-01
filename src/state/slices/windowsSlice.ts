import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type WindowTintPreset = 'none' | 'warm' | 'cool' | 'sage' | 'rose';

/** Linear-RGB tint per preset. `null` = clear glass (no decal rendered). */
export const WINDOW_TINT_RGB: Record<WindowTintPreset, [number, number, number] | null> = {
  none: null,
  warm: [1.0, 0.78, 0.45],
  cool: [0.55, 0.72, 1.0],
  sage: [0.6, 0.92, 0.65],
  rose: [1.0, 0.55, 0.65],
};

export const CURTAIN_OPACITY_MIN = 0.5;
export const CURTAIN_OPACITY_MAX = 1.0;

export interface WindowsSlice {
  windowTint: WindowTintPreset;
  curtainsClosed: boolean;
  curtainOpacity: number;
  setWindowTint: (t: WindowTintPreset) => void;
  setCurtainsClosed: (b: boolean) => void;
  setCurtainOpacity: (n: number) => void;
}

export const WINDOWS_INITIAL: Pick<
  WindowsSlice,
  'windowTint' | 'curtainsClosed' | 'curtainOpacity'
> = {
  windowTint: 'none',
  curtainsClosed: false,
  curtainOpacity: 0.85,
};

export const createWindowsSlice: SliceCreator<WindowsSlice, RootState> = (set) => ({
  ...WINDOWS_INITIAL,
  setWindowTint: (t) => set({ windowTint: t }),
  setCurtainsClosed: (b) => set({ curtainsClosed: b }),
  setCurtainOpacity: (n) =>
    set({
      curtainOpacity: Math.max(CURTAIN_OPACITY_MIN, Math.min(CURTAIN_OPACITY_MAX, n)),
    }),
});
