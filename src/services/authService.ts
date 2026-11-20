import { apiClient } from "@/api/client";
import { clientConfig } from "@/config/clientConfig";
import { UserProfile } from "@/types/models";

interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user?: UserProfile;
}

export interface SignupResponse {
  verification_required: boolean;
  verification_email_sent: boolean;
  email: string | null;
  message: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
  mode: "email" | "phone";
}

// ── Unauthenticated — client_slug injected into body (mirrors middleware.ts) ──

export async function login({ identifier, password, mode }: LoginPayload): Promise<AuthResponse> {
  const payload = {
    password,
    client_slug: clientConfig.slug,
    ...(mode === "phone" ? { phone: identifier } : { email: identifier }),
  };

  const { data } = await apiClient.post<AuthResponse>("/auth/user/login", payload);
  return data;
}

export async function signup(fullName: string, email: string, password: string): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>("/auth/user/signup", {
    full_name: fullName,
    email,
    password,
    client_slug: clientConfig.slug,
  });
  return data;
}

export interface VerifyEmailResponse {
  verified: boolean;
  message: string;
  access_token?: string;
  refresh_token?: string;
  user?: UserProfile;
}

export async function verifyEmail(email: string, otp: string): Promise<VerifyEmailResponse> {
  const { data } = await apiClient.post<VerifyEmailResponse>("/auth/user/verify-email", {
    email,
    otp,
    client_slug: clientConfig.slug,
  });
  return data;
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>("/auth/user/resend-verification", {
    email,
    client_slug: clientConfig.slug,
  });
  return data;
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post("/auth/user/forgot-password", {
    email,
    client_slug: clientConfig.slug,
  });
}

// reset-password does NOT require client_slug (matches middleware SLUG_REQUIRED set)
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/user/reset-password", {
    token,
    new_password: newPassword,
  });
}

// refresh does NOT require client_slug — token already encodes the tenant
export async function refreshSession(refreshToken: string): Promise<{ access_token: string; refresh_token?: string }> {
  const { data } = await apiClient.post<{ access_token: string; refresh_token?: string }>(
    "/auth/user/refresh",
    { refresh_token: refreshToken },
  );
  return data;
}

// ── Authenticated — Bearer token identifies user + tenant ─────────────────────

export async function fetchMe(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>("/auth/user/account");
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/user/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
