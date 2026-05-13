/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google Maps API key with the Routes API enabled. Optional —
   * when unset, the map shows a stylized curved line instead of an
   * actual walking route.
   *
   * Restrict the key to your deployed domain via HTTP referrer in
   * Google Cloud Console before exposing it to the public web.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;

  /**
   * Cloudflare Web Analytics beacon token. Optional — when unset,
   * no analytics script is injected (dev / preview / self-hosted-
   * without-CF builds get no telemetry by default).
   */
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

