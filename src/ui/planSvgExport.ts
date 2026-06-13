/**
 * Pure glue for the "export 2D plan to SVG" download (Sweet Home 3D parity —
 * the vector sibling of the existing DXF export). The plan diagram itself is
 * rendered by the shared `reportPlanSvg` (reused, never re-implemented); this
 * module only wraps that inline-SVG *fragment* into a standalone, valid `.svg`
 * document a user can open or hand to a CAD/vector tool.
 *
 * `reportPlanSvg` returns a fragment for embedding via `dangerouslySetInnerHTML`
 * (no XML prolog, no `xmlns`), so on its own it is not a loadable file. We add
 * the SVG namespace + an XML declaration. Pure (no DOM) → unit-testable.
 */

/** Wrap a `reportPlanSvg` fragment into a standalone SVG document string. Returns
 *  '' when given empty input (a plan with no extent), so callers can no-op. */
export function buildPlanSvgDocument(innerSvg: string): string {
  if (!innerSvg) return ''
  // The fragment opens with `<svg ` (and a class/viewBox) but no namespace —
  // inject the xmlns so the standalone file is valid and renders everywhere.
  const withNs = innerSvg.startsWith('<svg ')
    ? innerSvg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    : innerSvg
  return `<?xml version="1.0" encoding="UTF-8"?>\n${withNs}\n`
}
