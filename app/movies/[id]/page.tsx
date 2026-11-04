"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Check, Star, ChevronLeft, ChevronRight, Users, Loader2, Lock, Share2, ShieldCheck, Square } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { usePlayGate } from "@/hooks/use-play-gate";
import { useTenantName } from "@/hooks/use-tenant-name";
import { useTheme } from "@/hooks/use-theme";
import { getVideo, listVideos, type VideoOut } from "@/lib/services";
import { fetchCategories } from "@/lib/services/categories";
import { addToWatchlist, removeFromWatchlist, getWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
import type { Movie } from "@/types/content";
import ContentRowSkeleton from "@/components/ContentRowSkeleton";
import { BannerTrailer, useBannerAutoplay } from "@/components/BannerTrailer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// VideoPlayer uses video.js which requires browser APIs — disable SSR
const ManagedVideoPlayer = dynamic(() => import("@/components/ManagedVideoPlayer"), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function trailerEmbedUrl(source: string | null): string | null {
    if (!source) return null;
    try {
        const url = new URL(source);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        const host = url.hostname.replace(/^www\./, "");
        if (["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) {
            const parts = url.pathname.split("/").filter(Boolean);
            const videoId = host === "youtu.be" ? parts[0] : url.searchParams.get("v") || (["embed", "shorts"].includes(parts[0]) ? parts[1] : null);
            return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)
                ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
                : null;
        }
        if (host === "vimeo.com" || host === "player.vimeo.com") {
            const videoId = url.pathname.split("/").filter(Boolean).find(part => /^\d+$/.test(part));
            if (videoId) {
                const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
                embed.searchParams.set("autoplay", "1");
                if (url.searchParams.has("h")) embed.searchParams.set("h", url.searchParams.get("h")!);
                return embed.href;
            }
        }
    } catch {
        return null;
    }
    return null;
}

// ─── Skeleton (content only — Navbar/Footer provided by DemoLayout) ────────────

function MovieDetailsSkeleton() {
    return (
        <>
            <div className="relative w-full h-[70vh] min-h-[460px] bg-secondary animate-pulse pt-16" />
            <div className="px-6 sm:px-14 lg:px-16 py-12 space-y-8">
                <div className="flex gap-6 border-b border-border/40 pb-8">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-24 rounded-xl" />
                    ))}
                </div>
                <div className="space-y-4 max-w-2xl">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-10" />
                    ))}
                </div>
            </div>
        </>
    );
}

// ─── Related movies ─────────────────────────────────────────────────────────

function relatedYear(v: VideoOut): string {
    return v.publish_at
        ? new Date(v.publish_at).getFullYear().toString()
        : new Date(v.created_at).getFullYear().toString();
}

function relatedImage(v: VideoOut): string {
    return (
        v.thumbnails.video_h_thumbnail ||
        v.thumbnails.video_w_thumbnail ||
        v.thumbnails.video_banner ||
        "/images/hero-banner.jpg"
    );
}

function RelatedDefaultCard({ video }: { video: VideoOut }) {
    return (
        <Link href={`/movies/${video.id}`} className="content-card flex-shrink-0 group/card cursor-pointer">
            <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
                <img
                    src={relatedImage(video)}
                    alt={video.title}
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
            </div>
            <div className="mt-2 space-y-0.5">
                <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{relatedYear(video)}</span>
                    {video.rating !== null && (
                        <span className="text-primary">★ {video.rating.toFixed(1)}</span>
                    )}
                </div>
            </div>
        </Link>
    );
}

