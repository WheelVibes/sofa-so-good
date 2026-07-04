import type { ReactNode } from 'react'
import { Modal } from '../../Modal'

/**
 * Mobile "☰ Menu" bottom-sheet: the desktop toolbar's Plan/View/Edit/Defaults
 * controls, collapsed into labelled sections since they don't all fit the
 * mobile top bar. Extracted from `FloorPlanEditor` (REFAC-2) — purely a layout
 * shell over already-built fragments (same rationale as `PlanEditorHeader`).
 */
export function PlanToolsSheet({
  open,
  onClose,
  planName,
  onPlanNameChange,
  templateLibrary,
  fileActions,
  viewMenuActions,
  gridZoom,
  wallTypeSeg,
  multiSelectToggle,
  planDefaults,
  totalLabel,
  onHelp,
}: {
  open: boolean
  onClose: () => void
  planName: string
  onPlanNameChange: (v: string) => void
  templateLibrary: ReactNode
  fileActions: ReactNode
  viewMenuActions: ReactNode
  gridZoom: ReactNode
  wallTypeSeg: ReactNode
  multiSelectToggle: ReactNode
  planDefaults: ReactNode
  totalLabel: ReactNode
  onHelp: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Plan tools">
      {/* Grouped into labelled sections so the sheet reads as tidy settings
          rather than one dense wall of buttons. */}
      <div className="plan-tools-sheet">
        <section className="plan-tools-group">
          <div className="menu-label">Plan</div>
          <input
            value={planName}
            onChange={(e) => onPlanNameChange(e.target.value)}
            className="input"
            aria-label="Plan name"
          />
          {/* Floors are managed from the bottom-left LevelMenu dropdown. */}
          <div className="flex flex-wrap items-center gap-2">
            {templateLibrary}
            {fileActions}
          </div>
        </section>

        <section className="plan-tools-group">
          <div className="menu-label">View</div>
          <div className="flex flex-wrap items-center gap-2">{viewMenuActions}</div>
          {/* undo/redo live in the top bar on mobile, so only grid + zoom here. */}
          <div className="flex flex-wrap items-center gap-2">{gridZoom}</div>
        </section>

        {(wallTypeSeg || multiSelectToggle) && (
          <section className="plan-tools-group">
            <div className="menu-label">Edit</div>
            {wallTypeSeg ? (
              <div className="flex flex-wrap items-center gap-2">{wallTypeSeg}</div>
            ) : null}
            {multiSelectToggle}
          </section>
        )}

        <section className="plan-tools-group">
          <div className="menu-label">Defaults</div>
          {planDefaults}
          {totalLabel}
        </section>

        <button
          type="button"
          className="btn btn-sm btn-block"
          onClick={onHelp}
          title="Open the user guide in a new tab"
        >
          Help — user guide ↗
        </button>
      </div>
    </Modal>
  )
}
