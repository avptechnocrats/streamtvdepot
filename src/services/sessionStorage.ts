/**
 * Secure Token Storage — react-native-keychain
 *
 * Stores tokens in the platform's native secure enclave:
 *   iOS  → Keychain Services (hardware-backed on devices with Secure Enclave)
 *   Android → Android Keystore System (SECURITY_LEVEL.SECURE_HARDWARE when available)
 *
 * Accessible.AFTER_FIRST_UNLOCK: tokens survive reboots and background refresh
 * without requiring an extra unlock, matching the behaviour expected by OTT apps.
 */
import * as Keychain from "react-native-keychain";

const SVC_ACCESS = "com.signalview.token.access";
const SVC_REFRESH = "com.signalview.token.refresh";
const USERNAME_PLACEHOLDER = "session";

const KEYCHAIN_OPTIONS: Keychain.Options = {
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
};

const KEYCHAIN_FALLBACK_OPTIONS: Keychain.Options = {
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
};

async function setPasswordWithFallback(service: string, value: string): Promise<void> {
  try {
    await Keychain.setGenericPassword(USERNAME_PLACEHOLDER, value, {
      ...KEYCHAIN_OPTIONS,
      service,
    });
  } catch (error) {
    console.warn(`[auth] secure hardware keychain unavailable for ${service}, retrying with fallback`, error);
    await Keychain.setGenericPassword(USERNAME_PLACEHOLDER, value, {
      ...KEYCHAIN_FALLBACK_OPTIONS,
      service,
    });
  }
}

export async function saveTokens(accessToken: string, refreshToken: string | null): Promise<void> {
  await setPasswordWithFallback(SVC_ACCESS, accessToken);

  if (refreshToken) {
    await setPasswordWithFallback(SVC_REFRESH, refreshToken);
  }
}

export async function getAccessToken(): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: SVC_ACCESS });
  return result !== false ? result.password : null;
}

export async function getRefreshToken(): Promise<string | null> {
  const result = await Keychain.getGenericPassword({ service: SVC_REFRESH });
  return result !== false ? result.password : null;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    Keychain.resetGenericPassword({ service: SVC_ACCESS }),
    Keychain.resetGenericPassword({ service: SVC_REFRESH }),
  ]);
}
