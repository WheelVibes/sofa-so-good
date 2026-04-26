import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type TimeOfDay = 'day' | 'dusk' | 'night';

const TIME_ORDER: readonly TimeOfDay[] = ['day', 'dusk', 'night'];

export interface TimeSlice {
  timeOfDay: TimeOfDay;
  setTimeOfDay: (t: TimeOfDay) => void;
  cycleTimeOfDay: () => void;
}

export const TIME_INITIAL: Pick<TimeSlice, 'timeOfDay'> = {
  timeOfDay: 'day',
};

export const createTimeSlice: SliceCreator<TimeSlice, RootState> = (set) => ({
  ...TIME_INITIAL,
  setTimeOfDay: (t) => set({ timeOfDay: t }),
  cycleTimeOfDay: () =>
    set((s) => ({
      timeOfDay: TIME_ORDER[(TIME_ORDER.indexOf(s.timeOfDay) + 1) % TIME_ORDER.length],
    })),
});
