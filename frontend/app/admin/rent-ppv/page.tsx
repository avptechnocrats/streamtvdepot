"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, AlertTriangle, CheckCircle2, Grid, Calendar, Timer, Film, Search, RefreshCw } from "lucide-react";
import { listSubscriptionsPaged, type UserSubscriptionOut, type SubscriptionStatus, type PlanType } from "@/lib/api";
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
import { SubscriptionRow } from "../subscriptions/_components/SubscriptionRow";
import { SubscriptionRowSkeleton } from "../subscriptions/_components/Skeletons";

type StatusFilter = "all" | Extract<SubscriptionStatus, "active" | "expired">;

const PAGE_SIZE = 10;

const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Grid },
    { key: "active", label: "Active", icon: CheckCircle2 },
    { key: "expired", label: "Expired", icon: Calendar },
];

type TypeFilter = Extract<PlanType, "rent" | "ppv">;

const TYPE_TABS: { key: TypeFilter; label: string; icon: React.ElementType }[] = [
    { key: "rent", label: "Rent", icon: Timer },
    { key: "ppv", label: "PPV", icon: Film },
];

const EMPTY_COUNTS = { all: 0, active: 0, expired: 0 };

export default function RentPpvPage() {
    const [subscriptions, setSubscriptions] = useState<UserSubscriptionOut[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("rent");
    const [search, setSearch] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const fetchData = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const result = await listSubscriptionsPaged({
                page,
                page_size: PAGE_SIZE,
                plan_type: typeFilter,
                search: search.trim() || undefined,
                status: statusFilter === "all" ? undefined : statusFilter,
            });
            setSubscriptions(result.items);
            setTotal(result.total);
            setCounts({ ...EMPTY_COUNTS, ...result.counts });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load rent & PPV access");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, typeFilter, search, statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset to page 1 whenever a filter changes
    useEffect(() => {
        setPage(1);
    }, [typeFilter, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Rent & PPV</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        One row per user showing their latest rented content or pay-per-view purchase
                    </p>
                </div>
            </div>

            {/* Type tabs */}
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                {TYPE_TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTypeFilter(key)}
                        className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                            typeFilter === key
                                ? "bg-card text-foreground shadow-sm border border-border/50"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Status Tabs + Search + Refresh */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
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
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {counts[key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2 w-full lg:w-auto">
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name, email, plan…"
                            className="w-full h-10 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">User</p>
                    <p className="hidden sm:block w-40 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Plan</p>
                    <p className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className="hidden md:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Renew</p>
                    <p className="hidden sm:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Started</p>
                    <p className="hidden lg:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Expires</p>
                </div>

                {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SubscriptionRowSkeleton key={i} />)
                ) : subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <BadgeCheck size={32} className="opacity-30" />
                        <p className="text-sm">
                            {statusFilter !== "all"
                                ? `No ${statusFilter} ${typeFilter} access`
                                : `No ${typeFilter} access yet`}
                        </p>
                    </div>
                ) : (
                    subscriptions.map((sub) => (
                        <SubscriptionRow key={sub.user_id} subscription={sub} />
                    ))
                )}
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                    </p>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page > 1) setPage((p) => p - 1);
                                    }}
                                    aria-disabled={page <= 1}
                                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            {getPaginationItems(page, totalPages, 1).map((p, index) =>
                                p === "ellipsis" ? (
                                    <PaginationItem key={`ellipsis-${index}`}>
                                        <PaginationEllipsis className="h-9 w-9" />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href="#"
                                            isActive={p === page}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setPage(p);
                                            }}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page < totalPages) setPage((p) => p + 1);
                                    }}
                                    aria-disabled={page >= totalPages}
                                    className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Toast */}
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
