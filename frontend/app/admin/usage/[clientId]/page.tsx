"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    ChevronLeft, AlertTriangle, CheckCircle2, HardDrive,
    Wifi, Film, Users, DollarSign, Clock, Activity, TrendingUp, Download
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getClientUsageDetail,
    type ClientUsageDetail,
    type MonthlyUsageRecord,
    MONTH_NAMES,
    formatBytes,
    formatMinutes,
    formatCurrency,
} from "@/lib/api/services/usage";
import { InvoiceService } from "@/lib/api/services/alerts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pct(used: number, limit: number | null | undefined): number | null {
    if (!limit || limit <= 0) return null;
    return Math.min(100, Math.round((used / limit) * 100 * 10) / 10);
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
    icon: Icon, iconCls, label, value, sub, limit, pctVal,
}: {
    icon: React.ElementType;
    iconCls: string;
    label: string;
    value: string;
    sub?: string;
    limit?: string | null;
    pctVal?: number | null;
}) {
    const barCls = pctVal != null ? (pctVal >= 100 ? "bg-red-500" : pctVal >= 80 ? "bg-amber-500" : "bg-primary") : "bg-primary";
    return (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className={`p-2 rounded-xl ${iconCls}`}><Icon size={15} /></div>
                {pctVal != null && (
                    <span className={`text-xs font-bold ${pctVal >= 100 ? "text-red-500" : pctVal >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {pctVal}%
                    </span>
                )}
            </div>
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
                {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
            </div>
            {pctVal != null && (
                <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${Math.min(pctVal, 100)}%` }} />
                </div>
            )}
        </div>
    );
}

// ─── History Bar Chart ─────────────────────────────────────────────────────────

