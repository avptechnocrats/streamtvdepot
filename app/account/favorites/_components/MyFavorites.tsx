"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2, Play, Loader2, Clock, Film, Tv, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";
import { getVideo } from "@/lib/services";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useRowScroll } from "@/hooks/use-row-scroll";
import { toast } from "@/hooks/use-toast";

function formatDuration(seconds: number | null): string {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function FavoritesRow({ title, channelRow, count, children }: { title: string; channelRow: boolean; count: number; children: ReactNode }) {
    const { scrollRef, canScrollLeft, canScrollRight } = useRowScroll(count);
    return (
        <section aria-label={title} className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                    {channelRow ? <Tv size={16} /> : <Film size={16} />}
                    {title}<span className="text-sm font-normal text-muted-foreground">({count})</span>
                </h2>
                {count > 0 && <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Previous ${title}`} title={`Previous ${title}`} disabled={!canScrollLeft} onClick={() => scrollRef.current?.scrollBy({ left: -480, behavior: "smooth" })}><ChevronLeft size={18} /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Next ${title}`} title={`Next ${title}`} disabled={!canScrollRight} onClick={() => scrollRef.current?.scrollBy({ left: 480, behavior: "smooth" })}><ChevronRight size={18} /></Button>
                </div>}
            </div>
            <div ref={scrollRef} className="flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-3 pt-1 scrollbar-hide">
                {count ? children : <p className="py-4 text-sm text-muted-foreground">No saved {title.toLowerCase()} yet.</p>}
            </div>
        </section>
    );
}

export default function FavoritesClient() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, user, router]);

    const { data: watchlist, isLoading, isError, refetch } = useQuery({
        queryKey: ["watchlist", user?.id],
        queryFn: getWatchlist,
        enabled: !!user,
    });

    // Fetch video details to get thumbnails (API doesn't populate thumbnail_url)
    const videoQueries = useQueries({
        queries: (watchlist ?? []).map((item) => ({
            queryKey: ["video", item.video_id],
            queryFn: () => getVideo(item.video_id),
            staleTime: 5 * 60 * 1000,
            retry: 1,
            enabled: !!user && item.content_type !== "live_stream" && item.content_type !== "series",
        })),
    });

    const removeMutation = useMutation({
        mutationFn: (videoId: string) => {
            setRemovingId(videoId);
            return removeFromWatchlist(videoId);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            setRemovingId(null);
        },
        onError: () => {
            setRemovingId(null);
            toast({ title: "Unable to remove from My List", description: "Please try again.", variant: "destructive" });
        },
    });

    function getThumbnail(videoId: string): string | null {
        const idx = (watchlist ?? []).findIndex((i) => i.video_id === videoId);
        const vq = idx >= 0 ? videoQueries[idx] : undefined;
        const v = vq?.data;
        return (
            watchlist?.[idx]?.thumbnail_url ||
            v?.thumbnails.video_h_thumbnail ||
            v?.thumbnails.video_w_thumbnail ||
            v?.thumbnails.video_banner ||
            null
        );
    }

    if (!authLoading && !user) return null;

    const groups = [
        { title: "Movies", channelRow: false, items: (watchlist ?? []).filter(item => item.content_type !== "live_stream" && item.content_type !== "series") },
        { title: "Series", channelRow: false, items: (watchlist ?? []).filter(item => item.content_type === "series") },
        { title: "TV Channels", channelRow: true, items: (watchlist ?? []).filter(item => item.content_type === "live_stream") },
    ];

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-black text-foreground tracking-tight">My List</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Movies, shows and channels you saved</p>
            </div>

            {authLoading || isLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                            <Skeleton className="aspect-[2/3] rounded-lg" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    ))}
                </div>
            ) : isError ? (
                <div role="alert" className="space-y-3 py-8">
                    <p className="text-sm text-destructive">Unable to load My List.</p>
                    <Button type="button" variant="outline" onClick={() => { void refetch(); }}>Retry</Button>
                </div>
            ) : !watchlist || watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Heart size={28} className="text-primary" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-foreground">Your list is empty</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Save movies, series and favourite TV channels to add them here.
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="outline" size="sm">Browse Content</Button>
                    </Link>
                </div>
            ) : (
                <div className="min-w-0 space-y-8">
                    {groups.map(group => <FavoritesRow key={group.title} title={group.title} channelRow={group.channelRow} count={group.items.length}>
                    {group.items.map((item) => (
                        <div key={item.id} className={`group relative shrink-0 ${group.channelRow ? "w-52 sm:w-60" : "w-32 sm:w-36 lg:w-40"}`}>
                            <Link href={item.content_type === "live_stream" ? `/tv-shows/${item.video_id}` : item.content_type === "series" ? `/series/${item.video_id}` : `/movies/${item.video_id}`}>
                                <div className={`relative ${group.channelRow ? "aspect-video" : "aspect-[2/3]"} rounded-lg overflow-hidden bg-secondary`}>
                                    {getThumbnail(item.video_id) ? (
                                        <img
                                            src={getThumbnail(item.video_id)!}
                                            alt={item.title ?? ""}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                            width={200}
                                            height={group.channelRow ? 113 : 300}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Play size={20} className="text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                        <div className="w-8 h-8 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                                            <Play size={14} className="text-primary-foreground ml-0.5" fill="currentColor" />
                                        </div>
                                    </div>
                                </div>
                            </Link>

                            <button
                                type="button"
                                onClick={() => removeMutation.mutate(item.video_id)}
                                disabled={removeMutation.isPending}
                                aria-label={`Remove ${item.title ?? "item"} from My List`}
                                className="absolute top-1 right-1 w-8 h-8 rounded-full bg-background/80 border border-border/60 flex items-center justify-center text-destructive opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity hover:bg-background disabled:opacity-50"
                                title="Remove from My List"
                            >
                                {removingId === item.video_id ? (
                                    <Loader2 size={11} className="animate-spin" />
                                ) : (
                                    <Trash2 size={11} />
                                )}
                            </button>

                            <div className="mt-1.5 px-0.5">
                                <p className="text-xs font-medium text-foreground truncate leading-snug">
                                    {item.title ?? "Untitled"}
                                </p>
                                {item.duration && (
                                    <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
                                        <Clock size={9} />
                                        {formatDuration(item.duration)}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                    </FavoritesRow>)}
                </div>
            )}
        </div>
    );
}
