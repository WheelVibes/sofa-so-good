// Test stub for the `virtual:pwa-register` module that vite-plugin-pwa provides
// only during a real Vite build/dev. Vitest doesn't run that plugin, so it's
// aliased here (see vitest.config.ts) to a no-op `registerSW`.
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
