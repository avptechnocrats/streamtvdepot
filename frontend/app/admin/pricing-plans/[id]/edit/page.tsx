"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getClientPlan, type ClientPricingPlanOut } from "@/lib/api";
import { PricingPlanForm } from "../../_components/PricingPlanForm";

export default function EditPricingPlanPage() {
    const params = useParams<{ id: string }>();
    const [plan, setPlan] = useState<ClientPricingPlanOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!params.id) return;
        getClientPlan(params.id)
            .then(setPlan)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load plan"))
            .finally(() => setLoading(false));
    }, [params.id]);

    if (loading) {
        return (
            <div className="p-6 space-y-4 animate-pulse">
                <div className="h-4 w-48 rounded bg-secondary" />
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                    <div className="h-4 w-32 rounded bg-secondary" />
                    <div className="h-9 rounded-lg bg-secondary" />
                    <div className="h-20 rounded-lg bg-secondary" />
                </div>
            </div>
        );
    }

    if (error || !plan) {
        return (
            <div className="p-6">
                <p className="text-sm text-red-400">{error ?? "Plan not found"}</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Link href="/admin/pricing-plans" className="hover:text-foreground transition-colors">
                    Pricing Plans
                </Link>
                <ChevronRight size={13} />
                <span className="text-foreground font-medium">{plan.name}</span>
            </div>

            <PricingPlanForm mode="edit" planId={plan.id} defaultValues={plan} />
        </div>
    );
}
