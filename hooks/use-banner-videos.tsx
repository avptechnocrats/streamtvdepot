"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { listSliderVideos, listVideos, type VideoOut } from "@/lib/services";

/**
 * Fetches videos that are active and marked as slider (is_slider=true).
 * Used by all Banner components to replace hardcoded slide data.
 *
 * Provides a normalized slide shape plus the raw VideoOut for flexibility.
 */
export interface BannerSlide {
    /** resolved image URL — banner first, then h-thumbnail, then w-thumbnail */
    image: string;
    id: string;
    title: string;
    titleImage: string | null;
    /** first part of the title (everything except the last word) */
    titleA: string;
    /** last word of the title */
    titleB: string;
    description: string;
    year: string;
    /** formatted duration string e.g. "2h 14min", or "" if unknown */
    duration: string;
    /** age rating from the record or empty string */
    rating: string;
    /** content_classification or "Featured" */
    classification: string;
    /** video_url from the record */
    videoUrl: string | null;
    /** playable trailer file, or null when the title has no uploaded trailer */
    trailerUrl: string | null;
    /** adaptive HLS preview of the trailer; preferred over trailerUrl when present */
    trailerHlsUrl: string | null;
    raw: VideoOut;
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function splitTitle(title: string): [string, string] {
    const words = title.trim().split(/\s+/);
    if (words.length === 1) return [title, ""];
    const last = words.pop()!;
    return [words.join(" "), last];
}

function toSlide(v: VideoOut): BannerSlide {
    const image =
        v.thumbnails.video_banner ||
        v.thumbnails.video_h_thumbnail ||
        v.thumbnails.video_w_thumbnail ||
        "/images/hero-banner.jpg";

    const [titleA, titleB] = splitTitle(v.title);
    const year = v.publish_at
        ? new Date(v.publish_at).getFullYear().toString()
        : new Date(v.created_at).getFullYear().toString();

    return {
        image,
        id: v.id,
        title: v.title,
        titleImage: v.thumbnails.video_title_image ?? null,
        titleA,
        titleB,
        description: v.short_description ?? "",
        year,
        duration: formatDuration(v.duration),
        rating: v.age_rating ?? "",
        classification: v.content_classification ?? "Featured",
        videoUrl: v.video_url,
        trailerUrl: v.trailer_display_url ?? null,
        trailerHlsUrl: v.trailer_hls_url ?? null,
        raw: v,
    };
}

export function useBannerVideos() {
    const pathname = usePathname();
    const isMoviesPage = pathname === "/movies";
    const isSportsPage = pathname === "/sports";
    const pageClassification = isSportsPage ? "Sports" : "Movie";
    const isClassificationLanding = isMoviesPage || isSportsPage;
    const { data, isLoading, isError } = useQuery({
        queryKey: isClassificationLanding ? ["classification-banner-videos", pathname, "selected-or-random", pageClassification] : ["banner-videos"],
        queryFn: isClassificationLanding ? async () => {
            const assignedRequest = isMoviesPage
                ? listVideos({ is_movie_slider: true, page_size: 100, content_classification: pageClassification })
                : listVideos({ is_featured: true, page_size: 100, content_classification: pageClassification });
            const videos = await assignedRequest;
            const assigned = Array.from(new Map(videos
                .filter(video => video.content_classification === pageClassification && video.is_active && (isMoviesPage ? video.is_movie_slider : video.is_featured) && (video.thumbnails.video_banner || video.thumbnails.video_h_thumbnail || video.thumbnails.video_w_thumbnail))
                .map(video => [video.id, video])).values());
            if (assigned.length > 0) return assigned;

            const fallback = await listVideos({ is_active: true, page_size: 100, content_classification: pageClassification });
            const candidates = Array.from(new Map(fallback
                .filter(video => video.content_classification === pageClassification && video.is_active && (video.thumbnails.video_banner || video.thumbnails.video_h_thumbnail || video.thumbnails.video_w_thumbnail))
                .map(video => [video.id, video])).values());
            for (let index = candidates.length - 1; index > 0; index--) {
                const randomIndex = Math.floor(Math.random() * (index + 1));
                [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
            }
            return candidates.slice(0, 5);
        } : listSliderVideos,
        staleTime: isClassificationLanding ? 0 : 5 * 60 * 1000,
        refetchOnWindowFocus: isClassificationLanding ? false : undefined,
        refetchOnReconnect: isClassificationLanding ? false : undefined,
        retry: 1,
    });

    const slides: BannerSlide[] = (data && data.length > 0) ? data.map(toSlide) : [];

    return { slides, isLoading, isError };
}
