"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    CreditCard,
    RefreshCw,
    Eye,
    Download,
    Loader2,
    X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/hooks/use-auth";
import {
    fetchMyTransactions,
    fetchTransactionReceipt,
    fetchTransactionReceiptPdf,
    type UserTransactionReceipt,
    type UserTransaction,
    type TransactionStatus,
} from "@/lib/services/checkout";

// ── Helpers ───────────────────────────────────────────────────────────────────

function methodLabel(m: string): string {
    return ({
        stripe: "Stripe",
        paypal: "PayPal",
        razorpay: "Razorpay",
        paytm: "Paytm",
        upi: "UPI",
        bank_transfer: "Bank Transfer",
        wallet: "Wallet",
        other: "Other",
    } as Record<string, string>)[m] ?? m;
}

function referenceLabel(type: string | null): string {
    if (!type) return "";
    return ({ subscription: "Subscription", ppv: "PPV Event", rental: "Rental" } as Record<string, string>)[type] ?? type;
}

function receiptItemLabel(receipt: UserTransactionReceipt): string {
    return `${referenceLabel(receipt.reference_type) || "Purchase"} - ${receipt.plan_name || "Content access"}`;
}

function statusLabel(status: TransactionStatus): string {
    return ({
        SUCCESS: "Success",
        PENDING: "Processing",
        FAILED: "Failed",
        REFUNDED: "Refunded",
        ABANDONED: "Abandoned",
    } as Record<TransactionStatus, string>)[status];
}

function statusClass(status: TransactionStatus): string {
    return ({
        SUCCESS: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        FAILED: "bg-red-500/10 text-red-500 border-red-500/20",
        REFUNDED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        ABANDONED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    } as Record<TransactionStatus, string>)[status];
}

function transactionDate(transaction: UserTransaction): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date(transaction.paid_at ?? transaction.created_at));
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function TransactionSkeleton() {
    return (
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border/50 last:border-0">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
            </div>
            <div className="text-right space-y-1.5 shrink-0">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
        </div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <CreditCard size={24} className="text-muted-foreground/50" />
            </div>
            <div className="space-y-1">
                <p className="font-semibold text-foreground">No transactions yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Your payment history will appear here once you make a purchase.
                </p>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type StatusFilter = "all" | TransactionStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "SUCCESS", label: "Successful" },
    { key: "PENDING", label: "Processing" },
    { key: "FAILED", label: "Failed" },
    { key: "REFUNDED", label: "Refunded" },
    { key: "ABANDONED", label: "Abandoned" },
];

const PAGE_SIZE = 10;

