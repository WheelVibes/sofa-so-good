import { type ReactNode, useState } from 'react'
import { Button } from '../../controls/Button'
import { MobileSheet, type SheetRailItem } from '../../toolbar/mobile/MobileSheet'
import { Section, SubHeader } from '../../toolbar/mobile/parts'

/**
 * Mobile plan-editor menu: the desktop toolbar's Plan/View/Edit/Defaults
 * controls, in the SAME icon-rail sheet paradigm as the main app's mobile
 * menu (TB-6-tail — this was a bespoke centered "Plan tools" modal, the one
 * mobile surface on a different navigation idiom). The shared `MobileSheet`
 * shell provides the overlay/grab-pill/rail/detail chrome plus the
 * focus-trap/Escape/swipe-dismiss behaviours; the plan controls are the same
 * already-built fragments as before (REFAC-2 layout-shell rationale), grouped
 * into rail sections with `SubHeader` clusters mirroring the main sheet's look.
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
  const [activeId, setActiveId] = useState('plan')
  // The Edit section only exists while its controls do (wall thickness is
  // Edit-mode-only; multi-select can be flag-gated) — mirror that on the rail.
  const hasEdit = Boolean(wallTypeSeg || multiSelectToggle)
  const railItems: SheetRailItem[] = [
    { id: 'plan', icon: 'FloorPlan', title: 'Plan' },
    { id: 'view', icon: 'Eye', title: 'View' },
    ...(hasEdit ? ([{ id: 'edit', icon: 'Select', title: 'Edit' }] as SheetRailItem[]) : []),
    { id: 'defaults', icon: 'Settings', title: 'Defaults' },
  ]
  // Keep the user's pick while it exists (Edit can vanish when its controls
  // do); else fall back to the first section so the pane never blanks.
  const shownId = railItems.some((r) => r.id === activeId) ? activeId : railItems[0].id

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title="Plan tools"
      railItems={railItems}
      activeId={shownId}
      onSelectSection={setActiveId}
    >
      <Section id="plan" title="Plan" icon="FloorPlan" activeId={shownId}>
        <div className="plan-tools-group">
          <input
            value={planName}
            onChange={(e) => onPlanNameChange(e.target.value)}
            className="input"
            aria-label="Plan name"
          />
        </div>
        {/* Floors are managed from the bottom-left LevelMenu dropdown. */}
        <SubHeader>Templates &amp; file</SubHeader>
        <div className="plan-tools-group">
          <div className="flex flex-wrap items-center gap-2">
            {templateLibrary}
            {fileActions}
          </div>
        </div>
      </Section>

      <Section id="view" title="View" icon="Eye" activeId={shownId}>
        <SubHeader>Overlays &amp; export</SubHeader>
        <div className="plan-tools-group">
          <div className="flex flex-wrap items-center gap-2">{viewMenuActions}</div>
        </div>
        {/* undo/redo live in the top bar on mobile, so only grid + zoom here. */}
        <SubHeader>Grid &amp; zoom</SubHeader>
        <div className="plan-tools-group">
          <div className="flex flex-wrap items-center gap-2">{gridZoom}</div>
        </div>
      </Section>

      {hasEdit ? (
        <Section id="edit" title="Edit" icon="Select" activeId={shownId}>
          <div className="plan-tools-group">
            {wallTypeSeg ? (
              <div className="flex flex-wrap items-center gap-2">{wallTypeSeg}</div>
            ) : null}
            {multiSelectToggle}
          </div>
        </Section>
      ) : null}

      <Section id="defaults" title="Defaults" icon="Settings" activeId={shownId}>
        <div className="plan-tools-group">
          {planDefaults}
          {totalLabel}
        </div>
        <div className="plan-tools-group">
          <Button size="sm" block onClick={onHelp} title="Open the user guide in a new tab">
            Help — user guide ↗
          </Button>
        </div>
      </Section>
    </MobileSheet>
  )
}
