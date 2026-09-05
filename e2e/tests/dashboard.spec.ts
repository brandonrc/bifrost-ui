import { test, expect, type Page } from '@playwright/test'

import { ADMIN, ISSUER, LIVE, OPERATOR, REALM, SPA_CLIENT_ID, UI } from '../env'

/**
 * The dashboard past the sign-in page.
 *
 * These live here, beside the code they exercise, so a change to a gate or a
 * page arrives with the test that proves it — and so they run against the
 * stack in `e2e/stack` on every pull request rather than only against a
 * deployment somebody remembers to point them at.
 *
 * The token assertions carry the most history. A deployment's SPA client needs
 * an audience mapper and a group-membership mapper; the operator that
 * provisions the realm on grace adds neither, and both were put there by hand.
 * Without the audience, Bifrost refuses every request from a login that looked
 * fine. Without groups, the caller's project roles vanish and the dashboard
 * shows an empty list. Neither failure names its cause. The realm this stack
 * imports has both, so a regression in either is a red test here.
 */
const TOKEN_KEY = 'bifrost.token'

async function signIn(
  page: Page,
  user: { username: string; password: string },
): Promise<void> {
  await page.goto(`${UI}/login`)
  await page.getByRole('button', { name: /sign in with sso/i }).click()
  await page.waitForURL((url) => url.href.startsWith(new URL(ISSUER).origin))
  // Keycloak's form by id, not by label: the password field's label also
  // names a "Show password" button, and the two are not interchangeable.
  await expect(page.locator('#username')).toBeVisible()
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await Promise.all([
    page.waitForURL((url) => url.href.startsWith(UI), { timeout: 30_000 }),
    page.locator('#kc-login').click(),
  ])
  // The shell shows who is signed in once the callback has exchanged the code;
  // navigating before that loses the session.
  await expect(
    page.locator('header').getByText(user.username, { exact: true }).first(),
  ).toBeVisible({ timeout: 20_000 })
}

/** Only the claims these specs assert on; the token carries more. */
interface TokenClaims {
  iss?: string
  azp?: string
  aud?: string | string[]
  groups?: string[]
}

async function claims(page: Page): Promise<TokenClaims> {
  return page.evaluate<TokenClaims, string>((key) => {
    const token = window.localStorage.getItem(key) ?? ''
    const payload = token.split('.')[1]
    if (!payload) return {}
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  }, TOKEN_KEY)
}

interface ApiIdentity {
  roles?: string[]
  projects?: { name: string; roles: string[] }[]
}

/** What the API tells this browser's user, asked as that user. */
async function apiIdentity(page: Page): Promise<ApiIdentity> {
  return page.evaluate<ApiIdentity, string>(async (key) => {
    const r = await fetch('/api/v1/identity', {
      headers: { Authorization: `Bearer ${window.localStorage.getItem(key)}` },
    })
    return r.json()
  }, TOKEN_KEY)
}

/**
 * A cluster record, created through the API as the signed-in user.
 *
 * Only on the local stack, and only because a page that lists nothing proves
 * nothing: with no rows, "the table matches the API" holds for a dashboard
 * that renders an empty table forever. There is no provisioner behind this
 * stack, so the record stays where it is written and no infrastructure is
 * touched. A live deployment has real clusters and a real provisioner, so
 * there the specs read what is already there rather than making more.
 */
async function seedCluster(page: Page, id: string, project: string): Promise<void> {
  const status = await page.evaluate(
    async ({ key, id, project }) => {
      const r = await fetch('/api/v1/clusters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${window.localStorage.getItem(key)}`,
        },
        body: JSON.stringify({
          id,
          spec: {
            name: id,
            project,
            ray_version: '2.56.0',
            image: 'rayproject/ray:2.56.0',
            head_cpu: '1',
            head_memory: '2Gi',
            worker_groups: [],
          },
        }),
      })
      return r.status
    },
    { key: TOKEN_KEY, id, project },
  )
  // 409: a previous run on the same stack already made it.
  expect([200, 201, 202, 409]).toContain(status)
}

