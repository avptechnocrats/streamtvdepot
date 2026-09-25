import type { BillingPaymentHistoryItem } from "@/lib/api";

function normalizeCurrencyCode(currency: string | null | undefined): string {
    const value = currency?.trim().toUpperCase();
    if (!value) return "USD";
    if (value === "RS" || value === "RUPEE" || value === "RUPEES" || value === "₹") {
        return "INR";
    }
    return value;
}

export function resolveInvoiceCurrency(invoice: Pick<BillingPaymentHistoryItem, "currency" | "payment_method">): string {
    return normalizeCurrencyCode(invoice.currency);
}

export function formatCurrencyAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(amount);
}