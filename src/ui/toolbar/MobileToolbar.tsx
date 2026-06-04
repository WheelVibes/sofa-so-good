import { useState } from 'react'
import { tidyHome } from '../../layout/tidyHome'
import { useStore } from '../../state/store'
import { BrandMark } from '../Logo'
import { AppearancePopover } from './AppearancePopover'
import { Icon, type IconName } from './icons'

interface SheetItem {
  icon: IconName
  label: string
  on?: boolean
  run: () => void
}

/** Collapsed mobile toolbar: a slim bar (brand + title + appearance/help +
 *  menu) whose menu opens a bottom-anchored sheet listing every action,
 *  grouped. Replaces the horizontally-scrolling island on phones. Matches the
 *  design's `.toolbar.mobilebar` + `.m-sheet`. */
export function MobileToolbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const s = useStore
  const cameraMode = useStore((st) => st.cameraMode)
  const catalogOpen = useStore((st) => st.catalogOpen)
  const leftMode = useStore((st) => st.leftMode)
  const showMeasurements = useStore((st) => st.showMeasurements)
  const budgetOpen = useStore((st) => st.budgetOpen)
  const setHelpOpen = useStore((st) => st.setHelpOpen)

  const close = () => setMenuOpen(false)
  const act = (fn: () => void) => () => {
    fn()
    close()
  }

  const sections: { title: string; items: SheetItem[] }[] = [
    {
      title: 'Camera',
      items: [
        {
          icon: 'Orbit',
          label: 'Orbit',
          on: cameraMode === 'orbit',
          run: () => s.getState().setCameraMode('orbit'),
        },
        {
          icon: 'Walk',
          label: 'Walk through',
          on: cameraMode === 'firstPerson',
          run: () => s.getState().setCameraMode('firstPerson'),
        },
      ],
    },
    {
      title: 'View',
      items: [
        { icon: 'TopView', label: 'Top view', run: () => s.getState().requestTopView() },
        { icon: 'Home', label: 'Reset view', run: () => s.getState().requestHomeView() },
        { icon: 'Time', label: 'Cycle time of day', run: () => s.getState().cyclePresetTime() },
      ],
    },
    {
      title: 'Design',
      items: [
        {
          icon: 'Catalog',
          label: 'Catalog',
          on: catalogOpen && leftMode === 'catalog',
          run: () => {
            s.getState().setLeftMode('catalog')
            s.getState().setCatalogOpen(true)
          },
        },
        {
          icon: 'Layers',
          label: 'Objects / Layers',
          on: catalogOpen && leftMode === 'layers',
          run: () => {
            s.getState().setLeftMode('layers')
            s.getState().setCatalogOpen(true)
          },
        },
        {
          icon: 'Measure',
          label: 'Measurements',
          on: showMeasurements,
          run: () => s.getState().toggleMeasurements(),
        },
        { icon: 'Tidy', label: 'Tidy home', run: () => tidyHome() },
        {
          icon: 'FloorPlan',
          label: 'Floor plan editor',
          run: () => s.getState().setFloorPlanEditing(true),
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          icon: 'Budget',
          label: 'Budget / shopping',
          on: budgetOpen,
          run: () => {
            s.getState().setClearancePanelOpen(false)
            s.getState().setVersionsOpen(false)
            if (!s.getState().budgetOpen) s.getState().toggleBudget()
          },
        },
        {
          icon: 'Checks',
          label: 'Clearance checks',
          run: () => {
            if (s.getState().budgetOpen) s.getState().toggleBudget()
            s.getState().setVersionsOpen(false)
            s.getState().setClearancePanelOpen(true)
            if (!s.getState().clearanceOn) s.getState().toggleClearance()
          },
        },
        {
          icon: 'Versions',
          label: 'Versions',
          run: () => {
            if (s.getState().budgetOpen) s.getState().toggleBudget()
            s.getState().setClearancePanelOpen(false)
            s.getState().setVersionsOpen(true)
          },
        },
        { icon: 'Share', label: 'Share & export', run: () => s.getState().setShareOpen(true) },
      ],
    },
  ]

  return (
    <>
      <div className="toolbar mobilebar">
        <div className="brand-dot" title="Sofa So Good">
          <BrandMark size={20} />
        </div>
        <span className="m-title">Sofa So Good</span>
        <AppearancePopover />
        <button
          type="button"
          className="tool-btn"
          aria-label="Help & shortcuts"
          onClick={() => setHelpOpen(true)}
        >
          <Icon.Help />
        </button>
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
              <span className="panel-title">Menu</span>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
                <Icon.Close width={16} height={16} />
              </button>
            </div>
            <div className="m-sheet-body">
              {sections.map((sec) => (
                <div className="m-sec" key={sec.title}>
                  <div className="m-sec-h">{sec.title}</div>
                  {sec.items.map((it) => {
                    const Glyph = Icon[it.icon]
                    return (
                      <button type="button" key={it.label} className="m-item" onClick={act(it.run)}>
                        <Glyph className="icn" width={18} height={18} />
                        <span>{it.label}</span>
                        {it.on ? <span className="m-on">On</span> : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
