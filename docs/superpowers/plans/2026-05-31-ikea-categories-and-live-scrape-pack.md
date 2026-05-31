# IKEA-comprehensive categories + one-click live-scrape pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow furniture categories to mirror IKEA's departments (+ an `others` catch-all, always auto-detected), and make the IKEA pack a one-click live scrape driven by a local Node sidecar that scrapes + per-product-optimizes + serves assets the browser registers as `IkeaGltfDef`s.

**Architecture:** Part A extends one TS enum + its exhaustive consumers and the Python categorizer. Part B adds a standalone Node sidecar (`npm run scraper-server`) that spawns the existing Python scraper (new `--out`/`--progress-ndjson` flags), runs the existing LOD optimizer per finish-GLB as it lands via a bounded concurrency pool, writes to Vite-served `public/assets/ikea/`, and streams per-product SSE progress; the browser drives it from a new pack card and registers each finished group via the existing `importGroup()`.

**Tech Stack:** TypeScript, React, Vite, Zustand, Vitest; Node `http`/`child_process`/`fs` (sidecar); Python 3 + Playwright (scraper); `@gltf-transform` + `sharp` (optimizer, already wired).

**Spec:** `docs/superpowers/specs/2026-05-31-ikea-categories-and-live-scrape-pack-design.md`

---

## File Structure

**Part A (categories):**
- Modify `src/furniture/types.ts` — `FurnitureCategory` union + `FURNITURE_CATEGORIES`.
- Modify `src/furniture/categories.test.ts` — assert 15-member set + `others` last.
- Modify `src/ui/catalog/CategoryTabs.tsx` — `LABELS`.
- Modify `src/ui/catalog/CategoryIcon.tsx` — four new glyphs.
- Modify `src/furniture/furniturePrices.ts` — `CATEGORY_BASE`.
- Modify `src/ui/BudgetPanel.tsx` — `CATEGORY_LABEL`.
- Modify `src/ui/report.ts` — `CAT_LABEL`.
- Modify `src/layout/autoArrange.ts` — `roleForCategory` cases.
- Modify `src/ui/Minimap.tsx` — `DOT` colours (optional-but-included).
- Modify `src/furniture/ikea/translate.ts` — `mapCategory` fallback → `others`.
- Modify `src/furniture/ikea/translate.test.ts` — fallback test.
- Modify `python/scripts/categorize.py` — three rules + semantics + fallback.

**Part B (live-scrape pack):**
- Modify `python/scripts/ikea_model_scraper.py` — `--out`, `--progress-ndjson`.
- Create `scripts/scraper-server.mjs` — sidecar HTTP server (thin entry).
- Create `scripts/scraper/progress.mjs` — pure NDJSON→event parser.
- Create `scripts/scraper/optimizePool.mjs` — pure bounded-concurrency pool.
- Create `scripts/scraper/progress.test.mjs` — Vitest unit test (pure).
- Create `scripts/scraper/optimizePool.test.mjs` — Vitest unit test (pure).
- Create `src/catalog/packs/ikeaLive.ts` — browser client (status/scrape/SSE/register).
- Create `src/catalog/packs/ikeaLive.test.ts` — event→registration wiring (pure parts).
- Modify `src/catalog/packs/types.ts` — `Pack.kind` discriminator.
- Modify `src/catalog/packs/registry.ts` — IKEA-live pack entry.
- Modify `src/ui/catalog/PacksTab.tsx` — live-scrape card + progress UI.
- Modify `package.json` — `scraper-server` script.
- Modify `vite.config.ts` — `/ikea` dev proxy.
- Modify `.gitignore` — `public/assets/ikea/`.
- Modify `CLAUDE.md` + `README.md` — categories, sidecar command, live pack.

---

## PHASE A — Comprehensive categories

### Task A1: Extend the category enum + its test

**Files:**
- Modify: `src/furniture/types.ts:20-45`
- Modify: `src/furniture/categories.test.ts`

- [ ] **Step 1: Update the failing test first**

Replace the whole body of `src/furniture/categories.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { FURNITURE_CATEGORIES } from './types';

describe('FurnitureCategory', () => {
  it('includes the IKEA-department categories', () => {
    for (const c of [
      'beds', 'seating', 'tables', 'storage', 'kitchen', 'bathroom',
      'appliances', 'lighting', 'decor', 'textiles', 'outdoor',
      'electronics', 'kids', 'laundry', 'others',
    ] as const) {
      expect(FURNITURE_CATEGORIES).toContain(c);
    }
  });
  it('has 15 categories', () => {
    expect(FURNITURE_CATEGORIES).toHaveLength(15);
  });
  it('lists others last (catch-all sorts to the end)', () => {
    expect(FURNITURE_CATEGORIES[FURNITURE_CATEGORIES.length - 1]).toBe('others');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- categories`
Expected: FAIL — length is 11, missing members.

- [ ] **Step 3: Extend the union + array**

In `src/furniture/types.ts`, change the union (lines ~20-31) to add the four members before/at the end, and update the array (lines ~33-45). Final state:

```ts
export type FurnitureCategory =
  | 'beds'
  | 'seating'
  | 'tables'
  | 'storage'
  | 'kitchen'
  | 'bathroom'
  | 'appliances'
  | 'lighting'
  | 'decor'
  | 'textiles'
  | 'outdoor'
  | 'electronics'
  | 'kids'
  | 'laundry'
  | 'others';

export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'beds',
  'seating',
  'tables',
  'storage',
  'kitchen',
  'bathroom',
  'appliances',
  'lighting',
  'decor',
  'textiles',
  'outdoor',
  'electronics',
  'kids',
  'laundry',
  'others',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- categories`
Expected: PASS.

- [ ] **Step 5: Verify the type-check now flags exhaustive consumers**

