"use client";

import { useRef, useEffect, useState } from "react";
import { Check, X, Monitor } from "lucide-react";
import type { ThemeDefinition } from "@/themes/types";

// ─── Preview data (passed to ContentRow) ────────────────────────────────────
export const PREVIEW_MOVIES = [
    { title: "Dune: Part Two", image: "/images/movie-1.jpg", year: "2024", rating: "8.5" },
    { title: "Oppenheimer", image: "/images/movie-2.jpg", year: "2023", rating: "8.9" },
    { title: "The Batman", image: "/images/movie-3.jpg", year: "2022", rating: "7.8" },
    { title: "Interstellar", image: "/images/movie-4.jpg", year: "2014", rating: "8.6" },
    { title: "Blade Runner 2049", image: "/images/movie-5.jpg", year: "2017", rating: "8.0" },
    { title: "Mad Max: Fury Road", image: "/images/movie-6.jpg", year: "2015", rating: "8.1" },
];

/** Simulated desktop viewport width the theme renders at before scaling */
const INNER_W = 1440;

// ─── Theme Preview Modal ──────────────────────────────────────────────────────
export function ThemePreviewModal({
    theme,
    isActive,
    onClose,
    onActivate,
}: {
    theme: ThemeDefinition;
    isActive: boolean;
    onClose: () => void;
    onActivate: () => void;
}) {
    // Measure the container so we can compute how much to shrink the 1440px layout
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.5);

    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                setScale(containerRef.current.offsetWidth / INNER_W);
            }
        };
        update();
        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const { Navbar, Banner, ContentRow, CategoryGrid, Footer } = theme.components;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-4xl flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal header bar */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <Monitor size={15} className="text-white/50" />
                        <span className="text-sm font-semibold text-white">{theme.name}</span>
                        <span className="text-xs text-white/40 hidden sm:block">— {theme.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isActive && (
                            <button
                                onClick={onActivate}
                                className="px-4 py-1.5 text-xs font-bold rounded-lg transition-opacity hover:opacity-90"
                                style={{ background: theme.previewAccent, color: theme.previewBg }}
                            >
                                Activate Theme
                            </button>
                        )}
                        {isActive && (
                            <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 text-white/60">
                                <Check size={11} strokeWidth={3} /> Active
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Browser chrome wrapper */}
                <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">

                    {/* Browser top bar */}
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-[hsl(220_15%_12%)]">
                        <span className="w-3 h-3 rounded-full bg-red-400/80" />
                        <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                        <span className="w-3 h-3 rounded-full bg-green-400/80" />
                        <div className="flex-1 mx-2 h-5 rounded bg-[hsl(220_15%_20%)] flex items-center px-2.5 gap-1.5">
                            <span className="w-2 h-2 rounded-full opacity-30" style={{ background: theme.previewAccent }} />
                            <span className="text-[9px] text-white/25 font-mono">streamtvdepot.app</span>
                        </div>
                    </div>

                    {/*
                     * CSS zoom scales the entire layout (unlike transform:scale which
                     * only changes visuals). The outer div becomes natively scrollable
                     * because the zoomed layout height is correctly reported to the browser.
                     * overflow-x:hidden clips the 1440px content to the modal width.
                     * pointerEvents:none keeps the preview non-interactive.
                     */}
                    <div
                        ref={containerRef}
                        className="w-full overflow-x-hidden overflow-y-auto"
                        style={{ maxHeight: "65vh" }}
                    >
                        <div
                            data-theme={theme.dataTheme}
                            style={{
                                width: INNER_W,
                                zoom: scale,
                                pointerEvents: "none",
                            }}
                        >
                            <Navbar />
                            <Banner />
                            <ContentRow title="Trending Now" movies={PREVIEW_MOVIES} />
                            <CategoryGrid />
                            <ContentRow title="New Releases" movies={PREVIEW_MOVIES} />
                            <ContentRow title="Top Picks for You" movies={PREVIEW_MOVIES} />
                            <Footer />
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-white/25">Click outside to close</p>
            </div>
        </div>
    );
}
