"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Play, Plus, Info, ChevronLeft, ChevronRight, Tv, Radio } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useUserPrefs } from "@/hooks/use-user-prefs";
import { listLiveTvChannels, type LiveTvChannelOut } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { BannerSkeleton } from "@/components/BannerSkeleton";
import EpgGuide from "./EpgGuide";

// ─── Banner helpers ───────────────────────────────────────────────────────────

type SlideData = {
    id: string;
    image: string;
    badge: string;
    titleA: string;
    titleB: string;
    desc: string;
    isLive: boolean;
    language: string;
    category: string;
};

function splitTitle(title: string): [string, string] {
    const words = title.trim().split(/\s+/);
    if (words.length === 1) return [title, ""];
    const last = words.pop()!;
    return [words.join(" "), last];
}

function channelToSlide(ch: LiveTvChannelOut): SlideData {
    const image =
        ch.thumbnails.banner ||
        ch.thumbnails.wide ||
        ch.thumbnails.portrait ||
        "/images/hero-banner.jpg";
    const [titleA, titleB] = splitTitle(ch.title);
    return {
        id: ch.id,
        image,
        badge: ch.is_live ? "🔴 LIVE" : ch.category || "TV Channel",
        titleA,
        titleB,
        desc: ch.description ?? "",
        isLive: ch.is_live,
        language: ch.language?.[0] ?? "",
        category: ch.category ?? "",
    };
}

function BannerContent({ slide }: { slide: SlideData }) {
    return (
        <div className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-20 space-y-5">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-primary/20 text-primary border border-primary/30 rounded-full animate-fade-in">
                {slide.badge}
            </span>
            <h2
                className="text-4xl md:text-6xl lg:text-7xl font-display font-800 leading-tight max-w-2xl animate-fade-in text-white"
                style={{ animationDelay: "0.1s" }}
            >
                {slide.titleA}{slide.titleB && <> <span className="text-gradient-gold">{slide.titleB}</span></>}
            </h2>
            {slide.desc && (
                <p
                    className="text-white/70 text-sm md:text-base max-w-lg leading-relaxed animate-fade-in"
                    style={{ animationDelay: "0.2s" }}
                >
                    {slide.desc}
                </p>
            )}
            <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-3 h-auto text-base gap-2">
                    <Link href={`/tv-shows/${slide.id}`}>
                        {slide.isLive ? (
                            <><Radio size={18} /> Watch Live</>
                        ) : (
                            <><Play size={18} fill="currentColor" /> Watch Now</>
                        )}
                    </Link>
                </Button>
                <Button
                    variant="outline"
                    className="bg-transparent border-white/40 text-white hover:bg-white/10 font-medium px-5 py-3 h-auto text-base gap-2"
                >
                    <Plus size={18} /> My List
                </Button>
                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 p-3 h-auto">
                    <Info size={18} />
                </Button>
            </div>
            <div
                className="flex items-center gap-4 text-xs text-white/90 animate-fade-in"
                style={{ animationDelay: "0.4s" }}
            >
                {slide.isLive && (
                    <span className="flex items-center gap-1 text-red-400 font-semibold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        Live Now
                    </span>
                )}
                {slide.language && <span>{slide.language}</span>}
                {slide.category && (
                    <span className="px-1.5 py-0.5 border border-white/40 rounded text-[10px]">{slide.category}</span>
                )}
            </div>
        </div>
    );
}

// Static banner — always shows first slide
function StaticBanner({ slides }: { slides: SlideData[] }) {
    const slide = slides[0];
    return (
        <section className="relative w-full h-[85vh] min-h-[500px]">
            <img
                src={slide.image}
                alt={`${slide.titleA} ${slide.titleB}`}
                className="absolute inset-0 w-full h-full object-cover"
                width={1920}
                height={800}
            />
            <div className="banner-overlay absolute inset-0" />
            <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />
            <BannerContent slide={slide} />
        </section>
    );
}

// Slider banner — auto-advances, no video
function SliderBanner({ slides }: { slides: SlideData[] }) {
    const [current, setCurrent] = useState(0);
    const [transitioning, setTransitioning] = useState(false);

    const goTo = useCallback(
        (idx: number) => {
            if (transitioning) return;
            setTransitioning(true);
            setTimeout(() => {
                setCurrent(idx);
                setTransitioning(false);
            }, 300);
        },
        [transitioning]
    );

    const prev = () => goTo((current - 1 + slides.length) % slides.length);
    const next = useCallback(
        () => goTo((current + 1) % slides.length),
        [current, goTo, slides.length]
    );

    useEffect(() => {
        const t = setTimeout(next, 6000);
        return () => clearTimeout(t);
    }, [current, next]);

    const slide = slides[current];

    return (
        <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
            {slides.map((s, i) => (
                <img
                    key={s.id}
                    src={s.image}
                    alt={`${s.titleA} ${s.titleB}`}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === current ? "opacity-100" : "opacity-0"
                        }`}
                    width={1920}
                    height={800}
                />
            ))}
            <div className="banner-overlay absolute inset-0" />
            <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />

            <div className={`transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}>
                <BannerContent slide={slide} />
            </div>

            <button
                onClick={prev}
                className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
                aria-label="Previous slide"
            >
                <ChevronLeft size={22} />
            </button>
            <button
                onClick={next}
                className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 text-foreground hover:bg-background/70 transition-colors"
                aria-label="Next slide"
            >
                <ChevronRight size={22} />
            </button>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                {slides.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => goTo(i)}
                        className={`transition-all duration-300 rounded-full ${i === current
                            ? "w-6 h-2 bg-primary"
                            : "w-2 h-2 bg-foreground/40 hover:bg-foreground/70"
                            }`}
                        aria-label={`Go to slide ${i + 1}`}
                    />
                ))}
            </div>
            <div className="absolute bottom-6 right-6 lg:right-12 text-xs text-muted-foreground font-medium tabular-nums z-10">
                {current + 1} / {slides.length}
            </div>
        </section>
    );
}

