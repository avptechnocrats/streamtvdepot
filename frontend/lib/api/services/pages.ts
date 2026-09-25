import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageStatus = "draft" | "published";

export interface PageOut {
    id: string;
    client_id: string;
    title: string;
    slug: string;
    body: string | null;
    short_description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: string | null;
    og_image_url: string | null;
    status: PageStatus;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface PageCreate {
    title: string;
    slug: string;
    body?: string | null;
    short_description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    seo_keywords?: string | null;
    og_image_url?: string | null;
    status?: PageStatus;
    is_active?: boolean;
    sort_order?: number;
}

export interface PageUpdate {
    title?: string;
    slug?: string;
    body?: string | null;
    short_description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    seo_keywords?: string | null;
    og_image_url?: string | null;
    status?: PageStatus;
    is_active?: boolean;
    sort_order?: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listPages(params?: {
    search?: string;
    status?: PageStatus;
    page?: number;
    page_size?: number;
}): Promise<PageOut[]> {
    const res = await apiClient.get<PageOut[]>(ENDPOINTS.admin.pages, { params });
    return res.data;
}

export async function getPage(id: string): Promise<PageOut> {
    const res = await apiClient.get<PageOut>(ENDPOINTS.admin.page(id));
    return res.data;
}

export async function createPage(data: PageCreate): Promise<PageOut> {
    const res = await apiClient.post<PageOut>(ENDPOINTS.admin.pages, data);
    return res.data;
}

export async function updatePage(id: string, data: PageUpdate): Promise<PageOut> {
    const res = await apiClient.patch<PageOut>(ENDPOINTS.admin.page(id), data);
    return res.data;
}

export async function deletePage(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.page(id));
}
