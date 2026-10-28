import publicApiClient from "./public-client";

export interface PublicPageOut {
    id: string;
    title: string;
    slug: string;
    body: string | null;
    short_description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: string | null;
    og_image_url: string | null;
    created_at: string;
    updated_at: string;
}

export async function getPublicPage(slug: string): Promise<PublicPageOut> {
    const response = await publicApiClient.get<PublicPageOut>(`/pages/${encodeURIComponent(slug)}`);
    return response.data;
}