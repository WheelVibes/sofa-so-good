/**
 * Tests for the asserted-edit tool. It exists to stop a silent no-op, so its
 * OWN failure modes have to be pinned — a guard that silently passes is worse
 * than no guard.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'apply-edit-'))

/** Run the tool, returning { code, out, err } without throwing. */
function run(spec, args = []) {
  try {
    const out = execFileSync('node', ['scripts/apply-edit.mjs', ...args], {
      input: JSON.stringify(spec),
      encoding: 'utf8',
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    return { code: e.status ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' }
  }
}

function fixture(name, content) {
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('apply-edit', () => {
  it('applies a matching edit', () => {
    const f = fixture('a.txt', 'alpha gamma')
    const r = run({ file: f, edits: [{ old: 'alpha', new: 'beta' }] })
    expect(r.code).toBe(0)
    expect(readFileSync(f, 'utf8')).toBe('beta gamma')
  })

  it('REFUSES when the pattern is absent, and leaves the file untouched', () => {
    // The whole point: the .304 arm-swap that matched nothing.
    const f = fixture('b.txt', 'alpha')
    const r = run({ file: f, edits: [{ old: 'nope', new: 'x' }] })
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/found 0/)
    expect(readFileSync(f, 'utf8')).toBe('alpha')
  })

  it('REFUSES on a count mismatch', () => {
    const f = fixture('c.txt', 'x x')
    const r = run({ file: f, edits: [{ old: 'x', new: 'y', count: 1 }] })
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/found 2/)
    expect(readFileSync(f, 'utf8')).toBe('x x')
  })

  it('accepts an explicit count when it matches', () => {
    const f = fixture('d.txt', 'x x')
    expect(run({ file: f, edits: [{ old: 'x', new: 'y', count: 2 }] }).code).toBe(0)
    expect(readFileSync(f, 'utf8')).toBe('y y')
  })

  it('applies NOTHING when one edit in a batch fails', () => {
    // A half-applied file is worse than an untouched one: the compiler may
    // still accept it and the diff looks intentional.
    const f = fixture('e.txt', 'one two')
    const r = run({
      file: f,
      edits: [
        { old: 'one', new: '1' },
        { old: 'absent', new: 'x' },
      ],
    })
    expect(r.code).toBe(1)
    expect(readFileSync(f, 'utf8')).toBe('one two')
  })

  it('refuses a no-op replacement (old === new)', () => {
    const f = fixture('f.txt', 'same')
    expect(run({ file: f, edits: [{ old: 'same', new: 'same' }] }).code).toBe(1)
  })

  it('--dry reports without writing', () => {
    const f = fixture('g.txt', 'alpha')
    const r = run({ file: f, edits: [{ old: 'alpha', new: 'beta' }] }, ['--dry'])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/would apply/)
    expect(readFileSync(f, 'utf8')).toBe('alpha')
  })

  it('exits 2 on bad input rather than guessing', () => {
    expect(run({ nonsense: true }).code).toBe(2)
    const f = join(dir, 'missing.txt')
    expect(run({ file: f, edits: [{ old: 'a', new: 'b' }] }).code).toBe(2)
  })
})
