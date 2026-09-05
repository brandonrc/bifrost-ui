import { defineConfig } from '@playwright/test'

/**
 * The dashboard, driven in a browser against a real Bifrost.
 *
 * Two lanes, one set of specs:
 *
 *   local — the stack in `e2e/stack`: Keycloak with a realm that mirrors a
 *           deployment's shape, Bifrost with OIDC auth, and this SPA served
 *           as it ships. Runs in CI on every pull request. No cluster, so the
 *           write path (a cluster converging) is out of reach here.
 *   live  — a real deployment, grace or otherwise, named by environment. Adds
 *           the specs that need a control plane with a provisioner.
 *
 * Everything is parameterised because the specs must not know which they are
 * pointed at; a spec that hardcodes a host is a spec that only ever ran once.
 */
const baseURL = process.env.BIFROST_UI_URL ?? 'http://127.0.0.1:5180'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Both relative to this file, so a run from the repository root does not
  // scatter artifacts there.
  outputDir: './test-results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]]
    : [['list']],
  use: {
    baseURL,
    // Deployments behind a private CA (grace) serve the dashboard over a
    // certificate this browser has no reason to trust.
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
})
