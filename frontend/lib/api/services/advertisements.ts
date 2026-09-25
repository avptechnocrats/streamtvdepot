import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export type AdType = "banner" | "video" | "popup" | "overlay";
export type AdStatus = "draft" | "active" | "paused" | "expired";

export interface AdvertisementOut {
    id: string;
    client_id: string;
    title: string;
    description: string | null;
    ad_type: AdType;
    media_url: string | null;
    click_through_url: string | null;
    duration_seconds: number | null;
    status: AdStatus;
    starts_at: string | null;
    ends_at: string | null;
    budget: number | null;
    cost_per_impression: number | null;
    cost_per_click: number | null;
    is_skippable: boolean;
    total_impressions: number;
    total_clicks: number;
    created_at: string;
    updated_at: string;
}

export interface AdvertisementCreate {
    title: string;
    description?: string | null;
    ad_type: AdType;
    media_url?: string | null;
    click_through_url?: string | null;
    duration_seconds?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    budget?: number | null;
    cost_per_impression?: number | null;
    cost_per_click?: number | null;
    is_skippable?: boolean;
}

export interface AdvertisementUpdate extends Partial<AdvertisementCreate> {
    status?: AdStatus;
}

export interface AdPlacementOut {
    id: string;
    client_id: string;
    ad_id: string;
    placement_type: string;
    content_type: string | null;
    content_id: string | null;
    is_active: boolean;
    priority: number;
    created_at: string;
}

export interface AdPlacementCreate {
    ad_id: string;
    placement_type: "pre_roll" | "mid_roll" | "post_roll" | "overlay" | "sidebar" | "banner";
    content_type?: "video" | "audio" | "series" | "live_stream" | "ppv_event" | "all" | null;
    content_id?: string | null;
    priority?: number;
}

export type AdvertisementEventType =
    | "request"
    | "impression"
    | "start"
    | "first_quartile"
    | "midpoint"
    | "third_quartile"
    | "complete"
    | "skip"
    | "error"
    | "click";

export interface AdvertisementEventCreate {
    event_id: string;
    advertisement_id: string;
    event_type: AdvertisementEventType;
    session_id: string;
    content_type?: string | null;
    content_id?: string | null;
    placement_type?: string | null;
    occurred_at: string;
    metadata?: Record<string, unknown>;
    tracking_token?: string | null;
}

export interface AdvertisementReportOut {
    advertisement_id: string;
    impressions: number;
    clicks: number;
    completions: number;
    billable_revenue: number;
}

export interface AdvertisementListResponse {
    items: AdvertisementOut[];
    total: number;
    page: number;
    page_size: number;
    counts: Record<string, number>;
}

export async function listAdvertisements(params?: {
    page_size?: number;
    search?: string;
    status?: string;
}): Promise<AdvertisementOut[]>;
export async function listAdvertisements(params: {
    page: number;
    page_size?: number;
    search?: string;
    status?: string;
}): Promise<AdvertisementListResponse>;
export async function listAdvertisements(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
}): Promise<AdvertisementOut[] | AdvertisementListResponse> {
    const res = await apiClient.get<AdvertisementListResponse | AdvertisementOut[]>(ENDPOINTS.admin.advertisements, { params });
    const data = res.data;

    if (params?.page !== undefined) {
        const payload = Array.isArray(data) ? {
            items: data,
            total: data.length,
            page: params.page,
            page_size: params.page_size ?? data.length,
            counts: { all: data.length, draft: 0, active: 0, paused: 0, expired: 0 },
        } : data ?? {
            items: [],
            total: 0,
            page: params.page,
            page_size: params.page_size ?? 0,
            counts: { all: 0, draft: 0, active: 0, paused: 0, expired: 0 },
        };

        return payload;
    }

    if (Array.isArray(data)) return data;
    return data?.items ?? [];
}

export async function createAdvertisement(payload: AdvertisementCreate): Promise<AdvertisementOut> {
    const res = await apiClient.post<AdvertisementOut>(ENDPOINTS.admin.advertisements, payload);
    return res.data;
}

export async function getAdvertisement(adId: string): Promise<AdvertisementOut> {
    const res = await apiClient.get<AdvertisementOut>(`${ENDPOINTS.admin.advertisements}/${adId}`);
    return res.data;
}

export async function updateAdvertisement(adId: string, payload: AdvertisementUpdate): Promise<AdvertisementOut> {
    const res = await apiClient.patch<AdvertisementOut>(`${ENDPOINTS.admin.advertisements}/${adId}`, payload);
    return res.data;
}

export async function deleteAdvertisement(adId: string): Promise<void> {
    await apiClient.delete(`${ENDPOINTS.admin.advertisements}/${adId}`);
}

export async function listAdPlacements(adId: string): Promise<AdPlacementOut[]> {
    const res = await apiClient.get<AdPlacementOut[]>(`${ENDPOINTS.admin.advertisements}/${adId}/placements`);
    return res.data;
}

export async function createAdPlacement(adId: string, payload: Omit<AdPlacementCreate, "ad_id">): Promise<AdPlacementOut> {
    const res = await apiClient.post<AdPlacementOut>(`${ENDPOINTS.admin.advertisements}/${adId}/placements`, {
        ad_id: adId,
        ...payload,
    });
    return res.data;
}

export async function deleteAdPlacement(adId: string, placementId: string): Promise<void> {
    await apiClient.delete(`${ENDPOINTS.admin.advertisements}/${adId}/placements/${placementId}`);
}

export async function getAdvertisementReport(adId: string): Promise<AdvertisementReportOut> {
    const res = await apiClient.get<AdvertisementReportOut>(`${ENDPOINTS.admin.advertisements}/${adId}/report`);
    return res.data;
}
