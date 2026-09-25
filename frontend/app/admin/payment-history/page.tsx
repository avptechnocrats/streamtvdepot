"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, CreditCard, RefreshCw, Download, Eye, Loader2, X } from "lucide-react";
import { fetchBillingPaymentHistory, type BillingPaymentHistoryItem } from "@/lib/api";
import { fetchPlatformIssuerInfo, fetchSiteSettings } from "@/lib/api/services/site-settings";
import { formatCurrencyAmount, resolveInvoiceCurrency } from "@/lib/currency";
import { downloadInvoicePDF, downloadReceiptPDF, type BillTo } from "@/lib/invoice-utils";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { getAdminDisplayName } from "@/lib/admin-auth";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 20;

function money(amount: number, currency: string): string {
    return formatCurrencyAmount(amount, currency || "USD");
}

function formatDate(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === "paid") return "bg-emerald-500/12 text-emerald-400 border-emerald-500/20";
    if (s === "pending") return "bg-amber-500/12 text-amber-400 border-amber-500/20";
    if (s === "failed") return "bg-red-500/12 text-red-400 border-red-500/20";
    if (s === "refunded") return "bg-blue-500/12 text-blue-400 border-blue-500/20";
    return "bg-muted text-muted-foreground border-border";
}

export default function PaymentHistoryPage() {
    const { session } = useAdminAuth();
    const [rows, setRows] = useState<BillingPaymentHistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [address, setAddress] = useState<string>("");
    const [billTo, setBillTo] = useState<BillTo>({ name: null, companyName: null, address1: null, address2: null });
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
    const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
    const [viewingDoc, setViewingDoc] = useState<{ type: "receipt" | "invoice"; data: BillingPaymentHistoryItem } | null>(null);
    const [issuerInfo, setIssuerInfo] = useState<{ company_name: string | null; logo_url: string | null }>({ company_name: null, logo_url: null });
    const [siteSettings, setSiteSettings] = useState<{ general: { site_title: string | null; logo_url: string | null }; client_name: string | null }>({ general: { site_title: null, logo_url: null }, client_name: null });

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchBillingPaymentHistory({ page, page_size: PAGE_SIZE });
            setRows(data.items ?? []);
            setTotal(data.total ?? 0);

            // Fetch platform (SignalView) issuer info for invoice footer
            // and site settings for the BILL TO section
            try {
                const [issuer, settings] = await Promise.all([
                    fetchPlatformIssuerInfo(),
                    fetchSiteSettings(),
                ]);
                const addressParts: string[] = [];
                if (issuer.address1) addressParts.push(issuer.address1);
                if (issuer.address2) addressParts.push(issuer.address2);
                if (addressParts.length > 0) setAddress(addressParts.join("\n"));

                setIssuerInfo({ company_name: issuer.company_name, logo_url: issuer.logo_url });
                setSiteSettings({ general: { site_title: settings.general.site_title, logo_url: settings.general.logo_url }, client_name: settings.client_name });

                setBillTo({
                    name: getAdminDisplayName(session),
                    companyName: settings.general.site_title,
                    address1: settings.general.address1,
                    address2: settings.general.address2,
                });
            } catch {
                // Silently fail if issuer/settings can't be fetched
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load payment history.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [page]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleDownloadInvoice = async (row: BillingPaymentHistoryItem) => {
        setDownloadingInvoiceId(row.id);
        await downloadInvoicePDF(row, billTo, address);
        setDownloadingInvoiceId(null);
    };

    const handleDownloadReceipt = async (row: BillingPaymentHistoryItem) => {
        setDownloadingReceiptId(row.id);
        await downloadReceiptPDF(row, address);
        setDownloadingReceiptId(null);
    };

    const handleViewInvoice = (row: BillingPaymentHistoryItem) => {
        setViewingDoc({ type: "invoice", data: row });
    };

    const handleViewReceipt = (row: BillingPaymentHistoryItem) => {
        setViewingDoc({ type: "receipt", data: row });
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Payment History</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        All client-admin SaaS subscription and upgrade transactions.
                    </p>
                </div>
                <button
                    onClick={() => void load()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <span className="col-span-2">Paid On</span>
                    <span className="col-span-2">Invoice #</span>
                    <span className="col-span-1">Method</span>
                    <span className="col-span-2">Amount</span>
                    <span className="col-span-1">Status</span>
                    <span className="col-span-1">Plan</span>
                    <span className="col-span-2 text-center">Receipt</span>
                    <span className="col-span-1 text-center">Invoice</span>
                </div>

                {loading ? (
                    <div className="px-4 py-10 text-sm text-muted-foreground flex items-center gap-2">
                        <Clock3 size={14} className="animate-spin" />
                        Loading payment history...
                    </div>
                ) : rows.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                        <CreditCard size={28} className="mx-auto text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground mt-2">No payment records found.</p>
                    </div>
                ) : (
                    rows.map((row) => {
                        const isPaid = row.status.toLowerCase() === "paid";
                        return (
                        <div key={row.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border last:border-0 text-sm">
                            <div className="col-span-2 text-muted-foreground text-xs space-y-0.5">
                                <p>{formatDate(row.paid_at || row.created_at)}</p>
                                <p>{formatTime(row.paid_at || row.created_at)}</p>
                            </div>
                            <div className="col-span-2 min-w-0">
                                <p className="text-foreground font-medium truncate" title={row.invoice_number}>{row.invoice_number}</p>
                                <p className="text-[11px] text-muted-foreground truncate" title={row.transaction_id ?? ""}>
                                    {row.transaction_id ? `Txn: ${row.transaction_id}` : "Txn: -"}
                                </p>
                            </div>
                            <div className="col-span-1 text-foreground/85 capitalize text-xs self-center">
                                {row.payment_method || "-"}
                            </div>
                            <div className="col-span-2 font-semibold text-foreground self-center">
                                {money(row.amount, resolveInvoiceCurrency(row))}
                            </div>
                            <div className="col-span-1 self-center">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(row.status)}`}>
                                    {row.status}
                                </span>
                            </div>
                            <div className="col-span-1 text-foreground/90 truncate text-xs self-center" title={row.plan_name ?? ""}>
                                {row.plan_name || "-"}
                            </div>

                            {/* Receipt column — Eye + Download, only enabled when paid */}
                            <div className="col-span-2 flex items-center justify-center gap-1">
                                <button
                                    disabled={!isPaid}
                                    onClick={() => handleViewReceipt(row)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                    title={isPaid ? "View receipt" : "Receipt available for paid invoices only"}
                                    aria-label="View receipt"
                                >
                                    <Eye size={15} />
                                </button>
                                <button
                                    disabled={!isPaid || downloadingReceiptId === row.id}
                                    onClick={() => void handleDownloadReceipt(row)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                    title={isPaid ? "Download receipt" : "Receipt available for paid invoices only"}
                                    aria-label="Download receipt"
                                >
                                    {downloadingReceiptId === row.id
                                        ? <Loader2 size={15} className="animate-spin" />
                                        : <Download size={15} />}
                                </button>
                            </div>

                            {/* Invoice column — Download only */}
                            <div className="col-span-1 flex items-center justify-center">
                                <button
                                    disabled={downloadingInvoiceId === row.id}
                                    onClick={() => void handleDownloadInvoice(row)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                    title="Download invoice"
                                    aria-label="Download invoice"
                                >
                                    {downloadingInvoiceId === row.id
                                        ? <Loader2 size={15} className="animate-spin" />
                                        : <Download size={15} />}
                                </button>
                            </div>
                        </div>
                        );
                    })
                )}
            </div>

            {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        if (page > 1) setPage(page - 1);
                                    }}
                                    className={page === 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        if (page < totalPages) setPage(page + 1);
                                    }}
                                    className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {viewingDoc && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setViewingDoc(null)}
                >
                    <div
                        className="relative w-full max-w-2xl rounded-2xl overflow-hidden bg-card border border-border/60 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-12 px-4 border-b border-border/60 flex items-center justify-between bg-card">
                            <p className="text-sm font-semibold text-foreground truncate pr-3">
                                {viewingDoc.type === "invoice" ? `Invoice ${viewingDoc.data.invoice_number}` : `Receipt ${viewingDoc.data.invoice_number}`}
                            </p>
                            <button
                                type="button"
                                onClick={() => setViewingDoc(null)}
                                className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                                aria-label="Close preview"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Billed By</p>
                                    <p className="text-lg font-bold text-foreground">{issuerInfo.company_name || "SignalView"}</p>
                                </div>
                                {issuerInfo.logo_url && (
                                    <img
                                        // src={issuerInfo.logo_url}
                                        src="/logo_light.png"
                                        alt={`${issuerInfo.company_name || "Platform"} logo`}
                                        className="h-10 max-w-[160px] object-contain"
                                    />
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Billed To</p>
                                    <p className="text-lg font-bold text-foreground">{siteSettings.client_name || siteSettings.general.site_title || "Client"}</p>
                                </div>
                                {siteSettings.general.logo_url && (
                                    <img
                                        src={siteSettings.general.logo_url}
                                        alt={`${siteSettings.general.site_title || "Client"} logo`}
                                        className="h-10 max-w-[160px] object-contain"
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Invoice Number</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">{viewingDoc.data.invoice_number}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {money(viewingDoc.data.amount, resolveInvoiceCurrency(viewingDoc.data))}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Payment Method</p>
                                    <p className="text-sm font-semibold text-foreground mt-1 capitalize">{viewingDoc.data.payment_method || "-"}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</p>
                                    <p className="text-sm font-semibold text-emerald-600 mt-1 capitalize">{viewingDoc.data.status}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 col-span-2">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Plan</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">{viewingDoc.data.plan_name || "Subscription"}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 col-span-2">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Transaction ID</p>
                                    <p className="text-sm font-mono text-foreground mt-1 break-all">
                                        {viewingDoc.data.transaction_id || "-"}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paid At</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {viewingDoc.data.paid_at ? new Date(viewingDoc.data.paid_at).toLocaleString() : "-"}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Created At</p>
                                    <p className="text-sm font-semibold text-foreground mt-1">
                                        {new Date(viewingDoc.data.created_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => setViewingDoc(null)}
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
