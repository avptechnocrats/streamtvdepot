"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Search, RefreshCw, ChevronLeft, ChevronRight,
    AlertTriangle, CheckCircle2, TrendingUp, HardDrive,
    Wifi, Film, Users, DollarSign
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    listClientUsage,
    syncUsageFromAws,
    type UsageSyncClientResult,
    type ClientUsageSummary,
    type UsageStatus,
    type ListUsageParams,
    MONTH_NAMES,
    formatBytes,
    formatMinutes,
    formatCurrency,
} from "@/lib/api/services/usage";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<UsageStatus, { cls: string; label: string; icon: React.ElementType }> = {
    normal:     { cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", label: "Normal", icon: CheckCircle2 },
    at_risk:    { cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",       label: "At Risk", icon: AlertTriangle },
    over_limit: { cls: "bg-red-500/10 text-red-500 border-red-500/20",             label: "Over Limit", icon: AlertTriangle },
};

const CLIENT_STATUS_BADGE: Record<string, string> = {
    trial:     "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    active:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    inactive:  "bg-muted text-muted-foreground border-border",
    suspended: "bg-red-500/10 text-red-500 border-red-500/20",
};

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function UsageBar({ pct, label, used, limit }: { pct: number | null; label: string; used: string; limit: string | null }) {
    if (pct === null) {
        return (
            <div className="min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{used} / ∞</span>
                </div>
                <div className="h-1 w-full rounded-full bg-border" />
            </div>
        );
    }
    const capped = Math.min(pct, 100);
    const barCls = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary";
    return (
        <div className="min-w-0">
            <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className={`text-[10px] font-semibold ${pct >= 100 ? "text-red-500" : pct >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {used} / {limit}
                </span>
            </div>
            <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${capped}%` }} />
            </div>
        </div>
    );
}

// ─── Row Skeleton ──────────────────────────────────────────────────────────────

function RowSkeleton() {
    return (
        <tr className="border-b border-border/50">
            {Array.from({ length: 7 }).map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                </td>
            ))}
        </tr>
    );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UsagePage() {
    const now = new Date();
    const [clients, setClients] = useState<ClientUsageSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [billingYear, setBillingYear] = useState(now.getFullYear());
    const [billingMonth, setBillingMonth] = useState(now.getMonth() + 1);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [syncDiagnostics, setSyncDiagnostics] = useState<UsageSyncClientResult[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: ListUsageParams = {
                page,
                page_size: PAGE_SIZE,
                billing_year: billingYear,
                billing_month: billingMonth,
            };
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            setClients(await listClientUsage(params));
        } catch {
            setError("Failed to load usage data");
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, billingYear, billingMonth]);

    useEffect(() => { load(); }, [load]);

    // ── Header summary aggregates ─────────────────────────────────────────────
    const overLimitCount = clients.filter((c) => c.usage_status === "over_limit").length;
    const atRiskCount = clients.filter((c) => c.usage_status === "at_risk").length;
    const totalOverage = clients.reduce((s, c) => s + c.total_overage, 0);
    const totalInvoice = clients.reduce((s, c) => s + c.total_invoice, 0);

    // ── Month selector helpers ────────────────────────────────────────────────
    const prevMonth = () => {
        if (billingMonth === 1) { setBillingMonth(12); setBillingYear((y) => y - 1); }
        else setBillingMonth((m) => m - 1);
        setPage(1);
    };
    const nextMonth = () => {
        if (billingYear === now.getFullYear() && billingMonth === now.getMonth() + 1) return;
        if (billingMonth === 12) { setBillingMonth(1); setBillingYear((y) => y + 1); }
        else setBillingMonth((m) => m + 1);
        setPage(1);
    };
    const isCurrentMonth = billingYear === now.getFullYear() && billingMonth === now.getMonth() + 1;

    const syncFromAws = useCallback(async () => {
        setSyncing(true);
        setError(null);
        setSyncMessage(null);
        setSyncDiagnostics([]);
        try {
            const result = await syncUsageFromAws(billingYear, billingMonth);
            setSyncMessage(
                `AWS sync completed: ${result.successful_clients}/${result.attempted_clients} clients updated` +
                (result.failed_clients > 0 ? `, ${result.failed_clients} failed` : "")
            );
            setSyncDiagnostics(result.client_results ?? []);
            await load();
        } catch {
            setError("Failed to sync usage from AWS");
        } finally {
            setSyncing(false);
        }
    }, [billingYear, billingMonth, load]);

    return (
        <div className="p-6 space-y-6">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-xl font-bold text-foreground">Usage Tracking</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Monitor bandwidth, storage, encoding and overage charges per client</p>
            </div>

            {/* ── Summary Cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10"><AlertTriangle size={16} className="text-red-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Over Limit</p>
                        <p className="text-xl font-bold text-red-500">{overLimitCount}</p>
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10"><TrendingUp size={16} className="text-amber-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">At Risk (≥80%)</p>
                        <p className="text-xl font-bold text-amber-500">{atRiskCount}</p>
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-orange-500/10"><DollarSign size={16} className="text-orange-500" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Total Overage</p>
                        <p className="text-xl font-bold text-foreground">${totalOverage.toFixed(2)}</p>
                    </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10"><DollarSign size={16} className="text-primary" /></div>
                    <div>
                        <p className="text-xs text-muted-foreground">Est. MRR</p>
                        <p className="text-xl font-bold text-foreground">${totalInvoice.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* ── Controls ────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Month picker */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 h-9">
                    <button onClick={prevMonth} className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-sm font-medium px-2 min-w-[110px] text-center">
                        {MONTH_NAMES[billingMonth - 1]} {billingYear}
                        {isCurrentMonth && <span className="ml-1 text-[10px] text-primary font-semibold">LIVE</span>}
                    </span>
                    <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1.5 rounded hover:bg-surface-hover text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                        <ChevronRight size={14} />
                    </button>
                </div>

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search clients…"
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                {/* Status filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="h-9 rounded-lg bg-secondary border border-border px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="">All Statuses</option>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                </select>

                <button onClick={load} className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors flex-shrink-0">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>

                <button
                    onClick={syncFromAws}
                    disabled={syncing}
                    className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
                >
                    <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Syncing..." : "Sync from AWS"}
                </button>
            </div>

            {syncMessage && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                    {syncMessage}
                </div>
            )}

            {syncDiagnostics.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-foreground">Sync Diagnostics</h2>
                    <div className="space-y-2">
                        {syncDiagnostics.map((row) => {
                            const diagnosticEntries = Object.entries(row.diagnostics || {});
                            return (
                                <div key={row.client_id} className="rounded-lg border border-border bg-secondary/40 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{row.client_slug}</p>
                                            {row.metrics && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    BW {row.metrics.bandwidth_gb_used.toFixed(2)} GB, Storage {row.metrics.storage_gb_used.toFixed(2)} GB, Encoding {row.metrics.encoding_minutes_used.toFixed(2)} min, Peak {row.metrics.concurrent_users_peak}
                                                </p>
                                            )}
                                        </div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${row.success ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                                            {row.success ? "ok" : "failed"}
                                        </span>
                                    </div>

                                    {diagnosticEntries.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {diagnosticEntries.map(([metric, detail]) => (
                                                <p key={metric} className="text-xs text-amber-400">
                                                    {metric}: {detail}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Table ───────────────────────────────────────────────────── */}
            {error ? (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            ) : (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-48">Storage</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-48">Bandwidth</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-44">Encoding</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overage</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</th>
                                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading
                                    ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
                                    : clients.length === 0
                                    ? (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                                                No clients found
                                            </td>
                                        </tr>
                                    )
                                    : clients.map((client) => {
                                        const badge = STATUS_BADGE[client.usage_status];
                                        const BadgeIcon = badge.icon;
                                        const totalUsers = (client.total_end_users ?? 0) + (client.total_admin_users ?? 0);
                                        return (
                                            <tr key={client.client_id} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                                                {/* Client */}
                                                <td className="px-4 py-3">
                                                    <Link href={`/admin/usage/${client.client_id}`} className="flex items-center gap-2.5 group">
                                                        {client.client_logo_url ? (
                                                            <img src={client.client_logo_url} alt={client.client_name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                                                {client.client_name.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-foreground group-hover:text-primary transition-colors leading-tight">{client.client_name}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-[10px] text-muted-foreground">{client.client_slug}</span>
                                                                <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wide border ${CLIENT_STATUS_BADGE[client.client_status] ?? ""}`}>
                                                                    {client.client_status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                </td>

                                                {/* Plan */}
                                                <td className="px-4 py-3">
                                                    {client.plan_name ? (
                                                        <div>
                                                            <p className="font-medium text-foreground">{client.plan_name}</p>
                                                            <p className="text-[10px] text-muted-foreground">{formatCurrency(client.plan_price_monthly ?? 0, client.plan_currency)}/mo</p>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">No plan</span>
                                                    )}
                                                </td>

                                                {/* Storage */}
                                                <td className="px-4 py-3">
                                                    <UsageBar
                                                        pct={client.storage_pct}
                                                        label="Storage"
                                                        used={formatBytes(client.storage_gb_used)}
                                                        limit={client.limit_storage_gb ? formatBytes(client.limit_storage_gb) : null}
                                                    />
                                                </td>

                                                {/* Bandwidth */}
                                                <td className="px-4 py-3">
                                                    <UsageBar
                                                        pct={client.bandwidth_pct}
                                                        label="Bandwidth"
                                                        used={formatBytes(client.bandwidth_gb_used)}
                                                        limit={client.limit_bandwidth_gb ? formatBytes(client.limit_bandwidth_gb) : null}
                                                    />
                                                </td>

                                                {/* Encoding */}
                                                <td className="px-4 py-3">
                                                    <UsageBar
                                                        pct={client.encoding_pct}
                                                        label="Encoding"
                                                        used={formatMinutes(client.encoding_minutes_used)}
                                                        limit={client.limit_encoding_minutes ? formatMinutes(client.limit_encoding_minutes) : null}
                                                    />
                                                </td>

                                                {/* Users */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5 text-foreground">
                                                        <Users size={13} className="text-muted-foreground" />
                                                        <span className="font-medium">{totalUsers.toLocaleString()}</span>
                                                        <span className="inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wide border border-primary/20 bg-primary/10 text-primary">
                                                            Active
                                                        </span>
                                                        {client.limit_users && (
                                                            <span className="text-[10px] text-muted-foreground">/ {client.limit_users.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        End: {client.total_end_users.toLocaleString()} | Admin: {client.total_admin_users.toLocaleString()}
                                                    </p>
                                                </td>

                                                {/* Overage */}
                                                <td className="px-4 py-3 text-right">
                                                    {client.total_overage > 0 ? (
                                                        <span className="font-semibold text-red-400">{formatCurrency(client.total_overage, client.currency)}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </td>

                                                {/* Invoice */}
                                                <td className="px-4 py-3 text-right">
                                                    <span className="font-semibold text-foreground">{formatCurrency(client.total_invoice, client.currency)}</span>
                                                </td>

                                                {/* Status */}
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${badge.cls}`}>
                                                        <BadgeIcon size={10} />
                                                        {badge.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && clients.length > 0 && (
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
                                                if (clients.length >= PAGE_SIZE) setPage((p) => p + 1);
                                            }}
                                            aria-disabled={clients.length < PAGE_SIZE}
                                            className={clients.length < PAGE_SIZE ? "pointer-events-none opacity-50" : ""}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
