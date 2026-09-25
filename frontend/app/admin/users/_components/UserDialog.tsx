import { X } from "lucide-react";
import type { EndUserOut } from "@/lib/api";
import { UserForm } from "./UserForm";

interface UserDialogCreateProps {
    mode: "create";
    initialData?: undefined;
    onClose: () => void;
    onSaved: (user: EndUserOut) => void;
}

interface UserDialogEditProps {
    mode: "edit";
    initialData: EndUserOut;
    onClose: () => void;
    onSaved: (user: EndUserOut) => void;
}

type UserDialogProps = UserDialogCreateProps | UserDialogEditProps;

export function UserDialog({ mode, initialData, onClose, onSaved }: UserDialogProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">
                            {mode === "create" ? "New User" : "Edit User"}
                        </h2>
                        {mode === "edit" && (
                            <p className="text-xs text-muted-foreground mt-0.5">{initialData.email}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <div className="p-5">
                    {mode === "create" ? (
                        <UserForm mode="create" onSuccess={onSaved} onCancel={onClose} />
                    ) : (
                        <UserForm mode="edit" initialData={initialData} onSuccess={onSaved} onCancel={onClose} />
                    )}
                </div>
            </div>
        </div>
    );
}
