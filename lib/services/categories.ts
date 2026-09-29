import publicApiClient from "./public-client";

export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    content_type: string;
    thumbnail_url: string | null;
    thumbnail_display_url: string | null;
    banner_url: string | null;
    banner_display_url: string | null;
}

/** Returns the best available image URL — prefers pre-signed display URLs over raw S3 URLs. */
export function getCategoryImageUrl(cat: Category): string | null {
    return (
        cat.thumbnail_display_url ||
        cat.banner_display_url ||
        cat.thumbnail_url ||
        cat.banner_url ||
        null
    );
}

export async function fetchCategories(contentType?: string): Promise<Category[]> {
    const { data } = await publicApiClient.get<Category[]>("/categories", {
        params: {
            content_type: contentType
        }
    });
    return data;
}

export interface CategoryItem {
    id: string;
    title: string;
    rating: number | null;
    short_description: string | null;
    publish_at: string | null;
    created_at: string;
    thumbnails: {
        video_banner: string | null;
        video_h_thumbnail: string | null;
        video_w_thumbnail: string | null;
    };
}

export interface CategoryDetailResponse {
    category: Category;
    items: CategoryItem[];
    page: number;
    page_size: number;
    total_items: number;
    has_more: boolean;
}

export async function fetchCategoryBySlug(slug: string, page = 1, pageSize = 20): Promise<CategoryDetailResponse> {
    const { data } = await publicApiClient.get<CategoryDetailResponse>(`/categories/${slug}`, {
        params: { page, page_size: pageSize },
    });
    return data;
}
