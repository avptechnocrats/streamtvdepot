/**
 * Videos API Service
 *
 * Viewer-facing service functions for the client storefront.
 */

import publicApiClient from "./public-client";

// ─── Constants ────────────────────────────────────────────────────────────────

export const VIDEO_CATEGORIES = [
    "Action", "Adventure", "Animation", "Biography", "Comedy", "Crime",
    "Documentary", "Drama", "Family", "Fantasy", "History", "Horror",
    "Music", "Mystery", "Romance", "Sci-Fi", "Sport", "Thriller",
    "War", "Western",
] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

export const AGE_RATINGS = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

export const CONTENT_CLASSIFICATIONS = ["Movie", "Short Film", "Documentary", "Web Series", "Episode", "Clip", "Trailer"] as const;
export type ContentClassification = (typeof CONTENT_CLASSIFICATIONS)[number];

export const VIDEO_LANGUAGES = [
    "English", "Spanish", "French", "German", "Italian", "Portuguese",
    "Hindi", "Arabic", "Japanese", "Korean", "Chinese", "Russian",
    "Turkish", "Polish", "Dutch", "Thai", "Vietnamese", "Indonesian",
] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGES)[number];

export const CREW_ROLES = [
    "Director", "Producer", "Writer", "Actor", "Actress", "Cinematographer",
    "Editor", "Composer", "Costume Designer", "Production Designer", "VFX Supervisor",
] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export const ACCESS_TYPES = ["free", "subscription", "pay_per_view", "rental"] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

export const TRAILER_TYPES = ["upload", "url"] as const;
export type TrailerType = (typeof TRAILER_TYPES)[number];

export const PUBLISH_OPTIONS = ["now", "later"] as const;
export type PublishOption = (typeof PUBLISH_OPTIONS)[number];

// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface CastCrewMember {
    name: string;
    role: string;
    character?: string;
}

export interface GeoFencing {
    blocked_countries: string[];
    allowed_countries: string[];
}

export interface IntroTimes {
    skip_start_time: number | null;   // seconds
    skip_end_time: number | null;
    recap_start_time: number | null;
    recap_end_time: number | null;
    skip_start_session: number | null;
    skip_end_session: number | null;
}

export interface Advertisement {
    pre_ad_id: string | null;
    post_ad_id: string | null;
    mid_category_ad_id: string | null;
    mid_ad_sequence_time: number | null; // seconds
}

export interface VideoSeo {
    meta_title: string | null;
    meta_description: string | null;
    meta_keywords: string | null;
    og_image_url: string | null;
}

export interface VideoThumbnails {
    video_banner: string | null;
    video_h_thumbnail: string | null;
    video_w_thumbnail: string | null;
}

// ─── Main video type ──────────────────────────────────────────────────────────

export interface VideoOut {
    id: string;
    title: string;
    slug: string;
    short_description: string | null;
    long_description: string | null;
    category: string | null;
    age_rating: string | null;
    content_classification: string | null;
    language: string[];
    cast_crew: CastCrewMember[];
    rating: number | null;               // 0–10
    related_video_ids: string[];
    duration: number | null;             // seconds
    geo_fencing: GeoFencing;
    intro_times: IntroTimes;
    is_featured: boolean;
    is_active: boolean;
    is_slider: boolean;
    is_thumbnail: boolean;
    advertisement: Advertisement;
    video_url: string | null;
    video_display_url: string | null;
    thumbnails: VideoThumbnails;
    trailer_type: TrailerType | null;
    trailer_url: string | null;
    access_type: AccessType;
    subscription_plan_ids: string[];
    ppv_price: number | null;
    publish_option: PublishOption;
    publish_at: string | null;           // ISO datetime
    seo: VideoSeo;
    // Transcoding / ABR
    transcode_status: "pending" | "processing" | "complete" | "failed" | null;
    transcode_progress: number | null;   // 0–100
    hls_url: string | null;             // CloudFront / S3 master .m3u8
    hls_display_url: string | null;     // presigned GET URL — populated at serve time
    transcode_error_message: string | null;
    drm_enabled: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

export type VideoUpdate = Partial<VideoOut>;

export interface ListVideosParams {
    page?: number;
    page_size?: number;
    search?: string;
    category?: string;
    is_active?: boolean;
    is_slider?: boolean;
    is_featured?: boolean;
}

// ─── Service functions ────────────────────────────────────────────────────────

// Storefront reads — all routed through the Next.js public proxy.
export async function listVideos(params: ListVideosParams = {}): Promise<VideoOut[]> {
    const { data } = await publicApiClient.get<VideoOut[]>("/videos", { params });
    return data;
}

export async function listSliderVideos(): Promise<VideoOut[]> {
    const { data } = await publicApiClient.get<VideoOut[]>("/videos", {
        params: { is_slider: true, page_size: 10 },
    });
    return data;
}

export async function getVideo(id: string): Promise<VideoOut> {
    const { data } = await publicApiClient.get<VideoOut>(`/video/${id}`);
    return data;
}
