"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2, Play, Loader2, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";
import { getVideo } from "@/lib/services";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function formatDuration(seconds: number | null): string {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function FavoritesClient() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, user, router]);

    const { data: watchlist, isLoading } = useQuery({
        queryKey: ["watchlist"],
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
        })),
    });

    const removeMutation = useMutation({
        mutationFn: (videoId: string) => {
            setRemovingId(videoId);
            return removeFromWatchlist(videoId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            setRemovingId(null);
        },
        onError: () => setRemovingId(null),
    });

    function getThumbnail(videoId: string): string | null {
        const idx = (watchlist ?? []).findIndex((i) => i.video_id === videoId);
        const vq = idx >= 0 ? videoQueries[idx] : undefined;
        const v = vq?.data;
        return (
            v?.thumbnails.video_h_thumbnail ||
            v?.thumbnails.video_w_thumbnail ||
            v?.thumbnails.video_banner ||
            null
        );
    }

    if (!authLoading && !user) return null;

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-black text-foreground tracking-tight">My List</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Movies and shows you saved</p>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                            <Skeleton className="aspect-[2/3] rounded-lg" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                    ))}
                </div>
            ) : !watchlist || watchlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Heart size={28} className="text-primary" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-foreground">Your list is empty</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Browse movies and hit <strong>My List</strong> to save them here.
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="outline" size="sm">Browse Content</Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {watchlist.map((item) => (
                        <div key={item.id} className="group relative">
                            <Link href={`/movies/${item.video_id}`}>
                                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary">
                                    {getThumbnail(item.video_id) ? (
                                        <img
                                            src={getThumbnail(item.video_id)!}
                                            alt={item.title ?? ""}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                            width={200}
                                            height={300}
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
                                onClick={() => removeMutation.mutate(item.video_id)}
                                disabled={removingId === item.video_id}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 border border-border/60 flex items-center justify-center text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background disabled:opacity-50"
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
                </div>
            )}
        </div>
    );
}
