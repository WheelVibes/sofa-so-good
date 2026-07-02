/**
 * Cloud-backed {@link StorageAdapter} — talks to the Pages Function API
 * (`/api/designs`). Used only when a backend is configured AND the user is
 * signed in (see `adapter.ts`); guests always use `LocalStorageAdapter`.
 *
 * Loads are validated + migrated through the same schema pipeline as local
 * loads, so a cloud design is held to the identical trust boundary.
 */
import { ApiError, apiFetch } from '../../features/api/client'
import { type SerializedState, SerializedStateZ } from '../schema'
import { migrate } from './migrations'
import { type StorageAdapter, StorageError } from './StorageAdapter'

export const ServerAdapter: StorageAdapter = {
  async save(slot, state) {
    try {
      await apiFetch(`/designs/${encodeURIComponent(slot)}`, {
        method: 'PUT',
        body: JSON.stringify(state),
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 413) {
        throw new StorageError('quota', e.message)
      }
      throw new StorageError('corrupt', e instanceof Error ? e.message : 'Cloud save failed.')
    }
  },

  async load(slot) {
    let raw: unknown
    try {
      const res = await apiFetch<{ state: unknown }>(`/designs/${encodeURIComponent(slot)}`)
      raw = res.state
    } catch (e) {
      throw new StorageError('corrupt', e instanceof Error ? e.message : 'Cloud load failed.')
    }
    if (!raw) return null
    let migrated: unknown
    try {
      migrated = migrate(raw)
    } catch (e) {
      throw new StorageError('version', (e as Error).message)
    }
    const result = SerializedStateZ.safeParse(migrated)
    if (!result.success) throw new StorageError('corrupt', result.error.message)
    return result.data as SerializedState
  },

  async list() {
    try {
      const { slots } = await apiFetch<{ slots: { slot: string; savedAt: string }[] }>('/designs')
      return slots
    } catch {
      return []
    }
  },

  async delete(slot) {
    try {
      await apiFetch(`/designs/${encodeURIComponent(slot)}`, { method: 'DELETE' })
    } catch (e) {
      throw new StorageError('corrupt', e instanceof Error ? e.message : 'Cloud delete failed.')
    }
  },
}
