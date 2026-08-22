import { type ReactNode, useState } from 'react'
import { Icon } from '../toolbar/icons'

interface Props {
  title: string
  /** Open on first mount. Callers pass `false` in Simple mode to start collapsed. */
  defaultOpen?: boolean
  /** Optional control rendered at the right of the header (e.g. a Reset button).
   *  Its own click is stopped from toggling the section. */
  headerRight?: ReactNode
  /** Extra style for the outer `<section>`. */
  style?: React.CSSProperties
  children: ReactNode
}

/**
 * A collapsible inspector section: a clickable header (chevron + title) that
 * shows/hides its body. Keeps the panel calm — Simple mode passes
 * `defaultOpen={false}` so multi-field sections (Properties, Transform, …) start
 * collapsed and the user expands what they need.
 */
export function InspectorSection({
  title,
  defaultOpen = true,
  headerRight,
  style,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="sec" style={style}>
      <div className="sec-h insp-sec-h">
        <button
          type="button"
          className="insp-sec-toggle btn-plain"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {/* Base glyph points DOWN = expanded; collapsed rotates -90° to point
              RIGHT — the disclosure grammar the Layers/glbEditor panels use
              (UIUX-60: this was `open ? 90 : 0`, i.e. down when collapsed and
              LEFT when expanded — inverted against every other collapsible). */}
          <Icon.Chevron
            width={13}
            height={13}
            style={{
              flex: 'none',
              transition: 'transform .15s',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
          <span>{title}</span>
        </button>
        {headerRight}
      </div>
      {open ? children : null}
    </section>
  )
}
