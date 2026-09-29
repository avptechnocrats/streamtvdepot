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

apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as FailedRequest | undefined;

        // Skip refresh logic for auth endpoints (login, refresh, etc.), for the
        // best-effort DRM key-token fetch (free/linear playback must not bounce
        // anonymous viewers to /login), and for any already-retried request.
        if (
            error.response?.status !== 401 ||
            !originalRequest ||
            originalRequest._retry ||
            originalRequest.url?.includes("/auth/") ||
            originalRequest.url?.includes("/drm/key-token")
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
            const refreshRes = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/auth/user/refresh`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                },
            );
            if (!refreshRes.ok) throw new Error("Refresh failed");
            const tokens = await refreshRes.json();

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
