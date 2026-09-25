"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { listPlans, listTrashPlans, deletePlan, restorePlan, permanentDeletePlan, type PlanOut } from "@/lib/api";
import { DeleteConfirm } from "./_components/DeleteConfirm";
import { PlanCard } from "./_components/PlanCard";
import { TrashCard } from "./_components/TrashCard";
import { PlanCardSkeleton, TrashCardSkeleton } from "./_components/Skeletons";

type Tab = "active" | "trash";

export default function PlansPage() {
    const [plans, setPlans] = useState<PlanOut[]>([]);
    const [trash, setTrash] = useState<PlanOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("active");
    const [confirmDelete, setConfirmDelete] = useState<PlanOut | null>(null);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchActive = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setPlans(await listPlans());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load plans");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTrash = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setTrash(await listTrashPlans());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load trash");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tab === "active") fetchActive();
        else fetchTrash();
    }, [tab, fetchActive, fetchTrash]);

    // ── Toast ────────────────────────────────────────────────────────────────

    function toast(msg: string) {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    async function handleDeleteConfirm() {
        if (!confirmDelete) return;
        try {
            await deletePlan(confirmDelete.id);
            setPlans((prev) => prev.filter((p) => p.id !== confirmDelete.id));
            toast("Plan moved to Trash");
        } catch (err: unknown) {
            toast(err instanceof Error ? err.message : "Failed to delete plan");
        } finally {
            setConfirmDelete(null);
        }
    }

    async function handleRestore(plan: PlanOut) {
        try {
            await restorePlan(plan.id);
            setTrash((prev) => prev.filter((p) => p.id !== plan.id));
            toast("Plan restored");
        } catch (err: unknown) {
            toast(err instanceof Error ? err.message : "Restore failed");
        }
    }

    async function handlePermanentDelete(plan: PlanOut) {
        try {
            await permanentDeletePlan(plan.id);
            setTrash((prev) => prev.filter((p) => p.id !== plan.id));
            toast("Permanently deleted");
        } catch (err: unknown) {
            toast(err instanceof Error ? err.message : "Delete failed");
        }
    }

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Plans</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage subscription plans offered to clients
                    </p>
                </div>
                <Link
                    href="/admin/plans/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={15} /> New Plan
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
                {(["active", "trash"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {t === "active" ? "Plans" : "Trash"}
                        {t === "trash" && trash.length > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400 font-bold">
                                {trash.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* ── Active plans tab ──────────────────────────────────────── */}
            {tab === "active" && (
                <>
                    {loading && (
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <PlanCardSkeleton key={i} />
                            ))}
                        </div>
                    )}
                    {!loading && plans.length === 0 && !error && (
                        <div className="text-center py-16 text-muted-foreground text-sm">
                            No plans yet.{" "}
                            <Link href="/admin/plans/new" className="text-primary hover:underline">
                                Create your first plan.
                            </Link>
                        </div>
                    )}
                    {!loading && plans.length > 0 && (
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {plans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    onDelete={() => setConfirmDelete(plan)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Trash tab ─────────────────────────────────────────────── */}
            {tab === "trash" && (
                <>
                    {loading && (
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <TrashCardSkeleton key={i} />
                            ))}
                        </div>
                    )}
                    {!loading && trash.length === 0 && !error && (
                        <div className="text-center py-16 text-muted-foreground text-sm">
                            Trash is empty.
                        </div>
                    )}
                    {!loading && trash.length > 0 && (
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {trash.map((plan) => (
                                <TrashCard
                                    key={plan.id}
                                    plan={plan}
                                    onRestore={() => handleRestore(plan)}
                                    onDelete={() => handlePermanentDelete(plan)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Delete confirm dialog */}
            {confirmDelete && (
                <DeleteConfirm
                    plan={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border shadow-xl text-sm text-foreground">
                    <CheckCircle2 size={15} className="text-primary shrink-0" />
                    {toastMsg}
                </div>
            )}
        </div>
    );
}

