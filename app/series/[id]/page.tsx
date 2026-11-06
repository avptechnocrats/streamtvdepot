import type { Metadata } from "next";
import { Suspense } from "react";
import SeriesDetails from "../_components/SeriesDetails";

export const metadata: Metadata = {
    title: "Series Details",
    description: "Explore seasons, discover episodes, and continue watching your favorite series.",
};

export default async function SeriesDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <Suspense fallback={<div role="status" aria-label="Loading series" className="min-h-[65vh] animate-pulse bg-secondary/40" />}><SeriesDetails key={id} id={id} /></Suspense>;
}