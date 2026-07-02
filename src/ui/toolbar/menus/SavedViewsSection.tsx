import { useFeature } from '../../../features/useFeature'
import { canRecord } from '../../../scene/RecordController'
import { captureThumb } from '../../../state/storage/slotThumbs'
import { useStore } from '../../../state/store'
import { PresentationSetup } from '../../presentation/PresentationSetup'
import { recordViewTour } from '../../recordViewTour'
import { renderAllSavedViews } from '../../renderAllViews'
import { Icon } from '../icons'
import { MenuItem } from '../ToolbarMenu'

/**
 * Saved camera views ("bookmarks") section for the View menu. Lets the user
 * snapshot the current angle under a name and jump back to any saved one. Used
 * by both the desktop ViewMenu and the mobile toolbar's View accordion, so the
 * apply/save/delete logic lives in one place.
 *
 * When both `presentation` AND `panoTour` flags are enabled (Pro mode), the
 * plain "Present…" MenuItem is replaced by `PresentationSetup` which adds the
 * "Include 360° tour" toggle before starting the show.
 */
export function SavedViewsSection() {
  const savedViews = useStore((s) => s.savedViews)
  const saveCurrentView = useStore((s) => s.saveCurrentView)
  const applyView = useStore((s) => s.applyView)
  const deleteView = useStore((s) => s.deleteView)
  const setViewNote = useStore((s) => s.setViewNote)
  const setViewPano = useStore((s) => s.setViewPano)
  const setPresenting = useStore((s) => s.setPresenting)
  const presentationOn = useFeature('presentation')
  const panoTourOn = useFeature('panoTour')
  const walkthroughOn = useFeature('walkthrough')
  const batchRenderOn = useFeature('batchRender')

  const editNote = async (id: string, current: string) => {
    const note = await useStore.getState().promptText({
      title: 'Presenter note',
      label: 'Caption shown for this view in presentation mode',
      defaultValue: current,
      submitLabel: 'Save',
    })
    if (note !== null) setViewNote(id, note)
  }

  const onDelete = async (id: string, name: string) => {
    // Deleting a saved view is irreversible (no undo) — gate on the themed
    // confirm modal rather than silently deleting (P35 destructive-confirmation
    // policy; see src/ui/CLAUDE.md).
    const ok = await useStore.getState().confirmAction({
      title: 'Delete this view?',
      message: `“${name}” will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete view',
      danger: true,
    })
    if (ok) deleteView(id)
  }

  const onSave = async () => {
    // Capture the preview now, while the camera is at the angle being saved and
    // before the prompt modal paints over the canvas.
    const thumb = captureThumb()
    const name = await useStore.getState().promptText({
      title: 'Save camera view',
      label: 'Name this view',
      defaultValue: `View ${savedViews.length + 1}`,
      submitLabel: 'Save',
    })
    if (name) saveCurrentView(name, thumb)
  }

  // When both presentation + panoTour are on, show the setup widget (with the
  // tour toggle) instead of the bare "Present…" menu item.
  const showSetup = presentationOn && panoTourOn

  return (
    <>
      <div className="my-1 border-t border-[var(--border)]" />
      <MenuItem
        icon="Plus"
        label="Save current view"
        sub="Bookmark this camera angle"
        onClick={onSave}
      />
      {savedViews.length === 0 ? (
        <div className="px-2 py-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
          No saved views yet — frame an angle, then "Save current view".
        </div>
      ) : null}
      {savedViews.length > 0 ? (
        showSetup ? (
          <PresentationSetup />
        ) : presentationOn ? (
          <MenuItem
            icon="Walkthrough"
            label="Present…"
            sub="Full-screen saved-views slideshow"
            onClick={() => setPresenting(true)}
          />
        ) : null
      ) : null}
      {savedViews.length > 1 ? (
        <MenuItem
          icon="Walkthrough"
          label="Cinematic tour"
          sub="Fly through your saved views (no recording)"
          onClick={() => useStore.getState().setTouring('views')}
        />
      ) : null}
      {savedViews.length > 1 && walkthroughOn && canRecord() ? (
        <MenuItem
          icon="Record"
          label="Record walkthrough video"
          sub="Fly the saved-views tour and download a .webm (~5s per view)"
          onClick={() => recordViewTour(5 * (savedViews.length - 1))}
        />
      ) : null}
      {savedViews.length > 0 && batchRenderOn ? (
        <MenuItem
          icon="Download"
          label="Render all views"
          sub="Download a PNG of every saved view"
          onClick={() => void renderAllSavedViews()}
        />
      ) : null}
      {savedViews.map((v) => (
        <div key={v.id} className="saved-view-row">
          <button
            type="button"
            role="menuitem"
            className="menu-item saved-view-apply"
            onClick={() => applyView(v.id)}
            title={`Go to "${v.name}"`}
          >
            {v.thumb ? (
              <img src={v.thumb} alt="" className="saved-view-thumb" />
            ) : (
              <Icon.Eye width={16} height={16} className="icn" />
            )}
            <span className="mi-text">
              <span className="mi-main">{v.name}</span>
            </span>
          </button>
          {presentationOn ? (
            <>
              <button
                type="button"
                className="saved-view-del"
                aria-label={`Present ${v.name} as a 360° slide`}
                aria-pressed={!!v.pano}
                title={
                  v.pano
                    ? '360° slide — presents as a look-around panorama (click to unset)'
                    : 'Present as a 360° panorama slide'
                }
                style={v.pano ? { color: 'var(--accent)' } : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  setViewPano(v.id, !v.pano)
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700 }}>360°</span>
              </button>
              <button
                type="button"
                className="saved-view-del"
                aria-label={`${v.note ? 'Edit' : 'Add'} note for ${v.name}`}
                title={v.note ? `Note: ${v.note}` : 'Add a presenter note'}
                onClick={(e) => {
                  e.stopPropagation()
                  void editNote(v.id, v.note ?? '')
                }}
              >
                <Icon.Book width={14} height={14} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="saved-view-del"
            aria-label={`Delete view ${v.name}`}
            title="Delete view"
            onClick={(e) => {
              // Keep the menu open so several views can be managed in a row.
              e.stopPropagation()
              void onDelete(v.id, v.name)
            }}
          >
            <Icon.Trash width={14} height={14} />
          </button>
        </div>
      ))}
    </>
  )
}
