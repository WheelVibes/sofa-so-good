import type { ReactNode } from 'react'
import { BrandDot } from '../../toolbar/BrandDot'
import { PlanToolMenu } from './PlanToolMenu'
import type { Tool } from './planConstants'

/**
 * The 2D plan editor's header/toolbar row — mobile (short wrapping bar: View/Edit
 * + ☰ Menu + the mobile tool picker + undo/redo + Done) vs desktop (single row,
 * `flex-nowrap` + horizontal-scroll fallback so it never spills to two rows).
 * Extracted from `FloorPlanEditor` (REFAC-2) — purely a layout shell: every
 * control is either a primitive (`isMobile`/`tool`/…) or an already-built
 * fragment (`viewToggle`/`toolPalette`/`fileActionsMenu`/…) the caller
 * assembles from its own state, so this component owns no editor state itself.
 */
export function PlanEditorHeader({
  isMobile,
  toolsMenuOpen,
  onOpenToolsMenu,
  editMode,
  toolList,
  tool,
  toolLabel,
  onPickTool,
  viewToggle,
  drawHint,
  undoRedo,
  onExit,
  planName,
  onPlanNameChange,
  toolPalette,
  wallTypeSeg,
  fPlanFurnish,
  catalogOpen,
  onToggleCatalog,
  templateLibrary,
  fileActionsMenu,
  multiSelectToggle,
  quickActions,
  viewMenu,
  totalLabel,
}: {
  isMobile: boolean
  toolsMenuOpen: boolean
  onOpenToolsMenu: () => void
  editMode: 'view' | 'edit'
  toolList: Tool[]
  tool: Tool
  toolLabel: (t: Tool) => string
  onPickTool: (t: Tool) => void
  viewToggle: ReactNode
  drawHint: ReactNode
  undoRedo: ReactNode
  onExit: () => void
  planName: string
  onPlanNameChange: (v: string) => void
  toolPalette: ReactNode
  wallTypeSeg: ReactNode
  fPlanFurnish: boolean
  catalogOpen: boolean
  onToggleCatalog: () => void
  templateLibrary: ReactNode
  fileActionsMenu: ReactNode
  multiSelectToggle: ReactNode
  quickActions: ReactNode
  viewMenu: ReactNode
  totalLabel: ReactNode
}) {
  return (
    <div
      className={`plan-header flex items-center gap-2 px-4 py-2 ${
        isMobile ? 'flex-wrap' : 'flex-nowrap overflow-x-auto'
      }`}
    >
      {isMobile ? (
        <>
          {/* Brand dot mirrors the room-editor mobile toolbar so the two editing
              surfaces read as the same app. */}
          <BrandDot size={20} />
          {viewToggle}
          {/* The ☰ menu holds furniture/undo/grid/labels/export/etc., useful in
              both modes — so show it always (the drawing-tool picker stays
              Edit-only). */}
          <button
            type="button"
            className={`btn btn-sm${toolsMenuOpen ? ' btn-accent' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={toolsMenuOpen}
            onClick={onOpenToolsMenu}
          >
            ☰ Menu
          </button>
          {editMode === 'edit' && (
            <PlanToolMenu tools={toolList} tool={tool} label={toolLabel} onPick={onPickTool} />
          )}
          {drawHint}
          {/* Undo/redo are important enough to stay in the top bar (not buried
              in the ☰ Menu). `ml-auto` pushes them + Done to the right. */}
          <div className="ml-auto flex items-center gap-2">
            {undoRedo}
            <button type="button" onClick={onExit} className="btn btn-accent btn-sm">
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            value={planName}
            onChange={(e) => onPlanNameChange(e.target.value)}
            className="input"
            style={{ width: 148, flexShrink: 0 }}
            aria-label="Plan name"
            title="Plan name"
          />
          {viewToggle}
          {editMode === 'edit' && toolPalette}
          {editMode === 'edit' && wallTypeSeg}
          {editMode === 'edit' && fPlanFurnish && (
            <button
              type="button"
              onClick={onToggleCatalog}
              className={`btn btn-sm${catalogOpen ? ' btn-accent' : ''}`}
              title="Browse furniture to add directly to the plan"
              aria-pressed={catalogOpen}
            >
              Furnish
            </button>
          )}
          {drawHint}
          {templateLibrary}
          {fileActionsMenu}
          <div className="ml-auto flex items-center gap-2">
            {multiSelectToggle}
            {quickActions}
            {viewMenu}
            {totalLabel}
            <button type="button" onClick={onExit} className="btn btn-accent btn-sm">
              Done
            </button>
          </div>
        </>
      )}
    </div>
  )
}
