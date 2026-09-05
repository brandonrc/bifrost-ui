import { expect, type Page } from '@playwright/test'

import { ISSUER, UI } from './env'

/** The dashboard's own storage key for the access token. */
export const TOKEN_KEY = 'bifrost.token'

/**
 * Sign in through the IdP, the way a person does.
 *
 * Shared rather than repeated because the sharp edges are shared. Keycloak's
 * form is addressed by id: the password field's accessible name also matches a
 * "Show password" button, and a by-label locator resolves to both. And the
 * shell must show who is signed in before anything navigates — the callback is
 * still exchanging the code, and leaving early loses the session.
 */
export async function signIn(
  page: Page,
  user: { username: string; password: string },
): Promise<void> {
  await page.goto(`${UI}/login`)
  await page.getByRole('button', { name: /sign in with sso/i }).click()
  await page.waitForURL((url) => url.href.startsWith(new URL(ISSUER).origin))
  await expect(page.locator('#username')).toBeVisible()
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await Promise.all([
    page.waitForURL((url) => url.href.startsWith(UI), { timeout: 30_000 }),
    page.locator('#kc-login').click(),
  ])
  await expect(
    page.locator('header').getByText(user.username, { exact: true }).first(),
  ).toBeVisible({ timeout: 20_000 })
}
