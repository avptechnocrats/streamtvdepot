import { Suspense } from "react";
import type { Metadata } from "next";
import PricingClient from "./_components/PricingClient";

export const metadata: Metadata = {
    title: "Pricing",
    description: "Choose the plan that works for you. Cancel anytime.",
};

export default function PricingPage() {
    return (
        <Suspense fallback={null}>
            <PricingClient />
        </Suspense>
    );
}
