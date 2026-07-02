import { describe, expect, it } from 'vitest'
import { submitLabel } from './UploadModelDialog'

describe('submitLabel', () => {
  it('names only non-zero counts — never "Import 0" or a "+ 0" tail', () => {
    // Nothing importable: bare verb, never "Import 0".
    expect(submitLabel(0, false, 0)).toBe('Import')
    // Groups only.
    expect(submitLabel(3562, false, 0)).toBe('Import 3562 model groups')
    // Loose only — the "+ N groups" term is dropped, not shown as "0 model groups".
    expect(submitLabel(0, false, 5281)).toBe('Import 5281')
    // Both present.
    expect(submitLabel(3, false, 5)).toBe('Import 3 model groups + 5')
  })

  it('singularises the group noun', () => {
    expect(submitLabel(1, false, 0)).toBe('Import 1 model group')
    expect(submitLabel(2, false, 0)).toBe('Import 2 model groups')
  })

  it('keeps the single-file rename path labelled "Save"', () => {
    expect(submitLabel(0, true, 1)).toBe('Save')
  })
})
