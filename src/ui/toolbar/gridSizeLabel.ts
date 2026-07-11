/** Grid cell size label, e.g. `2.5 cm` / `10 cm` / `1 m` — shared by the
 *  desktop toolbar's grid-size Select and the mobile Edit sheet's segmented
 *  control (TB-8: the grid size is a picker over `GRID_SIZES`, not a cycle). */
export function formatGridSize(g: number): string {
  return g >= 1 ? `${g} m` : `${Math.round(g * 1000) / 10} cm`
}
