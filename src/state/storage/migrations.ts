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

export const CURRENT_VERSION = 1;

type Migration = (raw: unknown) => unknown;

export const MIGRATIONS: Record<number, Migration> = {
  // Empty in v1 — nothing to migrate from yet.
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
