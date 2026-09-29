import publicApiClient from "./public-client";

export interface PublicPpvEvent {
    id: string;
    title: string;
    slug: string | null;
    description: string | null;
    category: string | null;
    source: "rtmp" | "external";
    stream_url: string | null;
    thumbnails: {
        banner: string | null;
        portrait: string | null;
        wide: string | null;
    };
    geo_fencing: { blocked_countries: string[] };
    pricing_plan_id: string | null;
    is_live: boolean;
    created_at: string;
}

export async function listPpvEvents(params?: { page?: number; page_size?: number }): Promise<PublicPpvEvent[]> {
    const response = await publicApiClient.get<PublicPpvEvent[]>("/ppv-events", { params });
    return response.data;
}

export async function getPpvEvent(id: string): Promise<PublicPpvEvent> {
    const response = await publicApiClient.get<PublicPpvEvent>(`/ppv-events/${id}`);
    return response.data;
}