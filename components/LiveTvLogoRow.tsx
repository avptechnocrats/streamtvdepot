"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { listLiveTvChannels, type LiveTvChannelOut } from "@/lib/services/live-tv";

function ChannelLogo({ channel }: { channel: LiveTvChannelOut }) {
    const [failed, setFailed] = useState(false);
    const image = channel.thumbnails.square || channel.thumbnails.wide || channel.thumbnails.banner || channel.thumbnails.portrait;
    return <Link href={`/tv-shows/${channel.id}`} aria-label={`Watch ${channel.title}`} title={channel.title} className="group/channel shrink-0 w-44 sm:w-48 lg:w-52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex aspect-square w-full items-center justify-center rounded-[6px] bg-card transition-transform duration-300 ease-out group-hover/channel:-translate-y-1 group-focus-visible/channel:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none">
            {image && !failed ? <img src={image} alt={channel.title} className={`h-full w-full rounded-[6px] ${channel.thumbnails.square ? "object-cover" : "object-contain"}`} loading="lazy" onError={() => setFailed(true)} /> : <span className="text-xl font-semibold text-muted-foreground">{channel.title.split(/\s+/).map(word => word[0]).slice(0, 3).join("")}</span>}
        </div>
        <p className="mt-2 truncate text-xs font-medium text-muted-foreground transition-colors group-hover/channel:text-foreground group-focus-visible/channel:text-foreground">{channel.title}</p>
    </Link>;
}

export default function LiveTvLogoRow() {
    const { data = [], isError } = useQuery({ queryKey: ["home-live-tv-logos"], queryFn: () => listLiveTvChannels({ page_size: 100 }), staleTime: 60_000, retry: 1 });
    const channels = data.filter(channel => channel.is_active);
    const rail = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    function updateControls() {
        const element = rail.current;
        if (!element) return;
        setCanScrollLeft(element.scrollLeft > 1);
        setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    }
    useEffect(() => {
        const element = rail.current;
        if (!element) return;
        updateControls();
        const observer = new ResizeObserver(updateControls);
        observer.observe(element);
        return () => observer.disconnect();
    }, [data]);
    if (isError || !channels.length) return null;

    return <section aria-label="Live TV channels" className="px-4 pt-14 pb-2 sm:px-6 lg:px-14">
        <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Radio size={17} className="text-primary" /><h2 className="text-lg font-semibold">Live TV</h2></div>
            <Link href="/tv-shows" className="text-xs font-bold text-foreground hover:text-primary transition-colors">View All <ChevronRight size={12} className="inline -mt-0.5" /></Link>
        </div>
        <div className="relative group">
        <button type="button" aria-label="Previous channels" title="Previous channels" disabled={!canScrollLeft} onClick={() => rail.current?.scrollBy({ left: -320, behavior: "smooth" })} className="absolute -left-3 top-[40%] -translate-y-1/2 z-40 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:text-muted-foreground"><ChevronLeft size={18} /></button>
        <div ref={rail} onScroll={updateControls} className="flex gap-5 sm:gap-6 overflow-x-auto scrollbar-hide pt-2 pb-2 -mt-2">
            {channels.map(channel => <ChannelLogo key={`${channel.id}:${JSON.stringify(channel.thumbnails)}`} channel={channel} />)}
        </div>
        <button type="button" aria-label="Next channels" title="Next channels" disabled={!canScrollRight} onClick={() => rail.current?.scrollBy({ left: 320, behavior: "smooth" })} className="absolute -right-3 top-[40%] -translate-y-1/2 z-40 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:text-muted-foreground"><ChevronRight size={18} /></button>
        </div>
    </section>;
}