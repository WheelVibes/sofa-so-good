import { useShallow } from 'zustand/react/shallow'
import { GROUND_LEVEL_ID, isMultiLevel, levelById } from '../floorplan/levels'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { Button } from './controls/Button'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'

/**
 * Comments panel (F24): lists every pinned design comment with a resolve toggle,
 * click-to-focus (frames the pin, switching the storey filter if the comment
 * lives on another level), edit and delete. "Add comment" arms the one-tap
 * placement tool (see `scene/CommentPins`). Docks to the shared `.aux` slot.
 */
export function CommentsPanel() {
  const open = useStore((s) => s.commentsOpen)
  const setOpen = useStore((s) => s.setCommentsOpen)
  const comments = useStore(useShallow((s) => s.comments))
  const commentMode = useStore((s) => s.commentMode)
  const plan = useStore((s) => s.floorPlan)
  const multi = isMultiLevel(plan)

  if (!open) return null

  const openCount = comments.filter((c) => !c.resolved).length

  // Frame a pin: jump the camera to it, switching the storey filter when the
  // comment lives on a level that's currently hidden.
  const focusComment = (id: string) => {
    const s = useStore.getState()
    const c = s.comments.find((x) => x.id === id)
    if (!c) return
    const levelId = c.levelId ?? GROUND_LEVEL_ID
    if (isMultiLevel(s.floorPlan) && s.viewLevelId !== 'all' && s.viewLevelId !== levelId) {
      s.setViewLevel(levelId)
    }
    s.focusOn([c.position[0], c.position[1]])
  }

  // Every other delete in the app is confirm (item / saved view / version) or at
  // least confirm+Undo; this one was a single click on a trash icon wedged
  // between the resolve and edit icons, with no prompt and no Undo toast even
  // though `deleteComment` does push history (UIUX-80).
  const removeComment = async (id: string, index: number) => {
    const s = useStore.getState()
    const ok = await s.confirmAction({
      title: 'Delete comment?',
      message: `Comment #${index} will be removed. You can undo this with Ctrl/⌘+Z.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) useStore.getState().deleteComment(id)
  }

  const editComment = async (id: string) => {
    const s = useStore.getState()
    const c = s.comments.find((x) => x.id === id)
    if (!c) return
    const text = await s.promptText({
      title: 'Edit comment',
      label: 'Note',
      defaultValue: c.text,
      submitLabel: 'Save',
    })
    if (text) s.updateCommentText(id, text)
  }

  return (
    <aside className="panel mini aux" id="commentsPanel">
      <AuxPanelHead
        title="Comments"
        sub={
          comments.length === 0
            ? 'Pinned notes on this design'
            : `${openCount} open · ${comments.length - openCount} resolved`
        }
        docs="comments"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        <Button
          variant="soft"
          size="sm"
          block
          className={commentMode ? 'on' : ''}
          style={{ marginBottom: 'var(--s-2)' }}
          aria-pressed={commentMode}
          onClick={() => useStore.getState().toggleCommentMode()}
        >
          {commentMode ? 'Tap the floor to pin… (click to cancel)' : '+ Add comment'}
        </Button>
        {comments.length === 0 ? (
          <EmptyState
            icon={Icon.Pin}
            title="No comments yet"
            description="Add a comment, then tap a spot on the floor — pins travel with saves and share links."
            cta={
              commentMode
                ? undefined
                : {
                    label: '+ Add comment',
                    onClick: () => useStore.getState().toggleCommentMode(),
                  }
            }
          />
        ) : (
          <div className="clr-list">
            {comments.map((c, i) => (
              <div key={c.id} className={`clr-item cmt-row${c.resolved ? ' resolved' : ''}`}>
                <button
                  type="button"
                  title="Jump to this pin"
                  onClick={() => focusComment(c.id)}
                  className="btn-plain"
                  style={{ flex: 1 }}
                >
                  <span className="cmt-txt">
                    <strong>#{i + 1}</strong> {c.text}
                  </span>
                  <span className="cmt-meta">
                    {c.author ? `${c.author} · ` : ''}
                    {multi ? `${levelById(plan, c.levelId).name} · ` : ''}
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  className={`icon-btn${c.resolved ? ' on' : ''}`}
                  aria-label={`${c.resolved ? 'Reopen' : 'Resolve'} comment ${i + 1}`}
                  aria-pressed={c.resolved}
                  title={c.resolved ? 'Reopen' : 'Mark resolved'}
                  onClick={() => useStore.getState().setCommentResolved(c.id, !c.resolved)}
                >
                  <Icon.Check width={14} height={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit comment ${i + 1}`}
                  title="Edit"
                  onClick={() => void editComment(c.id)}
                >
                  <Icon.Edit width={14} height={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete comment ${i + 1}`}
                  title="Delete"
                  onClick={() => void removeComment(c.id, i + 1)}
                >
                  <Icon.Trash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
