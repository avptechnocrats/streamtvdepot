"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Check, Star, Clock, Calendar, Globe, ChevronLeft, ChevronRight, Users, Film, Loader2, Lock } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { usePlayGate } from "@/hooks/use-play-gate";
import { getVideo, type VideoOut } from "@/lib/services";
import { addToWatchlist, removeFromWatchlist, getWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
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

// ─── Skeleton (content only — Navbar/Footer provided by DemoLayout) ────────────

function MovieDetailsSkeleton() {
    return (
        <>
            <div className="relative w-full h-[70vh] min-h-[460px] bg-secondary animate-pulse pt-16" />
            <div className="px-6 lg:px-12 py-12 space-y-8">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MovieDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const [showPlayer, setShowPlayer] = useState(false);
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
        onPlay: () => setShowPlayer(true),
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
        if (video) document.title = `${video.title} | SignalView`;
        return () => { document.title = "SignalView — Stream Movies & TV Shows"; };
    }, [video]);

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
    const score = video.rating ? `${Math.round(video.rating * 10)}%` : null;
    const playbackSrc = video.hls_display_url || video.hls_url || video.video_display_url || video.video_url;

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
                <div className="relative w-full h-[70vh] min-h-[460px] overflow-hidden pt-16">
                    <img
                        src={backdrop}
                        alt={video.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        width={1920}
                        height={1080}
                    />
                    {/* Shared gradient classes — text contrast + bottom page blend */}
                    <div className="banner-overlay absolute inset-0" />
                    <div className="banner-bottom-fade absolute inset-0 pointer-events-none" />

                    {/* Back button */}
                    <div className="absolute top-20 left-6 lg:left-12 z-10">
                        <Link href="/">
                            <Button
                                variant="ghost"
                                className="text-white/80 hover:text-white hover:bg-white/10 gap-1.5"
                            >
                                <ChevronLeft size={16} /> Back
                            </Button>
                        </Link>
                    </div>

                    {/* Hero text overlay */}
                    <div className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-16 z-10 space-y-4">
                        {video.content_classification && (
                            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase bg-primary/20 text-primary border border-primary/30 rounded-full">
                                {video.content_classification}
                            </span>
                        )}
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-800 leading-tight text-white max-w-3xl">
                            {video.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                            {score && (
                                <span className="text-primary font-semibold">{score} Match</span>
                            )}
                            {year && <span>{year}</span>}
                            {duration && <span>{duration}</span>}
                            {video.age_rating && (
                                <span className="px-1.5 py-0.5 border border-white/40 rounded text-xs">
                                    {video.age_rating}
                                </span>
                            )}
                            {video.category && (
                                <span className="text-white/60">{video.category}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {playbackSrc ? (
                                <Button
                                    onClick={handlePlay}
                                    disabled={accessLoading}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-3 h-auto text-base gap-2"
                                >
                                    {accessLoading ? (
                                        <><Loader2 size={18} className="animate-spin" /> Checking…</>
                                    ) : hasAccess || video?.access_type === "free" ? (
                                        <><Play size={18} fill="currentColor" /> Play</>
                                    ) : video?.access_type === "subscription" ? (
                                        <><Lock size={18} /> Subscribe to Watch</>
                                    ) : video?.access_type === "rental" ? (
                                        <><Play size={18} fill="currentColor" /> Rent to Watch</>
                                    ) : video?.access_type === "pay_per_view" ? (
                                        <><Play size={18} fill="currentColor" /> Buy to Watch</>
                                    ) : (
                                        <><Play size={18} fill="currentColor" /> Play</>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    disabled
                                    className="bg-primary/50 text-primary-foreground font-semibold px-6 py-3 h-auto text-base gap-2 cursor-not-allowed"
                                >
                                    <Play size={18} fill="currentColor" /> Not Available
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => watchlistMutation.mutate()}
                                disabled={watchlistMutation.isPending || authLoading}
                                className="bg-transparent border-white/40 text-white hover:bg-white/10 font-medium px-5 py-3 h-auto text-base gap-2"
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
                        </div>
                    </div>
                </div>
            )}

            {/* ── Details ──────────────────────────────────────────────────── */}
            <div className="px-6 lg:px-12 py-10 space-y-10">

                {/* Stats strip */}
                <div className="flex flex-wrap gap-4 pb-8 border-b border-border/40">
                    {video.rating !== null && (
                        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[100px]">
                            <Star size={22} className="text-primary" fill="currentColor" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Score</p>
                                <p className="text-lg font-bold text-foreground leading-tight">{video.rating.toFixed(1)}<span className="text-xs text-muted-foreground font-normal">/10</span></p>
                            </div>
                        </div>
                    )}
                    {duration && (
                        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[100px]">
                            <Clock size={22} className="text-primary" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Runtime</p>
                                <p className="text-lg font-bold text-foreground leading-tight">{duration}</p>
                            </div>
                        </div>
                    )}
                    {year && (
                        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[100px]">
                            <Calendar size={22} className="text-primary" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Year</p>
                                <p className="text-lg font-bold text-foreground leading-tight">{year}</p>
                            </div>
                        </div>
                    )}
                    {video.age_rating && (
                        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[100px]">
                            <Film size={22} className="text-primary" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Rated</p>
                                <p className="text-lg font-bold text-foreground leading-tight">{video.age_rating}</p>
                            </div>
                        </div>
                    )}
                    {video.language.length > 0 && (
                        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[120px]">
                            <Globe size={22} className="text-primary" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider">Language</p>
                                <p className="text-base font-semibold text-foreground leading-tight">{video.language.join(", ")}</p>
                            </div>
                        </div>
                    )}
                    {/* Access badge */}
                    <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-secondary/60 border border-border/40 min-w-[100px]">
                        <div className="w-2.5 h-2.5 rounded-full mt-0.5 flex-shrink-0"
                            style={{ backgroundColor: video.access_type === "free" ? "hsl(152 60% 45%)" : video.access_type === "subscription" ? "hsl(var(--primary))" : "hsl(45 100% 55%)" }}
                        />
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Access</p>
                            <p className="text-base font-semibold text-foreground leading-tight capitalize">
                                {video.access_type === "pay_per_view"
                                    ? `PPV${video.ppv_price ? ` · $${video.ppv_price}` : ""}`
                                    : video.access_type}
                            </p>
                        </div>
                    </div>
                </div>

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
            <RelatedMovies ids={video.related_video_ids} />


        </>
    );
}
