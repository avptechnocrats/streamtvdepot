"use client";

/**
 * /checkout — Full-page checkout
 *
 * URL params (all via ?searchParams):
 *   type       "rent" | "ppv" | "subscription"
 *   contentId  video/channel UUID (required for rent + ppv)
 *   planId     pre-selected plan UUID (optional; if omitted the user picks)
 *   returnTo   URL to redirect to on success (default: "/" )
 *
 * Layout:
 *   Left  — content / plan details panel (poster, title, access info, price)
 *   Right — plan picker (if needed) + gateway picker + payment form
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Elements,
    PaymentElement,
    useElements,
    useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
    ChevronLeft,
    CreditCard,
    ShieldCheck,
    Loader2,
    Clock,
    Monitor,
    Download,
    Check,
    Film,
    Globe,
    Star,
    AlertCircle,
    Radio,
    Play,
    Lock,
    Tv,
    Infinity,
    Calendar,
    Zap,
    BadgeCheck,
} from "lucide-react";

import { getVideo, type VideoOut } from "@/lib/services/videos";
import { getLiveTvChannel, type LiveTvChannelOut } from "@/lib/services/live-tv";
import { getPpvEvent } from "@/lib/services/ppv-events";
import {
    fetchSubscriptionPlans,
    type SubscriptionPlan,
} from "@/lib/services/subscription-plans";
import {
    fetchGatewayConfig,
    initiateCheckout,
    initiateUpgrade,
    confirmCheckout,
    fetchMySubscriptions,
    fetchSavedPaymentMethods,
    scheduleDowngrade,
    validateCoupon,
    createPaymentMethodSetupIntent,
    fetchCheckoutTaxQuote,
    type GatewayConfig,
    type CheckoutInitiateResult,
    type CheckoutTaxQuote,
    type UpgradeInitiateResult,
    type UserPurchase,
    type SavedPaymentMethod,
} from "@/lib/services/checkout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { getUserCountry } from "@/lib/services/geolocation";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckoutType = "rent" | "ppv" | "subscription";
type CheckoutMode = "checkout" | "upgrade";
type Gateway = "stripe" | "paypal" | "razorpay" | "cashfree";

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
        Cashfree?: (options: { mode: string }) => { checkout: (options: Record<string, unknown>) => Promise<{ error?: { message?: string }; paymentDetails?: { paymentMessage?: string } }> };
    }
}

function loadPaymentScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Payment SDK could not be loaded"));
        document.body.appendChild(script);
    });
}

type PageStep =
    | "loading"
    | "plan-pick"
    | "trial-choice"
    | "add-payment-method"
    | "gateway-pick"
    | "stripe"
    | "paypal-redirect"
    | "razorpay"
    | "cashfree"
    | "downgrade-confirm"
    | "success"
    | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string | null {
    if (!seconds) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function accessPeriodLabel(plan: SubscriptionPlan): string {
    if (plan.restriction_hours_per_day != null)
        return `${plan.restriction_hours_per_day}h / day`;
    if (plan.restriction_days != null)
        return `${plan.restriction_days}-day access`;
    if (plan.restriction_months != null)
        return `${plan.restriction_months}-month access`;
    const cycleMap: Record<string, string> = {
        monthly: "Monthly",
        yearly: "Yearly",
        daily: "Daily",
    };
    return cycleMap[plan.billing_cycle] ?? plan.billing_cycle;
}

function getLocalizedPlanPrice(
    plan: SubscriptionPlan,
    userCountry: string | null,
): { price: number; currency: string } {
    if (!userCountry || !Array.isArray(plan.country_pricing) || plan.country_pricing.length === 0) {
        return { price: plan.price, currency: plan.currency };
    }
    const countryPrice = plan.country_pricing.find(
        (cp) => cp.country.toUpperCase() === userCountry.toUpperCase(),
    );
    if (!countryPrice) {
        return { price: plan.price, currency: plan.currency };
    }
    return { price: countryPrice.price, currency: countryPrice.currency };
}

function isFreePlan(plan: SubscriptionPlan, userCountry: string | null): boolean {
    return getLocalizedPlanPrice(plan, userCountry).price <= 0;
}

function hasCashfreePhone(phone: string | null | undefined): boolean {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
}

const TRIAL_PAYMENT_METHOD_REQUIRED_DETAIL = "Add a payment method before starting this trial";

function planHasTrialChoice(
    plan: SubscriptionPlan,
    type: CheckoutType,
    mode: CheckoutMode,
    userCountry: string | null,
): boolean {
    return (
        type === "subscription"
        && mode === "checkout"
        && plan.trial_days > 0
        && !isFreePlan(plan, userCountry)
    );
}

function isDowngradeSelection(
    currentPlan: SubscriptionPlan | null,
    selectedPlan: SubscriptionPlan,
    userCountry: string | null,
): boolean {
    if (!currentPlan) return false;
    const currentPrice = getLocalizedPlanPrice(currentPlan, userCountry);
    const selectedPrice = getLocalizedPlanPrice(selectedPlan, userCountry);
    return selectedPrice.currency === currentPrice.currency && selectedPrice.price < currentPrice.price;
}

function planFeatures(plan: SubscriptionPlan) {
    const items: { icon: React.ReactNode; text: string }[] = [
        {
            icon: <Monitor size={14} />,
            text: `${plan.max_screens ?? 1} simultaneous screen${(plan.max_screens ?? 1) > 1 ? "s" : ""}`,
        },
    ];
    if (plan.can_download)
        items.push({
            icon: <Download size={14} />,
            text: `${plan.max_downloads ?? 0} offline download${(plan.max_downloads ?? 0) !== 1 ? "s" : ""}`,
        });
    if (plan.trial_days > 0)
        items.push({ icon: <Clock size={14} />, text: `${plan.trial_days}-day free trial` });
    if (plan.restriction_days != null)
        items.push({ icon: <Clock size={14} />, text: `${plan.restriction_days}-day rental window` });
    if (plan.restriction_months != null)
        items.push({ icon: <Clock size={14} />, text: `${plan.restriction_months}-month access` });
    if (plan.description)
        items.push({ icon: <Check size={14} />, text: plan.description });
    return items;
}

// ── Left panel — subscription plan details ──────────────────────────────────

function SubscriptionDetailPanel({ plan }: { plan: SubscriptionPlan | null }) {
    const { user } = useAuth();
    const billingMap: Record<string, string> = {
        monthly: "Monthly",
        yearly: "Yearly",
        daily: "Daily",
    };
    const billingCycleLabel = plan ? (billingMap[plan.billing_cycle] ?? plan.billing_cycle) : null;

    // Detect user country: prefer user profile country, fallback to browser locale
    const userCountry = useMemo(() => {
        // Priority 1: Use user's profile country if authenticated
        if (user?.country) {
            return user.country;
        }

        // Priority 2: Fallback to browser locale
        if (typeof navigator === "undefined") return null;
        try {
            const locale = new Intl.Locale(navigator.language);
            return locale.region ?? null; // "IN", "US", "GB", …
        } catch {
            return null;
        }
    }, [user?.country]);

    // Prefer country-specific pricing when available
    const localPricing = useMemo(() => {
        if (!plan || !userCountry || !Array.isArray(plan.country_pricing)) return null;
        return plan.country_pricing.find(
            (cp) => cp.country.toUpperCase() === userCountry.toUpperCase(),
        ) ?? null;
    }, [plan, userCountry]);

    const displayPrice = localPricing?.price ?? plan?.price ?? 0;
    const displayCurrency = localPricing?.currency ?? plan?.currency ?? "";
    const isLocalPrice = localPricing !== null;

    const stats: { icon: React.ReactNode; label: string; value: string }[] = plan
        ? [
              {
                  icon: <Monitor size={18} className="text-primary" />,
                  label: "Screens",
                  value: plan.max_screens
                      ? `${plan.max_screens} simultaneous`
                      : "1 screen",
              },
              {
                  icon: <Download size={18} className="text-primary" />,
                  label: "Downloads",
                  value: plan.can_download
                      ? `${plan.max_downloads ?? 0} downloads`
                      : "No downloads",
              },
              {
                  icon: <Calendar size={18} className="text-primary" />,
                  label: "Billing",
                  value: billingCycleLabel ?? "-",
              },
              ...(plan.trial_days > 0
                  ? [
                        {
                            icon: <Zap size={18} className="text-amber-400" />,
                            label: "Free trial",
                            value: `${plan.trial_days} days`,
                        },
                    ]
                  : []),
              ...(plan.restriction_days != null
                  ? [
                        {
                            icon: <Clock size={18} className="text-primary" />,
                            label: "Access window",
                            value: `${plan.restriction_days} days`,
                        },
                    ]
                  : []),
              ...(plan.restriction_months != null
                  ? [
                        {
                            icon: <Clock size={18} className="text-primary" />,
                            label: "Access window",
                            value: `${plan.restriction_months} months`,
                        },
                    ]
                  : []),
          ]
        : [];

    return (
        <div className="flex flex-col gap-8">
            {/* Hero header */}
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 flex flex-col gap-5">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                        <Tv size={26} className="text-primary" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                            Subscription Plan
                        </p>
                        {plan ? (
                            <h2 className="text-2xl font-black text-foreground leading-tight">
                                {plan.name}
                            </h2>
                        ) : (
                            <div className="h-7 w-40 bg-secondary/60 rounded animate-pulse" />
                        )}
                    </div>
                </div>

                {plan?.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {plan.description}
                    </p>
                )}

                {/* Price display */}
                {plan && (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-end gap-1.5">
                            {displayPrice === 0 ? (
                                <span className="text-4xl font-black text-foreground">Free</span>
                            ) : (
                                <>
                                    <span className="text-sm font-semibold text-muted-foreground self-end mb-1.5 leading-none">
                                        {displayCurrency}
                                    </span>
                                    <span className="text-4xl font-black text-foreground leading-none tabular-nums">
                                        {displayPrice.toFixed(2)}
                                    </span>
                                    <span className="text-sm text-muted-foreground mb-1 leading-none">
                                        / {billingMap[plan.billing_cycle] ?? plan.billing_cycle}
                                    </span>
                                </>
                            )}
                        </div>
                        {isLocalPrice && (
                            <p className="text-xs text-muted-foreground">
                                Local pricing for your region
                                {plan.price !== displayPrice && (
                                    <span className="ml-1 text-muted-foreground/60">
                                        (default: {plan.currency} {plan.price.toFixed(2)})
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Stats grid */}
            {stats.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {stats.map((s, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 rounded-xl border border-border/40 bg-secondary/30 p-4"
                        >
                            <span className="shrink-0 mt-0.5">{s.icon}</span>
                            <div className="min-w-0">
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                    {s.label}
                                </p>
                                <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                                    {s.value}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* What's included checklist */}
            {plan && (
                <div className="rounded-xl border border-border/40 bg-secondary/30 p-5 space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Everything included
                    </p>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3 text-sm text-foreground/80">
                            <BadgeCheck size={17} className="text-primary shrink-0 mt-0.5" />
                            Unlimited access to the full content library
                        </li>
                        {plan.max_screens && plan.max_screens > 1 && (
                            <li className="flex items-start gap-3 text-sm text-foreground/80">
                                <BadgeCheck size={17} className="text-primary shrink-0 mt-0.5" />
                                Watch on up to {plan.max_screens} devices simultaneously
                            </li>
                        )}
                        {plan.can_download && plan.max_downloads && plan.max_downloads > 0 && (
                            <li className="flex items-start gap-3 text-sm text-foreground/80">
                                <BadgeCheck size={17} className="text-primary shrink-0 mt-0.5" />
                                Download up to {plan.max_downloads} titles for offline viewing
                            </li>
                        )}
                        {plan.trial_days > 0 && (
                            <li className="flex items-start gap-3 text-sm text-foreground/80">
                                <Zap size={17} className="text-amber-400 shrink-0 mt-0.5" />
                                {plan.trial_days}-day free trial — no charge until it ends
                            </li>
                        )}
                        <li className="flex items-start gap-3 text-sm text-foreground/80">
                            <BadgeCheck size={17} className="text-primary shrink-0 mt-0.5" />
                            Cancel anytime, no hidden fees
                        </li>
                    </ul>
                </div>
            )}

            {/* Trust signals */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={14} className="text-primary shrink-0" />
                Secure, encrypted payment
            </div>
        </div>
    );
}

// ── Left panel — content details ─────────────────────────────────────────────

function ContentDetailPanel({
    type,
    video,
    channel,
    plan,
}: {
    type: CheckoutType;
    video: VideoOut | null;
    channel: LiveTvChannelOut | null;
    plan: SubscriptionPlan | null;
}) {
    const isContent = type === "rent" || type === "ppv";

    const title = video?.title ?? channel?.title ?? plan?.name ?? "";
    const description =
        video?.short_description ??
        video?.long_description ??
        channel?.description ??
        plan?.description ??
        null;

    const poster =
        video?.thumbnails.video_banner ??
        video?.thumbnails.video_h_thumbnail ??
        video?.thumbnails.video_w_thumbnail ??
        channel?.thumbnails.banner ??
        channel?.thumbnails.wide ??
        null;

    const accessLabel =
        type === "rent" ? "Rental" : type === "ppv" ? "Pay Per View" : "Subscription";

    const accentColor =
        type === "rent"
            ? "text-blue-400 bg-blue-400/10 border-blue-400/30"
            : type === "ppv"
                ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
                : "text-primary bg-primary/10 border-primary/30";

    return (
        <div className="flex flex-col gap-6">
            {/* Poster */}
            {poster ? (
                <div className="relative rounded-2xl overflow-hidden aspect-video bg-secondary shadow-2xl">
                    <img
                        src={poster}
                        alt={title}
                        className="w-full h-full object-cover"
                        width={640}
                        height={360}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {/* Access badge */}
                    <span
                        className={`absolute top-3 left-3 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border rounded-full ${accentColor}`}
                    >
                        {accessLabel}
                    </span>
                    {/* Live badge */}
                    {channel?.is_live && (
                        <span className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider bg-red-600 text-white rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl aspect-video bg-secondary/60 border border-border/40 flex items-center justify-center">
                    {type === "ppv" ? (
                        <Radio size={40} className="text-muted-foreground/30" />
                    ) : type === "rent" ? (
                        <Film size={40} className="text-muted-foreground/30" />
                    ) : (
                        <Play size={40} className="text-muted-foreground/30" />
                    )}
                </div>
            )}

            {/* Title + meta */}
            <div className="space-y-3">
                <h2 className="text-2xl font-black text-foreground leading-tight">{title}</h2>

                {description && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                        {description}
                    </p>
                )}

                {/* Video meta pills */}
                <div className="flex flex-wrap gap-2 pt-1">
                    {video?.language && video.language.length > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 border border-border/40 px-2.5 py-1 rounded-full">
                            <Globe size={11} /> {video.language.join(", ")}
                        </span>
                    )}
                    {video?.age_rating && (
                        <span className="text-xs border border-border/40 px-2 py-0.5 rounded text-muted-foreground">
                            {video.age_rating}
                        </span>
                    )}
                    {video?.rating != null && (
                        <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                            <Star size={11} fill="currentColor" />
                            {video.rating.toFixed(1)}
                        </span>
                    )}
                    {video?.duration && (
                        <span className="text-xs text-muted-foreground bg-secondary/60 border border-border/40 px-2.5 py-1 rounded-full">
                            {formatDuration(video.duration)}
                        </span>
                    )}
                    {(video?.hls_url || video?.hls_display_url) && (
                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-full">
                            HD
                        </span>
                    )}
                    {video?.content_classification && (
                        <span className="text-xs text-muted-foreground bg-secondary/60 border border-border/40 px-2.5 py-1 rounded-full">
                            {video.content_classification}
                        </span>
                    )}
                    {channel?.language && channel.language.length > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/60 border border-border/40 px-2.5 py-1 rounded-full">
                            <Globe size={11} /> {channel.language.join(", ")}
                        </span>
                    )}
                    {channel?.category && (
                        <span className="text-xs text-muted-foreground bg-secondary/60 border border-border/40 px-2.5 py-1 rounded-full">
                            {channel.category}
                        </span>
                    )}
                </div>
            </div>

            {/* What you get */}
            {plan && (
                <div className="rounded-xl border border-border/40 bg-secondary/30 p-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        What&apos;s included
                    </p>
                    <ul className="space-y-2.5">
                        {planFeatures(plan).map((f, i) => (
                            <li key={i} className="flex items-center gap-2.5 text-sm text-foreground/80">
                                <span className="text-primary shrink-0">{f.icon}</span>
                                {f.text}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Trust signals */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck size={14} className="text-primary shrink-0" />
                Secure, encrypted payment — cancel anytime
            </div>
        </div>
    );
}

// ── Stripe inner form ─────────────────────────────────────────────────────────

interface StripeFormProps {
    plan: SubscriptionPlan;
    paymentId: string;
    clientSecret: string;
    amount?: number;
    currency?: string;
    returnTo: string;
    userCountry: string | null;
    savedPaymentMethodId?: string | null;
    onSuccess: (invoiceNumber: string) => void;
    onError: (msg: string) => void;
}

function StripePaymentForm({ plan, paymentId, clientSecret, amount, currency, returnTo, userCountry, savedPaymentMethodId, onSuccess, onError }: StripeFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [submitting, setSubmitting] = useState(false);

    // Calculate country-specific pricing for display
    const localDisplayPrice = useMemo(() => {
        if (!userCountry || !Array.isArray(plan.country_pricing) || plan.country_pricing.length === 0) {
            return plan.price;
        }
        const countryPrice = plan.country_pricing.find(
            (cp) => cp.country.toUpperCase() === userCountry.toUpperCase(),
        );
        return countryPrice?.price ?? plan.price;
    }, [plan, userCountry]);

    const localDisplayCurrency = useMemo(() => {
        if (!userCountry || !Array.isArray(plan.country_pricing) || plan.country_pricing.length === 0) {
            return plan.currency;
        }
        const countryPrice = plan.country_pricing.find(
            (cp) => cp.country.toUpperCase() === userCountry.toUpperCase(),
        );
        return countryPrice?.currency ?? plan.currency;
    }, [plan, userCountry]);

    const payableAmount = amount ?? localDisplayPrice;
    const payableCurrency = currency ?? localDisplayCurrency;

    const handlePay = async () => {
        if (!stripe || (!savedPaymentMethodId && !elements)) return;
        setSubmitting(true);

        // Store payment_id before the potential 3DS redirect so the
        // /checkout/success page can retrieve it after the browser navigates back.
        sessionStorage.setItem("sv_stripe_payment_id", paymentId);
        sessionStorage.setItem("sv_checkout_return_to", returnTo);

        const confirmation = savedPaymentMethodId
            ? await stripe.confirmCardPayment(clientSecret, {
                payment_method: savedPaymentMethodId,
            })
            : await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/checkout/success?returnTo=${encodeURIComponent(returnTo)}`,
                },
                redirect: "if_required",
            });
        const { error, paymentIntent } = confirmation;

        if (error) {
            onError(error.message ?? "Payment failed. Please try again.");
            setSubmitting(false);
            return;
        }

        if (paymentIntent?.status === "succeeded") {
            try {
                const result = await confirmCheckout({
                    payment_id: paymentId,
                    stripe_payment_intent_id: paymentIntent.id,
                });
                onSuccess(result.invoice_number);
            } catch {
                onError(
                    "Payment was charged but we could not activate your plan. Please contact support.",
                );
            }
        } else {
            onError("Payment was not completed. Please try again.");
        }
        setSubmitting(false);
    };

    return (
        <div className="space-y-5">
            {savedPaymentMethodId ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-3">
                        <CreditCard size={20} className="text-primary shrink-0" />
                        <div>
                            <p className="font-semibold text-foreground">Saved card selected</p>
                            <p className="text-xs text-muted-foreground">
                                Your saved card will be used for this payment.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <PaymentElement options={{ layout: "tabs" }} />
                </div>
            )}
            <Button
                className="w-full h-12 text-base font-semibold gap-2"
                onClick={handlePay}
                disabled={!stripe || (!savedPaymentMethodId && !elements) || submitting}
            >
                {submitting ? (
                    <><Loader2 size={18} className="animate-spin" /> Processing…</>
                ) : (
                    <>
                        <Lock size={18} />
                        Pay {payableCurrency} {payableAmount.toFixed(2)}
                    </>
                )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
                Your payment is encrypted and secure.
            </p>
        </div>
    );
}

// ── Stripe payment-method setup (save a card with no charge, for trial start) ──

function PaymentMethodSetupForm({
    onSuccess,
    onError,
}: {
    onSuccess: () => void;
    onError: (msg: string) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [submitting, setSubmitting] = useState(false);

    const handleSave = async () => {
        if (!stripe || !elements) return;
        setSubmitting(true);

        const { error } = await stripe.confirmSetup({
            elements,
            redirect: "if_required",
        });

        if (error) {
            onError(error.message ?? "Could not save payment method. Please try again.");
            setSubmitting(false);
            return;
        }

        onSuccess();
        setSubmitting(false);
    };

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                <PaymentElement options={{ layout: "tabs" }} />
            </div>
            <Button
                className="w-full h-12 text-base font-semibold gap-2"
                onClick={handleSave}
                disabled={!stripe || !elements || submitting}
            >
                {submitting ? (
                    <><Loader2 size={18} className="animate-spin" /> Saving…</>
                ) : (
                    <><Lock size={18} /> Save Payment Method &amp; Start Trial</>
                )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
                You won&apos;t be charged now — your card is only billed once the trial ends.
            </p>
        </div>
    );
}

// ── Right panel — payment flow ────────────────────────────────────────────────

interface PaymentPanelProps {
    type: CheckoutType;
    mode: CheckoutMode;
    contentId: string | null;
    allowedPlanIds: string[] | null | undefined;
    initialPlanId: string | null;
    returnTo: string;
    userCountry: string | null;
    userCountryReady: boolean;
    onSuccess: (invoiceNumber: string, plan: SubscriptionPlan) => void;
    onPlanSelected: (plan: SubscriptionPlan) => void;
}

function PaymentPanel({
    type,
    mode,
    contentId,
    allowedPlanIds,
    initialPlanId,
    returnTo,
    userCountry,
    userCountryReady,
    onSuccess,
    onPlanSelected,
}: PaymentPanelProps) {
    const { user } = useAuth();
    const [step, setStep] = useState<PageStep>("loading");
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
    const [gwConfig, setGwConfig] = useState<GatewayConfig | null>(null);
    const [initResult, setInitResult] = useState<(CheckoutInitiateResult & {
        amount?: number | null;
        prorated_charge?: number | null;
        currency?: string | null;
    }) | null>(null);
    const [currentSubscription, setCurrentSubscription] = useState<UserPurchase | null>(null);
    const [currentSubscriptionPlan, setCurrentSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
    const [upgradeNotice, setUpgradeNotice] = useState<string>("");
    const [errorMsg, setErrorMsg] = useState("");
    const [couponCode, setCouponCode] = useState<string>("");
    const [couponValidating, setCouponValidating] = useState(false);
    const [couponValidation, setCouponValidation] = useState<{
        valid: boolean;
        message: string;
        discountAmount?: number;
        finalAmount?: number;
    } | null>(null);
    const [taxQuote, setTaxQuote] = useState<CheckoutTaxQuote | null>(null);
    const [skipTrial, setSkipTrial] = useState(false);
    const [pmClientSecret, setPmClientSecret] = useState<string | null>(null);
    const [pendingGateway, setPendingGateway] = useState<Gateway | undefined>(undefined);
    const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
    const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);
    const [savedPaymentMethodsLoading, setSavedPaymentMethodsLoading] = useState(false);

    const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
        const key = gwConfig?.stripe_publishable_key;
        return key ? loadStripe(key) : null;
    }, [gwConfig?.stripe_publishable_key]);

    const handleError = useCallback((msg: string) => {
        setErrorMsg(msg);
        setStep("error");
    }, []);

    useEffect(() => {
        if (!selectedPlan || mode === "upgrade") {
            setTaxQuote(null);
            return;
        }

        let cancelled = false;
        fetchCheckoutTaxQuote({
            plan_id: selectedPlan.id,
            coupon_code: couponValidation?.valid ? couponCode.trim() : undefined,
        })
            .then((quote) => {
                if (!cancelled) setTaxQuote(quote);
            })
            .catch(() => {
                if (!cancelled) setTaxQuote(null);
            });
        return () => { cancelled = true; };
    }, [couponCode, couponValidation?.valid, mode, selectedPlan]);

    // ── Boot: load plans + gateway config ───────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        if (!userCountryReady) return;

        const planType = type === "subscription" ? "subscription" : type === "ppv" ? "ppv" : "rent";
        const shouldLoadCurrentSubscription = type === "subscription";

        // Rental plans are content-specific; wait for the video's configured
        // plan IDs before fetching options so unrelated rent plans never flash.
        if (type === "rent" && allowedPlanIds === undefined) return;

        Promise.all([
            fetchSubscriptionPlans(planType, type === "rent" ? contentId ?? undefined : undefined),
            fetchGatewayConfig(),
            shouldLoadCurrentSubscription ? fetchMySubscriptions("subscription") : Promise.resolve([]),
        ])
            .then(([fetchedPlans, cfg, userSubscriptions]) => {
                if (cancelled) return;

                const configuredPlans = type === "rent" && allowedPlanIds
                    ? fetchedPlans.filter((p) => allowedPlanIds.includes(p.id))
                    : fetchedPlans;
                const active = configuredPlans.filter((p) => p.is_active);
                setPlans(active);
                setGwConfig(cfg);
                if (cfg.stripe_enabled) {
                    setSavedPaymentMethodsLoading(true);
                    fetchSavedPaymentMethods()
                        .then((result) => {
                            if (cancelled) return;
                            setSavedPaymentMethods(result.payment_methods.filter((method) => method.gateway === "stripe"));
                            setSelectedSavedPaymentMethodId(
                                result.payment_methods.find((method) => method.gateway === "stripe" && method.is_default)?.id ?? null,
                            );
                            setSavedPaymentMethodsLoading(false);
                        })
                        .catch(() => {
                            if (!cancelled) {
                                setSavedPaymentMethods([]);
                                setSavedPaymentMethodsLoading(false);
                            }
                        });
                } else {
                    setSavedPaymentMethods([]);
                    setSelectedSavedPaymentMethodId(null);
                    setSavedPaymentMethodsLoading(false);
                }
                setUpgradeNotice("");

                let activeCurrentSubscription: UserPurchase | null = null;
                let activeCurrentPlan: SubscriptionPlan | null = null;

                if (shouldLoadCurrentSubscription) {
                    const now = new Date();
                    const currentRows = userSubscriptions.filter((sub) => {
                        if (sub.status !== "active") return false;
                        const startsAt = new Date(sub.started_at);
                        if (Number.isNaN(startsAt.getTime()) || startsAt > now) return false;
                        if (!sub.expires_at) return true;
                        const expiresAt = new Date(sub.expires_at);
                        return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
                    });

                    activeCurrentSubscription = [...currentRows].sort((a, b) => {
                        const aTs = a.expires_at ? new Date(a.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
                        const bTs = b.expires_at ? new Date(b.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
                        return bTs - aTs;
                    })[0] ?? null;

                    activeCurrentPlan = activeCurrentSubscription
                        ? active.find((p) => p.id === activeCurrentSubscription!.plan_id) ?? null
                        : null;
                    setCurrentSubscription(activeCurrentSubscription);
                    setCurrentSubscriptionPlan(activeCurrentPlan);
                } else {
                    setCurrentSubscription(null);
                    setCurrentSubscriptionPlan(null);
                }

                if (active.length === 0) {
                    handleError(
                        `No ${planType === "ppv" ? "PPV" : planType === "rent" ? "rental" : "subscription"} plans available.`,
                    );
                    return;
                }

                // Pick plan: prefer URL-provided planId, then auto-select if only one
                const pre = initialPlanId ? active.find((p) => p.id === initialPlanId) ?? null : null;
                const resolved = pre ?? (active.length === 1 ? active[0] : null);

                if (resolved) {
                    setSelectedPlan(resolved);
                    onPlanSelected(resolved);

                    if (type === "subscription" && isDowngradeSelection(activeCurrentPlan, resolved, userCountry)) {
                        setStep("downgrade-confirm");
                        return;
                    }

                    if (isFreePlan(resolved, userCountry)) {
                        startPayment(resolved, undefined, cfg);
                    } else if (planHasTrialChoice(resolved, type, mode, userCountry)) {
                        setSkipTrial(false);
                        setStep("trial-choice");
                    } else if (!cfg.stripe_enabled && !cfg.paypal_enabled && !cfg.razorpay_enabled && !cfg.cashfree_enabled) {
                        handleError("Payments are disabled. Contact support for assistance.");
                    } else {
                        // Always show gateway-pick step so users can enter coupons
                        setStep("gateway-pick");
                    }
                } else {
                    setStep("plan-pick");
                }
            })
            .catch(() => handleError("Could not load payment options. Please try again."));

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedPlanIds, initialPlanId, type, userCountry, userCountryReady]);

    const startPayment = useCallback(
        async (
            plan: SubscriptionPlan,
            gateway?: Gateway,
            cfg?: GatewayConfig,
            paymentMethodIdOverride?: string | null,
        ) => {
            setStep("loading");
            try {
                if (mode === "upgrade") {
                    if (currentSubscriptionPlan) {
                        const currentPrice = getLocalizedPlanPrice(currentSubscriptionPlan, userCountry);
                        const selectedPrice = getLocalizedPlanPrice(plan, userCountry);
                        if (
                            selectedPrice.currency === currentPrice.currency
                            && selectedPrice.price <= currentPrice.price
                        ) {
                            setUpgradeNotice(
                                "This selection is not an upgrade. Downgrades and same-tier changes take effect at your next renewal.",
                            );
                            setSelectedPlan(plan);
                            onPlanSelected(plan);
                            setStep("plan-pick");
                            return;
                        }
                    }

                    const result: UpgradeInitiateResult = await initiateUpgrade({
                        new_plan_id: plan.id,
                        gateway,
                        country: userCountry ?? undefined,
                    });

                    if (!result.payment_required) {
                        setStep("success");
                        onSuccess("UPGRADE_APPLIED", plan);
                        return;
                    }

                    if (!result.payment_id || !result.gateway) {
                        handleError("Upgrade payment could not be initialized. Please try again.");
                        return;
                    }

                    setInitResult({
                        payment_id: result.payment_id,
                        gateway: result.gateway,
                        stripe_client_secret: result.stripe_client_secret,
                        paypal_order_id: result.paypal_order_id,
                        paypal_approval_url: result.paypal_approval_url,
                        razorpay_order_id: result.razorpay_order_id,
                        razorpay_key_id: result.razorpay_key_id,
                        cashfree_order_id: result.cashfree_order_id,
                        cashfree_payment_session_id: result.cashfree_payment_session_id,
                        cashfree_mode: result.cashfree_mode,
                        prorated_charge: result.prorated_charge,
                        currency: result.currency,
                    });
                    setStep(result.gateway === "stripe" ? "stripe" : result.gateway === "razorpay" ? "razorpay" : result.gateway === "cashfree" ? "cashfree" : "paypal-redirect");
                    setUpgradeNotice("");
                    return;
                }

                const result = await initiateCheckout({
                    plan_id: plan.id,
                    gateway,
                    payment_method_id: gateway === "stripe"
                        ? (paymentMethodIdOverride !== undefined
                            ? paymentMethodIdOverride ?? undefined
                            : selectedSavedPaymentMethodId ?? undefined)
                        : undefined,
                    content_id: contentId ?? undefined,
                    coupon_code: couponCode || undefined,
                    country: userCountry ?? undefined,
                    skip_trial: skipTrial,
                });
                setInitResult(result);

                if (result.gateway === "free") {
                    if (!result.invoice_number) {
                        handleError("Free subscription could not be activated. Please try again.");
                        return;
                    }
                    setStep("success");
                    onSuccess(result.invoice_number, plan);
                    return;
                }

                setStep(result.gateway === "stripe" ? "stripe" : result.gateway === "razorpay" ? "razorpay" : result.gateway === "cashfree" ? "cashfree" : "paypal-redirect");
            } catch (err: unknown) {
                const detail =
                    err &&
                        typeof err === "object" &&
                        "response" in err
                        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                        : null;

                if (typeof detail === "string" && detail.includes(TRIAL_PAYMENT_METHOD_REQUIRED_DETAIL)) {
                    setSelectedPlan(plan);
                    setPendingGateway(gateway);
                    try {
                        const setup = await createPaymentMethodSetupIntent();
                        if (setup.gateway === "stripe" && setup.stripe_client_secret) {
                            setPmClientSecret(setup.stripe_client_secret);
                            setStep("add-payment-method");
                            return;
                        }
                        handleError("This trial requires a payment method, but card setup isn't available right now.");
                    } catch {
                        handleError("Could not start payment method setup. Please try again.");
                    }
                    return;
                }

                const isDowngradeConflict =
                    typeof detail === "string" &&
                    /different plan|downgrade|next renewal|higher subscription/i.test(detail);

                if (isDowngradeConflict && plan.plan_type === "subscription") {
                    setSelectedPlan(plan);
                    setStep("downgrade-confirm");
                    return;
                }

                if (type === "subscription" && isDowngradeSelection(currentSubscriptionPlan, plan, userCountry)) {
                    setSelectedPlan(plan);
                    setStep("downgrade-confirm");
                    return;
                }

                handleError(detail ?? "Failed to initiate checkout. Please try again.");
            }
        },
        [contentId, couponCode, currentSubscriptionPlan, handleError, mode, onPlanSelected, onSuccess, selectedSavedPaymentMethodId, userCountry, skipTrial],
    );

    const handleValidateCoupon = useCallback(async () => {
        if (!selectedPlan || !couponCode.trim()) {
            setCouponValidation(null);
            return;
        }

        setCouponValidating(true);
        setCouponValidation(null);

        try {
            const planPrice = getLocalizedPlanPrice(selectedPlan, userCountry);
            const result = await validateCoupon({
                coupon_code: couponCode.trim(),
                plan_id: selectedPlan.id,
                amount: planPrice.price,
            });

            setCouponValidation({
                valid: result.valid,
                message: result.message,
                discountAmount: result.discount_amount,
                finalAmount: result.final_amount,
            });
        } catch (error) {
            setCouponValidation({
                valid: false,
                message: "Failed to validate coupon. Please try again.",
            });
        } finally {
            setCouponValidating(false);
        }
    }, [selectedPlan, couponCode, userCountry]);

    const handleApplyCoupon = useCallback(() => {
        if (!couponCode.trim()) return;
        handleValidateCoupon();
    }, [couponCode, handleValidateCoupon]);

    const handleRemoveCoupon = useCallback(() => {
        setCouponCode("");
        setCouponValidation(null);
    }, []);

    // Clear validation when coupon code is cleared
    useEffect(() => {
        if (!couponCode.trim()) {
            setCouponValidation(null);
        }
    }, [couponCode]);

    const handleSelectPlan = (plan: SubscriptionPlan) => {
        if (mode === "upgrade" && currentSubscriptionPlan) {
            const currentPrice = getLocalizedPlanPrice(currentSubscriptionPlan, userCountry);
            const selectedPrice = getLocalizedPlanPrice(plan, userCountry);
            if (selectedPrice.currency === currentPrice.currency && selectedPrice.price <= currentPrice.price) {
                setUpgradeNotice(
                    "This selection is not an upgrade. Downgrades and same-tier changes take effect at your next renewal.",
                );
                return;
            }
        }

        if (type === "subscription" && isDowngradeSelection(currentSubscriptionPlan, plan, userCountry)) {
            setSelectedPlan(plan);
            onPlanSelected(plan);
            setStep("downgrade-confirm");
            return;
        }

        setUpgradeNotice("");
        setSelectedPlan(plan);
        onPlanSelected(plan);

        if (isFreePlan(plan, userCountry)) {
            startPayment(plan, undefined, gwConfig ?? undefined);
            return;
        }

        if (planHasTrialChoice(plan, type, mode, userCountry)) {
            setSkipTrial(false);
            setStep("trial-choice");
            return;
        }

        if (!gwConfig) return;
        if (!gwConfig.stripe_enabled && !gwConfig.paypal_enabled && !gwConfig.razorpay_enabled && !gwConfig.cashfree_enabled) {
            handleError("Payments are disabled. Contact support for assistance.");
            return;
        }
        // Always show gateway-pick step so users can enter coupon code
        setStep("gateway-pick");
    };

    const handleStartTrial = useCallback(() => {
        if (!selectedPlan) return;
        setSkipTrial(false);
        startPayment(selectedPlan, undefined, gwConfig ?? undefined);
    }, [selectedPlan, gwConfig, startPayment]);

    const handleSubscribeNow = useCallback(() => {
        if (!selectedPlan) return;
        setSkipTrial(true);
        if (!gwConfig || (!gwConfig.stripe_enabled && !gwConfig.paypal_enabled && !gwConfig.razorpay_enabled && !gwConfig.cashfree_enabled)) {
            handleError("Payments are disabled. Contact support for assistance.");
            return;
        }
        setStep("gateway-pick");
    }, [selectedPlan, gwConfig, handleError]);

    const handlePayPalRedirect = () => {
        if (!initResult?.paypal_approval_url || !initResult.payment_id) return;
        sessionStorage.setItem("sv_paypal_payment_id", initResult.payment_id);
        sessionStorage.setItem("sv_checkout_return_to", returnTo);
        window.location.href = initResult.paypal_approval_url;
    };

    const handleRazorpay = async () => {
        if (!initResult?.razorpay_order_id || !initResult.razorpay_key_id || !selectedPlan) return;
        try {
            await loadPaymentScript("https://checkout.razorpay.com/v1/checkout.js");
            if (!window.Razorpay) throw new Error("Razorpay SDK is unavailable");
            const razorpay = new window.Razorpay({
                key: initResult.razorpay_key_id,
                amount: Math.round((initResult.amount ?? initResult.prorated_charge ?? 0) * 100),
                currency: initResult.currency,
                name: document.title,
                order_id: initResult.razorpay_order_id,
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    const result = await confirmCheckout({ payment_id: initResult.payment_id, ...response });
                    setStep("success");
                    onSuccess(result.invoice_number, selectedPlan);
                },
            });
            razorpay.open();
        } catch (error) {
            handleError(error instanceof Error ? error.message : "Could not start Razorpay checkout");
        }
    };

    const handleCashfree = async () => {
        if (!initResult?.cashfree_payment_session_id || !initResult.cashfree_mode || !selectedPlan) return;
        try {
            await loadPaymentScript("https://sdk.cashfree.com/js/v3/cashfree.js");
            if (!window.Cashfree) throw new Error("Cashfree SDK is unavailable");
            const cashfreeMode = initResult.cashfree_mode === "live" ? "production" : "sandbox";
            const cashfree = window.Cashfree({ mode: cashfreeMode });
            const result = await cashfree.checkout({ paymentSessionId: initResult.cashfree_payment_session_id, redirectTarget: "_modal" });
            if (result.error) throw new Error(result.error.message ?? "Cashfree payment failed");
            const confirmed = await confirmCheckout({ payment_id: initResult.payment_id, cashfree_order_id: initResult.cashfree_order_id ?? undefined });
            setStep("success");
            onSuccess(confirmed.invoice_number, selectedPlan);
        } catch (error) {
            handleError(error instanceof Error ? error.message : "Could not start Cashfree checkout");
        }
    };

    const cashfreePhoneMissing = !hasCashfreePhone(user?.phone);

    const handleScheduleDowngrade = useCallback(async (plan: SubscriptionPlan) => {
        setStep("loading");
        try {
            await scheduleDowngrade(plan.id);
            setStep("success");
            onSuccess("DOWNGRADE_SCHEDULED", plan);
        } catch (err: unknown) {
            const detail =
                err &&
                    typeof err === "object" &&
                    "response" in err
                    ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : null;
            handleError(detail ?? "Unable to schedule your plan change. Please try again.");
        }
    }, [handleError, onSuccess]);

    // ── Render ───────────────────────────────────────────────────────────────

    if (step === "loading") {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={36} className="animate-spin text-primary" />
            </div>
        );
    }

    if (step === "error") {
        return (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
                <AlertCircle size={40} className="text-destructive" />
                <p className="font-semibold text-foreground">Something went wrong</p>
                <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
                <Button variant="outline" onClick={() => window.location.reload()}>
                    Try again
                </Button>
            </div>
        );
    }

    if (step === "downgrade-confirm" && selectedPlan) {
        const nextBillingDate = currentSubscription?.expires_at
            ? new Date(currentSubscription.expires_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : null;

        return (
            <div className="space-y-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 text-amber-400" size={22} />
                    <div className="space-y-2">
                        <p className="font-semibold text-foreground">Downgrade at next billing cycle</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            You already have a higher subscription plan. Switching to <strong>{selectedPlan.name}</strong> will take effect
                            {nextBillingDate ? ` on ${nextBillingDate}` : " at your next billing cycle"}.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to proceed?
                        </p>
                    </div>
                </div>
                <div className="flex gap-3 pt-2">
                    <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                            window.location.href = returnTo || "/";
                        }}
                    >
                        Keep current plan
                    </Button>
                    <Button className="flex-1" onClick={() => void handleScheduleDowngrade(selectedPlan)}>
                        Confirm downgrade
                    </Button>
                </div>
            </div>
        );
    }

    if (step === "success" && selectedPlan) {
        const isTrialActivation =
            mode !== "upgrade" && !skipTrial && selectedPlan.trial_days > 0 && initResult?.gateway === "free";
        return (
            <div className="flex flex-col items-center gap-5 py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                    <ShieldCheck size={36} className="text-green-500" />
                </div>
                <div>
                    <p className="text-xl font-bold text-foreground">
                        {mode === "upgrade"
                            ? "Upgrade Successful!"
                            : isTrialActivation
                                ? "Trial Activated!"
                                : initResult?.gateway === "free" || initResult === null
                                    ? "Subscription Updated!"
                                    : "Payment Successful!"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                        {mode === "upgrade"
                            ? <>Your plan is now <strong>{selectedPlan.name}</strong>.</>
                            : isTrialActivation
                                ? <>Your {selectedPlan.trial_days}-day free trial of <strong>{selectedPlan.name}</strong> has started. Enjoy!</>
                                : initResult === null
                                    ? <>Your plan will change to <strong>{selectedPlan.name}</strong> at renewal.</>
                                    : <>You now have access to <strong>{selectedPlan.name}</strong>. Enjoy!</>}
                    </p>
                </div>
            </div>
        );
    }

    if (step === "trial-choice" && selectedPlan) {
        const localizedPrice = getLocalizedPlanPrice(selectedPlan, userCountry);
        const requiresCard = !!selectedPlan.trial_requires_active_payment_method;
        return (
            <div className="space-y-4">
                <OrderSummary
                    plan={selectedPlan}
                    userCountry={userCountry}
                    amount={localizedPrice.price}
                    currency={localizedPrice.currency}
                    mode={mode}
                />
                <h3 className="font-semibold text-foreground pt-2">How would you like to start?</h3>

                <button
                    onClick={handleStartTrial}
                    className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-primary/50 hover:border-primary bg-primary/5 hover:bg-primary/10 transition-all text-left"
                >
                    <Zap size={20} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-foreground">Start {selectedPlan.trial_days}-Day Free Trial</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {requiresCard
                                ? `We'll ask for a card, but you won't be charged until the trial ends. Then ${localizedPrice.currency} ${localizedPrice.price.toFixed(2)} / ${selectedPlan.billing_cycle}.`
                                : `No card required. After the trial, it's ${localizedPrice.currency} ${localizedPrice.price.toFixed(2)} / ${selectedPlan.billing_cycle} unless you cancel.`}
                        </p>
                    </div>
                </button>

                <button
                    onClick={handleSubscribeNow}
                    className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 bg-secondary/30 hover:bg-secondary/60 transition-all text-left"
                >
                    <CreditCard size={20} className="text-primary shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-foreground">Subscribe Now</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Skip the trial and pay {localizedPrice.currency} {localizedPrice.price.toFixed(2)} today to get started immediately.
                        </p>
                    </div>
                </button>
            </div>
        );
    }

    if (step === "add-payment-method" && pmClientSecret && stripePromise && selectedPlan) {
        return (
            <div className="space-y-5">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    This plan requires an active payment method to start the trial. Your card will only be
                    charged after the {selectedPlan.trial_days}-day trial ends.
                </div>
                <Elements
                    stripe={stripePromise}
                    options={{
                        clientSecret: pmClientSecret,
                        appearance: { theme: "night", labels: "floating" },
                    }}
                >
                    <PaymentMethodSetupForm
                        onSuccess={() => {
                            setPmClientSecret(null);
                            startPayment(selectedPlan, pendingGateway, gwConfig ?? undefined);
                        }}
                        onError={handleError}
                    />
                </Elements>
                <button
                    onClick={() => setStep("trial-choice")}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors w-full text-center"
                >
                    ← Back
                </button>
            </div>
        );
    }

    if (step === "plan-pick") {
        return (
            <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Choose a plan</h3>
                {mode === "upgrade" && upgradeNotice && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                        {upgradeNotice}
                    </div>
                )}
                {plans.map((plan) => (
                    (() => {
                        const currentPrice = currentSubscriptionPlan
                            ? getLocalizedPlanPrice(currentSubscriptionPlan, userCountry)
                            : null;
                        const selectedPrice = getLocalizedPlanPrice(plan, userCountry);
                        const blockedForUpgrade =
                            mode === "upgrade"
                            && currentPrice
                            && selectedPrice.currency === currentPrice.currency
                            && selectedPrice.price <= currentPrice.price;
                        return (
                            <button
                                key={plan.id}
                                onClick={() => handleSelectPlan(plan)}
                                className={`w-full text-left p-4 rounded-xl border-2 transition-all group ${blockedForUpgrade
                                    ? "border-border/40 bg-secondary/20 opacity-70"
                                    : "border-border/50 hover:border-primary/60 bg-secondary/30 hover:bg-secondary/60"
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                            {plan.name}
                                        </p>
                                        {plan.description && (
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {plan.description}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {accessPeriodLabel(plan)}
                                        </p>
                                        {blockedForUpgrade && (
                                            <p className="text-[11px] mt-1 text-amber-300">
                                                Downgrade at renewal only
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xl font-black text-foreground">
                                            {selectedPrice.currency} {selectedPrice.price.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })()
                ))}
            </div>
        );
    }

    if (step === "gateway-pick" && selectedPlan) {
        // Use backend initResult if available (includes coupon calculations), 
        // otherwise fall back to frontend-calculated localized pricing
        const localizedPrice = getLocalizedPlanPrice(selectedPlan, userCountry);
        const payableAmount = initResult?.prorated_charge ?? initResult?.amount ?? localizedPrice.price;
        const payableCurrency = initResult?.currency ?? localizedPrice.currency;
        return (
            <div className="space-y-4">
                {/* Order summary */}
                <OrderSummary
                    plan={selectedPlan}
                    userCountry={userCountry}
                    amount={payableAmount}
                    currency={payableCurrency}
                    mode={mode}
                    couponApplied={initResult?.coupon_applied}
                    originalAmount={initResult?.original_amount}
                    discountAmount={initResult?.discount_amount}
                    taxQuote={taxQuote}
                />

                {/* Coupon Code Field - MOVED HERE */}
                {!initResult?.coupon_applied && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Have a coupon code?</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={couponCode}
                                onChange={(e) => {
                                    setCouponCode(e.target.value.toUpperCase());
                                    // Clear validation when user edits the code
                                    if (couponValidation) {
                                        setCouponValidation(null);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && couponCode.trim() && !couponValidating) {
                                        handleApplyCoupon();
                                    }
                                }}
                                placeholder="Enter coupon code"
                                disabled={couponValidating}
                                className="flex-1 h-10 px-3 rounded-lg border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={handleApplyCoupon}
                                disabled={!couponCode.trim() || couponValidating}
                                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                            >
                                {couponValidating ? (
                                    <><Loader2 size={14} className="animate-spin" /></>
                                ) : (
                                    'Apply'
                                )}
                            </button>
                            {couponValidation && (
                                <button
                                    type="button"
                                    onClick={handleRemoveCoupon}
                                    className="h-10 px-4 rounded-lg bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                        {couponValidation && (
                            <div className={`text-xs rounded-lg px-3 py-2 ${
                                couponValidation.valid
                                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                    : "bg-red-500/10 text-red-500 border border-red-500/20"
                            }`}>
                                <p className="font-medium flex items-center gap-1">
                                    {couponValidation.valid ? <Check size={14} /> : <AlertCircle size={14} />}
                                    {couponValidation.message}
                                </p>
                                {couponValidation.valid && couponValidation.discountAmount && couponValidation.finalAmount && (
                                    <p className="mt-1">
                                        Save {getLocalizedPlanPrice(selectedPlan, userCountry).currency} {couponValidation.discountAmount.toFixed(2)} 
                                        {" • "}
                                        Final: {getLocalizedPlanPrice(selectedPlan, userCountry).currency} {couponValidation.finalAmount.toFixed(2)}
                                    </p>
                                )}
                            </div>
                        )}
                        {!couponValidation && (
                            <p className="text-xs text-muted-foreground">
                                {couponCode ? 'Click Apply to validate your coupon' : 'Enter and apply coupon before selecting payment method'}
                            </p>
                        )}
                    </div>
                )}

                <h3 className="font-semibold text-foreground pt-2">Choose payment method</h3>
                {gwConfig?.stripe_enabled && (
                    <div className="space-y-2">
                        {savedPaymentMethodsLoading && (
                            <div className="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
                                <Loader2 size={16} className="animate-spin" />
                                Checking saved cards…
                            </div>
                        )}
                        {!savedPaymentMethodsLoading && savedPaymentMethods.map((method) => (
                            <button
                                key={method.id}
                                onClick={() => {
                                    setSelectedSavedPaymentMethodId(method.id);
                                    startPayment(selectedPlan, "stripe", undefined, method.id);
                                }}
                                disabled={couponValidating || (couponCode && (!couponValidation || !couponValidation.valid))}
                                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 bg-secondary/30 hover:bg-secondary/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-secondary/30"
                            >
                                <CreditCard size={20} className="text-primary shrink-0" />
                                <div className="min-w-0 flex-1 text-left">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-semibold text-foreground truncate">
                                            {method.brand ? method.brand.toUpperCase() : "Card"} ending in {method.last4}
                                        </p>
                                        {method.is_default && (
                                            <span className="shrink-0 text-xs font-semibold text-primary">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Use saved card{method.exp_month && method.exp_year ? ` · Expires ${method.exp_month}/${method.exp_year}` : ""}
                                    </p>
                                </div>
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                setSelectedSavedPaymentMethodId(null);
                                startPayment(selectedPlan, "stripe", undefined, null);
                            }}
                            disabled={couponValidating || (couponCode && (!couponValidation || !couponValidation.valid))}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 bg-secondary/30 hover:bg-secondary/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-secondary/30"
                        >
                            <CreditCard size={20} className="text-primary shrink-0" />
                            <div className="text-left">
                                <p className="font-semibold text-foreground">Use a new card</p>
                                <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex and more</p>
                            </div>
                        </button>
                    </div>
                )}
                {gwConfig?.paypal_enabled && (
                    <button
                        onClick={() => startPayment(selectedPlan, "paypal")}
                        disabled={couponValidating || (couponCode && (!couponValidation || !couponValidation.valid))}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-[#FFC43A]/60 bg-secondary/30 hover:bg-[#FFC43A]/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-secondary/30"
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#009CDE]" fill="currentColor">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.27-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.487z" />
                        </svg>
                        <div className="text-left">
                            <p className="font-semibold text-foreground">PayPal</p>
                            <p className="text-xs text-muted-foreground">Pay with your PayPal account</p>
                        </div>
                    </button>
                )}
                {gwConfig?.razorpay_enabled && (
                    <button
                        onClick={() => startPayment(selectedPlan, "razorpay")}
                        disabled={couponValidating || (couponCode && (!couponValidation || !couponValidation.valid))}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 bg-secondary/30 transition-all disabled:opacity-50"
                    >
                        <CreditCard size={20} className="text-primary shrink-0" />
                        <div className="text-left">
                            <p className="font-semibold text-foreground">Razorpay</p>
                            <p className="text-xs text-muted-foreground">Cards, UPI and net banking</p>
                        </div>
                    </button>
                )}
                {gwConfig?.cashfree_enabled && (
                    <div className="space-y-2">
                        <button
                            onClick={() => startPayment(selectedPlan, "cashfree")}
                            disabled={cashfreePhoneMissing || couponValidating || (couponCode && (!couponValidation || !couponValidation.valid))}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 bg-secondary/30 transition-all disabled:opacity-50"
                        >
                            <CreditCard size={20} className="text-primary shrink-0" />
                            <div className="text-left">
                                <p className="font-semibold text-foreground">Cashfree</p>
                                <p className="text-xs text-muted-foreground">Cards, UPI and wallets</p>
                            </div>
                        </button>
                        {cashfreePhoneMissing && (
                            <p className="text-xs text-muted-foreground">
                                Cashfree requires a phone number. Add one in <a href="/account" className="text-primary underline underline-offset-2">Account</a> to continue.
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (step === "stripe" && initResult?.stripe_client_secret && stripePromise && selectedPlan) {
        const payableAmount = initResult?.prorated_charge ?? initResult?.amount ?? selectedPlan.price;
        const payableCurrency = initResult?.currency ?? selectedPlan.currency;
        return (
            <div className="space-y-5">
                <OrderSummary
                    plan={selectedPlan}
                    userCountry={userCountry}
                    amount={payableAmount}
                    currency={payableCurrency}
                    mode={mode}
                    couponApplied={initResult?.coupon_applied}
                    originalAmount={initResult?.original_amount}
                    discountAmount={initResult?.discount_amount}
                    taxQuote={taxQuote}
                />

                <h3 className="font-semibold text-foreground pt-2">
                    {selectedSavedPaymentMethodId ? "Confirm saved card" : "Card details"}
                </h3>
                <Elements
                    stripe={stripePromise}
                    options={{
                        clientSecret: initResult.stripe_client_secret,
                        appearance: { theme: "night", labels: "floating" },
                    }}
                >
                    <StripePaymentForm
                        plan={selectedPlan}
                        paymentId={initResult.payment_id}
                        clientSecret={initResult.stripe_client_secret}
                        amount={payableAmount}
                        currency={payableCurrency}
                        returnTo={returnTo}
                        userCountry={userCountry}
                        savedPaymentMethodId={selectedSavedPaymentMethodId}
                        onSuccess={(inv) => {
                            setStep("success");
                            onSuccess(inv, selectedPlan);
                        }}
                        onError={handleError}
                    />
                </Elements>
                <button
                    onClick={() => {
                        if (gwConfig?.stripe_enabled && gwConfig?.paypal_enabled) {
                            setStep("gateway-pick");
                        }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors w-full text-center"
                >
                    ← Use a different payment method
                </button>
            </div>
        );
    }

    if (step === "razorpay" && selectedPlan) {
        return (
            <div className="space-y-5">
                <OrderSummary plan={selectedPlan} userCountry={userCountry} amount={initResult?.amount ?? 0} currency={initResult?.currency ?? selectedPlan.currency} mode={mode} taxQuote={taxQuote} />
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-5 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">Complete your payment securely with Razorpay.</p>
                    <Button className="w-full" onClick={handleRazorpay}>Continue to Razorpay</Button>
                </div>
            </div>
        );
    }

    if (step === "cashfree" && selectedPlan) {
        return (
            <div className="space-y-5">
                <OrderSummary plan={selectedPlan} userCountry={userCountry} amount={initResult?.amount ?? 0} currency={initResult?.currency ?? selectedPlan.currency} mode={mode} taxQuote={taxQuote} />
                <div className="rounded-xl border border-border/50 bg-secondary/20 p-5 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">Complete your payment securely with Cashfree.</p>
                    <Button className="w-full" onClick={handleCashfree}>Continue to Cashfree</Button>
                </div>
            </div>
        );
    }

    if (step === "paypal-redirect" && selectedPlan) {
        // Use backend initResult if available, otherwise fall back to localized pricing
        const localizedPrice = getLocalizedPlanPrice(selectedPlan, userCountry);
        const payableAmount = initResult?.prorated_charge ?? initResult?.amount ?? localizedPrice.price;
        const payableCurrency = initResult?.currency ?? localizedPrice.currency;

        return (
            <div className="space-y-5">
                <OrderSummary
                    plan={selectedPlan}
                    userCountry={userCountry}
                    amount={payableAmount}
                    currency={payableCurrency}
                    mode={mode}
                    couponApplied={initResult?.coupon_applied}
                    originalAmount={initResult?.original_amount}
                    discountAmount={initResult?.discount_amount}
                    taxQuote={taxQuote}
                />

                <div className="rounded-xl border border-border/50 bg-secondary/20 p-5 text-center space-y-3">
                    <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10 text-[#009CDE]" fill="currentColor">
                        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.27-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.487z" />
                    </svg>
                    <p className="text-sm text-muted-foreground">
                        You&apos;ll be taken to PayPal to complete your payment of{" "}
                        <strong className="text-foreground">
                            {payableCurrency} {payableAmount.toFixed(2)}
                        </strong>
                        .
                    </p>
                    <Button
                        className="w-full bg-[#FFC43A] hover:bg-[#f0b429] text-[#1a1a1a] font-bold h-12 text-base"
                        onClick={handlePayPalRedirect}
                    >
                        Continue to PayPal
                    </Button>
                </div>
                <button
                    onClick={() => {
                        if (gwConfig?.stripe_enabled && gwConfig?.paypal_enabled) {
                            setStep("gateway-pick");
                        }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors w-full text-center"
                >
                    ← Use a different payment method
                </button>
            </div>
        );
    }

    return null;
}

// ── Order summary strip ───────────────────────────────────────────────────────

function OrderSummary({
    plan,
    userCountry,
    amount,
    currency,
    mode,
    couponApplied,
    originalAmount,
    discountAmount,
    taxQuote,
}: {
    plan: SubscriptionPlan;
    userCountry: string | null;
    amount?: number;
    currency?: string;
    mode?: CheckoutMode;
    couponApplied?: boolean;
    originalAmount?: number | null;
    discountAmount?: number | null;
    taxQuote?: CheckoutTaxQuote | null;
}) {
    const billingMap: Record<string, string> = {
        monthly: "/month",
        yearly: "/year",
        daily: "/day",
    };
    const billingLabel = billingMap[plan.billing_cycle] ?? `/ ${plan.billing_cycle}`;

    // Use localized pricing as fallback if amount/currency not provided
    const localizedPrice = useMemo(() => getLocalizedPlanPrice(plan, userCountry), [plan, userCountry]);

    const baseAmount = originalAmount ?? (mode === "upgrade" ? amount ?? localizedPrice.price : localizedPrice.price);
    const quotedDiscountAmount = taxQuote
        ? Math.max(0, baseAmount - taxQuote.subtotal)
        : 0;
    const effectiveDiscountAmount = discountAmount ?? quotedDiscountAmount;
    const hasDiscount = effectiveDiscountAmount > 0;
    const payableAmount = taxQuote?.total ?? amount ?? localizedPrice.price;
    const payableCurrency = taxQuote?.currency ?? currency ?? localizedPrice.currency;

    return (
        <div className="rounded-xl bg-primary/5 border border-primary/20 overflow-hidden">
            <div className="flex items-center justify-between py-3 px-4">
                <div>
                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">
                        {mode === "upgrade" ? "Prorated upgrade" : accessPeriodLabel(plan)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-black text-foreground">
                        {payableCurrency}{" "}
                        <span className="tabular-nums">{baseAmount.toFixed(2)}</span>
                    </p>
                    {plan.plan_type === "subscription" && mode !== "upgrade" && (
                        <p className="text-xs text-muted-foreground">{billingLabel}</p>
                    )}
                </div>
            </div>
            {taxQuote && (
                <div className="space-y-1.5 border-t border-primary/15 px-4 py-3 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-3">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{payableCurrency} {baseAmount.toFixed(2)}</span>
                    </div>
                    {hasDiscount && (
                        <div className="flex justify-between gap-3 text-green-500">
                            <span>Discount</span>
                            <span className="tabular-nums">-{payableCurrency} {effectiveDiscountAmount.toFixed(2)}</span>
                        </div>
                    )}
                    {taxQuote.tax_lines.map((tax) => (
                        <div key={`${tax.name}-${tax.tax_type}-${tax.percentage ?? tax.flat_amount}`} className="flex justify-between gap-3">
                            <span>{tax.name} ({tax.tax_type === "flat" ? `${payableCurrency} ${tax.flat_amount?.toFixed(2)}` : `${tax.percentage}%`})</span>
                            <span className="tabular-nums">{payableCurrency} {tax.amount.toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="flex justify-between gap-3 border-t border-primary/15 pt-1.5 font-semibold text-foreground">
                        <span>Total</span>
                        <span className="tabular-nums">{payableCurrency} {payableAmount.toFixed(2)}</span>
                    </div>
                </div>
            )}
            {couponApplied && (
                <div className="px-4 py-2 bg-green-500/10 border-t border-green-500/20">
                    <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                        <Check size={14} />
                        Coupon applied successfully
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 size={32} className="animate-spin text-primary" />
                </div>
            }
        >
            <CheckoutPageInner />
        </Suspense>
    );
}

function CheckoutPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();

    const type = (searchParams.get("type") ?? "subscription") as CheckoutType;
    const mode = (searchParams.get("mode") ?? "checkout") as CheckoutMode;
    const checkoutMode: CheckoutMode = type === "subscription" && mode === "upgrade"
        ? "upgrade"
        : "checkout";
    const contentId = searchParams.get("contentId");
    const initialPlanId = searchParams.get("planId");
    const returnTo = searchParams.get("returnTo") ?? "/";

    const [video, setVideo] = useState<VideoOut | null>(null);
    const [channel, setChannel] = useState<LiveTvChannelOut | null>(null);
    const [contentLoading, setContentLoading] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
    const [successInvoice, setSuccessInvoice] = useState<string | null>(null);
    const [userCountry, setUserCountry] = useState<string | null>(null);
    const [userCountryReady, setUserCountryReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setUserCountryReady(false);
        getUserCountry(user?.country)
            .then((country) => {
                if (cancelled) return;
                setUserCountry(country);
                setUserCountryReady(true);
            })
            .catch(() => {
                if (!cancelled) setUserCountryReady(true);
            });
        return () => { cancelled = true; };
    }, [user?.country]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            const here = `/checkout?${searchParams.toString()}`;
            router.replace(`/login?returnTo=${encodeURIComponent(here)}`);
        }
    }, [authLoading, user, router, searchParams]);

    // Fetch content metadata for rent/ppv
    useEffect(() => {
        if (!contentId || type === "subscription") return;

        setContentLoading(true);
        const fetch = type === "ppv" ? getPpvEvent(contentId) : getVideo(contentId);
        fetch
            .then((data) => {
                if (type === "ppv") {
                    const event = data as Awaited<ReturnType<typeof getPpvEvent>>;
                    setChannel({
                        id: event.id,
                        client_id: "",
                        title: event.title,
                        slug: event.slug ?? event.id,
                        description: event.description,
                        category: event.category,
                        language: [],
                        source: event.source,
                        stream_url: event.stream_url,
                        stream_status: event.is_live ? "live" : "idle",
                        thumbnails: event.thumbnails,
                        is_active: true,
                        is_featured: false,
                        is_live: event.is_live,
                        geo_fencing: event.geo_fencing,
                        access_type: "pay_per_view",
                        subscription_plan_ids: event.pricing_plan_id ? [event.pricing_plan_id] : [],
                        created_at: event.created_at,
                        updated_at: event.created_at,
                    });
                }
                else setVideo(data as VideoOut);
            })
            .catch(() => { /* non-critical */ })
            .finally(() => setContentLoading(false));
    }, [contentId, type]);

    const handleSuccess = useCallback(
        (invoice: string, plan: SubscriptionPlan) => {
            setSuccessInvoice(invoice);
            setSelectedPlan(plan);
            // Redirect back after 2.5s
            setTimeout(() => router.push(returnTo), 2500);
        },
        [router, returnTo],
    );

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        );
    }

    if (!user) return null; // Redirect already triggered above

    const pageTitle =
        type === "rent"
            ? `Rent — ${video?.title ?? "Movie"}`
            : type === "ppv"
                ? `Buy Event — ${channel?.title ?? "PPV Event"}`
                : checkoutMode === "upgrade"
                    ? "Upgrade Subscription"
                    : "Subscribe";

    return (
        <div className="min-h-screen bg-background">
            {/* Top bar */}
            <div className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
                <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center gap-4">
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.back()}>
                        <ChevronLeft size={16} /> Back
                    </Button>
                    <div className="h-5 w-px bg-border/60" />
                    <h1 className="text-base font-semibold text-foreground">{pageTitle}</h1>
                    {checkoutMode === "upgrade" && (
                        <span className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-[11px] font-semibold uppercase tracking-wider text-primary">
                            Prorated Upgrade
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck size={14} className="text-primary" />
                        Secure checkout
                    </div>
                </div>
            </div>

            {/* Content */}
            {successInvoice && selectedPlan ? (
                /* ── Global success screen ──────────────────────────────── */
                <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-6 text-center">
                    <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
                        <ShieldCheck size={44} className="text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black text-foreground">Payment Successful!</h2>
                        <p className="text-muted-foreground">
                            Invoice <span className="font-mono text-foreground">{successInvoice}</span>
                        </p>
                        <p className="text-muted-foreground">
                            {checkoutMode === "upgrade"
                                ? <>Your plan is now <strong>{selectedPlan.name}</strong>.</>
                                : <>You now have access to <strong>{selectedPlan.name}</strong>.</>}
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">Redirecting you back…</p>
                    <Button onClick={() => router.push(returnTo)} variant="outline">
                        Go now
                    </Button>
                </div>
            ) : (
                <div className="max-w-screen-xl mx-auto px-6 py-10">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-10 lg:gap-16 items-start">

                        {/* ── Left: content / plan details ── */}
                        <div className="order-2 lg:order-1">
                            {type === "subscription" ? (
                                <SubscriptionDetailPanel plan={selectedPlan} />
                            ) : contentLoading ? (
                                <ContentDetailSkeleton />
                            ) : (
                                <ContentDetailPanel
                                    type={type}
                                    video={video}
                                    channel={channel}
                                    plan={selectedPlan}
                                />
                            )}
                        </div>

                        {/* ── Right: payment ── */}
                        <div className="order-1 lg:order-2 lg:sticky lg:top-24">
                            <div className="rounded-2xl border border-border/40 bg-card shadow-xl p-6 space-y-6">
                                <div className="space-y-1">
                                    <h2 className="text-lg font-bold text-foreground">
                                        {type === "rent"
                                            ? "Rent this movie"
                                            : type === "ppv"
                                                ? "Buy this event"
                                                : checkoutMode === "upgrade"
                                                    ? "Upgrade your subscription"
                                                    : "Complete your subscription"}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {type === "subscription"
                                            ? checkoutMode === "upgrade"
                                                ? "Switch to a higher plan now. You will only pay the prorated difference."
                                                : "Unlock unlimited access with a subscription plan."
                                            : type === "rent"
                                                ? "Rent once and watch during the access window."
                                                : "One-time purchase to watch this live event."}
                                    </p>
                                </div>

                                <hr className="border-border/40" />

                                <PaymentPanel
                                    type={type}
                                    mode={checkoutMode}
                                    contentId={contentId}
                                    allowedPlanIds={
                                        type === "rent"
                                            ? contentLoading
                                                ? undefined
                                                : video?.subscription_plan_ids ?? []
                                            : null
                                    }
                                    initialPlanId={initialPlanId}
                                    returnTo={returnTo}
                                    userCountry={userCountry}
                                    userCountryReady={userCountryReady}
                                    onSuccess={handleSuccess}
                                    onPlanSelected={setSelectedPlan}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}

// ── Content detail skeleton ────────────────────────────────────────────────────

function ContentDetailSkeleton() {
    return (
        <div className="space-y-5">
            <Skeleton className="w-full aspect-video rounded-2xl" />
            <Skeleton className="h-7 w-3/4 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <div className="flex gap-2 flex-wrap">
                {[60, 48, 72, 40].map((w, i) => (
                    <Skeleton key={i} style={{ width: w }} className="h-6 rounded-full" />
                ))}
            </div>
        </div>
    );
}
