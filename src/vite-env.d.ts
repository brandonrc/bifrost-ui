/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-mode auth stub flag (spec §5.10). "true"/"false"; defaults on in dev. */
  readonly VITE_BIFROST_DEV_AUTH?: string
  /**
   * OIDC issuer base for the "how to get a token" hint on /login.
   * Defaults to the local Keycloak demo realm.
   */
  readonly VITE_BIFROST_ISSUER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
