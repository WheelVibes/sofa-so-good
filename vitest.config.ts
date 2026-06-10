import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pin tests to Singapore time so wall-clock-dependent assertions
// (e.g. useSunPosition with manualHour=0 expecting night) are deterministic.
process.env.TZ = 'Asia/Singapore'

export default defineConfig({
  plugins: [react()],
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
