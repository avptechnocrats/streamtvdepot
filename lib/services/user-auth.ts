/**
 * User auth service — calls the Next.js route handlers under /api/auth/*.
 * These routes proxy to the backend and inject CLIENT_SLUG server-side.
 */

export interface UserSignupPayload {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    country?: string;
}

export interface UserLoginPayload {
    email: string;
    password: string;
}

export interface UserTokenResponse {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    requires_subscription?: boolean;
}

export interface ChangePasswordPayload {
    current_password: string;
    new_password: string;
}

export interface ForgotPasswordPayload {
    email: string;
}

export interface ResetPasswordPayload {
    token: string;
    new_password: string;
}

async function post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    // 204 No Content — success with empty body (e.g. change-password)
    if (res.status === 204) {
        return undefined as unknown as T;
    }

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.detail ?? "Request failed");
    }
    return data as T;
}

export interface UserSignupResponse {
    verification_required: boolean;
    verification_email_sent: boolean;
    email: string | null;
    message: string;
    access_token: string | null;
    refresh_token: string | null;
    token_type?: string;
}

export async function userSignup(payload: UserSignupPayload): Promise<UserSignupResponse> {
    return post<UserSignupResponse>("/api/auth/signup", payload);
}

export async function userLogin(payload: UserLoginPayload): Promise<UserTokenResponse> {
    return post<UserTokenResponse>("/api/auth/login", payload);
}

export async function userRefresh(refreshToken: string): Promise<UserTokenResponse> {
    return post<UserTokenResponse>("/api/auth/refresh", { refresh_token: refreshToken });
}

export async function userChangePassword(
    payload: ChangePasswordPayload,
    accessToken: string,
): Promise<void> {
    await post<unknown>("/api/auth/change-password", payload, accessToken);
}

export async function userForgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
    return post<{ message: string }>("/api/auth/forgot-password", payload);
}

export async function userResetPassword(payload: ResetPasswordPayload): Promise<void> {
    await post<unknown>("/api/auth/reset-password", payload);
}

export interface VerifyEmailResponse {
    verified: boolean;
    message: string;
}

export async function userVerifyEmail(email: string, otp: string): Promise<VerifyEmailResponse> {
    return post<VerifyEmailResponse>("/api/auth/verify-email", { email, otp });
}

export async function userResendVerification(email: string): Promise<{ message: string }> {
    return post<{ message: string }>("/api/auth/resend-verification", { email });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    client_id: string;
    email: string;
    full_name: string;
    phone: string | null;
    avatar_asset_id: string | null;
    avatar_url: string | null;
    country: string | null;
    billing_line1: string | null;
    billing_line2: string | null;
    billing_city: string | null;
    billing_state: string | null;
    billing_postal_code: string | null;
    billing_country: string | null;
    is_active: boolean;
    is_email_verified: boolean;
    created_at: string;
    updated_at: string;
}

export interface UpdateProfilePayload {
    full_name?: string;
    phone?: string;
    country?: string;
    avatar_asset_id?: string | null;
    billing_line1?: string | null;
    billing_line2?: string | null;
    billing_city?: string | null;
    billing_state?: string | null;
    billing_postal_code?: string | null;
    billing_country?: string | null;
}

export interface AvatarUploadPresignResponse {
    upload_url: string;
    s3_key: string;
    expires_at: string;
}

export interface AvatarUploadConfirmResponse {
    avatar_asset_id: string;
    avatar_url: string | null;
}

async function apiFetch<T>(path: string, options: RequestInit): Promise<T> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail ?? "Request failed");
    return data as T;
}

export function getMyProfile(accessToken: string): Promise<UserProfile> {
    return apiFetch<UserProfile>("/auth/user/account", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
    });
}

export function updateMyProfile(
    payload: UpdateProfilePayload,
    accessToken: string,
): Promise<UserProfile> {
    return apiFetch<UserProfile>("/auth/user/account", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
    });
}

export async function uploadMyAvatar(file: File, accessToken: string): Promise<AvatarUploadConfirmResponse> {
    const presign = await apiFetch<AvatarUploadPresignResponse>("/auth/user/account/avatar/presign", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            file_size: file.size,
        }),
    });

    const uploadRes = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
    });
    if (!uploadRes.ok) {
        throw new Error("Failed to upload avatar image");
    }

    return apiFetch<AvatarUploadConfirmResponse>("/auth/user/account/avatar/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
            s3_key: presign.s3_key,
            original_filename: file.name,
            content_type: file.type,
            file_size: file.size,
        }),
    });
}
