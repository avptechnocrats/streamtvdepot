"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Monitor, Download, Tv, Clock, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSubscriptionPlans, type SubscriptionPlan } from "@/lib/services";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getUserCountry, setSelectedCountry, getCountryName } from "@/lib/services/geolocation";
import { PricingHeaderWithCountry } from "@/components/CountrySelector";

const BILLING_LABELS: Record<string, string> = {
    monthly: "/ mo",
    yearly: "/ yr",
    daily: "/ day",
};

const TYPE_ACCENT: Record<string, string> = {
    subscription: "border-primary",
    rent: "border-blue-500",
    ppv: "border-amber-500",
};
function getPopularId(plans: SubscriptionPlan[]): string | null {
    const subs = plans.filter((p) => p.plan_type === "subscription");
    if (!subs.length) return null;
    return subs.reduce((a, b) => (a.price >= b.price ? a : b)).id;
}

function PlanCard({
    plan,
    popular,
    onChoose,
    userCountry,
}: {
    plan: SubscriptionPlan;
    popular: boolean;
    onChoose: (plan: SubscriptionPlan) => void;
    userCountry: string | null | undefined;
}) {
    const billingLabel = BILLING_LABELS[plan.billing_cycle] ?? `/ ${plan.billing_cycle}`;
    const accentBorder = TYPE_ACCENT[plan.plan_type] ?? "border-border";
    const localPricing = plan.country_pricing?.find(
        (c) => userCountry && c.country.toUpperCase() === userCountry.toUpperCase()
    ) ?? null;
    const displayPrice = localPricing?.price ?? plan.price;
    const displayCurrency = localPricing?.currency ?? plan.currency;
    const isLocalPrice = localPricing !== null;

    const features: { icon: React.ReactNode; text: string; available: boolean }[] = [
        {
            icon: <Monitor size={14} />,
            text: `${plan.max_screens ?? 1} screen${(plan.max_screens ?? 1) > 1 ? "s" : ""} simultaneously`,
            available: true,
        },
        ...(plan.can_download
            ? [{
                icon: <Download size={14} />,
                text: `${plan.max_downloads ?? 0} download${(plan.max_downloads ?? 0) !== 1 ? "s" : ""}`,
                available: true,
            }]
            : []),
        {
            icon: <Tv size={14} />,
            text: plan.description,
            available: true,
        },
        ...(plan.trial_days > 0
            ? [{ icon: <Zap size={14} />, text: `${plan.trial_days}-day free trial`, available: true }]
            : []),
        ...(plan.restriction_days != null
            ? [{ icon: <Clock size={14} />, text: `${plan.restriction_days}-day access`, available: true }]
            : []),
        ...(plan.restriction_months != null
            ? [{ icon: <Clock size={14} />, text: `${plan.restriction_months}-month access`, available: true }]
            : []),
    ];

    return (
        <div
            className={`relative flex flex-col h-full rounded-2xl border-2 bg-card transition-all hover:shadow-xl hover:-translate-y-1 overflow-visible ${popular ? accentBorder : "border-border/50 hover:border-border"}`}
        >
            {popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-50">
                    <span className="bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg">
                        Most Popular
                    </span>
                </div>
            )}

            <div className="p-4 pb-4">
                <h3 className="text-xl font-black text-foreground">{plan.name}</h3>

                <div className="mt-4 flex items-end gap-1">
                    {displayPrice === 0 ? (
                        <span className="text-4xl font-black text-foreground">Free</span>
                    ) : (
                        <>
                            <span className="text-2xl font-bold text-muted-foreground self-start mt-1">{displayCurrency}</span>
                            <span className="text-3xl font-black text-foreground leading-none">{displayPrice.toFixed(2)}</span>
                            <span className="text-sm text-muted-foreground mb-1">{billingLabel}</span>
                        </>
                    )}
                </div>

                {/* Amrender: Commented out local pricing note.
                {isLocalPrice && plan.price !== displayPrice && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Local pricing · default {plan.currency} {plan.price.toFixed(2)}
                    </p>
                )} */}
            </div>

            <hr className="border-border/50 mx-6" />

            <ul className="p-4 pt-5 flex flex-col gap-3 flex-1">
                {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-0.5 shrink-0 ${f.available ? "text-primary" : "text-muted-foreground/40"}`}>
                            {f.available ? <Check size={15} strokeWidth={2.5} /> : f.icon}
                        </span>
                        <span className={f.available ? "text-foreground/80" : "text-muted-foreground/50 line-through"}>
                            {f.text}
                        </span>
                    </li>
                ))}
            </ul>

            <div className="px-6 pb-6">
                {plan.plan_type === "subscription" ? (
                    <button
                        onClick={() => onChoose(plan)}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${popular
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                            : "bg-muted text-foreground hover:bg-muted/70 border border-border/50"
                            }`}
                    >
                        {plan.price === 0 ? "Get Started Free" : "Subscribe Now"}
                    </button>
                ) : plan.plan_type === "ppv" ? (
                    <button
                        onClick={() => onChoose(plan)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/30"
                    >
                        View Events
                    </button>
                ) : (
                    <button
                        onClick={() => onChoose(plan)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-500/30"
                    >
                        Browse Movies to Rent
                    </button>
                )}
            </div>
        </div>
    );
}

