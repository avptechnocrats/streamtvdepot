"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    getPaginationItems,
} from "@/components/ui/pagination";
import {
    CheckCircle2,
    XCircle,
    Clock,
    RotateCcw,
    CreditCard,
    Search,
    RefreshCw,
    Ghost,
    FileText,
    DollarSign,
    Download,
    Eye,
    Loader2,
    X,
} from "lucide-react";
import {
    listAdminPayments,
    listAdminInvoices,
    type PaymentOut,
    type PaymentStatus,
    type InvoiceOut,
} from "@/lib/api";
import { downloadPDFFromAPI } from "@/lib/pdf-download";
import { formatLocalDateTime } from "@/lib/utils";

// ── Status helpers ────────────────────────────────────────────────────────────

type StatusFilter = "all" | PaymentStatus;

const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: DollarSign },
    { key: "SUCCESS", label: "Successful", icon: CheckCircle2 },
    { key: "PENDING", label: "Pending", icon: Clock },
    { key: "FAILED", label: "Failed", icon: XCircle },
    { key: "REFUNDED", label: "Refunded", icon: RotateCcw },
    { key: "ABANDONED", label: "Abandoned", icon: Ghost },
];

function StatusBadge({ status }: { status: PaymentStatus }) {
    const cfg: Record<PaymentStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
        SUCCESS:   { label: "Success",   cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", Icon: CheckCircle2 },
        PENDING:   { label: "Pending",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",   Icon: Clock },
        FAILED:    { label: "Failed",    cls: "bg-red-500/10 text-red-400 border-red-500/20",          Icon: XCircle },
        REFUNDED:  { label: "Refunded",  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",       Icon: RotateCcw },
        ABANDONED: { label: "Abandoned", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20",    Icon: Ghost },
    };
    const { label, cls, Icon } = cfg[status] ?? cfg.PENDING;
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cls}`}>
            <Icon size={10} />
            {label}
        </span>
    );
}

function methodLabel(m: string) {
    return {
        stripe: "Stripe",
        paypal: "PayPal",
        razorpay: "Razorpay",
        paytm: "Paytm",
        upi: "UPI",
        bank_transfer: "Bank Transfer",
        wallet: "Wallet",
        other: "Other",
    }[m] ?? m;
}

// ── Row skeleton ──────────────────────────────────────────────────────────────

function RowSkeletonP() {
    function B({ w }: { w: string }) {
        return <div className={`h-3.5 ${w} rounded bg-muted animate-pulse`} />;
    }
    return (
        <div className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
            <B w="w-28" />
            <B w="w-48 hidden sm:block" />
            <B w="w-20 hidden md:block" />
            <B w="w-28 hidden md:block" />
            <B w="flex-1" />
            <B w="w-24 hidden lg:block" />
            <B w="w-28 hidden lg:block" />
        </div>
    );
}
function RowSkeletonI() {
    function B({ w }: { w: string }) {
        return <div className={`h-3.5 ${w} rounded bg-muted animate-pulse`} />;
    }
    return (
        <div className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
            <B w="w-36" />
            <B w="w-48 hidden sm:block" />
            <B w="flex-1" />
            <B w="w-20 hidden lg:block" />
            <B w="w-24 hidden lg:block" />
            <B w="w-20 hidden lg:block" />
        </div>
    );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type TabKey = "payments" | "invoices";

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function AdminTransactionsPage() {
    const [tab, setTab] = useState<TabKey>("payments");
    const [payments, setPayments] = useState<PaymentOut[]>([]);
    const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
    const [hasMorePayments, setHasMorePayments] = useState(false);
    const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [viewingInvoice, setViewingInvoice] = useState<InvoiceOut | null>(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (tab === "payments") {
                const data = await listAdminPayments({ page, page_size: PAGE_SIZE + 1 });
                setPayments(data.slice(0, PAGE_SIZE));
                setHasMorePayments(data.length > PAGE_SIZE);
                setHasMoreInvoices(false);
            } else {
                const data = await listAdminInvoices({ page, page_size: PAGE_SIZE + 1 });
                setInvoices(data.slice(0, PAGE_SIZE));
                setHasMoreInvoices(data.length > PAGE_SIZE);
                setHasMorePayments(false);
            }
        } catch {
            setError("Failed to load data. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [tab, page]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset page when tab / filter changes
    useEffect(() => { setPage(1); }, [tab, statusFilter]);

    // Client-side filter + search for the current page
    const filteredPayments = payments.filter((p) => {
        const matchStatus = statusFilter === "all" || p.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch = !q || p.id.includes(q) || p.user_id.includes(q) ||
            (p.user_name ?? "").toLowerCase().includes(q) ||
            (p.user_email ?? "").toLowerCase().includes(q) ||
            (p.gateway_transaction_id ?? "").toLowerCase().includes(q) ||
            (p.reference_type ?? "").toLowerCase().includes(q);
        return matchStatus && matchSearch;
    });

    const filteredInvoices = invoices.filter((inv) => {
        const q = search.toLowerCase();
        return !q || inv.invoice_number.toLowerCase().includes(q) ||
            inv.user_id.includes(q) || inv.id.includes(q) ||
            (inv.user_name ?? "").toLowerCase().includes(q) ||
            (inv.user_email ?? "").toLowerCase().includes(q);
    });

    const hasMore = tab === "payments" ? hasMorePayments : hasMoreInvoices;
    const showPageControls = page > 1 || hasMore;
    const estimatedTotalPages = Math.max(1, page + (hasMore ? 1 : 0));
    const pageNumbers = getPaginationItems(page, estimatedTotalPages);

    function countFor(key: StatusFilter) {
        if (key === "all") return payments.length;
        return payments.filter((p) => p.status === key).length;
    }

    async function handleDownloadInvoice(invoice: InvoiceOut) {
        setDownloadingInvoiceId(invoice.id);
        try {
            await downloadPDFFromAPI(
                `/admin/payments/invoices/${invoice.id}/pdf`,
                `invoice-${invoice.invoice_number}.pdf`,
            );
        } finally {
            setDownloadingInvoiceId(null);
        }
    }

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Transactions</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        All monetary transactions made by end users on your platform
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {/* Tabs and search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {([["payments", "Payments", CreditCard], ["invoices", "Invoices", FileText]] as [TabKey, string, React.ElementType][]).map(([key, label, Icon]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                tab === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    ))}
                </div>
                <div className="relative w-full sm:w-80">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={tab === "payments" ? "Search by user, gateway ID…" : "Search by invoice number, user…"}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 h-10 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            {tab === "payments" && (
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit flex-wrap">
                    {STATUS_TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                statusFilter === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            {key !== "all" && (
                                <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                    {countFor(key)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Table card */}
            <div className="rounded-xl border border-border overflow-hidden">

                {/* Payments table */}
                {tab === "payments" && (
                    <>
                        {/* Column headers */}
                        <div className="flex items-center gap-4 px-4 py-2.5 bg-secondary/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <span className="w-28 shrink-0">Amount</span>
                            <span className="hidden sm:block w-48 shrink-0">User</span>
                            <span className="hidden md:block w-20 shrink-0">Method</span>
                            <span className="hidden md:block w-28 shrink-0">Type</span>
                            <span className="flex-1">Reference</span>
                            <span className="w-24 shrink-0 text-center">Status</span>
                            <span className="hidden md:block w-28 shrink-0">Date</span>
                        </div>

                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => <RowSkeletonP key={i} />)
                        ) : error ? (
                            <div className="py-16 text-center text-sm text-muted-foreground">{error}</div>
                        ) : filteredPayments.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-16">
                                <CreditCard size={32} className="text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No transactions found</p>
                            </div>
                        ) : (
                            filteredPayments.map((p) => (
                                <div key={p.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                    {/* Amount */}
                                    <p className="w-28 shrink-0 text-sm font-semibold text-foreground tabular-nums">
                                        {p.currency} {p.amount.toFixed(2)}
                                    </p>

                                    {/* User */}
                                    <div className="hidden sm:flex sm:flex-col w-48 shrink-0 min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate" title={p.user_name ?? p.user_id}>
                                            {p.user_name ?? "—"}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground truncate" title={p.user_email ?? p.user_id}>
                                            {p.user_email ?? p.user_id.split("-")[0]}
                                        </p>
                                    </div>

                                    {/* Gateway */}
                                    <p className="hidden md:block w-20 shrink-0 text-xs text-muted-foreground">
                                        {methodLabel(p.payment_method)}
                                    </p>

                                    {/* Type */}
                                    <p className="hidden md:block w-28 shrink-0 text-xs text-muted-foreground">
                                        {p.reference_type && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded mr-1.5">
                                                {p.reference_type}
                                            </span>
                                        )}
                                    </p>

                                    {/* Reference */}
                                    <div className="flex-1 min-w-0">
                                        {p.gateway_transaction_id && (
                                            <span className="text-xs font-mono text-muted-foreground truncate" title={p.gateway_transaction_id}>
                                                {p.gateway_transaction_id.slice(0, 24)}{p.gateway_transaction_id.length > 24 ? "…" : ""}
                                            </span>
                                        )}
                                    </div>

                                    {/* Status */}
                                    <div className="w-24 shrink-0 text-center">
                                        <StatusBadge status={p.status} />
                                    </div>

                                    {/* Date */}
                                    <p className="hidden md:block w-28 shrink-0 text-xs text-muted-foreground">
                                        {formatLocalDateTime(p.created_at)}
                                    </p>
                                </div>
                            ))
                        )}
                    </>
                )}

                {/* Invoices table */}
                {tab === "invoices" && (
                    <>
                        <div className="flex items-center gap-4 px-4 py-2.5 bg-secondary/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <span className="w-36 shrink-0">Invoice #</span>
                            <span className="hidden sm:block w-48 shrink-0">User</span>
                            <span className="flex-1">Amount</span>
                            <span className="hidden md:block w-20 shrink-0">Tax</span>
                            <span className="hidden lg:block w-24 shrink-0">Issued</span>
                            <span className="w-20 shrink-0 text-center">Actions</span>
                        </div>

                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => <RowSkeletonI key={i} />)
                        ) : error ? (
                            <div className="py-16 text-center text-sm text-muted-foreground">{error}</div>
                        ) : filteredInvoices.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-16">
                                <CreditCard size={32} className="text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No invoices found</p>
                            </div>
                        ) : (
                            filteredInvoices.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                    <p className="w-36 shrink-0 text-sm font-mono text-foreground">{inv.invoice_number}</p>
                                    <div className="hidden sm:flex sm:flex-col w-48 shrink-0 min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate" title={inv.user_name ?? inv.user_id}>
                                            {inv.user_name ?? "—"}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground truncate" title={inv.user_email ?? inv.user_id}>
                                            {inv.user_email ?? inv.user_id.split("-")[0]}
                                        </p>
                                    </div>
                                    <p className="flex-1 text-sm font-semibold text-foreground tabular-nums">
                                        {inv.currency} {inv.amount.toFixed(2)}
                                    </p>
                                    <p className="hidden md:block w-20 shrink-0 text-xs text-muted-foreground">
                                        {inv.currency} {inv.tax_amount.toFixed(2)}
                                    </p>
                                    <p className="hidden lg:block w-24 shrink-0 text-xs text-muted-foreground">
                                        {formatLocalDateTime(inv.issued_at)}
                                    </p>
                                    <div className="flex w-20 shrink-0 items-center justify-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setViewingInvoice(inv)}
                                            aria-label="View invoice"
                                            title="View invoice"
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                        >
                                            <Eye size={15} />
                                        </button>
                                        {/* <button
                                            type="button"
                                            disabled={downloadingInvoiceId === inv.id}
                                            onClick={() => void handleDownloadInvoice(inv)}
                                            aria-label="Download invoice"
                                            title="Download invoice"
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            {downloadingInvoiceId === inv.id
                                                ? <Loader2 size={15} className="animate-spin" />
                                                : <Download size={15} />}
                                        </button> */}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>

            {viewingInvoice && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Invoice ${viewingInvoice.invoice_number}`}
                    onClick={() => setViewingInvoice(null)}
                >
                    <div
                        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex h-12 items-center justify-between border-b border-border/60 px-4">
                            <p className="truncate pr-3 text-sm font-semibold text-foreground">
                                Invoice {viewingInvoice.invoice_number}
                            </p>
                            <button
                                type="button"
                                onClick={() => setViewingInvoice(null)}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                aria-label="Close invoice preview"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-4 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Billed By</p>
                                    <p className="mt-1 text-lg font-bold text-foreground">
                                        {viewingInvoice.client_name || "Client"}
                                    </p>
                                    {viewingInvoice.client_address && (
                                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                                            {viewingInvoice.client_address}
                                        </p>
                                    )}
                                </div>
                                {viewingInvoice.client_logo_url && (
                                    <img
                                        src={viewingInvoice.client_logo_url}
                                        alt={`${viewingInvoice.client_name || "Client"} logo`}
                                        className="h-10 max-w-40 object-contain"
                                    />
                                )}
                            </div>
                            <div className="border-t border-border/60 pt-4">
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Billed To</p>
                                <p className="mt-1 text-lg font-bold text-foreground">
                                    {viewingInvoice.user_name || "End User"}
                                </p>
                                {viewingInvoice.user_email && (
                                    <p className="mt-1 text-sm text-muted-foreground">{viewingInvoice.user_email}</p>
                                )}
                                {viewingInvoice.user_address && (
                                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                                        {viewingInvoice.user_address}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice Number</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">{viewingInvoice.invoice_number}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Amount</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {viewingInvoice.currency} {viewingInvoice.amount.toFixed(2)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tax</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {viewingInvoice.currency} {viewingInvoice.tax_amount.toFixed(2)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Issued On</p>
                                    <p className="mt-1 text-sm font-semibold text-foreground">
                                        {formatLocalDateTime(viewingInvoice.issued_at)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => void handleDownloadInvoice(viewingInvoice)}
                                    disabled={downloadingInvoiceId === viewingInvoice.id}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {downloadingInvoiceId === viewingInvoice.id
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : <Download size={14} />}
                                    Download PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewingInvoice(null)}
                                    className="rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {!loading && (tab === "payments" ? filteredPayments.length > 0 : filteredInvoices.length > 0) && (
                <div className="flex items-center justify-between">
                    <p className="w-full text-xs text-muted-foreground">
                        Page {page} · {tab === "payments" ? filteredPayments.length : filteredInvoices.length} records shown
                    </p>

                    {showPageControls && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 1) setPage((p) => p - 1);
                                        }}
                                        aria-disabled={page === 1 || loading}
                                        className={page === 1 || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>

                                {pageNumbers.map((item, index) => (
                                    <PaginationItem key={`${item}-${index}`}>
                                        {item === "ellipsis" ? (
                                            <PaginationEllipsis />
                                        ) : (
                                            <PaginationLink
                                                href="#"
                                                isActive={item === page}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setPage(item);
                                                }}
                                            >
                                                {item}
                                            </PaginationLink>
                                        )}
                                    </PaginationItem>
                                ))}

                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (hasMore) setPage((p) => p + 1);
                                        }}
                                        aria-disabled={!hasMore || loading}
                                        className={!hasMore || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}
        </div>
    );
}
