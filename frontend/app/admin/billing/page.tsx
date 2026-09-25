"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    DollarSign,
    Download,
    RefreshCw,
    Search,
    XCircle,
} from "lucide-react";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    fetchBillingStats,
    listSuperadminBilling,
    updateSuperadminBilling,
    type BillingStats,
    type BillingStatus,
    type SaasBillingRecord,
} from "@/lib/api";
import { InvoiceService } from "@/lib/api/services/alerts";

const PAGE_SIZE = 50;

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STATUS_META: Record<BillingStatus, { cls: string; label: string }> = {
    pending: {
        cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        label: "Pending",
    },
    paid: {
        cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        label: "Paid",
    },
    failed: {
        cls: "bg-red-500/10 text-red-500 border-red-500/20",
        label: "Failed",
    },
    refunded: {
        cls: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        label: "Refunded",
    },
    cancelled: {
        cls: "bg-muted text-muted-foreground border-border",
        label: "Cancelled",
    },
};

function formatCurrency(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
    }).format(amount);
}

function formatDate(value: string | null): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: BillingStatus }) {
    const meta = STATUS_META[status];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${meta.cls}`}>
            {meta.label}
        </span>
    );
}

function KPICard({ icon: Icon, iconCls, label, value, sub }: {
    icon: React.ElementType;
    iconCls: string;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
                <div className={`p-2 rounded-xl ${iconCls}`}>
                    <Icon size={16} />
                </div>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

export default function BillingPage() {
    const now = new Date();
    const [records, setRecords] = useState<SaasBillingRecord[]>([]);
    const [stats, setStats] = useState<BillingStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | BillingStatus>("all");
    const [clientFilter, setClientFilter] = useState<string>("all");
    const [yearFilter, setYearFilter] = useState<number | "all">("all");
    const [monthFilter, setMonthFilter] = useState<number | "all">("all");
    const [page, setPage] = useState(1);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, unknown> = { page, page_size: PAGE_SIZE };
            if (clientFilter !== "all") params.client_id = clientFilter;
            if (statusFilter !== "all") params.status = statusFilter;
            if (yearFilter !== "all") params.period_year = yearFilter;
            if (monthFilter !== "all") params.period_month = monthFilter;

            const [billingData, statsData] = await Promise.all([
                listSuperadminBilling(params as Parameters<typeof listSuperadminBilling>[0]),
                fetchBillingStats(),
            ]);
            setRecords(billingData);
            setStats(statsData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load billing records");
        } finally {
            setLoading(false);
        }
    }, [page, clientFilter, statusFilter, yearFilter, monthFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const uniqueClients = useMemo(() => {
        const seen = new Set<string>();
        const list: { id: string; name: string }[] = [];
        for (const r of records) {
            if (!seen.has(r.client_id)) {
                seen.add(r.client_id);
                list.push({ id: r.client_id, name: r.client_name ?? r.client_id.slice(0, 8) });
            }
        }
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [records]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return records;
        return records.filter((record) => {
            const clientName = (record.client_name ?? "").toLowerCase();
            const clientSlug = (record.client_slug ?? "").toLowerCase();
            const invoice = record.invoice_number.toLowerCase();
            return clientName.includes(q) || clientSlug.includes(q) || invoice.includes(q);
        });
    }, [records, search]);

    const yearOptions = useMemo(() => {
        const y = now.getFullYear();
        return [y, y - 1, y - 2];
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function updateStatus(record: SaasBillingRecord, newStatus: BillingStatus) {
        try {
            setUpdatingId(record.id);
            const payload = {
                status: newStatus,
                paid_at: newStatus === "paid" && !record.paid_at ? new Date().toISOString() : record.paid_at,
            };
            const updated = await updateSuperadminBilling(record.id, payload);
            setRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
            toast(`Invoice ${record.invoice_number} marked as ${newStatus}`);
        } catch (err: unknown) {
            toast(err instanceof Error ? err.message : "Failed to update billing status", false);
        } finally {
            setUpdatingId(null);
        }
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-foreground">Billing</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Track invoices, payment status, and revenue collection across all tenants.
                </p>
            </div>

            {/* KPI Cards (from /billing/stats) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    icon={DollarSign}
                    iconCls="bg-primary/10 text-primary"
                    label="Total Invoices"
                    value={String(stats?.total_invoices ?? "-")}
                />
                <KPICard
                    icon={Clock3}
                    iconCls="bg-amber-500/10 text-amber-500"
                    label="Pending Collection"
                    value={stats ? formatCurrency(stats.pending_amount) : "-"}
                    sub={`${stats?.by_status?.["pending"]?.count ?? 0} invoices`}
                />
                <KPICard
                    icon={CheckCircle2}
                    iconCls="bg-emerald-500/10 text-emerald-500"
                    label="Collected Revenue"
                    value={stats ? formatCurrency(stats.paid_amount) : "-"}
                    sub={`${stats?.by_status?.["paid"]?.count ?? 0} invoices`}
                />
                <KPICard
                    icon={XCircle}
                    iconCls="bg-red-500/10 text-red-500"
                    label="Failed Invoices"
                    value={String(stats?.failed_count ?? "-")}
                    sub={stats ? `Refunded: ${formatCurrency(stats.refunded_amount)}` : undefined}
                />
            </div>

            {/* Filters */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1 lg:max-w-sm">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search invoice #, client name…"
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value as "all" | BillingStatus); setPage(1); }}
                    className="h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                    <option value="cancelled">Cancelled</option>
                </select>

                <select
                    value={clientFilter}
                    onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
                    className="h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="all">All clients</option>
                    {uniqueClients.map((client) => (
                        <option key={client.id} value={client.id}>
                            {client.name}
                        </option>
                    ))}
                </select>

                <select
                    value={String(yearFilter)}
                    onChange={(e) => { setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }}
                    className="h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="all">All years</option>
                    {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>

                <select
                    value={String(monthFilter)}
                    onChange={(e) => { setMonthFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }}
                    className="h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="all">All months</option>
                    {MONTH_NAMES.map((name, i) => (
                        <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                </select>

                <button
                    onClick={loadData}
                    title="Refresh"
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice #</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subtotal</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overage</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Due</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issued</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paid</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PDF</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mark As</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="border-b border-border/50">
                                        {Array.from({ length: 11 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <div className="h-4 rounded bg-muted animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground text-sm">
                                        No billing records found for the selected filters
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((record) => {
                                    const canDownload = Boolean(record.period_year && record.period_month);
                                    return (
                                        <tr key={record.id} className="border-b border-border/50 hover:bg-surface-hover/40 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-mono font-semibold text-foreground text-xs">{record.invoice_number}</p>
                                                {record.payment_method && (
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{record.payment_method}</p>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                <p className="font-medium text-foreground">{record.client_name ?? "—"}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{record.client_slug ?? record.client_id.slice(0, 8)}</p>
                                            </td>

                                            <td className="px-4 py-3 text-muted-foreground">
                                                {record.period_year && record.period_month
                                                    ? `${MONTH_NAMES[record.period_month - 1]} ${record.period_year}`
                                                    : "-"}
                                                {record.proration_factor < 1 && record.active_days && record.billing_days && (
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        {record.active_days}/{record.billing_days}d prorated
                                                    </p>
                                                )}
                                            </td>

                                            <td className="px-4 py-3 text-right text-muted-foreground">
                                                {formatCurrency(record.subtotal, record.currency)}
                                            </td>

                                            <td className="px-4 py-3 text-right">
                                                {record.overage_total > 0
                                                    ? <span className="text-red-400 font-semibold">{formatCurrency(record.overage_total, record.currency)}</span>
                                                    : <span className="text-muted-foreground">—</span>}
                                            </td>

                                            <td className="px-4 py-3 text-right font-bold text-foreground">
                                                {formatCurrency(record.total_due || record.amount, record.currency)}
                                            </td>

                                            <td className="px-4 py-3 text-center">
                                                <StatusBadge status={record.status} />
                                            </td>

                                            <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(record.created_at)}</td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(record.paid_at)}</td>

                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    disabled={!canDownload}
                                                    onClick={() => {
                                                        if (!canDownload) return;
                                                        InvoiceService.downloadInvoice(
                                                            record.client_id,
                                                            Number(record.period_year),
                                                            Number(record.period_month),
                                                            "pdf",
                                                        );
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title="Download invoice PDF"
                                                >
                                                    <Download size={12} />
                                                </button>
                                            </td>

                                            <td className="px-4 py-3 text-center">
                                                <select
                                                    value={record.status}
                                                    disabled={updatingId === record.id}
                                                    onChange={(e) => updateStatus(record, e.target.value as BillingStatus)}
                                                    className="h-8 rounded-md bg-secondary border border-border px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="paid">Paid</option>
                                                    <option value="failed">Failed</option>
                                                    <option value="refunded">Refunded</option>
                                                    <option value="cancelled">Cancelled</option>
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && filtered.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">Page {page}</span>
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 1) setPage((p) => p - 1);
                                        }}
                                        aria-disabled={page === 1}
                                        className={page === 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (filtered.length >= PAGE_SIZE) setPage((p) => p + 1);
                                        }}
                                        aria-disabled={filtered.length < PAGE_SIZE}
                                        className={filtered.length < PAGE_SIZE ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>

            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toastMsg.ok
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                    {toastMsg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
