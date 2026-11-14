import { clientConfig, PLATFORM_API_BASE_URL } from "@/config/clientConfig";

/**
 * env — convenience re-export used in api/client.ts.
 * API base is the SAME for all tenants (central SaaS console).
 * Only clientSlug changes per tenant.
 */
export const env = {
  apiBaseUrl: PLATFORM_API_BASE_URL,
  clientSlug: clientConfig.slug,
};
