/**
 * API Clients
 *
 * Architecture mirrors the Next.js middleware in Client/middleware.ts:
 *
 *  publicApiClient  →  POST/GET  {API}/public/{path}?slug={CLIENT_SLUG}
 *                      No auth header. Slug is a QUERY PARAM (not a header).
 *
 *  apiClient        →  POST/GET  {API}/{path}
 *                      Bearer token injected. 401 auto-retries with refresh token.
 *                      Used for: /auth/user/* authenticated endpoints, /drm/*
 *
 * Auth unauthenticated calls (login, signup, forgot-password) are made via
 * apiClient but the service layer adds { client_slug } to the request body.
 */
import axios from "axios";
import { env } from "@/constants/env";
import { clientConfig } from "@/config/clientConfig";
import { useAuthStore } from "@/store/authStore";
import { saveTokens } from "@/services/sessionStorage";

// ── Public API (no auth, slug as query param) ─────────────────────────────────

export const publicApiClient = axios.create({
  baseURL: `${env.apiBaseUrl}/public`,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

publicApiClient.interceptors.request.use((config) => {
  // Backend expects ?slug= not an X- header
  config.params = { ...(config.params ?? {}), slug: clientConfig.slug };
  return config;
});

// ── Authenticated API (Bearer token, 401 refresh retry) ───────────────────────

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as { _retry?: boolean; headers?: Record<string, string> } | undefined;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, clearSession, setTokenOnly } = useAuthStore.getState();
    if (!refreshToken) {
      clearSession();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshResult = await axios.post<{ access_token: string; refresh_token?: string }>(
        `${env.apiBaseUrl}/auth/user/refresh`,
        { refresh_token: refreshToken },
        {
          timeout: 15000,
          headers: { "Content-Type": "application/json" },
        },
      );

      const nextAccess = refreshResult.data.access_token;
      const nextRefresh = refreshResult.data.refresh_token ?? refreshToken;

      await saveTokens(nextAccess, nextRefresh);
      await setTokenOnly(nextAccess, nextRefresh);

      originalRequest.headers = {
        ...(originalRequest.headers ?? {}),
        Authorization: `Bearer ${nextAccess}`,
      };

      return apiClient.request(originalRequest);
    } catch (refreshError) {
      clearSession();
      return Promise.reject(refreshError);
    }
  },
);
