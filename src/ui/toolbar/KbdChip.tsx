/** Right-aligned shortcut-combo chip shared by `MenuItem` (ToolbarMenu.tsx) and
 *  `ArrangeMenu`'s dense `Action` row (P24) — both render the same `.mi-kbd`
 *  markup, so it lives here once instead of being duplicated per menu. */
export function KbdChip({ children }: { children: string }) {
  return <kbd className="mi-kbd">{children}</kbd>
}
