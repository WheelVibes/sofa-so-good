import { useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildDesignScore,
  type DesignScore,
  type Grade,
  type IssueSeverity,
} from '../analysis/designScore'
import { buildSuggestions } from '../analysis/suggestions'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { useFeature } from '../features/useFeature'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { RingGauge } from './controls/RingGauge'

/** Maps a letter grade to the RingGauge tone (A/B healthy, C neutral accent,
 *  D/F danger) — real tokens only (UIUX-50; the old fallback chain referenced
 *  phantom `--err`/`--ok,--accent` names and bottomed out in a hex literal). */
function gradeTone(grade: Grade): { tone?: 'ok'; danger?: boolean } {
  if (grade === 'A' || grade === 'B') return { tone: 'ok' }
  if (grade === 'C') return {}
  return { danger: true }
}

/** Per-issue dot class by severity — colours live in CSS (`.sev-dot`,
 *  features.css) beside the other warn-shade rules; no `--warn` token exists. */
function severityClass(sev: IssueSeverity): string {
  if (sev === 'critical') return 'sev-dot critical'
  if (sev === 'warning') return 'sev-dot warn'
  return 'sev-dot'
}

/**
 * Design Score: an aggregate 0–100 quality read on the current design (clearance,
 * furnishing balance, circulation, daylight, lighting) with a letter grade and
 * actionable suggestions. Pure presentation over `buildDesignScore`; the O(n²)
 * scans run only while the panel is open (mirrors the Clearance panel gating).
 */
export function DesignScorePanel() {
  const open = useStore((s) => s.designScoreOpen)
  const setOpen = useStore((s) => s.setDesignScoreOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const doors = useStore((s) => s.doors)
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )

  // Skip the O(n²) recompute while an item is being dragged (items changes every
  // pointermove) — keep showing the last score until the drag settles.
  const dragging = useStore((s) => s.draggingItemId)
  const lastScore = useRef<DesignScore | null>(null)
  const score = useMemo(() => {
    if (!open) return null
    if (dragging) return lastScore.current
    const merged = buildMergedCatalog(catalogInputs)
    const walls = isDefaultPlan(plan) ? buildCollisionWalls(doors) : planCollisionWalls(plan, doors)
    // `doors` rides along so upper-storey wall-clip checks resolve their own
    // level's walls door-aware, matching the ground set above (F13/ML3).
    const result = buildDesignScore(items, merged, plan, { walls, doors })
    lastScore.current = result
    return result
  }, [open, items, plan, doors, catalogInputs, dragging])

  // Contextual "what to add" suggestions per room (gated by its own flag).
  const suggestEnabled = useFeature('suggestions')
  const suggestions = useMemo(() => {
    if (!open || !suggestEnabled || dragging) return []
    const merged = buildMergedCatalog(catalogInputs)
    const rooms = plan.rooms.map((r) => {
      const cats = new Set<string>()
      for (const it of items) {
        const def = merged[it.defId]
        if (def && pointInRoom(r, it.position[0], it.position[1])) cats.add(def.category)
      }
      return {
        id: r.id,
        name: r.name,
        areaSqm: planRoomArea(r),
        itemCategories: [...cats],
        ...(r.category ? { category: r.category } : {}),
      }
    })
    return buildSuggestions({ rooms })
  }, [open, suggestEnabled, dragging, items, plan, catalogInputs])

  // Select + frame the items behind a category's issues (clearance / circulation).
  const selectOffenders = (ids: string[]) => {
    if (ids.length === 0) return
    const s = useStore.getState()
    s.setSelectedItemIds(ids)
    const pts = ids
      .map((id) => items.find((it) => it.id === id)?.position)
      .filter((p): p is [number, number] => Array.isArray(p))
    if (pts.length > 0) {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
      const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length
      s.focusOn([cx, cz])
    }
  }

  if (!open || !score) return null

  const dialTone = gradeTone(score.grade)

  return (
    <aside className="panel mini aux aux-360" id="designScorePanel">
      <AuxPanelHead
        title="Design score"
        sub="Clearance · furnishing · flow · daylight · lighting"
        docs="designScore"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        {/* Overall dial */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            marginBottom: 'var(--s-3)',
          }}
        >
          {/* Canonical radial progress (UIUX-50): the old hand-rolled
              conic-gradient dial masked its centre with a phantom token
              (`--panel-bg`/`--surface-1` don't exist), rendering as a solid
              pie with the grade letter invisible against it. */}
          <RingGauge
            value={score.overall / 100}
            size={64}
            strokeWidth={6}
            {...dialTone}
            ariaLabel={`Overall score ${score.overall} out of 100, grade ${score.grade}`}
          >
            <span style={{ fontSize: 'var(--t-base)' }}>{score.grade}</span>
          </RingGauge>
          <div>
            <div style={{ fontSize: 'var(--t-xl)', fontWeight: 700 }}>
              {score.overall}
              <span style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}> / 100</span>
            </div>
            <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}>
              {score.itemCount} {score.itemCount === 1 ? 'item' : 'items'} · {score.roomCount}{' '}
              {score.roomCount === 1 ? 'room' : 'rooms'}
            </div>
          </div>
        </div>

        {/* Per-category breakdown. Categories with offending items are clickable
            → select + frame them so the user can jump straight to the fix. */}
        <div className="clr-list">
          {score.categories.map((cat) => {
            const fill = cat.score >= 80 ? 'var(--accent)' : 'var(--danger)'
            const clickable = cat.offenders.length > 0
            const body = (
              <>
                <div
                  className="ci-head"
                  style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <span className="ci-title">{cat.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {cat.score}
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    borderRadius: 3,
                    margin: '5px 0',
                    background: 'var(--surface-2)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: `${cat.score}%`, height: '100%', background: fill }} />
                </div>
                <div className="ci-detail">
                  {cat.issues.map((iss, i) => (
                    <div
                      key={`${cat.id}-${i}`}
                      style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'flex-start' }}
                    >
                      <span aria-hidden className={severityClass(iss.severity)} />
                      <span style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-2)' }}>
                        {iss.message}
                      </span>
                    </div>
                  ))}
                  {clickable && (
                    <div style={{ fontSize: 'var(--t-2xs)', color: 'var(--accent)', marginTop: 4 }}>
                      → Select {cat.offenders.length} affected{' '}
                      {cat.offenders.length === 1 ? 'item' : 'items'}
                    </div>
                  )}
                </div>
              </>
            )
            return clickable ? (
              <button
                type="button"
                key={cat.id}
                className="clr-item"
                style={{ borderLeftColor: fill, cursor: 'pointer' }}
                title={`Select the ${cat.offenders.length} affected ${cat.offenders.length === 1 ? 'item' : 'items'}`}
                onClick={() => selectOffenders(cat.offenders)}
              >
                {body}
              </button>
            ) : (
              <div key={cat.id} className="clr-item" style={{ borderLeftColor: fill }}>
                {body}
              </div>
            )
          })}
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginTop: 'var(--s-3)' }}>
            <div className="panel-sub" style={{ marginBottom: 4 }}>
              Suggestions
            </div>
            {suggestions.slice(0, 6).map((sg, i) => (
              <div
                key={`${sg.roomId}-${i}`}
                className="ci-detail"
                style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-2)', marginTop: 2 }}
              >
                💡 <strong>{sg.roomName}</strong> — {sg.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
