"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCategories, getCategoryImageUrl, type Category } from "@/lib/services";

const GRADIENTS = [
    "from-red-800/80 to-orange-900/80",
    "from-blue-800/80 to-indigo-900/80",
    "from-emerald-800/80 to-teal-900/80",
    "from-purple-800/80 to-violet-900/80",
    "from-amber-700/80 to-orange-800/80",
    "from-cyan-800/80 to-sky-900/80",
    "from-rose-800/80 to-pink-900/80",
    "from-lime-800/80 to-green-900/80",
];
function fallbackGradient(name: string) { return GRADIENTS[name.charCodeAt(0) % GRADIENTS.length]; }

export default function CategoryGrid({ type, showName = true }: { type: string; showName?: boolean }) {
    const [categories, setCategories] = useState<Category[]>([]);

    useEffect(() => {
        fetchCategories().then(setCategories).catch(() => { });
    }, []);

    if (!categories.length) return null;

    return (
        <section className="px-6 lg:px-14 space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <span className="w-1 h-5 rounded-full bg-primary" />
                <h3 className="text-[15px] font-bold text-foreground">Browse by Genre</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {categories.map((cat) => {
                    const imgUrl = getCategoryImageUrl(cat);
                    return (
                        <Link
                            key={cat.id}
                            href={`/categories/${cat.slug}`}
                            className="relative overflow-hidden rounded-xl border border-border/40 hover:border-primary/50 transition-all hover:scale-105 cursor-pointer aspect-[3/2] group block"
                        >
                            {imgUrl ? (
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                                    style={{ backgroundImage: `url(${imgUrl})` }}
                                />
                            ) : (
                                <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient(cat.name)}`} />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            {showName && (
                                <span className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 text-[12px] font-bold text-white text-left">
                                    {cat.name}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
