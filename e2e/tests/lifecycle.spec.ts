import { test, expect } from '@playwright/test'

import { LIVE, OPERATOR, UI } from '../env'
import { signIn, TOKEN_KEY } from '../signin'

/**
 * A cluster started and stopped through the dashboard, by a project operator,
 * against the live control plane.
 *
 * The other Bifrost UI specs read: they sign in, check what is offered, and
 * compare a list against the API. This one writes — the form, the create, the
 * convergence, the Terminate button — which is the part a user actually
 * depends on and the part no unit test can stand in for.
 *
 * Slow on purpose: a real cluster is scheduled, pulls an image and comes up.
 * It runs as a project operator rather than an administrator, because that is
 * who the dashboard is for, and asks for the smallest shape that still proves
 * the path: one small head, no workers.
 */
/**
 * Live only. A cluster converging needs a control plane with a provisioner,
 * which the pull-request stack deliberately does not have: it runs Bifrost
 * API-only, so a created cluster would sit pending for ever and this would
 * fail for a reason that has nothing to do with the dashboard.
 */
test.skip(
  !LIVE,
  'needs a deployment with a provisioner: set BIFROST_E2E_LIVE=1 and point BIFROST_UI_URL at it',
)

/** Matches the images already on grace's nodes, so this waits on scheduling rather than a pull. */
const RAY_VERSION = '2.56.0';
const IMAGE = `rayproject/ray:${RAY_VERSION}`;

/**
 * A max age on every cluster this spec creates. The test deletes what it
 * makes, and this is what covers the case where it cannot — a crashed run
 * must not leave a head pod on a shared deployment until somebody notices.
 */
const TTL_SECONDS = '1800';

