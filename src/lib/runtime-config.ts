/**
 * Deployment-time configuration, read at runtime from `/config.json` on the
 * UI's own origin.
 *
 * The SPA's OIDC client id and issuer are per-deployment values: the
 * operator that provisions the Keycloak client picks the id (Nebari derives
 * `<namespace>-<nebariapp-name>-spa`), and the issuer is whatever realm that
 * cluster runs. Baking them in at `vite build` time (`VITE_BIFROST_*`) means
 * one published image can only ever talk to one deployment — which is how
 * the dashboard on Grace sent a user to a stale build-time realm on
 * 2026-09-02. A Helm chart can mount a small JSON file; it cannot rebuild
 * the bundle.
 *
 * Precedence, everywhere a value is read: runtime config → `VITE_*` build
 * variable → compiled default. The backend-reported issuer from
 * `GET /api/v1/auth/providers` still wins over all three on the login page,
 * exactly as before; this only replaces the fallback chain beneath it.
 *
 * Absence is not an error: a deployment that ships no `/config.json` (the
 * dev server, an image run bare) behaves as it did before this file existed.
 */

export interface RuntimeConfig {
  /** OIDC public client id the SPA authenticates as. */
  ssoClientId?: string
  /** OIDC issuer base (`https://idp/realms/x`), no trailing slash. */
  issuer?: string
}

let current: RuntimeConfig = {}

/** Accept only non-empty strings for the keys we know; ignore the rest. */
export function parseRuntimeConfig(body: unknown): RuntimeConfig {
  if (typeof body !== 'object' || body === null) return {}
  const record = body as Record<string, unknown>
  const out: RuntimeConfig = {}
  if (typeof record.ssoClientId === 'string' && record.ssoClientId !== '') {
    out.ssoClientId = record.ssoClientId
  }
  if (typeof record.issuer === 'string' && record.issuer !== '') {
    out.issuer = record.issuer.replace(/\/+$/, '')
  }
  return out
}

/**
 * Fetch `/config.json` once at boot. Any failure (404, network, bad JSON)
 * leaves the config empty so the VITE/default chain applies; the app must
 * render either way, so this never throws.
 */
export async function loadRuntimeConfig(
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<RuntimeConfig> {
  try {
    const res = await fetchFn('/config.json', { cache: 'no-store' })
    if (!res.ok) {
      current = {}
      return current
    }
    current = parseRuntimeConfig(await res.json())
  } catch {
    current = {}
  }
  return current
}

/** The config loaded at boot (empty until `loadRuntimeConfig` resolves). */
export function runtimeConfig(): RuntimeConfig {
  return current
}

/** Test seam. */
export function setRuntimeConfigForTests(cfg: RuntimeConfig): void {
  current = cfg
}
