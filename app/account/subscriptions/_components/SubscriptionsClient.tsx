"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    CreditCard,
    Check,
    Monitor,
    Download,
    Tv,
    Zap,
    Clock,
    ArrowRight,
    BadgeCheck,
    AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import CheckoutModal from "@/components/CheckoutModal";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { fetchSubscriptionPlans, type SubscriptionPlan } from "@/lib/services";
import {
    fetchMySubscriptions,
    fetchSubscriptionHistory,
    scheduleDowngrade,
    type UserPurchase,
} from "@/lib/services/checkout";

function getLocalizedPrice(plan: SubscriptionPlan, userCountry: string | null | undefined): { price: number; currency: string } {
    if (userCountry && Array.isArray(plan.country_pricing) && plan.country_pricing.length > 0) {
        const match = plan.country_pricing.find(
            (cp) => cp.country.toUpperCase() === userCountry.toUpperCase()
        );
        if (match) return { price: match.price, currency: match.currency };
    }
    return { price: plan.price, currency: plan.currency };
}

const BILLING_LABELS: Record<string, string> = {
    monthly: "/ mo",
    yearly: "/ yr",
    daily: "/ day",
};

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
    });
}

function isSubscriptionActive(purchase: UserPurchase): boolean {
    const now = new Date();
    const startedAt = new Date(purchase.started_at);
    const expiresAt = purchase.expires_at ? new Date(purchase.expires_at) : null;

    return (
        (purchase.status === "active" || purchase.status === "trial") &&
        !Number.isNaN(startedAt.getTime()) &&
        startedAt <= now &&
        (!expiresAt || (!Number.isNaN(expiresAt.getTime()) && expiresAt > now))
    );
}

function PlanFeatures({ plan }: { plan: SubscriptionPlan }) {
    const items = [
        { icon: <Monitor size={13} />, text: `${plan.max_screens ?? 1} screen${(plan.max_screens ?? 1) > 1 ? "s" : ""} simultaneously` },
        ...(plan.can_download ? [{ icon: <Download size={13} />, text: `${plan.max_downloads ?? 0} downloads` }] : []),
        { icon: <Tv size={13} />, text: plan.description },
        ...(plan.trial_days > 0 ? [{ icon: <Zap size={13} />, text: `${plan.trial_days}-day free trial` }] : []),
        ...(plan.restriction_days != null ? [{ icon: <Clock size={13} />, text: `${plan.restriction_days}-day access` }] : []),
    ];

    return (
        <ul className="space-y-2 mt-4">
            {items.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 text-primary shrink-0"><Check size={12} strokeWidth={2.5} /></span>
                    <span>{f.text}</span>
                </li>
            ))}
        </ul>
    );
}

function PlanCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-8 w-24 rounded" />
            <div className="space-y-2 pt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                        <Skeleton className="h-3 flex-1 rounded" />
                    </div>
                ))}
            </div>
            <Skeleton className="h-9 w-full rounded-xl mt-2" />
        </div>
    );
}

