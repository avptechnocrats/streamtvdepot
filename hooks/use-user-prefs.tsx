"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface UserPrefs {
    accentColor: "gold" | "cyan" | "orange" | "green" | "purple" | "rose";
    radius: "sharp" | "rounded";
    bannerStyle: "static" | "slider" | "video";
    cardStyle: "default" | "detailed";
}

const DEFAULT_PREFS: UserPrefs = {
    accentColor: "gold",
    radius: "sharp",
    bannerStyle: "static",
    cardStyle: "default",
};

const ACCENT_MAP: Record<UserPrefs["accentColor"], { hsl: string; g1: string; g2: string; g3: string }> = {
    gold: { hsl: "40 90% 55%", g1: "hsl(40 90% 55%)", g2: "hsl(45 100% 70%)", g3: "hsl(35 80% 50%)" },
    cyan: { hsl: "190 90% 50%", g1: "hsl(190 90% 50%)", g2: "hsl(195 100% 65%)", g3: "hsl(185 80% 42%)" },
    orange: { hsl: "20 100% 55%", g1: "hsl(20 100% 55%)", g2: "hsl(35 100% 65%)", g3: "hsl(10 90% 48%)" },
    green: { hsl: "152 60% 45%", g1: "hsl(152 60% 45%)", g2: "hsl(160 70% 60%)", g3: "hsl(145 55% 38%)" },
    purple: { hsl: "270 70% 60%", g1: "hsl(270 70% 60%)", g2: "hsl(280 80% 72%)", g3: "hsl(260 65% 52%)" },
    rose: { hsl: "340 80% 55%", g1: "hsl(340 80% 55%)", g2: "hsl(350 90% 68%)", g3: "hsl(330 75% 48%)" },
};

const RADIUS_MAP: Record<UserPrefs["radius"], string> = {
    sharp: "0.125rem",
    rounded: "1rem",
};

function applyPrefs(prefs: UserPrefs) {
    const root = document.documentElement;
    const a = ACCENT_MAP[prefs.accentColor];
    root.style.setProperty("--primary", a.hsl);
    root.style.setProperty("--accent", a.hsl);
    root.style.setProperty("--ring", a.hsl);
    root.style.setProperty("--gold", a.hsl);
    root.style.setProperty("--sidebar-primary", a.hsl);
    root.style.setProperty("--gradient-primary-1", a.g1);
    root.style.setProperty("--gradient-primary-2", a.g2);
    root.style.setProperty("--gradient-primary-3", a.g3);
    root.style.setProperty("--radius", RADIUS_MAP[prefs.radius]);
    root.setAttribute("data-radius", prefs.radius);
}

interface UserPrefsContextType {
    prefs: UserPrefs;
    setPrefs: (patch: Partial<UserPrefs>) => void;
    /** True once the API-loaded settings have been applied (or the request failed). */
    prefsReady: boolean;
    markPrefsReady: () => void;
}

const UserPrefsContext = createContext<UserPrefsContextType>({
    prefs: DEFAULT_PREFS,
    setPrefs: () => { },
    prefsReady: false,
    markPrefsReady: () => { },
});

export function UserPrefsProvider({ children }: { children: React.ReactNode }) {
    const [prefs, setState] = useState<UserPrefs>(DEFAULT_PREFS);
    const [prefsReady, setPrefsReady] = useState(false);

    useEffect(() => {
        // Apply the default CSS vars immediately on mount.
        // The real values are hydrated by useThemeSettings() once the API responds.
        applyPrefs(DEFAULT_PREFS);
    }, []);

    const setPrefs = (patch: Partial<UserPrefs>) => {
        const next = { ...prefs, ...patch };
        setState(next);
        applyPrefs(next);
    };

    const markPrefsReady = () => setPrefsReady(true);

    return (
        <UserPrefsContext.Provider value={{ prefs, setPrefs, prefsReady, markPrefsReady }}>
            {children}
        </UserPrefsContext.Provider>
    );
}

export function useUserPrefs() {
    return useContext(UserPrefsContext);
}
