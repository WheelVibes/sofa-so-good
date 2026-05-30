/** True when the basename ends in .glb or .gltf (case-insensitive). */
export function isModelFile(nameOrPath: string): boolean {
  return /\.(glb|gltf)$/i.test(nameOrPath);
}

/** Basename without the .glb/.gltf extension, for the catalog display name. */
export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath;
  return base.replace(/\.(glb|gltf)$/i, '');
}