export default function SubscriptionsClient() {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [activeSubscriptions, setActiveSubscriptions] = useState<UserPurchase[]>([]);
    const [pastSubscriptions, setPastSubscriptions] = useState<UserPurchase[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [subsLoading, setSubsLoading] = useState(true);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
    const [checkoutMode, setCheckoutMode] = useState<"checkout" | "upgrade">("checkout");
    const [downgradePlan, setDowngradePlan] = useState<SubscriptionPlan | null>(null);
    const [schedulingDowngrade, setSchedulingDowngrade] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>("");

    const loadSubscriptions = useCallback(async () => {
        if (!user) return;
        setSubsLoading(true);
        try {
            const data = await fetchMySubscriptions("subscription");
            const sorted = [...data].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            setActiveSubscriptions(sorted.filter((s) => s.status === "active" || s.status === "trial"));
        } catch {
            setActiveSubscriptions([]);
        } finally {
            setSubsLoading(false);
        }
    }, [user]);

    const loadHistory = useCallback(async () => {
        if (!user) return;
        setHistoryLoading(true);
        try {
            const history = await fetchSubscriptionHistory(5);
            setPastSubscriptions(history);
        } catch {
            setPastSubscriptions([]);
        } finally {
            setHistoryLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!isLoading && !user) {
            router.replace("/login");
        }
    }, [user, isLoading, router]);

    useEffect(() => {
        loadSubscriptions();
    }, [loadSubscriptions]);

    useEffect(() => {
        fetchSubscriptionPlans()
            .then((data) => setPlans(data.filter((p) => p.is_active)))
            .catch(() => { })
            .finally(() => setPlansLoading(false));
    }, []);

    const loading = isLoading || subsLoading;

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-56 rounded mb-6" />
                <div className="grid sm:grid-cols-2 gap-4">
                    {Array.from({ length: 2 }).map((_, i) => <PlanCardSkeleton key={i} />)}
                </div>
            </div>
        );
    }

    if (!user) return null;

    const now = new Date();
    const currentSubscriptions = activeSubscriptions.filter((sub) => {
        const startsAt = new Date(sub.started_at);
        const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
        if (Number.isNaN(startsAt.getTime())) return false;
        if (startsAt > now) return false;
        if (!expiresAt) return true;
        if (Number.isNaN(expiresAt.getTime())) return false;
        return expiresAt > now;
    });
    const queuedSubscriptions = activeSubscriptions.filter((sub) => {
        const startsAt = new Date(sub.started_at);
        return !Number.isNaN(startsAt.getTime()) && startsAt > now;
    });

    const currentSubscription = [...currentSubscriptions].sort((a, b) => {
        const aTs = a.expires_at ? new Date(a.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTs = b.expires_at ? new Date(b.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
        return bTs - aTs;
    })[0] ?? null;
    const currentPlan = currentSubscription
        ? plans.find((p) => p.id === currentSubscription.plan_id) ?? null
        : null;

    const hasActiveSub = Boolean(currentSubscription);
    const isCurrentSubscriptionTrial = currentSubscription?.status === "trial";
    const extraActiveSubscriptions = currentSubscriptions.filter((sub) => sub.id !== currentSubscription?.id);
    const currentExpiry = currentSubscription?.expires_at ? new Date(currentSubscription.expires_at) : null;
    const trueComingSubscription = queuedSubscriptions.find((sub) => {
        const startsAt = new Date(sub.started_at);
        return !Number.isNaN(startsAt.getTime()) && (!currentExpiry || startsAt >= currentExpiry);
    }) ?? null;
    const overlappingSubscription = extraActiveSubscriptions.find((sub) => {
        const startsAt = new Date(sub.started_at);
        const expiresAt = sub.expires_at ? new Date(sub.expires_at) : null;
        return !Number.isNaN(startsAt.getTime()) && (!expiresAt || !Number.isNaN(expiresAt.getTime())) && startsAt < (currentExpiry ?? startsAt);
    }) ?? null;

    const openCheckout = (plan: SubscriptionPlan, mode: "checkout" | "upgrade") => {
        setStatusMessage("");
        setSelectedPlan(plan);
        setCheckoutMode(mode);
        setCheckoutOpen(true);
    };

    const handleCheckoutSuccess = async () => {
        setCheckoutOpen(false);
        setSelectedPlan(null);
        setStatusMessage(
            checkoutMode === "upgrade"
                ? "Plan upgraded successfully."
                : "Subscription applied and activated successfully",
        );
        await loadSubscriptions();
    };

    const handleScheduleDowngrade = async () => {
        if (!downgradePlan) return;
        setSchedulingDowngrade(true);
        try {
            await scheduleDowngrade(downgradePlan.id);
            setStatusMessage(`${downgradePlan.name} will start when your current plan ends.`);
            setDowngradePlan(null);
            await loadSubscriptions();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : "Could not schedule your plan change.");
        } finally {
            setSchedulingDowngrade(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-foreground tracking-tight">Subscriptions</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Choose and manage your plan</p>
                </div>
                <Dialog
                    open={historyOpen}
                    onOpenChange={(open) => {
                        setHistoryOpen(open);
                        if (open) {
                            void loadHistory();
                        }
                    }}
                >
                    <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="ml-auto">
                            {historyLoading ? "Loading..." : "Subscription history"}
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Subscription history</DialogTitle>
                            <DialogDescription>
                                Your latest five past subscription records.
                            </DialogDescription>
                        </DialogHeader>

                        {historyLoading ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground text-center">
                                Loading subscription history...
                            </div>
                        ) : pastSubscriptions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground text-center">
                                No prior subscriptions yet.
                            </div>
                        ) : (
                            <div className="max-h-[420px] overflow-y-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/30 text-left">
                                        <tr>
                                            <th className="px-3 py-2.5 font-medium text-foreground">Subscription name</th>
                                            <th className="px-3 py-2.5 font-medium text-foreground">Start</th>
                                            <th className="px-3 py-2.5 font-medium text-foreground">End</th>
                                            <th className="px-3 py-2.5 font-medium text-foreground">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pastSubscriptions.map((purchase) => (
                                            <tr key={purchase.id} className="border-t border-border align-top">
                                                <td className="px-3 py-2.5 font-medium text-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <span>{purchase.plan_name}</span>
                                                        {purchase.status === "trial" && (
                                                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                                                                Trial
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 text-muted-foreground">{formatDateTime(purchase.started_at)}</td>
                                                <td className="px-3 py-2.5 text-muted-foreground">
                                                    {purchase.expires_at ? formatDateTime(purchase.expires_at) : "—"}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className={isSubscriptionActive(purchase)
                                                        ? "font-medium text-emerald-500"
                                                        : "font-medium text-muted-foreground"}>
                                                        {isSubscriptionActive(purchase) ? "Active" : "Expired"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>

            {statusMessage && (
                <div className="mb-5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 text-primary shrink-0" />
                    <p>{statusMessage}</p>
                </div>
            )}

            {hasActiveSub ? (
                /* Active subscription card */
                <div className="space-y-4 mb-8">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Plan</h2>
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                            <BadgeCheck size={20} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground">{currentSubscription?.plan_name}</p>
                            {currentSubscription?.expires_at && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {isCurrentSubscriptionTrial ? "Trial ends" : "Renews / expires"}: {formatDateTime(currentSubscription.expires_at)}
                                </p>
                            )}
                        </div>
                        <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full capitalize">
                            {currentSubscription?.status ?? "active"}
                        </span>
                    </div>

                    {isCurrentSubscriptionTrial && currentPlan && (
                        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Want full access now?</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    End your trial early and start your paid {currentPlan.name} subscription today.
                                </p>
                            </div>
                            <Button size="sm" onClick={() => openCheckout(currentPlan, "upgrade")} className="shrink-0">
                                Get Full Access Now
                            </Button>
                        </div>
                    )}

                    {trueComingSubscription && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-6 py-5 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                                        Coming Plan
                                    </p>
                                    <p className="font-semibold text-foreground mt-0.5">
                                        {trueComingSubscription.plan_name}
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full capitalize">
                                    queued
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p>
                                    Starts automatically on {new Date(trueComingSubscription.started_at).toLocaleDateString()}.
                                </p>
                                {trueComingSubscription.expires_at && (
                                    <p>
                                        Ends on {new Date(trueComingSubscription.expires_at).toLocaleDateString()}.
                                    </p>
                                )}
                                {queuedSubscriptions.length === 0 && extraActiveSubscriptions.length > 0 && (
                                    <p>
                                        Additional active subscription records are hidden from the main card to avoid confusion.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {!trueComingSubscription && overlappingSubscription && (
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-5 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                                        Overlapping Active Plan
                                    </p>
                                    <p className="font-semibold text-foreground mt-0.5">
                                        {overlappingSubscription.plan_name}
                                    </p>
                                </div>
                                <span className="text-xs font-semibold text-amber-200 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full capitalize">
                                    overlap
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p>
                                    This plan overlaps with your current subscription and is not a future renewal.
                                </p>
                                <p>
                                    Started on {new Date(overlappingSubscription.started_at).toLocaleDateString()} and ends on {overlappingSubscription.expires_at ? new Date(overlappingSubscription.expires_at).toLocaleDateString() : "-"}.
                                </p>
                            </div>
                        </div>
                    )}

                    {queuedSubscriptions.length === 0 && extraActiveSubscriptions.length > 1 && !overlappingSubscription && (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                            Multiple active subscription records were found. The newest/current plan is shown above.
                        </div>
                    )}
                </div>
            ) : (
                /* No active subscription banner */
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 px-6 py-8 text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <CreditCard size={22} className="text-primary" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">No active subscription</h2>
                    <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
                        Pick a plan below to unlock full access to movies, live TV and exclusive shows.
                    </p>
                </div>
            )}

            {/* Available plans */}
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Available Plans</h2>

            {plansLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
                    {Array.from({ length: 4 }).map((_, i) => <PlanCardSkeleton key={i} />)}
                </div>
            ) : plans.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">No plans available.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
                    {plans.map((plan) => {
                        const billingLabel = BILLING_LABELS[plan.billing_cycle] ?? `/ ${plan.billing_cycle}`;
                        const { price: displayPrice, currency: displayCurrency } = getLocalizedPrice(plan, user?.country);
                        return (
                            <div
                                key={plan.id}
                                className="h-full rounded-2xl border-2 border-border/50 bg-card p-5 hover:border-primary/50 hover:shadow-md transition-all flex flex-col"
                            >
                                <div>
                                    <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                                    <div className="flex items-end gap-1 mt-2">
                                        {displayPrice === 0 ? (
                                            <span className="text-2xl font-black text-foreground">Free</span>
                                        ) : (
                                            <>
                                                <span className="text-sm font-bold text-muted-foreground self-start mt-1">{displayCurrency}</span>
                                                <span className="text-2xl font-black text-foreground leading-none">{displayPrice.toFixed(2)}</span>
                                                <span className="text-xs text-muted-foreground mb-0.5">{billingLabel}</span>
                                            </>
                                        )}
                                    </div>
                                    <PlanFeatures plan={plan} />
                                </div>
                                <div className="mt-auto pt-5 text-center">
                                    {(() => {
                                        const currentLocalized = currentPlan ? getLocalizedPrice(currentPlan, user?.country) : null;
                                        const planLocalized = getLocalizedPrice(plan, user?.country);
                                        const isCurrentPlan = currentPlan?.id === plan.id;
                                        const queuedForThisPlan = queuedSubscriptions.some((s) => s.plan_id === plan.id);

                                        if (!currentPlan) {
                                            return (
                                                <Button
                                                    className="w-auto"
                                                    onClick={() => openCheckout(plan, "checkout")}
                                                >
                                                    {displayPrice === 0 ? "Get Started Free" : "Subscribe"}
                                                    <ArrowRight size={14} className="ml-2" />
                                                </Button>
                                            );
                                        }

                                        if (isCurrentPlan) {
                                            if (isCurrentSubscriptionTrial) {
                                                return (
                                                    <Button className="w-auto" onClick={() => openCheckout(plan, "upgrade")}>
                                                        Get Full Access Now
                                                        <ArrowRight size={14} className="ml-2" />
                                                    </Button>
                                                );
                                            }
                                            return (
                                                <Button
                                                    className="w-auto"
                                                    disabled={queuedForThisPlan}
                                                    onClick={() => openCheckout(plan, "checkout")}
                                                >
                                                    {queuedForThisPlan ? "Renewal Queued" : "Renew Plan"}
                                                    {!queuedForThisPlan && <ArrowRight size={14} className="ml-2" />}
                                                </Button>
                                            );
                                        }

                                        const isFreeDowngrade = currentLocalized
                                            && currentLocalized.price > 0
                                            && planLocalized.price === 0;
                                        const isSameCurrencyDowngrade = currentLocalized
                                            && planLocalized.currency === currentLocalized.currency
                                            && planLocalized.price < currentLocalized.price;

                                        if (isFreeDowngrade || isSameCurrencyDowngrade) {
                                            return (
                                                <Button className="w-auto" variant="outline" onClick={() => setDowngradePlan(plan)}>
                                                    Downgrade at Renewal
                                                </Button>
                                            );
                                        }

                                        return (
                                            <Button
                                                className="w-auto"
                                                onClick={() => openCheckout(plan, "upgrade")}
                                            >
                                                Upgrade Plan
                                                <ArrowRight size={14} className="ml-2" />
                                            </Button>
                                        );
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="text-center text-xs text-muted-foreground mt-8">
                View full plan details on the{" "}
                <Link href="/pricing" className="text-primary hover:underline">Pricing page</Link>.
            </p>

            <CheckoutModal
                open={checkoutOpen}
                plan={selectedPlan}
                mode={checkoutMode}
                renewalStartsAt={currentPlan?.id === selectedPlan?.id ? currentSubscription?.expires_at : null}
                onClose={() => {
                    setCheckoutOpen(false);
                    setSelectedPlan(null);
                }}
                onSuccess={() => {
                    void handleCheckoutSuccess();
                }}
            />

            <AlertDialog open={Boolean(downgradePlan)} onOpenChange={(open) => !open && !schedulingDowngrade && setDowngradePlan(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Schedule plan change?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {downgradePlan && currentSubscription?.expires_at
                                ? `${downgradePlan.name} will start on ${new Date(currentSubscription.expires_at).toLocaleDateString()} after your current paid plan ends.`
                                : "This plan will start after your current paid plan ends."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={schedulingDowngrade}>Keep current plan</AlertDialogCancel>
                        <AlertDialogAction onClick={handleScheduleDowngrade} disabled={schedulingDowngrade}>
                            {schedulingDowngrade ? "Scheduling..." : "Schedule downgrade"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
