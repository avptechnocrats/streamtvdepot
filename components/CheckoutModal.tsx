"use client";

/**
 * CheckoutModal
 *
 * Handles the full payment flow for subscription plans.
 * - If both Stripe and PayPal are enabled → shows a gateway picker first.
 * - Stripe: inline PaymentElement form, no redirect for standard cards.
 * - PayPal: redirects to PayPal approval URL; return is handled by /checkout/paypal-callback.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Elements,
    PaymentElement,
    useElements,
    useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

import {
    confirmCheckout,
    createPaymentMethodSetupIntent,
    fetchGatewayConfig,
    fetchSavedPaymentMethods,
    initiateCheckout,
    initiateUpgrade,
    type CheckoutInitiateResult,
    type GatewayConfig,
    type SavedPaymentMethod,
    type UpgradeInitiateResult,
} from "@/lib/services/checkout";
import type { SubscriptionPlan } from "@/lib/services/subscription-plans";
import { useAuth } from "@/hooks/use-auth";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight, Loader2, CreditCard, Plus, ShieldCheck, CreditCardIcon, Check } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckoutModalProps {
    open: boolean;
    plan: SubscriptionPlan | null;
    onClose: () => void;
    onSuccess: (invoiceNumber: string) => void;
    /** Required for PPV (livestream ID) and Rent (video ID) */
    contentId?: string;
    /** "upgrade" uses prorated upgrade endpoint; "checkout" uses normal purchase */
    mode?: "checkout" | "upgrade";
    /** Existing subscription expiry when this checkout is a queued renewal. */
    renewalStartsAt?: string | null;
}

type Gateway = "stripe" | "paypal" | "razorpay" | "cashfree";
type Step = "loading" | "gateway-pick" | "stripe" | "paypal-redirect" | "razorpay" | "cashfree" | "add-payment-method" | "success" | "error";

function hasCashfreePhone(phone: string | null | undefined): boolean {
    const digits = (phone ?? "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
}

declare global {
    interface Window {
        Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
        Cashfree?: (options: { mode: string }) => { checkout: (options: Record<string, unknown>) => Promise<{ error?: { message?: string }; paymentDetails?: { paymentMessage?: string } }> };
    }
}

function loadPaymentScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Payment SDK could not be loaded"));
        document.body.appendChild(script);
    });
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

const TRIAL_PAYMENT_METHOD_REQUIRED_DETAIL = "Add a payment method before starting this trial";

// ── Stripe payment-method setup (save a card with no charge) ─────────────────

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
            onError(error.message ?? "Could not save payment method");
            setSubmitting(false);
            return;
        }

        onSuccess();
        setSubmitting(false);
    };

    return (
        <div className="space-y-5">
            <PaymentElement options={{ layout: "tabs" }} />
            <Button className="w-full" onClick={handleSave} disabled={!stripe || !elements || submitting}>
                {submitting ? (
                    <><Loader2 size={16} className="animate-spin mr-2" /> Saving…</>
                ) : (
                    <><CreditCard size={16} className="mr-2" /> Save Payment Method</>
                )}
            </Button>
        </div>
    );
}

// ── Stripe inner form ─────────────────────────────────────────────────────────

interface StripeFormProps {
    paymentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
    savedPaymentMethodId: string | null;
    onSuccess: (invoiceNumber: string) => void;
    onError: (msg: string) => void;
}

