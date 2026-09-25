"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
    AlertTriangle,
    BadgeDollarSign,
    CheckCircle2,
    Clock,
    CircleDollarSign,
    CreditCard,
    Loader2,
    Plus,
    ShoppingCart,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    confirmBillingUpgrade,
    fetchBillingLicensing,
    initiateBillingUpgrade,
    requestBillingDowngrade,
    cancelBillingDowngrade,
    setAutoRenew,
    createBillingPaymentMethodSetup,
    deleteBillingPaymentMethod,
    listBillingPaymentMethods,
    getApiErrorMessage,
    type BillingLicensingOut,
    type BillingPaymentMethod,
    type BillingPaymentHistoryItem,
    type SaasPlanOption,
    type SaasBillingCycle,
    fetchBillingPaymentHistory,
} from "@/lib/api";
import { formatLocalDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
        Cashfree?: (options: { mode: "sandbox" | "production" }) => {
            checkout: (options: { paymentSessionId: string; redirectTarget: "_self" }) => Promise<unknown>;
        };
    }
}

function money(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
    }).format(amount);
}

function cyclePrice(plan: SaasPlanOption, cycle: SaasBillingCycle): number | null {
    if (cycle === "quarterly") return plan.price_quarterly;
    if (cycle === "yearly") return plan.price_yearly;
    return plan.price_monthly;
}

function SavedCardsSkeleton() {
    return (
        <div className="space-y-3" aria-label="Loading saved cards">
            {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-lg" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-44" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
            ))}
        </div>
    );
}

