import type { Metadata } from "next";
import ThemeRenderer from "@/components/ThemeRenderer";

export const metadata: Metadata = {
    title: "Home",
    description: "Watch the latest movies, TV shows and live channels on StreamTVDepot.",
};

export default function HomePage() {
    return <ThemeRenderer />;
}
