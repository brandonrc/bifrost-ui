/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-mode auth stub flag (spec §5.10). "true"/"false"; defaults on in dev. */
  readonly VITE_BIFROST_DEV_AUTH?: string
  /**
   * OIDC issuer base for the "how to get a token" hint on /login.
   * Defaults to the local Keycloak demo realm.
   */
  readonly VITE_BIFROST_ISSUER?: string
  /**
   * OIDC public client id to authenticate as. Per-deployment: an operator that
   * provisions the Keycloak client (Nebari derives
   * `<namespace>-<nebariapp-name>`) chooses the id, so it cannot be a literal
   * in the bundle. Defaults to the local demo realm's client when unset.
   */
  readonly VITE_BIFROST_SSO_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
