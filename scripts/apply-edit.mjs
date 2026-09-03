#!/usr/bin/env node
/**
 * Asserted source edits — a scripted `str.replace` that CANNOT silently no-op.
 *
 * ## Why this exists
 *
 * A scripted edit that matches nothing returns the original string without
 * complaint, every downstream step still succeeds, and the result looks
 * explicable. That has gone wrong four separate times in this repo:
 *
 *  - **v0.31.5.405** — an arm-swap in a measurement never landed (biome had
 *    reformatted the call across seven lines). Both "arms" were the same code,
 *    so they agreed, and a real fix was published as unprovable. The retraction
 *    cost two commits.
 *  - **v0.31.5.392** — a test repair matched nothing after biome reformatted the
 *    block. The tell was a byte-identical failure, including a stale error.
 *  - **v0.31.5.403** — a sweep pattern anchored on the wrong thing reported a
 *    layer "clean"; five real bugs were sitting in it.
 *  - **v0.31.5.413** — a rename of a colliding local did nothing; `tsc` caught
 *    the redeclaration, but only by luck of it being a type error.
 *
 * The rule "assert the edit changed something" was written down after the first
 * and ignored three more times. A rule in a document is a prohibition; this is
 * the structure. Reach for it instead of an inline `replace`.
 *
 * ## Usage
 *
 *   echo '{"file":"src/x.ts","edits":[{"old":"a","new":"b"}]}' \
 *     | node scripts/apply-edit.mjs
 *
 * Each edit takes `old`, `new`, and an optional `count` (default 1) — the exact
 * number of occurrences expected. Every edit is checked BEFORE anything is
 * written, so a mismatch leaves the file untouched rather than half-applied.
 * `--dry` reports without writing.
 *
 * Exit codes: 0 applied (or dry-run OK), 1 a count mismatch, 2 bad input.
 */

import { readFileSync, writeFileSync } from 'node:fs'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const dry = process.argv.includes('--dry')
let spec
try {
  spec = JSON.parse(readStdin())
} catch (err) {
  console.error(`apply-edit: could not parse stdin as JSON — ${err.message}`)
  process.exit(2)
}

if (!spec || typeof spec.file !== 'string' || !Array.isArray(spec.edits)) {
  console.error('apply-edit: expected {"file": string, "edits": [{old, new, count?}]}')
  process.exit(2)
}

let source
try {
  source = readFileSync(spec.file, 'utf8')
} catch (err) {
  console.error(`apply-edit: cannot read ${spec.file} — ${err.message}`)
  process.exit(2)
}

// Verify EVERY edit first. A file left half-edited is worse than one untouched:
// the compiler may still accept it, and the diff looks intentional.
const problems = []
let cursor = source
const applied = []
for (const [i, edit] of spec.edits.entries()) {
  if (typeof edit?.old !== 'string' || typeof edit?.new !== 'string') {
    problems.push(`edit[${i}]: needs string \`old\` and \`new\``)
    continue
  }
  const want = edit.count ?? 1
  const found = cursor.split(edit.old).length - 1
  if (found !== want) {
    const preview = edit.old.split('\n')[0].slice(0, 70)
    problems.push(`edit[${i}]: expected ${want} occurrence(s) of "${preview}…", found ${found}`)
    continue
  }
  cursor = cursor.split(edit.old).join(edit.new)
  applied.push({ index: i, count: found })
}

if (problems.length > 0) {
  console.error(`apply-edit: ${spec.file} NOT modified — ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}

if (cursor === source) {
  console.error(`apply-edit: ${spec.file} unchanged after ${spec.edits.length} edit(s) — refusing`)
  process.exit(1)
}

if (!dry) writeFileSync(spec.file, cursor)
console.log(
  `apply-edit: ${dry ? 'would apply' : 'applied'} ${applied.length} edit(s) to ${spec.file} ` +
    `(${applied.map((a) => `#${a.index}×${a.count}`).join(', ')})`,
)
