/**
 * Theme Settings API Service
 *
 * GET  /admin/theme-settings  – load saved theme settings for the active client
 * PUT  /admin/theme-settings  – persist theme settings for the active client
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RadiusType = "sharp" | "default" | "rounded";
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
    const res = await apiClient.get<ThemeSettingsPayload>(ENDPOINTS.admin.themeSettings);
    return res.data;
}

export async function saveThemeSettings(
    payload: ThemeSettingsPayload,
): Promise<ThemeSettingsPayload> {
    const res = await apiClient.put<ThemeSettingsPayload>(ENDPOINTS.admin.themeSettings, payload);
    return res.data;
}
