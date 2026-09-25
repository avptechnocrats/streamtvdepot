/**
 * Axios API Client
 *
 * - Reads base URL from NEXT_PUBLIC_API_URL
 * - Request interceptor  → attaches Bearer token from localStorage
 * - Response interceptor → on 401, attempts a silent token refresh;
 *   if that fails, clears stored tokens and redirects to the relevant login page
 */

import axios, {
    type AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "@/hooks/use-toast";

// ─── Client slug (set at runtime from /api/config) ───────────────────────────

/**
 * The current client slug, injected into every request as X-Client-Slug.
 * Set by ClientConfigProvider on bootstrap via setClientSlug().
 */
let _clientSlug: string | null = null;

export function setClientSlug(slug: string): void {
    _clientSlug = slug;
}

// ─── Token storage keys ───────────────────────────────────────────────────────

export const TOKEN_KEYS = {
    access: "sv_access_token",
    refresh: "sv_refresh_token",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(key: keyof typeof TOKEN_KEYS): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEYS[key]);
}

export function setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEYS.access, accessToken);
    localStorage.setItem(TOKEN_KEYS.refresh, refreshToken);
}

export function clearTokens(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEYS.access);
    localStorage.removeItem(TOKEN_KEYS.refresh);
}

// ─── Create instance ──────────────────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 15_000,
});

// ─── Request interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = getToken("access");
        if (token) {
            config.headers.set("Authorization", `Bearer ${token}`);
        }
        if (_clientSlug) {
            config.headers.set("X-Client-Slug", _clientSlug);
        }
        return config;
    },
    (error: AxiosError) => Promise.reject(error),
);

// ─── Response interceptor + 401 silent refresh ───────────────────────────────

/** Tracks whether a token refresh is already in-flight */
let isRefreshing = false;

/** Queued callbacks that will be retried once the new token arrives */
let pendingQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
    pendingQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else if (token) {
            resolve(token);
        }
    });
    pendingQueue = [];
}

interface FailedRequest extends AxiosRequestConfig {
    _retry?: boolean;
}

let lastTenantPlanToastAt = 0;

function extractTenantPlanInactiveMessage(error: AxiosError): string | null {
    const status = error.response?.status;
    if (status !== 503) return null;

    const payload = error.response?.data as
        | { detail?: string | { code?: string; message?: string; detail?: string } }
        | undefined;

    const detail = payload?.detail;
    if (!detail || typeof detail === "string") return null;
    if (detail.code !== "tenant_plan_inactive") return null;

    const isClientAdmin =
        typeof window !== "undefined" && localStorage.getItem("sv_role") === "clientAdmin";
    if (isClientAdmin) {
        return "Services restricted. Purchase a plan to continue";
    }

    return detail.message || detail.detail || "Service is temporarily unavailable.";
}

apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as FailedRequest | undefined;

        const tenantPlanMessage = extractTenantPlanInactiveMessage(error);
        if (tenantPlanMessage) {
            const now = Date.now();
            if (typeof window !== "undefined" && now - lastTenantPlanToastAt > 1500) {
                lastTenantPlanToastAt = now;
                toast({
                    title: "Services Restricted",
                    description: tenantPlanMessage,
                    variant: "destructive",
                    duration: 7000,
                });
            }

            error.message = tenantPlanMessage;
            return Promise.reject(error);
        }

        // Skip refresh logic for auth endpoints (login, refresh, etc.) and
        // for any request that has already been retried once.
        if (
            error.response?.status !== 401 ||
            !originalRequest ||
            originalRequest._retry ||
            originalRequest.url?.includes("/auth/")
        ) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            // Another refresh is in-flight — queue this request
            return new Promise((resolve, reject) => {
                pendingQueue.push({
                    resolve: (token) => {
                        if (originalRequest.headers) {
                            (originalRequest.headers as Record<string, string>)["Authorization"] =
                                `Bearer ${token}`;
                        }
                        resolve(apiClient(originalRequest));
                    },
                    reject,
                });
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = getToken("refresh");

        if (!refreshToken) {
            isRefreshing = false;
            clearTokens();
            redirectToLogin();
            return Promise.reject(error);
        }

        try {
            // Dynamically import to avoid circular deps
            const { refreshAccessToken } = await import("./services/auth");
            const tokens = await refreshAccessToken(refreshToken);

            setTokens(tokens.access_token, tokens.refresh_token);
            processQueue(null, tokens.access_token);

            if (originalRequest.headers) {
                (originalRequest.headers as Record<string, string>)["Authorization"] =
                    `Bearer ${tokens.access_token}`;
            }

            return apiClient(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            clearTokens();
            redirectToLogin();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    },
);

/** Redirect to the login page */
function redirectToLogin(): void {
    if (typeof window === "undefined") return;
    window.location.href = "/login";
}

export default apiClient;
