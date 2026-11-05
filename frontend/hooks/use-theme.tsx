"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { THEMES, DEFAULT_THEME_ID, getThemeById } from "@/themes/registry";
import type { ThemeDefinition } from "@/themes/types";

/** Storefront themes come from the API; the admin color preference is saved separately. */

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

/** Applies the selected palette to the current page. */
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
    const pathname = usePathname();
    const [activeThemeId, setActiveThemeId] = useState(DEFAULT_THEME_ID);
    const [siteThemeId, setSiteThemeId] = useState(DEFAULT_THEME_ID);
    const [adminThemeId, setAdminThemeId] = useState("gold-light");
    const isAdminRoute = pathname.startsWith("/admin");

    useEffect(() => {
        const mode = window.localStorage.getItem("sv_admin_color_mode");
        setAdminThemeId(mode === "dark" ? "dark-gold" : "gold-light");
    }, []);

    /** Keep the admin palette independent of the API-loaded storefront theme. */
    useEffect(() => {
        applyThemeToDom(getThemeById(isAdminRoute ? adminThemeId : activeThemeId));
    }, [activeThemeId, adminThemeId, isAdminRoute]);

    /** User action — personal override (Customizer Panel) */
    const setTheme = useCallback(
        (id: string) => {
            const theme = THEMES.find((t) => t.id === id);
            if (!theme) return;
            if (isAdminRoute) {
                const nextAdminTheme = id === "gold-light" ? "gold-light" : "dark-gold";
                setAdminThemeId(nextAdminTheme);
                applyThemeToDom(getThemeById(nextAdminTheme));
                window.localStorage.setItem("sv_admin_color_mode", nextAdminTheme === "gold-light" ? "light" : "dark");
                return;
            }
            setActiveThemeId(id);
            applyThemeToDom(theme);
            onThemeChange?.(theme);
        },
        [isAdminRoute, onThemeChange],
    );

    /** Admin action — sets the site-wide default and applies it immediately */
    const setSiteTheme = useCallback(
        (id: string) => {
            const theme = THEMES.find((t) => t.id === id);
            if (!theme) return;
            setSiteThemeId(id);
            setActiveThemeId(id);
            if (!isAdminRoute) {
                applyThemeToDom(theme);
                onThemeChange?.(theme);
            }
        },
        [isAdminRoute, onThemeChange],
    );

    const displayedThemeId = isAdminRoute ? adminThemeId : activeThemeId;
    const activeTheme = getThemeById(displayedThemeId);

    return (
        <ThemeContext.Provider
            value={{ activeThemeId: displayedThemeId, activeTheme, siteThemeId, setTheme, setSiteTheme, themes: THEMES }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
    return useContext(ThemeContext);
}
