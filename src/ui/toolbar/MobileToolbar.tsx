import { useEffect, useState } from 'react'
import { useModalGuard } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { useSunStudy } from '../../scene/sunStudy'
import { detectVrSupport } from '../../scene/xr/vrSupport'
import { getXrStore } from '../../scene/xr/xrStore'
import { storage } from '../../state/storage/adapter'
import type { SlotMeta } from '../../state/storage/StorageAdapter'
import { useStore } from '../../state/store'
import { GraphicsSettings } from '../GraphicsSettings'
import { BrandMark } from '../Logo'
import { Modal } from '../Modal'
import { AppearanceControls } from './AppearancePopover'
import { BrandDot } from './BrandDot'
import { CompassModal } from './CompassModal'
import { Icon, type IconName } from './icons'
import { AppearanceSection } from './mobile/AppearanceSection'
import { ArrangeSection } from './mobile/ArrangeSection'
import { DesignSection } from './mobile/DesignSection'
import { EditHomeSection } from './mobile/EditHomeSection'
import { EditSection } from './mobile/EditSection'
import { FileSection } from './mobile/FileSection'
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
  const appearanceOpen = useStore((st) => st.appearanceOpen)
  const setAppearanceOpen = useStore((st) => st.setAppearanceOpen)
  const currentUser = useStore((st) => st.currentUser)

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

  // Suppress app-wide hotkeys while the sheet is open + close it on Escape, so
  // the mobile menu matches every other overlay (A11Y — it previously had
  // neither, the lone overlay without an Escape handler).
  useModalGuard(menuOpen)
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // Most actions dismiss the sheet; pass {keep:true} for in-place toggles.
  const act = (fn: () => void, opts?: { keep?: boolean }) => () => {
    fn()
    if (!opts?.keep) close()
  }

  const refreshSlots = () => void storage.list().then(setSlots)

  // Left-rail sections for the current mode (icon-only master rail; the matching
  // <Section> renders its body in the detail pane). The ids/icons/titles must
  // stay in lockstep with the <Section> blocks below.
  const railItems: { id: string; icon: IconName; title: string }[] = [
    { id: 'view', icon: 'Orbit', title: 'View' },
    ...(roomEditorActive
      ? ([
          { id: 'edit', icon: 'Select', title: 'Edit' },
          { id: 'design', icon: 'Catalog', title: 'Design' },
          { id: 'arrange', icon: 'Sets', title: 'Arrange' },
        ] as { id: string; icon: IconName; title: string }[])
      : ([
          { id: 'edit-home', icon: 'Cube', title: 'Edit' },
          { id: 'scene', icon: 'Time', title: 'Scene' },
        ] as { id: string; icon: IconName; title: string }[])),
    ...(proMode
      ? ([{ id: 'tools', icon: 'Tools', title: 'Tools' }] as {
          id: string
          icon: IconName
          title: string
        }[])
      : []),
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
        {roomEditorActive ? (
          <>
            <RoomSwitcher className="input m-room-select" />
            <button
              type="button"
              className="tool-btn"
              aria-label="Exit room editor"
              onClick={() => s.getState().exitRoomEditor()}
            >
              <Icon.Close width={18} height={18} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="tool-btn m-menu-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon.Menu />
        </button>
      </div>

      {menuOpen ? (
        <div className="m-menu-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="m-sheet">
            <div className="m-sheet-grab" />
            <div className="m-sheet-head">
              <div className="m-sheet-brand">
                <span className="brand-dot" title="Sofa So Good">
                  <BrandMark size={20} />
                </span>
                <span className="panel-title">Sofa So Good</span>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
                <Icon.Close width={16} height={16} />
              </button>
            </div>
            <div className="m-sheet-panes">
              {/* Icon-only master rail: pick a section; its items show in the
                  detail pane on the right. */}
              <div className="m-rail" role="tablist" aria-label="Menu sections">
                {railItems.map((r) => {
                  const Glyph = Icon[r.icon]
                  const on = shownId === r.id
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`m-rail-btn${on ? ' on' : ''}`}
                      data-tour-section={r.id}
                      role="tab"
                      aria-selected={on}
                      aria-current={on ? 'true' : undefined}
                      aria-label={r.title}
                      onClick={() => setActiveId(r.id)}
                    >
                      <Glyph className="icn" width={22} height={22} />
                    </button>
                  )
                })}
              </div>
              <div className="m-detail">
                {/* View — combined camera + framing (mirrors the desktop View menu).
                  Orbit/Walk always; top/reset/turntable/saved only in the
                  overview (the room editor frames its own room). */}
                <ViewSection activeId={shownId} act={act} vrSupported={vrSupported} />

                {/* Edit — step into a room / reshape the floor plan (overview only). */}
                {!roomEditorActive ? <EditHomeSection activeId={shownId} act={act} /> : null}

                {/* Scene */}
                {!roomEditorActive ? (
                  <SceneSection
                    activeId={shownId}
                    act={act}
                    onOpenCompass={() => setCompassOpen(true)}
                  />
                ) : null}

                {/* Edit / Design / Arrange — manual + bulk editing, only inside the
                  per-room editor (the overview is view-only). */}
                {roomEditorActive ? (
                  <>
                    <EditSection activeId={shownId} act={act} />
                    <DesignSection activeId={shownId} act={act} />
                    <ArrangeSection activeId={shownId} act={act} />
                  </>
                ) : null}

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
                <FileSection
                  activeId={shownId}
                  act={act}
                  slots={slots}
                  refreshSlots={refreshSlots}
                />

                {/* Appearance & help */}
                <AppearanceSection
                  activeId={shownId}
                  act={act}
                  onOpenGraphics={() => setGraphicsOpen(true)}
                />
              </div>
            </div>
            {/* Persistent footer: sign in / account, always at the bottom of the
                main menu regardless of the selected section. */}
            <div className="m-sheet-foot">
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
            </div>
          </div>
        </div>
      ) : null}

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
