"use client";

import { useEffect, useState } from "react";
import {
    Check,
    CheckCircle2,
    Info,
    Mail,
    Pencil,
    Plus,
    Search,
    ShieldCheck,
    Trash2,
    TriangleAlert,
    UserX,
} from "lucide-react";
import {
    createAdminUser,
    deleteAdminUser,
    listAdminUsers,
    listRolePermissions,
    listRoles,
    resendAdminUserInvitation,
    updateAdminUser,
    type ClientAdminUser,
    type ClientPermission,
    type ClientRole,
} from "@/lib/api";
import {
    getPaginationItems,
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

type EditorState = {
    user?: ClientAdminUser;
    fullName: string;
    email: string;
    roleId: string;
    isActive: boolean;
};

const emptyEditor: EditorState = {
    fullName: "",
    email: "",
    roleId: "",
    isActive: true,
};

const PAGE_SIZE = 10;

export default function TeamMembersPage() {
    const [members, setMembers] = useState<ClientAdminUser[]>([]);
    const [roles, setRoles] = useState<ClientRole[]>([]);
    const [permissions, setPermissions] = useState<ClientPermission[]>([]);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [permissionsMember, setPermissionsMember] =
        useState<ClientAdminUser | null>(null);
    const [memberToDelete, setMemberToDelete] =
        useState<ClientAdminUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const load = async () => {
        setLoading(true);
        try {
            const [membersResult, rolesResult, permissionsResult] = await Promise.all([
                listAdminUsers(),
                listRoles(),
                listRolePermissions(),
            ]);
            setMembers(membersResult);
            setRoles(rolesResult);
            setPermissions(permissionsResult);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to load team members",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const roleName = (roleId: string | null) =>
        roles.find((role) => role.id === roleId)?.name || "No role";

    const memberPermissions = (member: ClientAdminUser) =>
        roles.find((role) => role.id === member.role_id)?.permission_codes || [];

    const saveMember = async () => {
        if (
            !editor ||
            !editor.fullName.trim() ||
            !editor.roleId ||
            (!editor.user && !editor.email.trim())
        )
            return;
        setSaving(true);
        setMessage(null);
        try {
            if (editor.user) {
                await updateAdminUser(editor.user.id, {
                    full_name: editor.fullName.trim(),
                    role_id: editor.roleId,
                    is_active: editor.isActive,
                });
            } else {
                await createAdminUser({
                    full_name: editor.fullName.trim(),
                    email: editor.email.trim(),
                    role_id: editor.roleId,
                });
            }
            setEditor(null);
            await load();
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to save team member",
            );
        } finally {
            setSaving(false);
        }
    };

    const openEditor = (user?: ClientAdminUser) => {
        setEditor(
            user
                ? {
                      user,
                      fullName: user.full_name,
                      email: user.email,
                      roleId: user.role_id || "",
                      isActive: user.is_active,
                  }
                : emptyEditor,
        );
    };

    const resendInvitation = async (member: ClientAdminUser) => {
        setSaving(true);
        setMessage(null);
        try {
            await resendAdminUserInvitation(member.id);
            setMessage(`A new invitation link was sent to ${member.email}.`);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to resend the invitation link",
            );
        } finally {
            setSaving(false);
        }
    };

    const removeMember = async () => {
        if (!memberToDelete) return;
        setSaving(true);
        setMessage(null);
        try {
            await deleteAdminUser(memberToDelete.id);
            setMemberToDelete(null);
            await load();
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to delete team member",
            );
        } finally {
            setSaving(false);
        }
    };

    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filteredMembers = members.filter((member) =>
        [
            member.full_name,
            member.email,
            member.role === "owner" ? "Owner" : roleName(member.role_id),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)),
    );
    const totalPages = Math.max(
        1,
        Math.ceil(filteredMembers.length / PAGE_SIZE),
    );
    const paginatedMembers = filteredMembers.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
    );

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        Team Members
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Manage the backoffice team that can access your
                        platform.
                    </p>
                </div>
                <button
                    onClick={() => openEditor()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
                >
                    <Plus size={16} /> Add Team Member
                </button>
            </div>

            {message && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                    {message}
                </div>
            )}

            <div className="relative max-w-sm">
                <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                    }}
                    placeholder="Search team members..."
                    className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)_150px_90px_190px] gap-4 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <span>Team Member</span>
                    <span>Role</span>
                    <span>Permissions</span>
                    <span className="flex items-center justify-center">Status</span>
                    <span className="text-right">Actions</span>
                </div>
                {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={`member-skeleton-${index}`}
                            className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)_150px_90px_190px] items-center gap-4 border-b border-border px-4 py-4 last:border-0"
                        >
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-44" />
                            </div>
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="mx-auto h-4 w-14" />
                            <Skeleton className="ml-auto h-7 w-16" />
                        </div>
                    ))
                ) : filteredMembers.length === 0 ? (
                    <div className="p-12 text-center text-sm text-muted-foreground">
                        {members.length === 0
                            ? "No team members yet."
                            : "No team members match your search."}
                    </div>
                ) : (
                    paginatedMembers.map((member) => {
                        const isOwner = member.role === "owner";
                        const assignedPermissions = memberPermissions(member);
                        return (
                            <div
                                key={member.id}
                                className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)_150px_90px_190px] items-center gap-4 border-b border-border px-4 py-4 last:border-0"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                        {member.full_name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {member.email}
                                    </p>
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5 text-sm">
                                    <ShieldCheck
                                        size={14}
                                        className="shrink-0 text-primary"
                                    />
                                    <span className="truncate">
                                        {isOwner
                                            ? "Owner"
                                            : roleName(member.role_id)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                                    <span className="whitespace-nowrap">
                                        {assignedPermissions.length} Permissions
                                    </span>
                                    <button
                                        onClick={() => setPermissionsMember(member)}
                                        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="View assigned permissions"
                                        aria-label={`View permissions for ${member.full_name}`}
                                    >
                                        <Info size={18} className="text-primary" />
                                    </button>
                                </div>
                                <div
                                    className={`flex items-center justify-center gap-1.5 text-sm gap-1.5 text-xs font-medium ${member.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                                >
                                    {member.is_active ? (
                                        <CheckCircle2 size={14} />
                                    ) : (
                                        <UserX size={14} />
                                    )}
                                    {member.is_active ? "Active" : "Inactive"}
                                </div>
                                <div className="flex justify-end gap-1">
                                    {!isOwner && !member.is_active && (
                                        <button
                                            onClick={() => resendInvitation(member)}
                                            disabled={saving}
                                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                            title="Resend invitation link"
                                        >
                                            <Mail size={14} /> Resend Link
                                        </button>
                                    )}
                                    {isOwner ? (
                                        <span
                                            title="The tenant Owner account cannot be edited"
                                            className="cursor-not-allowed rounded-md p-2 text-muted-foreground/40"
                                        >
                                            <Pencil size={15} />
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => openEditor(member)}
                                            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            title="Edit team member"
                                        >
                                            <Pencil size={15} color="#2a83e9" />
                                        </button>
                                    )}
                                    {!isOwner && (
                                        <button
                                            onClick={() => setMemberToDelete(member)}
                                            className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                            title="Delete team member"
                                        >
                                            <Trash2 size={15} color="#fa4b4b" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {!loading && filteredMembers.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}-
                        {Math.min(page * PAGE_SIZE, filteredMembers.length)} of{" "}
                        {filteredMembers.length}
                    </p>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        if (page > 1) setPage(page - 1);
                                    }}
                                    aria-disabled={page <= 1}
                                    className={
                                        page <= 1
                                            ? "pointer-events-none opacity-50"
                                            : ""
                                    }
                                />
                            </PaginationItem>
                            {getPaginationItems(page, totalPages, 1).map(
                                (item, index) =>
                                    item === "ellipsis" ? (
                                        <PaginationItem
                                            key={`ellipsis-${index}`}
                                        >
                                            <PaginationEllipsis />
                                        </PaginationItem>
                                    ) : (
                                        <PaginationItem key={item}>
                                            <PaginationLink
                                                href="#"
                                                isActive={item === page}
                                                onClick={(event) => {
                                                    event.preventDefault();
                                                    setPage(item);
                                                }}
                                            >
                                                {item}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ),
                            )}
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        if (page < totalPages)
                                            setPage(page + 1);
                                    }}
                                    aria-disabled={page >= totalPages}
                                    className={
                                        page >= totalPages
                                            ? "pointer-events-none opacity-50"
                                            : ""
                                    }
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {permissionsMember && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="member-permissions-title"
                >
                    <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h2 id="member-permissions-title" className="text-base font-bold">
                                    {permissionsMember.full_name} permissions
                                </h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {memberPermissions(permissionsMember).length} permissions granted
                                </p>
                            </div>
                            <button
                                onClick={() => setPermissionsMember(null)}
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Close
                            </button>
                        </div>
                        <div className="max-h-[60vh] divide-y divide-border overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/70">
                            {memberPermissions(permissionsMember).map((code) => {
                                const permission = permissions.find((item) => item.code === code);
                                return (
                                    <div key={code} className="flex items-start gap-3 px-5 py-3">
                                        <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                                        <div>
                                            <p className="text-sm font-medium">{permission?.description || code}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{code}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <AlertDialog
                open={Boolean(memberToDelete)}
                onOpenChange={(open) =>
                    !open && !saving && setMemberToDelete(null)
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <span className="rounded-md bg-destructive/10 p-1.5 text-destructive">
                                <TriangleAlert size={18} />
                            </span>
                            Delete team member?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {memberToDelete
                                ? `Delete ${memberToDelete.full_name}'s team account? This cannot be undone.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={removeMember}
                            disabled={saving}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {saving ? "Deleting..." : "Delete Member"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {editor && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <h2 className="text-base font-bold">
                                {editor.user
                                    ? "Edit Team Member"
                                    : "Add Team Member"}
                            </h2>
                            <button
                                onClick={() => setEditor(null)}
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </button>
                        </div>
                        <div className="space-y-4 p-5">
                            <label className="block space-y-1.5 text-sm font-medium">
                                Full name
                                <input
                                    value={editor.fullName}
                                    onChange={(event) =>
                                        setEditor({
                                            ...editor,
                                            fullName: event.target.value,
                                        })
                                    }
                                    className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                                    autoComplete="name"
                                />
                            </label>
                            {!editor.user && (
                                <>
                                    <label className="block space-y-1.5 text-sm font-medium">
                                        Email
                                        <input
                                            type="email"
                                            value={editor.email}
                                            onChange={(event) =>
                                                setEditor({
                                                    ...editor,
                                                    email: event.target.value,
                                                })
                                            }
                                            className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                                            autoComplete="email"
                                        />
                                    </label>
                                </>
                            )}
                            <label className="block space-y-1.5 text-sm font-medium">
                                Role
                                <select
                                    disabled={editor.user?.role === "owner"}
                                    value={editor.roleId}
                                    onChange={(event) =>
                                        setEditor({
                                            ...editor,
                                            roleId: event.target.value,
                                        })
                                    }
                                    className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <option value="">Select a role</option>
                                    {roles
                                        .filter((role) => !role.is_owner_role)
                                        .map((role) => (
                                            <option
                                                key={role.id}
                                                value={role.id}
                                            >
                                                {role.name}
                                            </option>
                                        ))}
                                </select>
                            </label>
                            {editor.user?.role === "owner" ? (
                                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                                    The tenant Owner account cannot be
                                    reassigned or deactivated.
                                </div>
                            ) : (
                                editor.user && (
                                    <label className="flex items-center gap-2 text-sm font-medium">
                                        <input
                                            type="checkbox"
                                            checked={editor.isActive}
                                            onChange={(event) =>
                                                setEditor({
                                                    ...editor,
                                                    isActive:
                                                        event.target.checked,
                                                })
                                            }
                                            className="h-4 w-4 accent-primary"
                                        />{" "}
                                        Active account
                                    </label>
                                )
                            )}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
                            <button
                                onClick={() => setEditor(null)}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={
                                    saving ||
                                    !editor.fullName.trim() ||
                                    !editor.roleId ||
                                    (!editor.user && !editor.email.trim())
                                }
                                onClick={saveMember}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Team Member"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
