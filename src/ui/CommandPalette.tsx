import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { requestAutoLayout } from '../ai/autoLayoutAi'
import {
  AiPlanError,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  setVisionKey,
} from '../ai/floorPlanAi'
import type { FeatureFlag } from '../features/featureFlags'
import { allPlanRooms } from '../floorplan/levels'
import { useCatalog, useCatalogByCategory } from '../furniture/catalog'
import { aiLayoutToItems, placeNonOverlapping } from '../layout/aiLayoutApply'
import {
  arrangeSelectionAsRun,
  faceSelectionIntoRoom,
  mirrorSelectionX,
  snapSelectionToWall,
} from '../layout/selectionActions'
import { tidyHome } from '../layout/tidyHome'
import { BACKDROPS } from '../scene/SceneBackdrop'
import { canEditScene } from '../state/editing'
import { firstEditableRoomId } from '../state/rooms'
import { useStore } from '../state/store'
import { toolActionsForSurface } from './actions/toolActions'
import { closeAllAuxPanels } from './auxPanels'
import { type DocKey, FEATURE_DOCS, openDocs, openToolDocs } from './docsUrl'
import { downloadCostBreakdownCsv } from './openCostBreakdownCsv'
import { downloadFfeCsv } from './openFfeCsv'
import { downloadFurnitureCsv } from './openFurnitureCsv'
import { downloadPlanSvg } from './openPlanSvg'
import { downloadRenoIcs } from './openRenoIcs'
import { openDesignReport } from './openReport'
import { downloadRoomScheduleCsv } from './openRoomScheduleCsv'
import { exportScene3d } from './openSceneExport'
import { openSh3dImport } from './openSh3dImport'
import { openShoppingList } from './openShoplist'
import { pickPaletteFromPhoto } from './paletteFromPhoto'
import { Icon, type IconName } from './toolbar/icons'

/** ⌘K command id → the feature flag that gates it (so a disabled feature can't
 *  be launched from the palette either). Unmapped commands are always shown. */
const COMMAND_FLAGS: Record<string, FeatureFlag> = {
  measure: 'measure',
  'smart-start': 'smartStart',
  share: 'shareExport',
  report: 'report',
  'reno-ics': 'report',
  floorplan: 'floorPlanEditor',
  'palette-from-photo': 'paletteFromPhoto',
  panorama: 'panorama',
  'pano-tour': 'panoTour',
  'pano-tour-add': 'panoTour',
  'hq-render': 'hqRender',
  'render-compare': 'renderCompare',
  'staging-reveal': 'stagingReveal',
  'style-transfer': 'styleTransfer',
  'style-quiz': 'styleQuiz',
  shortcuts: 'shortcutsHelp',
  'shopping-list': 'shopExport',
  'furniture-csv': 'shopExport',
  'room-schedule-csv': 'shopExport',
  'ffe-csv': 'shopExport',
  'cost-breakdown-csv': 'shopExport',
  'plan-svg': 'dxfExport',
  'export-3d': 'sceneExport3d',
  'import-sh3d': 'importSh3d',
  parametric: 'parametricFurniture',
  'configure-product': 'productConfigurator',
  'stamp-mode': 'stampPlace',
  'replace-similar': 'replaceSimilar',
  'ai-furnish': 'aiLayout',
  'drawing-callouts': 'drawingCallouts',
  'quote-template': 'quoteTemplate',
  'sel-group': 'furnitureGroups',
  'sel-ungroup': 'furnitureGroups',
  // Inset / grow the selected plan room (PARITY-ROOM-INSET).
  'inset-room': 'roomInset',
  'grow-room': 'roomInset',
  // The sun-driven sky backdrop command is gated by its feature flag (RD-412).
  'backdrop:sky': 'proceduralSky',
}

