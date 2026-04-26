import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface MeasurementsSlice {
  showMeasurements: boolean;
  toggleMeasurements: () => void;
}

export const MEASUREMENTS_INITIAL: Pick<MeasurementsSlice, 'showMeasurements'> = {
  showMeasurements: false,
};

export const createMeasurementsSlice: SliceCreator<MeasurementsSlice, RootState> = (set) => ({
  ...MEASUREMENTS_INITIAL,
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
});
