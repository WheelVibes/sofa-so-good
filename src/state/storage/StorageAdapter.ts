/**
 * State-slot persistence interface (small JSON only — binary assets
 * live in IdbAssetStore). A future ServerAdapter implementing this
 * same interface is a one-file change; nothing else imports
 * localStorage directly.
 */

import type { SerializedState } from '../schema'

export interface SlotMeta {
  slot: string
  savedAt: string
}

export type StorageErrorKind = 'quota' | 'corrupt' | 'version' | 'missing-asset'

export class StorageError extends Error {
  constructor(
    public kind: StorageErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export interface StorageAdapter {
  save(slot: string, state: SerializedState): Promise<void>
  load(slot: string): Promise<SerializedState | null>
  list(): Promise<SlotMeta[]>
  delete(slot: string): Promise<void>
}