function RelatedDetailedCard({ video }: { video: VideoOut }) {
    return (
        <Link href={`/movies/${video.id}`} className="content-card flex-shrink-0 group/card cursor-pointer">
            <div className="relative rounded-lg overflow-hidden card-shine aspect-[2/3] bg-secondary">
                <img
                    src={relatedImage(video)}
                    alt={video.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                    loading="lazy"
                    width={640}
                    height={960}
                />
                <div className="absolute inset-0 flex flex-col justify-end translate-y-full group-hover/card:translate-y-0 transition-transform duration-300 ease-out">
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent" />
                    <div className="relative p-3 space-y-2">
                        {video.category && (
                            <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 rounded-full">
                                {video.category}
                            </span>
                        )}
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{video.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{relatedYear(video)}</span>
                            {video.rating !== null && (
                                <span className="flex items-center gap-0.5 text-primary font-medium">
                                    <Star size={10} fill="currentColor" />{video.rating.toFixed(1)}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                                <Play size={11} fill="currentColor" /> Watch
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-2 space-y-0.5">
                <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{relatedYear(video)}</span>
                    {video.rating !== null && (
                        <span className="text-primary">★ {video.rating.toFixed(1)}</span>
                    )}
                </div>
            </div>
        </Link>
    );
}

function RelatedMovies({ ids }: { ids: string[] }) {
    const { prefs } = useUserPrefs();
    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: videos, isLoading } = useQuery({
        queryKey: ["related-videos", ...ids],
        queryFn: () => Promise.all(ids.map(getVideo)),
        enabled: ids.length > 0,
    });

    if (ids.length === 0) return null;

    const scroll = (dir: "left" | "right") => {
        scrollRef.current?.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
    };

    return (
        <section className="px-6 lg:px-12 pb-12 space-y-4">
            <h2 className="text-xl font-display font-700 text-foreground">Related Movies</h2>
            {isLoading ? (
                <div className="flex gap-3 overflow-hidden">
                    {ids.map((id) => (
                        <Skeleton key={id} className="content-card flex-shrink-0 aspect-[2/3] rounded-lg" />
                    ))}
                </div>
            ) : videos && videos.length > 0 ? (
                <div className="relative group">
                    <button
                        onClick={() => scroll("left")}
                        className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-background/60 backdrop-blur-sm flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                        {videos.map((v) =>
                            prefs.cardStyle === "detailed"
                                ? <RelatedDetailedCard key={v.id} video={v} />
                                : <RelatedDefaultCard key={v.id} video={v} />
                        )}
                    </div>
                    <button
                        onClick={() => scroll("right")}
                        className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-background/60 backdrop-blur-sm flex items-center justify-center text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Scroll right"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">No related movies found.</p>
            )}
        </section>
    );
}

function SameCategoryMovies({ video }: { video: VideoOut }) {
    const { activeTheme } = useTheme();
    const { ContentRow } = activeTheme.components;
    const assignedCategories = video.categories?.length
        ? video.categories
        : video.category ? [video.category] : [];
    const { data: categories = [], isLoading: categoriesLoading } = useQuery({
        queryKey: ["poster-categories", "video"],
        queryFn: () => fetchCategories("video"),
        enabled: assignedCategories.length > 0,
        staleTime: 5 * 60_000,
    });
    const category = assignedCategories
        .map(value => categories.find(item => item.slug === value || item.name === value || item.id === value))
        .find(item => item !== undefined);
    const { data: videos = [], isLoading: videosLoading } = useQuery({
        queryKey: ["same-category-videos", category?.slug],
        queryFn: () => listVideos({ category: category!.slug, page_size: 21 }),
        enabled: !!category,
        staleTime: 60_000,
    });
    const landscape = category?.thumbnail_view !== "portrait";
    const rowVariant = category?.thumbnail_view === "portrait"
        ? "featured"
        : category?.thumbnail_view === "wider_landscape"
            ? "wider-landscape"
            : "landscape";

    if (assignedCategories.length === 0) return null;
    if (categoriesLoading || (category && videosLoading)) {
        return <div className="overflow-x-clip pb-12"><ContentRowSkeleton count={6} variant={category?.thumbnail_view === "wider_landscape" ? "wider-landscape" : landscape ? "landscape" : "portrait"} /></div>;
    }
    if (!category) return null;

    const movies: Movie[] = videos.filter(item => item.id !== video.id).slice(0, 20).map(item => ({
        id: item.id,
        title: item.title,
        image: landscape
            ? item.thumbnails.video_w_thumbnail || item.thumbnails.video_banner || relatedImage(item)
            : relatedImage(item),
        year: relatedYear(item),
        rating: item.rating != null ? item.rating.toFixed(1) : "",
        categories: item.categories?.length ? item.categories : [category.slug],
        ageRating: item.age_rating,
        duration: item.duration,
        classification: item.content_classification,
        previewImage: item.thumbnails.video_banner || item.thumbnails.video_w_thumbnail || relatedImage(item),
        videoUrl: item.video_display_url || item.video_url,
        hlsUrl: item.hls_display_url || item.hls_url,
        trailerUrl: item.trailer_display_url,
        trailerHlsUrl: item.trailer_hls_url,
    }));
    if (movies.length === 0) return null;

    return (
        <div className={`overflow-x-clip pb-12 ${activeTheme.id === "ember" ? "" : "lg:px-8"}`}>
            <ContentRow
                title={`More in ${category.name}`}
                movies={movies}
                variant={rowVariant}
                href={`/categories/${encodeURIComponent(category.slug)}`}
            />
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MovieDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const tenantName = useTenantName();
    const searchParams = useSearchParams();
    const [showPlayer, setShowPlayer] = useState(false);
    const [trailerVideoId, setTrailerVideoId] = useState<string | null>(null);
    const showTrailer = trailerVideoId === id;
    const { active: bannerActive, bannerRef } = useBannerAutoplay();
    const { user, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();

    const { data: video, isLoading, isError } = useQuery({
        queryKey: ["video", id],
        queryFn: () => getVideo(id),
        enabled: !!id,
    });

    const { data: watchlist = [] } = useQuery({
        queryKey: ["watchlist"],
        queryFn: getWatchlist,
        enabled: !!user,
        staleTime: 60_000,
    });

    const isInWatchlist = watchlist.some((item) => item.video_id === id);

    const watchlistMutation = useMutation<void | WatchlistItem>({
        mutationFn: () =>
            isInWatchlist ? removeFromWatchlist(id) : addToWatchlist(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({
                title: isInWatchlist ? "Removed from My List" : "Added to My List",
            });
        },
        onError: () => {
            toast({
                title: "Couldn't update your list",
                description: "Please try again.",
                variant: "destructive",
            });
        },
    });

    const { handlePlay, hasAccess, accessLoading } = usePlayGate({
        contentId: id,
        accessType: (video?.access_type ?? "free") as "free" | "subscription" | "pay_per_view" | "rental",
        contentTitle: video?.title ?? "this movie",
        onPlay: () => { setTrailerVideoId(null); setShowPlayer(true); },
    });

    // Auto-launch player when ?play=true (e.g. from Banner "Watch Now" link).
    // Waits for the access check to finish before calling handlePlay so that
    // a subscription-holder is never wrongly redirected to /pricing.
    const autoPlayFiredRef = useRef(false);
    useEffect(() => {
        if (searchParams.get("play") !== "true" || !video || showPlayer) return;
        if (accessLoading) return;
        if (autoPlayFiredRef.current) return;
        autoPlayFiredRef.current = true;
        handlePlay();
    }, [video, searchParams, accessLoading, handlePlay, showPlayer]);

    useEffect(() => {
        if (!showPlayer) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setShowPlayer(false);
        };
        window.addEventListener("keydown", closeOnEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [showPlayer]);

    useEffect(() => {
        if (video) document.title = `${video.title} | ${tenantName}`;
        return () => { document.title = tenantName; };
    }, [tenantName, video]);

    if (isLoading) {
        return <MovieDetailsSkeleton />;
    }

    if (isError || !video) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 pt-16">
                <p className="text-muted-foreground text-lg">Movie not found.</p>
                <Link href="/">
                    <Button variant="outline">
                        <ChevronLeft size={16} /> Back to Home
                    </Button>
                </Link>
            </div>
        );
    }

    const backdrop =
        video.thumbnails.video_banner ||
        video.thumbnails.video_h_thumbnail ||
        video.thumbnails.video_w_thumbnail ||
        "/images/hero-banner.jpg";

    const year = video.publish_at
        ? new Date(video.publish_at).getFullYear().toString()
        : new Date(video.created_at).getFullYear().toString();

    const duration = formatDuration(video.duration);
    const playbackSrc = video.hls_display_url || video.hls_url || video.video_display_url || video.video_url;
    const trailerHls = video.trailer_hls_url?.trim() || null;
    const trailerFile = video.trailer_display_url?.trim() || null;
    const trailerUrl = video.trailer_url?.trim() || null;
    const trailerEmbed = trailerHls || trailerFile ? null : trailerEmbedUrl(trailerUrl);
    const trailerMedia = trailerFile || (!trailerEmbed && trailerUrl && /\.(mp4|m3u8)(?:[?#]|$)/i.test(trailerUrl) ? trailerUrl : null);
    const trailerHlsSource = trailerHls || (trailerMedia && /\.m3u8(?:[?#]|$)/i.test(trailerMedia) ? trailerMedia : null);
    const trailerFileSource = trailerMedia === trailerHlsSource ? null : trailerMedia;
    const hasTrailer = !!(trailerHlsSource || trailerFileSource || trailerEmbed);

    const handleShare = async () => {
        const url = new URL(window.location.pathname, window.location.origin).href;
        try {
            if (navigator.share) {
                await navigator.share({ title: video.title, url });
            } else {
                await navigator.clipboard.writeText(url);
                toast({ title: "Movie link copied" });
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            toast({ title: "Couldn't share this movie", description: "Please try again.", variant: "destructive" });
        }
    };

    const directors = video.cast_crew.filter((c) => c.role === "Director");
    const cast = video.cast_crew.filter((c) =>
        ["Actor", "Actress"].includes(c.role)
    );
    const otherCrew = video.cast_crew.filter(
        (c) => !["Actor", "Actress", "Director"].includes(c.role)
    );

    return (
        <>

            {/* ── Player (shown after Watch Now) ──────────────────────────── */}
            {showPlayer && (
                <div className="fixed inset-0 z-[100] bg-black">
                    <ManagedVideoPlayer
                        fallbackSrc={playbackSrc!}
                        videoId={video.id}
                        poster={backdrop}
                        autoPlay
                        immersiveControls
                        title={video.title}
                        onClose={() => setShowPlayer(false)}
                        className="h-full w-full"
                    />
                </div>
            )}

            {/* ── Hero / Backdrop (hidden while player is open) ───────────── */}
            {!showPlayer && (
                <section ref={bannerRef} aria-label={`${video.title} movie banner`} className="relative isolate flex w-full min-h-[560px] items-center overflow-hidden pt-24 pb-12 sm:min-h-[600px] sm:pb-16 lg:min-h-[640px]">
                    <img
                        src={backdrop}
                        alt={video.title}
                        className="absolute inset-0 h-full w-full object-cover object-[70%_30%]"
                        width={1920}
                        height={1080}
                    />
                    {hasTrailer && showTrailer && (trailerEmbed ? (
                        bannerActive && <iframe
                            title={`${video.title} trailer`}
                            src={trailerEmbed}
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="absolute inset-0 h-full w-full border-0"
                        />
                    ) : (
                        <BannerTrailer
                            key={video.id}
                            src={trailerFileSource}
                            hlsSrc={trailerHlsSource}
                            hovered={bannerActive}
                            delayMs={0}
                            manualPlayback
                            showSoundControl
                            soundControlPlacement="bottom-right"
                            positionClassName="object-[70%_30%]"
                            onEnded={() => setTrailerVideoId(null)}
                            onPlaybackError={() => {
                                setTrailerVideoId(null);
                                toast({ title: "Trailer could not be played", description: "Please try again later.", variant: "destructive" });
                            }}
                        />
                    ))}
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.96)_0%,rgba(0,0,0,0.8)_28%,rgba(0,0,0,0.3)_60%,rgba(0,0,0,0.05)_100%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-black/20 sm:bg-transparent" />
                    <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />

                    <div className="relative z-10 flex w-full flex-col gap-8 px-6 sm:px-14 lg:block lg:px-16">
                      <div className="w-full max-w-xl space-y-4">
                        <Link href="/" className="inline-flex items-center gap-1 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                            <ChevronLeft size={16} aria-hidden="true" /> Back
                        </Link>
                        {video.content_classification && (
                            <span className="block w-fit rounded border border-primary/70 bg-black/30 px-2.5 py-1 text-xs font-semibold text-primary">
                                {video.content_classification}
                            </span>
                        )}
                        <h1 className="max-w-xl font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-normal text-white [overflow-wrap:anywhere] text-balance sm:text-5xl lg:text-6xl" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}>
                            {video.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-white/85 [&>span+span]:border-l [&>span+span]:border-white/30 [&>span+span]:pl-3">
                            {year && <span>{year}</span>}
                            {video.category && <span>{video.category}</span>}
                            {duration && <span>{duration}</span>}
                            {video.language.length > 0 && <span>{video.language.join(", ")}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-1 text-white">
                                {video.rating !== null && (
                                    <div className="flex items-center gap-2.5">
                                        <Star size={24} className="shrink-0 text-amber-400" fill="currentColor" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-bold leading-tight">{video.rating.toFixed(1)}<span className="font-normal text-white/70">/10</span></p>
                                            <p className="mt-0.5 text-xs text-white/65">Rating</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex max-w-full items-center gap-5">
                                {video.age_rating && (
                                    <div className={`flex items-center gap-2.5 ${video.rating !== null ? "border-l border-white/30 pl-5" : ""}`}>
                                        <ShieldCheck size={24} className="shrink-0 text-white/90" aria-hidden="true" />
                                        <div>
                                            <p className="text-sm font-semibold leading-tight">{video.age_rating}</p>
                                            <p className="mt-0.5 text-xs text-white/65">Maturity rating</p>
                                        </div>
                                    </div>
                                )}
                                <div className={`flex items-center gap-2.5 ${video.rating !== null || video.age_rating ? "border-l border-white/30 pl-5" : ""}`}>
                                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${video.access_type === "free" ? "bg-emerald-400" : video.access_type === "subscription" ? "bg-primary" : "bg-amber-400"}`} aria-hidden="true" />
                                    <div>
                                        <p className="text-sm font-semibold leading-tight capitalize">
                                            {video.access_type === "pay_per_view"
                                                ? `PPV${video.ppv_price ? ` · $${video.ppv_price}` : ""}`
                                                : video.access_type}
                                        </p>
                                        <p className="mt-0.5 text-xs text-white/65">Access</p>
                                    </div>
                                </div>
                                </div>
                        </div>
                        {(video.short_description || video.long_description) && (
                            <p className="max-w-[52ch] text-sm leading-relaxed text-white/90 line-clamp-4 sm:text-base">
                                {video.short_description || video.long_description}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                            {playbackSrc ? (
                                <Button
                                    onClick={handlePlay}
                                    disabled={accessLoading}
                                    className="h-12 max-w-full gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-8 sm:text-base"
                                >
                                    {accessLoading ? (
                                        <><Loader2 size={18} className="animate-spin" /> Checking…</>
                                    ) : hasAccess || video?.access_type === "free" ? (
                                        <><Play size={18} fill="currentColor" /> Play Now</>
                                    ) : video?.access_type === "subscription" ? (
                                        <><Lock size={18} /> Subscribe to Watch</>
                                    ) : video?.access_type === "rental" ? (
                                        <><Play size={18} fill="currentColor" /> Rent to Watch</>
                                    ) : video?.access_type === "pay_per_view" ? (
                                        <><Play size={18} fill="currentColor" /> Buy to Watch</>
                                    ) : (
                                        <><Play size={18} fill="currentColor" /> Play Now</>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    disabled
                                    className="h-12 max-w-full gap-2 rounded-md bg-primary/50 px-6 text-sm font-semibold text-primary-foreground cursor-not-allowed"
                                >
                                    <Play size={18} fill="currentColor" /> Not Available
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => watchlistMutation.mutate()}
                                disabled={watchlistMutation.isPending || authLoading}
                                aria-pressed={isInWatchlist}
                                className="h-12 gap-2 rounded-md border-white/40 bg-black/25 px-5 text-sm font-medium text-white hover:bg-white/10 hover:text-white sm:text-base"
                            >
                                {watchlistMutation.isPending ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : isInWatchlist ? (
                                    <Check size={18} />
                                ) : (
                                    <Plus size={18} />
                                )}
                                {isInWatchlist ? "In My List" : "My List"}
                            </Button>
                            <Button variant="outline" onClick={handleShare} className="h-12 gap-2 rounded-md border-white/40 bg-black/25 px-5 text-sm font-medium text-white hover:bg-white/10 hover:text-white sm:text-base">
                                <Share2 size={18} aria-hidden="true" /> Share
                            </Button>
                        </div>
                        </div>
                        {hasTrailer && (
                            <div className="h-16 lg:h-0">
                            {!showTrailer && (
                            <button
                                type="button"
                                onClick={() => setTrailerVideoId(id)}
                                className="group/trailer flex w-fit items-center gap-3 self-start text-white outline-none lg:absolute lg:left-[76%] lg:top-1/2 lg:-translate-y-1/2 lg:flex-col"
                                aria-label={`Watch ${video.title} trailer`}
                                title="Watch Trailer"
                            >
                                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white bg-black/35 shadow-[0_0_0_5px_rgba(255,255,255,0.12)] backdrop-blur-sm transition-colors group-hover/trailer:bg-white/20 group-focus-visible/trailer:ring-2 group-focus-visible/trailer:ring-white group-focus-visible/trailer:ring-offset-4 group-focus-visible/trailer:ring-offset-black lg:h-20 lg:w-20">
                                    <Play size={30} fill="currentColor" className="ml-1" aria-hidden="true" />
                                </span>
                                <span className="text-sm font-semibold drop-shadow-md">Watch Trailer</span>
                            </button>
                            )}
                            </div>
                        )}
                    </div>
                    {hasTrailer && showTrailer && (
                        <button
                            type="button"
                            onClick={() => setTrailerVideoId(null)}
                            className="absolute bottom-8 right-16 z-20 inline-flex h-8 items-center gap-2 rounded-md border border-white/40 bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            title="Stop trailer"
                        >
                            <Square size={14} fill="currentColor" aria-hidden="true" /> Stop Trailer
                        </button>
                    )}
                </section>
            )}

            {/* ── Details ──────────────────────────────────────────────────── */}
            <div className="px-6 sm:px-14 lg:px-16 py-10 space-y-10">

                {/* Two-column layout — overview + metadata */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">

                    {/* Left — overview, cast, crew */}
                    <div className="space-y-8">
                        {(video.long_description || video.short_description) && (
                            <div className="space-y-3">
                                <h2 className="text-lg font-semibold text-foreground">Overview</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    {video.long_description || video.short_description}
                                </p>
                            </div>
                        )}

                        {cast.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                    <Users size={18} className="text-primary" /> Cast
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {cast.map((member, i) => (
                                        <div key={i} className="px-3 py-1.5 rounded-lg bg-secondary text-sm border border-border/50">
                                            <span className="text-foreground font-medium">{member.name}</span>
                                            {member.character && (
                                                <span className="text-muted-foreground ml-1.5 text-xs">as {member.character}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {otherCrew.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-lg font-semibold text-foreground">Crew</h2>
                                <div className="flex flex-wrap gap-2">
                                    {otherCrew.map((member, i) => (
                                        <div key={i} className="px-3 py-1.5 rounded-lg bg-secondary text-sm border border-border/50">
                                            <span className="text-xs text-primary uppercase tracking-wider mr-1.5">{member.role}</span>
                                            <span className="text-foreground font-medium">{member.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right — metadata sidebar */}
                    <div className="space-y-6 lg:border-l lg:border-border/40 lg:pl-10">
                        {directors.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">{directors.length === 1 ? "Director" : "Directors"}</p>
                                <div className="space-y-1">
                                    {directors.map((d, i) => (
                                        <p key={i} className="text-sm text-foreground font-medium">{d.name}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                        {video.category && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Genre</p>
                                <p className="text-sm text-foreground font-medium">{video.category}</p>
                            </div>
                        )}
                        {video.content_classification && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Type</p>
                                <p className="text-sm text-foreground font-medium">{video.content_classification}</p>
                            </div>
                        )}
                        {/* Language badges */}
                        {video.language.length > 0 && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Available In</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {video.language.map((lang) => (
                                        <Badge key={lang} variant="secondary" className="text-xs">{lang}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Related Movies ──────────────────────────────────────────── */}
            <SameCategoryMovies key={video.id} video={video} />
            <RelatedMovies ids={video.related_video_ids} />


        </>
    );
}
