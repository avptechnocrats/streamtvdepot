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
import { useState, type SyntheticEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { addToWatchlist, getWatchlist, removeFromWatchlist, type WatchlistItem } from "@/lib/services/watchlist";
import type { ContentRowProps, Movie } from "@/types/content";
import { useRowScroll } from "@/hooks/use-row-scroll";

export function PosterCard({ movie, rank }: { movie: Movie; rank?: number }) {
    const router = useRouter();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const href = movie.id ? `/movies/${movie.id}` : "#";
    const [edge, setEdge] = useState<"left" | "center" | "right">("center");
    const [edgeOffset, setEdgeOffset] = useState(0);
    const [layer, setLayer] = useState<number>();
    const [expanded, setExpanded] = useState(false);
    const [posterCenter, setPosterCenter] = useState<number>();
    const [reducedMotion, setReducedMotion] = useState(false);

    function preparePreview(event: SyntheticEvent<HTMLAnchorElement>) {
        const card = event.currentTarget;
        const rail = card.parentElement;
        if (!rail) return;
        const bounds = rail.getBoundingClientRect();
        const padding = getComputedStyle(rail);
        const left = Math.max(0, bounds.left + parseFloat(padding.paddingLeft));
        const right = Math.min(window.innerWidth, bounds.right - parseFloat(padding.paddingRight));
        const visible = Array.from(rail.children).filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > left + 1 && rect.left < right - 1;
        });
        const nextEdge = card === visible[0] ? "left" : card === visible[visible.length - 1] ? "right" : "center";
        const posterBounds = card.firstElementChild!.getBoundingClientRect();
        setPosterCenter(posterBounds.height / 2);
        setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        setEdge(nextEdge);
        setEdgeOffset(nextEdge === "left" ? Math.max(0, left - posterBounds.left) : nextEdge === "right" ? Math.max(0, posterBounds.right - right) : 0);
        setLayer(30);
        setExpanded(true);
    }

    function releasePreview(event: SyntheticEvent<HTMLAnchorElement>) {
        if (event.currentTarget.matches(":hover, :focus-visible")) return;
        setExpanded(false);
        setLayer(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : 20);
    }

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
            aria-label={rank ? `${rank}. ${movie.title}` : undefined}
            onPointerEnter={preparePreview}
            onPointerLeave={releasePreview}
            onFocus={preparePreview}
            onBlur={releasePreview}
            style={{ zIndex: layer, containerType: rank ? "inline-size" : undefined, marginLeft: rank === 1 ? "calc(var(--rank-gutter) * -0.64)" : undefined }}
            className={`group/card pointer-events-auto relative shrink-0 ${rank ? "w-56 sm:w-60 lg:w-64 [--rank-gutter:96px] sm:[--rank-gutter:104px] lg:[--rank-gutter:112px]" : "w-44 sm:w-48 lg:w-52"} rounded-lg hover:z-30 focus-visible:z-30 focus-visible:outline-none`}
        >
            <div className="aspect-[2/3]" style={{ marginLeft: rank ? "var(--rank-gutter)" : undefined }} aria-hidden="true" />
            <div className="mt-1.5 px-0.5" style={{ marginLeft: rank ? "var(--rank-gutter)" : undefined, opacity: expanded ? 0 : 1, transition: reducedMotion ? "none" : "opacity 120ms linear" }}>
                <p className="text-xs font-medium text-foreground truncate">{movie.title}</p>
                {movie.year && <p className="text-[11px] text-muted-foreground">{movie.year}</p>}
            </div>
            {rank && <span aria-hidden="true" data-content-rank={rank} className="pointer-events-none absolute top-0 flex items-center justify-end font-display font-800 leading-none text-transparent" style={{ left: rank === 1 ? -20 : -12, width: "calc(var(--rank-gutter) + (100cqw - var(--rank-gutter)) * 0.35)", height: "calc((100cqw - var(--rank-gutter)) * 1.5)", fontSize: "calc((100cqw - var(--rank-gutter)) * 1.425)", transform: rank === 10 ? "scaleX(0.85)" : undefined, transformOrigin: "right center", WebkitTextStroke: "2px hsl(var(--foreground) / 0.4)" }}>{rank}</span>}

            <div
                data-preview-edge={edge}
                style={{ left: rank ? "var(--rank-gutter)" : 0, transformOrigin: `${edge} ${posterCenter ?? 0}px`, transform: `translate3d(${expanded ? (edge === "right" ? -edgeOffset : edgeOffset) : 0}px, 0, 0) scale(${expanded ? 1.2 : 1})`, transition: reducedMotion ? "none" : "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)" }}
                onTransitionEnd={event => {
                    if (event.target === event.currentTarget && event.propertyName === "transform" && !event.currentTarget.parentElement?.matches(":hover, :focus-visible")) setLayer(undefined);
                }}
                className="absolute inset-x-0 top-0"
            >
                <div className={`overflow-hidden rounded-lg bg-card ${expanded || layer === 20 ? "ring-1 ring-primary/20 shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_30px_hsl(var(--primary)/0.3)]" : ""}`}>
                    <div className="relative bg-secondary" style={{ aspectRatio: "2 / 3" }}>
                        <Image
                            src={movie.image}
                            alt={movie.title}
                            fill
                            className="object-cover"
                            sizes={rank ? "(min-width: 1024px) 173px, (min-width: 640px) 164px, 154px" : "(min-width: 1024px) 250px, (min-width: 640px) 231px, 212px"}
                        />
                    </div>
                    <div className="grid" style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0, transition: reducedMotion ? "none" : "grid-template-rows 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease" }}>
                    <div className="min-h-0 overflow-hidden">
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
                </div>
            </div>
        </Link>
    );
}

export default function ContentRow({ title, movies, href }: ContentRowProps) {
    const { scrollRef, canScrollLeft, canScrollRight } = useRowScroll(movies.length);

    const scroll = (dir: "left" | "right") =>
        scrollRef.current?.scrollBy({ left: dir === "left" ? -480 : 480, behavior: "smooth" });

    return (
        <section className="storefront-row space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-display font-700 text-foreground">{title}</h3>
                {href && (
                    <Link href={href} className="text-xs font-bold text-foreground hover:text-primary transition-colors">
                        View All <ChevronRight size={12} className="inline -mt-0.5" />
                    </Link>
                )}
            </div>
            <div className="relative group [--row-artwork-height:16.5rem] sm:[--row-artwork-height:18rem] lg:[--row-artwork-height:19.5rem]">
                <button
                    onClick={() => scroll("left")}
                    disabled={!canScrollLeft}
                    className="storefront-row-arrow -left-3"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={18} />
                </button>
                <div ref={scrollRef} className="pointer-events-none flex gap-5 sm:gap-6 overflow-x-auto scrollbar-hide pt-32 pb-64 px-10 -mx-10" style={{ marginTop: -124, marginBottom: -248 }}>
                    {movies.map((movie, i) => (
                        <PosterCard key={movie.id || `${movie.title}-${i}`} movie={movie} />
                    ))}
                </div>
                <button
                    onClick={() => scroll("right")}
                    disabled={!canScrollRight}
                    className="storefront-row-arrow -right-3"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </section>
    );
}
