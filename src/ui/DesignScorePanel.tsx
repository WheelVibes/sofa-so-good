import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildDesignScore, type Grade, type IssueSeverity } from '../analysis/designScore'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { isDefaultPlan, planCollisionWalls } from '../floorplan/planGeometry'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/** Maps a letter grade to a token colour for the dial + grade chip. */
function gradeColor(grade: Grade): string {
  if (grade === 'A' || grade === 'B') return 'var(--ok, var(--accent))'
  if (grade === 'C') return 'var(--accent)'
  return 'var(--err, #d9534f)'
}

/** Per-issue dot colour by severity. */
function severityColor(sev: IssueSeverity): string {
  if (sev === 'critical') return 'var(--err, #d9534f)'
  if (sev === 'warning') return 'var(--warn, var(--accent))'
  return 'var(--text-3)'
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

  const score = useMemo(() => {
    if (!open) return null
    const merged = buildMergedCatalog(catalogInputs)
    const walls = isDefaultPlan(plan) ? buildCollisionWalls(doors) : planCollisionWalls(plan, doors)
    return buildDesignScore(items, merged, plan, { walls })
  }, [open, items, plan, doors, catalogInputs])

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

  const dialColor = gradeColor(score.grade)

  return (
    <aside className="panel mini aux" id="designScorePanel" style={{ width: 360 }}>
      <div className="panel-head">
        <div>
          <div className="panel-title">Design score</div>
          <div className="panel-sub">Clearance · furnishing · flow · daylight · lighting</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <Icon.Close width={16} height={16} />
        </button>
      </div>
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
          <div
            role="img"
            aria-label={`Overall score ${score.overall} out of 100, grade ${score.grade}`}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
              background: `conic-gradient(${dialColor} ${score.overall * 3.6}deg, var(--surface-2, rgba(127,127,127,0.18)) 0deg)`,
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'var(--panel-bg, var(--surface-1))',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 'var(--t-lg)',
                color: dialColor,
              }}
            >
              {score.grade}
            </div>
          </div>
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
            const fill = cat.score >= 80 ? 'var(--accent)' : 'var(--err, #d9534f)'
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
                    background: 'var(--surface-2, rgba(127,127,127,0.18))',
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
                      <span
                        aria-hidden
                        style={{
                          flex: '0 0 auto',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          marginTop: 6,
                          background: severityColor(iss.severity),
                        }}
                      />
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
      </div>
    </aside>
  )
}
