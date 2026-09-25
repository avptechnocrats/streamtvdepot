import { RotateCcw, Trash2 } from "lucide-react";
import type { PlanOut } from "@/lib/api";

export interface TrashCardProps {
    plan: PlanOut;
    onRestore: () => void;
    onDelete: () => void;
}

export function TrashCard({ plan, onRestore, onDelete }: TrashCardProps) {
    return (
        <div className="rounded-2xl border border-border border-dashed bg-card/50 p-5 flex flex-col gap-3 opacity-70 hover:opacity-100 transition-opacity">
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate line-through opacity-60">
                    {plan.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{plan.slug}</p>
            </div>

            <p className="text-lg font-bold text-foreground">
                {plan.currency} {plan.price_monthly.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
            </p>

            <div className="flex gap-2 pt-1 border-t border-border">
                <button
                    onClick={onRestore}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                    <RotateCcw size={12} /> Restore
                </button>
                <button
                    onClick={onDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                >
                    <Trash2 size={12} /> Delete Forever
                </button>
            </div>
        </div>
    );
}
