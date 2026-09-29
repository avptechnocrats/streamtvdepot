"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { fetchCategoryBySlug, getCategoryImageUrl, type Category, type CategoryItem } from "@/lib/services";
import { useTheme } from "@/hooks/use-theme";
import { Skeleton } from "@/components/ui/skeleton";
import { Film } from "lucide-react";

function HeroSkeleton() {
    return (
        <div className="relative w-full h-56 md:h-72 overflow-hidden">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute bottom-0 left-0 px-6 md:px-12 pb-6 space-y-2">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-9 w-56 rounded" />
                <Skeleton className="h-3.5 w-72 rounded" />
            </div>
        </div>
    );
}

function CardGridSkeleton({ count = 12 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="w-full aspect-[2/3] rounded-lg" />
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                </div>
            ))}
        </div>
    );
}

function getImage(item: CategoryItem): string {
    return (
        item.thumbnails.video_h_thumbnail ||
        item.thumbnails.video_w_thumbnail ||
        item.thumbnails.video_banner ||
        "/images/hero-banner.jpg"
    );
}

function getYear(item: CategoryItem): string {
    const raw = item.publish_at || item.created_at;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "" : d.getFullYear().toString();
}

export default function CategoryDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const { activeTheme } = useTheme();
    const { CategoryGrid } = activeTheme.components;

    const [category, setCategory] = useState<Category | null>(null);
    const [items, setItems] = useState<CategoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);

    // Reset when navigating between categories
    useEffect(() => {
        setPage(1);
        setItems([]);
        setCategory(null);
        setHasMore(true);
    }, [slug]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const data = await fetchCategoryBySlug(slug, page);
                if (!cancelled) {
                    if (page === 1) setCategory(data.category);
                    setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
                    setHasMore(data.has_more);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [slug, page]);

    // Infinite scroll sentinel
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!hasMore || loading) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) setPage((p) => p + 1); },
            { threshold: 1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading]);

    const bannerUrl = category ? getCategoryImageUrl(category) : null;

    return (
        <div className="min-h-screen">
            {/* Hero */}
            {!category && loading ? <HeroSkeleton /> : (
                <div className="relative w-full h-56 md:h-72 overflow-hidden">
                    {bannerUrl ? (
                        <div
                            className="absolute inset-0 bg-cover bg-center scale-105"
                            style={{ backgroundImage: `url(${bannerUrl})` }}
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-secondary" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

                    {/* Category name */}
                    <div className="absolute bottom-0 left-0 px-6 md:px-12 pb-6">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/50 mb-1">Category</p>
                        <h1 className="text-3xl md:text-4xl font-black text-white">
                            {category?.name ?? slug}
                        </h1>
                        {category?.description && (
                            <p className="text-sm text-white/60 mt-1 max-w-xl line-clamp-2">
                                {category.description}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Content grid */}
            <div className="px-6 md:px-12 py-8">
                {items.length === 0 && loading ? (
                    <CardGridSkeleton count={12} />
                ) : (
                    <>
                        {items.length === 0 && !loading && (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <Film size={28} className="text-muted-foreground/50" />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-1">No content yet</h3>
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    There are no videos in this category at the moment. Check back soon.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {items.map((item) => (
                                <Link
                                    key={item.id}
                                    href={`/movies/${item.id}`}
                                    className="group cursor-pointer"
                                >
                                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-secondary">
                                        <div
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                                            style={{ backgroundImage: `url(${getImage(item)})` }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {item.rating !== null && (
                                            <span className="absolute top-2 right-2 bg-black/70 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                ★ {item.rating.toFixed(1)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 px-0.5">
                                        <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{getYear(item)}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>

                        {/* Sentinel */}
                        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
                        {loading && (
                            <div className="mt-6">
                                <CardGridSkeleton count={6} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Browse other categories */}
            <div className="border-t border-border/40 py-8 space-y-4">
                <p className="px-6 md:px-12 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
                    Browse other categories
                </p>
                <CategoryGrid type="video" showName={false} />
            </div>
        </div>
    );
}
