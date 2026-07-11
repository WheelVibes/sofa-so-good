import { useRef } from 'react'

export interface SegmentedOption {
  value: string
  /** Short visible label — every state is visible at once (TB-8). */
  label: string
  /** Optional fuller tooltip when the visible label is abbreviated. */
  title?: string
  disabled?: boolean
}

/**
 * Segmented control on the `.seg` token vocabulary — the replacement for a
 * cycle-button once a control has 3+ states (TB-8): every state is visible and
 * directly tappable, so no "click to cycle"/next-state tooltips are needed.
 *
 * Radiogroup semantics with a roving tabindex: Tab enters/leaves the group as
 * one stop; Arrow keys (and Home/End) move AND select, matching the native
 * radio-group pattern.
 */
export function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
  accent,
  fit,
  className,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: SegmentedOption[]
  /** Accessible name for the group. */
  ariaLabel: string
  /** Accent-filled selected segment (`.seg.accent`). */
  accent?: boolean
  /** Compact segments that ellipsise (`.seg.fit`) — for many/narrow options. */
  fit?: boolean
  className?: string
  disabled?: boolean
}) {
  const groupRef = useRef<HTMLDivElement>(null)
  const selectedIdx = options.findIndex((o) => o.value === value)

  const step = (from: number, dir: 1 | -1): number => {
    let i = from
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i]?.disabled) return i
    }
    return from
  }

  const commit = (i: number) => {
    const opt = options[i]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    groupRef.current?.querySelectorAll('button')[i]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    const cur = selectedIdx >= 0 ? selectedIdx : 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit(step(cur, 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      commit(step(cur, -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      commit(options.findIndex((o) => !o.disabled))
    } else if (e.key === 'End') {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          commit(i)
          break
        }
      }
    }
  }

  const cls = `seg${accent ? ' accent' : ''}${fit ? ' fit' : ''}${className ? ` ${className}` : ''}`
  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cls}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          // biome-ignore lint/a11y/useSemanticElements: styled segmented control — buttons as radios is the standard pattern.
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.title}
            disabled={disabled || o.disabled}
            // Roving tabindex: the group is ONE tab stop (the selected segment,
            // or the first when the value matches no option).
            tabIndex={selected || (selectedIdx === -1 && i === 0) ? 0 : -1}
            className={selected ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
