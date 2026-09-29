import type { Metadata } from "next";
import FavoritesClient from "./_components/MyFavorites";

export const metadata: Metadata = {
    title: "My List",
    description: "Movies and shows you saved to your list.",
};

export default function FavoritesPage() {
    return <FavoritesClient />;
}
