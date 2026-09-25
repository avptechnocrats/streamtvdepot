import { AlertTriangle } from "lucide-react";
import type { ClientPricingPlanOut } from "@/lib/api";

interface Props {
    plan: ClientPricingPlanOut;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteConfirm({ plan, onCancel, onConfirm }: Props) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl border border-border bg-card shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                        <AlertTriangle size={18} className="text-red-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">Delete Plan</p>
                        <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Are you sure you want to delete <span className="font-medium text-foreground">{plan.name}</span>?
                </p>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
