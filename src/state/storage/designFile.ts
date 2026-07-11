/**
 * Export / import a design as a downloadable `.sofa.json` file.
 *
 * localStorage save slots are device- and browser-bound; a file export lets a
 * user back up a design, move it between devices/browsers, or share it. The file
 * is the exact same serialized shape the save slots use, so it round-trips
 * through `migrate` + `SerializedStateZ` validation on import — a hand-edited or
 * older file is migrated and validated, never blindly trusted.
 */
import { type SerializedState, SerializedStateZ, serialize } from '../schema'
import type { RootState } from '../store'
import { migrate } from './migrations'

const DESIGN_FILE_EXT = '.sofa.json'

/** Hard cap on an imported design file. Designs are JSON — even thousands of
 *  items with user/IKEA defs serialize to a few MB — so 50 MB is generously
 *  above any real design while still refusing a pathological/oversized file
 *  before we read it into memory (a cheap DoS guard). */
export const MAX_DESIGN_FILE_BYTES = 50 * 1024 * 1024

/** Serialize the current state and trigger a browser download. */
export function exportDesignToFile(state: RootState, name = 'my-design'): void {
  const payload = serialize(state)
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const safe =
    name
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'my-design'
  const a = document.createElement('a')
  a.href = url
  a.download = safe.endsWith(DESIGN_FILE_EXT) ? safe : `${safe}${DESIGN_FILE_EXT}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click has dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export class DesignFileError extends Error {}

/**
 * Read + validate a design file. Throws {@link DesignFileError} with a
 * user-facing message on malformed JSON, an unsupported version, or a schema
 * mismatch. Returns the validated, migrated {@link SerializedState}.
 */
export async function importDesignFromFile(file: File): Promise<SerializedState> {
  if (file.size > MAX_DESIGN_FILE_BYTES) {
    throw new DesignFileError(
      `That file is too large (limit ${Math.round(MAX_DESIGN_FILE_BYTES / (1024 * 1024))} MB) — is it a Sofa design export?`,
    )
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new DesignFileError("Couldn't read that file.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DesignFileError('That file is not valid JSON — is it a Sofa design export?')
  }
  let migrated: unknown
  try {
    migrated = migrate(parsed)
  } catch (e) {
    throw new DesignFileError(`Unsupported design version: ${(e as Error).message}`)
  }
  const result = SerializedStateZ.safeParse(migrated)
  if (!result.success) {
    throw new DesignFileError("This doesn't look like a Sofa design file.")
  }
  return result.data as SerializedState
}
