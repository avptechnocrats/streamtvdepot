import publicApiClient from "./public-client";

export type BannerPage = "/" | "/movies" | "/series" | "/tv-shows" | "/ppv-events";
export type BannerPosition = "top" | "middle_1" | "middle_2" | "bottom";
export type BannerSize = "custom" | "desktop" | "tablet" | "mobile";

export interface PublicBannerImage {
    asset_id: string;
    url: string;
    display_url?: string | null;
    width: number;
    height: number;
}

export interface PublicBanner {
    id: string;
    name: string;
    link?: string | null;
    page: BannerPage;
    position: BannerPosition;
    images: Partial<Record<BannerSize, PublicBannerImage>>;
    border_enabled: boolean;
    border_width: number;
    border_color: string;
    border_radius: number;
    padding: number;
}

export async function listPageBanners(page: BannerPage): Promise<PublicBanner[]> {
    return (await publicApiClient.get<PublicBanner[]>("/banners", { params: { page } })).data;
}