/** ⌘K command ids that are Pro-only (hidden in Simple mode). */
const PRO_ONLY_COMMANDS = new Set<string>(['glb-designer'])

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: IconName
  /** Gating flag (registry-sourced commands carry their own; others use COMMAND_FLAGS). */
  flag?: FeatureFlag
  /** Docs deep-link key (registry-sourced commands carry their own). */
  docKey?: DocKey
  run: () => void
}

/** Command palette (⌘K): fuzzy search across actions, panels, views, and the
 *  full catalog ("add furniture" arms placement). Fully keyboard-navigable.
 *  Mirrors the design's `.cmdk` overlay. */
export function CommandPalette() {
  const open = useStore((s) => s.cmdkOpen)
  const setOpen = useStore((s) => s.setCmdkOpen)
  const byCategory = useCatalogByCategory()
  const catalog = useCatalog()
  // Selection-aware layout commands appear only when a multi-selection is live.
  const selCount = useStore((s) => s.selectedItemIds.length)
  // The single selected item id (null when 0 or 2+ selected) gates the
  // single-item "replace with similar" command.
  const selOneId = useStore((s) => (s.selectedItemIds.length === 1 ? s.selectedItemId : null))
  // The active group id (when the selection resolves to one group) gates Ungroup.
  const activeGroupId = useStore((s) => s.activeGroupId)
  // The selected plan room (id) gates the inset / grow room commands.
  const selRoomId = useStore((s) => (s.planSelection?.type === 'room' ? s.planSelection.id : null))
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const s = useStore.getState
    const close = () => useStore.getState().setCmdkOpen(false)
    const base: Command[] = [
      {
        id: 'catalog',
        group: 'Actions',
        label: 'Toggle catalog',
        hint: 'C',
        icon: 'Catalog',
        run: () => {
          s().setLeftMode('catalog')
          s().setCatalogOpen(true)
        },
      },
      {
        id: 'layers',
        group: 'Actions',
        label: 'Objects / Layers',
        hint: 'Y',
        icon: 'Layers',
        run: () => {
          s().setLeftMode('layers')
          s().setCatalogOpen(true)
        },
      },
      {
        id: 'measure',
        group: 'Actions',
        label: 'Toggle measurements',
        hint: 'M',
        icon: 'Measure',
        run: () => s().toggleMeasurements(),
      },
      {
        id: 'smart-start',
        group: 'Actions',
        label: 'Smart Start — furnish my flat',
        icon: 'Presets',
        run: () => s().setSmartStartOpen(true),
      },
      {
        id: 'glb-designer',
        group: 'Actions',
        label: 'Design a 3D asset (edit / create)',
        icon: 'Cube',
        run: () => s().setGlbDesignerOpen(true),
      },
      {
        id: 'parametric',
        group: 'Actions',
        label: 'Custom-size furniture (shelf / wardrobe / sideboard)',
        icon: 'Cube',
        run: () => s().setParametricOpen(true),
      },
      {
        id: 'configure-product',
        group: 'Actions',
        label: 'Configure a product (mattress-on-frame / modular sofa)',
        icon: 'Cube',
        run: () => s().setConfiguratorOpen(true),
      },
      {
        // Sticky stamp placement (PARITY-STAMP-PLACE): keep the currently-armed
        // catalog item (or the selected item's def) armed for repeated clicks.
        id: 'stamp-mode',
        group: 'Actions',
        label: 'Stamp — place an item repeatedly',
        icon: 'Copy',
        run: () => {
          const st = useStore.getState()
          // Arm the def that's already in hand, else the selected item's def.
          const defId =
            st.activeDefId ??
            (st.selectedItemId
              ? (st.items.find((it) => it.id === st.selectedItemId)?.defId ?? null)
              : null)
          if (!defId) {
            // Nothing to stamp — open the catalog so the user can pick an item.
            st.setLeftMode('catalog')
            st.setCatalogOpen(true)
            return
          }
          if (!canEditScene(st)) {
            const id = firstEditableRoomId(st.floorPlan)
            if (id) st.enterRoomEditor(id)
          }
          // Arm the def, then turn on sticky stamp (setActiveDefId clears it).
          useStore.getState().setActiveDefId(defId)
          useStore.getState().setStampMode(true)
        },
      },
      {
        id: 'tidy',
        group: 'Actions',
        label: 'Tidy home',
        hint: 'L',
        icon: 'Tidy',
        run: () => tidyHome(),
      },
      // Analytical panel commands come from the shared tool-action registry
      // (single source of truth with the desktop Tools menu + mobile sheet). Each
      // carries its own gating flag + docs key.
      ...toolActionsForSurface('palette').map(
        (a): Command => ({
          id: a.id,
          group: 'Tools & panels',
          label: a.paletteLabel ?? (typeof a.label === 'string' ? a.label : a.id),
          icon: a.icon,
          flag: a.flag,
          docKey: a.docs,
          run: () => a.run(useStore),
        }),
      ),
      {
        id: 'drawing-callouts',
        group: 'Tools & panels',
        label: 'Sheet callouts — drawing-set annotations',
        icon: 'Pin',
        run: () => {
          closeAllAuxPanels(s())
          s().setDrawingCalloutsOpen(true)
        },
      },
      {
        id: 'share',
        group: 'Tools & panels',
        label: 'Share & export',
        icon: 'Share',
        run: () => s().setShareOpen(true),
      },
      {
        id: 'panorama',
        group: 'Tools & panels',
        label: '360° panorama',
        icon: 'Export',
        run: () => s().setPanoramaOpen(true),
      },
      {
        id: 'pano-tour',
        group: 'Tools & panels',
        label: '360° tour — linked panoramas',
        icon: 'Walkthrough',
        run: () => s().setPanoTourOpen(true),
      },
      {
        id: 'pano-tour-add',
        group: 'Tools & panels',
        label: 'Add 360° tour stop here',
        icon: 'Plus',
        run: () => {
          const id = s().addPanoTourStopHere()
          // Re-read: the add mutated the store after the snapshot above.
          const label = s().panoTourStops.find((t) => t.id === id)?.label
          s().notify.start(
            id
              ? { title: `Added tour stop “${label}”`, kind: 'success' }
              : { title: 'Tour is full — remove a stop first', kind: 'error' },
          )
        },
      },
      {
        id: 'hq-render',
        group: 'Tools & panels',
        label: 'HQ render (path-traced)',
        icon: 'Export',
        run: () => s().setHqRenderOpen(true),
      },
      {
        id: 'render-compare',
        group: 'Tools & panels',
        label: 'Render compare — A/B preset comparison',
        icon: 'Export',
        run: () => s().setRenderCompareOpen(true),
      },
      {
        id: 'staging-reveal',
        group: 'Tools & panels',
        label: 'Before / after reveal — empty vs furnished',
        icon: 'Export',
        run: () => s().setStagingRevealOpen(true),
      },
      {
        id: 'style-transfer',
        group: 'Tools & panels',
        label: 'Style transfer — restyle every room',
        icon: 'Palette',
        run: () => s().setStyleTransferOpen(true),
      },
      {
        id: 'style-quiz',
        group: 'Tools & panels',
        label: 'Style quiz — find your interior style',
        icon: 'Palette',
        run: () => s().setStyleQuizOpen(true),
      },
      {
        id: 'ai-furnish',
        group: 'Tools & panels',
        label: 'AI auto-furnish (BYO key)',
        hint: 'LLM',
        icon: 'Style',
        run: () => {
          void (async () => {
            const st = s()
            const brief = await st.promptText({
              title: 'AI auto-furnish',
              label: 'Describe the home (style, who lives here)…',
              submitLabel: 'Furnish',
            })
            if (brief == null) return
            // Prompt for + persist the BYO vision-model key inline when missing
            // (mirrors the AI floor-plan-recognition flow) instead of dead-ending
            // on a "add a key first" error.
            if (!getVisionKey()) {
              const key =
                (await st.promptText({
                  title: 'AI auto-furnish',
                  label: 'Vision-model API key (OpenAI-compatible, kept in this browser)',
                  submitLabel: 'Continue',
                })) || ''
              if (!key) return
              setVisionKey(key)
            }
            // Security gate: refuse a plaintext endpoint and require explicit
            // host confirmation before the bearer key goes to an untrusted server.
            const endpoint = classifyVisionEndpoint(getVisionUrl())
            if (!endpoint.secure) {
              st.notify.start({
                title: 'Insecure AI endpoint',
                message: endpoint.reason,
                kind: 'error',
              })
              return
            }
            if (!endpoint.trusted) {
              const ok = await st.promptText({
                title: 'Send your API key to this server?',
                label: `${endpoint.reason} Type the host name (${endpoint.host}) to confirm.`,
                submitLabel: 'Send',
              })
              if ((ok || '').trim().toLowerCase() !== endpoint.host.toLowerCase()) {
                st.notify.start({ title: 'AI auto-furnish cancelled', kind: 'info' })
                return
              }
            }
            const rooms = allPlanRooms(st.floorPlan).map((r) => ({
              name: r.name,
              w: r.width,
              d: r.depth,
            }))
            const defIds = Object.keys(catalog).slice(0, 120)
            try {
              const placements = await requestAutoLayout(rooms, defIds, brief, {
                validRooms: new Set(rooms.map((r) => r.name)),
              })
              const genId = (p: string) =>
                `${p}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
              const candidates = aiLayoutToItems(placements, st.floorPlan, catalog, genId)
              // Keep only non-overlapping pieces (the model's positions are rough).
              const items = placeNonOverlapping(st.items, candidates, catalog)
              if (items.length === 0) {
                st.notify.start({ title: 'No items could be placed', kind: 'info' })
                return
              }
              st.pushHistory()
              st.setItems([...st.items, ...items])
              const skipped = candidates.length - items.length
              st.notify.start({
                title: `AI placed ${items.length} item${items.length === 1 ? '' : 's'}`,
                kind: 'success',
                message: skipped > 0 ? `${skipped} overlapping piece(s) skipped.` : undefined,
              })
            } catch (e) {
              st.notify.start({
                title: "Couldn't auto-furnish",
                kind: 'error',
                message: e instanceof AiPlanError ? e.message : undefined,
              })
            }
          })()
        },
      },
      {
        id: 'palette-from-photo',
        group: 'Tools & panels',
        label: 'Palette from photo',
        icon: 'Palette',
        run: () => pickPaletteFromPhoto(),
      },
      {
        id: 'report',
        group: 'Tools & panels',
        label: 'Design report (printable)',
        icon: 'Report',
        run: () => openDesignReport(),
      },
      {
        id: 'reno-ics',
        group: 'Tools & panels',
        label: 'Reno timeline (.ics calendar export)',
        icon: 'Export',
        run: () => void downloadRenoIcs(),
      },
      {
        id: 'shopping-list',
        group: 'Tools & panels',
        label: 'Shopping list (buy-list export)',
        icon: 'Budget',
        run: () => openShoppingList(),
      },
      {
        id: 'quote-template',
        group: 'Tools & panels',
        label: 'Quote template — branding, notes & tax',
        icon: 'Budget',
        run: () => s().setQuoteTemplateOpen(true),
      },
      {
        id: 'furniture-csv',
        group: 'Tools & panels',
        label: 'Furniture list (CSV export)',
        icon: 'Export',
        run: () => void downloadFurnitureCsv(),
      },
      {
        id: 'room-schedule-csv',
        group: 'Tools & panels',
        label: 'Room schedule (CSV export)',
        icon: 'Export',
        run: () => void downloadRoomScheduleCsv(),
      },
      {
        id: 'ffe-csv',
        group: 'Tools & panels',
        label: 'FF&E schedule (CSV export)',
        icon: 'Export',
        run: () => void downloadFfeCsv(),
      },
      {
        id: 'cost-breakdown-csv',
        group: 'Tools & panels',
        label: 'Cost breakdown (CSV export)',
        icon: 'Export',
        run: () => void downloadCostBreakdownCsv(),
      },
      {
        id: 'plan-svg',
        group: 'Tools & panels',
        label: 'Export 2D plan to SVG',
        icon: 'Export',
        run: () => void downloadPlanSvg(),
      },
      {
        id: 'export-3d',
        group: 'Tools & panels',
        label: 'Export 3D model (GLB)',
        icon: 'Export',
        run: () => void exportScene3d('glb'),
      },
      {
        id: 'import-sh3d',
        group: 'Tools & panels',
        label: 'Import Sweet Home 3D (.sh3d)',
        icon: 'FloorPlan',
        run: () => openSh3dImport(),
      },
      {
        id: 'floorplan',
        group: 'Tools & panels',
        label: 'Floor plan editor',
        icon: 'FloorPlan',
        run: () => s().setFloorPlanEditing(true),
      },
      {
        id: 'edit-room',
        group: 'Go to',
        label: 'Edit a room (isolate)',
        icon: 'FloorPlan',
        run: () => {
          const st = s()
          // First editable room of the active plan (default apartment or custom).
          const id = firstEditableRoomId(st.floorPlan)
          if (id) st.enterRoomEditor(id)
        },
      },
      {
        id: 'appearance',
        group: 'Tools & panels',
        label: 'Appearance — theme & mode',
        icon: 'Palette',
        run: () => s().setAppearanceOpen(true),
      },
      {
        id: 'tour',
        group: 'Tools & panels',
        label: 'Guided product tour',
        icon: 'Help',
        run: () => s().startTour(),
      },
      {
        id: 'shortcuts',
        group: 'Tools & panels',
        label: 'Keyboard shortcuts',
        hint: '?',
        icon: 'Help',
        run: () => s().setShortcutsHelpOpen(true),
      },
      {
        id: 'docs',
        group: 'Tools & panels',
        label: 'Open the user guide',
        icon: 'Book',
        run: () => openDocs(),
      },
      {
        id: 'top',
        group: 'Go to',
        label: 'Top view',
        hint: 'O',
        icon: 'TopView',
        run: () => s().requestTopView(),
      },
      {
        id: 'reset',
        group: 'Go to',
        label: 'Reset view',
        hint: 'H',
        icon: 'Home',
        run: () => s().requestHomeView(),
      },
      {
        id: 'walk',
        group: 'Go to',
        label: s().cameraMode === 'orbit' ? 'Walk through' : 'Back to orbit',
        hint: 'V',
        icon: s().cameraMode === 'orbit' ? 'Walk' : 'Orbit',
        run: () => s().setCameraMode(s().cameraMode === 'orbit' ? 'firstPerson' : 'orbit'),
      },
      {
        id: 'time',
        group: 'Go to',
        label: 'Cycle time of day',
        hint: 'T',
        icon: 'Time',
        run: () => s().cyclePresetTime(),
      },
      ...(['morning', 'noon', 'dusk', 'night'] as const).map(
        (p): Command => ({
          id: `time:${p}`,
          group: 'Time of day',
          label: `Time — ${p[0].toUpperCase()}${p.slice(1)}`,
          hint: 'Sun',
          icon: 'Sun',
          run: () => s().setPresetTime(p),
        }),
      ),
      // `custom` is excluded — it requires uploading a photo (Scene menu), not a
      // one-tap command.
      ...BACKDROPS.filter((b) => b.id !== 'custom').map(
        (b): Command => ({
          id: `backdrop:${b.id}`,
          group: 'Backdrop',
          label: `Backdrop — ${b.label}`,
          hint: b.sub,
          icon: 'Cube',
          run: () => s().setBackdrop(b.id),
        }),
      ),
    ]
    // Add-furniture commands from the merged catalog.
    const furniture: Command[] = Object.values(byCategory)
      .flat()
      .map((def) => ({
        id: `add:${def.id}`,
        group: 'Add furniture',
        label: def.name,
        hint: 'place',
        icon: 'Catalog' as IconName,
        run: () => {
          const st = useStore.getState()
          // Placement only happens inside the per-room editor now, so if we're
          // in the view-only overview, dive into a room first (then arm).
          if (!canEditScene(st)) {
            const id = firstEditableRoomId(st.floorPlan)
            if (id) st.enterRoomEditor(id)
          }
          useStore.getState().setCatalogOpen(false)
          useStore.getState().setActiveDefId(def.id)
        },
      }))
    // Selection-aware layout commands (only when 2+ pieces are selected — these
    // share their logic with the inspector's multi-select panel).
    const layout: Command[] =
      selCount >= 2
        ? [
            {
              id: 'sel-snap-wall',
              group: 'Selection',
              label: 'Snap selection to wall',
              icon: 'Snap',
              run: () => snapSelectionToWall(catalog),
            },
            {
              id: 'sel-arrange-run',
              group: 'Selection',
              label: 'Arrange selection as a run (along wall)',
              icon: 'Tidy',
              run: () => arrangeSelectionAsRun(catalog),
            },
            {
              id: 'sel-face-room',
              group: 'Selection',
              label: 'Face selection into room',
              icon: 'Rotate',
              run: () => faceSelectionIntoRoom(catalog),
            },
            {
              id: 'sel-mirror',
              group: 'Selection',
              label: 'Mirror selection (left ↔ right)',
              icon: 'FlipH',
              run: () => mirrorSelectionX(catalog),
            },
            // Group/Ungroup the multi-selection (gated by `furnitureGroups` via
            // COMMAND_FLAGS). Ungroup shows when the selection is one group.
            activeGroupId
              ? {
                  id: 'sel-ungroup',
                  group: 'Selection',
                  label: 'Ungroup',
                  icon: 'Group',
                  run: () => s().ungroup(activeGroupId),
                }
              : {
                  id: 'sel-group',
                  group: 'Selection',
                  label: 'Group selection',
                  icon: 'Group',
                  run: () => s().groupItems(s().selectedItemIds),
                },
          ]
        : []
    // Single-item command: open the replace-with-similar picker for the one
    // selected piece (gated by the `replaceSimilar` flag via COMMAND_FLAGS).
    const single: Command[] = selOneId
      ? [
          {
            id: 'replace-similar',
            group: 'Selection',
            label: 'Replace with similar…',
            icon: 'Copy',
            run: () => s().setSwapItemId(selOneId),
          },
        ]
      : []
    // Room commands: inset / grow the selected plan room by ±0.1 m (gated by the
    // `roomInset` flag via COMMAND_FLAGS). Only shown when a room is selected.
    const room: Command[] = selRoomId
      ? [
          {
            id: 'inset-room',
            group: 'Selection',
            label: 'Inset room (−0.1 m)',
            icon: 'FloorPlan',
            run: () => s().insetSelectedRoom(0.1),
          },
          {
            id: 'grow-room',
            group: 'Selection',
            label: 'Grow room (+0.1 m)',
            icon: 'FloorPlan',
            run: () => s().insetSelectedRoom(-0.1),
          },
        ]
      : []
    return [...base, ...layout, ...single, ...room, ...furniture].map((c) => ({
      ...c,
      run: () => {
        c.run()
        close()
      },
    }))
  }, [byCategory, catalog, selCount, selOneId, activeGroupId, selRoomId])

  // Drop commands whose feature flag is off (saved-view commands gate on the
  // savedViews flag) so the palette can't launch a disabled feature. Pro-only
  // commands are also hidden in Simple mode.
  const flags = useStore((s) => s.featureFlags)
  const isPro = useStore((s) => s.uiMode === 'pro')
  const allowed = useMemo(
    () =>
      commands.filter((c) => {
        if (PRO_ONLY_COMMANDS.has(c.id) && !isPro) return false
        const flag =
          c.flag ?? COMMAND_FLAGS[c.id] ?? (c.id.startsWith('view:') ? 'savedViews' : undefined)
        return !flag || flags[flag]
      }),
    [commands, flags, isPro],
  )

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return allowed.filter((c) => c.group !== 'Add furniture').concat()
    return allowed.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 40)
  }, [allowed, q])

  // Reset active index + focus on open / query change.
  useEffect(() => {
    if (open) {
      setActive(0)
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    setQuery('')
  }, [open])
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  // Group the filtered commands for rendering, preserving order.
  const groups: { label: string; items: { cmd: Command; index: number }[] }[] = []
  filtered.forEach((cmd, index) => {
    let g = groups.find((x) => x.label === cmd.group)
    if (!g) {
      g = { label: cmd.group, items: [] }
      groups.push(g)
    }
    g.items.push({ cmd, index })
  })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[active]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return createPortal(
    <div
      className="cmdk-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="cmdk">
        <div className="cmdk-search">
          <Icon.Search className="icn" width={18} height={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search actions, panels, furniture…"
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No commands match “{query.trim()}”.</div>
          ) : (
            groups.map((g) => (
              // `stagger-in` lives HERE (not on `.cmdk-results`) so each
              // `.cmdk-glabel`/`.cmdk-item` below is a direct child: the
              // `.stagger-in > *` rule (components.css) only animates direct
              // children, and each item's inline `--i` (the flat index across
              // all groups) then drives one continuous cascade for the whole
              // list instead of animating group wrappers as opaque blocks.
              <div key={g.label} className="stagger-in">
                <div className="cmdk-glabel">{g.label}</div>
                {g.items.map(({ cmd, index }) => {
                  const Glyph = Icon[cmd.icon]
                  // Contextual docs "?" (DOCS-DEEPLINK): map the command to a
                  // DocKey via its gating flag (else the saved-view default) and
                  // show the affordance only when the guide actually documents it.
                  const docKey =
                    cmd.docKey ??
                    ((COMMAND_FLAGS[cmd.id] ??
                      (cmd.id.startsWith('view:') ? 'savedViews' : undefined)) as
                      | DocKey
                      | undefined)
                  const hasDocs = docKey != null && FEATURE_DOCS[docKey] != null
                  return (
                    <button
                      type="button"
                      key={cmd.id}
                      className={`cmdk-item${index === active ? ' active' : ''}`}
                      style={{ '--i': index } as CSSProperties}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => cmd.run()}
                    >
                      <Glyph className="icn" width={16} height={16} />
                      <span className="ci-label">{cmd.label}</span>
                      {cmd.hint ? <kbd>{cmd.hint}</kbd> : null}
                      {/* Always reserve the trailing help slot so the keyboard-
                          shortcut <kbd> chips line up in a consistent right-hand
                          column whether or not a row has a docs "?". */}
                      {hasDocs ? (
                        // biome-ignore lint/a11y/useSemanticElements: can't nest a <button> inside the row <button>; a focusable span is the accessible alternative
                        <span
                          role="button"
                          tabIndex={0}
                          className="ci-help"
                          aria-label={`Open the user guide: ${cmd.label}`}
                          title="Open the user guide"
                          onClick={(e) => {
                            e.stopPropagation()
                            openToolDocs(docKey as DocKey)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              openToolDocs(docKey as DocKey)
                            }
                          }}
                        >
                          <Icon.Help width={14} height={14} />
                        </span>
                      ) : (
                        <span className="ci-help-spacer" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