export default function TransactionsClient() {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [transactions, setTransactions] = useState<UserTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [activeActionId, setActiveActionId] = useState<string | null>(null);
    const [viewReceipt, setViewReceipt] = useState<UserTransactionReceipt | null>(null);

    const closeReceiptModal = () => {
        setViewReceipt(null);
    };

    useEffect(() => {
        if (!viewReceipt) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeReceiptModal();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [viewReceipt]);

    async function handleReceiptAction(
        tx: UserTransaction,
        action: "view" | "download",
    ) {
        try {
            setActiveActionId(`${tx.id}:${action}`);
            if (action === "view") {
                const receipt = await fetchTransactionReceipt(tx.id);
                setViewReceipt(receipt);
                return;
            }

            const blob = await fetchTransactionReceiptPdf(tx.id, true);
            const url = URL.createObjectURL(blob);

            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `receipt-${tx.invoice_number ?? tx.id}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch {
            setError("Could not open/download receipt. Please try again.");
        } finally {
            setActiveActionId(null);
        }
    }

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, user, router]);

    const loadPage = (p: number) => {
        if (!user) return;
        setLoading(true);
        setError("");
        fetchMyTransactions({
            page: p,
            page_size: PAGE_SIZE + 1,
            ...(statusFilter === "all" ? {} : { status: statusFilter }),
        })
            .then((data) => {
                setTransactions(data.slice(0, PAGE_SIZE));
                setHasMore(data.length > PAGE_SIZE);
            })
            .catch(() => setError("Could not load transactions. Please try again."))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (user) loadPage(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, page, statusFilter]);

    if (authLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48 rounded mb-6" />
                {Array.from({ length: 4 }).map((_, i) => <TransactionSkeleton key={i} />)}
            </div>
        );
    }

    if (!user) return null;

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-black text-foreground tracking-tight">Transactions</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Your complete payment history</p>
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1 flex-wrap mb-5 items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                    {STATUS_TABS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => {
                                setStatusFilter(key);
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === key
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "text-muted-foreground bg-secondary border border-border hover:text-foreground"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => loadPage(page)}
                    disabled={loading}
                    className="flex px-3 py-1.5 gap-1.5 items-center text-xs rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {/* Transaction table */}
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                {loading ? (
                    Array.from({ length: 5 }).map((_, i) => <TransactionSkeleton key={i} />)
                ) : error ? (
                    <div className="py-12 text-center">
                        <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left">
                            <thead className="border-b border-border/50 bg-muted/20">
                                <tr>
                                    {['Date', 'Transaction Type', 'Payment ID', 'Payment Method', 'Amount', 'Status', 'Actions'].map((heading) => (
                                        <th key={heading} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t) => {
                                    const paymentId = t.gateway_transaction_id || t.id;
                                    const actionBusy = activeActionId === `${t.id}:view` || activeActionId === `${t.id}:download`;

                                    return (
                                        <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-5 py-4 text-sm text-foreground whitespace-nowrap">{transactionDate(t)}</td>
                                            <td className="px-5 py-4 text-sm text-foreground whitespace-nowrap">{referenceLabel(t.reference_type) || "-"}</td>
                                            <td className="px-5 py-4 text-xs font-mono text-muted-foreground max-w-[220px] truncate" title={paymentId}>{paymentId}</td>
                                            <td className="px-5 py-4 text-sm text-foreground whitespace-nowrap">{methodLabel(t.payment_method)}</td>
                                            <td className="px-5 py-4 text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">{t.currency} {t.amount.toFixed(2)}</td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${statusClass(t.status)}`}>
                                                    {statusLabel(t.status)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                {t.status === "SUCCESS" ? (
                                                    <div className="flex gap-1.5">
                                                        <button type="button" onClick={() => handleReceiptAction(t, "view")} disabled={actionBusy} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50">
                                                            {activeActionId === `${t.id}:view` ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                                                            View
                                                        </button>
                                                        <button type="button" onClick={() => handleReceiptAction(t, "download")} disabled={actionBusy} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50">
                                                            {activeActionId === `${t.id}:download` ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                                                            Download
                                                        </button>
                                                    </div>
                                                ) : <span className="text-xs text-muted-foreground">-</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {!loading && !error && (page > 1 || transactions.length > 0) && (
                <Pagination
                    page={page}
                    hasNextPage={hasMore}
                    loading={loading}
                    onPageChange={setPage}
                />
            )}

            {viewReceipt && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={closeReceiptModal}
                >
                    <div
                        className="relative w-full max-w-2xl rounded-2xl overflow-hidden bg-card border border-border/60 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-12 px-4 border-b border-border/60 flex items-center justify-between bg-card">
                            <p className="text-sm font-semibold text-foreground truncate pr-3">Transaction Receipt</p>
                            <button
                                type="button"
                                onClick={closeReceiptModal}
                                className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                aria-label="Close receipt preview"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Billed By</p>
                                    <p className="text-lg font-bold text-foreground">{viewReceipt.tenant_name}</p>
                                </div>
                                {viewReceipt.tenant_logo_url && (
                                    <img
                                        src={viewReceipt.tenant_logo_url}
                                        alt={`${viewReceipt.tenant_name} logo`}
                                        className="h-10 max-w-[160px] object-contain"
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Created At</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {new Date(viewReceipt.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paid At</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewReceipt.paid_at ? new Date(viewReceipt.paid_at).toLocaleString() : "-"}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Payment Method</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">{methodLabel(viewReceipt.payment_method)}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Invoice Number</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">{viewReceipt.invoice_number}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Payment Status</p>
                                    <p className="text-sm font-semibold text-emerald-600 mt-1">{viewReceipt.status}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Transaction ID</p>
                                    <p className="text-sm font-mono text-foreground mt-1 break-all">
                                        {viewReceipt.transaction_id || "-"}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Item</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">{receiptItemLabel(viewReceipt)}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewReceipt.plan_amount != null ? `${viewReceipt.currency} ${viewReceipt.plan_amount.toFixed(2)}` : "-"}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Discount</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewReceipt.discount_amount != null ? `${viewReceipt.currency} ${viewReceipt.discount_amount.toFixed(2)}` : "-"}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Tax</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewReceipt.currency} {viewReceipt.tax_amount.toFixed(2)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewReceipt.currency} {viewReceipt.amount.toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => closeReceiptModal()}
                                    className="px-3 py-1.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
