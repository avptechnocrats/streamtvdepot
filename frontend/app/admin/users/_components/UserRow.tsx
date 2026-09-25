import Link from "next/link";
import { Pencil, Trash2, User2, CheckCircle2, XCircle } from "lucide-react";
import type { EndUserOut } from "@/lib/api";

export interface UserRowProps {
    user: EndUserOut;
    onEdit: () => void;
    onDelete: () => void;
}

export function UserRow({ user, onEdit, onDelete }: UserRowProps) {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary border border-border shrink-0">
                {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <User2 size={14} />
                    </div>
                )}
            </div>

            {/* Name + email */}
            <Link href={`/admin/users/${user.id}`} className="flex-1 min-w-0 group" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-medium text-primary group-hover:underline truncate">{user.full_name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
            </Link>

            {/* Country */}
            <p className="hidden md:block text-xs text-muted-foreground w-24 truncate shrink-0">
                {user.country ?? "—"}
            </p>

            {/* Email verified */}
            <div className="hidden sm:flex w-20 items-center gap-1 shrink-0">
                {user.is_email_verified ? (
                    <CheckCircle2 size={13} className="text-emerald-400" />
                ) : (
                    <XCircle size={13} className="text-muted-foreground/40" />
                )}
                <span className="text-xs text-muted-foreground">
                    {user.is_email_verified ? "Verified" : "Unverified"}
                </span>
            </div>

            {/* Active badge */}
            <span className={`hidden sm:flex w-14 justify-center text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${user.is_active
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                {user.is_active ? "Active" : "Inactive"}
            </span>

            {/* Joined date */}
            <p className="hidden lg:block text-xs text-muted-foreground w-24 shrink-0">
                {new Date(user.created_at).toLocaleDateString()}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-1 w-16 shrink-0 justify-end">
                <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    title="Edit"
                >
                    <Pencil size={13} />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors"
                    title="Delete"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}
