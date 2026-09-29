import type { Metadata } from "next";
import MoviesClient from "./_components/MoviesClient";

export const metadata: Metadata = {
    title: "Movies",
    description: "Watch the latest movies and blockbusters on SignalView.",
};

export default function MoviesPage() {
    return <MoviesClient />;
}
