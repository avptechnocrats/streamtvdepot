/**
 * End-user profile service
 *
 * Wraps GET /auth/user/me and PATCH /auth/user/me.
 * Uses the authenticated apiClient (Bearer token injected automatically).
 */

import apiClient from "./client";

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
    billing_country: string | null;  // ISO 3166-1 alpha-2
    is_active: boolean;
    is_email_verified: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserProfileUpdate {
    full_name?: string;
    phone?: string | null;
    avatar_asset_id?: string | null;
    country?: string | null;
    billing_line1?: string | null;
    billing_line2?: string | null;
    billing_city?: string | null;
    billing_state?: string | null;
    billing_postal_code?: string | null;
    billing_country?: string | null;
}

export async function getMyProfile(): Promise<UserProfile> {
    const { data } = await apiClient.get<UserProfile>("/auth/user/account");
    return data;
}

export async function updateMyProfile(payload: UserProfileUpdate): Promise<UserProfile> {
    const { data } = await apiClient.patch<UserProfile>("/auth/user/account", payload);
    return data;
}
