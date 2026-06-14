import { useId, useMemo, useState } from 'react'
import { fuzzySearch } from './catalog/fuzzySearch'

export interface ComboRow {
  /** Text shown in the row. */
  label: string
  /** Value committed when the row is chosen. */
  value: string
  /** True for the synthesized "Add custom" row. */
  custom?: boolean
}

/**
 * Build the dropdown rows for a fuzzy combo: existing `options` ranked by fuzzy
 * relevance to `query` (capped at `limit`), with an "Add …" custom row appended
 * **last** whenever the trimmed query is non-empty and isn't already an exact
 * existing option. Pure — unit-tested.
 */
export function comboRows(query: string, options: string[], limit = 8): ComboRow[] {
  const trimmed = query.trim()
  const matches = fuzzySearch(query, options, (o) => [o]).slice(0, limit)
  const exact = options.some((o) => o.toLowerCase() === trimmed.toLowerCase())
  const rows: ComboRow[] = matches.map((m) => ({ label: m, value: m }))
  if (trimmed.length > 0 && !exact)
    rows.push({ label: `Add “${trimmed}”`, value: trimmed, custom: true })
  return rows
}

/**
 * Free-text input with a fuzzy-search dropdown over existing `options`. As the
 * user types, matching values are ranked best-first; an "Add …" row is always
 * the last option so a brand-new value can be committed. Arrow keys move the
 * highlight, Enter commits it, Escape closes. Keeps the field free-text — the
 * dropdown is purely an affordance.
 */
export function FuzzyCombo({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const rows = useMemo(() => comboRows(value, options), [value, options])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && rows[active]) {
        e.preventDefault()
        choose(rows[active].value)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation()
        setOpen(false)
      }
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        role="combobox"
        autoComplete="off"
      />
      {open && rows.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="panel"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            marginTop: 2,
            maxHeight: 200,
            overflowY: 'auto',
            padding: 2,
          }}
        >
          {rows.map((r, i) => (
            <button
              key={`${r.custom ? 'custom:' : ''}${r.value}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className="menu-item"
              style={{
                width: '100%',
                textAlign: 'left',
                ...(i === active ? { background: 'var(--surface-3)' } : {}),
                ...(r.custom ? { color: 'var(--accent)' } : {}),
              }}
              // Commit before the input's blur fires.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(r.value)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
