/**
 * Schema migration registry.
 *
 * v1 is the only current version. When a future version lands, register
 * its predecessor's migration here:
 *
 *   MIGRATIONS[1] = (raw) => ({ ...raw, version: 2, newField: defaultValue });
 *
 * Loaders walk the chain until raw.version === CURRENT_VERSION. Unknown
 * future versions throw a typed error.
 */

export const CURRENT_VERSION = 2;

type Migration = (raw: unknown) => unknown;

export const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: introduced the optional FurnitureItem.groupId. Absent groupId is
  // already valid (a group is emergent from shared ids), so this is a no-op on
  // items — the bump exists so older readers reject v2 and the registry records
  // the field's introduction.
  1: (raw) => {
    const r = raw as Record<string, unknown>;
    return { ...r, version: 2 };
  },
};

export class VersionMismatchError extends Error {
  constructor(public version: number) {
    super(`Save is from a newer version (${version}); cannot load.`);
    this.name = 'VersionMismatchError';
  }
}

export function migrate(raw: unknown): unknown {
  let cur = raw as { version?: unknown };
  while (
    typeof cur === 'object' &&
    cur !== null &&
    typeof cur.version === 'number' &&
    cur.version < CURRENT_VERSION
  ) {
    const m = MIGRATIONS[cur.version];
    if (!m) throw new VersionMismatchError(cur.version);
    cur = m(cur) as { version?: unknown };
  }
  if (
    typeof cur === 'object' &&
    cur !== null &&
    typeof cur.version === 'number' &&
    cur.version > CURRENT_VERSION
  ) {
    throw new VersionMismatchError(cur.version);
  }
  return cur;
}
