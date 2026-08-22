/**
 * Heading for the File surface's export group, naming only the buckets that
 * actually render (UIUX-71/73).
 *
 * The heading used to be a fixed "CAD, 3D & data" in BOTH the desktop menu and
 * the mobile sheet, but the buckets are independently flag-gated: Simple mode
 * hides the CAD rows (`dxfExport`, pro) and the CSV data rows (`shopExport`,
 * off by default), so the default experience advertised two categories it did
 * not show. Shared by `menus/FileMenu.tsx` and `mobile/FileSection.tsx` so the
 * two surfaces can't drift again (the mobile copy kept the fixed string when
 * the desktop one was fixed).
 *
 * Joined with a trailing "&" so it reads as a phrase: "CAD, 3D & data" /
 * "CAD & 3D" / "3D".
 */
export function exportGroupLabel(present: {
  cad: boolean
  threeD: boolean
  data: boolean
}): string {
  const parts = [present.cad && 'CAD', present.threeD && '3D', present.data && 'data'].filter(
    (p): p is string => typeof p === 'string',
  )
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
}
