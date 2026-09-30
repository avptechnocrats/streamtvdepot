import axios from "axios";
import publicApiClient from "./public-client";

interface HomeVideoItemThumbnails {
    video_banner: string | null;
    video_h_thumbnail: string | null;
    video_w_thumbnail: string | null;
}

export interface HomeVideoItem {
    id: string;
    title: string;
    rating: number | null;
    publish_at: string | null;
    created_at: string;
    thumbnails: HomeVideoItemThumbnails;
}

export interface HomeCategoryRow {
    category_id: string;
    category_name: string;
    category_slug: string;
    content_type: string;
    items: HomeVideoItem[];
}

interface HomeContentsResponse {
    rows: HomeCategoryRow[];
    page: number;
    page_size: number;
    has_more: boolean;
}

interface FetchHomeContentRowsParams {
    page?: number;
    pageSize?: number;
    itemsPerRow?: number;
    categoryId?: string;
    contentType?: string;
}

function isTenantlessLocalRequest(): boolean {
    if (typeof window === "undefined") return false;

    const hostname = window.location.hostname.toLowerCase();
    const hasConfiguredClient = Boolean(process.env.NEXT_PUBLIC_CLIENT_SLUG);

    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname) && !hasConfiguredClient;
}

export async function fetchHomeVideoRows({
    page = 1,
    pageSize = 3,
    itemsPerRow = 12,
    categoryId,
    contentType = "video",
}: FetchHomeContentRowsParams = {}): Promise<HomeContentsResponse> {
    if (isTenantlessLocalRequest()) {
        return {
            rows: [],
            page,
            page_size: pageSize,
            has_more: false,
        };
    }

    try {
        const { data } = await publicApiClient.get<HomeContentsResponse>("/home-contents", {
            params: {
                content_type: contentType,
                page,
                page_size: pageSize,
                items_per_row: itemsPerRow,
                ...(categoryId ? { category_id: categoryId } : {}),
            },
        });

        return data;
    } catch (error) {
        if (axios.isAxiosError(error) && [404, 500].includes(error.response?.status ?? 0)) {
            return {
                rows: [],
                page,
                page_size: pageSize,
                has_more: false,
            };
        }

        throw error;
    }
}

// Infinite scroll: UI should call fetchHomeVideoRows({ page, ... }) as needed.
// Remove fetchAllHomeVideoRows; paging is now UI-driven.