import type { Metadata } from "next";
import SavedCardsClient from "./_components/SavedCardsClient";

export const metadata: Metadata = {
    title: "Saved Cards",
    description: "Manage your saved payment methods.",
};

export default function SavedCardsPage() {
    return <SavedCardsClient />;
}
