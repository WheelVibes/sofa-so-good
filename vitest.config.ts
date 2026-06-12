import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pin tests to Singapore time so wall-clock-dependent assertions
// (e.g. useSunPosition with manualHour=0 expecting night) are deterministic.
process.env.TZ = 'Asia/Singapore'

export default defineConfig({
  plugins: [react()],
  // Prevent duplicate React/three when running in a git worktree where
  // node_modules may contain a nested node_modules/ sub-tree.
  resolve: { dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'scheduler', 'three'] },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    // Never pick up test files inside transient Claude agent worktrees (full
    // repo copies under .claude/worktrees/) or other vendored dirs.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    env: {
      TZ: 'Asia/Singapore',
    },
  },
})
