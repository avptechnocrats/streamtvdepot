import type { Metadata } from "next";
import TvShowsPage from "./_components/TvShowsPage";

export const metadata: Metadata = {
    title: "TV Shows",
    description: "Watch live TV channels and exclusive shows.",
};

export default async function TVShowsPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
    const { channel } = await searchParams;
    return <TvShowsPage initialChannelId={channel} />;
}