function BarChart({ history, field, label, formatter }: {
    history: MonthlyUsageRecord[];
    field: keyof MonthlyUsageRecord;
    label: string;
    formatter: (v: number) => string;
}) {
    if (!history.length) return null;
    const values = history.map((r) => Number(r[field]) || 0);
    const max = Math.max(...values, 0.001);
    // Reverse to show oldest → newest left to right
    const ordered = [...history].reverse();
    const orderedVals = [...values].reverse();

    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label}</p>
            <div className="flex items-end gap-1.5 h-24">
                {ordered.map((row, i) => {
                    const v = orderedVals[i];
                    const h = max > 0 ? Math.max(4, (v / max) * 100) : 4;
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div
                                className="w-full rounded-t-sm bg-primary/60 group-hover:bg-primary transition-colors cursor-pointer"
                                style={{ height: `${h}%` }}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                <p className="font-semibold">{MONTH_NAMES[row.billing_month - 1]} {row.billing_year}</p>
                                <p>{formatter(v)}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-1.5 mt-1">
                {ordered.map((row, i) => (
                    <div key={i} className="flex-1 text-center">
                        <span className="text-[8px] text-muted-foreground">{MONTH_NAMES[row.billing_month - 1].slice(0, 1)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Overage Breakdown ─────────────────────────────────────────────────────────

function OverageRow({ label, amount, rate, currency }: { label: string; amount: number; rate: string | null; currency: string }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
            <div>
                <p className="text-sm text-foreground">{label}</p>
                {rate && <p className="text-xs text-muted-foreground">{rate}</p>}
            </div>
            <span className={`text-sm font-semibold ${amount > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {amount > 0 ? formatCurrency(amount, currency) : "—"}
            </span>
        </div>
    );
}

// ─── History Table ─────────────────────────────────────────────────────────────

function HistoryTable({ history, detail, clientId }: { history: MonthlyUsageRecord[]; detail: ClientUsageDetail; clientId: string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Storage</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bandwidth</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Encoding</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base Fee</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overage</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</th>
                    </tr>
                </thead>
                <tbody>
                    {history.length === 0 ? (
                        <tr>
                            <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground text-sm">No usage history yet</td>
                        </tr>
                    ) : history.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/40 transition-colors">
                            <td className="px-3 py-2.5 font-medium text-foreground">
                                {MONTH_NAMES[row.billing_month - 1]} {row.billing_year}
                            </td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{formatBytes(row.storage_gb_used)}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{formatBytes(row.bandwidth_gb_used)}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{formatMinutes(row.encoding_minutes_used)}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{row.total_end_users.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(row.base_fee, row.currency)}</td>
                            <td className="px-3 py-2.5 text-right">
                                {row.total_overage > 0 ? (
                                    <span className="text-red-400 font-semibold">{formatCurrency(row.total_overage, row.currency)}</span>
                                ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatCurrency(row.total_invoice, row.currency)}</td>
                            <td className="px-3 py-2.5 text-center">
                                {row.is_finalized ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-semibold">
                                        <CheckCircle2 size={9} /> Finalized
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold">
                                        <Activity size={9} /> Live
                                    </span>
                                )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                                <button
                                    onClick={() => InvoiceService.downloadInvoice(clientId, row.billing_year, row.billing_month, "pdf")}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition"
                                    title="Download PDF invoice"
                                >
                                    <Download size={12} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ClientUsageDetailPage() {
    const { clientId } = useParams<{ clientId: string }>();
    const [detail, setDetail] = useState<ClientUsageDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getClientUsageDetail(clientId)
            .then(setDetail)
            .catch(() => setError("Failed to load usage details"))
            .finally(() => setLoading(false));
    }, [clientId]);

    if (loading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-6 w-48" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="p-6">
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error ?? "Client not found"}
                </div>
            </div>
        );
    }

    // Current month = first in history (newest first)
    const current = detail.monthly_history[0];
    const currency = current?.currency ?? detail.plan_currency ?? "USD";

    // Overage rate display helpers
    const bwRate = detail.overage_bandwidth_per_gb ? `${formatCurrency(detail.overage_bandwidth_per_gb, currency)}/GB` : null;
    const stRate = detail.overage_storage_per_gb ? `${formatCurrency(detail.overage_storage_per_gb, currency)}/GB/mo` : null;
    const encRate = detail.overage_encoding_per_minute ? `${formatCurrency(detail.overage_encoding_per_minute, currency)}/min` : null;
    const apiRate = detail.overage_api_per_1m_calls ? `${formatCurrency(detail.overage_api_per_1m_calls, currency)}/1M calls` : null;

    return (
        <div className="p-6 space-y-6">
            {/* ── Breadcrumb + Header ──────────────────────────────────── */}
            <div className="flex items-center gap-2">
                <Link href="/admin/usage" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft size={15} /> Usage
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">{detail.client_name}</span>
            </div>

            <div className="flex items-center gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-foreground">{detail.client_name}</h1>
                        <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">{detail.client_slug}</span>
                        <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                            detail.client_status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                            detail.client_status === "trial"  ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                            "bg-muted text-muted-foreground border-border"
                        }`}>{detail.client_status}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        {detail.plan_name ? `Plan: ${detail.plan_name} · ${formatCurrency(detail.plan_price_monthly ?? 0, detail.plan_currency)}/mo` : "No plan assigned"}
                    </p>
                </div>
            </div>

            {/* ── Current Month Stats ──────────────────────────────────── */}
            <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Current Month Usage</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon={HardDrive} iconCls="bg-blue-500/10 text-blue-500"
                        label="Storage Used"
                        value={formatBytes(current?.storage_gb_used ?? 0)}
                        sub={detail.limit_storage_gb ? `Limit: ${formatBytes(detail.limit_storage_gb)}` : "Unlimited"}
                        pctVal={pct(current?.storage_gb_used ?? 0, detail.limit_storage_gb)}
                    />
                    <StatCard
                        icon={Wifi} iconCls="bg-purple-500/10 text-purple-500"
                        label="Bandwidth Used"
                        value={formatBytes(current?.bandwidth_gb_used ?? 0)}
                        sub={detail.limit_bandwidth_gb ? `Limit: ${formatBytes(detail.limit_bandwidth_gb)}` : "Unlimited"}
                        pctVal={pct(current?.bandwidth_gb_used ?? 0, detail.limit_bandwidth_gb)}
                    />
                    <StatCard
                        icon={Film} iconCls="bg-amber-500/10 text-amber-500"
                        label="Encoding Used"
                        value={formatMinutes(current?.encoding_minutes_used ?? 0)}
                        sub={detail.limit_encoding_minutes ? `Limit: ${formatMinutes(detail.limit_encoding_minutes)}` : "Unlimited"}
                        pctVal={pct(current?.encoding_minutes_used ?? 0, detail.limit_encoding_minutes)}
                    />
                    <StatCard
                        icon={Users} iconCls="bg-emerald-500/10 text-emerald-500"
                        label="End Users"
                        value={(current?.total_end_users ?? 0).toLocaleString()}
                        sub={detail.limit_users ? `Limit: ${detail.limit_users.toLocaleString()}` : "Unlimited"}
                        pctVal={pct(current?.total_end_users ?? 0, detail.limit_users)}
                    />
                    <StatCard
                        icon={Activity} iconCls="bg-cyan-500/10 text-cyan-500"
                        label="Peak Concurrent Users"
                        value={(current?.concurrent_users_peak ?? 0).toLocaleString()}
                        sub={detail.limit_streams ? `Stream limit: ${detail.limit_streams}` : "Unlimited streams"}
                    />
                    <StatCard
                        icon={TrendingUp} iconCls="bg-indigo-500/10 text-indigo-500"
                        label="API Calls"
                        value={(current?.api_calls_used ?? 0).toLocaleString()}
                        sub={detail.limit_api_calls ? `Limit: ${(detail.limit_api_calls * 1_000_000).toLocaleString()}` : "Unlimited"}
                    />
                    <StatCard
                        icon={Film} iconCls="bg-pink-500/10 text-pink-500"
                        label="Content"
                        value={`${current?.total_videos ?? 0} videos`}
                        sub={`${current?.total_audio ?? 0} audio · ${current?.total_live_streams ?? 0} streams`}
                    />
                    <StatCard
                        icon={DollarSign} iconCls="bg-red-500/10 text-red-500"
                        label="Current Overage"
                        value={formatCurrency(current?.total_overage ?? 0, currency)}
                        sub={`Est. invoice: ${formatCurrency(current?.total_invoice ?? 0, currency)}`}
                    />
                </div>
            </div>

            {/* ── Charts + Overage ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                {/* Charts */}
                <div className="rounded-2xl border border-border bg-card p-6 space-y-8">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">12-Month Trend</p>
                    <BarChart history={detail.monthly_history} field="bandwidth_gb_used" label="Bandwidth (GB)" formatter={(v) => formatBytes(v)} />
                    <BarChart history={detail.monthly_history} field="storage_gb_used" label="Storage (GB)" formatter={(v) => formatBytes(v)} />
                    <BarChart history={detail.monthly_history} field="encoding_minutes_used" label="Encoding (minutes)" formatter={(v) => formatMinutes(v)} />
                    <BarChart history={detail.monthly_history} field="total_end_users" label="End Users" formatter={(v) => v.toLocaleString()} />
                </div>

                {/* Overage Breakdown */}
                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Overage Breakdown (Current Month)</p>
                        <OverageRow label="Bandwidth Overage" amount={current?.overage_bandwidth ?? 0} rate={bwRate} currency={currency} />
                        <OverageRow label="Storage Overage" amount={current?.overage_storage ?? 0} rate={stRate} currency={currency} />
                        <OverageRow label="Encoding Overage" amount={current?.overage_encoding ?? 0} rate={encRate} currency={currency} />
                        <OverageRow label="API Overage" amount={current?.overage_api ?? 0} rate={apiRate} currency={currency} />
                        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">Total Overage</span>
                            <span className={`text-sm font-bold ${(current?.total_overage ?? 0) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                {formatCurrency(current?.total_overage ?? 0, currency)}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Base Fee</span>
                            <span className="text-sm text-muted-foreground">{formatCurrency(current?.base_fee ?? 0, currency)}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground">Est. Invoice</span>
                            <span className="text-base font-bold text-primary">{formatCurrency(current?.total_invoice ?? 0, currency)}</span>
                        </div>
                    </div>

                    {/* Plan limits summary */}
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Plan Limits</p>
                        <div className="space-y-2 text-sm">
                            {[
                                ["Storage", detail.limit_storage_gb ? formatBytes(detail.limit_storage_gb) : "∞"],
                                ["Bandwidth/mo", detail.limit_bandwidth_gb ? formatBytes(detail.limit_bandwidth_gb) : "∞"],
                                ["Encoding/mo", detail.limit_encoding_minutes ? formatMinutes(detail.limit_encoding_minutes) : "∞"],
                                ["End Users", detail.limit_users?.toLocaleString() ?? "∞"],
                                ["Streams", detail.limit_streams?.toLocaleString() ?? "∞"],
                                ["API Calls/mo", detail.limit_api_calls ? `${detail.limit_api_calls}M` : "∞"],
                            ].map(([label, val]) => (
                                <div key={label} className="flex justify-between">
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className="font-medium text-foreground">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── History Table ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                    <p className="text-sm font-semibold text-foreground">Billing History</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Last 12 months</p>
                </div>
                <HistoryTable history={detail.monthly_history} detail={detail} clientId={clientId} />
            </div>
        </div>
    );
}
