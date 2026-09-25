import { useCallback, useEffect, useState } from 'react'
import { storage } from '../../state/storage/adapter'
import { onSlotIndexChange } from '../../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../../state/storage/StorageAdapter'

/**
 * The saved-layout list, kept current (R7-AA). Lists when `active` turns true
 * AND whenever the slot index changes — so a recovery copy written by a shared
 * link opened mid-session (the live `hashchange` path) appears in an
 * already-mounted File menu without a reload. `refresh` stays for callers whose
 * change the local index can't see (a cloud-only listing).
 */
export function useSavedSlots(active = true): [SlotMeta[], () => void] {
  const [slots, setSlots] = useState<SlotMeta[]>([])
  const refresh = useCallback(() => {
    void storage
      .list()
      .then(setSlots)
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!active) return
    refresh()
    return onSlotIndexChange(refresh)
  }, [active, refresh])
  return [slots, refresh]
}
