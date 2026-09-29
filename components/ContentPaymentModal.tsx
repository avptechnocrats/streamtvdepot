"use client";

/**
 * ContentPaymentModal
 *
 * Displayed when a logged-in user tries to watch a Rent or PPV piece of content
 * they haven't purchased yet.
 *
 * Flow:
 *  1. Load available plans of the given type (rent | ppv)
 *  2. If only one plan  → auto-select and go to payment
 *  3. If multiple plans → show plan cards; user picks one
 *  4. Delegates to CheckoutModal for the actual payment step
 */

import { useEffect, useState } from "react";
import { Loader2, Clock, Check, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchSubscriptionPlans, type SubscriptionPlan } from "@/lib/services/subscription-plans";
import CheckoutModal from "@/components/CheckoutModal";

interface ContentPaymentModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (invoiceNumber: string) => void;
    /** The video/livestream ID to unlock */
    contentId: string;
    /** "rent" for VOD, "ppv" for live events */
    planType: "rent" | "ppv";
    /** Shown in the modal title */
    contentTitle: string;
}

export default function ContentPaymentModal({
    open,
    onClose,
    onSuccess,
    contentId,
    planType,
    contentTitle,
}: ContentPaymentModalProps) {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
    const [showCheckout, setShowCheckout] = useState(false);

    // Reset state when modal opens
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setError("");
        setSelectedPlan(null);
        setShowCheckout(false);

        fetchSubscriptionPlans(planType)
            .then((data) => {
                const active = data.filter((p) => p.is_active);
                setPlans(active);
                if (active.length === 0) {
                    setError(`No ${planType === "ppv" ? "PPV" : "rental"} plans are currently available.`);
                } else if (active.length === 1) {
                    // Only one plan — skip plan picker, go straight to payment
                    setSelectedPlan(active[0]);
                    setShowCheckout(true);
                }
            })
            .catch(() => setError("Could not load plans. Please try again."))
            .finally(() => setLoading(false));
    }, [open, planType]);

    const handleSelectPlan = (plan: SubscriptionPlan) => {
        setSelectedPlan(plan);
        setShowCheckout(true);
    };

    const typeLabel = planType === "ppv" ? "PPV Event" : "Rental";
    const accessLabel = planType === "ppv" ? "Watch Event" : "Rent";

    // If checkout modal is showing (with a selected plan), render it on top
    if (showCheckout && selectedPlan) {
        return (
            <CheckoutModal
                open={open}
                plan={selectedPlan}
                contentId={contentId}
                onClose={onClose}
                onSuccess={onSuccess}
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{accessLabel}: {contentTitle}</DialogTitle>
                </DialogHeader>

                <div className="mt-2">
                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-3 py-8 text-center flex-col">
                            <AlertCircle size={36} className="text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{error}</p>
                            <Button variant="outline" onClick={onClose}>Close</Button>
                        </div>
                    )}

                    {!loading && !error && plans.length > 1 && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Choose a {typeLabel.toLowerCase()} option for <strong>{contentTitle}</strong>:
                            </p>
                            <div className="space-y-2">
                                {plans.map((plan) => {
                                    const days = plan.restriction_days ?? (planType === "ppv" ? 1 : 2);
                                    return (
                                        <button
                                            key={plan.id}
                                            onClick={() => handleSelectPlan(plan)}
                                            className="w-full flex items-center justify-between p-4 rounded-xl border border-border/60 hover:border-primary hover:bg-primary/5 transition-all text-left group"
                                        >
                                            <div className="space-y-0.5">
                                                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                                    {plan.name}
                                                </p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Clock size={11} />
                                                    <span>
                                                        {planType === "ppv"
                                                            ? `Access for ${days} day${days !== 1 ? "s" : ""}`
                                                            : `Rent for ${days} day${days !== 1 ? "s" : ""}`}
                                                    </span>
                                                    {plan.description && (
                                                        <span>· {plan.description}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0 ml-4">
                                                <p className="font-black text-lg text-foreground">
                                                    {plan.currency}&nbsp;{plan.price.toFixed(2)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">one-time</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
