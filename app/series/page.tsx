import type { Metadata } from "next";
import SeriesCatalog from "./_components/SeriesCatalog";

export const metadata: Metadata = {
    title: "Series",
    description: "Discover series, explore seasons, and find your next episode.",
};

export default function SeriesPage() {
    return <SeriesCatalog />;
}