Run: `npx tsc --noEmit`
Expected: errors in `furniturePrices.ts`, `BudgetPanel.tsx`, `report.ts` (and possibly `CategoryTabs.tsx`) for missing keys in `Record<FurnitureCategory,…>`. This is the checklist for A2–A5. (Do NOT commit yet — the tree doesn't type-check.)

---

### Task A2: Exhaustive records — prices, labels, report

**Files:**
- Modify: `src/furniture/furniturePrices.ts:10-22`
- Modify: `src/ui/BudgetPanel.tsx:7-19`
- Modify: `src/ui/report.ts:12-16`

- [ ] **Step 1: Add the four keys to `CATEGORY_BASE`**

In `src/furniture/furniturePrices.ts`, change the `CATEGORY_BASE` literal so it ends:

```ts
  textiles: 200,
  outdoor: 300,
  electronics: 120,
  kids: 80,
  laundry: 60,
  others: 100,
};
```

- [ ] **Step 2: Add the four keys to `CATEGORY_LABEL`**

In `src/ui/BudgetPanel.tsx`, change the `CATEGORY_LABEL` literal so it ends:

```ts
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
};
```

- [ ] **Step 3: Add the four keys to `CAT_LABEL`**

In `src/ui/report.ts`, replace the `CAT_LABEL` literal with:

```ts
const CAT_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds', seating: 'Seating', tables: 'Tables', storage: 'Storage',
  kitchen: 'Kitchen', bathroom: 'Bathroom', appliances: 'Appliances',
  lighting: 'Lighting', decor: 'Decor', textiles: 'Textiles', outdoor: 'Outdoor',
  electronics: 'Electronics', kids: 'Baby & Kids', laundry: 'Laundry', others: 'Others',
};
```

- [ ] **Step 4: Run the type-check**

Run: `npx tsc --noEmit`
Expected: the three records no longer error. `CategoryTabs.tsx` (`LABELS`) may still error — handled in A3.

---

### Task A3: Catalog UI — tabs + icons

**Files:**
- Modify: `src/ui/catalog/CategoryTabs.tsx:13-25`
- Modify: `src/ui/catalog/CategoryIcon.tsx:20-102`

- [ ] **Step 1: Add the four labels to `LABELS`**

In `src/ui/catalog/CategoryTabs.tsx`, change the `LABELS` literal so it ends:

```ts
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
};
```

- [ ] **Step 2: Add four glyph cases to `CategoryIcon`**

In `src/ui/catalog/CategoryIcon.tsx`, add these `case` blocks inside the `switch` (after the `outdoor` case, before the closing brace):

```tsx
    case 'electronics':
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="11" height="7.5" rx="0.75" />
          <path d="M6 13h4" />
          <path d="M8 11v2" />
        </svg>
      );
    case 'kids':
      return (
        <svg {...common}>
          <circle cx="8" cy="5" r="2.25" />
          <path d="M4 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        </svg>
      );
    case 'laundry':
      return (
        <svg {...common}>
          <rect x="3.5" y="2.75" width="9" height="10.5" rx="1" />
          <circle cx="8" cy="8.5" r="2.75" />
          <path d="M5.5 4.5h0.01M7.5 4.5h0.01" />
        </svg>
      );
    case 'others':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1" strokeDasharray="2 1.5" />
          <circle cx="6" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="10" cy="8" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
```

- [ ] **Step 3: Run the type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no remaining `FurnitureCategory` exhaustiveness errors). `CategoryIcon`'s switch has no `default` and returns `undefined` for an unlisted case, but all 15 are now covered.

---

### Task A4: autoArrange roles + minimap dots

**Files:**
- Modify: `src/layout/autoArrange.ts:111-126`
- Modify: `src/ui/Minimap.tsx:11-21`

- [ ] **Step 1: Add a role test**

Append to `src/layout/autoArrange.test.ts` (create the file only if it does not exist; if it exists, add the `describe` block). First check: `ls src/layout/autoArrange.test.ts`. If present, append:

```ts
import { roleForCategory } from './autoArrange';

describe('roleForCategory new categories', () => {
  it('maps the new IKEA-department categories to sensible roles', () => {
    expect(roleForCategory('electronics')).toBe('media');
    expect(roleForCategory('kids')).toBe('storage');
    expect(roleForCategory('laundry')).toBe('storage');
    expect(roleForCategory('others')).toBe('other');
  });
});
```

If the file does NOT exist, create `src/layout/autoArrange.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleForCategory } from './autoArrange';

describe('roleForCategory new categories', () => {
  it('maps the new IKEA-department categories to sensible roles', () => {
    expect(roleForCategory('electronics')).toBe('media');
    expect(roleForCategory('kids')).toBe('storage');
    expect(roleForCategory('laundry')).toBe('storage');
    expect(roleForCategory('others')).toBe('other');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- autoArrange`
Expected: FAIL — `electronics`/`kids`/`laundry` currently fall through to `'other'`.

- [ ] **Step 3: Add the cases to `roleForCategory`**

In `src/layout/autoArrange.ts`, edit the `switch` in `roleForCategory` to add cases before `default`:

```ts
    case 'seating':
      return 'seating';
    case 'textiles':
      return 'rug';
    case 'electronics':
      return 'media';
    case 'kids':
      return 'storage';
    case 'laundry':
      return 'storage';
    default:
      return 'other';
  }
```

