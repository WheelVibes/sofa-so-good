/** True when the basename ends in .glb or .gltf (case-insensitive). */
export function isModelFile(nameOrPath: string): boolean {
  return /\.(glb|gltf)$/i.test(nameOrPath);
}

/** Basename without the .glb/.gltf extension, for the catalog display name. */
export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath;
  return base.replace(/\.(glb|gltf)$/i, '');
}

/** Returns `base`, or `base (2)`, `base (3)`… if already in `used`.
 *  Mutates `used` to reserve whatever it returns. */
export function dedupeName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  const result = `${base} (${n})`;
  used.add(result);
  return result;
}
