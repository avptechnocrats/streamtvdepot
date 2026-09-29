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

export async function fetchHomeVideoRows({
    page = 1,
    pageSize = 3,
    itemsPerRow = 12,
    categoryId,
    contentType = "video",
}: FetchHomeContentRowsParams = {}): Promise<HomeContentsResponse> {
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
}

// Infinite scroll: UI should call fetchHomeVideoRows({ page, ... }) as needed.
// Remove fetchAllHomeVideoRows; paging is now UI-driven.