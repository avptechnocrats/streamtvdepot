/**
 * ember/CategoryGrid.tsx
 *
 * "Browse by Category" rail of wide rounded tiles with the category name
 * underneath, matching the channel/radio style rails of the design.
 */
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchCategories, getCategoryImageUrl, type Category } from "@/lib/services/categories";
import type { CategoryGridProps } from "@/types/category";

const GRADIENTS = [
    "from-rose-700 to-orange-800",
    "from-indigo-700 to-blue-900",
    "from-emerald-700 to-teal-900",
    "from-purple-700 to-violet-900",
    "from-amber-600 to-orange-800",
    "from-cyan-700 to-sky-900",
];

export default function CategoryGrid({ type, showName = true }: CategoryGridProps) {
    const [categories, setCategories] = useState<Category[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchCategories(type)
            .then(setCategories)
            .catch(() => { });
    }, [type]);

    if (!categories.length) return null;

    const scroll = (dir: "left" | "right") =>
        scrollRef.current?.scrollBy({ left: dir === "left" ? -480 : 480, behavior: "smooth" });

    return (
        <section className="px-4 sm:px-6 lg:px-10 space-y-3">
            <h3 className="text-lg md:text-xl font-display font-700 text-foreground">Browse by Category</h3>
            <div className="relative group">
                <button
                    onClick={() => scroll("left")}
                    className="absolute -left-3 top-[35%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={18} />
                </button>
                <div ref={scrollRef} className="pointer-events-none flex gap-5 sm:gap-6 overflow-x-auto scrollbar-hide pt-8 pb-12 px-8 -mx-8" style={{ marginTop: -28, marginBottom: -44 }}>
                    {categories.map((cat) => {
                        const img = getCategoryImageUrl(cat);
                        return (
                            <Link
                                key={cat.id}
                                href={`/categories/${cat.slug}`}
                                className="group/tile pointer-events-auto shrink-0 w-44 sm:w-48 lg:w-52 space-y-1.5"
                            >
                                <div className="relative aspect-[4/3] overflow-hidden rounded-lg group-hover/tile:ring-1 group-hover/tile:ring-primary/20 group-hover/tile:shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_30px_hsl(var(--primary)/0.3)] group-focus-visible/tile:ring-1 group-focus-visible/tile:ring-primary/20 group-focus-visible/tile:shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_30px_hsl(var(--primary)/0.3)] transition-shadow">
                                    {img ? (
                                        <div
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover/tile:scale-110"
                                            style={{ backgroundImage: `url(${img})` }}
                                        />
                                    ) : (
                                        <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[cat.name.charCodeAt(0) % GRADIENTS.length]}`} />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                </div>
                                {showName && (
                                    <p className="text-xs font-medium text-muted-foreground group-hover/tile:text-foreground truncate transition-colors">
                                        {cat.name}
                                    </p>
                                )}
                            </Link>
                        );
                    })}
                </div>
                <button
                    onClick={() => scroll("right")}
                    className="absolute -right-3 top-[35%] -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-background/90 border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </section>
    );
}