test.describe('the signed-in dashboard', () => {
  test('the token carries the issuer, audience and groups Bifrost needs', async ({
    page,
  }) => {
    await signIn(page, ADMIN)
    const token = await claims(page)

    expect(token.iss).toBe(ISSUER)
    expect(token.azp).toBe(SPA_CLIENT_ID)

    const audience = Array.isArray(token.aud) ? token.aud : [token.aud]
    expect(
      audience,
      'the SPA client needs an audience mapper naming the API; without it every request 401s',
    ).toContain(SPA_CLIENT_ID)

    expect(
      token.groups,
      'the SPA client needs a group-membership mapper; without it project roles vanish',
    ).toBeDefined()
    expect(Array.isArray(token.groups)).toBe(true)
  })

  test('the realm the SPA is sent to is the one it was configured with', async ({
    page,
  }) => {
    await page.goto(`${UI}/login`)
    await page.getByRole('button', { name: /sign in with sso/i }).click()
    await page.waitForURL((url) => url.href.startsWith(new URL(ISSUER).origin))

    // The authorize request is where a build-time issuer used to leak through:
    // an image compiled against one deployment sent every other deployment's
    // users to a host that was not theirs.
    const authorize = new URL(page.url())
    expect(authorize.pathname).toContain(`/realms/${REALM}/`)
    expect(authorize.searchParams.get('client_id')).toBe(SPA_CLIENT_ID)
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${UI}/auth/callback`)
    expect(
      authorize.searchParams.get('code_challenge_method'),
      'a public client must use PKCE',
    ).toBe('S256')
  })

  test('the shell offers the sections the role allows, and no others', async ({
    page,
  }) => {
    await signIn(page, ADMIN)
    const adminNav = await page.locator('nav a').allTextContents()
    expect(adminNav).toEqual(
      expect.arrayContaining(['Overview', 'Clusters', 'Audit', 'Settings']),
    )

    await page.evaluate(() => window.localStorage.clear())
    await page.context().clearCookies()
    await signIn(page, OPERATOR)
    const operatorNav = await page.locator('nav a').allTextContents()
    expect(operatorNav).toEqual(expect.arrayContaining(['Overview', 'Clusters']))
    expect(
      operatorNav,
      'a project operator is not a platform admin: the audit trail is not theirs',
    ).not.toContain('Audit')
    expect(operatorNav).not.toContain('Settings')
  })

  test('a project operator may start a cluster in their project', async ({
    page,
  }) => {
    await signIn(page, OPERATOR)

    // The server states where this caller may act; the dashboard must believe
    // it. Reading the caller's *global* roles instead once put a lock screen
    // over this page for every self-serve user, who holds their grant on a
    // project (bifrost-ui#2), and dropping the field on the way to the gates
    // did it again (bifrost-ui#3).
    const identity = await apiIdentity(page)
    expect(
      identity.projects?.map((p) => p.name),
      'the fixture user is expected to hold a project grant',
    ).toContain(OPERATOR.project)

    await page.goto(`${UI}/clusters/new`)
    await expect(
      page.getByRole('button', { name: 'Create cluster' }),
      'a project operator was shown "Operator or Admin role required" over this form',
    ).toBeVisible()
  })

  test('the clusters page shows what the API shows that user', async ({ page }) => {
    await signIn(page, ADMIN)
    if (!LIVE) {
      await seedCluster(page, 'e2e-seed-a', OPERATOR.project)
      await seedCluster(page, 'e2e-seed-b', 'team-b')
    }
    await page.goto(`${UI}/clusters`)
    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible()

    // A deleted cluster keeps its record until it is purged, and the page hides
    // those behind a toggle rather than listing a graveyard — so the comparison
    // is against the live ones.
    const fromApi = await page.evaluate(async (key) => {
      const r = await fetch('/api/v1/clusters', {
        headers: { Authorization: `Bearer ${window.localStorage.getItem(key)}` },
      })
      const body = await r.json()
      const all = (Array.isArray(body) ? body : (body.clusters ?? [])) as {
        id: string
        desired?: string
        observed_state?: string
      }[]
      const dead = (c: (typeof all)[number]) =>
        c.desired === 'terminated' || c.observed_state === 'terminated'
      return {
        active: all.filter((c) => !dead(c)).map((c) => c.id),
        terminated: all.filter(dead).map((c) => c.id),
      }
    }, TOKEN_KEY)

    for (const id of fromApi.active) {
      await expect(
        page.getByRole('link', { name: id, exact: true }),
        `${id} is in the API's answer but not on the page`,
      ).toBeVisible()
    }
    expect(await page.locator('table tbody tr').count()).toBe(fromApi.active.length)
    if (!LIVE) {
      expect(
        fromApi.active,
        'the seeded clusters should be in the answer this assertion compares against',
      ).toEqual(expect.arrayContaining(['e2e-seed-a', 'e2e-seed-b']))
    }
  })

  test('a project operator sees their project and not another', async ({ page }) => {
    // Scoping is the server's decision and the page's duty to render
    // faithfully. It is checked here rather than only against a deployment
    // because the seeded pair — one cluster in the operator's project, one in
    // a project they hold nothing in — makes the wrong answer visible.
    if (!LIVE) {
      await signIn(page, ADMIN)
      await seedCluster(page, 'e2e-seed-a', OPERATOR.project)
      await seedCluster(page, 'e2e-seed-b', 'team-b')
      await page.evaluate(() => window.localStorage.clear())
      await page.context().clearCookies()
    }

    await signIn(page, OPERATOR)
    await page.goto(`${UI}/clusters`)
    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible()

    const projects = (
      await page.locator('table tbody tr td:nth-child(2)').allTextContents()
    ).map((p) => p.trim())
    for (const project of projects) {
      expect(
        project,
        `the operator holds a grant in ${OPERATOR.project} only, but the page lists ${project}`,
      ).toBe(OPERATOR.project)
    }
    if (!LIVE) {
      await expect(
        page.getByRole('link', { name: 'e2e-seed-a', exact: true }),
        'the cluster in the operator\'s own project is missing from their page',
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'e2e-seed-b', exact: true }),
        'a cluster in a project the operator holds nothing in is on their page',
      ).toHaveCount(0)
    }
  })

  test('a terminated cluster is hidden behind the toggle, not lost', async ({
    page,
  }) => {
    // Tombstones are the one thing the table is allowed to withhold, and the
    // toggle is the promise that it withheld rather than dropped them. Only
    // on the local stack: this makes a cluster in order to kill it.
    test.skip(LIVE, 'creates and deletes a cluster; not on a real deployment')

    await signIn(page, ADMIN)
    const id = 'e2e-seed-dead'
    await seedCluster(page, id, OPERATOR.project)
    await page.evaluate(
      async ({ key, id }) => {
        await fetch(`/api/v1/clusters/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${window.localStorage.getItem(key)}` },
        })
      },
      { key: TOKEN_KEY, id },
    )

    await page.goto(`${UI}/clusters`)
    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: id, exact: true }),
      'a terminated cluster should not be in the default list',
    ).toHaveCount(0)

    await page.getByText(/show terminated/i).click()
    await expect(
      page.getByRole('link', { name: id, exact: true }),
      'the toggle should bring back the record the API still holds',
    ).toBeVisible()
  })

  test('signing out ends the session', async ({ page }) => {
    await signIn(page, ADMIN)
    expect(
      await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY),
    ).toBeTruthy()

    await page.getByRole('button', { name: /sign out/i }).click()
    await expect
      .poll(
        async () => page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY),
        { timeout: 20_000 },
      )
      .toBeNull()

    await page.goto(`${UI}/clusters`)
    await expect(page.getByRole('button', { name: /sign in with sso/i })).toBeVisible({
      timeout: 20_000,
    })
  })

  test('an unauthenticated visit is sent to sign in', async ({ page }) => {
    await page.goto(`${UI}/clusters`)
    await expect(page.getByRole('button', { name: /sign in with sso/i })).toBeVisible({
      timeout: 20_000,
    })
  })
})
