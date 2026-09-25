import Link from "next/link";
import { Pencil, Trash2, DollarSign, GripVertical } from "lucide-react";
import type { ClientPricingPlanOut } from "@/lib/api";

const COUNTRY_NAMES: Record<string, string> = {
    US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
    DE: "Germany", FR: "France", IN: "India", CN: "China", JP: "Japan",
    KR: "South Korea", BR: "Brazil", MX: "Mexico", AE: "UAE", SA: "Saudi Arabia",
    EG: "Egypt", ZA: "South Africa", NG: "Nigeria", RU: "Russia", IT: "Italy",
    ES: "Spain", NL: "Netherlands", SE: "Sweden", NO: "Norway", PK: "Pakistan",
    ID: "Indonesia", TR: "Turkey", AR: "Argentina", CO: "Colombia", SG: "Singapore",
    MY: "Malaysia", TH: "Thailand", PH: "Philippines",
};

const CYCLE_LABELS: Record<string, string> = {
    daily: "day", weekly: "week", monthly: "month",
    quarterly: "quarter", yearly: "year", lifetime: "lifetime",
};

const PLAN_TYPE_LABELS: Record<string, { label: string; className: string }> = {
    subscription: { label: "Subscription", className: "bg-blue-500/15 text-blue-400" },
    ppv:          { label: "PPV",          className: "bg-purple-500/15 text-purple-400" },
    rent:         { label: "Rent",         className: "bg-amber-500/15 text-amber-400" },
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

interface Props {
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

export function PricingPlanCard({
    plan,
    onDelete,
    canDrag,
    isDragging,
    isDragOver,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: Props) {

    return (
        <div
            draggable={canDrag}
            onDragStart={onDragStart}
            onDragOver={(e) => { e.preventDefault(); onDragOver?.(); }}
            onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
            onDragEnd={onDragEnd}
            className={`rounded-2xl border bg-card p-5 flex flex-col transition-colors ${
                isDragging ? "opacity-40" : ""
            } ${isDragOver ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/30"}`}
        >
            {/* Content wrapper */}
            <div className="flex flex-col gap-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                    {canDrag && (
                        <GripVertical size={16} className="shrink-0 text-muted-foreground/50 mt-0.5 cursor-grab active:cursor-grabbing" />
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{plan.name}</p>
                        {plan.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{plan.description}</p>
                        )}
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${plan.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        {plan.is_active ? "Active" : "Inactive"}
                    </span>
                    {plan.plan_type && (() => {
                        const pt = PLAN_TYPE_LABELS[plan.plan_type] ?? { label: plan.plan_type, className: "bg-muted text-muted-foreground" };
                        return (
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${pt.className}`}>
                                {pt.label}
                            </span>
                        );
                    })()}
                </div>

                {/* Pricing */}
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-foreground">
                        {plan.currency} {Number(plan.price).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {getBillingLabel(plan)}
                    </span>
                </div>

                {/* Country pricing overrides */}
                {plan.country_pricing && plan.country_pricing.length > 0 && (
                    <div className="rounded-xl bg-secondary border border-border px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                            <DollarSign size={11} className="text-primary" />
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {plan.country_pricing.length} Country Price{plan.country_pricing.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {plan.country_pricing.slice(0, 4).map((cp) => (
                                <span key={cp.country} className="text-xs text-foreground">
                                    {COUNTRY_NAMES[cp.country] ?? cp.country}:{" "}
                                    <span className="font-medium">{cp.currency} {Number(cp.price).toFixed(2)}</span>
                                </span>
                            ))}
                            {plan.country_pricing.length > 4 && (
                                <span className="text-xs text-muted-foreground">+{plan.country_pricing.length - 4} more</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions — always at bottom */}
            <div className="flex gap-2 pt-4 mt-auto border-t border-border">
                <Link
                    href={`/admin/pricing-plans/${plan.id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                    <Pencil size={12} /> Edit
                </Link>
                <button
                    onClick={onDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors ml-auto"
                >
                    <Trash2 size={12} /> Delete
                </button>
            </div>
        </div>
    );
}
