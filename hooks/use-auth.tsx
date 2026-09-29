"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { userRefresh } from "@/lib/services/user-auth";
import { getMyProfile } from "@/lib/services/user-profile";

const ACCESS_KEY = "sv_access_token";
const REFRESH_KEY = "sv_refresh_token";
const GEO_CACHE_KEY = "sv_geo_country";
const REFRESH_EARLY_MS = 60_000;

/**
 * Detect the user's country from their IP using Cloudflare's CDN trace endpoint.
 * Cached in sessionStorage so only one network call is made per browser session.
 * Returns an ISO 3166-1 alpha-2 code (e.g. "IN") or null on any failure.
 */
async function detectCountryFromIP(): Promise<string | null> {
    if (typeof window === "undefined") return null;

    // Return cached result from this session
    try {
        const cached = sessionStorage.getItem(GEO_CACHE_KEY);
        if (cached) return cached;
    } catch { /* sessionStorage unavailable */ }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch("https://cloudflare.com/cdn-cgi/trace", { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;

        // Plain-text response with "key=value" lines — extract "loc=XX"
        const text = await res.text();
        const match = text.match(/^loc=([A-Z]{2})$/m);
        const code = match?.[1] ?? null;

        if (code) {
            try { sessionStorage.setItem(GEO_CACHE_KEY, code); } catch { /* ignore */ }
        }
        return code;
    } catch {
        return null; // Network error or 3 s timeout
    }
}

export interface AuthUser {
    /** Decoded from the access token JWT payload */
    id: string;
    email: string;
    full_name: string;
    client_id: string;
    phone?: string | null;
    country?: string | null; // ISO 3166-1 alpha-2 code (e.g., "IN", "US", "GB")
    avatar_url?: string | null;
}

interface AuthContextType {
    user: AuthUser | null;
    accessToken: string | null;
    isLoading: boolean;
    login: (accessToken: string, refreshToken: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    accessToken: null,
    isLoading: true,
    login: () => { },
    logout: () => { },
});

/** Decode JWT payload without verifying signature (client-side only). */
function decodePayload(token: string): Record<string, unknown> | null {
    try {
        const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

function payloadToUser(payload: Record<string, unknown>): AuthUser {
    return {
        id: payload.sub as string,
        email: (payload.email as string) ?? "",
        full_name: (payload.full_name as string) ?? "",
        client_id: (payload.client_id as string) ?? "",
        country: (payload.country as string | null | undefined) ?? null,
        avatar_url: null,
    };
}

function isExpired(token: string): boolean {
    const p = decodePayload(token);
    if (!p || typeof p.exp !== "number") return true;
    // 30-second buffer so we refresh before the server rejects
    return p.exp * 1000 < Date.now() + 30_000;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    /** Fetch profile from API and merge country into user state.
     *  Falls back to IP geolocation when the profile has no country set. */
    const enrichWithProfile = useCallback(async (baseUser: AuthUser) => {
        try {
            const profile = await getMyProfile();
            const country = profile.country ?? await detectCountryFromIP();
            setUser({
                ...baseUser,
                email: profile.email ?? baseUser.email,
                full_name: profile.full_name ?? baseUser.full_name,
                phone: profile.phone,
                country: country ?? null,
                avatar_url: profile.avatar_url ?? null,
            });
        } catch {
            // Profile fetch failed — still attempt IP geolocation
            const country = await detectCountryFromIP();
            setUser({ ...baseUser, country: country ?? null, avatar_url: baseUser.avatar_url ?? null });
        }
    }, []);

    const applyTokens = useCallback((access: string, refresh: string) => {
        localStorage.setItem(ACCESS_KEY, access);
        localStorage.setItem(REFRESH_KEY, refresh);
        const payload = decodePayload(access);
        const baseUser = payload ? payloadToUser(payload) : null;
        setAccessToken(access);
        setUser(baseUser);
        if (baseUser) enrichWithProfile(baseUser);
    }, [enrichWithProfile]);

    const logout = useCallback(() => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setAccessToken(null);
        setUser(null);
    }, []);

    const login = useCallback(
        (access: string, refresh: string) => applyTokens(access, refresh),
        [applyTokens],
    );

    /** On mount — restore session from localStorage, refreshing if expired. */
    useEffect(() => {
        const access = localStorage.getItem(ACCESS_KEY);
        const refresh = localStorage.getItem(REFRESH_KEY);

        if (!access || !refresh) {
            setIsLoading(false);
            return;
        }

        if (!isExpired(access)) {
            applyTokens(access, refresh);
            setIsLoading(false);
            return;
        }

        // Access token expired — try silent refresh
        userRefresh(refresh)
            .then((tokens) => applyTokens(tokens.access_token, tokens.refresh_token))
            .catch(() => logout())
            .finally(() => setIsLoading(false));
    }, [applyTokens, logout]);

    /**
     * Keep an active viewer signed in by rotating the session shortly before
     * the access token expires. Browsers may pause timers in background tabs,
     * so visibility changes also check whether a refresh is due.
     */
    useEffect(() => {
        if (!accessToken) return;

        const refreshToken = localStorage.getItem(REFRESH_KEY);
        const payload = decodePayload(accessToken);
        if (!refreshToken || typeof payload?.exp !== "number") return;

        let refreshStarted = false;
        const refreshSession = () => {
            if (refreshStarted) return;
            refreshStarted = true;
            userRefresh(refreshToken)
                .then((tokens) => applyTokens(tokens.access_token, tokens.refresh_token))
                .catch(() => logout());
        };

        const refreshAt = payload.exp * 1000 - REFRESH_EARLY_MS;
        const refreshTimer = window.setTimeout(
            refreshSession,
            Math.max(0, refreshAt - Date.now()),
        );
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && Date.now() >= refreshAt) {
                refreshSession();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.clearTimeout(refreshTimer);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [accessToken, applyTokens, logout]);

    return (
        <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
