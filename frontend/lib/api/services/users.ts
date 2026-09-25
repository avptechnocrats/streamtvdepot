import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EndUserOut {
    id: string;
    client_id: string;
    email: string;
    full_name: string;
    phone: string | null;
    avatar_asset_id: string | null;
    avatar_url: string | null;
    country: string | null;
    is_active: boolean;
    is_email_verified: boolean;
    created_at: string;
}

export interface EndUserCreate {
    email: string;
    password: string;
    full_name: string;
    phone?: string | null;
    country?: string | null;
}

export interface EndUserUpdate {
    full_name?: string | null;
    phone?: string | null;
    avatar_asset_id?: string | null;
    country?: string | null;
    is_active?: boolean | null;
}

export interface UserListResponse {
    items: EndUserOut[];
    total: number;
    page: number;
    page_size: number;
    counts: { all: number; active: number; inactive: number };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listUsers(
    params?: { page?: number; page_size?: number; search?: string; is_active?: boolean },
): Promise<UserListResponse> {
    const res = await apiClient.get<UserListResponse>(ENDPOINTS.admin.users, { params });
    return res.data;
}

export async function getUser(id: string): Promise<EndUserOut> {
    const res = await apiClient.get<EndUserOut>(ENDPOINTS.admin.user(id));
    return res.data;
}

export async function createUser(data: EndUserCreate): Promise<EndUserOut> {
    const res = await apiClient.post<EndUserOut>(ENDPOINTS.admin.users, data);
    return res.data;
}

export async function updateUser(id: string, data: EndUserUpdate): Promise<EndUserOut> {
    const res = await apiClient.patch<EndUserOut>(ENDPOINTS.admin.user(id), data);
    return res.data;
}

export async function deleteUser(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.user(id));
}
