import { useEffect, useState } from 'react'
import { hasBackend } from '../../features/api/client'
import { useFeature } from '../../features/useFeature'
import { useSunStudy } from '../../scene/sunStudy'
import { detectVrSupport } from '../../scene/xr/vrSupport'
import { getXrStore } from '../../scene/xr/xrStore'
import { storage } from '../../state/storage/adapter'
import type { SlotMeta } from '../../state/storage/StorageAdapter'
import { useStore } from '../../state/store'
import { GraphicsSettings } from '../GraphicsSettings'
import { Modal } from '../Modal'
import { AppearanceControls } from './AppearancePopover'
import { BrandDot } from './BrandDot'
import { CompassModal } from './CompassModal'
import { Icon } from './icons'
import { AppearanceSection } from './mobile/AppearanceSection'
import { ArrangeSection } from './mobile/ArrangeSection'
import { DesignSection } from './mobile/DesignSection'
import { EditHomeSection } from './mobile/EditHomeSection'
import { EditSection } from './mobile/EditSection'
import { FileSection } from './mobile/FileSection'
import { MobileSheet, type SheetRailItem } from './mobile/MobileSheet'
import { SceneSection } from './mobile/SceneSection'
import { ToolsSection } from './mobile/ToolsSection'
import { ViewSection } from './mobile/ViewSection'
import { RoomSwitcher } from './RoomSwitcher'

