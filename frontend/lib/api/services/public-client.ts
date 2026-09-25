/**
 * Public Client API Service
 *
 * Fetches the public client config by slug (no authentication required).
 * The slug comes from process.env.CLIENT_SLUG (server-side) or the
 * /api/config route handler (client-side), and is sent automatically
 * as the X-Client-Slug header on all subsequent requests.
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientThemeConfig {
    theme_id?: string;
    radius?: string;
    banner_style?: string;
    card_style?: string;
    primary_color?: string;
    font?: string;
    favicon_url?: string;
    [key: string]: unknown;
}

export interface PublicClientConfig {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    logo_url: string | null;
    timezone: string;
    is_active: boolean;
    theme_config: ClientThemeConfig | null;
}

// ─── Service function ─────────────────────────────────────────────────────────

export async function fetchPublicClientConfig(slug: string): Promise<PublicClientConfig> {
    const res = await apiClient.get<PublicClientConfig>(ENDPOINTS.public.client, {
        params: { slug },
    });
    return res.data;
}
