import type { Metadata } from "next";
import TvShowsPage from "./_components/TvShowsPage";

export const metadata: Metadata = {
    title: "TV Shows",
    description: "Watch live TV channels and exclusive shows on SignalView.",
};

export default function TVShowsPage() {
    return <TvShowsPage />;
}
