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
import { fetchCategories } from "@/lib/services/categories";
import { BannerTrailer, useBannerAutoplay } from "@/components/BannerTrailer";
import { VideoHoverPreview, WIDER_LANDSCAPE_CARD_WIDTH } from "@/components/VideoHoverPreview";

export function PosterCard({ movie, rank, variant = "portrait" }: { movie: Movie; rank?: number; variant?: ContentRowProps["variant"] }) {
    const widerLandscape = variant === "wider-landscape" && !rank;
    const landscape = (variant === "landscape" || widerLandscape) && !rank;
    const featured = variant === "featured" && !rank;
    const durationMinutes = movie.duration && movie.duration > 0 ? Math.max(1, Math.floor(movie.duration / 60)) : 0;
    const runtime = durationMinutes >= 60
        ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ""}`
        : durationMinutes ? `${durationMinutes}m` : "";
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
    const { active: previewActive, bannerRef: previewRef } = useBannerAutoplay();

    function preparePreview(event: SyntheticEvent<HTMLElement>) {
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

    function releasePreview(event: SyntheticEvent<HTMLElement>) {
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
    const { data: categoryCatalog = [] } = useQuery({
        queryKey: ["poster-categories", "video"],
        queryFn: () => fetchCategories("video"),
        enabled: expanded && !!movie.categories?.length,
        staleTime: 5 * 60_000,
    });
    const categoryText = Array.from(new Set((movie.categories ?? []).map(category =>
        categoryCatalog.find(item => item.slug === category || item.name === category)?.name
        ?? category.replace(/[-_]+/g, " ")
    ))).join(" \u2022 ");

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

    if (featured) return (
        <div
            ref={previewRef}
            data-featured-card
            data-expanded={expanded}
            onPointerEnter={event => {
                if (event.pointerType === "mouse") preparePreview(event);
            }}
            onPointerLeave={releasePreview}
            onFocus={preparePreview}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) releasePreview(event);
            }}
            onTransitionEnd={event => {
                if (event.target !== event.currentTarget || event.propertyName !== "width" || !expanded) return;
                const rail = event.currentTarget.parentElement;
                if (!rail) return;
                const railBounds = rail.getBoundingClientRect();
                const padding = getComputedStyle(rail);
                const left = Math.max(0, railBounds.left + parseFloat(padding.paddingLeft));
                const right = Math.min(window.innerWidth, railBounds.right - parseFloat(padding.paddingRight));
                const bounds = event.currentTarget.getBoundingClientRect();
                const offset = bounds.left < left ? bounds.left - left : Math.max(0, bounds.right - right);
                if (offset) rail.scrollBy({ left: offset, behavior: "smooth" });
            }}
            style={{ transitionDuration: reducedMotion ? "0ms" : "900ms", transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
            className={`group/featured pointer-events-auto relative shrink-0 h-[16.5rem] sm:h-72 lg:h-[19.5rem] ${expanded ? "w-[min(29.333rem,calc(100vw-2rem))] sm:w-[min(32rem,calc(100vw-3rem))] lg:w-[34.6667rem]" : "w-44 sm:w-48 lg:w-52"} overflow-hidden rounded-lg bg-card transition-[width] motion-reduce:transition-none`}
        >
            <div className="absolute inset-0">
                <Image
                    src={expanded ? movie.previewImage || movie.image : movie.image}
                    alt={movie.title}
                    fill
                    className="object-cover"
                    sizes={expanded ? "(min-width: 1024px) 555px, (min-width: 640px) 512px, calc(100vw - 32px)" : "(min-width: 1024px) 208px, (min-width: 640px) 192px, 176px"}
                />
                <BannerTrailer
                    src={movie.trailerUrl ?? null}
                    hlsSrc={movie.trailerHlsUrl}
                    hovered={expanded && previewActive}
                    delayMs={1000}
                    showSoundControl
                    positionClassName="object-center"
                />
            </div>
            <Link href={href} aria-label={movie.title} className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary" />
            <div style={{ transitionDuration: reducedMotion ? "0ms" : "450ms" }} className={`pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.6)_38%,transparent_80%)] transition-opacity ${expanded ? "opacity-100" : "opacity-0"}`} />
            <div style={{ transitionDuration: reducedMotion ? "0ms" : "350ms" }} className={`pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-4 text-white transition-opacity motion-reduce:transition-none ${expanded ? "visible opacity-100 delay-200" : "invisible opacity-0"}`}>
                <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 truncate text-lg font-extrabold" title={movie.title}>{movie.title}</p>
                    {movie.rating && <span className="shrink-0 text-xs font-bold text-primary">{movie.rating}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`${href}?play=true`} aria-label={`Play ${movie.title}`} title={`Play ${movie.title}`} className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        <Play size={17} fill="currentColor" aria-hidden="true" />
                    </Link>
                    <Link href={href} className="pointer-events-auto inline-flex h-9 items-center rounded-md bg-white/20 px-3 text-xs font-bold backdrop-blur-sm hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">More Info</Link>
                    <button type="button" onClick={handleToggle} disabled={toggleList.isPending} aria-label={inList ? "Remove from My List" : "Add to My List"} title={inList ? "Remove from My List" : "Add to My List"} aria-pressed={inList} className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/60 bg-black/20 hover:bg-white/20 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        {inList ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                    </button>
                </div>
                {(movie.classification || movie.ageRating || runtime) && <p data-content-metadata className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-white">
                    {movie.classification && <span>{movie.classification}</span>}
                    {movie.ageRating && <span className="rounded-sm border border-white/50 px-1.5 py-0.5 leading-none">{movie.ageRating}</span>}
                    {runtime && <span className="whitespace-nowrap">{runtime}</span>}
                </p>}
                {categoryText && <p data-content-categories className="truncate text-xs font-bold text-white" title={categoryText}>{categoryText}</p>}
            </div>
        </div>
    );

    const previewActions = <div className="flex items-center gap-2">
        <span
            role="link"
            tabIndex={-1}
            aria-label={`Play ${movie.title}`}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (movie.id) router.push(`/movies/${movie.id}?play=true`);
            }}
            className="w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:brightness-110"
        >
            <Play size={12} fill="currentColor" className="ml-0.5" />
        </span>
        <button
            onClick={handleToggle}
            disabled={toggleList.isPending}
            aria-label={inList ? "Remove from My List" : "Add to My List"}
            className="w-7 h-7 shrink-0 rounded-full border border-foreground/40 text-foreground flex items-center justify-center hover:border-foreground transition-colors"
        >
            {inList ? <Check size={12} /> : <Plus size={12} />}
        </button>
        <span className="ml-auto w-7 h-7 shrink-0 rounded-full border border-foreground/40 text-foreground flex items-center justify-center">
            <ChevronDown size={12} />
        </span>
    </div>;

    return (
        <Link
            href={href}
            aria-label={rank ? `${rank}. ${movie.title}` : landscape ? movie.title : undefined}
            onPointerEnter={preparePreview}
            onPointerLeave={releasePreview}
            onFocus={preparePreview}
            onBlur={releasePreview}
            style={{ zIndex: layer, containerType: rank ? "inline-size" : undefined, width: rank ? "calc(var(--rank-gutter) + var(--rank-poster-width, 9rem))" : undefined, marginLeft: rank === 1 ? "calc(var(--rank-gutter) * -0.64)" : undefined }}
            className={`group/card pointer-events-auto relative shrink-0 ${rank ? "[--rank-gutter:96px] sm:[--rank-gutter:104px] lg:[--rank-gutter:112px]" : widerLandscape ? WIDER_LANDSCAPE_CARD_WIDTH : landscape ? "w-56 sm:w-60 lg:w-64" : "w-44 sm:w-48 lg:w-52"} rounded-lg hover:z-30 focus-visible:z-30 focus-visible:outline-none`}
        >
            <div className={landscape ? "aspect-video" : "aspect-[2/3]"} style={{ marginLeft: rank ? "var(--rank-gutter)" : undefined }} aria-hidden="true" />
            {!landscape && <div className="mt-1.5 px-0.5" style={{ marginLeft: rank ? "var(--rank-gutter)" : undefined, opacity: expanded ? 0 : 1, transition: reducedMotion ? "none" : "opacity 120ms linear" }}>
                <p className={`${rank ? "text-sm font-bold" : "text-xs font-medium"} text-foreground truncate`}>{movie.title}</p>
                {!rank && movie.year && <p className="text-[11px] text-muted-foreground">{movie.year}</p>}
            </div>}
            {rank && <span aria-hidden="true" data-content-rank={rank} className="pointer-events-none absolute top-0 flex items-center justify-end font-display font-800 leading-none text-transparent" style={{ left: rank === 1 ? -20 : -12, width: "calc(var(--rank-gutter) + (100cqw - var(--rank-gutter)) * 0.35)", height: "calc((100cqw - var(--rank-gutter)) * 1.5)", fontSize: "calc((100cqw - var(--rank-gutter)) * 1.425)", transform: rank === 10 ? "scaleX(0.85)" : undefined, transformOrigin: "right center", WebkitTextStroke: "2px hsl(var(--foreground) / 0.4)" }}>{rank}</span>}

            <div
                data-preview-edge={edge}
                style={{ left: rank ? "var(--rank-gutter)" : 0, transformOrigin: `${edge} ${posterCenter ?? 0}px`, transform: `translate3d(${expanded ? (edge === "right" ? -edgeOffset : edgeOffset) : 0}px, 0, 0) scale(${expanded ? widerLandscape ? 1.02 : 1.2 : 1})`, transition: reducedMotion ? "none" : `transform ${widerLandscape ? 360 : 500}ms ${widerLandscape ? "cubic-bezier(0.22, 1, 0.36, 1)" : "cubic-bezier(0.4, 0, 0.2, 1)"}` }}
                onTransitionEnd={event => {
                    if (event.target === event.currentTarget && event.propertyName === "transform" && !event.currentTarget.parentElement?.matches(":hover, :focus-visible")) setLayer(undefined);
                }}
                className="absolute inset-x-0 top-0"
            >
                <div className={`overflow-hidden rounded-lg bg-card ${expanded || layer === 20 ? "ring-1 ring-primary/20 shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_30px_hsl(var(--primary)/0.3)]" : ""}`}>
                    <div className="relative bg-secondary" style={{ aspectRatio: landscape ? "16 / 9" : "2 / 3" }}>
                        <Image
                            src={movie.image}
                            alt={movie.title}
                            fill
                            className="object-cover"
                            sizes={rank ? "(min-width: 1024px) 192px, (min-width: 640px) 183px, 173px" : landscape ? "(min-width: 1024px) 308px, (min-width: 640px) 288px, 269px" : "(min-width: 1024px) 250px, (min-width: 640px) 231px, 212px"}
                        />
                        {widerLandscape && <VideoHoverPreview src={movie.videoUrl} hlsSrc={movie.hlsUrl} />}
                        {rank && <div
                            data-top-ten-actions
                            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 pb-2 pt-8"
                            style={{ opacity: expanded ? 1 : 0, transform: expanded ? "translateY(0)" : "translateY(8px)", visibility: expanded ? "visible" : "hidden", pointerEvents: expanded ? "auto" : "none", transition: reducedMotion ? "none" : "opacity 250ms ease, transform 300ms ease" }}
                        >{previewActions}</div>}
                    </div>
                    <div className="grid" style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0, transition: reducedMotion ? "none" : "grid-template-rows 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease" }}>
                    <div className="min-h-0 overflow-hidden">
                    <div className="px-3 py-2 space-y-1.5">
                        {!rank && previewActions}
                        <div className="flex min-w-0 items-center gap-2">
                            <p className={`min-w-0 truncate text-sm ${rank ? "font-bold" : "font-semibold"} text-foreground`} title={movie.title}>{movie.title}</p>
                            {movie.rating && <span className="shrink-0 text-xs font-medium text-primary" style={{ fontSize: rank ? "11px" : undefined }}>{movie.rating}</span>}
                        </div>
                        {(movie.classification || movie.ageRating || runtime) && <p data-content-metadata className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" style={{ fontSize: rank ? "11px" : undefined }}>
                            {movie.classification && <span>{movie.classification}</span>}
                            {movie.ageRating && <span className="rounded-sm border border-foreground/40 px-1.5 py-0.5 leading-none text-foreground/80">{movie.ageRating}</span>}
                            {runtime && <span className="whitespace-nowrap">{runtime}</span>}
                        </p>}
                        {categoryText && <p data-content-categories className="truncate text-xs leading-5 text-foreground/90" style={{ fontSize: rank ? "11px" : undefined, lineHeight: rank ? "16px" : undefined }} title={categoryText}>{categoryText}</p>}
                    </div>
                    </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

export default function ContentRow({ title, movies, href, variant = "portrait" }: ContentRowProps) {
    const landscape = variant === "landscape";
    const { scrollRef, canScrollLeft, canScrollRight } = useRowScroll(movies.length);

    const scroll = (dir: "left" | "right") =>
        scrollRef.current?.scrollBy({ left: dir === "left" ? -480 : 480, behavior: "smooth" });

    return (
        <section className="storefront-row [container-type:inline-size] space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg md:text-xl font-display font-700 text-foreground">{title}</h3>
                {href && (
                    <Link href={href} className="text-xs font-bold text-foreground hover:text-primary transition-colors">
                        View All <ChevronRight size={12} className="inline -mt-0.5" />
                    </Link>
                )}
            </div>
            <div className={`relative group ${landscape ? "[--row-artwork-height:7.875rem] sm:[--row-artwork-height:8.4375rem] lg:[--row-artwork-height:9rem]" : "[--row-artwork-height:16.5rem] sm:[--row-artwork-height:18rem] lg:[--row-artwork-height:19.5rem]"}`}>
                <button
                    onClick={() => scroll("left")}
                    disabled={!canScrollLeft}
                    className="storefront-row-arrow -left-3"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={18} />
                </button>
                <div ref={scrollRef} className={`pointer-events-none flex ${landscape ? "gap-3" : "gap-5 sm:gap-6"} overflow-x-auto scrollbar-hide pt-32 pb-64 px-10 -mx-10`} style={{ marginTop: -124, marginBottom: -248 }}>
                    {movies.map((movie, i) => (
                        <PosterCard key={movie.id || `${movie.title}-${i}`} movie={movie} variant={variant} />
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