(`'media'` and `'storage'` are existing `ArrangeRole` members; `others` falls to `default`.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- autoArrange`
Expected: PASS.

- [ ] **Step 5: Add minimap dot colours**

In `src/ui/Minimap.tsx`, extend the `DOT` literal (it is a `Partial<Record<…>>`, so this is additive) so it ends:

```ts
  textiles: '#f97316',
  outdoor: '#84cc16',
  electronics: '#0ea5e9',
  kids: '#d946ef',
  laundry: '#14b8a6',
};
```

(`others` intentionally left without a dot colour — falls back to the component's default dot rendering.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

### Task A5: IKEA import fallback → `others`

**Files:**
- Modify: `src/furniture/ikea/translate.ts:22-29`
- Modify: `src/furniture/ikea/translate.test.ts:13-15`

- [ ] **Step 1: Update the fallback test**

In `src/furniture/ikea/translate.test.ts`, replace the "falls back unknown to decor/low" test:

```ts
  it('falls back unknown to others/low', () => {
    expect(mapCategory('spaceships')).toEqual({ category: 'others', confidence: 'low' });
  });
  it('passes new IKEA-department categories through as high', () => {
    expect(mapCategory('electronics')).toEqual({ category: 'electronics', confidence: 'high' });
    expect(mapCategory('kids')).toEqual({ category: 'kids', confidence: 'high' });
    expect(mapCategory('laundry')).toEqual({ category: 'laundry', confidence: 'high' });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- translate`
Expected: FAIL — fallback still returns `decor`.

- [ ] **Step 3: Change the fallback**

In `src/furniture/ikea/translate.ts`, in `mapCategory`, change the final return:

```ts
  return { category: 'others', confidence: 'low' };
```

(The `FURNITURE_CATEGORIES.includes` pass-through already covers `electronics`/`kids`/`laundry` now that the enum lists them.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- translate`
Expected: PASS.

---

### Task A6: Python categorizer — rules + semantics + fallback

**Files:**
- Modify: `python/scripts/categorize.py:28-62,73`

- [ ] **Step 1: Add a categorizer check script**

Create `python/scripts/categorize_check.py`:

```python
"""Lightweight assertion check for categorize.py (no pytest dependency)."""
from categorize import categorize

def expect(bc, want_cat, want_conf="high"):
    cat, conf = categorize(bc)
    assert cat == want_cat, f"{bc!r} -> {cat} (wanted {want_cat})"
    assert conf == want_conf, f"{bc!r} conf {conf} (wanted {want_conf})"

expect(["Home electronics", "TVs", "Smart TVs"], "electronics")
expect(["Home electronics", "Speakers", "Soundbars"], "electronics")
expect(["Baby & children", "Children's furniture", "Cots"], "kids")
expect(["Baby & children", "High chairs"], "kids")
expect(["Laundry & cleaning", "Drying racks"], "laundry")
expect(["Some unknown department", "Mystery"], "others", "low")
# Regression: existing mappings unchanged.
expect(["Beds & mattresses", "Bed frames"], "beds")
expect(["Lighting", "Table lamps"], "lighting")
print("categorize_check OK")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd python/scripts && python categorize_check.py`
Expected: FAIL — `electronics`/`kids`/`laundry` not yet matched; unknown returns `decor`.

- [ ] **Step 3: Add rules + semantics + change fallback**

In `python/scripts/categorize.py`:

(a) Add three rules to `_CATEGORY_RULES`. Insert them **before** the `decor` rule (so e.g. "monitor" → electronics, not decor) and after `appliances` (so washing-machine stays appliances). Final ordering of the additions:

```python
    (r"\b(tv|television|monitor|speaker|soundbar|sound system|charger|"
     r"smart home|remote control|headphone|earphone|router|"
     r"air quality sensor)\b", "electronics"),
    (r"\b(baby|children|kids|junior|cot|crib|high chair|changing|nursery|"
     r"toy)\b", "kids"),
    (r"\b(laundry|drying rack|clothes airer|ironing|laundry basket|"
     r"laundry bag)\b", "laundry"),
```

Place these three immediately after the existing `appliances` rule and before the `bathroom` rule. (Order vs. textiles/decor: "toy" etc. won't collide; "laundry basket" must precede the textiles `towel`/`linen` rule, which it does by being higher.)

(b) Add semantics entries to `_CATEGORY_SEMANTICS`:

```python
    "electronics":{"placement": "surface", "back_to_wall": False, "front_clearance_m": 0.0},
    "kids":       {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.0},
    "laundry":    {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.0},
    "others":     {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
```

(c) Change the `categorize` fallback (last line of the function) from:

```python
    return "decor", "low"
```

to:

```python
    return "others", "low"
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd python/scripts && python categorize_check.py`
Expected: `categorize_check OK`.

- [ ] **Step 5: Commit Phase A**

```bash
git add src/furniture/types.ts src/furniture/categories.test.ts \
  src/furniture/furniturePrices.ts src/ui/BudgetPanel.tsx src/ui/report.ts \
  src/ui/catalog/CategoryTabs.tsx src/ui/catalog/CategoryIcon.tsx \
  src/layout/autoArrange.ts src/layout/autoArrange.test.ts src/ui/Minimap.tsx \
  src/furniture/ikea/translate.ts src/furniture/ikea/translate.test.ts \
  python/scripts/categorize.py python/scripts/categorize_check.py
git commit -m "feat(catalog): IKEA-comprehensive furniture categories + others catch-all"
```

---

### Task A7: Phase A visual verification (REQUIRED)

**Files:** none (verification only).

- [ ] **Step 1: Build + full test suite**

Run: `npm run build && npm test`
Expected: typecheck + Vite build succeed; all tests pass.

- [ ] **Step 2: Run the app + seed items in the new categories**

Run `npm run dev` (background). Then drive the store to add at least one item per new category so the tabs render (empty categories return `null` in `CategoryTabs`). Use the screenshot harness with an actions script that opens the catalog drawer; if no built-in items exist for `electronics`/`kids`/`laundry`/`others`, instead verify the tabs render by temporarily forcing `byCategory` is non-empty — simplest path: open the **catalog drawer**, and separately render `CategoryIcon` for the four new categories.

Concretely:

```bash
node scripts/shot.mjs /tmp/cat-tabs.png 1500 "" '[{"type":"click","selector":"[data-testid=\"toolbar-catalog\"]"}]'
```

(If the catalog toolbar button selector differs, inspect the DOM via the dev app first; the goal is a screenshot of `CategoryTabs` + `CategoryIcon`.)

- [ ] **Step 3: Visually review the screenshot(s)**

Open `/tmp/cat-tabs.png`. Confirm: existing tabs unchanged, and (where items exist) the new tabs render with readable labels and non-broken glyphs. Report in prose what the screenshots show — not just that they were captured. If a glyph looks wrong, fix it in `CategoryIcon.tsx` and re-shoot.

---

## PHASE B — Live-scrape IKEA pack

### Task B1: Scraper `--out` + `--progress-ndjson` flags

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py:1218-1268` (and the output-dir constant + per-variant write + per-page worker)

- [ ] **Step 1: Locate the output dir + write points**

Run: `grep -n "ikea_sg_3d_models\|def queue_worker\|\.glb\"\|metadata.json\|OUTPUT\|os.makedirs\|load_processed_urls\|save_processed" python/scripts/ikea_model_scraper.py`
Note the constant that defines the output root, the `queue_worker` signature, the point where a `<finish>.glb` is written, and where `metadata.json` is written. (Read the surrounding code before editing.)

- [ ] **Step 2: Add CLI flags + thread output dir through `main`**

In the `__main__` block, add arguments and pass them in:

```python
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--limit", type=int, default=0)
    parser.add_argument("-u", "--url", type=str, default=None)
    parser.add_argument("--out", type=str, default=None,
                        help="Output root for group folders + processed_urls.txt")
    parser.add_argument("--progress-ndjson", action="store_true",
                        help="Emit one JSON line per phase transition on stdout")
    args = parser.parse_args()
    asyncio.run(main(args.limit, args.url, out_dir=args.out,
                     progress_ndjson=args.progress_ndjson))
```

Change `async def main(limit, target_url):` to
`async def main(limit, target_url, out_dir=None, progress_ndjson=False):`.
Resolve the effective output root at the top of `main`:

```python
    import os, json as _json, sys
    base_out = out_dir or DEFAULT_OUTPUT_ROOT  # the existing ikea_sg_3d_models constant
    os.makedirs(base_out, exist_ok=True)

    def emit(event):
        if progress_ndjson:
            sys.stdout.write(_json.dumps(event) + "\n")
            sys.stdout.flush()
```

Replace references to the hardcoded output root in the write paths (and in `load_processed_urls`/`save_processed_urls` if they hardcode the path) with `base_out`. Pass `base_out` and `emit` into `queue_worker` (add params) so the worker can write under it and emit events.

> If `DEFAULT_OUTPUT_ROOT` isn't a named constant today, introduce one set to the current literal path and use it as the default — a pure refactor that keeps the standalone CLI behaviour identical.

- [ ] **Step 3: Emit per-product phase events**

In `queue_worker`, at the existing phase boundaries, call `emit(...)` with the per-product schema. At minimum:

```python
emit({"group": group_key, "finish": finish, "glb": glb_filename,
      "phase": "scraping", "done": state.done, "total": state.total})
# ... immediately after the .glb file is flushed to disk:
emit({"group": group_key, "finish": finish, "glb": glb_filename,
      "phase": "glb_written", "done": state.done, "total": state.total})
# ... after metadata.json is written for the group:
emit({"group": group_key, "phase": "metadata_written"})
# ... when a finish/product fully completes or fails:
emit({"group": group_key, "finish": finish, "glb": glb_filename,
      "phase": "done", "done": state.done, "total": state.total})
emit({"group": group_key, "finish": finish, "glb": glb_filename,
      "phase": "failed", "done": state.done, "total": state.total})  # on error path
```

`state.total` = count of pending products for this run; `state.done` increments as finishes complete. If `ScraperState` lacks `total`/`done`, add them (set `total` once `pending_urls`/variant count is known; increment `done` on each finish completion). Emit a one-time startup line: `emit({"phase": "run_started", "total": <total>})`.

- [ ] **Step 4: Smoke the flags (no live network expected to fully succeed)**

Run: `cd python/scripts && python ikea_model_scraper.py --help`
Expected: usage shows `--out` and `--progress-ndjson`. (A full `-n 1` live run is exercised in B6/B8; the smoke here is just flag wiring + import-clean.)

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py
git commit -m "feat(scraper): --out dir + --progress-ndjson per-product event stream"
```

---

### Task B2: NDJSON → event parser (pure, unit-tested)

**Files:**
- Create: `scripts/scraper/progress.mjs`
- Create: `scripts/scraper/progress.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/scraper/progress.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { createLineSplitter, parseEvent } from './progress.mjs';

describe('parseEvent', () => {
  it('parses a per-product event', () => {
    expect(parseEvent('{"group":"g","finish":"white","glb":"white.glb","phase":"glb_written","done":1,"total":3}'))
      .toEqual({ group: 'g', finish: 'white', glb: 'white.glb', phase: 'glb_written', done: 1, total: 3 });
  });
  it('returns null for non-JSON / blank lines', () => {
    expect(parseEvent('')).toBeNull();
    expect(parseEvent('[+] Content up to date.')).toBeNull();
  });
});

describe('createLineSplitter', () => {
  it('emits complete lines across chunk boundaries', () => {
    const seen = [];
    const feed = createLineSplitter((line) => seen.push(line));
    feed('{"a":1}\n{"b":');
    feed('2}\n');
    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
  });
  it('flushes a trailing partial line on end()', () => {
    const seen = [];
    const feed = createLineSplitter((line) => seen.push(line));
    feed('{"c":3}');
    feed.end();
    expect(seen).toEqual(['{"c":3}']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scripts/scraper/progress`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `scripts/scraper/progress.mjs`:

```js
/** Parse one NDJSON line into an event object, or null if it isn't JSON
 *  (the scraper also prints human log lines we ignore). */
export function parseEvent(line) {
  const s = line.trim();
  if (!s || s[0] !== '{') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Stateful splitter: feed it arbitrary string chunks; it calls `onLine` for
 *  each complete '\n'-terminated line. Call `.end()` to flush a trailing
 *  partial line. */
export function createLineSplitter(onLine) {
  let buf = '';
  function feed(chunk) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      onLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  }
  feed.end = () => {
    if (buf.length) {
      onLine(buf);
      buf = '';
    }
  };
  return feed;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- scripts/scraper/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/progress.mjs scripts/scraper/progress.test.mjs
git commit -m "feat(scraper-server): pure NDJSON line splitter + event parser"
```

---

### Task B3: Bounded optimize pool (pure, unit-tested)

**Files:**
- Create: `scripts/scraper/optimizePool.mjs`
- Create: `scripts/scraper/optimizePool.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/scraper/optimizePool.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { createOptimizePool } from './optimizePool.mjs';

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('createOptimizePool', () => {
  it('never runs more than `concurrency` jobs at once', async () => {
    let active = 0, maxActive = 0;
    const run = async () => {
      active++; maxActive = Math.max(maxActive, active);
      await tick();
      active--;
    };
    const pool = createOptimizePool({ concurrency: 2, run });
    for (let i = 0; i < 6; i++) pool.submit(`f${i}.glb`);
    await pool.drain();
    expect(maxActive).toBe(2);
  });

  it('isolates failures — one rejecting job does not stop the rest', async () => {
    const done = [];
    const run = async (f) => {
      await tick();
      if (f === 'bad.glb') throw new Error('boom');
      done.push(f);
    };
    const failed = [];
    const pool = createOptimizePool({
      concurrency: 2, run, onError: (f) => failed.push(f),
    });
    ['a.glb', 'bad.glb', 'c.glb'].forEach((f) => pool.submit(f));
    await pool.drain();
    expect(done.sort()).toEqual(['a.glb', 'c.glb']);
    expect(failed).toEqual(['bad.glb']);
  });

  it('reports phase transitions via onPhase', async () => {
    const phases = [];
    const pool = createOptimizePool({
      concurrency: 1,
      run: async () => {},
      onPhase: (f, phase) => phases.push([f, phase]),
    });
    pool.submit('x.glb');
    await pool.drain();
    expect(phases).toEqual([['x.glb', 'optimizing'], ['x.glb', 'done']]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scripts/scraper/optimizePool`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pool**

Create `scripts/scraper/optimizePool.mjs`:

```js
/** A bounded-concurrency job pool. `run(item)` does the work (async). Jobs are
 *  submitted as they arrive (overlapping producer); `drain()` resolves when the
 *  queue is empty and all in-flight jobs settle. Failures are isolated:
 *  `onError(item, err)` is called and the pool keeps going. `onPhase(item,
 *  phase)` fires 'optimizing' at start and 'done' on success. */
export function createOptimizePool({ concurrency = 3, run, onError, onPhase }) {
  const queue = [];
  let active = 0;
  let drainResolvers = [];

  function maybeDrained() {
    if (active === 0 && queue.length === 0) {
      drainResolvers.forEach((r) => r());
      drainResolvers = [];
    }
  }

  function pump() {
    while (active < concurrency && queue.length > 0) {
      const item = queue.shift();
      active++;
      onPhase?.(item, 'optimizing');
      Promise.resolve(run(item))
        .then(() => onPhase?.(item, 'done'))
        .catch((err) => onError?.(item, err))
        .finally(() => {
          active--;
          pump();
          maybeDrained();
        });
    }
  }

  return {
    submit(item) {
      queue.push(item);
      pump();
    },
    drain() {
      return new Promise((resolve) => {
        drainResolvers.push(resolve);
        maybeDrained();
      });
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- scripts/scraper/optimizePool`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/optimizePool.mjs scripts/scraper/optimizePool.test.mjs
git commit -m "feat(scraper-server): bounded-concurrency optimize pool"
```

---

### Task B4: Sidecar HTTP server

**Files:**
- Create: `scripts/scraper-server.mjs`
- Modify: `package.json:5-12` (scripts)
- Modify: `vite.config.ts:62-78` (server.proxy)
- Modify: `.gitignore`

- [ ] **Step 1: Implement the sidecar**

Create `scripts/scraper-server.mjs`:

```js
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLineSplitter, parseEvent } from './scraper/progress.mjs';
import { createOptimizePool } from './scraper/optimizePool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SERVED_DIR = path.join(REPO, 'public', 'assets', 'ikea');
const SCRAPER = path.join(REPO, 'python', 'scripts', 'ikea_model_scraper.py');
const OPTIMIZER = path.join(REPO, 'python', 'scripts', 'optimize_glb_lod.mjs');
const PORT = Number(process.env.SCRAPER_PORT || 5174);

/** @type {{ runId: string, child: import('child_process').ChildProcess,
 *  clients: Set<http.ServerResponse>, latest: object[] } | null} */
let run = null;

function broadcast(event) {
  if (!run) return;
  run.latest.push(event);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.clients) res.write(line);
}

function startRun(limit) {
  const runId = `run-${Date.now()}`;
  const optimize = createOptimizePool({
    concurrency: Number(process.env.OPTIMIZE_CONCURRENCY || 3),
    run: (glbAbsPath) =>
      new Promise((resolve, reject) => {
        const p = spawn('node', [OPTIMIZER, glbAbsPath], { cwd: REPO });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`optimizer exit ${code}`))));
      }),
    onPhase: (glb, phase) => broadcast({ phase: `optimize_${phase}`, glb }),
    onError: (glb, err) => broadcast({ phase: 'optimize_failed', glb, error: String(err) }),
  });

  // The merge logic (NDJSON event → broadcast + optimize submit + group_ready)
  // is extracted into `createEventMerger` (defined + exported below) so it is
  // unit-testable without a live scraper (Task B8).
  const handle = createEventMerger({
    onEmit: (ev) => broadcast(ev),
    submitOptimize: (group, glb) => optimize.submit(path.join(SERVED_DIR, group, glb)),
  });

  const args = [SCRAPER, '--out', SERVED_DIR, '--progress-ndjson'];
  if (limit > 0) args.push('--limit', String(limit));
  const child = spawn('python', args, { cwd: path.join(REPO, 'python', 'scripts') });

  const split = createLineSplitter((line) => {
    const ev = parseEvent(line);
    if (ev) handle(ev);
  });

  child.stdout.on('data', (b) => split(String(b)));
  child.stderr.on('data', (b) => process.stderr.write(b));
  child.on('close', async () => {
    split.end();
    await optimize.drain();
    broadcast({ phase: 'run_complete' });
    for (const res of run?.clients ?? []) res.end();
    run = null;
  });

  run = { runId, child, clients: new Set(), latest: [] };
  return runId;
}

