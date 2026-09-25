"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Users, AlertTriangle, CheckCircle2, UserCheck, UserX, Grid, RefreshCw } from "lucide-react";
import { listUsers, deleteUser, type EndUserOut } from "@/lib/api";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    getPaginationItems,
} from "@/components/ui/pagination";
import { UserRow } from "./_components/UserRow";
import { UserRowSkeleton } from "./_components/Skeletons";
import { DeleteUserConfirm } from "./_components/DeleteUserConfirm";
import { UserDialog } from "./_components/UserDialog";

type StatusFilter = "all" | "active" | "inactive";

const PAGE_SIZE = 10;

export default function UsersPage() {
    const [users, setUsers] = useState<EndUserOut[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ all: 0, active: 0, inactive: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [page, setPage] = useState(1);
    const [confirmDelete, setConfirmDelete] = useState<EndUserOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
    const [editTarget, setEditTarget] = useState<EndUserOut | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const fetchUsers = useCallback(async (manualRefresh = false) => {
        if (manualRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const result = await listUsers({
                page,
                page_size: PAGE_SIZE,
                search: search.trim() || undefined,
                is_active: statusFilter === "all" ? undefined : statusFilter === "active",
            });
            setUsers(result.items);
            setTotal(result.total);
            setCounts(result.counts);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load users");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deleteUser(confirmDelete.id);
            toast(`"${confirmDelete.full_name}" deleted`);
            fetchUsers(true);
        } catch {
            toast("Failed to delete user", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    function handleSaved(user: EndUserOut) {
        toast(dialogMode === "create" ? `"${user.full_name}" created` : `"${user.full_name}" updated`);
        setDialogMode(null);
        setEditTarget(null);
        fetchUsers(true);
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const tabs: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
        { key: "all", label: "All", icon: Grid },
        { key: "active", label: "Active", icon: UserCheck },
        { key: "inactive", label: "Inactive", icon: UserX },
    ];

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">Users</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage end users registered on your platform
                    </p>
                </div>
                <button
                    onClick={() => setDialogMode("create")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={15} /> New User
                </button>
            </div>

            {/* Tabs + Search + Refresh */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {tabs.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => { setStatusFilter(key); setPage(1); }}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                statusFilter === key
                                    ? "bg-card text-foreground shadow-sm border border-border/50"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {counts[key]}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2 w-full lg:w-auto">
                    <div className="relative w-72 md:w-80">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            placeholder="Search by name, email, phone…"
                            className="w-full h-10 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => fetchUsers(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
                    <div className="w-9 shrink-0" />
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Name / Email</p>
                    <p className="hidden md:block w-24 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Country</p>
                    <p className="hidden sm:block w-20 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Email</p>
                    <p className="hidden sm:block w-14 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className="hidden lg:block w-24 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Joined</p>
                    <div className="w-16 shrink-0" />
                </div>

                {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <UserRowSkeleton key={i} />)
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <Users size={32} className="opacity-30" />
                        <p className="text-sm">
                            {search ? "No users match your search" : "No users yet"}
                        </p>
                        {!search && (
                            <button
                                onClick={() => setDialogMode("create")}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-primary/40 transition-colors"
                            >
                                <Plus size={12} /> Add your first user
                            </button>
                        )}
                    </div>
                ) : (
                    users.map((user) => (
                        <UserRow
                            key={user.id}
                            user={user}
                            onEdit={() => { setEditTarget(user); setDialogMode("edit"); }}
                            onDelete={() => setConfirmDelete(user)}
                        />
                    ))
                )}
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                    </p>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page > 1) setPage((p) => p - 1);
                                    }}
                                    aria-disabled={page <= 1}
                                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            {getPaginationItems(page, totalPages, 1).map((p, index) =>
                                p === "ellipsis" ? (
                                    <PaginationItem key={`ellipsis-${index}`}>
                                        <PaginationEllipsis className="h-9 w-9" />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href="#"
                                            isActive={p === page}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setPage(p);
                                            }}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page < totalPages) setPage((p) => p + 1);
                                    }}
                                    aria-disabled={page >= totalPages}
                                    className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {/* Delete confirm */}
            {confirmDelete && (
                <DeleteUserConfirm
                    user={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}

            {/* Create / Edit dialog */}
            {dialogMode === "create" && (
                <UserDialog
                    mode="create"
                    onClose={() => setDialogMode(null)}
                    onSaved={handleSaved}
                />
            )}
            {dialogMode === "edit" && editTarget && (
                <UserDialog
                    mode="edit"
                    initialData={editTarget}
                    onClose={() => { setDialogMode(null); setEditTarget(null); }}
                    onSaved={handleSaved}
                />
            )}

            {/* Toast */}
            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toastMsg.ok
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>
                    {toastMsg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}

