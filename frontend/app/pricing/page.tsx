import type { Metadata } from "next";
import PricingClient from "./_components/PricingClient";
import { ENDPOINTS } from "@/lib/api/endpoints";

export const metadata: Metadata = {
    title: "Pricing — StreamTVDepot",
    description:
        "Simple, transparent pricing for every stage. Launch your own OTT streaming platform with StreamTVDepot — Starter, Growth, and Scale plans available monthly or yearly.",
    openGraph: {
        title: "Pricing — StreamTVDepot",
        description:
            "Simple, transparent pricing for every stage. Launch your own OTT streaming platform with StreamTVDepot.",
        url: "https://streamtvdepot.com/pricing",
    },
};

export interface PublicPlanOut {
    id: string;
    name: string;
    sub_text: string | null;
    slug: string;
    description: string | null;
    price_monthly: number;
    price_quarterly: number | null;
    price_yearly: number | null;
    currency: string;
    key_features: string[] | null;
    additional_apps: Record<string, boolean> | null;
    additional_app_price: number | null;
    max_users: number | null;
    max_storage_gb: number | null;
    max_streams: number | null;
    max_admin_users: number | null;
    is_active: boolean;
}

async function fetchPlans(): Promise<PublicPlanOut[]> {
    try {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}${ENDPOINTS.public.plans}`,
            { next: { revalidate: 300 } },
        );
        if (!res.ok) return [];
        return res.json();
    } catch {
        return [];
    }
}

export default async function PricingPage() {
    const plans = await fetchPlans();
    return <PricingClient plans={plans} />;
}
