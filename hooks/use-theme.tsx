"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import { THEMES, DEFAULT_THEME_ID, getThemeById } from "@/themes/registry";
import type { ThemeDefinition } from "@/themes/types";

/** Theme now sourced from API (/api/v1/admin/theme-settings). No localStorage keys used. */

// ─── Context shape ────────────────────────────────────────────────────────────

interface ThemeContextType {
    /** ID of the currently active/visible theme */
    activeThemeId: string;
    /** Full definition object of the active theme */
    activeTheme: ThemeDefinition;
    /**
     * ID of the admin-set site default theme.
     * May differ from activeThemeId if the user has a personal override.
     */
    siteThemeId: string;
    /** User action — writes to user key only */
    setTheme: (id: string) => void;
    /**
     * Admin action — writes to site key and also applies immediately.
     * Call this from the Admin Panel theme picker.
     */
    setSiteTheme: (id: string) => void;
    /** All registered themes (for rendering pickers) */
    themes: ThemeDefinition[];
}

const ThemeContext = createContext<ThemeContextType>({
    activeThemeId: DEFAULT_THEME_ID,
    activeTheme: getThemeById(DEFAULT_THEME_ID),
    siteThemeId: DEFAULT_THEME_ID,
    setTheme: () => { },
    setSiteTheme: () => { },
    themes: THEMES,
});

// ─── DOM helper ───────────────────────────────────────────────────────────────

/** Writes `data-theme` onto <html> so the matching CSS selector takes effect. */
function applyThemeToDom(theme: ThemeDefinition) {
    document.documentElement.setAttribute("data-theme", theme.dataTheme);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
    children: ReactNode;
    /**
     * Called immediately after the active theme changes.
     * Use this in Providers.tsx to sync UserPrefs.accentColor with the
     * theme's native accent so the inline-style overrides stay consistent.
     */
    onThemeChange?: (theme: ThemeDefinition) => void;
}

export function ThemeProvider({ children, onThemeChange }: ThemeProviderProps) {
    const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID);
    const [siteThemeId, setSiteThemeId] = useState(DEFAULT_THEME_ID);

    /**
     * Init: apply the default theme to the DOM immediately.
     * The real value is hydrated by useThemeSettings() once the API responds.
     */
    useEffect(() => {
        applyThemeToDom(getThemeById(DEFAULT_THEME_ID));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** User action — personal override (Customizer Panel) */
    const setTheme = useCallback(
        (id: string) => {
            const theme = THEMES.find((t) => t.id === id);
            if (!theme) return;
            setActiveThemeId(id);
            applyThemeToDom(theme);
            onThemeChange?.(theme);
        },
        [onThemeChange],
    );

    /** Admin action — sets the site-wide default and applies it immediately */
    const setSiteTheme = useCallback(
        (id: string) => {
            const theme = THEMES.find((t) => t.id === id);
            if (!theme) return;
            setSiteThemeId(id);
            setActiveThemeId(id);
            applyThemeToDom(theme);
            onThemeChange?.(theme);
        },
        [onThemeChange],
    );

    const activeTheme = getThemeById(activeThemeId);

    return (
        <ThemeContext.Provider
            value={{ activeThemeId, activeTheme, siteThemeId, setTheme, setSiteTheme, themes: THEMES }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
    return useContext(ThemeContext);
}
