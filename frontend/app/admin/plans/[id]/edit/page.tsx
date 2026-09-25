"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, AlertTriangle } from "lucide-react";
import { getPlan, type PlanOut } from "@/lib/api";
import { PlanForm, planToFormValues } from "../../_components/PlanForm";

interface EditPlanPageProps {
    params: Promise<{ id: string }>;
}

export default function EditPlanPage({ params }: EditPlanPageProps) {
    const [plan, setPlan] = useState<PlanOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [planId, setPlanId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setPlanId(id);
            getPlan(id)
                .then(setPlan)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load plan"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/plans"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Plans
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {plan ? plan.name : "Edit Plan"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit Plan</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update the details of this subscription plan
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                    <Loader2 size={16} className="animate-spin" /> Loading plan…
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {plan && (
                <PlanForm
                    mode="edit"
                    planId={planId}
                    defaultValues={planToFormValues(plan)}
                />
            )}
        </div>
    );
}