// ─── Channel card ────────────────────────────────────────────────────────────

function ChannelCard({ channel }: { channel: LiveTvChannelOut }) {
    const image =
        channel.thumbnails.portrait ||
        channel.thumbnails.wide ||
        channel.thumbnails.banner ||
        "/images/movie-1.jpg";

    return (
        <Link href={`/tv-shows/${channel.id}`} className="content-card flex-shrink-0 group/card cursor-pointer">
            <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
                <img
                    src={image}
                    alt={channel.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
                    loading="lazy"
                    width={640}
                    height={960}
                />
                <div className="absolute inset-0 bg-background/0 group-hover/card:bg-background/40 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all scale-75 group-hover/card:scale-100">
                        <Play size={20} className="text-primary-foreground ml-0.5" fill="currentColor" />
                    </div>
                </div>
                {channel.is_live && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white rounded">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        LIVE
                    </span>
                )}
                {channel.access_type === "free" && !channel.is_live && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium bg-primary/90 text-primary-foreground rounded">
                        FREE
                    </span>
                )}
            </div>
            <div className="mt-2 space-y-0.5">
                <p className="text-sm font-medium text-foreground truncate">{channel.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {channel.language?.[0] && <span>{channel.language[0]}</span>}
                    {channel.category && <span className="text-primary truncate">{channel.category}</span>}
                </div>
            </div>
        </Link>
    );
}

// ─── Channel row ─────────────────────────────────────────────────────────────

function ChannelRow({ title, items }: { title: string; items: LiveTvChannelOut[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: "left" | "right") => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" });
    };

    if (items.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-xl font-semibold text-foreground">{title}</h3>
            <div className="relative group/row">
                <button
                    onClick={() => scroll("left")}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -translate-x-3 opacity-0 group-hover/row:opacity-100 transition-opacity p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={20} />
                </button>

                <div
                    ref={scrollRef}
                    className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
                    style={{ scrollSnapType: "x mandatory" }}
                >
                    {items.map((ch) => (
                        <ChannelCard key={ch.id} channel={ch} />
                    ))}
                </div>

                <button
                    onClick={() => scroll("right")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 translate-x-3 opacity-0 group-hover/row:opacity-100 transition-opacity p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TVShowsSkeleton() {
    return (
        <>
            <BannerSkeleton />
            <div className="py-10 space-y-10">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-3 px-6 lg:px-12">
                        <div className="h-5 w-48 bg-secondary animate-pulse rounded" />
                        <div className="flex gap-4">
                            {Array.from({ length: 6 }).map((_, j) => (
                                <div key={j} className="content-card flex-shrink-0">
                                    <div className="aspect-[2/3] bg-secondary animate-pulse rounded-lg" />
                                    <div className="mt-2 space-y-1">
                                        <div className="h-3 bg-secondary animate-pulse rounded w-3/4" />
                                        <div className="h-3 bg-secondary animate-pulse rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

// ─── Rendered content (once data is ready) ───────────────────────────────────

function TVShowsContent({
    channels,
    bannerStyle,
}: {
    channels: LiveTvChannelOut[];
    bannerStyle: string;
}) {
    const effectiveStyle = bannerStyle === "video" ? "slider" : bannerStyle;

    const sortedChannels = [
        ...channels.filter((c) => c.is_featured || c.is_live),
        ...channels.filter((c) => !c.is_featured && !c.is_live),
    ];
    const slides = sortedChannels.map(channelToSlide);

    const categoryMap = new Map<string, LiveTvChannelOut[]>();
    for (const ch of channels) {
        const key = ch.category?.trim() || "Uncategorized";
        if (!categoryMap.has(key)) categoryMap.set(key, []);
        categoryMap.get(key)!.push(ch);
    }
    const categoryRows = Array.from(categoryMap.entries());

    return (
        <>
            {slides.length > 0 &&
                (effectiveStyle === "slider" ? (
                    <SliderBanner slides={slides} />
                ) : (
                    <StaticBanner slides={slides} />
                ))}

            <div className="w-full max-w-[1536px] mx-auto min-w-0 px-4 sm:px-6 lg:px-10 py-10 space-y-10">
                {channels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4 px-6">
                        <Tv size={56} className="opacity-30" />
                        <p className="text-lg font-medium">No TV channels available yet</p>
                        <p className="text-sm opacity-70">Check back soon for new content.</p>
                    </div>
                ) : (
                    <>
                        {/* EPG Guide — only for RTMP/SRT channels that have schedulable programs */}
                        {(() => {
                            const liveChannels = channels.filter(
                                (c) => c.source === "rtmp" || c.source === "srt",
                            );
                            return liveChannels.length > 0 ? (
                                <EpgGuide channels={liveChannels} embedded />
                            ) : null;
                        })()}
                        {categoryRows.map(([category, items]) => (
                            <ChannelRow key={category} title={category} items={items} />
                        ))}
                    </>
                )}
            </div>
        </>
    );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function TvShowsPage() {
    const { prefs, prefsReady } = useUserPrefs();

    const { data: channelsData, isLoading: channelsLoading } = useQuery({
        queryKey: ["live-tv-channels-banner"],
        queryFn: () => listLiveTvChannels({ page_size: 100 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    return (
        <>
            {(!prefsReady || channelsLoading) ? (
                <TVShowsSkeleton />
            ) : (
                <TVShowsContent
                    channels={channelsData ?? []}
                    bannerStyle={prefs.bannerStyle}
                />
            )}
        </>
    );
}