/** Merge scraper NDJSON events into the broadcast stream: forward every event,
 *  submit each landed finish GLB for optimization, and emit `group_ready` once
 *  (metadata written AND ≥1 finish landed). Extracted + exported for unit tests
 *  (Task B8). */
export function createEventMerger({ onEmit, submitOptimize }) {
  const groupsWithFinish = new Set();
  const metadataWritten = new Set();
  const groupsReady = new Set();
  return function handle(ev) {
    onEmit(ev);
    if (ev.phase === 'glb_written' && ev.group && ev.glb) {
      groupsWithFinish.add(ev.group);
      submitOptimize(ev.group, ev.glb);
    }
    if (ev.phase === 'metadata_written' && ev.group) metadataWritten.add(ev.group);
    if (ev.group && metadataWritten.has(ev.group) && groupsWithFinish.has(ev.group)
        && !groupsReady.has(ev.group)) {
      groupsReady.add(ev.group);
      onEmit({ phase: 'group_ready', group: ev.group });
    }
  };
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/ikea/status') {
    return send(res, 200, { running: !!run, runId: run?.runId });
  }
  if (req.method === 'POST' && url.pathname === '/ikea/scrape') {
    if (run) return send(res, 409, { error: 'a run is already in progress', runId: run.runId });
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let limit = 0;
      try { limit = Number(JSON.parse(body || '{}').limit) || 0; } catch { /* default */ }
      const runId = startRun(limit);
      send(res, 200, { runId });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/ikea/progress') {
    if (!run) return send(res, 404, { error: 'no active run' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    for (const ev of run.latest) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    run.clients.add(res);
    req.on('close', () => run?.clients.delete(res));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/ikea/cancel') {
    if (run) { run.child.kill('SIGTERM'); }
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'not found' });
});