function PricingSkeletons() {
    return (
        <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-6 max-w-6xl mx-auto overflow-x-auto pt-12">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border-2 border-border/50 bg-card flex flex-col">
                    {/* Header */}
                    <div className="p-6 pb-4">
                        <Skeleton className="h-6 w-36 rounded" />
                        <div className="mt-4 flex items-end gap-1">
                            <Skeleton className="h-5 w-3 rounded self-start mt-1" />
                            <Skeleton className="h-10 w-24 rounded" />
                            <Skeleton className="h-4 w-10 rounded mb-1" />
                        </div>
                        <Skeleton className="mt-2 h-3 w-40 rounded" />
                    </div>

                    <hr className="border-border/50 mx-6" />

                    {/* Features */}
                    <ul className="p-6 pt-5 flex flex-col gap-3 flex-1">
                        {Array.from({ length: 4 }).map((_, j) => (
                            <li key={j} className="flex items-center gap-2.5">
                                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                                <Skeleton className="h-4 flex-1 rounded" />
                            </li>
                        ))}
                    </ul>

                    {/* CTA */}
                    <div className="px-6 pb-6">
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function PricingClient() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry_] = useState<string | null>(null);
    const [geoLoading, setGeoLoading] = useState(true);
    const plansRailRef = useRef<HTMLDivElement | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnTo = searchParams.get("returnTo") ?? "/";
    const { user } = useAuth();

    // Determine the country to display
    // Priority: User profile → Selected country → Detected country
    const displayCountry = user?.country || selectedCountry || detectedCountry;

    // Initialize geolocation on mount
    useEffect(() => {
        async function initializeCountry() {
            try {
                const country = await getUserCountry(user?.country);
                if (country) {
                    setDetectedCountry(country);
                }
            } catch (error) {
                console.warn("Failed to detect country:", error);
            } finally {
                setGeoLoading(false);
            }
        }

        initializeCountry();
    }, [user?.country]);

    // Handle country change
    const handleCountryChange = (country: string) => {
        setSelectedCountry_(country);
        setSelectedCountry(country); // Save to localStorage
    };

    useEffect(() => {
        fetchSubscriptionPlans()
            .then((data) => setPlans(data.filter((p) => p.is_active)))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const updateScrollState = useCallback(() => {
        const rail = plansRailRef.current;
        if (!rail) {
            setCanScrollLeft(false);
            setCanScrollRight(false);
            return;
        }

        const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
        if (maxScrollLeft <= 2) {
            setCanScrollLeft(false);
            setCanScrollRight(false);
            return;
        }

        setCanScrollLeft(rail.scrollLeft > 2);
        setCanScrollRight(rail.scrollLeft < maxScrollLeft - 2);
    }, []);

    useEffect(() => {
        if (loading) return;
        updateScrollState();

        const rail = plansRailRef.current;
        if (!rail) return;

        const onScroll = () => updateScrollState();
        rail.addEventListener("scroll", onScroll, { passive: true });

        const onResize = () => updateScrollState();
        window.addEventListener("resize", onResize);

        return () => {
            rail.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
        };
    }, [loading, plans, updateScrollState]);

    const scrollPlans = (direction: "left" | "right") => {
        const rail = plansRailRef.current;
        if (!rail) return;

        const amount = Math.max(rail.clientWidth * 0.82, 280);
        rail.scrollBy({
            left: direction === "right" ? amount : -amount,
            behavior: "smooth",
        });
    };

    const popularId = getPopularId(plans);

    const handleChoose = (plan: SubscriptionPlan) => {
        if (plan.plan_type === "ppv") {
            router.push("/tv-shows");
            return;
        }
        if (plan.plan_type === "rent") {
            router.push("/movies");
            return;
        }
        // Navigate to the full checkout page for subscriptions
        router.push(
            `/checkout?type=subscription&planId=${encodeURIComponent(plan.id)}&returnTo=${encodeURIComponent(returnTo)}`,
        );
    };

    return (
        <div className="min-h-screen">
            {/* Hero with Country Detection */}
            <div className="pt-20 pb-8 px-6">
                <PricingHeaderWithCountry
                    detectedCountry={detectedCountry}
                    selectedCountry={selectedCountry}
                    onCountryChange={handleCountryChange}
                />
            </div>

            {/* Plans grid */}
            <div className="px-6 lg:px-16 pb-20">
                {loading || geoLoading ? (
                    <PricingSkeletons />
                ) : plans.length === 0 ? (
                    <p className="text-center text-muted-foreground py-20">No plans available.</p>
                ) : (
                    <div className="relative max-w-6xl mx-auto pt-6">
                        <button
                            type="button"
                            onClick={() => scrollPlans("left")}
                            disabled={!canScrollLeft}
                            aria-label="Scroll plans left"
                            className="hidden md:flex absolute -left-7 top-1/2 -translate-y-1/2 z-10 h-12 w-12 items-center justify-center rounded-full border-2 border-primary/45 bg-background/95 text-foreground shadow-lg backdrop-blur transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:scale-105 hover:border-primary"
                        >
                            <ChevronLeft size={24} className="text-primary" />
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollPlans("right")}
                            disabled={!canScrollRight}
                            aria-label="Scroll plans right"
                            className="hidden md:flex absolute -right-7 top-1/2 -translate-y-1/2 z-10 h-12 w-12 items-center justify-center rounded-full border-2 border-primary/45 bg-background/95 text-foreground shadow-lg backdrop-blur transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:scale-105 hover:border-primary"
                        >
                            <ChevronRight size={24} className="text-primary" />
                        </button>

                        <div
                            ref={plansRailRef}
                            className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-6 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory pt-6 items-stretch"
                        >
                            {plans.map((plan) => (
                                <div key={plan.id} className="snap-start overflow-visible h-full">
                                    <PlanCard
                                        plan={plan}
                                        popular={plan.id === popularId}
                                        onChoose={handleChoose}
                                        userCountry={displayCountry}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer note */}
            {!loading && plans.length > 0 && (
                <div className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground px-6">
                    <div className="space-y-1">
                        <p>Prices shown in your local currency where available.</p>
                        <p>All plans include access to our full library of content.</p>
                        {displayCountry && (
                            <p className="text-xs mt-2 text-primary/60">
                                Displaying prices for {getCountryName(displayCountry)}
                                {!user?.country && !selectedCountry ? " (auto-detected)" : ""}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
