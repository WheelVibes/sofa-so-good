import type { StateCreator } from 'zustand'

/** Convenience signature for a slice creator that may read or write any
 *  field on the composed root state. Each slice imports `RootState` from
 *  `../store.ts` to keep the public type one-way: store → slices, never
 *  slice → store at runtime. */
export type SliceCreator<T, R> = StateCreator<R, [], [], T>
