import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Constants ───────────────────────────────────────────────────────────────

export const CATEGORY_CONTENT_TYPES = [
    { value: "video", label: "Video" },
    { value: "audio", label: "Audio" },
    { value: "livestream", label: "Livestream" },
    { value: "series", label: "Series" },
    { value: "channel", label: "Channel" },
] as const;

export type CategoryContentType = "video" | "audio" | "livestream" | "series" | "channel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryOut {
    id: string;
    client_id: string;
    name: string;
    slug: string;
    description: string | null;
    is_parent: boolean;
    parent_id: string | null;
    thumbnail_asset_id: string | null;
    thumbnail_url: string | null;
    thumbnail_display_url: string | null;
    banner_asset_id: string | null;
    banner_url: string | null;
    banner_display_url: string | null;
    sort_order: number;
    content_types: CategoryContentType[];
    created_at: string;
    updated_at: string;
}

export interface CategoryCreate {
    name: string;
    slug: string;
    description?: string | null;
    is_parent: boolean;
    parent_id?: string | null;
    thumbnail_asset_id?: string | null;
    thumbnail_url?: string | null;
    banner_asset_id?: string | null;
    banner_url?: string | null;
    sort_order: number;
    content_types?: CategoryContentType[];
}

export type CategoryUpdate = Partial<CategoryCreate>;

export interface CategoryListResponse {
    items: CategoryOut[];
    total: number;
    page: number;
    page_size: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listCategories(
    params?: { page?: number; page_size?: number; search?: string; content_type?: string },
): Promise<CategoryListResponse> {
    const res = await apiClient.get<CategoryListResponse>(ENDPOINTS.admin.categories, { params });
    return res.data;
}

export async function getCategory(id: string): Promise<CategoryOut> {
    const res = await apiClient.get<CategoryOut>(ENDPOINTS.admin.category(id));
    return res.data;
}

export async function createCategory(data: CategoryCreate): Promise<CategoryOut> {
    const res = await apiClient.post<CategoryOut>(ENDPOINTS.admin.categories, data);
    return res.data;
}

export async function updateCategory(id: string, data: CategoryUpdate): Promise<CategoryOut> {
    const res = await apiClient.patch<CategoryOut>(ENDPOINTS.admin.category(id), data);
    return res.data;
}

export async function reorderCategories(items: { id: string; sort_order: number }[]): Promise<void> {
    await apiClient.post(`${ENDPOINTS.admin.categories}/reorder`, items);
}

export async function deleteCategory(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.category(id));
}
