"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
    Check,
    CreditCard,
    Loader2,
    Plus,
    ShieldCheck,
    Star,
    Trash2,
    WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
    createPaymentMethodSetupIntent,
    fetchSavedPaymentMethods,
    removeSavedPaymentMethod,
    setDefaultPaymentMethod,
    type SavedPaymentMethod,
    type SavedPaymentMethodsResult,
} from "@/lib/services/checkout";
import { getTenantNameFromHost, toDisplayName } from "@/lib/tenant-display";
import { getUserCountry } from "@/lib/services/geolocation";

function cardLabel(method: SavedPaymentMethod): string {
    const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : "Card";
    return `${brand} ending in ${method.last4 ?? "----"}`;
}

function expiryLabel(method: SavedPaymentMethod): string {
    if (!method.exp_month || !method.exp_year) return "Expiry unavailable";
    return `Expires ${String(method.exp_month).padStart(2, "0")}/${String(method.exp_year).slice(-2)}`;
}

function gatewayLabel(gateway: SavedPaymentMethod["gateway"]): string {
    const labels: Record<SavedPaymentMethod["gateway"], string> = {
        stripe: "Stripe",
        paypal: "PayPal",
    };
    return labels[gateway] ?? gateway;
}

function AddCardForm({
    country,
    onSaved,
    onError,
}: {
    country: string | null;
    onSaved: () => void;
    onError: (message: string) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!stripe || !elements) return;
        setSaving(true);
        const { error } = await stripe.confirmSetup({ elements, redirect: "if_required" });
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
                <PaymentElement
                    options={{
                        layout: "tabs",
                        defaultValues: country
                            ? { billingDetails: { address: { country } } }
                            : undefined,
                    }}
                />
            </div>
            <Button type="submit" className="h-11 w-full gap-2" disabled={!stripe || !elements || saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {saving ? "Saving card…" : "Save Card"}
            </Button>
        </form>
    );
}

export default function SavedCardsClient() {
    const { user, isLoading } = useAuth();
    const { site_title } = useSiteSettings();
    const router = useRouter();
    const [data, setData] = useState<SavedPaymentMethodsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [setupSecret, setSetupSecret] = useState<string | null>(null);
    const [publishableKey, setPublishableKey] = useState<string | null>(null);
    const [setupLoading, setSetupLoading] = useState(false);
    const [setupCountry, setSetupCountry] = useState<string | null>(null);
    const [pendingRemove, setPendingRemove] = useState<SavedPaymentMethod | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);
    const [tenantName, setTenantName] = useState<string | null>(null);

    useEffect(() => {
        const fromHost = getTenantNameFromHost(window.location.hostname);
        if (fromHost) {
            setTenantName(fromHost);
            return;
        }

        const fromEnv = process.env.NEXT_PUBLIC_CLIENT_SLUG
            ? toDisplayName(process.env.NEXT_PUBLIC_CLIENT_SLUG)
            : "";
        setTenantName(fromEnv || null);
    }, []);

    const brandName = site_title?.trim() || tenantName || "your streaming service";

    const loadCards = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            setData(await fetchSavedPaymentMethods());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load saved cards.");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!isLoading && !user) router.replace("/login");
    }, [isLoading, router, user]);

    useEffect(() => {
        loadCards();
    }, [loadCards]);

    const stripePromise = useMemo<Promise<Stripe | null> | null>(
        () => (publishableKey ? loadStripe(publishableKey) : null),
        [publishableKey],
    );

    async function openAddCard() {
        setSetupLoading(true);
        setError(null);
        try {
            const country = await getUserCountry(user?.country);
            const setup = await createPaymentMethodSetupIntent();
            if (!setup.stripe_client_secret || !setup.stripe_publishable_key) {
                throw new Error("Card saving is not currently available.");
            }
            setSetupSecret(setup.stripe_client_secret);
            setPublishableKey(setup.stripe_publishable_key);
            setSetupCountry(country);
            setDialogOpen(true);
        } catch (setupError) {
            setError(setupError instanceof Error ? setupError.message : "Could not start card setup.");
        } finally {
            setSetupLoading(false);
        }
    }

    function handleSaved() {
        setDialogOpen(false);
        setSetupSecret(null);
        setPublishableKey(null);
        loadCards();
    }

    async function handleDefault(method: SavedPaymentMethod) {
        setActionId(method.id);
        setError(null);
        try {
            setData(await setDefaultPaymentMethod(method.id));
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Could not update the default card.");
        } finally {
            setActionId(null);
        }
    }

    async function handleRemove() {
        if (!pendingRemove) return;
        setActionId(pendingRemove.id);
        setError(null);
        try {
            setData(await removeSavedPaymentMethod(pendingRemove.id));
            setPendingRemove(null);
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Could not remove the card.");
        } finally {
            setActionId(null);
        }
    }

    if (isLoading || !user) {
        return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
    }

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground">Saved Cards</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage the payment methods used for subscriptions and renewals.
                    </p>
                </div>
                <Button onClick={openAddCard} disabled={setupLoading} className="h-9 shrink-0 gap-2">
                    {setupLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Add Card
                </Button>
            </div>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <section className="space-y-3">
                {loading ? (
                    <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
                ) : data && data.payment_methods.length > 0 ? (
                    data.payment_methods.map((method) => (
                        <div key={method.id} className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <CreditCard size={21} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-semibold text-foreground">{cardLabel(method)}</p>
                                    <p className="text-sm text-muted-foreground">{expiryLabel(method)}</p>
                                    {method.is_default && (
                                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                                            <Check size={13} /> Default card
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Payment method</p>
                                <p className="mt-0.5 text-sm font-medium text-foreground">{gatewayLabel(method.gateway)}</p>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-self-end">
                                {!method.is_default && (
                                    <Button variant="outline" size="sm" onClick={() => handleDefault(method)} disabled={actionId === method.id} className="gap-1.5">
                                        {actionId === method.id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                                        Set default
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => setPendingRemove(method)} disabled={actionId === method.id} aria-label={`Remove ${cardLabel(method)}`}>
                                    <Trash2 size={16} className="text-destructive" />
                                </Button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-12 text-center">
                        <WalletCards className="mx-auto mb-3 text-muted-foreground" size={30} />
                        <h2 className="font-semibold text-foreground">No saved cards</h2>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                            Add a card to make future subscription renewals faster and more reliable.
                        </p>
                    </div>
                )}

                {data?.paypal_connected && (
                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0070ba]/10 text-sm font-black text-[#0070ba]">P</div>
                        <div>
                            <p className="font-semibold text-foreground">PayPal account connected</p>
                            <p className="text-sm text-muted-foreground">Available for eligible future payments</p>
                        </div>
                    </div>
                )}
            </section>

            <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-secondary/20 p-4 text-sm text-muted-foreground">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                <p>Your card details are securely stored by Stripe. {brandName} only receives masked card information and never stores your full card number or security code.</p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setSetupSecret(null); setPublishableKey(null); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add a saved card</DialogTitle>
                        <DialogDescription>Use this card for future subscriptions and renewals.</DialogDescription>
                    </DialogHeader>
                    {stripePromise && setupSecret && (
                        <Elements stripe={stripePromise} options={{ clientSecret: setupSecret }}>
                            <AddCardForm country={setupCountry} onSaved={handleSaved} onError={setError} />
                        </Elements>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(open) => !open && setPendingRemove(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove saved card?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRemove ? `${cardLabel(pendingRemove)} will no longer be available for future payments.` : "This card will be removed."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} disabled={Boolean(actionId)}>Remove card</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
