import { useFeature } from '../../../features/useFeature'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { canRecord } from '../../../scene/RecordController'
import { EXPORT_EVENT } from '../../../scene/ScreenshotController'
import { applySerialized, serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import type { SlotMeta } from '../../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, saveThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { downloadCostBreakdownCsv } from '../../openCostBreakdownCsv'
import { downloadFfeCsv } from '../../openFfeCsv'
import { downloadFurnitureCsv } from '../../openFurnitureCsv'
import { downloadRoomScheduleCsv } from '../../openRoomScheduleCsv'
import { exportScene3d } from '../../openSceneExport'
import { openSh3dImport } from '../../openSh3dImport'
import { openShoppingList } from '../../openShoplist'
import { Icon } from '../icons'
import { Item, Section } from './parts'

/** File — save / export / import / reset, plus the saved-layout list. */
export function FileSection({
  activeId,
  act,
  slots,
  refreshSlots,
}: {
  activeId: string
  act: (fn: () => void, opts?: { keep?: boolean }) => () => void
  slots: SlotMeta[]
  refreshSlots: () => void
}) {
  const s = useStore
  const recording = useStore((st) => st.recording)

  const fPanorama = useFeature('panorama')
  const fPanoTour = useFeature('panoTour')
  const fHqRender = useFeature('hqRender')
  const fRenderCompare = useFeature('renderCompare')
  const fStagingReveal = useFeature('stagingReveal')
  const fTimeCompare = useFeature('timeCompare')
  const fShopExport = useFeature('shopExport')
  const fSceneExport = useFeature('sceneExport3d')
  const fImportSh3d = useFeature('importSh3d')

  const saveLayout = async () => {
    const name = await s.getState().promptText({
      title: 'Save layout',
      label: 'Name this layout',
      placeholder: 'e.g. Living room v2',
      submitLabel: 'Save',
    })
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    try {
      await storage.save(slot, serialize(s.getState()))
      saveThumb(slot, captureThumb())
      refreshSlots()
      s.getState().notify.start({ title: `Saved layout “${slot}”`, kind: 'success' })
    } catch (e) {
      s.getState().notify.start({ title: `Could not save: ${(e as Error).message}`, kind: 'error' })
    }
  }
  const loadLayout = async (slot: string) => {
    const data = await storage.load(slot).catch(() => null)
    if (!data) {
      s.getState().notify.start({ title: `Could not load slot ${slot}`, kind: 'error' })
      return
    }
    const userIds = s.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    s.setState(applySerialized(data, known))
    // Loading replaces the world; clear undo history so Ctrl+Z can't cross into
    // the previous design (consistent with import / version restore).
    s.getState().clearHistory?.()
    s.getState().requestHomeView()
    s.getState().notify.start({ title: `Loaded “${slot}”`, kind: 'success' })
  }
  const deleteLayout = async (slot: string) => {
    await storage.delete(slot)
    deleteThumb(slot)
    refreshSlots()
  }

  return (
    <Section id="file" title="File" icon="Save" activeId={activeId}>
      <Item icon="Save" label="Save…" sub="Store the current layout" onClick={act(saveLayout)} />
      <Item
        icon="Export"
        label="Export PNG"
        onClick={act(() => window.dispatchEvent(new Event(EXPORT_EVENT)))}
      />
      {fPanorama ? (
        <Item
          icon="Export"
          label="360° panorama"
          sub="Capture a look-around panorama"
          docs="panorama"
          onClick={act(() => s.getState().setPanoramaOpen(true))}
        />
      ) : null}
      {fPanoTour ? (
        <Item
          icon="Walkthrough"
          label="360° tour"
          sub="Linked panoramas — jump room to room"
          docs="panoTour"
          onClick={act(() => s.getState().setPanoTourOpen(true))}
        />
      ) : null}
      {fHqRender ? (
        <Item
          icon="Export"
          label="HQ render"
          sub="Path-traced photoreal still"
          onClick={act(() => s.getState().setHqRenderOpen(true))}
        />
      ) : null}
      {fRenderCompare ? (
        <Item
          icon="Export"
          label="Render compare"
          sub="A/B compare two render presets"
          docs="renderCompare"
          onClick={act(() => s.getState().setRenderCompareOpen(true))}
        />
      ) : null}
      {fStagingReveal ? (
        <Item
          icon="Export"
          label="Before / after"
          sub="Reveal slider: empty room vs furnished"
          onClick={act(() => s.getState().setStagingRevealOpen(true))}
        />
      ) : null}
      {fTimeCompare ? (
        <Item
          icon="Time"
          label="Time-of-day compare"
          sub="Reveal slider: your design at two times of day"
          docs="timeCompare"
          onClick={act(() => s.getState().setTimeCompareOpen(true))}
        />
      ) : null}
      {fShopExport ? (
        <Item
          icon="Budget"
          label="Shopping list"
          sub="Buy-list with prices, grouped by retailer"
          docs="shopExport"
          onClick={act(() => openShoppingList())}
        />
      ) : null}
      {fShopExport ? (
        <Item
          icon="Export"
          label="Furniture list (CSV)"
          sub="Spreadsheet of every item — dims, qty, prices"
          onClick={act(() => void downloadFurnitureCsv())}
        />
      ) : null}
      {fShopExport ? (
        <Item
          icon="Export"
          label="Room schedule (CSV)"
          sub="Per-room area, perimeter, finishes & ceiling"
          onClick={act(() => void downloadRoomScheduleCsv())}
        />
      ) : null}
      {fShopExport ? (
        <Item
          icon="Export"
          label="FF&E schedule (CSV)"
          sub="Item-by-item schedule — source, SKU, size, qty, price"
          onClick={act(() => void downloadFfeCsv())}
        />
      ) : null}
      {fShopExport ? (
        <Item
          icon="Export"
          label="Cost breakdown (CSV)"
          sub="Furniture + finishes + renovation, with a grand total"
          onClick={act(() => void downloadCostBreakdownCsv())}
        />
      ) : null}
      {fSceneExport ? (
        <Item
          icon="Export"
          label="Export 3D model (.glb)"
          sub="Whole furnished scene for Blender / AR / Coohom"
          onClick={act(() => void exportScene3d('glb'))}
        />
      ) : null}
      {canRecord() ? (
        <Item
          icon="Record"
          label={recording ? 'Stop recording' : 'Record clip'}
          on={recording}
          onClick={act(() => s.getState().setRecording(!recording), { keep: true })}
        />
      ) : null}
      {fImportSh3d ? (
        <Item
          icon="FloorPlan"
          label="Import Sweet Home 3D…"
          sub="Load walls & rooms from a .sh3d file"
          docs="importSh3d"
          onClick={act(() => openSh3dImport())}
        />
      ) : null}
      <Item
        icon="Reset"
        label="Reset to default"
        onClick={act(async () => {
          const ok = await s.getState().confirmAction({
            title: 'Reset to default',
            message: 'Reset to the floor-plan default? You can undo this with Ctrl/⌘+Z.',
            confirmLabel: 'Reset',
          })
          if (ok) s.getState().resetToDefault()
        })}
      />
      <Item
        icon="Reset"
        label="Clear all furniture"
        onClick={act(async () => {
          const ok = await s.getState().confirmAction({
            title: 'Clear all furniture',
            message: 'Remove every placed item? You can undo this with Ctrl/⌘+Z.',
            confirmLabel: 'Clear all',
            danger: true,
          })
          if (ok) s.getState().resetToEmpty()
        })}
      />
      <div className="m-sub-h">Saved layouts</div>
      {slots.length === 0 ? (
        <div className="m-empty">No saved layouts.</div>
      ) : (
        slots
          .slice()
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
          .map((slot) => (
            <div className="m-slot" key={slot.slot}>
              <button
                type="button"
                className="m-slot-load"
                onClick={act(() => void loadLayout(slot.slot))}
              >
                <Icon.Load className="icn" width={18} height={18} />
                <span className="m-item-tx">
                  <span className="m-item-l">{slot.slot}</span>
                  <span className="m-item-s">{new Date(slot.savedAt).toLocaleString()}</span>
                </span>
              </button>
              <button
                type="button"
                className="m-slot-del"
                aria-label={`Delete ${slot.slot}`}
                onClick={() => void deleteLayout(slot.slot)}
              >
                <Icon.Trash width={15} height={15} />
              </button>
            </div>
          ))
      )}
    </Section>
  )
}
