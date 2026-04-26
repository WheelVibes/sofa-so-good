import { SerializedStateZ, type SerializedState } from '../schema';
import { StorageError, type StorageAdapter } from './StorageAdapter';
import { migrate } from './migrations';

const PREFIX = 'sofa-so-good';
const INDEX_KEY = `${PREFIX}:save-index`;
export const AUTOSAVE_SLOT = 'autosave';
const MAX_NAMED_SLOTS = 10;

interface IndexEntry {
  slot: string;
  savedAt: string;
}

function slotKey(slot: string): string {
  return `${PREFIX}:save:${slot}`;
}

function readIndex(): IndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is IndexEntry =>
        typeof e === 'object' && typeof e.slot === 'string' && typeof e.savedAt === 'string',
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: IndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

/** Pure helper: apply 10-slot eviction, oldest-first, ignoring the
 *  AUTOSAVE_SLOT. Returns the new index and the slot id evicted (if any). */
export function evictOldest(
  entries: IndexEntry[],
): { entries: IndexEntry[]; evicted: string | null } {
  const named = entries.filter((e) => e.slot !== AUTOSAVE_SLOT);
  if (named.length <= MAX_NAMED_SLOTS) return { entries, evicted: null };
  // Sort ascending by savedAt — oldest first.
  named.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const evicted = named[0]!.slot;
  return {
    entries: entries.filter((e) => e.slot !== evicted),
    evicted,
  };
}

export const LocalStorageAdapter: StorageAdapter = {
  async save(slot, state) {
    const payload = JSON.stringify(state);
    try {
      localStorage.setItem(slotKey(slot), payload);
    } catch (e) {
      // Browsers throw QuotaExceededError; surface as a typed StorageError.
      throw new StorageError('quota', (e as Error).message);
    }
    if (slot === AUTOSAVE_SLOT) return;
    const entries = readIndex().filter((e) => e.slot !== slot);
    entries.push({ slot, savedAt: state.savedAt });
    const { entries: kept, evicted } = evictOldest(entries);
    if (evicted) localStorage.removeItem(slotKey(evicted));
    writeIndex(kept);
  },

  async load(slot) {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StorageError('corrupt', `Slot '${slot}' did not parse as JSON.`);
    }
    let migrated: unknown;
    try {
      migrated = migrate(parsed);
    } catch (e) {
      throw new StorageError('version', (e as Error).message);
    }
    const result = SerializedStateZ.safeParse(migrated);
    if (!result.success) {
      throw new StorageError('corrupt', result.error.message);
    }
    return result.data as SerializedState;
  },

  async list() {
    return readIndex().map((e) => ({ slot: e.slot, savedAt: e.savedAt }));
  },

  async delete(slot) {
    localStorage.removeItem(slotKey(slot));
    const entries = readIndex().filter((e) => e.slot !== slot);
    writeIndex(entries);
  },
};