function SubscriptionSkeleton() {
    return (
        <div className="space-y-6" aria-label="Loading subscription">
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <div className="space-y-2 text-right">
                        <Skeleton className="ml-auto h-3 w-16" />
                        <Skeleton className="ml-auto h-6 w-24" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="rounded-xl border border-border bg-secondary/25 px-4 py-3 space-y-2">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-28" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 space-y-2">
                            <Skeleton className="h-3 w-14" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-4 w-72" />
                    <Skeleton className="h-4 w-64" />
                </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-36" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <div key={index} className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                            <div className="flex justify-between gap-3">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-5 w-20" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-4/5" />
                            <Skeleton className="ml-auto h-8 w-20 rounded-lg" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function AddCardForm({ onSaved, onError }: { onSaved: () => void; onError: (message: string) => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!stripe || !elements) return;

        setSaving(true);
        const { error } = await stripe.confirmSetup({
            elements,
            redirect: "if_required",
        });
        if (error) {
            onError(error.message ?? "Could not save payment method.");
        } else {
            onSaved();
        }
        setSaving(false);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
                <PaymentElement options={{ layout: "tabs" }} />
            </div>
            <Button type="submit" className="h-11 w-full gap-2" disabled={!stripe || !elements || saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {saving ? "Saving card..." : "Save Card"}
            </Button>
        </form>
    );
}

function SavedCardsPanel() {
    const [methods, setMethods] = useState<BillingPaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [setupSecret, setSetupSecret] = useState<string | null>(null);
    const [publishableKey, setPublishableKey] = useState<string | null>(null);

    const loadMethods = async () => {
        setLoading(true);
        setError(null);
        try {
            setMethods(await listBillingPaymentMethods());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load saved cards.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadMethods();
    }, []);

    const stripePromise = useMemo<Promise<Stripe | null> | null>(
        () => (publishableKey ? loadStripe(publishableKey) : null),
        [publishableKey],
    );

    const addCard = async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await createBillingPaymentMethodSetup();
            if (!result.stripe_client_secret || !result.stripe_publishable_key) {
                throw new Error("Card saving is not currently available.");
            }
            setSetupSecret(result.stripe_client_secret);
            setPublishableKey(result.stripe_publishable_key);
            setDialogOpen(true);
            setBusy(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start adding a card.");
            setBusy(false);
        }
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setSetupSecret(null);
        setPublishableKey(null);
    };

    const handleSaved = () => {
        closeDialog();
        setBusy(false);
        void loadMethods();
    };

    const removeCard = async (id: string) => {
        if (!window.confirm("Remove this saved card?")) return;
        setDeletingId(id);
        setError(null);
        try {
            const result = await deleteBillingPaymentMethod(id);
            setMethods(result.payment_methods);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove the card.");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Payment methods</p>
                    <h2 className="text-lg font-semibold text-foreground mt-1">Saved Cards</h2>
                    <p className="text-sm text-muted-foreground mt-1">Cards used for subscription purchases and renewals.</p>
                </div>
                <button
                    onClick={() => void addCard()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Add card
                </button>
            </div>

            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-300">{error}</p>}

            {loading ? (
                <SavedCardsSkeleton />
            ) : methods.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/20 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">No saved cards</p>
                    <p className="text-xs text-muted-foreground mt-1">Add a card to make future billing faster.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {methods.map((method) => (
                        <div key={method.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/20 px-4 py-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="rounded-lg border border-border bg-card p-2 text-muted-foreground">
                                    <CreditCard size={17} />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground capitalize">
                                        {method.brand} ending in {method.last4}
                                        {method.is_default && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-400">Default</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Expires {String(method.exp_month).padStart(2, "0")}/{method.exp_year}</p>
                                </div>
                            </div>
                            <div className="min-w-40 shrink-0 text-left">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Linked with</p>
                                <p className="text-sm font-medium text-foreground capitalize">{method.provider}</p>
                            </div>
                            <button
                                onClick={() => void removeCard(method.id)}
                                disabled={deletingId === method.id}
                                title="Delete saved card"
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/25 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {deletingId === method.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add a saved card</DialogTitle>
                        <DialogDescription>Use this card for future subscription purchases and renewals.</DialogDescription>
                    </DialogHeader>
                    {stripePromise && setupSecret && (
                        <Elements stripe={stripePromise} options={{ clientSecret: setupSecret }}>
                            <AddCardForm onSaved={handleSaved} onError={setError} />
                        </Elements>
                    )}
                </DialogContent>
            </Dialog>
        </section>
    );
}

export default function BillingLicensingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [data, setData] = useState<BillingLicensingOut | null>(null);
    const [paymentHistory, setPaymentHistory] = useState<BillingPaymentHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [upgradingPlanId, setUpgradingPlanId] = useState<string | null>(null);
    const [cancellingDowngrade, setCancellingDowngrade] = useState(false);
    const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
    const [gateway, setGateway] = useState<"stripe" | "paypal" | "razorpay" | "cashfree">("stripe");
    const [billingCycle, setBillingCycle] = useState<SaasBillingCycle>("monthly");
    const [activeTab, setActiveTab] = useState<"subscription" | "cards">("subscription");
    const [paymentStarting, setPaymentStarting] = useState(false);
    const [overduePaymentDialogOpen, setOverduePaymentDialogOpen] = useState(false);
    const [overduePaymentMethods, setOverduePaymentMethods] = useState<BillingPaymentMethod[]>([]);
    const [loadingOverduePaymentMethods, setLoadingOverduePaymentMethods] = useState(false);
    const overduePaymentStarted = useRef(false);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [licensing, history] = await Promise.all([
                fetchBillingLicensing(),
                fetchBillingPaymentHistory({ page_size: 10 }),
            ]);
            setData(licensing);
            setPaymentHistory(history.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load billing and licensing details.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    /* Razorpay and Cashfree script loading. Paypal and stripe do not require as they use redirect-based checkout flow. */
    useEffect(() => {
        const scripts = [
            { id: "razorpay-checkout", src: "https://checkout.razorpay.com/v1/checkout.js" },
            { id: "cashfree-checkout", src: "https://sdk.cashfree.com/js/v3/cashfree.js" },
        ];
        scripts.forEach(({ id, src }) => {
            if (document.getElementById(id)) return;
            const script = document.createElement("script");
            script.id = id;
            script.src = src;
            script.async = true;
            document.body.appendChild(script);
        });
    }, []);

    useEffect(() => {
        const success = searchParams.get("upgrade_success");
        const cancelled = searchParams.get("upgrade_cancelled");
        const billingId = searchParams.get("billing_id");
        const gatewayParam = searchParams.get("gateway");

        if (searchParams.get("setup_success") === "1") {
            setNotice("Card saved successfully.");
            router.replace("/admin/billing-licensing");
            setActiveTab("cards");
            return;
        }
        if (searchParams.get("setup_cancelled") === "1") {
            setNotice("Adding a card was cancelled.");
            router.replace("/admin/billing-licensing");
            setActiveTab("cards");
            return;
        }

        if (cancelled === "1") {
            setNotice("Upgrade payment was cancelled.");
            return;
        }

        if (success !== "1" || !billingId || !gatewayParam) return;

        const confirmFromCallback = async () => {
            try {
                if (gatewayParam === "stripe") {
                    const stripeSessionId = searchParams.get("stripe_session_id") || "";
                    if (!stripeSessionId) {
                        setError("Stripe callback is missing session id.");
                        return;
                    }
                    const result = await confirmBillingUpgrade({
                        billing_id: billingId,
                        gateway: "stripe",
                        stripe_session_id: stripeSessionId,
                    });
                    setNotice(result.message);
                } else if (gatewayParam === "paypal") {
                    const paypalOrderId = searchParams.get("token") || searchParams.get("paypal_order_id") || "";
                    const paypalPayerId = searchParams.get("PayerID") || searchParams.get("payer_id") || "";
                    if (!paypalOrderId || !paypalPayerId) {
                        setError("PayPal callback is missing order or payer information.");
                        return;
                    }
                    const result = await confirmBillingUpgrade({
                        billing_id: billingId,
                        gateway: "paypal",
                        paypal_order_id: paypalOrderId,
                        paypal_payer_id: paypalPayerId,
                    });
                    setNotice(result.message);
                } else if (gatewayParam === "razorpay" || gatewayParam === "cashfree") {
                    setNotice(`${gatewayParam === "razorpay" ? "Razorpay" : "Cashfree"} payment received. Waiting for payment confirmation.`);
                }
                await loadData();
                router.replace("/admin/billing-licensing");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to confirm upgrade payment.");
            }
        };

        void confirmFromCallback();
    }, [searchParams]);

    const currentPlan = data?.current_plan ?? null;
    const hasActiveEntitlement = Boolean(
        currentPlan && !["expired", "cancelled"].includes(currentPlan.status),
    );
    const isExpiredTrial = Boolean(currentPlan?.status === "expired" && currentPlan.is_trial);
    const plans = useMemo(() => data?.plans ?? [], [data]);
    const availableGateways = data?.available_gateways ?? { stripe: false, paypal: false, razorpay: false, cashfree: false };
    const enabledGateways = [
        availableGateways.stripe ? ("stripe" as const) : null,
        availableGateways.paypal ? ("paypal" as const) : null,
        availableGateways.razorpay ? ("razorpay" as const) : null,
        availableGateways.cashfree ? ("cashfree" as const) : null,
    ].filter(Boolean) as Array<"stripe" | "paypal" | "razorpay" | "cashfree">;

    useEffect(() => {
        if (enabledGateways.length === 1 && gateway !== enabledGateways[0]) {
            setGateway(enabledGateways[0]);
        }
    }, [enabledGateways.join(","), gateway]);

    const onCancelDowngrade = async () => {
        setError(null);
        setNotice(null);
        setCancellingDowngrade(true);
        try {
            const result = await cancelBillingDowngrade();
            setNotice(result.message);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to cancel downgrade.");
        } finally {
            setCancellingDowngrade(false);
        }
    };

    const onToggleAutoRenew = async (enabled: boolean) => {
        setError(null);
        setNotice(null);
        setTogglingAutoRenew(true);
        try {
            const result = await setAutoRenew(enabled);
            setNotice(result.message);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update auto-renewal setting.");
        } finally {
            setTogglingAutoRenew(false);
        }
    };

    const onUpgrade = async (plan: SaasPlanOption) => {
        setError(null);
        setNotice(null);

        const isDowngrade = Boolean(hasActiveEntitlement && currentPlan && plan.price_monthly < currentPlan.price_monthly);
        if (isDowngrade) {
            setUpgradingPlanId(plan.id);
            try {
                const result = await requestBillingDowngrade(plan.id);
                setNotice(result.message);
                await loadData();
            } catch (err) {
                setError(getApiErrorMessage(err, "Failed to schedule downgrade."));
            } finally {
                setUpgradingPlanId(null);
            }
            return;
        }

        setUpgradingPlanId(plan.id);
        try {
            const selectedGateway = availableGateways[gateway] ? gateway : enabledGateways[0];
            if (!selectedGateway) {
                setError("Selected payment gateway is not enabled by superadmin.");
                return;
            }
            setPaymentStarting(true);
            const res = await initiateBillingUpgrade({
                new_plan_id: plan.id,
                gateway: selectedGateway,
                billing_cycle: billingCycle,
            });

            if (!res.payment_required) {
                setNotice(res.message || "Plan upgraded successfully.");
                await loadData();
                return;
            }

            if (res.redirect_url) {
                window.location.href = res.redirect_url;
                return;
            }

            if (res.gateway === "razorpay" && res.razorpay_order_id && res.razorpay_key_id) {
                if (!window.Razorpay) {
                    setError("Razorpay checkout is unavailable. Please reload and try again.");
                    return;
                }
                const checkout = new window.Razorpay({
                    key: res.razorpay_key_id,
                    amount: Math.round(res.prorated_charge * 100),
                    currency: res.currency,
                    name: "StreamTVDepot",
                    description: `Subscription ${plan.name}`,
                    order_id: res.razorpay_order_id,
                    handler: async () => {
                        setNotice("Razorpay payment received. Waiting for confirmation.");
                        await loadData();
                    },
                });
                checkout.open();
                return;
            }

            if (res.gateway === "cashfree" && res.cashfree_payment_session_id) {
                if (!window.Cashfree) {
                    setError("Cashfree checkout is unavailable. Please reload and try again.");
                    return;
                }
                const cashfree = window.Cashfree({ mode: res.cashfree_mode === "live" ? "production" : "sandbox" });
                await cashfree.checkout({ paymentSessionId: res.cashfree_payment_session_id, redirectTarget: "_self" });
                return;
            }

            setError("Payment was initiated but no redirect URL was returned.");
        } catch (err) {
            // setError(err instanceof Error ? err.message : "Failed to initiate upgrade.");
            setError(getApiErrorMessage(err, "Failed to initiate upgrade."));
        } finally {
            setPaymentStarting(false);
            setUpgradingPlanId(null);
        }
    };

    const startOverduePayment = () => {
        if (!currentPlan) return;
        setOverduePaymentDialogOpen(false);
        void onUpgrade(currentPlan);
    };

    useEffect(() => {
        if (!overduePaymentDialogOpen) return;
        setLoadingOverduePaymentMethods(true);
        setError(null);
        void listBillingPaymentMethods()
            .then(setOverduePaymentMethods)
            .catch((err) => setError(err instanceof Error ? err.message : "Could not load saved cards."))
            .finally(() => setLoadingOverduePaymentMethods(false));
    }, [overduePaymentDialogOpen]);

    useEffect(() => {
        const shouldPayOverdue = searchParams.get("pay_overdue") === "1";
        const isOverdue = currentPlan?.status === "past_due" || currentPlan?.status === "grace_period";
        if (!shouldPayOverdue || !isOverdue || !currentPlan || overduePaymentStarted.current) return;

        overduePaymentStarted.current = true;
        router.replace("/admin/billing-licensing");
        if (availableGateways.stripe) {
            setOverduePaymentDialogOpen(true);
        } else {
            void onUpgrade(currentPlan);
        }
    // The query flag is removed before the payment-method choice opens, preventing a repeat on rerender.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableGateways.stripe, currentPlan, router, searchParams]);

    return (
        <div className="p-6 space-y-6">
            <Dialog
                open={Boolean(error || notice || paymentStarting)}
                onOpenChange={(open) => {
                    if (!open && !paymentStarting) {
                        setError(null);
                        setNotice(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 mb-4">
                            {error ? <AlertTriangle className="text-red-400" size={18} /> : paymentStarting ? <Loader2 className="animate-spin text-primary" size={18} /> : <CheckCircle2 className="text-emerald-400" size={18} />}
                            {error ? "Payment or Billing error" : paymentStarting ? "Starting secure payment" : "Billing update"}
                        </DialogTitle>
                        <DialogDescription className={error ? "text-red-300 mt-4" : "text-emerald-300 mt-4"}>
                            {error || (paymentStarting ? "Opening the payment checkout..." : notice)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end">
                        <Button
                        type="button"
                        className="h-8"
                        disabled={paymentStarting}
                        onClick={() => {
                            setError(null);
                            setNotice(null);
                        }}
                        >
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={overduePaymentDialogOpen} onOpenChange={setOverduePaymentDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Choose a payment method</DialogTitle>
                        <DialogDescription>
                            Pay the outstanding renewal for {currentPlan?.name}. You can use a saved card or enter a new card securely.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {loadingOverduePaymentMethods ? (
                            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading saved cards...</div>
                        ) : overduePaymentMethods.map((method) => (
                            <Button key={method.id} type="button" variant="outline" className="h-11 w-full justify-between" onClick={startOverduePayment}>
                                <span className="flex items-center gap-2"><CreditCard size={16} /> {method.brand} ending in {method.last4}</span>
                                <span className="text-xs text-muted-foreground">Use saved card</span>
                            </Button>
                        ))}
                        <Button type="button" className="h-11 w-full gap-2" onClick={startOverduePayment}>
                            <Plus size={16} /> Use a new card
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div>
                <h1 className="text-xl font-bold text-foreground">Billing and Licensing</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Manage your subscription, review plan limits, and buy or upgrade instantly.
                </p>
            </div>

            <div className="inline-flex rounded-lg border border-border bg-secondary/25 p-1">
                <button
                    onClick={() => setActiveTab("subscription")}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "subscription" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                    Subscription
                </button>
                <button
                    onClick={() => setActiveTab("cards")}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                    Saved Cards
                </button>
            </div>

            {activeTab === "cards" ? (
                <SavedCardsPanel />
            ) : (
            <>
            {notice && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-emerald-300 border border-emerald-500/20 bg-emerald-500/8">
                    <CheckCircle2 size={14} /> {notice}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {loading ? (
                <SubscriptionSkeleton />
            ) : (
                <div className="space-y-6">
                    {/* Current Subscription Section */}
                    <section className="rounded-xl border border-border bg-card p-6 space-y-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Subscription</p>
                                <h2 className="text-md font-semibold text-foreground mt-1">
                                    {currentPlan ? (isExpiredTrial ? "Trial ended" : `${currentPlan.name}${hasActiveEntitlement ? "" : " (previous plan)"}`) : "No active plan assigned"}
                                </h2>
                                {currentPlan?.sub_text && (
                                    <p className="text-sm text-muted-foreground mt-1">{currentPlan.sub_text}</p>
                                )}
                            </div>
                            {currentPlan && (
                                <div className="text-right min-w-[180px]">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{currentPlan.billing_cycle}</p>
                                    <p className="text-md font-bold text-foreground">
                                        {money(cyclePrice(currentPlan, currentPlan.billing_cycle) ?? currentPlan.price_monthly, currentPlan.currency)}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-border bg-secondary/25 px-4 py-3">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Current Plan</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                    {currentPlan?.name ?? "Not Assigned"}
                                </p>
                            </div>
                            <div className="rounded-xl border border-border bg-secondary/25 px-4 py-3">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                    {currentPlan?.status === "past_due" || currentPlan?.status === "grace_period" ? "Grace Period Ends" : hasActiveEntitlement ? "Renewal Date" : "Ended On"}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                    {formatLocalDateTime(
                                        currentPlan?.status === "past_due" || currentPlan?.status === "grace_period"
                                            ? currentPlan?.grace_period_ends_at
                                            : currentPlan?.service_period_ends_at ?? currentPlan?.expires_at,
                                    )}
                                </p>
                            </div>
                            <div className="rounded-xl border border-border bg-secondary/25 px-4 py-3">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Auto Renew</p>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                    <p className={`text-sm font-semibold ${hasActiveEntitlement && currentPlan?.auto_renew ? "text-emerald-400" : "text-muted-foreground"}`}>
                                        {hasActiveEntitlement && currentPlan?.auto_renew ? "Enabled" : "Disabled"}
                                    </p>
                                    {currentPlan && hasActiveEntitlement && (
                                        <button
                                            onClick={() => void onToggleAutoRenew(!currentPlan.auto_renew)}
                                            disabled={togglingAutoRenew}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                currentPlan.auto_renew
                                                    ? "border-emerald-500 bg-emerald-500"
                                                    : "border-border bg-secondary"
                                            }`}
                                            title={currentPlan.auto_renew ? "Disable auto-renewal" : "Enable auto-renewal"}
                                        >
                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${currentPlan.auto_renew ? "translate-x-4" : "translate-x-0"}`} />
                                        </button>
                                    )}
                                </div>
                                {hasActiveEntitlement && !currentPlan?.auto_renew && (
                                    <p className="text-[11px] text-amber-400/80 mt-1">7-day grace period on expiry</p>
                                )}
                            </div>
                        </div>

                        {currentPlan ? (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Status</p>
                                        <p className="font-medium text-foreground capitalize">{isExpiredTrial ? "Trial ended" : currentPlan.status}</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Service Started</p>
                                        <p className="font-medium text-foreground">{formatLocalDateTime(currentPlan.service_period_started_at ?? currentPlan.started_at)}</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Service Expired</p>
                                        <p className="font-medium text-foreground">{formatLocalDateTime(currentPlan.service_period_ends_at ?? currentPlan.expires_at)}</p>
                                    </div>
                                </div>

                                {currentPlan.pending_downgrade_plan_name && (
                                    <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
                                        <div className="flex items-start gap-2 text-sm text-amber-300">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                            <span>
                                                <span className="font-semibold">Downgrade scheduled:</span>{" "}
                                                Your plan will switch to{" "}
                                                <span className="font-semibold">{currentPlan.pending_downgrade_plan_name}</span>{" "}
                                                at the end of the current billing period
                                                {currentPlan.expires_at ? ` (${formatLocalDateTime(currentPlan.expires_at)})` : ""}.
                                                Your current plan remains fully active until then.
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => void onCancelDowngrade()}
                                            disabled={cancellingDowngrade}
                                            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {cancellingDowngrade ? "Cancelling..." : "Cancel downgrade"}
                                        </button>
                                    </div>
                                )}

                                {Array.isArray(currentPlan.key_features) && currentPlan.key_features.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Included Features</p>
                                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-foreground/85">
                                            {currentPlan.key_features.slice(0, 8).map((feature) => (
                                                <li key={feature} className="flex items-center gap-2">
                                                    <CheckCircle2 size={14} className="text-emerald-400" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Your account does not have an active SaaS subscription yet. Choose a plan below to buy.
                            </p>
                        )}
                        {currentPlan && !hasActiveEntitlement && (
                            <p className="text-sm text-muted-foreground">
                                {isExpiredTrial
                                    ? `Your ${currentPlan.name} ended on ${formatLocalDateTime(currentPlan.service_period_ends_at ?? currentPlan.expires_at)}. Choose a paid plan to continue.`
                                    : `Your ${currentPlan.name} ended on ${formatLocalDateTime(currentPlan.service_period_ends_at ?? currentPlan.expires_at)}. Select a plan below to restore access.`}
                            </p>
                        )}
                        {(currentPlan?.status === "past_due" || currentPlan?.status === "grace_period") && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
                                <Clock size={16} className="mt-0.5 shrink-0" />
                                <p>
                                    <span className="font-semibold">Grace period active.</span>{" "}
                                    Your {currentPlan.name} service period ended on {formatLocalDateTime(currentPlan.service_period_ends_at ?? currentPlan.expires_at)}.
                                    {currentPlan.grace_period_ends_at ? ` Access continues until ${formatLocalDateTime(currentPlan.grace_period_ends_at)}.` : ""}
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Available Plans Section */}
                    <section id="available-plans" className="rounded-xl border border-border bg-card p-6 space-y-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Plans</p>
                                <h2 className="text-md font-semibold text-foreground mt-1">Available Plans</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                {enabledGateways.length > 0 ? (
                                    <div className="inline-flex rounded-lg border border-border p-1 bg-secondary/25">
                                        {enabledGateways.includes("stripe") && (
                                            <button
                                                onClick={() => setGateway("stripe")}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${gateway === "stripe"
                                                        ? "bg-primary/15 text-primary"
                                                        : "text-muted-foreground hover:text-foreground"
                                                    }`}
                                            >
                                                Stripe
                                            </button>
                                        )}
                                        {enabledGateways.includes("paypal") && (
                                            <button
                                                onClick={() => setGateway("paypal")}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${gateway === "paypal"
                                                        ? "bg-primary/15 text-primary"
                                                        : "text-muted-foreground hover:text-foreground"
                                                    }`}
                                            >
                                                PayPal
                                            </button>
                                        )}
                                        {enabledGateways.includes("razorpay") && (
                                            <button onClick={() => setGateway("razorpay")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${gateway === "razorpay" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>Razorpay</button>
                                        )}
                                        {enabledGateways.includes("cashfree") && (
                                            <button onClick={() => setGateway("cashfree")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${gateway === "cashfree" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>Cashfree</button>
                                        )}
                                    </div>
                                ) : (
                                    <span className="rounded-lg border border-border bg-secondary/25 px-3 py-1.5 text-xs text-muted-foreground">
                                        No payment gateway is currently enabled by superadmin
                                    </span>
                                )}
                                <div className="inline-flex rounded-lg border border-border bg-secondary/25 p-1">
                                    {(["monthly", "quarterly", "yearly"] as const).map((cycle) => (
                                        <button
                                            key={cycle}
                                            type="button"
                                            onClick={() => setBillingCycle(cycle)}
                                            className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${billingCycle === cycle ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                        >
                                            {cycle}
                                        </button>
                                    ))}
                                </div>
                                <BadgeDollarSign size={18} className="text-primary" />
                            </div>
                        </div>

                        {plans.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No plans are currently available.</p>
                        ) : (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {plans.map((plan: SaasPlanOption) => {
                                    const isCurrent = Boolean(plan.is_current_plan);
                                    const isPendingDowngrade = Boolean(currentPlan?.pending_downgrade_plan_id === plan.id);
                                    const isDowngrade = Boolean(currentPlan && plan.price_monthly < currentPlan.price_monthly && !isCurrent);
                                    const canUpgrade = Boolean(plan.can_upgrade);
                                    const canDowngrade = Boolean(plan.can_downgrade);
                                    const selectedPrice = cyclePrice(plan, billingCycle);
                                    const isBusy = upgradingPlanId === plan.id;
                                    const noActivePlan = !hasActiveEntitlement;
                                    const canAct = selectedPrice !== null && (noActivePlan ? !isCurrent : (canUpgrade || canDowngrade || isDowngrade) && !isPendingDowngrade);
                                    const actionLabel = isCurrent
                                        ? "Current"
                                        : isPendingDowngrade
                                            ? "Downgrade Pending"
                                            : (!canAct ? "Not Available" : null);

                                    return (
                                    <div
                                        key={plan.id}
                                        className={`rounded-xl border p-4 flex flex-col ${isCurrent
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-border bg-secondary/20"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                                                    {isCurrent && (
                                                        <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                                                            Current Plan
                                                        </span>
                                                    )}
                                                </div>
                                                {plan.sub_text && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">{plan.sub_text}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                {actionLabel && (
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mb-1 ${isCurrent
                                                            ? "border-primary/40 bg-primary/15 text-primary"
                                                            : "border-border bg-muted text-muted-foreground"
                                                        }`}
                                                    >
                                                        {actionLabel}
                                                    </span>
                                                )}
                                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{billingCycle}</p>
                                                <p className="text-base font-bold text-foreground">
                                                    {selectedPrice === null ? "Not offered" : money(selectedPrice, plan.currency)}
                                                </p>
                                            </div>
                                        </div>

                                        {plan.description && (
                                            <p className="text-sm text-muted-foreground mt-3">{plan.description}</p>
                                        )}

                                        {Array.isArray(plan.key_features) && plan.key_features.length > 0 && (
                                            <ul className="space-y-1 mt-3">
                                                {plan.key_features.slice(0, 4).map((feature) => (
                                                    <li key={feature} className="flex items-center gap-2 text-xs text-foreground/85">
                                                        <CircleDollarSign size={12} className="text-emerald-400" />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}

                                        <div className="mt-auto pt-4 flex justify-end">
                                            <button
                                                disabled={isCurrent || isPendingDowngrade || !canAct || isBusy}
                                                onClick={() => void onUpgrade(plan)}
                                                className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                                    isDowngrade
                                                        ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/30"
                                                        : isCurrent || isPendingDowngrade || !canAct
                                                            ? "bg-primary/15 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                                                }`}
                                            >
                                                {isBusy ? (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Loader2 size={12} className="animate-spin" />
                                                        Processing...
                                                    </span>
                                                ) : isCurrent ? (
                                                    "Current Plan"
                                                ) : isPendingDowngrade ? (
                                                    "Downgrade Pending"
                                                ) : noActivePlan ? (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <ShoppingCart size={12} />
                                                        Buy Now
                                                    </span>
                                                ) : isDowngrade ? (
                                                    "Downgrade"
                                                ) : (
                                                    "Upgrade"
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}
                    </section>

                    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Transactions</p>
                            <h2 className="text-md font-semibold text-foreground mt-1">Payment History</h2>
                        </div>
                        {paymentHistory.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No billing transactions yet.</p>
                        ) : (
                            <div className="divide-y divide-border rounded-lg border border-border">
                                {paymentHistory.map((payment) => (
                                    <div key={payment.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground">{payment.invoice_number} {payment.plan_name ? `- ${payment.plan_name}` : ""}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {payment.paid_at ? `Paid ${formatLocalDateTime(payment.paid_at)}` : `Created ${formatLocalDateTime(payment.created_at)}`}
                                                {payment.transaction_id ? ` | ${payment.transaction_id}` : ""}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="font-semibold text-foreground">{money(payment.amount, payment.currency)}</p>
                                            <p className={`mt-0.5 text-xs font-medium capitalize ${payment.status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>{payment.status}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
            </>
            )}
        </div>
    );
}
