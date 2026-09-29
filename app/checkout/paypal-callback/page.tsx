"use client";

/**
 * /checkout/paypal-callback
 *
 * PayPal redirects here after the user approves (or cancels) a payment.
 * URL params injected by PayPal:
 *   token    → the PayPal order_id
 *   PayerID  → the payer identifier (present on approval, absent on cancel)
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { confirmCheckout } from "@/lib/services/checkout";
import { Button } from "@/components/ui/button";

export default function PayPalCallbackPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 size={48} className="animate-spin text-primary" />
                </div>
            }
        >
            <PayPalCallbackInner />
        </Suspense>
    );
}

function PayPalCallbackInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "success" | "cancelled" | "error">("loading");
    const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const returnTo = searchParams.get("returnTo") ?? (typeof window !== "undefined"
        ? (sessionStorage.getItem("sv_checkout_return_to") ?? "/")
        : "/");

    useEffect(() => {
        const token = searchParams.get("token");       // PayPal order_id
        const payerId = searchParams.get("PayerID");   // absent if user cancelled

        // If no PayerID the user clicked "Cancel" on PayPal
        if (!payerId) {
            setStatus("cancelled");
            return;
        }

        const paymentId = sessionStorage.getItem("sv_paypal_payment_id");
        sessionStorage.removeItem("sv_paypal_payment_id");
        sessionStorage.removeItem("sv_checkout_return_to");

        if (!paymentId || !token) {
            setStatus("error");
            setErrorMsg("Payment reference not found. If you were charged, please contact support.");
            return;
        }

        confirmCheckout({
            payment_id: paymentId,
            paypal_order_id: token,
            paypal_payer_id: payerId,
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
                        <p className="text-muted-foreground">Confirming your payment…</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <ShieldCheck size={48} className="text-green-500 mx-auto" />
                        <h1 className="text-2xl font-black">Payment Successful!</h1>
                        {invoiceNumber && (
                            <p className="text-sm text-muted-foreground">
                                Invoice: <strong>{invoiceNumber}</strong>
                            </p>
                        )}
                        <Button onClick={() => router.push(returnTo)}>Start Watching</Button>
                    </>
                )}

                {status === "cancelled" && (
                    <>
                        <XCircle size={48} className="text-muted-foreground mx-auto" />
                        <h1 className="text-2xl font-black">Payment Cancelled</h1>
                        <p className="text-sm text-muted-foreground">
                            Your payment was not completed. You have not been charged.
                        </p>
                        <Button variant="outline" onClick={() => router.back()}>
                            Go Back
                        </Button>
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