// Only start listening when run directly (`node scripts/scraper-server.mjs`),
// not when imported by Vitest — otherwise the test process binds the port.
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`[scraper-server] listening on http://localhost:${PORT}`);
    console.log(`[scraper-server] writing assets to ${SERVED_DIR}`);
  });
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
    "scraper-server": "node scripts/scraper-server.mjs",
```

- [ ] **Step 3: Add the Vite dev proxy**

In `vite.config.ts`, add an entry to `server.proxy` alongside the existing ones:

```ts
      '/ikea': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
```

- [ ] **Step 4: Gitignore the served assets**

Append to `.gitignore`:

```
# Live-scraped IKEA assets (non-CC0, local/dev-only)
public/assets/ikea/
```

- [ ] **Step 5: Smoke the server boots**

Run (background): `npm run scraper-server`
Then: `curl -s http://localhost:5174/ikea/status`
Expected: `{"running":false}`. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add scripts/scraper-server.mjs package.json vite.config.ts .gitignore
git commit -m "feat(scraper-server): sidecar HTTP server (scrape + per-product optimize + SSE + event merger)"
```

---

### Task B5: Browser pack client (`ikeaLive.ts`)

**Files:**
- Modify: `src/catalog/packs/types.ts:37-50`
- Modify: `src/catalog/packs/registry.ts`
- Create: `src/catalog/packs/ikeaLive.ts`
- Create: `src/catalog/packs/ikeaLive.test.ts`

- [ ] **Step 1: Add a `kind` discriminator to `Pack`**

In `src/catalog/packs/types.ts`, add to the `Pack` interface (after `id`):

```ts
  /** 'zip' = fetch a hosted archive (default install flow); 'ikea-live' =
   *  drive the local scraper sidecar. */
  kind?: 'zip' | 'ikea-live';
