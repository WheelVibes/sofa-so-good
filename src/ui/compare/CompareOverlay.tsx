import type { ReactNode } from 'react'

/**
 * The A/B split-reveal overlay every compare modal draws on top of its image
 * pair: a vertical divider at the split position, a ⇄ knob on it, and a label
 * chip in each top corner (UIUX-76).
 *
 * Four modals — Render compare, Version compare, Time compare and the staging
 * reveal — had each copy-pasted this block, and the copies had drifted: three
 * different knob font sizes, a literal `rgba(0,0,0,0.45)` + `#fff` chip beside a
 * correctly tokenised `var(--accent)` sibling in the SAME component, and the
 * accent chip on the left in three of them but the right in the fourth. One
 * component and one `.cmp-*` class vocabulary settles all of it: `a` is always
 * the left/baseline side (neutral chip) and `b` always the right/subject side
 * (accent chip), so a user who opens two of these modals sees the same grammar.
 *
 * Purely decorative — the whole overlay is `pointer-events: none` and the knob
 * is `aria-hidden`; the divider is driven by the caller's own drag handling, and
 * the labels are the only content a screen reader needs.
 */
export function CompareOverlay({
  dividerPct,
  labelA,
  labelB,
}: {
  /** CSS length for the split position, e.g. `'42.0%'`. */
  dividerPct: string
  /** Left / baseline side ("Before", "Current", "A · …"). */
  labelA: ReactNode
  /** Right / subject side ("After", the saved slot, "B · …"). */
  labelB: ReactNode
}) {
  return (
    <>
      <div className="cmp-divider" style={{ left: dividerPct }} aria-hidden />
      <div className="cmp-handle" style={{ left: dividerPct }} aria-hidden>
        ⇄
      </div>
      <div className="cmp-tag a">{labelA}</div>
      <div className="cmp-tag b">{labelB}</div>
    </>
  )
}
