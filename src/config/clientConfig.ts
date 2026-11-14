/**
 * clientConfig — per-tenant values injected at build time via react-native-config.
 *
 * API_BASE_URL is intentionally NOT here: all tenants share the same central
 * API at console.signalview.tech. Only the CLIENT_SLUG tells the backend
 * which tenant's data to serve.
 *
 * Switch tenants: ./scripts/switch-client.sh <slug>
 */
import Config from "react-native-config";

export interface ClientConfig {
  /** Tenant identifier — sent as ?slug= on public routes, client_slug in auth body */
  slug: string;
  /** Human display name shown in UI, splash, OS app switcher */
  appName: string;
  /** Primary brand colour (hex) */
  primaryColor: string;
  /** Lighter variant of primary colour */
  primaryStrongColor: string;
}

export const clientConfig: ClientConfig = {
  slug: Config.CLIENT_SLUG ?? "signalview",
  appName: Config.APP_NAME ?? "SignalView",
  primaryColor: Config.PRIMARY_COLOR ?? "#f4b844",
  primaryStrongColor: Config.PRIMARY_STRONG_COLOR ?? "#ffcf6c",
};

/**
 * Central SaaS API shared by ALL tenants.
 * Set API_BASE_URL in .env only when pointing at a non-prod backend (dev/staging).
 */
export const PLATFORM_API_BASE_URL =
  Config.API_BASE_URL ?? "https://console.signalview.tech/api/v1";
