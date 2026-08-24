import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const root = import.meta.dirname

// Unit suite: pure logic only (stats aggregation, role/level predicates, key
// builders). No jsdom, no Firebase, no network — these run in milliseconds and
// are safe to put on every PR. Browser-level behavior lives in the Playwright
// suite under e2e/ instead.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    // Mirrors the `@/*` path alias from tsconfig.json.
    alias: { '@': resolve(root, 'src') },
  },
})
