import { useCallback, useEffect, useState } from 'react'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { applySerialized, serialize } from '../state/schema'
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, getThumb, saveThumb } from '../state/storage/slotThumbs'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

interface VersionRow extends SlotMeta {
  count: number
}

async function loadRows(): Promise<VersionRow[]> {
  const slots = await LocalStorageAdapter.list().catch(() => [] as SlotMeta[])
  const withCounts = await Promise.all(
    slots.map(async (s) => {
      const data = await LocalStorageAdapter.load(s.slot).catch(() => null)
      const count = (data as { items?: unknown[] } | null)?.items?.length ?? 0
      return { ...s, count }
    }),
  )
  withCounts.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  return withCounts
}

/** Versions: save / restore / delete named layout snapshots with thumbnails,
 *  built on the real localStorage slot system. */
export function VersionsPanel() {
  const open = useStore((s) => s.versionsOpen)
  const setOpen = useStore((s) => s.setVersionsOpen)
  const itemCount = useStore((s) => s.items.length)
  const [rows, setRows] = useState<VersionRow[]>([])

  const refresh = useCallback(() => void loadRows().then(setRows), [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  if (!open) return null

  const save = async () => {
    const name = prompt('Save this version as…')
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    await LocalStorageAdapter.save(slot, serialize(useStore.getState()))
    saveThumb(slot, captureThumb())
    void refresh()
    useStore.getState().notify.start({ title: `Saved version “${slot}”`, kind: 'success' })
  }

  const restore = async (slot: string) => {
    const data = await LocalStorageAdapter.load(slot).catch(() => null)
    if (!data) return
    const userIds = useStore.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    useStore.setState(applySerialized(data, known))
    useStore.getState().notify.start({ title: `Restored “${slot}”`, kind: 'success' })
  }

  const remove = async (slot: string) => {
    await LocalStorageAdapter.delete(slot)
    deleteThumb(slot)
    void refresh()
  }

  return (
    <aside className="panel mini aux" id="versionsPanel" style={{ width: 340 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Versions</div>
          <div className="panel-sub">Layout history</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
      <hr className="hr" />
      <div className="panel-body">
        <button type="button" className="btn btn-accent btn-block" onClick={save}>
          <Icon.Save width={14} height={14} />
          Save current as version
        </button>

        <div className="ver-list">
          <div className="ver-card current">
            <div className="ver-thumb" />
            <div className="ver-info">
              <div className="nm">
                Working layout <span className="badge ok">Current</span>
              </div>
              <div className="when">Editing now</div>
              <div className="stats">{itemCount} items</div>
            </div>
          </div>

          {rows.map((r) => (
            <div className="ver-card" key={r.slot}>
              <div className="ver-thumb">
                {getThumb(r.slot) ? <img src={getThumb(r.slot) ?? undefined} alt="" /> : null}
              </div>
              <div className="ver-info">
                <div className="nm">{r.slot}</div>
                <div className="when">{new Date(r.savedAt).toLocaleString()}</div>
                <div className="stats">{r.count} items</div>
                <div className="ver-actions">
                  <button type="button" onClick={() => void restore(r.slot)}>
                    <Icon.Versions width={13} height={13} /> Restore
                  </button>
                  <button type="button" className="del" onClick={() => void remove(r.slot)}>
                    <Icon.Trash width={13} height={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
