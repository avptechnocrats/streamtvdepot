import type { Metadata } from "next";
import PpvEventsPage from "./_components/PpvEventsPage";

export const metadata: Metadata = {
    title: "PPV Events",
    description: "Browse live pay-per-view events.",
};

export default function Page() {
    return <PpvEventsPage />;
}