```

Make `downloadUrl`, `sizeBytes`, and `parseEntries` optional (an `ikea-live` pack has none):

```ts
  downloadUrl?: string;
  sizeBytes?: number;
  parseEntries?: (files: Record<string, Uint8Array>) => PackEntryDescriptor[];
```

- [ ] **Step 2: Register the IKEA-live pack**

In `src/catalog/packs/registry.ts`, add an entry to `AVAILABLE_PACKS`:

```ts
  {
    id: 'ikea-sg-live',
    kind: 'ikea-live',
    name: 'IKEA Singapore (live scrape)',
    description:
      'Scrapes IKEA SG product models on demand via the local scraper sidecar, optimizing each model as it downloads. Requires `npm run scraper-server`.',
    attribution: 'IKEA — ikea.com/sg (imported models, local/dev-only)',
    license: 'CC0', // type requires a literal; not a CC0 claim — see attribution.
    sourceUrl: 'https://www.ikea.com/sg/en/',
  },
```

> Note: `license: 'CC0'` only satisfies the existing union type; the card shows the IKEA attribution. If the team prefers, widen the `Pack.license` type to include `'IKEA'` in a follow-up — out of scope here.

- [ ] **Step 3: Write the failing test for the client's pure parts**

Create `src/catalog/packs/ikeaLive.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { groupReadyUrls, parseSseData } from './ikeaLive';

describe('parseSseData', () => {
  it('extracts the JSON payload from an SSE data line', () => {
    expect(parseSseData('data: {"phase":"group_ready","group":"malm"}'))
      .toEqual({ phase: 'group_ready', group: 'malm' });
  });
  it('returns null for comments / non-data lines', () => {
    expect(parseSseData(': keep-alive')).toBeNull();
  });
});

