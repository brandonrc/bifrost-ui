/**
 * Where the specs are pointed, and who they sign in as.
 *
 * Defaults describe the local stack (`e2e/stack`); every value is overridable
 * so the same specs run against a deployment. The users must exist in the
 * realm with the groups the deployment maps to roles: an administrator, and a
 * project operator who is *not* an administrator — most of what these specs
 * check is the difference between the two.
 */
export const UI = process.env.BIFROST_UI_URL ?? 'http://127.0.0.1:5180'
export const KEYCLOAK = process.env.BIFROST_E2E_KEYCLOAK ?? 'http://keycloak.localtest.me:5181'
export const REALM = process.env.BIFROST_E2E_REALM ?? 'bifrost-e2e'
export const SPA_CLIENT_ID = process.env.BIFROST_E2E_CLIENT_ID ?? 'bifrost-ui-spa'

export const ADMIN = {
  username: process.env.BIFROST_E2E_ADMIN ?? 'e2e-admin',
  password: process.env.BIFROST_E2E_ADMIN_PASSWORD ?? 'e2e-admin-password',
}

/** A project operator: may start clusters in their project, and nothing else. */
export const OPERATOR = {
  username: process.env.BIFROST_E2E_OPERATOR ?? 'e2e-alice',
  password: process.env.BIFROST_E2E_OPERATOR_PASSWORD ?? 'e2e-alice-password',
  project: process.env.BIFROST_E2E_PROJECT ?? 'team-a',
}

/** A deployment with a provisioner, where a created cluster really converges. */
export const LIVE = process.env.BIFROST_E2E_LIVE === '1'

export const ISSUER = `${KEYCLOAK}/realms/${REALM}`
