"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listVideos } from "@/lib/services/videos";
import { PosterCard } from "@/themes/ember/ContentRow";
import { useRowScroll } from "@/hooks/use-row-scroll";

export default function TopTenRow() {
    const { data = [], isError } = useQuery({ queryKey: ["home-top-ten"], queryFn: () => listVideos({ sort_by: "rating", page_size: 10 }), staleTime: 60_000, retry: 1 });
    const videos = Array.from(new Map(data.map(video => [video.id, video])).values()).slice(0, 10);
    const { scrollRef: rail, canScrollLeft, canScrollRight } = useRowScroll(videos.length);
    if (isError || !videos.length) return null;
    return <section aria-label="Top 10 content" className="storefront-row pt-8 pb-2">
        <h2 className="mb-3 text-lg font-semibold md:text-xl">Top 10 Movies of the Month</h2>
        <div className="relative group [--row-artwork-height:12rem] sm:[--row-artwork-height:12.75rem] lg:[--row-artwork-height:13.5rem]">
            <button type="button" aria-label="Previous top 10 titles" title="Previous top 10 titles" disabled={!canScrollLeft} onClick={() => rail.current?.scrollBy({ left: -480, behavior: "smooth" })} className="storefront-row-arrow -left-3"><ChevronLeft size={18} /></button>
            <div ref={rail} className="pointer-events-none flex gap-5 overflow-x-auto scrollbar-hide pt-32 pb-64 sm:gap-6" style={{ marginTop: -124, marginBottom: -248 }}>
                {videos.map((video, index) => <PosterCard key={video.id} rank={index + 1} movie={{ id: video.id, title: video.title, image: video.thumbnails.video_h_thumbnail || video.thumbnails.video_w_thumbnail || video.thumbnails.video_banner || "/images/hero-banner.jpg", year: String(new Date(video.publish_at || video.created_at).getFullYear()), rating: video.rating != null ? `★ ${video.rating.toFixed(1)}` : "" }} />)}
            </div>
            <button type="button" aria-label="Next top 10 titles" title="Next top 10 titles" disabled={!canScrollRight} onClick={() => rail.current?.scrollBy({ left: 480, behavior: "smooth" })} className="storefront-row-arrow -right-3"><ChevronRight size={18} /></button>
        </div>
    </section>;
}