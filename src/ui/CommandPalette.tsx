import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ROOMS } from '../apartment/constants'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { useCatalogByCategory } from '../furniture/catalog'
import { tidyHome } from '../layout/tidyHome'
import { applyLightingScene, LIGHTING_SCENES } from '../scene/lighting/lightingScenes'
import { BACKDROPS } from '../scene/SceneBackdrop'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { openDocs } from './docsUrl'
import { openDesignReport } from './openReport'
import { Icon, type IconName } from './toolbar/icons'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: IconName
  run: () => void
}

/** Command palette (⌘K): fuzzy search across actions, panels, views, and the
 *  full catalog ("add furniture" arms placement). Fully keyboard-navigable.
 *  Mirrors the design's `.cmdk` overlay. */
export function CommandPalette() {
  const open = useStore((s) => s.cmdkOpen)
  const setOpen = useStore((s) => s.setCmdkOpen)
  const byCategory = useCatalogByCategory()
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
        id: 'tidy',
        group: 'Actions',
        label: 'Tidy home',
        hint: 'L',
        icon: 'Tidy',
        run: () => tidyHome(),
      },
      {
        id: 'budget',
        group: 'Tools & panels',
        label: 'Budget / shopping list',
        icon: 'Budget',
        run: () => {
          s().setClearancePanelOpen(false)
          s().setVersionsOpen(false)
          s().setHistoryOpen(false)
          if (!s().budgetOpen) s().toggleBudget()
        },
      },
      {
        id: 'clearance',
        group: 'Tools & panels',
        label: 'Clearance & fit checks',
        icon: 'Checks',
        run: () => {
          if (s().budgetOpen) s().toggleBudget()
          s().setVersionsOpen(false)
          s().setHistoryOpen(false)
          s().setClearancePanelOpen(true)
          if (!s().clearanceOn) s().toggleClearance()
        },
      },
      {
        id: 'versions',
        group: 'Tools & panels',
        label: 'Versions — save / restore',
        icon: 'Versions',
        run: () => {
          if (s().budgetOpen) s().toggleBudget()
          s().setClearancePanelOpen(false)
          s().setHistoryOpen(false)
          s().setVersionsOpen(true)
        },
      },
      {
        id: 'history',
        group: 'Tools & panels',
        label: 'Edit history — jump to any step',
        icon: 'Undo',
        run: () => {
          if (s().budgetOpen) s().toggleBudget()
          s().setClearancePanelOpen(false)
          s().setVersionsOpen(false)
          s().setHistoryOpen(true)
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
        id: 'report',
        group: 'Tools & panels',
        label: 'Design report (printable)',
        icon: 'Report',
        run: () => openDesignReport(),
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
          // First editable room of the active plan (default apartment → first
          // non-external room; custom plan → its first room).
          const id = isDefaultPlan(st.floorPlan)
            ? Object.values(ROOMS).find((r) => !r.external)?.id
            : st.floorPlan.rooms[0]?.id
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
        id: 'help',
        group: 'Tools & panels',
        label: 'Help & shortcuts',
        hint: '?',
        icon: 'Help',
        run: () => s().setHelpOpen(true),
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
          group: 'Lighting moods',
          label: `Time — ${p[0].toUpperCase()}${p.slice(1)}`,
          hint: 'Sun',
          icon: 'Sun',
          run: () => s().setPresetTime(p),
        }),
      ),
      ...LIGHTING_SCENES.map(
        (sc): Command => ({
          id: `mood:${sc.id}`,
          group: 'Lighting moods',
          label: sc.label,
          hint: 'Mood',
          icon: 'Lights',
          run: () => applyLightingScene(sc),
        }),
      ),
      ...BACKDROPS.map(
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
            const id = isDefaultPlan(st.floorPlan)
              ? Object.values(ROOMS).find((r) => !r.external)?.id
              : st.floorPlan.rooms[0]?.id
            if (id) st.enterRoomEditor(id)
          }
          useStore.getState().setCatalogOpen(false)
          useStore.getState().setActiveDefId(def.id)
        },
      }))
    return [...base, ...furniture].map((c) => ({
      ...c,
      run: () => {
        c.run()
        close()
      },
    }))
  }, [byCategory])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return commands.filter((c) => c.group !== 'Add furniture').concat()
    return commands.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 40)
  }, [commands, q])

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
              <div key={g.label}>
                <div className="cmdk-glabel">{g.label}</div>
                {g.items.map(({ cmd, index }) => {
                  const Glyph = Icon[cmd.icon]
                  return (
                    <button
                      type="button"
                      key={cmd.id}
                      className={`cmdk-item${index === active ? ' active' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => cmd.run()}
                    >
                      <Glyph className="icn" width={16} height={16} />
                      <span className="ci-label">{cmd.label}</span>
                      {cmd.hint ? <kbd>{cmd.hint}</kbd> : null}
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
