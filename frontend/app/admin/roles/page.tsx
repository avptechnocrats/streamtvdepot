"use client";

import { useEffect, useState } from "react";
import {
    Check,
    Info,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    TriangleAlert,
    Users,
} from "lucide-react";
import {
    createRole,
    deleteRole,
    listRolePermissions,
    listRoles,
    updateRole,
    type ClientPermission,
    type ClientRole,
} from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";

type EditorState = {
    id?: string;
    name: string;
    description: string;
    permissionCodes: string[];
};

const emptyEditor: EditorState = {
    name: "",
    description: "",
    permissionCodes: [],
};

const PAGE_SIZE = 10;

export default function RolesPage() {
    const [roles, setRoles] = useState<ClientRole[]>([]);
    const [permissions, setPermissions] = useState<ClientPermission[]>([]);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [permissionsRole, setPermissionsRole] = useState<ClientRole | null>(
        null,
    );
    const [roleToDelete, setRoleToDelete] = useState<ClientRole | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const load = async () => {
        setLoading(true);
        try {
            const [rolesResult, permissionsResult] = await Promise.all([
                listRoles(),
                listRolePermissions(),
            ]);
            setRoles(rolesResult);
            setPermissions(permissionsResult);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to load roles and permissions",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const groupedPermissions = permissions.reduce<
        Record<string, ClientPermission[]>
    >((groups, permission) => {
        (groups[permission.module] ??= []).push(permission);
        return groups;
    }, {});

    const togglePermission = (code: string) => {
        setEditor(
            (current) =>
                current && {
                    ...current,
                    permissionCodes: current.permissionCodes.includes(code)
                        ? current.permissionCodes.filter(
                              (item) => item !== code,
                          )
                        : [...current.permissionCodes, code],
                },
        );
    };

    const toggleModule = (modulePermissions: ClientPermission[]) => {
        setEditor((current) => {
            if (!current) return current;
            const codes = modulePermissions.map(
                (permission) => permission.code,
            );
            const allSelected = codes.every((code) =>
                current.permissionCodes.includes(code),
            );
            return {
                ...current,
                permissionCodes: allSelected
                    ? current.permissionCodes.filter(
                          (code) => !codes.includes(code),
                      )
                    : [...new Set([...current.permissionCodes, ...codes])],
            };
        });
    };

    const saveRole = async () => {
        if (!editor || !editor.name.trim()) return;
        setSaving(true);
        setMessage(null);
        try {
            const data = {
                name: editor.name.trim(),
                description: editor.description.trim() || undefined,
                permission_codes: editor.permissionCodes,
            };
            if (editor.id) await updateRole(editor.id, data);
            else await createRole(data);
            setEditor(null);
            await load();
        } catch (error) {
            setMessage(
                error instanceof Error ? error.message : "Unable to save role",
            );
        } finally {
            setSaving(false);
        }
    };

    const removeRole = async () => {
        if (!roleToDelete) return;
        setSaving(true);
        try {
            await deleteRole(roleToDelete.id);
            setRoleToDelete(null);
            await load();
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to delete role",
            );
        } finally {
            setSaving(false);
        }
    };

    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filteredRoles = roles.filter((role) =>
        [role.name, role.description || ""].some((value) =>
            value.toLocaleLowerCase().includes(normalizedSearch),
        ),
    );
    const totalPages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE));
    const paginatedRoles = filteredRoles.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
    );

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        Roles & Access
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        Create team roles and grant only the access each role
                        needs.
                    </p>
                </div>
                <button
                    onClick={() => setEditor(emptyEditor)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
                >
                    <Plus size={16} /> New Role
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
                    placeholder="Search roles..."
                    className="h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="grid grid-cols-[minmax(0,1fr)_150px_90px_130px] gap-4 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <span>Role</span>
                    <span>Permissions</span>
                    <span className="flex items-center justify-center">Members</span>
                    <span className="text-right">Actions</span>
                </div>
                {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={`role-skeleton-${index}`}
                            className="grid grid-cols-[minmax(0,1fr)_150px_90px_130px] items-center gap-4 border-b border-border px-4 py-4 last:border-0"
                        >
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-4 rounded" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="mx-auto h-4 w-8" />
                            <Skeleton className="ml-auto h-7 w-14" />
                        </div>
                    ))
                ) : (
                    paginatedRoles.map((role) => (
                        <div
                            key={role.id}
                            className="grid grid-cols-[minmax(0,1fr)_150px_90px_130px] items-center gap-4 border-b border-border px-4 py-4 last:border-0"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck
                                        size={16}
                                        className="text-primary"
                                    />
                                    <p className="truncate text-sm font-semibold">
                                        {role.name}
                                    </p>
                                    {role.is_owner_role && (
                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                            OWNER
                                        </span>
                                    )}
                                </div>
                                {/* <p className="mt-1 truncate text-xs text-muted-foreground">{role.description || `${role.permission_codes.length} permissions granted`}</p> */}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                                <span className="whitespace-nowrap">
                                    {role.permission_codes.length} permissions
                                </span>
                                <button
                                    onClick={() => setPermissionsRole(role)}
                                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    title="View granted permissions"
                                    aria-label={`View permissions for ${role.name}`}
                                >
                                    <Info size={18} color="green" />
                                </button>
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                                <Users size={15} color="lightblue" />
                                {role.assigned_users_count}
                            </div>
                            <div className="flex justify-end gap-1">
                                {role.is_owner_role ? (
                                    <span
                                        title="The Owner role cannot be edited"
                                        className="cursor-not-allowed rounded-md p-2 text-muted-foreground/40"
                                    >
                                        <Pencil size={15} />
                                    </span>
                                ) : (
                                    <button
                                        onClick={() =>
                                            setEditor({
                                                id: role.id,
                                                name: role.name,
                                                description:
                                                    role.description || "",
                                                permissionCodes:
                                                    role.permission_codes,
                                            })
                                        }
                                        className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        title="Edit role"
                                    >
                                        <Pencil size={15} color="#2a83e9" />
                                    </button>
                                )}
                                {!role.is_system_role && (
                                    <button
                                        onClick={() => setRoleToDelete(role)}
                                        className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                        title="Delete role"
                                    >
                                        <Trash2 size={15} color="#fa4b4b" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {!loading && filteredRoles.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                        No roles match your search.
                    </div>
                )}
            </div>

            {!loading && filteredRoles.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}-
                        {Math.min(page * PAGE_SIZE, filteredRoles.length)} of{" "}
                        {filteredRoles.length}
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

            {permissionsRole && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="role-permissions-title"
                >
                    <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <h2
                                    id="role-permissions-title"
                                    className="text-base font-bold"
                                >
                                    {permissionsRole.name} permissions
                                </h2>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {permissionsRole.permission_codes.length}{" "}
                                    permissions granted
                                </p>
                            </div>
                            <button
                                onClick={() => setPermissionsRole(null)}
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Close
                            </button>
                        </div>
                        <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                            {permissionsRole.permission_codes.length === 0 ? (
                                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                                    No permissions granted.
                                </p>
                            ) : (
                                permissionsRole.permission_codes.map((code) => {
                                    const permission = permissions.find(
                                        (item) => item.code === code,
                                    );
                                    return (
                                        <div
                                            key={code}
                                            className="flex items-start gap-3 px-5 py-3"
                                        >
                                            <Check
                                                size={16}
                                                className="mt-0.5 shrink-0 text-primary"
                                            />
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {permission?.description ||
                                                        code}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {code}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            <AlertDialog
                open={Boolean(roleToDelete)}
                onOpenChange={(open) =>
                    !open && !saving && setRoleToDelete(null)
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <span className="rounded-md bg-destructive/10 p-1.5 text-destructive">
                                <TriangleAlert size={18} />
                            </span>
                            Delete role?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {roleToDelete
                                ? `Delete the ${roleToDelete.name} role? This cannot be undone.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={removeRole}
                            disabled={saving}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {saving ? "Deleting..." : "Delete Role"}
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
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <h2 className="text-base font-bold">
                                {editor.id ? "Edit Role" : "New Role"}
                            </h2>
                            <button
                                onClick={() => setEditor(null)}
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </button>
                        </div>
                        <div className="grid gap-4 border-b border-border p-5 sm:grid-cols-2">
                            <label className="space-y-1.5 text-sm font-medium">
                                Role name
                                <input
                                    value={editor.name}
                                    onChange={(event) =>
                                        setEditor({
                                            ...editor,
                                            name: event.target.value,
                                        })
                                    }
                                    className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                                    placeholder="Content Manager"
                                />
                            </label>
                            <label className="space-y-1.5 text-sm font-medium">
                                Description
                                <input
                                    value={editor.description}
                                    onChange={(event) =>
                                        setEditor({
                                            ...editor,
                                            description: event.target.value,
                                        })
                                    }
                                    className="block h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                                    placeholder="Optional"
                                />
                            </label>
                        </div>
                        <div
                            className="flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/70"
                        >
                            <div className="space-y-4">
                                <p className="text-sm font-semibold">
                                    Module permissions
                                </p>
                                {Object.entries(groupedPermissions).map(
                                    ([module, modulePermissions]) => {
                                        const allSelected =
                                            modulePermissions.every(
                                                (permission) =>
                                                    editor.permissionCodes.includes(
                                                        permission.code,
                                                    ),
                                            );
                                        return (
                                            <section
                                                key={module}
                                                className="rounded-lg border border-border"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleModule(
                                                            modulePermissions,
                                                        )
                                                    }
                                                    className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left"
                                                >
                                                    <span className="font-semibold">
                                                        {module}
                                                    </span>
                                                    <span className="text-xs text-primary">
                                                        {allSelected
                                                            ? "Clear all"
                                                            : "Grant all"}
                                                    </span>
                                                </button>
                                                <div className="grid grid-cols-1 sm:grid-cols-2">
                                                    {modulePermissions.map(
                                                        (permission) => (
                                                            <label
                                                                key={
                                                                    permission.code
                                                                }
                                                                className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editor.permissionCodes.includes(
                                                                        permission.code,
                                                                    )}
                                                                    onChange={() =>
                                                                        togglePermission(
                                                                            permission.code,
                                                                        )
                                                                    }
                                                                    className="h-4 w-4 accent-primary"
                                                                />
                                                                <span className="flex-1">
                                                                    {
                                                                        permission.description
                                                                    }
                                                                </span>
                                                                {editor.permissionCodes.includes(
                                                                    permission.code,
                                                                ) && (
                                                                    <Check
                                                                        size={
                                                                            15
                                                                        }
                                                                        className="text-primary"
                                                                    />
                                                                )}
                                                            </label>
                                                        ),
                                                    )}
                                                </div>
                                            </section>
                                        );
                                    },
                                )}
                        </div>
                            </div>
                        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
                            <button
                                onClick={() => setEditor(null)}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={saving || !editor.name.trim()}
                                onClick={saveRole}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Role"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
