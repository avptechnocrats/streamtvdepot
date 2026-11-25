"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSubscriptionPlans, type SubscriptionPlan } from "@/lib/services/subscription-plans";

export function formatRentalPrice(price?: number | null, currency = "USD", format = "UHD"): string {
    if (price == null || price === 0) return `${format} $5.00`;
    const symbols: Record<string, string> = {
        INR: "₹",
        USD: "$",
        EUR: "€",
        GBP: "£",
        CAD: "CA$",
        AUD: "A$",
    };
    const code = (currency || "USD").toUpperCase();
    const symbol = symbols[code] ?? `${currency} `;
    const formatted = Number.isInteger(price) ? price.toString() : price.toFixed(2);
    return `${format} ${symbol}${formatted}`;
}

export function useRentalPlans() {
    return useQuery<SubscriptionPlan[]>({
        queryKey: ["subscription-plans", "rent"],
        queryFn: () => fetchSubscriptionPlans("rent"),
        staleTime: 5 * 60_000,
    });
}

export function useVideoRentalPrice(planIds?: string[] | null, fallbackPrice?: number | null) {
    const { data: plans = [] } = useRentalPlans();

    const matchedPlan = planIds?.length
        ? plans.find((p) => planIds.includes(p.id)) ?? plans[0]
        : plans[0];

    const price = matchedPlan?.price ?? fallbackPrice ?? 5;
    const currency = matchedPlan?.currency ?? "USD";

    return {
        price,
        currency,
        planName: matchedPlan?.name ?? "Rent",
        formatted: formatRentalPrice(price, currency),
    };
}
