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
              <div
                key={c.id}
                className="clr-item"
                style={{
                  borderLeftColor: c.resolved ? 'var(--ok, var(--accent))' : 'var(--accent)',
                  display: 'flex',
                  gap: 'var(--s-2)',
                  alignItems: 'flex-start',
                }}
              >
                <button
                  type="button"
                  title="Jump to this pin"
                  onClick={() => focusComment(c.id)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--t-xs)',
                      textDecoration: c.resolved ? 'line-through' : 'none',
                      opacity: c.resolved ? 0.6 : 1,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    <strong>#{i + 1}</strong> {c.text}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--t-2xs)',
                      color: 'var(--text-3)',
                      marginTop: 2,
                    }}
                  >
                    {c.author ? `${c.author} · ` : ''}
                    {multi ? `${levelById(plan, c.levelId).name} · ` : ''}
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${c.resolved ? 'Reopen' : 'Resolve'} comment ${i + 1}`}
                  aria-pressed={c.resolved}
                  title={c.resolved ? 'Reopen' : 'Mark resolved'}
                  style={c.resolved ? { color: 'var(--ok, var(--accent))' } : undefined}
                  onClick={() => useStore.getState().setCommentResolved(c.id, !c.resolved)}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit comment ${i + 1}`}
                  title="Edit"
                  onClick={() => void editComment(c.id)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete comment ${i + 1}`}
                  title="Delete"
                  onClick={() => useStore.getState().deleteComment(c.id)}
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
