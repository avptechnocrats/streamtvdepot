import { Trash2 } from "lucide-react";
import type { PlanOut } from "@/lib/api";

export interface DeleteConfirmProps {
    plan: PlanOut;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteConfirm({ plan, onCancel, onConfirm }: DeleteConfirmProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <Trash2 size={18} className="text-red-400" />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-foreground">Delete Plan</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        <span className="text-foreground font-medium">{plan.name}</span> will be moved to Trash.
                        This action can be undone from the Trash tab.
                    </p>
                </div>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
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
