"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listVideos } from "@/lib/services/videos";
import { PosterCard } from "@/themes/ember/ContentRow";

export default function TopTenRow() {
    const rail = useRef<HTMLDivElement>(null);
    const { data = [], isError } = useQuery({ queryKey: ["home-top-ten"], queryFn: () => listVideos({ sort_by: "rating", page_size: 10 }), staleTime: 60_000, retry: 1 });
    const videos = Array.from(new Map(data.map(video => [video.id, video])).values()).slice(0, 10);
    if (isError || !videos.length) return null;
    return <section aria-label="Top 10 content" className="px-4 pt-8 pb-2 sm:px-6 lg:px-14">
        <h2 className="mb-3 text-lg font-semibold md:text-xl">Top 10</h2>
        <div className="relative group">
            <button type="button" aria-label="Previous top 10 titles" title="Previous top 10 titles" onClick={() => rail.current?.scrollBy({ left: -480, behavior: "smooth" })} className="absolute -left-3 top-[40%] -translate-y-1/2 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><ChevronLeft size={18} /></button>
            <div ref={rail} className="pointer-events-none flex gap-5 overflow-x-auto scrollbar-hide pt-32 pb-64 sm:gap-6" style={{ marginTop: -124, marginBottom: -248 }}>
                {videos.map((video, index) => <PosterCard key={video.id} rank={index + 1} movie={{ id: video.id, title: video.title, image: video.thumbnails.video_h_thumbnail || video.thumbnails.video_w_thumbnail || video.thumbnails.video_banner || "/images/hero-banner.jpg", year: String(new Date(video.publish_at || video.created_at).getFullYear()), rating: video.rating != null ? `★ ${video.rating.toFixed(1)}` : "" }} />)}
            </div>
            <button type="button" aria-label="Next top 10 titles" title="Next top 10 titles" onClick={() => rail.current?.scrollBy({ left: 480, behavior: "smooth" })} className="absolute -right-3 top-[40%] -translate-y-1/2 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"><ChevronRight size={18} /></button>
        </div>
    </section>;
}