test.describe('the dashboard starts and stops a cluster', () => {
  test.describe.configure({ timeout: 900_000 });

  test('alice creates a cluster from the form and terminates it', async ({ page }) => {
    const id = `ui-e2e-${Date.now().toString(36)}`;
    const user = OPERATOR;

    await signIn(page, user);

    try {
      await page.goto(`${UI}/clusters/new`);
      await expect(page.getByRole('button', { name: 'Create cluster' })).toBeVisible();

      // The form mirrors ClusterSpec, so filling it is the same act as writing
      // the body by hand — which is the point: this proves the dashboard's
      // mapping, not the API's.
      await page.getByPlaceholder('team-training').fill(id);
      await page.getByPlaceholder('proj-a').fill(user.project);
      await page.getByPlaceholder('2', { exact: true }).fill('1');
      await page.getByPlaceholder('8Gi').fill('4Gi');

      // One worker group, scaled to nothing: the requirement is a cluster that
      // converges, not a big one, and a head-only cluster schedules anywhere.
      await page.getByPlaceholder('gpu-workers').fill('w');
      await page.getByPlaceholder('4', { exact: true }).fill('1');
      await page.getByPlaceholder('16Gi').fill('2Gi');
      const numbers = page.locator('input[type="number"], input[inputmode="numeric"]');
      if ((await numbers.count()) === 0) {
        // The replica inputs carry no placeholder; they are the three that
        // arrive pre-filled with 1, 4 and 1 (min, max, replicas).
        const inputs = page.locator('input');
        const values = await inputs.evaluateAll((els) =>
          els.map((e) => (e as HTMLInputElement).value),
        );
        const minIdx = values.findIndex((v, i) => v === '1' && values[i + 1] === '4');
        if (minIdx >= 0) {
          await inputs.nth(minIdx).fill('0');
          await inputs.nth(minIdx + 1).fill('1');
          await inputs.nth(minIdx + 2).fill('0');
        }
      }

      // Exact, or this also matches the image placeholder that contains it.
      await page.getByPlaceholder('2.57.0', { exact: true }).fill(RAY_VERSION);
      await page.getByPlaceholder('rayproject/ray:2.57.0').fill(IMAGE);
      await page.getByPlaceholder('86400').fill(TTL_SECONDS);

      await page.getByRole('button', { name: 'Create cluster' }).click();

      // The dashboard's own answer first: the cluster it just made is listed.
      await page.goto(`${UI}/clusters`);
      await expect(page.getByRole('link', { name: id, exact: true })).toBeVisible({
        timeout: 30_000,
      });

      // Then the control plane's: it converges for real, which the detail page
      // reports without anyone reading Kubernetes.
      //
      // The assertion is the state badge, by its tooltip, and not the page
      // text: "running" appears in prose on this page ("Infrastructure is
      // being created", the reconcile blurb), so a text match went green in
      // forty seconds against a cluster that was still provisioning. A test
      // that cannot fail is worse than no test.
      //
      // No reloading, because the page refetches itself every 15 seconds and
      // because a poll built on reloads is wrong twice over: `count()` runs
      // the instant the load event fires, before React has rendered anything,
      // so it answered 0 for ten solid minutes while the badge was on screen
      // the whole time. An auto-waiting assertion has neither problem.
      await page.goto(`${UI}/clusters/${id}`);
      const runningBadge = page
        .getByTitle('Cluster is healthy and accepting work.')
        .first();
      await expect(runningBadge).toBeVisible({ timeout: 600_000 });
      await expect(runningBadge).toHaveText('Running');

      // And the control plane agrees, so a page that renders the right word
      // for the wrong reason still fails.
      const observed = await page.evaluate(
        async ({ cluster, key }) => {
          const r = await fetch(`/api/v1/clusters/${cluster}`, {
            headers: { Authorization: `Bearer ${window.localStorage.getItem(key)}` },
          });
          const body = await r.text();
          let state: unknown
          try {
            state = JSON.parse(body).observed_state
          } catch {
            state = undefined
          }
          // The status and body travel with the answer: this call is made with
          // the token the SPA holds, and a bearer that has aged out mid-test
          // must not look like a cluster that failed to converge.
          return { status: r.status, state, body: body.slice(0, 200) };
        },
        { cluster: id, key: TOKEN_KEY },
      );
      expect(observed.status, `GET /api/v1/clusters/${id}: ${observed.body}`).toBe(200);
      expect(
        observed.state,
        `GET /api/v1/clusters/${id} answered ${observed.status}: ${observed.body}`,
      ).toBe('running');

      await page.getByRole('button', { name: 'Terminate' }).click();
      // A destructive control may ask; either shape is fine, and a missing
      // dialog must not fail the test.
      const confirm = page.getByRole('button', { name: /terminate|confirm|yes/i }).last();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }

      // Terminate is accepted, not instant: the record is tombstoned and the
      // reconciler reaps. The app routes back to the list once the control
      // plane has taken the request, which is the first thing to wait for.
      await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible({
        timeout: 60_000,
      });

      // It is no longer offered among the live clusters.
      await expect(page.getByRole('link', { name: id, exact: true })).toHaveCount(0, {
        timeout: 120_000,
      });

      // And it is hidden rather than lost — asserted on the record's own page,
      // and deliberately not as "the row is gone": an absence is also what an
      // unrendered page looks like, so that alone passes whether or not
      // anything happened. A badge has to be rendered to be true.
      await page.goto(`${UI}/clusters/${id}`);
      await expect(
        page.getByTitle(/Terminal state|being torn down/).first(),
      ).toBeVisible({ timeout: 300_000 });
    } finally {
      // The belt: whatever the browser did or failed to do, this cluster is
      // not left running on a shared deployment. Deleted through the page's
      // own origin with the session's bearer, so it needs no second identity.
      await page
        .evaluate(
          async ({ cluster, key }) => {
            await fetch(`/api/v1/clusters/${cluster}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${window.localStorage.getItem(key)}` },
            }).catch(() => undefined);
          },
          { cluster: id, key: TOKEN_KEY },
        )
        .catch(() => undefined);
    }
  });
});
