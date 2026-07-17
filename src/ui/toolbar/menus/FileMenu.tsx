import { useEffect, useState } from 'react'
import { useFeature } from '../../../features/useFeature'
import { BUILTIN_CATALOG } from '../../../furniture/builtinCatalog'
import { runUpdateCheck } from '../../../pwa/swUpdate'
import { canRecord } from '../../../scene/RecordController'
import { EXPORT_EVENT } from '../../../scene/ScreenshotController'
import { applySerialized, serialize } from '../../../state/schema'
import { storage } from '../../../state/storage/adapter'
import type { SlotMeta } from '../../../state/storage/StorageAdapter'
import { captureThumb, deleteThumb, getThumb, saveThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { resolveToolLabel, toolAction } from '../../actions/toolActions'
import { downloadBoqXlsx } from '../../downloadBoqXlsx'
import { DRAWING_LAYERS } from '../../drawingLayers'
import { openBoq } from '../../openBoq'
import { downloadCostBreakdownCsv } from '../../openCostBreakdownCsv'
import { openDrawingSet } from '../../openDrawingSet'
import { downloadPlanDxf } from '../../openDxf'
import { downloadFfeCsv } from '../../openFfeCsv'
import { downloadFurnitureCsv } from '../../openFurnitureCsv'
import { openMoodboard } from '../../openMoodboard'
import { downloadPlanSvg } from '../../openPlanSvg'
import { downloadRenoIcs } from '../../openRenoIcs'
import { openDesignReport } from '../../openReport'
import { downloadRoomScheduleCsv } from '../../openRoomScheduleCsv'
import { exportScene3d } from '../../openSceneExport'
import { openSh3dImport } from '../../openSh3dImport'
import { openSh3fImport } from '../../openSh3fImport'
import { openShoppingList } from '../../openShoplist'
import { viewInAr } from '../../viewInAr'
import { shortcutLabel } from '../shortcuts'
import { MenuItem, MenuLabel, ToolbarMenu } from '../ToolbarMenu'

/** File cluster — every OUTPUT lives here (TB-5, File-owns-output IA): save /
 *  load, capture (PNG / panorama / renders / clip), share & document (report,
 *  moodboard, drawing set), the "Budget & costs" group (the budget panel plus
 *  all its cost exports, previously scattered across four menu spots), and the
 *  CAD / 3D / CSV data exports that used to sit in Tools → "Export & document". */
export function FileMenu() {
  const recording = useStore((s) => s.recording)
  const setRecording = useStore((s) => s.setRecording)
  const proMode = useStore((s) => s.uiMode === 'pro')
  const budgetOpen = useStore((s) => s.budgetOpen)
  const setShareOpen = useStore((s) => s.setShareOpen)
  const fPanorama = useFeature('panorama')
  const fPanoTour = useFeature('panoTour')
  const fHqRender = useFeature('hqRender')
  const fRenderCompare = useFeature('renderCompare')
  const fStagingReveal = useFeature('stagingReveal')
  const fTimeCompare = useFeature('timeCompare')
  const resetToDefault = useStore((s) => s.resetToDefault)
  const resetToEmpty = useStore((s) => s.resetToEmpty)
  const fShare = useFeature('shareExport')
  const fMoodboard = useFeature('moodboard')
  const fReport = useFeature('report')
  const fBudget = useFeature('budget')
  const fShopExport = useFeature('shopExport')
  const fBoq = useFeature('boq')
  const fQuoteTemplate = useFeature('quoteTemplate')
  const fDxf = useFeature('dxfExport')
  const fSceneExport = useFeature('sceneExport3d')
  const fViewInAr = useFeature('viewInAr')
  const fImportSh3d = useFeature('importSh3d')
  const fImportSh3f = useFeature('importSh3f')
  const [slots, setSlots] = useState<SlotMeta[]>([])

  // Refresh the slot list whenever the menu mounts a panel render.
  useEffect(() => {
    void storage.list().then(setSlots)
  }, [])
  const refresh = () => void storage.list().then(setSlots)

  const save = async () => {
    const name = await useStore.getState().promptText({
      title: 'Save layout',
      label: 'Name this layout',
      placeholder: 'e.g. Living room v2',
      submitLabel: 'Save',
    })
    if (!name) return
    const slot = name.trim().replace(/\s+/g, '-').toLowerCase()
    if (!slot) return
    try {
      await storage.save(slot, serialize(useStore.getState()))
      saveThumb(slot, captureThumb())
      refresh()
      useStore.getState().notify.start({ title: `Saved layout “${slot}”`, kind: 'success' })
    } catch (e) {
      useStore.getState().notify.start({
        title: `Could not save: ${(e as Error).message}`,
        kind: 'error',
      })
    }
  }

  const load = async (slot: string) => {
    const data = await storage.load(slot).catch(() => null)
    if (!data) {
      useStore.getState().notify.start({ title: `Could not load slot ${slot}`, kind: 'error' })
      return
    }
    const userIds = useStore.getState().userFurniture.map((d) => d.id)
    const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
    useStore.setState(applySerialized(data, known))
    // Loading replaces the world; clear undo history so Ctrl+Z can't cross into
    // the previous design (consistent with import / version restore).
    useStore.getState().clearHistory?.()
    // Frame the loaded design (plan-aware, so a custom plan lands centred).
    useStore.getState().requestHomeView()
    useStore.getState().notify.start({ title: `Loaded “${slot}”`, kind: 'success' })
  }

  // The Budget panel row renders from the shared tool-action registry so its
  // behaviour (close sibling aux panels → toggle) and ⌘K/kbd stay in lockstep
  // (TB-5: it anchors the "Budget & costs" group here instead of Tools).
  const budget = toolAction('budget')

  return (
    <ToolbarMenu icon="Save" label="File" active={recording || budgetOpen} width={256}>
      <MenuLabel>Save & capture</MenuLabel>
      <MenuItem icon="Save" label="Save…" sub="Store the current layout" onClick={save} />
      <MenuItem
        icon="Export"
        label="Export PNG"
        sub="Save the current view as an image"
        onClick={() => window.dispatchEvent(new Event(EXPORT_EVENT))}
      />
      {fPanorama ? (
        <MenuItem
          icon="Export"
          label="360° panorama"
          sub="Capture a look-around panorama"
          docs="panorama"
          onClick={() => useStore.getState().setPanoramaOpen(true)}
        />
      ) : null}
      {fPanoTour ? (
        <MenuItem
          icon="Walkthrough"
          label="360° tour"
          sub="Linked panoramas — jump room to room"
          docs="panoTour"
          onClick={() => useStore.getState().setPanoTourOpen(true)}
        />
      ) : null}
      {fHqRender ? (
        <MenuItem
          icon="Export"
          label="HQ render"
          sub="Path-traced photoreal still"
          onClick={() => useStore.getState().setHqRenderOpen(true)}
        />
      ) : null}
      {fRenderCompare ? (
        <MenuItem
          icon="Export"
          label="Render compare"
          sub="A/B compare two render presets"
          docs="renderCompare"
          onClick={() => useStore.getState().setRenderCompareOpen(true)}
        />
      ) : null}
      {fStagingReveal ? (
        <MenuItem
          icon="Export"
          label="Before / after"
          sub="Reveal slider: empty room vs furnished"
          onClick={() => useStore.getState().setStagingRevealOpen(true)}
        />
      ) : null}
      {fTimeCompare ? (
        <MenuItem
          icon="Time"
          label="Time-of-day compare"
          sub="Reveal slider: your design at two times of day"
          docs="timeCompare"
          onClick={() => useStore.getState().setTimeCompareOpen(true)}
        />
      ) : null}
      {canRecord() && proMode ? (
        <MenuItem
          icon="Record"
          label={recording ? 'Stop recording' : 'Record clip'}
          sub="Capture a video of the view (MP4 or WebM)"
          active={recording}
          onClick={() => setRecording(!recording)}
        />
      ) : null}

      {(fShare || fMoodboard || fReport) && <MenuLabel>Share & document</MenuLabel>}
      {fShare ? (
        <MenuItem
          icon="Share"
          label="Share & export"
          sub="Link, PNG snapshot, shoppable PDF"
          docs="shareExport"
          onClick={() => setShareOpen(true)}
        />
      ) : null}
      {fMoodboard ? (
        <MenuItem
          icon="Palette"
          label="Moodboard"
          sub="Style board: palette + finishes + pieces"
          onClick={() => openMoodboard()}
        />
      ) : null}
      {fReport ? (
        <MenuItem
          icon="Report"
          label="Report"
          sub="Printable design report"
          docs="report"
          onClick={() => openDesignReport()}
        />
      ) : null}
      {fReport ? (
        <>
          <MenuItem
            icon="FloorPlan"
            label="Drawing set"
            sub="Paginated plan + elevations + schedules (PDF)"
            onClick={() => openDrawingSet()}
          />
          <DrawingLayersPicker />
        </>
      ) : null}
      {fReport ? (
        <MenuItem
          icon="Export"
          label="Reno timeline (.ics)"
          sub="Renovation phases as calendar events"
          onClick={() => void downloadRenoIcs()}
        />
      ) : null}

      {(fBudget || fShopExport || fBoq) && <MenuLabel>Budget & costs</MenuLabel>}
      {fBudget ? (
        <MenuItem
          icon={budget.icon}
          label={resolveToolLabel(budget, useStore.getState())}
          sub={budget.sub}
          docs={budget.docs}
          kbd={budget.kbd ? shortcutLabel(budget.kbd) : undefined}
          active={budget.isActive(useStore.getState())}
          onClick={() => budget.run(useStore)}
        />
      ) : null}
      {fShopExport ? (
        <MenuItem
          icon="Budget"
          label="Shopping list"
          sub="Buy-list with prices, grouped by retailer"
          docs="shopExport"
          onClick={() => openShoppingList()}
        />
      ) : null}
      {fBoq ? (
        <>
          <MenuItem
            icon="Budget"
            label="Quote (BOQ)"
            sub="Bill of quantities — FF&E, finishes, carpentry"
            onClick={() => openBoq()}
          />
          <MenuItem
            icon="Export"
            label="Quote → Excel (.xlsx)"
            sub="Download the bill of quantities as a spreadsheet"
            onClick={() => void downloadBoqXlsx()}
          />
          {fQuoteTemplate && (
            <MenuItem
              icon="Budget"
              label="Quote template"
              sub="Company branding, notes, GST & markup"
              onClick={() => useStore.getState().setQuoteTemplateOpen(true)}
            />
          )}
        </>
      ) : null}
      {fShopExport ? (
        <MenuItem
          icon="Export"
          label="Cost breakdown (CSV)"
          sub="Furniture + finishes + renovation, with a grand total"
          onClick={() => void downloadCostBreakdownCsv()}
        />
      ) : null}

      {(fDxf || fSceneExport || fViewInAr || fShopExport) && <MenuLabel>CAD, 3D & data</MenuLabel>}
      {fDxf ? (
        <>
          <MenuItem
            icon="Export"
            label="Export DXF (CAD)"
            sub="2D plan for AutoCAD / contractor handoff"
            onClick={() => downloadPlanDxf()}
          />
          <MenuItem
            icon="Export"
            label="Export SVG (plan)"
            sub="Vector 2D plan for any editor / print"
            onClick={() => void downloadPlanSvg()}
          />
        </>
      ) : null}
      {fSceneExport ? (
        <>
          <MenuItem
            icon="Export"
            label="Export 3D model (.glb)"
            sub="Whole furnished scene for Blender / AR / Coohom"
            onClick={() => void exportScene3d('glb')}
          />
          <MenuItem
            icon="Export"
            label="Export 3D model (.obj)"
            sub="Geometry-only Wavefront OBJ"
            onClick={() => void exportScene3d('obj')}
          />
          <MenuItem
            icon="Export"
            label="Export 3D model (.stl)"
            sub="Geometry-only STL for 3D printing / CAD"
            onClick={() => void exportScene3d('stl')}
          />
          <MenuItem
            icon="Export"
            label="Export for AR (.usdz)"
            sub="View in your room — iOS AR Quick Look"
            onClick={() => void exportScene3d('usdz')}
          />
        </>
      ) : null}
      {fViewInAr ? (
        <MenuItem
          icon="Walkthrough"
          label="View in your room (AR)"
          sub="Place the design in your room — iOS AR, or an AR-ready GLB"
          onClick={() => void viewInAr()}
        />
      ) : null}
      {fShopExport ? (
        <>
          <MenuItem
            icon="Export"
            label="Furniture list (CSV)"
            sub="Spreadsheet of every item — dims, qty, prices"
            onClick={() => void downloadFurnitureCsv()}
          />
          <MenuItem
            icon="Export"
            label="Room schedule (CSV)"
            sub="Per-room area, perimeter, finishes & ceiling"
            onClick={() => void downloadRoomScheduleCsv()}
          />
          <MenuItem
            icon="Export"
            label="FF&E schedule (CSV)"
            sub="Item-by-item schedule — source, SKU, size, qty, price"
            onClick={() => void downloadFfeCsv()}
          />
        </>
      ) : null}

      <MenuLabel>Load & reset</MenuLabel>
      {fImportSh3d ? (
        <MenuItem
          icon="FloorPlan"
          label="Import Sweet Home 3D…"
          sub="Load walls & rooms from a .sh3d file"
          docs="importSh3d"
          onClick={() => openSh3dImport()}
        />
      ) : null}
      {fImportSh3f ? (
        <MenuItem
          icon="Upload"
          label="Import SH3D library…"
          sub="Load furniture from a .sh3f library file"
          docs="importSh3f"
          onClick={() => openSh3fImport()}
        />
      ) : null}
      <MenuItem
        icon="Reset"
        label="Default"
        sub="Reset to the floor-plan default"
        onClick={async () => {
          const ok = await useStore.getState().confirmAction({
            title: 'Reset to default',
            message: 'Reset to the floor-plan default? You can undo this with Ctrl/⌘+Z.',
            confirmLabel: 'Reset',
          })
          if (ok) resetToDefault()
        }}
      />
      <MenuItem
        icon="Reset"
        label="Empty"
        sub="Clear all furniture"
        onClick={async () => {
          const ok = await useStore.getState().confirmAction({
            title: 'Clear all furniture',
            message: 'Remove every placed item? You can undo this with Ctrl/⌘+Z.',
            confirmLabel: 'Clear all',
            danger: true,
          })
          if (ok) resetToEmpty()
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
                  type="button"
                  onClick={async () => {
                    await storage.delete(s.slot)
                    deleteThumb(s.slot)
                    refresh()
                  }}
                  className="rounded px-1 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  aria-label={`Delete layout "${s.slot}"`}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}

      <MenuLabel>App</MenuLabel>
      <MenuItem
        icon="Download"
        label="Check for updates"
        sub="Fetch the latest version (auto-reloads if found)"
        onClick={() => void runUpdateCheck()}
      />
    </ToolbarMenu>
  )
}

/** Compact checklist of which drawing-set sheet groups to include in the export
 *  (the floor plan is always included). Lives under the "Drawing set" entry;
 *  clicks don't close the menu so several layers can be toggled in one go.
 *  (Moved here with the Drawing set row from ToolsMenu, TB-5.) */
function DrawingLayersPicker() {
  const layers = useStore((s) => s.drawingLayers)
  const setDrawingLayer = useStore((s) => s.setDrawingLayer)
  return (
    <div
      className="px-3 py-1"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="label" style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
        Include sheets
      </span>
      {DRAWING_LAYERS.map((l) => (
        <label
          key={l.key}
          className="flex items-center gap-2"
          style={{ fontSize: 'var(--t-xs)', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={layers[l.key] !== false}
            aria-label={l.label}
            onChange={(e) => setDrawingLayer(l.key, e.target.checked)}
          />
          <span>{l.label}</span>
        </label>
      ))}
    </div>
  )
}
