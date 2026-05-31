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
    env: {
      TZ: 'Asia/Singapore',
    },
  },
})
