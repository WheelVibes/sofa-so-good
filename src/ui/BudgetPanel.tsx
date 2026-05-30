import { useMemo } from 'react';
import { useStore } from '../state/store';
import { useCatalog } from '../furniture/catalog';
import { itemPrice } from '../furniture/furniturePrices';
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../furniture/types';

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
};

interface Line {
  defId: string;
  name: string;
  count: number;
  each: number;
}

/**
 * Live budget / shopping list. Groups every placed furniture item by category,
 * tallies counts, and totals an approximate retail cost (SGD). A practical aid
 * for "what would furnishing this cost?" — clearly an estimate.
 */
export function BudgetPanel() {
  const open = useStore((s) => s.budgetOpen);
  const toggle = useStore((s) => s.toggleBudget);
  const items = useStore((s) => s.items);
  const catalog = useCatalog();

  const { groups, total, count } = useMemo(() => {
    const byCat = new Map<FurnitureCategory, Map<string, Line>>();
    let total = 0;
    let count = 0;
    for (const it of items) {
      const def = catalog[it.defId];
      if (!def) continue;
      const cat = def.category;
      const each = itemPrice(def, cat);
      total += each;
      count += 1;
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const lines = byCat.get(cat)!;
      const existing = lines.get(it.defId);
      if (existing) existing.count += 1;
      else lines.set(it.defId, { defId: it.defId, name: def.name, count: 1, each });
    }
    const groups = FURNITURE_CATEGORIES.filter((c) => byCat.has(c)).map((c) => {
      const lines = [...byCat.get(c)!.values()].sort((a, b) => b.each * b.count - a.each * a.count);
      const subtotal = lines.reduce((s, l) => s + l.each * l.count, 0);
      return { cat: c, lines, subtotal };
    });
    return { groups, total, count };
  }, [items, catalog]);

  if (!open) return null;
  const fmt = (n: number) => `$${n.toLocaleString('en-SG')}`;

  return (
    <aside className="absolute right-3 top-16 z-20 flex max-h-[80vh] w-72 flex-col rounded-lg bg-white/95 text-neutral-700 shadow-lg">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-sm font-semibold text-neutral-900">Budget estimate</span>
        <button onClick={toggle} className="text-neutral-400 hover:text-neutral-700" aria-label="Close budget">
          ×
        </button>
      </header>

      <div className="flex items-baseline justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-2xl font-bold text-neutral-900">{fmt(total)}</span>
        <span className="text-xs text-neutral-500">{count} items</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">No furniture placed yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.cat} className="mb-3">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <span>{CATEGORY_LABEL[g.cat]}</span>
                <span>{fmt(g.subtotal)}</span>
              </div>
              {g.lines.map((l) => (
                <div key={l.defId} className="flex items-center justify-between py-0.5 text-xs">
                  <span className="truncate text-neutral-700">
                    {l.name}
                    {l.count > 1 && <span className="text-neutral-400"> ×{l.count}</span>}
                  </span>
                  <span className="ml-2 shrink-0 tabular-nums text-neutral-500">{fmt(l.each * l.count)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-neutral-200 px-4 py-2 text-[10px] leading-snug text-neutral-400">
        <span>Approx. mid-market retail (SGD). Finishes &amp; reno excluded.</span>
        <button
          onClick={() => {
            const lines = groups.flatMap((g) => [
              `# ${CATEGORY_LABEL[g.cat]}`,
              ...g.lines.map((l) => `${l.name}${l.count > 1 ? ` x${l.count}` : ''}\t${fmt(l.each * l.count)}`),
            ]);
            lines.push('', `TOTAL\t${fmt(total)} (${count} items)`);
            void navigator.clipboard?.writeText(lines.join('\n'));
          }}
          className="shrink-0 rounded bg-neutral-200 px-2 py-1 text-[10px] font-medium text-neutral-700 hover:bg-neutral-300"
        >
          Copy list
        </button>
      </footer>
    </aside>
  );
}
