import { Html } from '@react-three/drei'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { noExportUserData } from '../export/sceneGltf'
import { useFeature } from '../features/useFeature'
import { GROUND_LEVEL_ID, isMultiLevel, levelElevation } from '../floorplan/levels'
import type { DesignComment } from '../state/slices/commentsSlice'
import { useStore } from '../state/store'
import { priorityRaycast } from './raycastPriority'

const LIFT = 0.03
const PAD = 4 // metres of click-plane margin beyond the apartment box

/**
 * Pinned design comments in the 3D scene (F24): one numbered bubble per comment,
 * anchored to its floor position at its storey's elevation (level-aware via
 * `levels.ts`, hidden with its storey like furniture). Click a pin to open a
 * small popover with the note + resolve/delete. While `commentMode` is armed a
 * transparent floor plane (mirroring the tape measure) captures one tap →
 * inline text prompt → new pin on the storey currently in view.
 */
export function CommentPins() {
  const enabled = useFeature('comments')
  const comments = useStore(useShallow((s) => s.comments))
  const commentMode = useStore((s) => s.commentMode)
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  // The 2D plan editor draws over the scene but drei <Html> sits above it —
  // hide pins while the editor covers the canvas (same as AnnotationsOverlay).
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!enabled || floorPlanEditing) return null

  const multi = isMultiLevel(plan)
  // New pins land on the storey currently in view ('all' → ground).
  const placeLevelId = multi && viewLevelId !== 'all' ? viewLevelId : GROUND_LEVEL_ID
  const placeElevation = levelElevation(plan, placeLevelId)

  const placeAt = async (x: number, z: number) => {
    const s = useStore.getState()
    const text = await s.promptText({
      title: 'Add comment',
      label: 'Note for this spot',
      placeholder: 'e.g. Swap this rug for something warmer',
      submitLabel: 'Pin comment',
    })
    if (!text) return // cancelled / blank — stay armed, no pin
    s.addComment({
      position: [x, z],
      text,
      ...(placeLevelId !== GROUND_LEVEL_ID ? { levelId: placeLevelId } : {}),
    })
  }

  return (
    <group userData={noExportUserData()}>
      {comments.map((c, i) => {
        const levelId = c.levelId ?? GROUND_LEVEL_ID
        // Hidden with its storey, like furniture (single-level plans show all).
        if (multi && viewLevelId !== 'all' && levelId !== viewLevelId) return null
        return (
          <CommentPin
            key={c.id}
            comment={c}
            number={i + 1}
            elevation={levelElevation(plan, levelId)}
            open={openId === c.id}
            onToggle={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
          />
        )
      })}
      {commentMode ? (
        // Transparent floor click plane at the in-view storey's elevation; the
        // priority raycast makes it win the pick so one tap anywhere drops a pin.
        <mesh
          ref={priorityRaycast}
          position={[APARTMENT_EXT_W / 2, placeElevation + LIFT, APARTMENT_EXT_D / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(e) => {
            e.stopPropagation()
            void placeAt(e.point.x, e.point.z)
          }}
        >
          <planeGeometry args={[APARTMENT_EXT_W + PAD * 2, APARTMENT_EXT_D + PAD * 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

/** One numbered comment bubble + its click-to-open popover. */
function CommentPin({
  comment,
  number,
  elevation,
  open,
  onToggle,
}: {
  comment: DesignComment
  number: number
  elevation: number
  open: boolean
  onToggle: () => void
}) {
  const [x, z] = comment.position
  const tint = comment.resolved ? 'var(--ok, var(--accent))' : 'var(--accent)'
  return (
    <Html position={[x, elevation + 0.35, z]} center distanceFactor={9}>
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        <button
          type="button"
          aria-label={`Comment ${number}: ${comment.text}`}
          title={comment.text}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="shadow"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
            border: '2px solid var(--surface-solid)',
            background: tint,
            opacity: comment.resolved ? 0.55 : 1,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <span
            style={{
              transform: 'rotate(45deg)',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--surface-solid)',
            }}
          >
            {comment.resolved ? '✓' : number}
          </span>
        </button>
        {open ? <CommentPopover comment={comment} number={number} onClose={onToggle} /> : null}
      </div>
    </Html>
  )
}

/** Small in-scene card with the note text + resolve / delete actions. */
function CommentPopover({
  comment,
  number,
  onClose,
}: {
  comment: DesignComment
  number: number
  onClose: () => void
}) {
  const setCommentResolved = useStore((s) => s.setCommentResolved)
  const deleteComment = useStore((s) => s.deleteComment)
  return (
    <div
      className="panel mini shadow"
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        width: 200,
        padding: 'var(--s-2, 8px)',
        zIndex: 2,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 'var(--t-2xs)', fontWeight: 700, color: 'var(--text-2)' }}>
          #{number}
          {comment.author ? ` · ${comment.author}` : ''}
          {comment.resolved ? ' · resolved' : ''}
        </span>
        <button type="button" className="icon-btn" aria-label="Close comment" onClick={onClose}>
          ×
        </button>
      </div>
      <div
        style={{
          fontSize: 'var(--t-xs)',
          color: 'var(--text)',
          marginBottom: 6,
          textDecoration: comment.resolved ? 'line-through' : 'none',
          opacity: comment.resolved ? 0.7 : 1,
          overflowWrap: 'anywhere',
        }}
      >
        {comment.text}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          onClick={() => setCommentResolved(comment.id, !comment.resolved)}
        >
          {comment.resolved ? 'Reopen' : 'Resolve'}
        </button>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          aria-label={`Delete comment ${number}`}
          onClick={() => {
            deleteComment(comment.id)
            onClose()
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
