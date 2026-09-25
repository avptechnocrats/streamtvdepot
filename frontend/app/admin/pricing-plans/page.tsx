"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileStack, Plus, CheckCircle2, AlertTriangle, GripVertical, Grid, CreditCard, Tag, Zap, Search, RefreshCw, Edit, Trash2, Eye, TrendingUp, Users, DollarSign } from "lucide-react";
import {
    listClientPlans,
    deleteClientPlan,
    reorderClientPlans,
    getApiErrorMessage,
    type ClientPricingPlanOut,
    type PlanType,
} from "@/lib/api";
import { PricingPlanRow } from "./_components/PricingPlanRow";
import { DeleteConfirm } from "./_components/DeleteConfirm";
import { PricingPlanRowSkeleton } from "./_components/Skeletons";
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

type TabKey = "all" | PlanType;

const DISPLAY_PAGE_SIZE = 10;

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "all", label: "All", icon: Grid },
    { key: "subscription", label: "Subscription", icon: CreditCard },
    { key: "ppv", label: "PPV", icon: Tag },
    { key: "rent", label: "Rent", icon: Zap },
];

export default function PricingPlansPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast: pushToast } = useToast();
    const [plans, setPlans] = useState<ClientPricingPlanOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("all");
    const [tabInitialized, setTabInitialized] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<ClientPricingPlanOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    function showInlineToast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    useEffect(() => {
        const flash = searchParams.get("toast");
        if (flash !== "plan-created" && flash !== "plan-updated") return;

        pushToast({
            description:
                flash === "plan-created"
                    ? "Pricing plan created successfully."
                    : "Pricing plan updated successfully.",
            variant: "success",
            duration: 3500,
        });

        const next = new URLSearchParams(searchParams.toString());
        next.delete("toast");
        const nextQuery = next.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, [searchParams, pushToast, router, pathname]);

    useEffect(() => {
        if (tabInitialized) return;
        const tabParam = searchParams.get("tab");
        if (tabParam && (tabParam === "all" || ["subscription", "ppv", "rent"].includes(tabParam))) {
            setActiveTab(tabParam as TabKey);
        }
        setTabInitialized(true);
    }, [searchParams, tabInitialized]);

    const fetchPlans = useCallback(async (tab: TabKey) => {
        setLoading(true);
        setError(null);
        try {
            const params = tab !== "all" ? { plan_type: tab as PlanType } : undefined;
            setPlans(await listClientPlans(params));
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, "Failed to load plans"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlans(activeTab);
    }, [activeTab, fetchPlans]);

    useEffect(() => {
        setPage(1);
    }, [search, activeTab]);

    // Client-side search filter
    const filteredPlans = useMemo(() => {
        const q = search.toLowerCase();
        if (!q) return plans;
        return plans.filter(
            (p) =>
                p.name.toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q),
        );
    }, [plans, search]);

    const totalPages = Math.max(1, Math.ceil(filteredPlans.length / DISPLAY_PAGE_SIZE));
    const paginatedPlans = useMemo(
        () => filteredPlans.slice((page - 1) * DISPLAY_PAGE_SIZE, page * DISPLAY_PAGE_SIZE),
        [filteredPlans, page],
    );
    const pageItems = getPaginationItems(page, totalPages);

    // Drag-and-drop is only enabled when a specific type tab is active and there is no active search
    const canDrag = activeTab !== "all" && !search;

    const handleTabNavigate = (tab: TabKey) => {
        router.push(`/admin/pricing-plans?tab=${tab}`);
    }

    const handleDrop = async (dropIndex: number) => {
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        const updated = [...filteredPlans];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(dropIndex, 0, moved);
        const reordered = updated.map((p, i) => ({ ...p, sort_order: i * 10 }));
        setPlans(reordered);
        setDragIndex(null);
        setDragOverIndex(null);
        try {
            await reorderClientPlans(reordered.map((p) => ({ id: p.id, sort_order: p.sort_order })));
            showInlineToast("Order saved");
        } catch {
            showInlineToast("Failed to save order", false);
            fetchPlans(activeTab);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deleteClientPlan(confirmDelete.id);
            setPlans((prev) => prev.filter((p) => p.id !== confirmDelete.id));
            showInlineToast("Plan deleted");
        } catch (err: unknown) {
            showInlineToast(getApiErrorMessage(err, "Failed to delete plan"), false);
            fetchPlans(activeTab);
        } finally {
            setConfirmDelete(null);
        }
    };

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Pricing Plans</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage subscription plans offered to your users
                    </p>
                </div>
                <Link
                    href="/admin/pricing-plans/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all w-auto whitespace-nowrap shrink-0"
                >
                    <Plus size={15} /> New Plan
                </Link>
            </div>

            {/* Tabs + Search (same row, search right-aligned) */}
            <div className="flex items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => { handleTabNavigate(key); setActiveTab(key); setDragIndex(null); setDragOverIndex(null); }}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                activeTab === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Actions: Search + Buttons */}
                <div className="flex items-center gap-2">
                    {/* Search Input Container */}
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by name, description…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 h-9 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>
                    
                    <button
                        onClick={() => fetchPlans(activeTab)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                    
                </div>
            </div>

            {/* Drag hint */}
            {canDrag && !loading && filteredPlans.length > 1 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <GripVertical size={12} className="opacity-60" />
                    Drag rows to reorder — changes save automatically
                </p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Table card */}
            <div className="rounded-xl border border-border overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center gap-4 px-4 py-2.5 bg-secondary/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {canDrag ? (
                        <GripVertical size={13} className="w-5 shrink-0 text-muted-foreground/40" />
                    ) : (
                        <span className="w-5 text-center font-mono text-[10px]"></span>
                    )}
                    <span className="flex-1">Plan</span>
                    <span className="w-40 shrink-0">Price</span>
                    <span className="hidden sm:block w-24 shrink-0 text-center">Type</span>
                    <span className="hidden sm:block w-40 shrink-0 text-center">Applies To</span>
                    <span className="hidden sm:block w-24 shrink-0 text-center">Trial</span>
                    <span className="w-20 shrink-0 text-center">Status</span>
                    <span className="w-24 shrink-0 text-right">Actions</span>
                </div>

                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <PricingPlanRowSkeleton key={i} />)
                ) : error ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">{error}</div>
                ) : filteredPlans.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16">
                        <FileStack size={32} className="text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            {search ? "No plans match your search" : "No pricing plans found"}
                        </p>
                        {!search && (
                            <Link
                                href="/admin/pricing-plans/new"
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                            >
                                <Plus size={13} />
                                Create your first plan.
                            </Link>
                        )}
                    </div>
                ) : (
                    paginatedPlans.map((plan, index) => (
                        <PricingPlanRow
                            key={plan.id}
                            plan={plan}
                            onDelete={() => setConfirmDelete(plan)}
                            canDrag={canDrag}
                            isDragging={dragIndex === index}
                            isDragOver={dragOverIndex === index}
                            onDragStart={() => setDragIndex(index)}
                            onDragOver={() => setDragOverIndex(index)}
                            onDrop={() => handleDrop(index)}
                            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                        />
                    ))
                )}
            </div>

            {/* Numbered pagination */}
            {!loading && filteredPlans.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Showing {filteredPlans.length === 0 ? 0 : (page - 1) * DISPLAY_PAGE_SIZE + 1}–{Math.min(page * DISPLAY_PAGE_SIZE, filteredPlans.length)} of {filteredPlans.length}
                        {activeTab !== "all" && ` in "${activeTab}"`}
                    </p>
                    
                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setPage((prev) => Math.max(1, prev - 1));
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
                                            setPage((prev) => Math.min(totalPages, prev + 1));
                                        }}
                                        className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}

            {/* Delete confirm dialog for plans */}
            {confirmDelete && (
                <DeleteConfirm
                    plan={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div
                    className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 p-3 rounded-xl shadow-xl border text-sm transition-all ${
                        toastMsg.ok
                            ? "bg-card border-[#95d0bfb3] text-foreground"
                            : "bg-red-500/10 border-red-500/20 text-red-300"
                    }`}
                >
                    {toastMsg.ok ? (
                        <CheckCircle2 size={15} className="text-primary shrink-0" />
                    ) : (
                        <AlertTriangle size={15} className="shrink-0" />
                    )}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
