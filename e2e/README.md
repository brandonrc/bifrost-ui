# Browser tests

The dashboard driven in a real browser, signing in through a real Keycloak,
against a real Bifrost. Three bugs shipped past a full unit suite because the
suite never signed anyone in as an ordinary user — these exist so the next one
does not.

## The two lanes

**local** — `e2e/stack`: Keycloak with a realm shaped like a deployment,
Bifrost with OIDC auth and an in-memory store, and this SPA served by the
repository's own `nginx.conf`. No Kubernetes, so nothing here provisions
anything. Runs on every pull request.

```sh
npm run build        # the stack serves dist/
npm run e2e:up       # docker compose + waits until a sign-in would work
npm run test:e2e
npm run e2e:down
```

**live** — a deployment with a provisioner, where a cluster created from the
form really converges:

```sh
BIFROST_E2E_LIVE=1 \
BIFROST_UI_URL=https://bifrost.example \
BIFROST_E2E_KEYCLOAK=https://keycloak.example \
BIFROST_E2E_REALM=nebari \
BIFROST_E2E_CLIENT_ID=bifrost-bifrost-ui-spa \
BIFROST_E2E_ADMIN=admin BIFROST_E2E_ADMIN_PASSWORD=... \
BIFROST_E2E_OPERATOR=alice BIFROST_E2E_OPERATOR_PASSWORD=... \
BIFROST_E2E_PROJECT=team-a \
npm run test:e2e
```

Every host, user and realm is an environment variable (`e2e/env.ts`); a spec
that hardcodes a deployment is a spec that only ever ran once. Without
`BIFROST_E2E_LIVE=1` the specs that need a provisioner skip rather than fail.

## What the realm has that a default one does not

`stack/realm.json` carries two protocol mappers on the SPA client, and both
are there because their absence broke a real deployment:

- an **audience mapper** naming the client. Keycloak's default SPA token
  carries `account` alone, which Bifrost refuses — every request 401s after a
  login that looked perfect.
- a **group-membership mapper** (full path, matching `strip_prefix: "/"`).
  Bifrost derives project roles from groups, so without this claim a user with
  grants looks like a user with none and the dashboard shows an empty list.

`nebari-operator` provisions neither. On grace they were added by hand and
nothing would recreate them.

## The user who finds the bugs

`e2e-alice` holds **no global role at all** — one group, `/team-a`, which
Bifrost maps to `operator` on the `team-a` project. Her identity comes back as
`roles: []` with `projects: [{team-a, operator}]`, and that is the shape every
gate written against global roles got wrong. Sign in as the admin and the
dashboard looks fine; sign in as her and it does not.

## Adding a spec

Anything that needs only the API — identity, gating, what a page renders —
belongs in `dashboard.spec.ts` and runs on both lanes. Anything that needs a
cluster to actually come up belongs in `lifecycle.spec.ts` behind
`test.skip(!LIVE, ...)`. Seeding is fine on the local stack (there is no
provisioner behind it) and is guarded by `!LIVE` so a live deployment is never
given work by a read-only spec.
