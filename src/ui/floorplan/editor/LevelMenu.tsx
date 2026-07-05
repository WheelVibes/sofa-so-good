import { useEffect, useRef, useState } from 'react'
import { GROUND_LEVEL_ID, type PlanLevel, planLevels } from '../../../floorplan/levels'
import type { FloorPlan } from '../../../floorplan/types'
import { useStore } from '../../../state/store'
import { formatLength } from '../../../utils/measurement'
import { Icon } from '../../toolbar/icons'

/**
 * Floor (storey) selector for the 2D editor — a single dropdown pinned to the
 * bottom-left of the canvas. The list is ordered **topmost floor first** (a
 * shopping-mall directory / lift panel), and each row lets you switch to,
 * rename, reorder (▲▼), duplicate or remove (upper storeys) that floor. Opens
 * **upward** since it sits at the bottom of the canvas.
 */
export function LevelMenu({
  plan,
  activeLevelId,
  onSelect,
}: {
  plan: FloorPlan
  activeLevelId: string
  onSelect: (levelId: string) => void
}) {
  const units = useStore((s) => s.units)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const levels = planLevels(plan) // ground-first (ascending elevation)
  const ordered = [...levels].reverse() // topmost-first (mall-directory order)
  const current = levels.find((l) => l.id === activeLevelId) ?? levels[0]
  const lastIdx = ordered.length - 1

  // Close on outside pointerdown / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setEditingId(null)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commitRename = (id: string) => {
    if (draft.trim()) useStore.getState().renameLevel(id, draft)
    setEditingId(null)
  }

  const removeLevel = async (level: PlanLevel) => {
    const st = useStore.getState()
    const ok = await st.confirmAction({
      title: `Remove ${level.name}?`,
      message: 'Its walls, rooms, openings and furniture are removed with it. You can undo this.',
      confirmLabel: 'Remove floor',
      danger: true,
    })
    if (!ok) return
    useStore.getState().removeLevel(level.id)
    onSelect(GROUND_LEVEL_ID)
  }

  return (
    <div
      ref={rootRef}
      className="level-menu"
      style={{
        position: 'absolute',
        // Clear the iOS safe area (0 on non-notched displays).
        left: 'calc(12px + env(safe-area-inset-left, 0px))',
        bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        zIndex: 6,
      }}
    >
      {open && (
        <div
          className="pop-panel"
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: 248,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              const id = useStore.getState().addLevel()
              onSelect(id)
              setOpen(false)
            }}
          >
            <Icon.Plus className="icn" width={16} height={16} />
            Add floor (above top)
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              const id = useStore.getState().duplicateLevel(activeLevelId)
              if (id) onSelect(id)
              setOpen(false)
            }}
          >
            <Icon.Copy className="icn" width={16} height={16} />
            Duplicate current floor
          </button>
          <div className="ctx-sep" />
          {ordered.map((l, i) => {
            const isGround = l.id === GROUND_LEVEL_ID
            const isActive = l.id === activeLevelId
            // In this topmost-first list, "up" = higher elevation; ground stays
            // the base. Up disabled at the top; down disabled just above ground.
            const canUp = !isGround && i > 0
            const canDown = !isGround && i < lastIdx - 1
            return (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 6,
                  background: isActive ? 'var(--surface-3)' : undefined,
                }}
              >
                {editingId === l.id ? (
                  <input
                    // biome-ignore lint/a11y/noAutofocus: focus the field the user just opened to rename.
                    autoFocus
                    className="input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={draft}
                    aria-label={`Rename ${l.name}`}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(l.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => commitRename(l.id)}
                  />
                ) : (
                  <button
                    type="button"
                    className="menu-item"
                    style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
                    aria-current={isActive}
                    onClick={() => {
                      onSelect(l.id)
                      setOpen(false)
                    }}
                    title={
                      l.elevation > 0 ? `Floor at ${formatLength(l.elevation, units)}` : undefined
                    }
                  >
                    <span
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {l.name}
                    </span>
                  </button>
                )}
                {/* Reorder ▲▼ (upper storeys only). */}
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!canUp}
                  aria-label={`Move ${l.name} up`}
                  title="Move floor up"
                  style={!canUp ? { opacity: 0.3, pointerEvents: 'none' } : undefined}
                  onClick={() => useStore.getState().moveLevel(l.id, 'up')}
                >
                  <Icon.Chevron
                    className="icn"
                    width={14}
                    height={14}
                    style={{ transform: 'rotate(180deg)' }}
                  />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!canDown}
                  aria-label={`Move ${l.name} down`}
                  title="Move floor down"
                  style={!canDown ? { opacity: 0.3, pointerEvents: 'none' } : undefined}
                  onClick={() => useStore.getState().moveLevel(l.id, 'down')}
                >
                  <Icon.Chevron className="icn" width={14} height={14} />
                </button>
                {/* Rename. */}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Rename ${l.name}`}
                  title="Rename floor"
                  onClick={() => {
                    setEditingId(l.id)
                    setDraft(l.name)
                  }}
                >
                  <Icon.Edit className="icn" width={14} height={14} />
                </button>
                {/* Remove (upper storeys only). */}
                {!isGround && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${l.name}`}
                    title="Remove floor"
                    onClick={() => void removeLevel(l)}
                  >
                    <Icon.Trash className="icn" width={14} height={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <button
        type="button"
        className={`btn btn-sm${open ? ' btn-accent' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Floors"
        title="Switch floor — rename, reorder, add or remove storeys"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Icon.FloorPlan className="icn" width={16} height={16} />
        <span
          style={{
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {current.name}
        </span>
        <span aria-hidden style={{ opacity: 0.7 }}>
          ▾
        </span>
      </button>
    </div>
  )
}
