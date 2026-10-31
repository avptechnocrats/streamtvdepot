import apiClient from "../client";

export const BANNER_SIZES = {
    desktop: { label: "Desktop", width: 1920, height: 600 },
    tablet: { label: "Tablet", width: 1200, height: 400 },
    custom: { label: "Custom", width: 0, height: 0 },
    mobile: { label: "Mobile", width: 750, height: 500 },
} as const;

export type BannerSlot = keyof typeof BANNER_SIZES;
export interface BannerImage {
    url: string;
    display_url?: string | null;
    asset_id: string;
    width: number;
    height: number;
}
export interface BannerPayload {
    name: string;
    link?: string | null;
    page: "/" | "/movies" | "/series" | "/tv-shows" | "/ppv-events";
    position: "top" | "middle_1" | "middle_2" | "bottom";
    images: Partial<Record<BannerSlot, BannerImage>>;
    border_enabled: boolean;
    border_width: number;
    border_color: string;
    border_radius: number;
    padding: number;
}
export interface ManagedBanner extends BannerPayload { id: string }

export async function listBanners(): Promise<ManagedBanner[]> {
    return (await apiClient.get<ManagedBanner[]>("/admin/banners")).data;
}
export async function saveBanner(payload: BannerPayload, id?: string): Promise<ManagedBanner> {
    return id
        ? (await apiClient.put<ManagedBanner>(`/admin/banners/${id}`, payload)).data
        : (await apiClient.post<ManagedBanner>("/admin/banners", payload)).data;
}
export async function deleteBanner(id: string): Promise<void> {
    await apiClient.delete(`/admin/banners/${id}`);
}