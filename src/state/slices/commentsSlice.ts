import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A pinned design comment (F24): a note anchored to a floor position, level-aware
 *  on multi-storey plans. Persists in the save schema (optional + additive, like
 *  measurement annotations) so comments travel through .sofa.json exports and
 *  `#/design/<code>` share links. Live presence/replies are backend work, deferred. */
export interface DesignComment {
  id: string
  /** Anchor on the floor plane, world XZ metres. */
  position: [number, number]
  /** The storey the pin sits on (absent = ground), like `FurnitureItem.levelId`. */
  levelId?: string
  text: string
  /** Optional display name of who left the note (free-text, no accounts yet). */
  author?: string
  /** ISO timestamp of creation. */
  createdAt: string
  resolved: boolean
}

export interface CommentsSlice {
  /** Pinned comments — persist with the design (save file + share link). */
  comments: DesignComment[]
  /** Comment placement tool: when on, one tap on the floor places a pin
   *  (then an inline text prompt collects the note). Mirrors `tapeMode`. */
  commentMode: boolean
  toggleCommentMode: () => void
  /** Add a pin. Rejects blank text / non-finite positions. Returns the new id
   *  (or null when rejected). Pushes one undo step. */
  addComment: (input: {
    position: [number, number]
    text: string
    levelId?: string
    author?: string
  }) => string | null
  /** Rewrite a comment's text (blank text is rejected). Pushes one undo step. */
  updateCommentText: (id: string, text: string) => void
  /** Mark a comment resolved / reopen it. Pushes one undo step. */
  setCommentResolved: (id: string, resolved: boolean) => void
  /** Remove a pin. Pushes one undo step. */
  deleteComment: (id: string) => void
}

export const COMMENTS_INITIAL: Pick<CommentsSlice, 'comments' | 'commentMode'> = {
  comments: [],
  commentMode: false,
}

const commentId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const createCommentsSlice: SliceCreator<CommentsSlice, RootState> = (set, get) => ({
  ...COMMENTS_INITIAL,
  toggleCommentMode: () => set((s) => ({ commentMode: !s.commentMode })),
  addComment: ({ position, text, levelId, author }) => {
    const trimmed = text.trim()
    // Reject garbage so a stray tap can't write an unusable pin into the save.
    if (!trimmed || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) return null
    const id = commentId()
    get().pushHistory()
    set((s) => ({
      comments: [
        ...s.comments,
        {
          id,
          position: [position[0], position[1]],
          ...(levelId ? { levelId } : {}),
          text: trimmed,
          ...(author?.trim() ? { author: author.trim() } : {}),
          createdAt: new Date().toISOString(),
          resolved: false,
        },
      ],
    }))
    return id
  },
  updateCommentText: (id, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const cur = get().comments.find((c) => c.id === id)
    if (!cur || cur.text === trimmed) return
    get().pushHistory()
    set((s) => ({
      comments: s.comments.map((c) => (c.id === id ? { ...c, text: trimmed } : c)),
    }))
  },
  setCommentResolved: (id, resolved) => {
    const cur = get().comments.find((c) => c.id === id)
    if (!cur || cur.resolved === resolved) return
    get().pushHistory()
    set((s) => ({
      comments: s.comments.map((c) => (c.id === id ? { ...c, resolved } : c)),
    }))
  },
  deleteComment: (id) => {
    if (!get().comments.some((c) => c.id === id)) return
    get().pushHistory()
    set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
  },
})
