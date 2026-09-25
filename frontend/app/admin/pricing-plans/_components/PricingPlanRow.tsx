import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, GripVertical, Info, Loader2 } from "lucide-react";
import type { ClientPricingPlanOut } from "@/lib/api";
import { getVideo, getLiveTvChannel, getSeries, getAudio, getCategory } from "@/lib/api";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const CYCLE_LABELS: Record<string, string> = {
    daily: "day", weekly: "week", monthly: "month",
    quarterly: "quarter", yearly: "year", lifetime: "lifetime",
};

const PLAN_TYPE_LABELS: Record<string, { label: string; className: string }> = {
    subscription: { label: "Subscription", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    ppv:          { label: "PPV",          className: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
    rent:         { label: "Rent",         className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
};

const CONTENT_TYPE_ORDER = ["video", "livestream", "series", "audio"] as const;
const CONTENT_TYPE_META: Record<string, { label: string }> = {
    video: { label: "Video" },
    livestream: { label: "Live TV" },
    series: { label: "Series" },
    audio: { label: "Audio" },
};

function getBillingLabel(plan: ClientPricingPlanOut): string {
    if (plan.restriction_months != null)
        return `/ ${plan.restriction_months} month${plan.restriction_months !== 1 ? "s" : ""}`;
    if (plan.restriction_days != null)
        return `/ ${plan.restriction_days} day${plan.restriction_days !== 1 ? "s" : ""}`;
    if (plan.restriction_hours_per_day != null)
        return `/ ${plan.restriction_hours_per_day} hour${plan.restriction_hours_per_day !== 1 ? "s" : ""}`;
    return `/ ${CYCLE_LABELS[plan.billing_cycle] ?? plan.billing_cycle}`;
}

function appliesToSummary(plan: ClientPricingPlanOut): string {
    if (plan.applies_to_all_content) return "All content";
    if (plan.applies_to_scope === "category_subcategory") {
        const count = plan.applies_to_category_ids?.length ?? 0;
        return count > 0 ? `${count} categor${count === 1 ? "y" : "ies"}` : "Categories";
    }
    const count = plan.applies_to_content_ids?.length ?? 0;
    return count > 0 ? `${count} item${count === 1 ? "" : "s"}` : "Specific content";
}

function appliesToHasSpecific(plan: ClientPricingPlanOut): boolean {
    if (plan.applies_to_all_content) return false;
    const hasContent = (plan.applies_to_content_ids?.length ?? 0) > 0;
    const hasCategory = (plan.applies_to_category_ids?.length ?? 0) > 0;
    return hasContent || hasCategory;
}

async function resolveAppliesToNames(plan: ClientPricingPlanOut): Promise<string[]> {
    const labels: string[] = [];

    const catIds = plan.applies_to_category_ids ?? [];
    if (catIds.length > 0) {
        const res = await Promise.allSettled(catIds.map((id) => getCategory(id)));
        res.forEach((r) => {
            if (r.status === "fulfilled") labels.push(r.value.name);
            else labels.push("Unknown category");
        });
    }

    const contentIds = plan.applies_to_content_ids ?? [];
    if (contentIds.length > 0) {
        for (const id of contentIds) {
            const res = await Promise.allSettled([
                getVideo(id),
                getLiveTvChannel(id),
                getSeries(id),
                getAudio(id),
            ]);
            let found = false;
            for (let i = 0; i < res.length; i++) {
                if (res[i].status === "fulfilled") {
                    const data = (res[i] as PromiseFulfilledResult<{ title: string }>).value;
                    labels.push(`[${CONTENT_TYPE_META[CONTENT_TYPE_ORDER[i]].label}] ${data.title}`);
                    found = true;
                    break;
                }
            }
            if (!found) labels.push(id);
        }
    }

    return labels;
}

export interface PricingPlanRowProps {
    plan: ClientPricingPlanOut;
    onDelete: () => void;
    canDrag?: boolean;
    isDragging?: boolean;
    isDragOver?: boolean;
    onDragStart?: () => void;
    onDragOver?: () => void;
    onDrop?: () => void;
    onDragEnd?: () => void;
}

export function PricingPlanRow({
    plan,
    onDelete,
    canDrag,
    isDragging,
    isDragOver,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: PricingPlanRowProps) {
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoLoading, setInfoLoading] = useState(false);
    const [infoLabels, setInfoLabels] = useState<string[] | null>(null);

    const loadInfo = () => {
        if (infoLabels || infoLoading) return;
        setInfoLoading(true);
        resolveAppliesToNames(plan)
            .then((labels) => {
                setInfoLabels(labels);
                setInfoLoading(false);
            })
            .catch(() => setInfoLoading(false));
    };

    useEffect(() => {
        if (infoOpen) loadInfo();
    }, [infoOpen]);

    const rowClass = [
        "flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 transition-colors",
        isDragging ? "opacity-40" : "",
        isDragOver ? "border-t-2 border-t-primary bg-primary/5" : "hover:bg-muted/20",
        canDrag ? "cursor-grab active:cursor-grabbing" : "",
    ].join(" ");

    const type = PLAN_TYPE_LABELS[plan.plan_type] ?? { label: plan.plan_type, className: "bg-muted text-muted-foreground border-border" };
    const isFreeSub = plan.plan_type === "subscription" && Number(plan.price) === 0;
    const hasSpecific = appliesToHasSpecific(plan);

    return (
        <div
            draggable={canDrag}
            onDragStart={canDrag ? onDragStart : undefined}
            onDragOver={
                canDrag
                    ? (e) => { e.preventDefault(); onDragOver?.(); }
                    : undefined
            }
            onDrop={
                canDrag
                    ? (e) => { e.preventDefault(); onDrop?.(); }
                    : undefined
            }
            onDragEnd={canDrag ? onDragEnd : undefined}
            className={rowClass}
        >
            {canDrag ? (
                <div className="w-5 shrink-0 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70">
                    <GripVertical size={14} />
                </div>
            ) : (
                <span className="w-5 shrink-0 text-[10px] font-mono text-muted-foreground text-center">
                    {/* {plan.sort_order} */}
                </span>
            )}

            {/* Plan */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate" title={plan.name}>
                    {plan.name}
                    {plan.plan_type === "subscription" && isFreeSub && (
                        <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">
                            Free
                        </span>
                    )}
                </p>
                {plan.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5" title={plan.description}>
                        {plan.description}
                    </p>
                )}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-1 w-40 shrink-0">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                    {plan.currency} {Number(plan.price).toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                    {getBillingLabel(plan)}
                </span>
            </div>

            {/* Plan Type */}
            <span className={`hidden sm:inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${type.className} w-24 shrink-0`}>
                {type.label}
            </span>

            {/* Applies To */}
            <div className="hidden sm:flex sm:items-center items-center justify-center gap-1 w-40 shrink-0">
                <p className="text-xs text-muted-foreground truncate" title={appliesToSummary(plan)}>
                    {appliesToSummary(plan)}
                </p>
                {hasSpecific && (
                    <Popover open={infoOpen} onOpenChange={setInfoOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-colors"
                                title="View included content"
                            >
                                <Info size={12} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
                            <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Included Content
                                </p>
                                {infoLoading && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                                        <Loader2 size={12} className="animate-spin" />
                                        Loading…
                                    </div>
                                )}
                                {!infoLoading && infoLabels && (
                                    <div className="max-h-60 overflow-y-auto pr-1 space-y-0.5">
                                        {infoLabels.map((label, i) => (
                                            <p key={i} className="text-xs text-foreground break-all">
                                                • {label}
                                            </p>
                                        ))}
                                    </div>
                                )}
                                {!infoLoading && (infoLabels?.length ?? 0) === 0 && (
                                    <p className="text-xs text-muted-foreground">No specific content found.</p>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {/* Trial */}
            <p className="hidden sm:block text-center text-xs text-muted-foreground w-24 shrink-0">
                {plan.plan_type === "subscription" && (plan.trial_days ?? 0) > 0
                    ? `${plan.trial_days} days`
                    : "—"}
            </p>

            {/* Status */}
            <span className={`w-20 shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                plan.is_active
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}>
                {plan.is_active ? "Active" : "Inactive"}
            </span>

            {/* Actions */}
            <div className="flex items-center gap-1 w-24 shrink-0 justify-end">
                <Link
                    href={`/admin/pricing-plans/${plan.id}/edit`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                >
                    <Pencil size={15} color="#2a83e9" />
                </Link>
                <button
                    onClick={onDelete}
                    className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    title="Delete"
                >
                    <Trash2 size={15} color="#fa4b4b" />
                </button>
            </div>
        </div>
    );
}
