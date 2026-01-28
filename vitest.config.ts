import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**', 'worker/src/**'],
      thresholds: {
        'packages/domain/src/**': {
          lines: 95,
          functions: 90,
          branches: 85,
        },
      },
    },
  },
})
