import type { Metadata } from "next";
import MoviesClient from "@/app/movies/_components/MoviesClient";

export const metadata: Metadata = {
    title: "On Demand",
    description: "Watch the latest movies and shows available for rent on demand.",
};

export default function OnDemandPage() {
    return <MoviesClient pageTitle="On Demand" accessType="rental" />;
}
