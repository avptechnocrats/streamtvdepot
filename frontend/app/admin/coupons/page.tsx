"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    RefreshCw,
    Ticket,
    Pencil,
    Trash2,
    TrendingUp,
    Users,
    DollarSign,
    AlertTriangle,
    Percent,
    Banknote,
} from "lucide-react";
import {
    listCoupons,
    deleteCoupon,
    getCouponStats,
    getApiErrorMessage,
    type CouponOut,
    type CouponStatsOut,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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

type CouponTab = "all" | "percentage" | "fixed_amount";

const DISPLAY_PAGE_SIZE = 10;

const COUPON_TABS: { key: CouponTab; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Ticket },
    { key: "percentage", label: "Percentage", icon: Percent },
    { key: "fixed_amount", label: "Fixed", icon: Banknote },
];

export default function CouponsPage() {
    const { toast: pushToast } = useToast();
    const [allCoupons, setAllCoupons] = useState<CouponOut[]>([]);
    const [coupons, setCoupons] = useState<CouponOut[]>([]);
    const [couponStats, setCouponStats] = useState<CouponStatsOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<CouponTab>("all");
    const [page, setPage] = useState(1);
    const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState<CouponOut | null>(null);

    function showInlineToast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const fetchCoupons = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const [allCouponsData, tabCouponsData, statsData] = await Promise.all([
                listCoupons({
                    search: search || undefined,
                }),
                listCoupons({
                    search: search || undefined,
                    discount_type: tab === "all" ? undefined : tab,
                }),
                getCouponStats(),
            ]);

            setAllCoupons(allCouponsData);
            setCoupons(tabCouponsData);
            setCouponStats(statsData);
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, "Failed to load coupons"));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [search, tab]);

    useEffect(() => {
        setPage(1);
    }, [search, tab]);

    useEffect(() => {
        fetchCoupons();
    }, [fetchCoupons]);

    const counts = useMemo(() => ({
        all: allCoupons.length,
        percentage: allCoupons.filter((coupon) => coupon.discount_type === "percentage").length,
        fixed_amount: allCoupons.filter((coupon) => coupon.discount_type === "fixed_amount").length,
    }), [allCoupons]);

    const filteredCoupons = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return coupons;
        return coupons.filter((coupon) =>
            coupon.code.toLowerCase().includes(q) ||
            (coupon.description ?? "").toLowerCase().includes(q),
        );
    }, [coupons, search]);

    const totalPages = Math.max(1, Math.ceil(filteredCoupons.length / DISPLAY_PAGE_SIZE));
    const paginatedCoupons = useMemo(
        () => filteredCoupons.slice((page - 1) * DISPLAY_PAGE_SIZE, page * DISPLAY_PAGE_SIZE),
        [filteredCoupons, page],
    );
    const pageItems = getPaginationItems(page, totalPages);
    const startIndex = filteredCoupons.length === 0 ? 0 : (page - 1) * DISPLAY_PAGE_SIZE + 1;
    const endIndex = Math.min(page * DISPLAY_PAGE_SIZE, filteredCoupons.length);

    const handleDeleteCouponConfirm = async () => {
        if (!confirmDeleteCoupon) return;
        try {
            await deleteCoupon(confirmDeleteCoupon.id);
            setAllCoupons((prev) => prev.filter((c) => c.id !== confirmDeleteCoupon.id));
            setCoupons((prev) => prev.filter((c) => c.id !== confirmDeleteCoupon.id));
            showInlineToast("Coupon deleted");
            fetchCoupons(true);
        } catch (err: unknown) {
            showInlineToast(getApiErrorMessage(err, "Failed to delete coupon"), false);
        } finally {
            setConfirmDeleteCoupon(null);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "N/A";
        try {
            return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return "Invalid date";
        }
    };

    const getUsagePercentage = (coupon: CouponOut) => {
        if (!coupon.max_uses) return null;
        return Math.round((coupon.current_uses / coupon.max_uses) * 100);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Coupon Management</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Create and manage discount coupons for your platform
                    </p>
                </div>
                <Link
                    href="/admin/coupons/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all w-auto whitespace-nowrap shrink-0"
                >
                    <Plus size={15} /> New Coupon
                </Link>
            </div>

            {couponStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground">Total Coupons</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{couponStats.total_coupons}</p>
                            </div>
                            <Ticket size={20} className="text-primary opacity-60" />
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground">Active Coupons</p>
                                <p className="text-2xl font-bold text-green-500 mt-1">{couponStats.active_coupons}</p>
                            </div>
                            <TrendingUp size={20} className="text-green-500 opacity-60" />
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground">Total Usage</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{couponStats.total_usage}</p>
                            </div>
                            <Users size={20} className="text-primary opacity-60" />
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground">Total Discount Given</p>
                                <p className="text-2xl font-bold text-foreground mt-1">
                                    ${couponStats.total_discount_given.toFixed(2)}
                                </p>
                            </div>
                            <DollarSign size={20} className="text-primary opacity-60" />
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit flex-wrap">
                    {COUPON_TABS.map(({ key, label, icon: Icon }) => (
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
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {counts[key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by code or description…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 h-9 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>

                    <button
                        onClick={() => fetchCoupons(true)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-2.5 bg-secondary/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="w-32 shrink-0">Code</span>
                    <span className="flex-1">Description</span>
                    <span className="w-24 shrink-0 text-center">Discount</span>
                    <span className="w-24 shrink-0 text-center">Applies To</span>
                    <span className="w-24 shrink-0 text-center">Usage</span>
                    <span className="w-32 shrink-0 text-center">Valid Until</span>
                    <span className="w-20 shrink-0 text-center">Status</span>
                    <span className="w-32 shrink-0 text-right">Actions</span>
                </div>

                {loading ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
                ) : filteredCoupons.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16">
                        <Ticket size={32} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            {search ? "No coupons match your search" : "No coupons found"}
                        </p>
                        {!search && (
                            <Link
                                href="/admin/coupons/new"
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Plus size={13} />
                                Create your first coupon
                            </Link>
                        )}
                    </div>
                ) : (
                    paginatedCoupons.map((coupon) => {
                        const usagePct = getUsagePercentage(coupon);
                        return (
                            <div
                                key={coupon.id}
                                className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-muted/20 transition-colors"
                            >
                                <span className="w-32 shrink-0 font-mono text-sm font-bold text-primary">
                                    {coupon.code}
                                </span>
                                <span className="flex-1 text-sm text-muted-foreground truncate">
                                    {coupon.description || "—"}
                                </span>
                                <span className="w-24 shrink-0 text-center text-sm font-semibold text-foreground">
                                    {coupon.discount_type === "percentage"
                                        ? `${coupon.discount_value}%`
                                        : `$${coupon.discount_value}`}
                                </span>
                                <span className="w-24 shrink-0 flex justify-center">
                                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                                        {coupon.currency ?? "All"}
                                    </span>
                                </span>
                                <div className="w-24 shrink-0 text-center">
                                    <span className="text-sm text-foreground">
                                        {coupon.current_uses}
                                        {coupon.max_uses && ` / ${coupon.max_uses}`}
                                    </span>
                                    {usagePct !== null && (
                                        <div className="w-full h-1 bg-secondary rounded-full mt-1">
                                            <div
                                                className={`h-full rounded-full ${
                                                    usagePct >= 90 ? "bg-red-500" : usagePct >= 70 ? "bg-yellow-500" : "bg-green-500"
                                                }`}
                                                style={{ width: `${Math.min(usagePct, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <span className="w-32 shrink-0 text-center text-xs text-muted-foreground">
                                    {formatDate(coupon.valid_until)}
                                </span>
                                <span className="w-20 shrink-0 flex justify-center">
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                            coupon.is_active
                                                ? "bg-green-500/10 text-green-500"
                                                : "bg-red-500/10 text-red-500"
                                        }`}
                                    >
                                        {coupon.is_active ? "Active" : "Inactive"}
                                    </span>
                                </span>
                                <div className="w-32 shrink-0 flex items-center justify-end gap-1">
                                    <Link
                                        href={`/admin/coupons/${coupon.id}`}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="Edit"
                                    >
                                        <Pencil size={15} color="#2a83e9" />
                                    </Link>
                                    <button
                                        onClick={() => setConfirmDeleteCoupon(coupon)}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 size={15} color="#fa4b4b" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {!loading && !error && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Showing {startIndex}–{endIndex} of {filteredCoupons.length}
                    </p>

                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setPage((current) => Math.max(1, current - 1));
                                        }}
                                        className={page === 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>

                                {pageItems.map((item, index) => (
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
                                            setPage((current) => Math.min(totalPages, current + 1));
                                        }}
                                        className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}

            {confirmDeleteCoupon && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmDeleteCoupon(null)}>
                    <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-foreground mb-2">Delete Coupon</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Are you sure you want to delete the coupon <span className="font-mono text-primary font-bold">{confirmDeleteCoupon.code}</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmDeleteCoupon(null)}
                                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteCouponConfirm}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toastMsg && (
                <div
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 p-3 rounded-xl shadow-xl border text-sm transition-all ${
                        toastMsg.ok
                            ? "bg-card border-[#95d0bfb3] text-foreground"
                            : "bg-red-500/10 border-red-500/20 text-red-300"
                    }`}
                >
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