export function MobileToolbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>('view')
  const [graphicsOpen, setGraphicsOpen] = useState(false)
  const [compassOpen, setCompassOpen] = useState(false)
  const [sunStudy, setSunStudy] = useState(false)
  const [slots, setSlots] = useState<SlotMeta[]>([])
  useSunStudy(sunStudy)

  // Refresh the saved-layout list whenever the sheet opens.
  useEffect(() => {
    if (menuOpen) void storage.list().then(setSlots)
  }, [menuOpen])

  const s = useStore
  const proMode = useStore((st) => st.uiMode === 'pro')
  const roomEditorActive = useStore((st) => st.roomEditor.active)
  const catalogOpen = useStore((st) => st.catalogOpen)
  const leftMode = useStore((st) => st.leftMode)
  const appearanceOpen = useStore((st) => st.appearanceOpen)
  const setAppearanceOpen = useStore((st) => st.setAppearanceOpen)
  const currentUser = useStore((st) => st.currentUser)
  // Sign-in requires a real backend; hidden in offline / GitHub Pages builds.
  const accountsOn = useFeature('accounts') && hasBackend()

  const fVr = useFeature('vrWalkthrough')
  const [vrSupported, setVrSupported] = useState(false)
  useEffect(() => {
    if (!fVr) return
    let on = true
    void detectVrSupport().then((ok) => {
      if (!on || !ok) return
      setVrSupported(true)
      void getXrStore()
    })
    return () => {
      on = false
    }
  }, [fVr])

  const close = () => setMenuOpen(false)

  // Most actions dismiss the sheet; pass {keep:true} for in-place toggles.
  // {defer:true} closes the sheet FIRST and only then runs the action — used by
  // camera moves (reset / top view) so the fly plays in full view instead of
  // starting hidden behind the still-open menu and ending before it clears.
  const act = (fn: () => void, opts?: { keep?: boolean; defer?: boolean }) => () => {
    if (opts?.defer) {
      close()
      window.setTimeout(fn, 220)
      return
    }
    fn()
    if (!opts?.keep) close()
  }

  const refreshSlots = () => void storage.list().then(setSlots)

  // Left-rail sections for the current mode (icon-only master rail; the matching
  // <Section> renders its body in the detail pane). The ids/icons/titles must
  // stay in lockstep with the <Section> blocks below.
  const railItems: SheetRailItem[] = [
    { id: 'view', icon: 'Orbit', title: 'View' },
    ...(roomEditorActive
      ? ([
          { id: 'edit', icon: 'Select', title: 'Edit' },
          { id: 'design', icon: 'Catalog', title: 'Design' },
          { id: 'arrange', icon: 'Sets', title: 'Arrange' },
          // Scene is meaningful inside the room editor too (TB-6b) — the editor
          // canvas renders the full lighting stack (sun/fixtures/effects).
          { id: 'scene', icon: 'Time', title: 'Scene' },
        ] as SheetRailItem[])
      : ([
          { id: 'edit-home', icon: 'Cube', title: 'Edit' },
          // Whole-flat Arrange (Smart Start / layout presets / style themes) is
          // reachable from the overview too — desktop mounts ArrangeMenu in both
          // modes (Toolbar.tsx's view-mode cluster); without this rail entry a
          // phone user had to enter a single room to restyle the whole home
          // (TB-4 in the 2026-07-10 toolbar UX audit).
          { id: 'arrange', icon: 'Sets', title: 'Arrange' },
          { id: 'scene', icon: 'Time', title: 'Scene' },
        ] as SheetRailItem[])),
    ...(proMode ? ([{ id: 'tools', icon: 'Tools', title: 'Tools' }] as SheetRailItem[]) : []),
    { id: 'file', icon: 'Save', title: 'File' },
    { id: 'appearance', icon: 'Palette', title: 'Appearance & help' },
  ]
  // Resolve the shown section: keep the user's pick if it still exists in this
  // mode, else fall back to the first (View) — so switching mode never blanks the
  // detail pane.
  const shownId = railItems.some((r) => r.id === activeId) ? activeId : railItems[0].id

  return (
    <>
      <div className={`toolbar mobilebar${roomEditorActive ? ' editing-room' : ''}`}>
        <BrandDot size={20} />
        {roomEditorActive ? <RoomSwitcher className="input m-room-select" /> : null}
        {/* Catalog — only inside the room editor (mirrors the desktop toolbar's
            catalog button + the Design menu's Catalog item), sitting to the LEFT
            of the hamburger. Toggles the left dock's catalog bottom-sheet. */}
        {roomEditorActive ? (
          <button
            type="button"
            className={`tool-btn m-catalog-btn${catalogOpen && leftMode === 'catalog' ? ' active' : ''}`}
            aria-label="Catalog"
            aria-pressed={catalogOpen && leftMode === 'catalog'}
            onClick={() => {
              const st = s.getState()
              if (st.catalogOpen && st.leftMode === 'catalog') st.setCatalogOpen(false)
              else {
                st.setLeftMode('catalog')
                st.setCatalogOpen(true)
              }
            }}
          >
            <Icon.Catalog width={20} height={20} />
          </button>
        ) : null}
        {/* Hamburger and Exit swapped (menu now sits left of the exit X in the
            room editor): the hamburger always renders; the exit only while
            editing a room, kept as the last (right-most) control. */}
        <button
          type="button"
          className="tool-btn m-menu-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon.Menu />
        </button>
        {roomEditorActive ? (
          <button
            type="button"
            className="tool-btn"
            aria-label="Exit room editor"
            onClick={() => s.getState().exitRoomEditor()}
          >
            <Icon.Close width={18} height={18} />
          </button>
        ) : null}
      </div>

      {/* The sheet shell (overlay/grab-pill/head/rail/detail + the a11y
          contract) is the shared MobileSheet — the same paradigm the 2D plan
          editor's mobile menu uses (TB-6-tail). */}
      <MobileSheet
        open={menuOpen}
        onClose={close}
        title="Sofa So Good"
        railItems={railItems}
        activeId={shownId}
        onSelectSection={setActiveId}
        footer={
          // Persistent footer: sign in / account, always at the bottom of the
          // main menu regardless of the selected section. Backend builds only.
          accountsOn ? (
            <button
              type="button"
              className="m-foot-btn"
              onClick={act(() => s.getState().setLoginOpen(true))}
            >
              <Icon.Eye className="icn" width={18} height={18} />
              <span className="m-foot-tx">
                {currentUser ? `Account · ${currentUser.name}` : 'Sign in'}
              </span>
            </button>
          ) : undefined
        }
      >
        {/* View — combined camera + framing (mirrors the desktop View menu).
            Orbit/Walk always; top/reset/turntable/saved only in the
            overview (the room editor frames its own room). */}
        <ViewSection activeId={shownId} act={act} vrSupported={vrSupported} />

        {/* Edit — step into a room / reshape the floor plan (overview only). */}
        {!roomEditorActive ? <EditHomeSection activeId={shownId} act={act} /> : null}

        {/* Scene — both modes (TB-6b, mirrors desktop). */}
        <SceneSection activeId={shownId} act={act} onOpenCompass={() => setCompassOpen(true)} />

        {/* Edit / Design — manual editing, only inside the per-room
            editor (the overview is view-only). */}
        {roomEditorActive ? (
          <>
            <EditSection activeId={shownId} act={act} />
            <DesignSection activeId={shownId} act={act} />
          </>
        ) : null}

        {/* Arrange — whole-flat sets / presets / style themes. Mounted in
            BOTH modes (mirrors desktop, which surfaces ArrangeMenu in the
            overview cluster too — its actions act on the whole flat). */}
        <ArrangeSection activeId={shownId} act={act} />

        {/* Tools (advanced — hidden in Simple mode) */}
        {proMode ? (
          <ToolsSection
            activeId={shownId}
            act={act}
            sunStudy={sunStudy}
            setSunStudy={setSunStudy}
          />
        ) : null}

        {/* File */}
        <FileSection activeId={shownId} act={act} slots={slots} refreshSlots={refreshSlots} />

        {/* Appearance & help */}
        <AppearanceSection
          activeId={shownId}
          act={act}
          onOpenGraphics={() => setGraphicsOpen(true)}
        />
      </MobileSheet>

      <GraphicsSettings
        open={graphicsOpen}
        onClose={() => setGraphicsOpen(false)}
        showBack={menuOpen}
      />
      <CompassModal open={compassOpen} onClose={() => setCompassOpen(false)} showBack={menuOpen} />
      <Modal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        title="Appearance"
        width={320}
        showBack={menuOpen}
      >
        <AppearanceControls />
      </Modal>
    </>
  )
}
