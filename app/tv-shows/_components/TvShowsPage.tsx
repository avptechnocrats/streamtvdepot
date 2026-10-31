"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useRef } from "react";
import { CalendarDays, Globe2, Heart, MapPin, Play, Plus, Info, ChevronLeft, ChevronRight, Share2, ShoppingCart, Tv, Radio, WifiOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { listLiveTvChannels, listPpvEvents, type LiveTvChannelOut, type PublicPpvEvent } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { BannerSkeleton } from "@/components/BannerSkeleton";
import EpgGuide from "./EpgGuide";
import ManagedBannerSlot from "@/components/ManagedBannerSlot";

const VideoPlayer = dynamic(() => import("@/components/VideoPlayer"), { ssr: false });
const ManagedLivePlayer = dynamic(() => import("@/components/ManagedLivePlayer"), { ssr: false });
const REGIONS = ["All Channels", "Caribbean", "South America", "North America", "Europe", "Asia", "Africa", "Middle East", "Australia"] as const;

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

function categoryLabel(slug: string): string {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function primaryCategory(channel: LiveTvChannelOut): string {
    return channel.categories?.[0] ?? "";
}

function channelToSlide(ch: LiveTvChannelOut): SlideData {
    const image =
        ch.thumbnails.banner ||
        ch.thumbnails.wide ||
        ch.thumbnails.portrait ||
        "/images/hero-banner.jpg";
    const [titleA, titleB] = splitTitle(ch.title);
    const category = primaryCategory(ch);
    return {
        id: ch.id,
        image,
        badge: ch.is_live ? "🔴 LIVE" : categoryLabel(category || "TV Channel"),
        titleA,
        titleB,
        desc: ch.description ?? "",
        isLive: ch.is_live,
        language: ch.language?.[0] ?? "",
        category: categoryLabel(category),
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
                    {channel.categories?.length > 0 && <span className="text-primary truncate">{channel.categories.map(categoryLabel).join(", ")}</span>}
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

function channelImage(channel: LiveTvChannelOut): string {
    return channel.thumbnails.portrait || channel.thumbnails.wide || channel.thumbnails.banner || "/images/movie-1.jpg";
}

function ChannelPlayer({ channel }: { channel: LiveTvChannelOut }) {
    const poster = channel.thumbnails.banner || channel.thumbnails.wide || channel.thumbnails.portrait || undefined;
    if (channel.managed_playback) return <ManagedLivePlayer key={channel.id} channelId={channel.id} poster={poster} className="h-full w-full" />;
    if (channel.stream_url) return <VideoPlayer key={channel.id} src={channel.stream_url} poster={poster} autoPlay muted allowSeeking={false} className="h-full w-full" />;
    return <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 text-white/60"><WifiOff size={32} /><p className="text-sm">This channel is currently unavailable.</p></div>;
}

function ChannelTile({ channel, selected, onSelect }: { channel: LiveTvChannelOut; selected: boolean; onSelect: () => void }) {
    return (
        <button type="button" onClick={onSelect} className={`relative h-[72px] w-[116px] shrink-0 overflow-hidden rounded border transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-white/10 hover:border-white/50"}`} aria-label={`Watch ${channel.title}`}>
            <img src={channelImage(channel)} alt="" className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1 text-left text-[10px] font-medium text-white truncate">{channel.title}</span>
            {channel.is_live && <span className="absolute left-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold text-white">LIVE</span>}
        </button>
    );
}

function PpvBanner({ event }: { event: PublicPpvEvent }) {
    const image = event.thumbnails.banner || event.thumbnails.wide || event.thumbnails.portrait;
    return (
        <section className="relative min-h-[260px] overflow-hidden border border-primary/60 bg-zinc-950">
            {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
            <div className="absolute inset-0 bg-gradient-to-r from-[#080b12] via-[#080b12]/90 to-[#080b12]/20" />
            <div className="relative flex min-h-[260px] max-w-xl flex-col justify-center px-6 py-8 sm:px-10">
                <span className="w-fit rounded bg-primary px-2 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">PPV</span>
                <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">{event.title}</h2>
                {event.category && <p className="mt-1 text-sm font-medium text-primary">{event.category}</p>}
                <div className="mt-4 flex items-center gap-2 text-sm text-white/80"><CalendarDays size={16} /> {event.is_live ? "Live now" : "Available soon"}</div>
                {event.description && <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">{event.description}</p>}
                <Button asChild className="mt-6 w-fit gap-2 bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"><Link href={`/checkout?type=ppv&contentId=${encodeURIComponent(event.id)}`}><ShoppingCart size={16} /> Buy Now PPV</Link></Button>
            </div>
        </section>
    );
}

function TVShowsContent({
    channels,
    ppvEvents,
}: {
    channels: LiveTvChannelOut[];
    ppvEvents: PublicPpvEvent[];
}) {
    const [activeRegion, setActiveRegion] = useState<(typeof REGIONS)[number]>("All Channels");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const regionChannels = activeRegion === "All Channels" ? channels : channels.filter((channel) => channel.region?.includes(activeRegion));
    const playableChannels = regionChannels.filter((channel) => channel.managed_playback || channel.stream_url);
    const selected = channels.find((channel) => channel.id === selectedId)
        ?? playableChannels.find((channel) => channel.is_live && channel.access_type === "free")
        ?? playableChannels[0]
        ?? regionChannels[0]
        ?? channels[0];
    const liveChannels = channels.filter((channel) => channel.source === "rtmp" || channel.source === "srt");
    const ppvEvent = ppvEvents.find((event) => event.is_live) ?? ppvEvents[0];
    const shareSelectedChannel = () => {
        const url = `${window.location.origin}/tv-shows/${selected?.id}`;
        if (navigator.share) {
            void navigator.share({ title: selected?.title, text: selected?.description ?? undefined, url });
            return;
        }
        void navigator.clipboard?.writeText(url);
    };

    if (!selected) return <main className="pt-16"><ManagedBannerSlot page="/tv-shows" position="top" /><div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-muted-foreground"><Tv size={44} className="opacity-40" /><p>No TV channels available yet.</p></div><ManagedBannerSlot page="/tv-shows" position="middle_1" /><ManagedBannerSlot page="/tv-shows" position="middle_2" /><ManagedBannerSlot page="/tv-shows" position="bottom" /></main>;

    return (
        <main className="bg-[#080b12] pb-12 pt-16 text-white">
            <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-14">
                <section className="grid min-h-[440px] grid-cols-1 border-b border-white/10 lg:grid-cols-[minmax(330px,0.82fr)_minmax(0,1.5fr)]">
                <div className="flex h-full flex-col justify-center bg-[#080b12] py-8">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70"><span className={`rounded px-2 py-1 text-[10px] text-white ${selected.is_live ? "bg-red-600" : "bg-white/15"}`}>{selected.is_live ? "Live" : "Channel"}</span><span className="truncate">Channel: {selected.title}</span></div>
                    <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{selected.title}</h1>
                    {selected.description && <p className="mt-3 max-w-md text-sm leading-relaxed text-white/72">{selected.description}</p>}
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/75">
                        {selected.language?.[0] && <span className="flex items-center gap-1.5"><Globe2 size={14} /> {selected.language[0]}</span>}
                        {selected.categories?.[0] && <span className="flex items-center gap-1.5"><Tv size={14} /> {categoryLabel(selected.categories[0])}</span>}
                        <span className="flex items-center gap-1.5"><MapPin size={14} /> Region: {selected.region?.join(", ") || "Not specified"}</span>
                    </div>
                    <Button className="mt-6 h-11 w-full max-w-[260px] gap-2 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Play size={16} fill="currentColor" /> Watch Now Live</Button>
                    <div className="mt-3 flex w-full max-w-[260px] gap-2">
                        <Button variant="outline" className="h-10 flex-1 gap-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Heart size={15} /> Favourite</Button>
                        <Button variant="outline" onClick={shareSelectedChannel} className="h-10 flex-1 gap-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Share2 size={15} /> Share</Button>
                    </div>
                </div>
                <div className="min-h-[270px] bg-black lg:min-h-0"><ChannelPlayer channel={selected} /></div>
                </section>
            </div>

            <ManagedBannerSlot page="/tv-shows" position="top" />
            <div className="mx-auto max-w-[1536px] space-y-9 px-4 py-8 sm:px-6 lg:px-14">
                <section>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><Radio size={18} className="text-primary" /><h2 className="text-xl font-semibold">Watch Live TV by Region</h2></div><p className="mt-1 text-xs text-white/55">Explore channels from around the world.</p></div></div>
                    <div className="flex gap-2 overflow-x-auto pb-2">{REGIONS.map((region) => <button key={region} type="button" onClick={() => setActiveRegion(region)} className={`h-9 shrink-0 border px-3 text-xs font-medium transition-colors ${activeRegion === region ? "border-primary bg-primary text-primary-foreground" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"}`}>{region}</button>)}</div>
                    {regionChannels.length > 0 ? <div className="mt-3 flex gap-3 overflow-x-auto pb-2">{regionChannels.map((channel) => <ChannelTile key={channel.id} channel={channel} selected={channel.id === selected.id} onSelect={() => setSelectedId(channel.id)} />)}</div> : <p className="py-5 text-sm text-white/50">No channels available in this region yet.</p>}
                </section>

                <ManagedBannerSlot page="/tv-shows" position="middle_1" inset />
                {liveChannels.length > 0 && <EpgGuide channels={liveChannels} embedded />}
                <ManagedBannerSlot page="/tv-shows" position="middle_2" inset />
                {ppvEvent && <PpvBanner event={ppvEvent} />}
            </div>
            <ManagedBannerSlot page="/tv-shows" position="bottom" />
        </main>
    );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function TvShowsPage() {
    const { data: channelsData, isLoading: channelsLoading } = useQuery({
        queryKey: ["live-tv-channels-watch-regions"],
        queryFn: () => listLiveTvChannels({ page_size: 100 }),
        staleTime: 0,
        refetchOnMount: "always",
        retry: 1,
    });
    const { data: ppvData } = useQuery({
        queryKey: ["ppv-events-watch"],
        queryFn: () => listPpvEvents({ page_size: 10 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    if (channelsLoading) return <BannerSkeleton />;
    return <TVShowsContent channels={channelsData ?? []} ppvEvents={ppvData ?? []} />;
}
