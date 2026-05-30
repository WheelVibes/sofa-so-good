/** Props patch to switch the active finish of a placed IKEA item. */
export function variantProps(finish: string): { variant: string } {
  return { variant: finish };
}
/** item.props key holding the per-component override for a GLB material name. */
export function finishOverrideKey(materialName: string): string {
  return `finish:${materialName}`;
}
