/**
 * Type declarations for react-native-config.
 * Add a new entry here whenever a new .env key is introduced.
 */
declare module "react-native-config" {
  interface NativeConfig {
    /** e.g. "signalview" | "kalingo-tv" — sent as ?slug= on public routes */
    CLIENT_SLUG?: string;
    /** Display name shown in the app and OS */
    APP_NAME?: string;
    /**
     * Central SaaS API — SAME for ALL tenants.
     * Default: https://console.signalview.tech/api/v1
     * Override in .env only for dev/staging environments.
     */
    API_BASE_URL?: string;
    /** Primary brand colour (hex string) */
    PRIMARY_COLOR?: string;
    /** Lighter variant of primary colour */
    PRIMARY_STRONG_COLOR?: string;
    /** iOS bundle identifier / Android applicationId */
    BUNDLE_ID?: string;
  }

  const Config: NativeConfig;
  export default Config;
}
