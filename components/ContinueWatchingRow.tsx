"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRowScroll } from "@/hooks/use-row-scroll";
import { getVideo } from "@/lib/services/videos";
import { WATCH_HISTORY_EVENT, watchHistoryKey, readWatchHistory, removeWatchHistoryItem, type WatchHistoryItem } from "@/lib/watch-history";

export default function ContinueWatchingRow() {
    const { user } = useAuth();
    const key = user?.client_id && user.id ? watchHistoryKey(user.client_id, user.id) : null;
    const [history, setHistory] = useState<{ key: string | null; items: WatchHistoryItem[] }>({ key: null, items: [] });

    useEffect(() => {
        const sync = () => setHistory({ key, items: key ? readWatchHistory(key) : [] });
        const onStorage = (event: StorageEvent) => { if (!event.key || event.key === key) sync(); };
        sync();
        window.addEventListener(WATCH_HISTORY_EVENT, sync);
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", sync);
        return () => {
            window.removeEventListener(WATCH_HISTORY_EVENT, sync);
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("focus", sync);
        };
    }, [key]);

    const items = history.key === key && key ? history.items : [];
    const videos = useQueries({ queries: items.map(item => ({
        queryKey: ["continue-watching-video", user?.client_id, item.id],
        queryFn: () => getVideo(item.id),
        staleTime: 60_000,
        retry: false,
    })) });
    const entries = items.flatMap((item, index) => {
        const query = videos[index];
        const video = query.data;
        if (query.isError || (video && (!video.is_active || video.deleted_at))) return [];
        return [{ ...item, title: video?.title || item.title, image: video?.thumbnails.video_w_thumbnail || video?.thumbnails.video_banner || item.image }];
    });
    const { scrollRef: rail, canScrollLeft, canScrollRight } = useRowScroll(entries.length);
    if (!key || !entries.length) return null;

    const firstName = user?.full_name?.trim().split(/\s+/)[0];
    const title = firstName ? `Continue Watching for ${firstName}` : "Continue Watching";
    const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * 0.8, behavior: "smooth" });

    return <section aria-label={title} className="storefront-row pt-8 pb-2">
        <h2 className="mb-3 text-lg font-semibold md:text-xl">{title}</h2>
        <div className="relative group [--row-artwork-height:7.734rem] sm:[--row-artwork-height:8.438rem] lg:[--row-artwork-height:9.141rem]">
            <button type="button" title="Previous continue watching titles" aria-label="Previous continue watching titles" disabled={!canScrollLeft} onClick={() => scroll(-1)} className="storefront-row-arrow -left-3"><ChevronLeft size={18} /></button>
            <div ref={rail} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory py-1">
                {entries.map(item => {
                    const progress = Math.min(100, Math.round(item.position / item.duration * 100));
                    const remaining = Math.max(1, Math.ceil((item.duration - item.position) / 60));
                    return <article key={item.id} className="group/card relative w-[220px] shrink-0 snap-start sm:w-[240px] lg:w-[260px]">
                        <div className="relative aspect-video overflow-hidden rounded-lg bg-secondary">
                            <Link href={`/movies/${encodeURIComponent(item.id)}?play=true`} aria-label={`Resume ${item.title}, ${remaining} minutes remaining`} title={`Resume ${item.title}`} className="absolute inset-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                                <img src={item.image} alt={item.title} width={520} height={293} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover/card:scale-105" onError={event => {
                                    if (!event.currentTarget.src.endsWith("/images/hero-banner.jpg")) event.currentTarget.src = "/images/hero-banner.jpg";
                                }} />
                                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-3 text-white opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100">
                                    <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black"><Play size={17} fill="currentColor" /></span>
                                    <p className="truncate text-sm font-semibold">{item.title}</p>
                                    <p className="text-xs text-white/80">{remaining} min left</p>
                                </div>
                            </Link>
                            <button type="button" title={`Remove ${item.title} from Continue Watching`} aria-label={`Remove ${item.title} from Continue Watching`} onClick={() => removeWatchHistoryItem(key, item.id)} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-100 transition-opacity hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100"><X size={15} /></button>
                        </div>
                        <div role="progressbar" aria-label={`${item.title} watch progress`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${remaining} minutes remaining`} className="mx-auto mt-1.5 h-[3px] w-3/5 overflow-hidden bg-foreground/30">
                            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                    </article>;
                })}
            </div>
            <button type="button" title="Next continue watching titles" aria-label="Next continue watching titles" disabled={!canScrollRight} onClick={() => scroll(1)} className="storefront-row-arrow -right-3"><ChevronRight size={18} /></button>
        </div>
    </section>;
}