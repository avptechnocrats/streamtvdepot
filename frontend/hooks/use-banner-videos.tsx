"use client";

import { useQuery } from "@tanstack/react-query";
import { listSliderVideos, type VideoOut } from "@/lib/api";

/**
 * Fetches videos that are active and marked as slider (is_slider=true).
 * Used by all Banner components to replace hardcoded slide data.
 *
 * Provides a normalized slide shape plus the raw VideoOut for flexibility.
 */
export interface BannerSlide {
    /** resolved image URL — banner first, then h-thumbnail, then w-thumbnail */
    image: string;
    title: string;
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
    /** video_url from the record, used by VideoBanner mode */
    videoUrl: string | null;
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
        title: v.title,
        titleA,
        titleB,
        description: v.short_description ?? "",
        year,
        duration: formatDuration(v.duration),
        rating: v.age_rating ?? "",
        classification: v.content_classification ?? "Featured",
        videoUrl: v.video_url,
        raw: v,
    };
}

export function useBannerVideos() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["banner-videos"],
        queryFn: listSliderVideos,
        staleTime: 5 * 60 * 1000, // 5 min
        retry: 1,
    });

    const slides: BannerSlide[] = (data && data.length > 0) ? data.map(toSlide) : [];

    return { slides, isLoading, isError };
}
