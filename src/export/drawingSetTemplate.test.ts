import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWING_SET_TEMPLATE,
  drawingSetRevisionRows,
  isNonDefaultDrawingSetTemplate,
  issueRevision,
  mergeDrawingSetTemplate,
  nextRevisionLetter,
} from './drawingSetTemplate'

describe('drawingSetRevisionRows', () => {
  it('prints exactly one row for a default template (unchanged behaviour)', () => {
    const rows = drawingSetRevisionRows(DEFAULT_DRAWING_SET_TEMPLATE, '2 September 2026')
    expect(rows).toEqual([{ letter: 'A', date: '2 September 2026', note: 'Initial issue' }])
  })

  it('prints the history oldest-first, with the current issue last', () => {
    const rows = drawingSetRevisionRows(
      {
        ...DEFAULT_DRAWING_SET_TEMPLATE,
        revisions: [
          { letter: 'A', date: '1 June 2026', note: 'Initial issue' },
          { letter: 'B', date: '3 July 2026', note: 'Issued for tender' },
        ],
        revision: 'C',
        revisionNote: 'Kitchen revised',
      },
      '2 September 2026',
    )
    expect(rows.map((r) => r.letter)).toEqual(['A', 'B', 'C'])
    expect(rows[0]!.date).toBe('1 June 2026')
    expect(rows[2]!).toEqual({ letter: 'C', date: '2 September 2026', note: 'Kitchen revised' })
  })

  it('drops a history entry that duplicates the current letter', () => {
    // Re-issuing the same letter is a user error; printing it twice would make
    // the table contradict itself about which issue is current.
    const rows = drawingSetRevisionRows(
      {
        ...DEFAULT_DRAWING_SET_TEMPLATE,
        revisions: [{ letter: 'A', date: '1 June 2026', note: 'Initial issue' }],
        revision: 'A',
      },
      '2 September 2026',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.date).toBe('2 September 2026')
  })

  it('skips a blank history letter and defaults a blank history note', () => {
    const rows = drawingSetRevisionRows(
      {
        ...DEFAULT_DRAWING_SET_TEMPLATE,
        revisions: [
          { letter: '  ', date: 'x', note: 'ignored' },
          { letter: 'B', date: '3 July 2026', note: '   ' },
        ],
        revision: 'C',
      },
      '2 September 2026',
    )
    expect(rows.map((r) => r.letter)).toEqual(['B', 'C'])
    expect(rows[0]!.note).toBe('Issued')
  })

  it('falls back to A / Initial issue for a blank current revision', () => {
    const rows = drawingSetRevisionRows(
      { ...DEFAULT_DRAWING_SET_TEMPLATE, revision: '  ', revisionNote: '  ' },
      '2 September 2026',
    )
    expect(rows[0]!).toEqual({ letter: 'A', date: '2 September 2026', note: 'Initial issue' })
  })
})

describe('isNonDefaultDrawingSetTemplate', () => {
  it('is false for the untouched default', () => {
    expect(isNonDefaultDrawingSetTemplate(DEFAULT_DRAWING_SET_TEMPLATE)).toBe(false)
  })

  it('treats a stored revision history as non-default, so it persists', () => {
    expect(
      isNonDefaultDrawingSetTemplate({
        ...DEFAULT_DRAWING_SET_TEMPLATE,
        revisions: [{ letter: 'A', date: '1 June 2026', note: 'Initial issue' }],
      }),
    ).toBe(true)
  })

  it('still treats an empty history as default (nothing to persist)', () => {
    expect(isNonDefaultDrawingSetTemplate({ ...DEFAULT_DRAWING_SET_TEMPLATE, revisions: [] })).toBe(
      false,
    )
  })
})

describe('mergeDrawingSetTemplate', () => {
  it('leaves revisions absent when the serialised template has none', () => {
    expect(mergeDrawingSetTemplate({ client: 'Acme' }).revisions).toBeUndefined()
  })

  it('carries a serialised history through', () => {
    const merged = mergeDrawingSetTemplate({
      revisions: [{ letter: 'A', date: '1 June 2026', note: 'Initial issue' }],
    })
    expect(merged.revisions).toHaveLength(1)
  })
})

describe('nextRevisionLetter', () => {
  it('advances through the alphabet', () => {
    expect(nextRevisionLetter('A')).toBe('B')
    expect(nextRevisionLetter('C')).toBe('D')
  })

  it('carries Z to AA and AZ to BA', () => {
    expect(nextRevisionLetter('Z')).toBe('AA')
    expect(nextRevisionLetter('AZ')).toBe('BA')
    expect(nextRevisionLetter('ZZ')).toBe('AAA')
  })

  it('normalises case and starts blank/garbage at A', () => {
    expect(nextRevisionLetter('a')).toBe('B')
    expect(nextRevisionLetter('')).toBe('A')
    expect(nextRevisionLetter('  ')).toBe('A')
    expect(nextRevisionLetter('3')).toBe('A')
    expect(nextRevisionLetter('A1')).toBe('A')
  })
})

describe('issueRevision', () => {
  it('files the current revision and advances the letter', () => {
    const next = issueRevision(
      { ...DEFAULT_DRAWING_SET_TEMPLATE, revision: 'A', revisionNote: 'Issued for tender' },
      '2 September 2026',
    )
    expect(next.revisions).toEqual([
      { letter: 'A', date: '2 September 2026', note: 'Issued for tender' },
    ])
    expect(next.revision).toBe('B')
    expect(next.revisionNote).toBe('')
  })

  it('appends rather than replacing, so the trail accumulates', () => {
    const a = issueRevision(DEFAULT_DRAWING_SET_TEMPLATE, '1 June 2026')
    const b = issueRevision({ ...a, revisionNote: 'Kitchen revised' }, '3 July 2026')
    expect(b.revisions?.map((r) => r.letter)).toEqual(['A', 'B'])
    expect(b.revision).toBe('C')
  })

  it('defaults a blank note to Initial issue when filing', () => {
    const next = issueRevision({ ...DEFAULT_DRAWING_SET_TEMPLATE, revisionNote: '' }, '1 June 2026')
    expect(next.revisions?.[0]?.note).toBe('Initial issue')
  })

  it('renders every filed issue plus the new current row', () => {
    const a = issueRevision(DEFAULT_DRAWING_SET_TEMPLATE, '1 June 2026')
    const rows = drawingSetRevisionRows(a, '2 September 2026')
    expect(rows.map((r) => r.letter)).toEqual(['A', 'B'])
  })
})
