import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { FurnitureItem, ParamProps } from '../../furniture/types';

/** Returns a fresh UUID. Falls back to a Math.random-based id if
 *  crypto.randomUUID is unavailable (very old browsers / non-secure
 *  contexts during tests). */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export interface ItemsSlice {
  items: FurnitureItem[];
  addItem: (item: Omit<FurnitureItem, 'id'>) => string;
  moveItem: (id: string, position: [number, number]) => void;
  rotateItem: (id: string, rotation: number) => void;
  deleteItem: (id: string) => void;
  updateItemProps: (id: string, props: ParamProps) => void;
  setItems: (items: FurnitureItem[]) => void;
}

export const ITEMS_INITIAL: Pick<ItemsSlice, 'items'> = { items: [] };

export const createItemsSlice: SliceCreator<ItemsSlice, RootState> = (set) => ({
  ...ITEMS_INITIAL,
  addItem: (i) => {
    const id = newId();
    set((s) => ({
      items: [...s.items, { ...i, id }],
      selectedItemId: id,
    }));
    return id;
  },
  moveItem: (id, position) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, position } : it)),
    })),
  rotateItem: (id, rotation) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, rotation } : it)),
    })),
  deleteItem: (id) =>
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
      selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
    })),
  updateItemProps: (id, props) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, props: { ...it.props, ...props } } : it,
      ),
    })),
  setItems: (items) => set({ items }),
});
