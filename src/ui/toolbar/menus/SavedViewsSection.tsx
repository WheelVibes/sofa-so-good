import { useStore } from '../../../state/store'
import { Icon } from '../icons'
import { MenuItem } from '../ToolbarMenu'

/**
 * Saved camera views ("bookmarks") section for the View menu. Lets the user
 * snapshot the current angle under a name and jump back to any saved one. Used
 * by both the desktop ViewMenu and the mobile toolbar's View accordion, so the
 * apply/save/delete logic lives in one place.
 */
export function SavedViewsSection() {
  const savedViews = useStore((s) => s.savedViews)
  const saveCurrentView = useStore((s) => s.saveCurrentView)
  const applyView = useStore((s) => s.applyView)
  const deleteView = useStore((s) => s.deleteView)

  const onSave = () => {
    const name = window.prompt('Name this view', `View ${savedViews.length + 1}`)
    if (name !== null) saveCurrentView(name)
  }

  return (
    <>
      <div className="my-1 border-t border-[var(--border)]" />
      <MenuItem
        icon="Plus"
        label="Save current view"
        sub="Bookmark this camera angle"
        onClick={onSave}
      />
      {savedViews.map((v) => (
        <div key={v.id} className="saved-view-row">
          <button
            type="button"
            role="menuitem"
            className="menu-item saved-view-apply"
            onClick={() => applyView(v.id)}
            title={`Go to “${v.name}”`}
          >
            <Icon.Eye width={16} height={16} className="icn" />
            <span className="mi-text">
              <span className="mi-main">{v.name}</span>
            </span>
          </button>
          <button
            type="button"
            className="saved-view-del"
            aria-label={`Delete view ${v.name}`}
            title="Delete view"
            onClick={(e) => {
              // Keep the menu open so several views can be managed in a row.
              e.stopPropagation()
              deleteView(v.id)
            }}
          >
            <Icon.Trash width={14} height={14} />
          </button>
        </div>
      ))}
    </>
  )
}