function StripePaymentForm({ paymentId, clientSecret, amount, currency, savedPaymentMethodId, onSuccess, onError }: StripeFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [submitting, setSubmitting] = useState(false);

    const handlePay = async () => {
        if (!stripe || (!savedPaymentMethodId && !elements)) return;
        setSubmitting(true);

        // Store payment_id before the potential 3DS redirect so the
        // /checkout/success page can retrieve it after the browser navigates back.
        sessionStorage.setItem("sv_stripe_payment_id", paymentId);
        sessionStorage.setItem("sv_checkout_return_to", `${window.location.pathname}${window.location.search}`);

        const confirmation = savedPaymentMethodId
            ? await stripe.confirmCardPayment(clientSecret, { payment_method: savedPaymentMethodId })
            : await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/checkout/success?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
                },
                redirect: "if_required",
            });
        const { error, paymentIntent } = confirmation;

        if (error) {
            onError(error.message ?? "Payment failed");
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
                onError("Payment was charged but we could not activate your plan. Please contact support.");
            }
        } else {
            onError("Payment was not completed. Please try again.");
        }

        setSubmitting(false);
    };

    return (
        <div className="space-y-5">
            {savedPaymentMethodId ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                    Your selected saved card will be used for this payment.
                </div>
            ) : (
                <PaymentElement
                    options={{
                        layout: "tabs",
                    }}
                />
            )}
            <Button
                className="w-full"
                onClick={handlePay}
                disabled={!stripe || (!savedPaymentMethodId && !elements) || submitting}
            >
                {submitting ? (
                    <><Loader2 size={16} className="animate-spin mr-2" /> Processing…</>
                ) : (
                    <>
                        <CreditCard size={16} className="mr-2" />
                        Pay {currency} {amount.toFixed(2)}
                    </>
                )}
            </Button>
        </div>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function CheckoutModal({
    open,
    plan,
    onClose,
    onSuccess,
    contentId,
    mode = "checkout",
    renewalStartsAt,
}: CheckoutModalProps) {
    const { user } = useAuth();
    const [step, setStep] = useState<Step>("loading");
    const [errorMsg, setErrorMsg] = useState("");
    const [gwConfig, setGwConfig] = useState<GatewayConfig | null>(null);
    const [initResult, setInitResult] = useState<(CheckoutInitiateResult & {
        amount?: number | null;
        prorated_charge?: number | null;
        currency?: string | null;
    }) | null>(null);
    const [pmClientSecret, setPmClientSecret] = useState<string | null>(null);
    const [pendingGateway, setPendingGateway] = useState<Gateway | undefined>(undefined);
    const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
    const [savedPaymentMethodsLoading, setSavedPaymentMethodsLoading] = useState(false);
    const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);

    // Memoised Stripe instance — rebuilt whenever the publishable key changes
    const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
        const key = gwConfig?.stripe_publishable_key;
        return key ? loadStripe(key) : null;
    }, [gwConfig?.stripe_publishable_key]);

    const userCountry = useMemo(() => {
        if (user?.country) return user.country;
        if (typeof navigator === "undefined") return null;
        try {
            return new Intl.Locale(navigator.language).region ?? null;
        } catch {
            return null;
        }
    }, [user?.country]);

    const handleError = (msg: string) => {
        setErrorMsg(msg);
        setStep("error");
    };
    const cashfreePhoneMissing = !hasCashfreePhone(user?.phone);

    // ── Load gateway config when modal opens ──────────────────────────────────
    useEffect(() => {
        if (!open || !plan) return;

        setStep("loading");
        setInitResult(null);
        setPmClientSecret(null);
        setPendingGateway(undefined);
        setSavedPaymentMethods([]);
        setSelectedSavedPaymentMethodId(null);
        setErrorMsg("");

        Promise.all([
            fetchGatewayConfig(),
            fetchSavedPaymentMethods().catch(() => ({ payment_methods: [], paypal_connected: false })),
        ])
            .then(([cfg, savedMethods]) => {
                setGwConfig(cfg);
                const { stripe_enabled, paypal_enabled, razorpay_enabled, cashfree_enabled } = cfg;
                const defaultGatewayEnabled = cfg.default_gateway === "stripe"
                    ? stripe_enabled
                    : cfg.default_gateway === "paypal"
                        ? paypal_enabled
                        : cfg.default_gateway === "razorpay"
                            ? razorpay_enabled
                            : cfg.default_gateway === "cashfree"
                                ? cashfree_enabled
                                : false;
                const stripeMethods = stripe_enabled
                    ? savedMethods.payment_methods.filter((method) => method.gateway === "stripe")
                    : [];
                setSavedPaymentMethods(stripeMethods);
                setSavedPaymentMethodsLoading(false);

                if (isFreePlan(plan, userCountry)) {
                    startCheckout();
                    return;
                }

                if (!stripe_enabled && !paypal_enabled && !razorpay_enabled && !cashfree_enabled) {
                    handleError("Payments are not yet configured for this platform.");
                    return;
                }

                if (cfg.default_gateway && defaultGatewayEnabled) {
                    if (cfg.default_gateway === "stripe" && stripeMethods.length > 0) {
                        setStep("gateway-pick");
                    } else {
                        startCheckout(cfg.default_gateway);
                    }
                    return;
                }

                const enabled = [stripe_enabled, paypal_enabled, razorpay_enabled, cashfree_enabled].filter(Boolean).length;
                if (enabled > 1 || stripeMethods.length > 0) {
                    setStep("gateway-pick");
                } else {
                    // Auto-select the only enabled gateway
                    startCheckout(stripe_enabled ? "stripe" : paypal_enabled ? "paypal" : razorpay_enabled ? "razorpay" : "cashfree");
                }
            })
            .catch(() => handleError("Could not load payment options. Please try again."));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, plan, userCountry]);

    const startCheckout = useCallback(
        async (gateway?: Gateway, paymentMethodId?: string | null) => {
            if (!plan) return;
            setStep("loading");

            try {
                if (mode === "upgrade") {
                    const result: UpgradeInitiateResult = await initiateUpgrade({
                        new_plan_id: plan.id,
                        gateway,
                        payment_method_id: gateway === "stripe" ? paymentMethodId ?? undefined : undefined,
                    });

                    if (!result.payment_required) {
                        setStep("success");
                        onSuccess("UPGRADE_APPLIED");
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
                    return;
                }

                const result = await initiateCheckout({
                    plan_id: plan.id,
                    gateway,
                    payment_method_id: gateway === "stripe" ? paymentMethodId ?? undefined : undefined,
                    content_id: contentId,
                });
                setInitResult(result);

                if (result.gateway === "free") {
                    if (!result.invoice_number) {
                        handleError("Free subscription could not be activated. Please try again.");
                        return;
                    }
                    setStep("success");
                    onSuccess(result.invoice_number);
                    return;
                }

                setStep(result.gateway === "stripe" ? "stripe" : result.gateway === "razorpay" ? "razorpay" : result.gateway === "cashfree" ? "cashfree" : "paypal-redirect");
            } catch (err: unknown) {
                const detail =
                    err && typeof err === "object" && "response" in err
                        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                        : null;

                if (mode === "checkout" && detail?.includes(TRIAL_PAYMENT_METHOD_REQUIRED_DETAIL)) {
                    setPendingGateway(gateway);
                    try {
                        const setup = await createPaymentMethodSetupIntent();
                        setGwConfig((prev) => prev ? { ...prev, stripe_publishable_key: setup.stripe_publishable_key ?? prev.stripe_publishable_key } : prev);
                        setPmClientSecret(setup.stripe_client_secret);
                        setStep("add-payment-method");
                        return;
                    } catch {
                        handleError("Could not start payment method setup. Please try again.");
                        return;
                    }
                }

                handleError(detail ?? "Failed to initiate checkout. Please try again.");
            }
        },
        [plan, contentId, mode, onSuccess],
    );

    const handlePayPalRedirect = () => {
        if (!initResult?.paypal_approval_url || !initResult.payment_id) return;
        // Store payment_id so the callback page can confirm the payment
        sessionStorage.setItem("sv_paypal_payment_id", initResult.payment_id);
        sessionStorage.setItem("sv_checkout_return_to", `${window.location.pathname}${window.location.search}`);
        window.location.href = initResult.paypal_approval_url;
    };

    const handleRazorpay = async () => {
        if (!initResult?.razorpay_order_id || !initResult.razorpay_key_id) return;
        try {
            await loadPaymentScript("https://checkout.razorpay.com/v1/checkout.js");
            if (!window.Razorpay) throw new Error("Razorpay SDK is unavailable");
            const razorpay = new window.Razorpay({
                key: initResult.razorpay_key_id,
                amount: Math.round((initResult.amount ?? 0) * 100),
                currency: initResult.currency,
                name: document.title,
                order_id: initResult.razorpay_order_id,
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    try {
                        const result = await confirmCheckout({ payment_id: initResult.payment_id, ...response });
                        setStep("success");
                        onSuccess(result.invoice_number);
                    } catch {
                        handleError("Payment was charged but we could not activate your plan. Please contact support.");
                    }
                },
                modal: { ondismiss: () => setStep("razorpay") },
            });
            razorpay.open();
        } catch (error) {
            handleError(error instanceof Error ? error.message : "Could not start Razorpay checkout");
        }
    };

    const handleCashfree = async () => {
        if (!initResult?.cashfree_payment_session_id || !initResult.cashfree_mode) return;
        try {
            await loadPaymentScript("https://sdk.cashfree.com/js/v3/cashfree.js");
            if (!window.Cashfree) throw new Error("Cashfree SDK is unavailable");
            const cashfreeMode = initResult.cashfree_mode === "live" ? "production" : "sandbox";
            const cashfree = window.Cashfree({ mode: cashfreeMode });
            const result = await cashfree.checkout({ paymentSessionId: initResult.cashfree_payment_session_id, redirectTarget: "_modal" });
            if (result.error) throw new Error(result.error.message ?? "Cashfree payment failed");
            const confirmed = await confirmCheckout({ payment_id: initResult.payment_id, cashfree_order_id: initResult.cashfree_order_id ?? undefined });
            setStep("success");
            onSuccess(confirmed.invoice_number);
        } catch (error) {
            handleError(error instanceof Error ? error.message : "Could not start Cashfree checkout");
        }
    };

    if (!plan) return null;

    const localizedPricing = getLocalizedPlanPrice(plan, userCountry);
    const payableAmount = initResult?.prorated_charge ?? initResult?.amount ?? localizedPricing.price;
    const payableCurrency = initResult?.currency ?? localizedPricing.currency;
    const renewalStartDate = renewalStartsAt ? new Date(renewalStartsAt) : null;
    const isQueuedRenewal = mode === "checkout" && renewalStartDate && !Number.isNaN(renewalStartDate.getTime());
    const defaultGateway = gwConfig?.default_gateway;
    const showStripe = gwConfig?.stripe_enabled && (!defaultGateway || defaultGateway === "stripe");
    const showPayPal = gwConfig?.paypal_enabled && (!defaultGateway || defaultGateway === "paypal");
    const showRazorpay = gwConfig?.razorpay_enabled && (!defaultGateway || defaultGateway === "razorpay");
    const showCashfree = gwConfig?.cashfree_enabled && (!defaultGateway || defaultGateway === "cashfree");

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {step === "success"
                            ? mode === "upgrade" ? "Upgrade Successful" : initResult?.gateway === "free" ? "Subscription Activated" : "Payment Successful"
                            : mode === "upgrade" ? `Upgrade to ${plan.name}` : `Subscribe to ${plan.name}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-2">
                    {/* Loading */}
                    {step === "loading" && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    )}

                    {/* Gateway picker */}
                    {step === "gateway-pick" && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Choose how you&apos;d like to pay for <strong>{plan.name}</strong> (
                                {payableCurrency} {payableAmount.toFixed(2)}).
                            </p>
                            {isQueuedRenewal && (
                                <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                                    Your renewal starts when your current plan ends on {renewalStartDate.toLocaleDateString()}.
                                </p>
                            )}
                            {showStripe && savedPaymentMethodsLoading && (
                                <div className="flex items-center justify-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
                                    <Loader2 size={16} className="animate-spin" /> Checking saved cards...
                                </div>
                            )}
                            {showStripe && savedPaymentMethods.length > 0 && (
                                <RadioGroup
                                    value={selectedSavedPaymentMethodId ?? undefined}
                                    onValueChange={setSelectedSavedPaymentMethodId}
                                    className="gap-2"
                                    aria-label="Saved cards"
                                >
                                    {savedPaymentMethods.map((method) => (
                                        <label
                                            key={method.id}
                                            htmlFor={`saved-card-${method.id}`}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-sm transition-colors hover:border-primary/60"
                                        >
                                            <RadioGroupItem id={`saved-card-${method.id}`} value={method.id} />
                                            <CreditCard size={16} className="shrink-0 text-primary" />
                                            <span className="flex-1 font-medium text-foreground">
                                                {method.brand ? method.brand.toUpperCase() : "Card"} ending in {method.last4}
                                            </span>
                                            {method.is_default && <span className="text-xs text-primary">Default</span>}
                                        </label>
                                    ))}
                                </RadioGroup>
                            )}
                            {showStripe && (
                                <div className="grid grid-cols-2 gap-2">
                                    {savedPaymentMethods.length > 0 && (
                                        <Button
                                            disabled={!selectedSavedPaymentMethodId}
                                            onClick={() => startCheckout("stripe", selectedSavedPaymentMethodId)}
                                        >
                                            <Check size={16} className="mr-2" />
                                            Continue
                                        </Button>
                                    )}
                                    <Button
                                        className={savedPaymentMethods.length === 0 ? "col-span-2" : undefined}
                                        onClick={() => {
                                            setSelectedSavedPaymentMethodId(null);
                                            startCheckout("stripe", null);
                                        }}
                                    >
                                        <CreditCard size={16} className="mr-2" />
                                        New Card
                                    </Button>
                                </div>
                            )}
                            {showRazorpay && (
                                <Button className="w-full" onClick={() => startCheckout("razorpay")}>
                                    Pay with Razorpay
                                </Button>
                            )}
                            {showCashfree && (
                                <div className="space-y-2">
                                    <Button className="w-full" disabled={cashfreePhoneMissing} onClick={() => startCheckout("cashfree")}>
                                        Pay with Cashfree
                                    </Button>
                                    {cashfreePhoneMissing && (
                                        <p className="text-xs text-muted-foreground">
                                            Cashfree requires a phone number. Add one in <a href="/account" className="text-primary underline underline-offset-2">Account</a> to continue.
                                        </p>
                                    )}
                                </div>
                            )}
                            {showPayPal && (
                                <Button
                                    className="w-full"
                                    onClick={() => startCheckout("paypal")}
                                >
                                    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="currentColor">
                                        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.27-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.487z" />
                                    </svg>
                                    Pay with PayPal
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Stripe Elements */}
                    {step === "stripe" && initResult?.stripe_client_secret && stripePromise && (
                        <Elements
                            stripe={stripePromise}
                            options={{
                                clientSecret: initResult.stripe_client_secret,
                                appearance: { theme: "night", labels: "floating" },
                            }}
                        >
                            <StripePaymentForm
                                paymentId={initResult.payment_id}
                                clientSecret={initResult.stripe_client_secret}
                                amount={payableAmount}
                                currency={payableCurrency}
                                savedPaymentMethodId={selectedSavedPaymentMethodId}
                                onSuccess={(inv) => {
                                    setStep("success");
                                    onSuccess(inv);
                                }}
                                onError={handleError}
                            />
                        </Elements>
                    )}

                    {/* PayPal redirect */}
                    {step === "paypal-redirect" && (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-muted-foreground">
                                You&apos;ll be redirected to PayPal to complete your payment of{" "}
                                <strong>
                                    {payableCurrency} {payableAmount.toFixed(2)}
                                </strong>
                                .
                            </p>
                            <Button className="w-full bg-[#FFC43A] hover:bg-[#f0b429] text-[#1a1a1a]" onClick={handlePayPalRedirect}>
                                Continue to PayPal
                            </Button>
                        </div>
                    )}

                    {step === "razorpay" && (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-muted-foreground">Complete your payment securely with Razorpay.</p>
                            <Button className="w-full" onClick={handleRazorpay}>Continue to Razorpay</Button>
                        </div>
                    )}

                    {step === "cashfree" && (
                        <div className="space-y-4 text-center">
                            <p className="text-sm text-muted-foreground">Complete your payment securely with Cashfree.</p>
                            <Button className="w-full" onClick={handleCashfree}>Continue to Cashfree</Button>
                        </div>
                    )}

                    {/* Add payment method — required before this plan's trial can start */}
                    {step === "add-payment-method" && pmClientSecret && stripePromise && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                This plan&apos;s free trial requires a payment method on file. You won&apos;t be
                                charged now — your card is only billed automatically once the trial ends.
                            </p>
                            <Elements
                                stripe={stripePromise}
                                options={{
                                    clientSecret: pmClientSecret,
                                    appearance: { theme: "night", labels: "floating" },
                                }}
                            >
                                <PaymentMethodSetupForm
                                    onSuccess={() => startCheckout(pendingGateway)}
                                    onError={handleError}
                                />
                            </Elements>
                        </div>
                    )}

                    {step === "success" && (
                        <div className="text-center space-y-3 py-6">
                            <ShieldCheck size={48} className="mx-auto text-green-500" />
                            <p className="text-lg font-semibold">
                                {mode === "upgrade" ? "Your plan has been upgraded!" : "You&apos;re subscribed!"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {mode === "upgrade"
                                    ? <>You now have access to <strong>{plan.name}</strong>.</>
                                    : <>Welcome to <strong>{plan.name}</strong>. Enjoy your content.</>}
                            </p>
                            <Button className="mt-2" onClick={onClose}>
                                {mode === "upgrade" ? "Done" : "Start Watching"}
                            </Button>
                        </div>
                    )}

                    {/* Error */}
                    {step === "error" && (
                        <div className="space-y-4 py-4 text-center">
                            <p className="text-sm text-destructive">{errorMsg}</p>
                            <Button variant="outline" onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
