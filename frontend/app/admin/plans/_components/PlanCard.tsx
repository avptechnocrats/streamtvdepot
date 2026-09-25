import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { PlanOut } from "@/lib/api";
import { Badge } from "./Badge";
import { limitLabel } from "./utils";

export interface PlanCardProps {
    plan: PlanOut;
    onDelete: () => void;
}

export function PlanCard({ plan, onDelete }: PlanCardProps) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4 hover:border-primary/30 transition-colors">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{plan.name}</p>
                    {plan.sub_text && (
                        <p className="text-xs text-primary/80 mt-0.5 truncate">{plan.sub_text}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{plan.slug}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {plan.is_trial && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                            Trial
                        </span>
                    )}
                    <Badge active={plan.is_active} />
                </div>
            </div>

            {/* Pricing */}
            <div className="space-y-1">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-foreground">
                        {plan.currency} {plan.price_monthly.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                </div>
                {(plan.price_quarterly || plan.price_yearly) && (
                    <div className="flex gap-3 text-[11px] text-muted-foreground">
                        {plan.price_quarterly && <span>Quarterly: {plan.currency} {plan.price_quarterly.toFixed(2)}</span>}
                        {plan.price_yearly && <span>Yearly: {plan.currency} {plan.price_yearly.toFixed(2)}</span>}
                    </div>
                )}
            </div>

            {/* Description */}
            {plan.description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {plan.description}
                </p>
            )}

            {/* Limits & Actions */}
            <div className="flex flex-col gap-4 mt-auto">
                {/* Limits */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {([
                        ["Users", plan.max_users],
                        ["Storage", plan.max_storage_gb !== null ? `${limitLabel(plan.max_storage_gb)} GB` : "—"],
                        ["Streams", plan.max_streams],
                        ["Admins", plan.max_admin_users],
                    ] as [string, number | string | null][]).map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium text-foreground">
                                {typeof val === "number" ? limitLabel(val) : (val ?? "—")}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-border">
                    <Link
                        href={`/admin/plans/${plan.id}/edit`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
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
        </div>
    );
}
