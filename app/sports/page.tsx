import type { Metadata } from "next";
import MoviesClient from "@/app/movies/_components/MoviesClient";

export const metadata: Metadata = {
    title: "Sports",
    description: "Watch sports films, documentaries and original sports stories.",
};

export default function SportsPage() {
    return <MoviesClient contentClassification="Sports" pageTitle="Sports" />;
}