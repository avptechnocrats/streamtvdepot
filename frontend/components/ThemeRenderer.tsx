"use client";

import { useTheme } from "@/hooks/use-theme";
import { trendingMovies, newReleases, topRated } from "@/data/movies";

export default function ThemeRenderer() {
    const { activeTheme } = useTheme();
    const {
        Banner,
        ContentRow,
        CategoryGrid,
    } = activeTheme.components;

    return (
        <>
            <Banner />
            <div className="space-y-10 py-10">
                <ContentRow title="🔥 Trending Now" movies={trendingMovies} />
                <CategoryGrid />
                <ContentRow title="🆕 New Releases" movies={newReleases} />
                <ContentRow title="⭐ Top Rated" movies={topRated} />
            </div>
        </>
    );
}
