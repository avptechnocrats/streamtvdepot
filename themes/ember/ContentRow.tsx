/**
 * ember/ContentRow.tsx
 *
 * Compact poster rail with a "View All" link. Hovering a poster lifts it,
 * outlines it in the accent colour and reveals quick actions
 * (play, add to My List, details).
 */
"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Check, Play, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { addToWatchlist, getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
import type { ContentRowProps, Movie } from "@/types/content";

function PosterCard({ movie }: { movie: Movie }) {
    const router = useRouter();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const href = movie.id ? `/movies/${movie.id}` : "#";

    const { data: watchlist = [] } = useQuery({
        queryKey: ["watchlist"],
        queryFn: getWatchlist,
        enabled: !!user,
        staleTime: 60_000,
    });
    const inList = !!movie.id && watchlist.some((i) => i.video_id === movie.id);

    const toggleList = useMutation<void | WatchlistItem>({
        mutationFn: () => (inList ? removeFromWatchlist(movie.id!) : addToWatchlist(movie.id!)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({ title: inList ? "Removed from My List" : "Added to My List" });
        },
        onError: () => toast({ title: "Couldn't update your list", variant: "destructive" }),
    });

    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!movie.id) return;
        if (!user) {
            router.push("/login");
            return;
        }
        toggleList.mutate();
    }

    return (
        <Link
            href={href}
            className="group/card relative shrink-0 w-40 sm:w-44 lg:w-48 rounded-lg hover:z-30 focus-visible:z-30 focus-visible:outline-none"
        >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary">
                <Image
                    src={movie.image}
                    alt={movie.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 192px, (min-width: 640px) 176px, 160px"
                />
            </div>
            <div className="mt-1.5 px-0.5">
                <p className="text-xs font-medium text-foreground truncate">{movie.title}</p>
                {movie.year && <p className="text-[11px] text-muted-foreground">{movie.year}</p>}
            </div>

            {/* Expanded preview: ~1.5x wider than the poster, covering it and its neighbours */}
            <div className="pointer-events-none absolute -inset-x-[25%] -top-[6%] origin-center scale-90 transform-gpu opacity-0 transition-[opacity,transform] delay-100 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/card:pointer-events-auto group-hover/card:scale-100 group-hover/card:opacity-100 group-focus-visible/card:pointer-events-auto group-focus-visible/card:scale-100 group-focus-visible/card:opacity-100">
                <div className="overflow-hidden rounded bg-card ring-1 ring-primary/55 shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_30px_hsl(var(--primary)/0.3)]">
                    <div className="relative aspect-[4/3] bg-secondary">
                        <Image
                            src={movie.image}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="(min-width: 1024px) 288px, (min-width: 640px) 264px, 240px"
                        />
                    </div>
                    <div className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span
                                role="link"
                                tabIndex={-1}
                                aria-label={`Play ${movie.title}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (movie.id) router.push(`/movies/${movie.id}?play=true`);
                                }}
                                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:brightness-110"
                            >
                                <Play size={14} fill="currentColor" className="ml-0.5" />
                            </span>
                            <button
                                onClick={handleToggle}
                                disabled={toggleList.isPending}
                                aria-label={inList ? "Remove from My List" : "Add to My List"}
                                className="w-8 h-8 rounded-full border border-foreground/40 text-foreground flex items-center justify-center hover:border-foreground transition-colors"
                            >
                                {inList ? <Check size={14} /> : <Plus size={14} />}
                            </button>
                            <span className="ml-auto w-8 h-8 rounded-full border border-foreground/40 text-foreground flex items-center justify-center">
                                <ChevronDown size={14} />
                            </span>
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate">{movie.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                            {movie.year && <span>{movie.year}</span>}
                            {movie.rating && <span className="text-primary">{movie.rating}</span>}
                        </p>
                    </div>
                </div>
            </div>
        </Link>
    );
}

export default function ContentRow({ title, movies, href }: ContentRowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: "left" | "right") =>
        scrollRef.current?.scrollBy({ left: dir === "left" ? -480 : 480, behavior: "smooth" });

    return (
        <section className="px-4 sm:px-6 lg:px-10 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-display font-700 text-foreground">{title}</h3>
                {href && (
                    <Link href={href} className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                        View All <ChevronRight size={12} className="inline -mt-0.5" />
                    </Link>
                )}
            </div>
            <div className="relative group">
                <button
                    onClick={() => scroll("left")}
                    className="absolute -left-3 top-[40%] -translate-y-1/2 z-40 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={18} />
                </button>
                <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pt-8 pb-14 px-10 -mt-7 -mb-12 -mx-10">
                    {movies.map((movie, i) => (
                        <PosterCard key={movie.id || `${movie.title}-${i}`} movie={movie} />
                    ))}
                </div>
                <button
                    onClick={() => scroll("right")}
                    className="absolute -right-3 top-[40%] -translate-y-1/2 z-40 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </section>
    );
}
