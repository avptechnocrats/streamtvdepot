/**
 * Resolves the display URL for a media asset or a URL string.
 *
 * The backend returns a 7-day presigned GET URL in `display_url` for media assets,
 * and `thumbnail_display_url` / `banner_display_url` for categories.
 * These are the URLs that should be used as <img src> / <video src>.
 *
 * Use this everywhere an S3 asset URL is needed for display.
 * If the URL strategy changes (e.g. switching to CloudFront), update this file only.
 */

import type { VideoOut } from "@/lib/services/videos";
import type { Movie } from "@/types/content";

export function videoToMovie(video: VideoOut, landscape = false): Movie {
    const portrait = video.thumbnails.video_h_thumbnail || video.thumbnails.video_w_thumbnail || video.thumbnails.video_banner || "/images/hero-banner.jpg";
    const wide = video.thumbnails.video_w_thumbnail || video.thumbnails.video_banner || portrait;
    const date = new Date(video.publish_at || video.created_at);
    return {
        id: video.id,
        title: video.title,
        image: landscape ? wide : portrait,
        year: Number.isNaN(date.getTime()) ? "" : date.getFullYear().toString(),
        rating: video.rating != null ? `\u2605 ${video.rating.toFixed(1)}` : "",
        categories: video.categories ?? (video.category ? [video.category] : []),
        ageRating: video.age_rating,
        duration: video.duration,
        classification: video.content_classification,
        previewImage: video.thumbnails.video_banner || wide,
        trailerUrl: video.trailer_display_url,
        trailerHlsUrl: video.trailer_hls_url,
    };
}

/** For MediaAsset API responses */
export function resolveMediaUrl(
    asset: { url: string; display_url?: string | null } | null | undefined,
): string | null {
    if (!asset) return null;
    return asset.display_url ?? asset.url ?? null;
}

/** For CategoryOut thumbnail */
export function resolveThumbnailUrl(
    category: { thumbnail_url?: string | null; thumbnail_display_url?: string | null } | null | undefined,
): string | null {
    if (!category) return null;
    return category.thumbnail_display_url ?? category.thumbnail_url ?? null;
}

/** For CategoryOut banner */
export function resolveBannerUrl(
    category: { banner_url?: string | null; banner_display_url?: string | null } | null | undefined,
): string | null {
    if (!category) return null;
    return category.banner_display_url ?? category.banner_url ?? null;
}

/**
 * Same as resolveMediaUrl but returns a fallback string instead of null.
 * Useful for img src attributes that must always have a value.
 */
export function resolveMediaUrlOrFallback(
    asset: { url: string; display_url?: string | null } | null | undefined,
    fallback = "",
): string {
    return resolveMediaUrl(asset) ?? fallback;
}
