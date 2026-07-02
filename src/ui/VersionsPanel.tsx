import { useCallback, useEffect, useRef, useState } from 'react'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { buildMergedCatalog } from '../furniture/catalog'
import type { FurnitureItem } from '../furniture/types'
import { BUILTIN_MATERIALS } from '../materials/builtinCatalog'
import { roomDisplayName } from '../state/rooms'
import { applySerialized, serialize } from '../state/schema'
import {
  DesignFileError,
  exportDesignToFile,
  importDesignFromFile,
} from '../state/storage/designFile'
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter'
import type { SlotMeta } from '../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, getThumb, saveThumb } from '../state/storage/slotThumbs'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'
import {
  diffVersionFinishes,
  diffVersionItems,
  type FinishChange,
  type VersionDiff,
} from './versionDiff'

interface VersionRow extends SlotMeta {
  count: number
}

/** Friendly material name for a finish id (custom colour → hex, builtin → name,
 *  unset → "default", else the raw id). */
function matName(id: string | undefined): string {
  if (!id) return 'default'
  if (id.startsWith('#')) return id.toUpperCase()
  return BUILTIN_MATERIALS[id]?.name ?? id
}

/** Compact relative time, e.g. "just now", "3m ago", "2h ago". */
function relativeTime(epoch: number): string {
  const secs = Math.max(0, Math.round((Date.now() - epoch) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
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
  const plan = useStore((s) => s.floorPlan)
  const itemCount = useStore((s) => s.items.length)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const [rows, setRows] = useState<VersionRow[]>([])
  const [compareSlot, setCompareSlot] = useState<{
    slot: string
    diff: VersionDiff
    finishes: FinishChange[]
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => void loadRows().then(setRows), [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  if (!open) return null

  const save = async () => {
    const name = await useStore.getState().promptText({
      title: 'Save version',
      label: 'Name this version',
      placeholder: 'e.g. Scandi living room',
      submitLabel: 'Save',
    })
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
    // Loading a whole design replaces the world, so prior undo steps reference a
    // different design — clear history (matching the file-import path) instead of
    // letting Ctrl+Z cross the restore boundary into incoherent state.
    useStore.getState().clearHistory?.()
    useStore.getState().requestHomeView()
    useStore.getState().notify.start({ title: `Restored “${slot}”`, kind: 'success' })
  }

  const compare = async (slot: string) => {
    if (compareSlot?.slot === slot) {
      setCompareSlot(null) // toggle off
      return
    }
    const data = await LocalStorageAdapter.load(slot).catch(() => null)
    const versionItems = (data as { items?: FurnitureItem[] } | null)?.items
    if (!Array.isArray(versionItems)) return
    const st = useStore.getState()
    const diff = diffVersionItems(st.items, versionItems, buildMergedCatalog(st))
    const versionFinishes = (
      data as {
        finishes?: { floor?: Record<string, string>; walls?: Record<string, string> }
      } | null
    )?.finishes
    const finishes = diffVersionFinishes(st.finishes, versionFinishes)
    setCompareSlot({ slot, diff, finishes })
  }

  const remove = async (slot: string) => {
    // Deleting a saved version is irreversible (no undo) — gate on the themed
    // confirm modal rather than silently deleting (P35 destructive-confirmation
    // policy; see src/ui/CLAUDE.md).
    const ok = await useStore.getState().confirmAction({
      title: 'Delete this version?',
      message: `“${slot}” will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete version',
      danger: true,
    })
    if (!ok) return
    await LocalStorageAdapter.delete(slot)
    deleteThumb(slot)
    void refresh()
  }

  const exportFile = () => {
    exportDesignToFile(useStore.getState(), `sofa-design-${new Date().toISOString().slice(0, 10)}`)
    useStore.getState().notify.start({ title: 'Design exported', kind: 'success' })
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    try {
      const data = await importDesignFromFile(file)
      const userIds = useStore.getState().userFurniture.map((d) => d.id)
      const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
      useStore.setState(applySerialized(data, known))
      useStore.getState().clearHistory?.()
      useStore.getState().requestHomeView()
      useStore.getState().notify.start({ title: 'Design imported', kind: 'success' })
    } catch (err) {
      const message = err instanceof DesignFileError ? err.message : 'Import failed.'
      const id = useStore
        .getState()
        .notify.start({ title: "Couldn't import design", kind: 'error' })
      useStore.getState().notify.error(id, message)
    }
  }

  return (
    <aside className="panel mini aux" id="versionsPanel" style={{ width: 340 }}>
      <AuxPanelHead
        title="Versions"
        sub="Layout history"
        docs="versions"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <button type="button" className="btn btn-accent btn-block" onClick={save}>
          <Icon.Save width={14} height={14} />
          Save current as version
        </button>

        <div className="ver-file-row" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ flex: 1 }}
            onClick={exportFile}
            title="Download this design as a .sofa.json file"
          >
            <Icon.Download width={14} height={14} />
            Export file
          </button>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            style={{ flex: 1 }}
            onClick={() => fileRef.current?.click()}
            title="Load a design from a .sofa.json file"
          >
            <Icon.Upload width={14} height={14} />
            Import file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
        </div>

        <div className="ver-list">
          <div className="ver-card current">
            <div className="ver-thumb" />
            <div className="ver-info">
              <div className="nm">
                Working layout <span className="badge ok">Current</span>
              </div>
              <div className="when">
                {lastSavedAt ? `Auto-saved ${relativeTime(lastSavedAt)}` : 'Editing now'}
              </div>
              <div className="stats">{itemCount} items</div>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Icon.Versions}
              title="No saved versions yet"
              description="Save the current layout as a named version above — you can restore or compare it any time."
              cta={{ label: 'Save current version', onClick: () => void save() }}
            />
          ) : null}

          {rows.map((r) => (
            <div className="ver-card liftable" key={r.slot}>
              <div className="ver-thumb">
                {getThumb(r.slot) ? <img src={getThumb(r.slot) ?? undefined} alt="" /> : null}
              </div>
              <div className="ver-info">
                <div className="nm">{r.slot}</div>
                <div className="when">{new Date(r.savedAt).toLocaleString()}</div>
                <div className="stats">
                  {r.count} items
                  {r.count !== itemCount ? (
                    <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>
                      ({r.count > itemCount ? '+' : ''}
                      {r.count - itemCount} vs current)
                    </span>
                  ) : null}
                </div>
                <div className="ver-actions">
                  <button type="button" onClick={() => void restore(r.slot)}>
                    <Icon.Versions width={13} height={13} /> Restore
                  </button>
                  <button
                    type="button"
                    className={compareSlot?.slot === r.slot ? 'on' : ''}
                    onClick={() => void compare(r.slot)}
                  >
                    <Icon.Checks width={13} height={13} /> Compare
                  </button>
                  <button type="button" className="del" onClick={() => void remove(r.slot)}>
                    <Icon.Trash width={13} height={13} />
                  </button>
                </div>
                {compareSlot?.slot === r.slot ? (
                  <div
                    className="ver-diff"
                    style={{
                      marginTop: 6,
                      fontSize: 'var(--t-2xs)',
                      lineHeight: 1.5,
                      color: 'var(--text-2)',
                    }}
                  >
                    {compareSlot.diff.gained.length === 0 &&
                    compareSlot.diff.lost.length === 0 &&
                    compareSlot.finishes.length === 0 ? (
                      <span>Identical to the current design.</span>
                    ) : (
                      <>
                        {compareSlot.diff.gained.map((l) => (
                          <div key={`g${l.defId}`} style={{ color: 'var(--accent-soft-text)' }}>
                            + {l.count} {l.name}
                          </div>
                        ))}
                        {compareSlot.diff.lost.map((l) => (
                          <div key={`l${l.defId}`} style={{ color: 'var(--danger)' }}>
                            − {l.count} {l.name}
                          </div>
                        ))}
                        {compareSlot.finishes.map((f) => (
                          <div key={`${f.surface}:${f.roomId}`} style={{ color: 'var(--text-2)' }}>
                            {roomDisplayName(f.roomId, plan)} {f.surface.toLowerCase()}:{' '}
                            {matName(f.from)} → {matName(f.to)}
                          </div>
                        ))}
                        <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
                          vs the current design (restoring would apply these).
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
