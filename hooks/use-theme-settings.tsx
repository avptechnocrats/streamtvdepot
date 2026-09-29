"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { fetchThemeSettings } from "@/lib/services";

/**
 * Fetches the admin-saved theme settings from /api/v1/admin/theme-settings
 * and applies them to the theme + user-prefs contexts.
 *
 * Call this hook once at the top of ThemeRenderer (or any page that should
 * reflect the server-saved settings). Falls back silently to whatever is
 * already in localStorage if the API call fails (e.g. not authenticated).
 */
export function useThemeSettings() {
    const { setSiteTheme } = useTheme();
    const { setPrefs, markPrefsReady } = useUserPrefs();
    const applied = useRef(false);

    useEffect(() => {
        if (applied.current) return;
        applied.current = true;

        fetchThemeSettings()
            .then((s) => {
                setSiteTheme(s.theme_id);
                setPrefs({
                    radius: s.radius,
                    bannerStyle: s.banner_style,
                    cardStyle: s.card_style,
                });
            })
            .catch(() => {
                // Silently fall back to localStorage values already loaded
            })
            .finally(() => {
                markPrefsReady();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
