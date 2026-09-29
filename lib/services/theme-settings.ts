/**
 * Theme Settings API Service
 *
 * GET /public/theme-settings — load theme settings set by the Client Admin
 *   (served via the public API, no auth required)
 */

import publicApiClient from "./public-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RadiusType = "sharp" | "rounded";
export type BannerStyleType = "static" | "slider" | "video";
export type CardStyleType = "default" | "detailed";

export interface ThemeSettingsPayload {
    theme_id: string;
    radius: RadiusType;
    banner_style: BannerStyleType;
    card_style: CardStyleType;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function fetchThemeSettings(): Promise<ThemeSettingsPayload> {
    const res = await publicApiClient.get<ThemeSettingsPayload>("/theme-settings");
    return res.data;
}
