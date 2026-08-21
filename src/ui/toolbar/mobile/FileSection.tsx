import { useFeature } from '../../../features/useFeature'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { canRecord } from '../../../scene/RecordController'
import { EXPORT_EVENT } from '../../../scene/ScreenshotController'
import { applySerialized, serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import type { SlotMeta } from '../../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, saveThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { resolveToolLabel, toolAction } from '../../actions/toolActions'
import { downloadBoqXlsx } from '../../downloadBoqXlsx'
import { EmptyState } from '../../EmptyState'
import { openBoq } from '../../openBoq'
import { downloadCostBreakdownCsv } from '../../openCostBreakdownCsv'
import { downloadFfeCsv } from '../../openFfeCsv'
import { downloadFurnitureCsv } from '../../openFurnitureCsv'
import { downloadPlanSvg } from '../../openPlanSvg'
import { downloadRenoIcs } from '../../openRenoIcs'
import { openDesignReport } from '../../openReport'
import { downloadRoomScheduleCsv } from '../../openRoomScheduleCsv'
import { exportScene3d } from '../../openSceneExport'
import { openSh3dImport } from '../../openSh3dImport'
import { openSh3fImport } from '../../openSh3fImport'
import { openShoppingList } from '../../openShoplist'
import { openTradePack } from '../../openTradePack'
import { TRADE_PACKS } from '../../tradePacks'
import { exportGroupLabel } from '../exportGroupLabel'
import { Icon } from '../icons'
import { SAVED_EMPTY } from '../savedEmptyStates'
import { Item, Section, SubHeader } from './parts'

/** File — every OUTPUT lives here (TB-5, mirrors the desktop FileMenu): save /
 *  capture, share & document (rows that used to sit in the Tools section's
 *  "Export & document" group), the "Budget & costs" cluster (budget panel +
 *  all its cost exports under one entry), CAD/3D/CSV data exports, import /
 *  reset, and the saved-layout list. */
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
  const budgetOpen = useStore((st) => st.budgetOpen)
  const renoBudgetOpen = useStore((st) => st.renoBudgetOpen)

  const fPanorama = useFeature('panorama')
  const fPanoTour = useFeature('panoTour')
  const fHqRender = useFeature('hqRender')
  const fRenderCompare = useFeature('renderCompare')
  const fStagingReveal = useFeature('stagingReveal')
  const fTimeCompare = useFeature('timeCompare')
  const fShare = useFeature('shareExport')
  const fReport = useFeature('report')
  const fTradePacks = useFeature('tradePacks')
  const fBudget = useFeature('budget')
  const fRenoBudget = useFeature('renoBudget')
  const fShopExport = useFeature('shopExport')
  const fBoq = useFeature('boq')
  const fQuoteTemplate = useFeature('quoteTemplate')
  const fDxf = useFeature('dxfExport')
  const fSceneExport = useFeature('sceneExport3d')
  const fImportSh3d = useFeature('importSh3d')
  const fImportSh3f = useFeature('importSh3f')

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
    // Irreversible: gate on the confirm modal (P35 destructive-confirmation
    // policy; see src/ui/CLAUDE.md).
    const ok = await s.getState().confirmAction({
      title: 'Delete this layout?',
      message: `“${slot}” will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete layout',
      danger: true,
    })
    if (!ok) return
    await storage.delete(slot)
    deleteThumb(slot)
    refreshSlots()
  }

  // Budget renders from the shared tool-action registry (same behaviour +
  // active state as ⌘K / the desktop File menu's "Budget & costs" row, TB-5).
  const budget = toolAction('budget')
  const renoBudget = toolAction('renoBudget')

  return (
    <Section id="file" title="File" icon="Save" activeId={activeId}>
      <SubHeader>Save &amp; capture</SubHeader>
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
      {canRecord() ? (
        <Item
          icon="Record"
          label={recording ? 'Stop recording' : 'Record clip'}
          on={recording}
          onClick={act(() => s.getState().setRecording(!recording), { keep: true })}
        />
      ) : null}

      {fShare || fReport ? <SubHeader>Share &amp; document</SubHeader> : null}
      {fShare ? (
        <Item
          icon="Share"
          label="Share & export"
          docs="shareExport"
          onClick={act(() => s.getState().setShareOpen(true))}
        />
      ) : null}
      {fReport ? (
        <Item
          icon="Report"
          label="Report"
          sub="Printable design report"
          docs="report"
          onClick={act(() => openDesignReport())}
        />
      ) : null}
      {fReport ? (
        <Item
          icon="Export"
          label="Reno timeline (.ics)"
          sub="Renovation phases as calendar events"
          onClick={act(() => void downloadRenoIcs())}
        />
      ) : null}
      {fTradePacks ? <SubHeader>Trade packs</SubHeader> : null}
      {fTradePacks
        ? TRADE_PACKS.map((p) => (
            <Item
              key={p.id}
              icon="FloorPlan"
              label={p.recipient}
              sub={p.scope}
              onClick={act(() => void openTradePack(p.id))}
            />
          ))
        : null}

      {fBudget || fRenoBudget || fShopExport || fBoq ? (
        <SubHeader>Budget &amp; costs</SubHeader>
      ) : null}
      {fBudget ? (
        <Item
          icon={budget.icon}
          label={resolveToolLabel(budget, s.getState())}
          sub={budget.sub}
          on={budgetOpen}
          docs={budget.docs}
          onClick={act(() => budget.run(s))}
        />
      ) : null}
      {fRenoBudget ? (
        <Item
          icon={renoBudget.icon}
          label={resolveToolLabel(renoBudget, s.getState())}
          sub={renoBudget.sub}
          on={renoBudgetOpen}
          docs={renoBudget.docs}
          onClick={act(() => renoBudget.run(s))}
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
      {fBoq ? (
        <>
          <Item
            icon="Budget"
            label="Quote (BOQ)"
            sub="Bill of quantities — FF&E, finishes, carpentry"
            onClick={act(() => openBoq())}
          />
          <Item
            icon="Export"
            label="Quote → Excel (.xlsx)"
            sub="Download the bill of quantities as a spreadsheet"
            onClick={act(() => void downloadBoqXlsx())}
          />
          {fQuoteTemplate ? (
            <Item
              icon="Budget"
              label="Quote template"
              sub="Company branding, notes, GST & markup"
              onClick={act(() => s.getState().setQuoteTemplateOpen(true))}
            />
          ) : null}
        </>
      ) : null}
      {fShopExport ? (
        <Item
          icon="Export"
          label="Cost breakdown (CSV)"
          sub="Furniture + finishes + renovation, with a grand total"
          onClick={act(() => void downloadCostBreakdownCsv())}
        />
      ) : null}

      {fDxf || fSceneExport || fShopExport ? (
        <SubHeader>
          {exportGroupLabel({ cad: fDxf, threeD: fSceneExport, data: fShopExport })}
        </SubHeader>
      ) : null}
      {fDxf ? (
        <Item
          icon="Export"
          label="Export SVG (plan)"
          sub="Vector 2D plan for any editor / print"
          onClick={act(() => void downloadPlanSvg())}
        />
      ) : null}
      {fSceneExport ? (
        <>
          <Item
            icon="Export"
            label="Export 3D model (.glb)"
            sub="Whole furnished scene for Blender / AR / Coohom"
            onClick={act(() => void exportScene3d('glb'))}
          />
          {/* Desktop parity (UIUX-73) — and the format that most needs to be
              HERE: iOS AR Quick Look only opens a .usdz on a phone/tablet, yet
              the row existed on desktop only. The geometry-only CAD formats
              (.obj/.stl, `sceneExportCad`) stay desktop-only on purpose: no
              phone use case for a Wavefront OBJ. */}
          <Item
            icon="Export"
            label="Export for AR (.usdz)"
            sub="View in your room — iOS AR Quick Look"
            onClick={act(() => void exportScene3d('usdz'))}
          />
        </>
      ) : null}
      {fShopExport ? (
        <>
          <Item
            icon="Export"
            label="Furniture list (CSV)"
            sub="Spreadsheet of every item — dims, qty, prices"
            onClick={act(() => void downloadFurnitureCsv())}
          />
          <Item
            icon="Export"
            label="Room schedule (CSV)"
            sub="Per-room area, perimeter, finishes & ceiling"
            onClick={act(() => void downloadRoomScheduleCsv())}
          />
          <Item
            icon="Export"
            label="FF&E schedule (CSV)"
            sub="Item-by-item schedule — source, SKU, size, qty, price"
            onClick={act(() => void downloadFfeCsv())}
          />
        </>
      ) : null}

      <SubHeader>Load &amp; reset</SubHeader>
      {fImportSh3d ? (
        <Item
          icon="FloorPlan"
          label="Import Sweet Home 3D…"
          sub="Load walls & rooms from a .sh3d file"
          docs="importSh3d"
          onClick={act(() => openSh3dImport())}
        />
      ) : null}
      {fImportSh3f ? (
        <Item
          icon="Upload"
          label="Import SH3D library…"
          sub="Load furniture from a .sh3f library file"
          docs="importSh3f"
          onClick={act(() => openSh3fImport())}
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
        <EmptyState {...SAVED_EMPTY.layouts} />
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
