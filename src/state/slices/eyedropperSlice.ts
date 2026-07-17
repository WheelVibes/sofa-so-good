import type { SampledFinish } from '../../materials/sampleFinish'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Finish eyedropper (UX-7) — "match that wall/floor's finish". A pick tool the
 * user arms from the FinishPicker header: while armed, the next click on a
 * floor/wall surface in the 3D scene SAMPLES its rendered finish (held as
 * `sampled`), and each subsequent click APPLIES that finish to the clicked
 * surface (paint-bucket style) via the shared finish-drop apply path. Clearing
 * the held sample (× chip) drops back to sampling mode while staying armed;
 * toggling off / Escape / leaving the room editor disarms.
 *
 * Session-only (like `isolateSlice` / the finish-drag signal) — never
 * persisted / serialized / autosaved. The armed toggle + held swatch are rare,
 * discrete events (not per-frame like a drag), so a store slice is the right
 * home: the picker button's pressed state, the canvas cursor cue, and the
 * scene click-interceptor all read it reactively.
 */
export interface EyedropperSlice {
  eyedropperArmed: boolean
  /** The finish sampled from a surface, awaiting apply — null in "sampling" mode. */
  sampledFinish: SampledFinish | null
  /** Arm/disarm sample mode. Arming clears any stale held sample; disarming
   *  clears both. Toggling to armed is gated by nothing (the caller — the
   *  picker button — only renders behind the `finishEyedropper` flag). */
  toggleEyedropper: () => void
  /** Force disarm + clear (Escape, apply-complete cleanup, room-editor exit). */
  disarmEyedropper: () => void
  /** Store / clear the held sample without changing the armed state. */
  setSampledFinish: (sample: SampledFinish | null) => void
}

export const EYEDROPPER_INITIAL: Pick<EyedropperSlice, 'eyedropperArmed' | 'sampledFinish'> = {
  eyedropperArmed: false,
  sampledFinish: null,
}

export const createEyedropperSlice: SliceCreator<EyedropperSlice, RootState> = (set) => ({
  ...EYEDROPPER_INITIAL,
  toggleEyedropper: () =>
    set((s) =>
      s.eyedropperArmed
        ? { eyedropperArmed: false, sampledFinish: null }
        : { eyedropperArmed: true, sampledFinish: null },
    ),
  disarmEyedropper: () =>
    set((s) =>
      s.eyedropperArmed || s.sampledFinish ? { eyedropperArmed: false, sampledFinish: null } : {},
    ),
  setSampledFinish: (sample) => set({ sampledFinish: sample }),
})