describe('groupReadyUrls', () => {
  it('builds the served metadata + glb base URL for a group', () => {
    expect(groupReadyUrls('malm-bed-frame-high-90x200')).toEqual({
      metadataUrl: '/assets/ikea/malm-bed-frame-high-90x200/metadata.json',
      baseUrl: '/assets/ikea/malm-bed-frame-high-90x200',
    });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- ikeaLive`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `ikeaLive.ts`**

Create `src/catalog/packs/ikeaLive.ts`:

```ts
import { parseIkeaMetadata } from '../../furniture/ikea/metadata';
import { importGroup } from '../../furniture/ikea/importGroup';

export interface IkeaProgressEvent {
  phase: string;
  group?: string;
  finish?: string;
  glb?: string;
  done?: number;
  total?: number;
  error?: string;
}

/** Extract the JSON object from an SSE `data: …` line, or null for keep-alive
 *  comments / blank lines. */
export function parseSseData(line: string): IkeaProgressEvent | null {
  if (!line.startsWith('data:')) return null;
  const json = line.slice('data:'.length).trim();
  if (!json) return null;
  try {
    return JSON.parse(json) as IkeaProgressEvent;
  } catch {
    return null;
  }
}

/** Served URLs for a finished group folder. */
export function groupReadyUrls(group: string): { metadataUrl: string; baseUrl: string } {
  const baseUrl = `/assets/ikea/${group}`;
  return { metadataUrl: `${baseUrl}/metadata.json`, baseUrl };
}

const SIDECAR = ''; // same-origin via the Vite '/ikea' proxy

export async function sidecarStatus(): Promise<{ running: boolean; runId?: string } | null> {
  try {
    const res = await fetch(`${SIDECAR}/ikea/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // sidecar not running
  }
}

export async function startScrape(limit = 0): Promise<{ runId: string }> {
  const res = await fetch(`${SIDECAR}/ikea/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) throw new Error(`scrape start failed: HTTP ${res.status}`);
  return res.json();
}

/** Fetch a finished group's metadata + finish GLBs over HTTP and register it
 *  as an IkeaGltfDef via the existing importer. */
export async function registerGroup(group: string): Promise<void> {
  const { metadataUrl, baseUrl } = groupReadyUrls(group);
  const metaRes = await fetch(metadataUrl);
  if (!metaRes.ok) throw new Error(`metadata fetch failed for ${group}`);
  const meta = parseIkeaMetadata(await metaRes.json());

  const files: File[] = [];
  for (const v of meta.variants) {
    if (!v.glb) continue;
    const glbRes = await fetch(`${baseUrl}/${v.glb}`);
    if (!glbRes.ok) continue;
    const blob = await glbRes.blob();
    files.push(new File([blob], v.glb, { type: 'model/gltf-binary' }));
  }
  if (files.length === 0) return;
  await importGroup(meta, files);
}

/** Open the SSE stream and drive callbacks. Returns a cancel function. */
export function streamProgress(
  onEvent: (ev: IkeaProgressEvent) => void,
  onGroupReady: (group: string) => void,
): () => void {
  const es = new EventSource(`${SIDECAR}/ikea/progress`);
  es.onmessage = (m) => {
    const ev = parseSseData(`data: ${m.data}`);
    if (!ev) return;
    onEvent(ev);
    if (ev.phase === 'group_ready' && ev.group) onGroupReady(ev.group);
  };
  es.onerror = () => { /* stream closes at run_complete; UI handles via run_complete event */ };
  return () => es.close();
}
```

> Verify `parseIkeaMetadata` is the exported name in `src/furniture/ikea/metadata.ts` (Step references the spec's "zod parse"). If the export differs (e.g. `parseMetadata`/`IkeaMetadataSchema.parse`), use the actual export — check with `grep -n "export" src/furniture/ikea/metadata.ts` before implementing and adjust the import.

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- ikeaLive`
Expected: PASS (the two pure-function describes). `npx tsc --noEmit` should also pass.

- [ ] **Step 7: Commit**

```bash
git add src/catalog/packs/types.ts src/catalog/packs/registry.ts \
  src/catalog/packs/ikeaLive.ts src/catalog/packs/ikeaLive.test.ts
git commit -m "feat(catalog): IKEA-live pack client (status/scrape/SSE/register)"
```

---

### Task B6: PacksTab UI — live card + per-product progress

**Files:**
- Modify: `src/ui/catalog/PacksTab.tsx`

- [ ] **Step 1: Branch the card on `pack.kind`**

In `src/ui/catalog/PacksTab.tsx`, import the client and render an `ikea-live` card variant. Replace the component body to handle both kinds. Key additions (keep the existing zip rendering for other packs):

```tsx
import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../state/store';
import { AVAILABLE_PACKS } from '../../catalog/packs/registry';
import { installPack } from '../../catalog/packs/install';
import { uninstallPack } from '../../catalog/packs/uninstall';
import {
  sidecarStatus, startScrape, streamProgress, registerGroup,
  type IkeaProgressEvent,
} from '../../catalog/packs/ikeaLive';

const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function IkeaLiveCard({ pack }: { pack: (typeof AVAILABLE_PACKS)[number] }) {
  const [sidecarUp, setSidecarUp] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [items, setItems] = useState<Record<string, IkeaProgressEvent>>({});
  const cancelRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    sidecarStatus().then((s) => setSidecarUp(!!s));
  }, []);

  async function onStart() {
    setRunning(true);
    setItems({});
    await startScrape(0);
    cancelRef.current = streamProgress(
      (ev) => {
        if (typeof ev.done === 'number' && typeof ev.total === 'number') {
          setProgress({ done: ev.done, total: ev.total });
        }
        if (ev.glb) {
          setItems((m) => ({ ...m, [`${ev.group}/${ev.glb}`]: ev }));
        }
        if (ev.phase === 'run_complete') {
          setRunning(false);
          cancelRef.current?.();
        }
      },
      (group) => { void registerGroup(group); },
    );
  }

  if (sidecarUp === false) {
    return (
      <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3">
        <div className="text-sm font-semibold text-neutral-900">{pack.name}</div>
        <p className="text-xs text-neutral-700">{pack.description}</p>
        <div className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          Sidecar not detected. Run <code>npm run scraper-server</code> to enable live IKEA scraping.
        </div>
      </div>
    );
  }

  const rows = Object.entries(items).slice(-12);
  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3">
      <div className="text-sm font-semibold text-neutral-900">{pack.name}</div>
      <p className="text-xs text-neutral-700">{pack.description}</p>
      {running ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
            />
          </div>
          <div className="text-[10px] text-neutral-500">
            {progress.done}/{progress.total || '…'} products
          </div>
          <ul className="max-h-32 overflow-y-auto text-[10px] text-neutral-600">
            {rows.map(([k, ev]) => (
              <li key={k} className="flex justify-between">
                <span className="truncate">{k}</span>
                <span className="ml-2 shrink-0 text-neutral-400">{ev.phase}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => void onStart()}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Scrape IKEA catalogue
        </button>
      )}
    </div>
  );
}
```

Then in the map, branch:

```tsx
      {AVAILABLE_PACKS.map((pack) => {
        if (pack.kind === 'ikea-live') return <IkeaLiveCard key={pack.id} pack={pack} />;
        // ... existing zip-pack card unchanged, but guard fmtMB on optional sizeBytes:
        // use `pack.sizeBytes ?? 0` wherever sizeBytes is read.
```

Update the existing zip card's `fmtMB(pack.sizeBytes)` usages to `fmtMB(pack.sizeBytes ?? 0)` since the field is now optional.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/catalog/PacksTab.tsx
git commit -m "feat(ui): IKEA-live pack card with per-product scrape progress"
```

---

### Task B7: End-to-end small-limit run + visual verification (REQUIRED)

**Files:** none (verification only).

- [ ] **Step 1: Start sidecar + dev server**

Run (background): `npm run scraper-server`
Run (background): `npm run dev`
Confirm `curl -s http://localhost:5174/ikea/status` → `{"running":false}`.

- [ ] **Step 2: Drive a small live scrape**

In the app, open the catalog drawer → Packs tab → "IKEA Singapore (live scrape)" → "Scrape IKEA catalogue". (For a bounded run during verification, temporarily call the sidecar with a limit: `curl -s -XPOST http://localhost:5174/ikea/scrape -d '{"limit":2}'` and watch progress, OR add a temporary limit input — but DO drive at least 1–2 real products so the pipeline is exercised end to end.)

> Requires Python + Playwright installed locally (`pip install playwright httpx && playwright install chromium`). If the environment lacks network/Playwright, document that the live path could not be exercised here and fall back to a stubbed sidecar run (see B8) for the integration evidence, but say so explicitly.

- [ ] **Step 3: Screenshot the progress UI**

While the run is in flight:

```bash
node scripts/shot.mjs /tmp/ikea-progress.png 2000
```

- [ ] **Step 4: Verify assets + LOD siblings landed**

Run: `ls public/assets/ikea/*/ | head` and confirm each group folder has `metadata.json`, `<finish>.glb`, and `<finish>-low.glb` / `<finish>-medium.glb` siblings (proof the per-product optimize ran).

- [ ] **Step 5: Screenshot the catalog with imported items**

After a group registers, screenshot the catalog drawer showing the imported IKEA item under its auto-detected category tab:

```bash
node scripts/shot.mjs /tmp/ikea-catalog.png 2000
```

- [ ] **Step 6: Visually review**

Open `/tmp/ikea-progress.png` and `/tmp/ikea-catalog.png`. Confirm: the progress bar advances, per-product rows show phase transitions (incl. `optimize_*`), and the imported item appears under the correct category with a working thumbnail/placement. **Report in prose what the screenshots show.** Place one imported item in the scene and screenshot it rendering to confirm the served-URL load path works.

---

### Task B8: Sidecar integration test (stubbed, no network)

**Files:**
- Create: `scripts/scraper/server.integration.test.mjs`

`createEventMerger` and the import-safe boot guard were already added in Task B4, so this task only adds the test that imports + exercises the exported merger (no live scraper/optimizer).

- [ ] **Step 1: Write the integration test**

Create `scripts/scraper/server.integration.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { createEventMerger } from '../scraper-server.mjs';

describe('createEventMerger', () => {
  it('emits group_ready once metadata + a finish have landed, exactly once', () => {
    const emitted = [];
    const optimized = [];
    const handle = createEventMerger({
      onEmit: (ev) => emitted.push(ev),
      submitOptimize: (group, glb) => optimized.push(`${group}/${glb}`),
    });

    handle({ group: 'g', finish: 'white', glb: 'white.glb', phase: 'glb_written' });
    handle({ group: 'g', phase: 'metadata_written' });
    handle({ group: 'g', finish: 'black', glb: 'black.glb', phase: 'glb_written' });

    const ready = emitted.filter((e) => e.phase === 'group_ready');
    expect(ready).toEqual([{ phase: 'group_ready', group: 'g' }]); // exactly once
    expect(optimized).toEqual(['g/white.glb', 'g/black.glb']); // each finish optimized
  });

  it('does not emit group_ready before any finish lands', () => {
    const emitted = [];
    const handle = createEventMerger({ onEmit: (ev) => emitted.push(ev), submitOptimize: () => {} });
    handle({ group: 'g', phase: 'metadata_written' });
    expect(emitted.some((e) => e.phase === 'group_ready')).toBe(false);
  });
});
```

> Importing `scraper-server.mjs` does not start the HTTP server (B4 guarded `server.listen` behind `import.meta.url === \`file://${process.argv[1]}\``), so the import is side-effect-free in Vitest.

- [ ] **Step 2: Run it to verify it passes**

Run: `npm test -- server.integration`
Expected: PASS (both cases). If it fails to import, confirm B4's `createEventMerger` export + boot guard are present.

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/server.integration.test.mjs
git commit -m "test(scraper-server): event-merger integration test"
```

---

### Task B9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ikea-import-app-support.md` (note the now-implemented served-path + live pack)

- [ ] **Step 1: Update CLAUDE.md**

- In **Commands**: add
  `npm run scraper-server` — local sidecar that drives the IKEA scraper +
  per-product LOD optimize and serves assets to `public/assets/ikea/`.
- In the catalog/categories section: state the catalog now spans **15**
  categories (add electronics, kids/baby, laundry, others) and that `others` is
  the auto-detect catch-all.
- In **IKEA models** / scraper: add a sentence on the one-click live-scrape pack
  (sidecar → scrape → per-product optimize → served HTTP assets → `importGroup`).
- In **Adding content**: update the "11 categories" reference to 15 and list the
  new union members + the `CategoryTabs`/`CategoryIcon` requirement.

- [ ] **Step 2: Update README.md**

Add the `npm run scraper-server` command and a short "IKEA live pack" usage note
(start sidecar, open Packs tab, click scrape) plus the new category list.

- [ ] **Step 3: Note the import-doc update**

In `docs/ikea-import-app-support.md` §3 and §11, add a short note that the
category mapping now targets 15 categories with an `others` fallback, and that
the **served-path live pack** (B) realizes the pre-baked-LOD path that §11 noted
was blocked by blob URLs.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/ikea-import-app-support.md
git commit -m "docs: 15 categories, scraper-server command, live IKEA pack flow"
```

---

## Final verification

- [ ] **Full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; typecheck + Vite build succeed.

- [ ] **Confirm both docs updated** (CLAUDE.md + README.md) per the keep-docs-current rule.

- [ ] Use superpowers:finishing-a-development-branch to decide merge/PR/cleanup.
