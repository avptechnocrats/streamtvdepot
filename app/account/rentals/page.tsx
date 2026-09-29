import type { Metadata } from "next";
import RentalsClient from "./_components/RentalsClient";

export const metadata: Metadata = {
    title: "Rentals & PPVs",
    description: "View your rentals, PPV purchases, and their access validity.",
};

export default function RentalsPage() {
    return <RentalsClient />;
}
