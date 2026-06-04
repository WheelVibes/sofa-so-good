import { useEffect, useState } from 'react'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { canRecord } from '../../../scene/RecordController'
import { EXPORT_EVENT } from '../../../scene/ScreenshotController'
import { applySerialized, serialize } from '../../../state/schema'
import { LocalStorageAdapter } from '../../../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, getThumb, saveThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { MenuItem, ToolbarMenu } from '../ToolbarMenu'

/** File cluster: save / load (with slot thumbnails + resets) / export PNG /
 *  record clip. Logic lifted from the previous Toolbar's Save/Load/Export/
 *  Record buttons. */
export function FileMenu() {
  const recording = useStore((s) => s.recording)
  const setRecording = useStore((s) => s.setRecording)
  const resetToDefault = useStore((s) => s.resetToDefault)
  const resetToEmpty = useStore((s) => s.resetToEmpty)
  const [slots, setSlots] = useState<SlotMeta[]>([])

  // Refresh the slot list whenever the menu mounts a panel render.
  useEffect(() => {
    void LocalStorageAdapter.list().then(setSlots)
  }, [])
  const refresh = () => void LocalStorageAdapter.list().then(setSlots)

  const save = async () => {
    const name = prompt('Save layout as…')
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    try {
      await LocalStorageAdapter.save(slot, serialize(useStore.getState()))
      saveThumb(slot, captureThumb())
      refresh()
    } catch (e) {
      alert(`Could not save: ${(e as Error).message}`)
    }
  }

  const load = async (slot: string) => {
    const data = await LocalStorageAdapter.load(slot).catch(() => null)
    if (!data) {
      alert(`Could not load slot ${slot}`)
      return
    }
    const userIds = useStore.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    useStore.setState(applySerialized(data, known))
  }

  return (
    <ToolbarMenu icon="Save" label="File" active={recording} width={256}>
      <MenuItem icon="Save" label="Save…" sub="Store the current layout" onClick={save} />
      <MenuItem
        icon="Export"
        label="Export PNG"
        sub="Save the current view as an image"
        onClick={() => window.dispatchEvent(new Event(EXPORT_EVENT))}
      />
      {canRecord() ? (
        <MenuItem
          icon="Record"
          label={recording ? 'Stop recording' : 'Record clip'}
          sub="Capture a .webm video of the view"
          active={recording}
          onClick={() => setRecording(!recording)}
        />
      ) : null}

      <div className="mt-1 border-t border-[var(--border)] px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
        Load
      </div>
      <MenuItem
        icon="Reset"
        label="Default"
        sub="Reset to the floor-plan default"
        onClick={() => {
          if (confirm('Reset to floor-plan default? Your current layout will be lost.'))
            resetToDefault()
        }}
      />
      <MenuItem
        icon="Reset"
        label="Empty"
        sub="Clear all furniture"
        onClick={() => {
          if (confirm('Clear all furniture? This cannot be undone.')) resetToEmpty()
        }}
      />
      {slots.length === 0 ? (
        <p className="px-2 py-2 text-center text-[11px] text-[var(--text-3)]">No saved layouts.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {slots
            .slice()
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
            .map((s) => (
              <div
                key={s.slot}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-2)]"
              >
                <button
                  onClick={() => void load(s.slot)}
                  className="flex flex-1 items-center gap-2 truncate text-left"
                >
                  {getThumb(s.slot) ? (
                    <img
                      src={getThumb(s.slot)!}
                      alt=""
                      className="h-9 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-9 w-12 shrink-0 rounded bg-[var(--surface-2)]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text)]">
                      {s.slot}
                    </span>
                    <span className="block text-[10px] text-[var(--text-3)]">
                      {new Date(s.savedAt).toLocaleString()}
                    </span>
                  </span>
                </button>
                <button
                  onClick={async () => {
                    await LocalStorageAdapter.delete(s.slot)
                    deleteThumb(s.slot)
                    refresh()
                  }}
                  className="rounded px-1 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}
    </ToolbarMenu>
  )
}
