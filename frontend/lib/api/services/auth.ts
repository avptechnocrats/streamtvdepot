/**
 * Auth API Service
 *
 * Covers superadmin + client-admin authentication flows.
 * Each function maps directly to a backend endpoint.
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    /** Present only from the unified /auth/login endpoint */
    role?: "superadmin" | "client_admin";
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RefreshRequest {
    refresh_token: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ForgotPasswordResponse {
    message: string;
    reset_token?: string;
}

export interface ResetPasswordRequest {
    token: string;
    new_password: string;
}

export interface ChangePasswordRequest {
    current_password: string;
    new_password: string;
}

export interface SaasRegisterRequest {
    platform_name: string;
    platform_slug: string;
    email: string;
    full_name: string;
    password: string;
    domain?: string | null;
    phone?: string | null;
    country?: string | null;
    timezone?: string;
}

export interface SaasRegisterResponse {
    client_id: string;
    client_slug: string;
    verification_email_sent: boolean;
    message: string;
}

export interface VerifyEmailResponse {
    verified: boolean;
    message: string;
    access_token?: string | null;
    refresh_token?: string | null;
    token_type?: string;
    role?: "client_admin" | null;
    email?: string | null;
    full_name?: string | null;
}

// ─── Superadmin auth ──────────────────────────────────────────────────────────

export async function superadminLogin(payload: LoginRequest): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>(
        ENDPOINTS.auth.superadmin.login,
        payload,
    );
    return data;
}

export async function superadminRefresh(refreshToken: string): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>(
        ENDPOINTS.auth.superadmin.refresh,
        { refresh_token: refreshToken } satisfies RefreshRequest,
    );
    return data;
}

export async function superadminForgotPassword(
    email: string,
): Promise<ForgotPasswordResponse> {
    const { data } = await apiClient.post<ForgotPasswordResponse>(
        ENDPOINTS.auth.superadmin.forgotPassword,
        { email } satisfies ForgotPasswordRequest,
    );
    return data;
}

export async function superadminResetPassword(
    payload: ResetPasswordRequest,
): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.superadmin.resetPassword, payload);
}

export async function superadminChangePassword(
    payload: ChangePasswordRequest,
): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.superadmin.changePassword, payload);
}

// ─── Client admin auth ────────────────────────────────────────────────────────

export async function clientAdminLogin(payload: LoginRequest): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>(
        ENDPOINTS.auth.clientAdmin.login,
        payload,
    );
    return data;
}

export async function saasRegister(payload: SaasRegisterRequest): Promise<SaasRegisterResponse> {
    const { data } = await apiClient.post<SaasRegisterResponse>(
        ENDPOINTS.auth.register,
        payload,
    );
    return data;
}

export async function verifySignupEmail(token: string): Promise<VerifyEmailResponse> {
    const { data } = await apiClient.get<VerifyEmailResponse>(
        ENDPOINTS.auth.verifySignupEmail,
        { params: { token } },
    );
    return data;
}

// ─── Unified login (preferred for the admin portal login page) ────────────────

/**
 * Single endpoint that resolves both superadmin and client-admin credentials.
 * The returned ``role`` field tells the caller which account type was matched.
 */
export async function unifiedLogin(payload: LoginRequest): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>(ENDPOINTS.auth.login, payload);
    return data;
}

export async function unifiedForgotPassword(
    email: string,
): Promise<ForgotPasswordResponse> {
    const { data } = await apiClient.post<ForgotPasswordResponse>(
        ENDPOINTS.auth.forgotPassword,
        { email } satisfies ForgotPasswordRequest,
    );
    return data;
}

export async function unifiedResetPassword(
    payload: ResetPasswordRequest,
): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.resetPassword, payload);
}

export async function clientAdminForgotPassword(
    email: string,
): Promise<ForgotPasswordResponse> {
    const { data } = await apiClient.post<ForgotPasswordResponse>(
        ENDPOINTS.auth.clientAdmin.forgotPassword,
        { email } satisfies ForgotPasswordRequest,
    );
    return data;
}

export async function clientAdminResetPassword(
    payload: ResetPasswordRequest,
): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.clientAdmin.resetPassword, payload);
}

export async function clientAdminChangePassword(
    payload: ChangePasswordRequest,
): Promise<void> {
    await apiClient.post(ENDPOINTS.auth.clientAdmin.changePassword, payload);
}

// ─── Shared refresh (used by the axios interceptor) ───────────────────────────

/**
 * Attempts to refresh the access token using the stored refresh token.
 * The interceptor in client.ts detects which endpoint to use based on the
 * active session role stored alongside the tokens.
 *
 * For simplicity, we try superadmin first; fall back to client-admin.
 * If you store the role in localStorage, read it here to call the right endpoint.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const role = typeof window !== "undefined"
        ? localStorage.getItem("sv_role")
        : null;

    const primaryEndpoint =
        role === "superadmin"
            ? ENDPOINTS.auth.superadmin.refresh
            : ENDPOINTS.auth.clientAdmin.refresh;
    const fallbackEndpoint =
        primaryEndpoint === ENDPOINTS.auth.superadmin.refresh
            ? ENDPOINTS.auth.clientAdmin.refresh
            : ENDPOINTS.auth.superadmin.refresh;

    // Use a plain axios call (bypassing the interceptor) to avoid infinite loop
    const { default: axios } = await import("axios");
    try {
        const { data } = await axios.post<TokenResponse>(
            `${process.env.NEXT_PUBLIC_API_URL}${primaryEndpoint}`,
            { refresh_token: refreshToken },
            { headers: { "Content-Type": "application/json" } },
        );
        return data;
    } catch {
        const { data } = await axios.post<TokenResponse>(
            `${process.env.NEXT_PUBLIC_API_URL}${fallbackEndpoint}`,
            { refresh_token: refreshToken },
            { headers: { "Content-Type": "application/json" } },
        );
        return data;
    }
}
