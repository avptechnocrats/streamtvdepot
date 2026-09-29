"use client";

/**
 * /checkout/success
 *
 * Stripe redirects here after 3DS card authentication.
 * Reads `payment_intent` from the URL, calls our confirm endpoint.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { confirmCheckout } from "@/lib/services/checkout";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccessPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 size={48} className="animate-spin text-primary" />
                </div>
            }
        >
            <CheckoutSuccessInner />
        </Suspense>
    );
}

function CheckoutSuccessInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const returnTo = searchParams.get("returnTo") ?? (typeof window !== "undefined"
        ? (sessionStorage.getItem("sv_checkout_return_to") ?? "/")
        : "/");

    useEffect(() => {
        const paymentIntentId = searchParams.get("payment_intent");
        const paymentId = sessionStorage.getItem("sv_stripe_payment_id");
        sessionStorage.removeItem("sv_stripe_payment_id");
        sessionStorage.removeItem("sv_checkout_return_to");

        if (!paymentIntentId || !paymentId) {
            setStatus("error");
            setErrorMsg("Payment reference not found.");
            return;
        }

        confirmCheckout({
            payment_id: paymentId,
            stripe_payment_intent_id: paymentIntentId,
        })
            .then((res) => {
                setInvoiceNumber(res.invoice_number);
                setStatus("success");
            })
            .catch((err) => {
                const detail = err?.response?.data?.detail ?? "Could not confirm your payment.";
                setErrorMsg(detail);
                setStatus("error");
            });
    }, [searchParams]);

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-sm w-full text-center space-y-5">
                {status === "loading" && (
                    <>
                        <Loader2 size={48} className="animate-spin text-primary mx-auto" />
                        <p className="text-muted-foreground">Activating your subscription…</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <ShieldCheck size={48} className="text-green-500 mx-auto" />
                        <h1 className="text-2xl font-black">You&apos;re All Set!</h1>
                        {invoiceNumber && (
                            <p className="text-sm text-muted-foreground">
                                Invoice: <strong>{invoiceNumber}</strong>
                            </p>
                        )}
                        <Button onClick={() => router.push(returnTo)}>Start Watching</Button>
                    </>
                )}

                {status === "error" && (
                    <>
                        <XCircle size={48} className="text-destructive mx-auto" />
                        <h1 className="text-2xl font-black">Something Went Wrong</h1>
                        <p className="text-sm text-muted-foreground">{errorMsg}</p>
                        <Button variant="outline" onClick={() => router.push(returnTo)}>
                            Go Back
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
