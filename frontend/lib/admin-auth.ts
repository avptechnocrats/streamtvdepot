/**
 * Admin Authentication
 *
 * Session management helpers used by AdminAuthProvider (use-admin-auth.tsx).
 * Credential validation calls the external API via the axios client.
 */

import { unifiedLogin, setTokens } from "@/lib/api";
import type { AxiosError } from "axios";

// ─── Session shape ─────────────────────────────────────────────────────────────
export const ADMIN_SESSION_KEY = "signalview-admin-session";

/** How long a UI session remains active (default: 8 hours) */
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export type AdminRole = "superadmin" | "clientAdmin";

export interface AdminSession {
    email: string;
    fullName?: string;
    role: AdminRole;
    loginAt: number;
    expiresAt: number;
}

export function createSession(email: string, role: AdminRole, fullName?: string): AdminSession {
    const now = Date.now();
    return { email, fullName, role, loginAt: now, expiresAt: now + SESSION_DURATION_MS };
}

export function isSessionValid(session: AdminSession): boolean {
    return Date.now() < session.expiresAt;
}

function toTitleCaseWord(value: string): string {
    if (!value) return "";
    return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function emailPrefix(email: string): string {
    return email.split("@")[0] || "Admin";
}

export function getAdminFirstName(session: Pick<AdminSession, "email" | "fullName"> | null | undefined): string {
    if (!session) return "Admin";

    const fromFullName = (session.fullName || "").trim();
    if (fromFullName) {
        const first = fromFullName.split(/\s+/)[0] || "";
        return toTitleCaseWord(first) || "Admin";
    }

    return toTitleCaseWord(emailPrefix(session.email));
}

export function getAdminDisplayName(session: Pick<AdminSession, "email" | "fullName"> | null | undefined): string {
    if (!session) return "Admin";
    const fromFullName = (session.fullName || "").trim();
    if (fromFullName) return fromFullName;
    return toTitleCaseWord(emailPrefix(session.email));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
        const json = atob(padded);
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function getFullNameFromAccessToken(accessToken: string): string | undefined {
    const payload = decodeJwtPayload(accessToken);
    const raw = payload?.full_name;
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    return trimmed || undefined;
}

/**
 * Reads the client_slug claim from a clientAdmin JWT access token.
 * The backend embeds the slug so every API request is tenant-scoped.
 */
export function getClientSlugFromAccessToken(accessToken: string): string | null {
    const payload = decodeJwtPayload(accessToken);
    // Try the most common field names the backend might use
    for (const key of ["client_slug", "slug"]) {
        const value = payload?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

// ─── Credential validation ─────────────────────────────────────────────────────

/**
 * Calls the unified /auth/login endpoint.
 * The backend resolves whether the credentials belong to a superadmin or
 * client-admin and returns a ``role`` field, so a single network request
 * replaces the previous two-call fallback pattern.
 */
export async function validateCredentials(
    email: string,
    password: string,
): Promise<{ ok: boolean; role?: AdminRole; fullName?: string; error?: string }> {
    try {
        const tokens = await unifiedLogin({ email, password });
        setTokens(tokens.access_token, tokens.refresh_token);
        const role: AdminRole = tokens.role === "superadmin" ? "superadmin" : "clientAdmin";
        const fullName = getFullNameFromAccessToken(tokens.access_token);
        localStorage.setItem("sv_role", role === "superadmin" ? "superadmin" : "clientAdmin");
        return { ok: true, role, fullName };
    } catch (err) {
        const axiosErr = err as AxiosError<{ detail?: string }>;
        const message = axiosErr.response?.data?.detail ?? "Invalid credentials.";
        return { ok: false, error: message };
    }
}
