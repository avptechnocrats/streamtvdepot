"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Plus,
    Trash2,
    AlertTriangle,
    Radio,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    Link2,
    GripVertical,
} from "lucide-react";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
    getMenusByPosition,
    createMenuGroup,
    deleteMenuGroup,
    setActiveMenuGroup,
    addMenuLink,
    deleteMenuLink,
    reorderMenuLinks,
    updateMenuGroup,
    type MenuGroup,
    type MenuGroupPayload,
    type MenuLink,
    type MenuLinkPayload,
    type MenuPosition,
} from "@/lib/api/services/menus";
import { MenuForm } from "./MenuForm";

const ICON_LABELS: Record<string, string> = {
    House: "House",
    Film: "Film",
    Clapperboard: "Clapperboard",
    Tv: "TV",
    DollarSign: "DollarSign",
    CircleHelp: "CircleHelp",
    Phone: "Phone",
    Mail: "Mail",
    Instagram: "Instagram",
    Facebook: "Facebook",
    Youtube: "Youtube",
};

function SortableMenuLinkItem({
    link,
    group,
    onDelete,
}: {
    link: MenuLink;
    group: MenuGroup;
    onDelete: (groupId: string, link: MenuLink) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: link.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 px-4 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group/link border border-border/50 ml-8"
        >
            <button
                type="button"
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                title="Drag to reorder"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-3.5 w-3.5" />
            </button>

            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    {link.itemType === "icon" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-foreground">
                            <span className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                                icon:{ICON_LABELS[link.icon || ""] || link.icon || "CircleHelp"}
                            </span>
                        </span>
                    ) : (
                        <span className="text-sm text-foreground">{link.label || "Untitled"}</span>
                    )}
                    {link.target === "_blank" && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />}
                    {group.position === "footer" && (
                        <span className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                            Col {link.columnIndex || 1}
                        </span>
                    )}
                </div>
                <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono text-muted-foreground mt-0.5 inline-block">
                    {link.url}
                </code>
                {link.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{link.description}</p>
                )}
            </div>

            <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(group.id, link)}
                className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-400"
                title="Delete"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

export function MenuManager() {
    const [headerGroups, setHeaderGroups] = useState<MenuGroup[]>([]);
    const [footerGroups, setFooterGroups] = useState<MenuGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const [formOpen, setFormOpen] = useState(false);
    const [formType, setFormType] = useState<"group" | "link">("group");
    const [selectedPosition, setSelectedPosition] = useState<MenuPosition>("header");
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<MenuGroup | null>(null);

    const [deleteConfirm, setDeleteConfirm] = useState<{ type: "group" | "link"; data: any } | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3500);
    }

    const loadMenus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [headers, footers] = await Promise.all([
                getMenusByPosition("header"),
                getMenusByPosition("footer"),
            ]);
            setHeaderGroups(headers);
            setFooterGroups(footers);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load menus");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMenus();
    }, [loadMenus]);

    const toggleGroupExpanded = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) {
            newExpanded.delete(groupId);
        } else {
            newExpanded.add(groupId);
        }
        setExpandedGroups(newExpanded);
    };

    const handleAddGroup = (position: MenuPosition) => {
        setFormType("group");
        setSelectedPosition(position);
        setFormOpen(true);
    };

    const handleAddLink = (groupId: string) => {
        setFormType("link");
        setSelectedGroupId(groupId);
        const allGroups = [...headerGroups, ...footerGroups];
        setSelectedGroup(allGroups.find((g) => g.id === groupId) || null);
        setFormOpen(true);
    };

    const handleFormSubmit = async (payload: MenuGroupPayload | MenuLinkPayload) => {
        if (formType === "group") {
            await createMenuGroup(payload as MenuGroupPayload);
            toast("Menu group created successfully");
        } else {
            if (!selectedGroupId) throw new Error("Group not selected");
            await addMenuLink(selectedGroupId, payload as MenuLinkPayload);
            toast("Menu item added successfully");
        }
        await loadMenus();
    };

    const handleDeleteClick = (type: "group" | "link", data: any) => {
        setDeleteConfirm({ type, data });
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirm) return;
        setDeleteBusy(true);
        try {
            if (deleteConfirm.type === "group") {
                await deleteMenuGroup(deleteConfirm.data.id);
                toast("Menu group deleted successfully");
            } else {
                await deleteMenuLink(deleteConfirm.data.groupId, deleteConfirm.data.id);
                toast("Menu item deleted successfully");
            }
            await loadMenus();
            setDeleteConfirm(null);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to delete", false);
        } finally {
            setDeleteBusy(false);
        }
    };

    const handleSetActiveGroup = async (group: MenuGroup) => {
        try {
            await setActiveMenuGroup(group.id, group.position);
            toast(`\"${group.name}\" is now active`);
            await loadMenus();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to set active group", false);
        }
    };

    const handleFooterColumnsChange = async (group: MenuGroup, value: string) => {
        const nextColumns = Number(value);
        if (!Number.isFinite(nextColumns) || nextColumns < 1) return;

        const currentGroups = group.position === "header" ? headerGroups : footerGroups;
        const optimisticGroups = currentGroups.map((item) =>
            item.id === group.id ? { ...item, footerColumns: nextColumns } : item,
        );
        setGroupsByPosition(group.position, optimisticGroups);

        try {
            await updateMenuGroup(group.id, { footerColumns: nextColumns });
            toast("Footer columns updated");
            await loadMenus();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to update footer columns", false);
            await loadMenus();
        }
    };

    const setGroupsByPosition = (position: MenuPosition, groups: MenuGroup[]) => {
        if (position === "header") {
            setHeaderGroups(groups);
        } else {
            setFooterGroups(groups);
        }
    };

    const handleDragEnd = async (group: MenuGroup, event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const sortedLinks = [...group.links].sort((a, b) => a.sortOrder - b.sortOrder);
        const oldIndex = sortedLinks.findIndex((item) => item.id === active.id);
        const newIndex = sortedLinks.findIndex((item) => item.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(sortedLinks, oldIndex, newIndex).map((item, index) => ({
            ...item,
            sortOrder: index + 1,
        }));

        const currentGroups = group.position === "header" ? headerGroups : footerGroups;
        const optimisticGroups = currentGroups.map((item) =>
            item.id === group.id ? { ...item, links: reordered } : item,
        );
        setGroupsByPosition(group.position, optimisticGroups);

        try {
            await reorderMenuLinks(
                group.id,
                reordered.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
            );
            toast("Menu items reordered");
            await loadMenus();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Failed to reorder menu items", false);
            await loadMenus();
        }
    };

    const MenuGroupItem = ({ group }: { group: MenuGroup }) => {
        const isExpanded = expandedGroups.has(group.id);

        return (
            <div className="space-y-2 rounded-lg border border-border bg-card p-4 hover:bg-secondary/5 transition-colors">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => handleSetActiveGroup(group)}
                        title={group.isActive ? "Active group" : "Set as active group"}
                        className={`shrink-0 flex items-center justify-center h-5 w-5 rounded-full border-2 transition-colors ${group.isActive
                            ? "border-primary bg-primary"
                            : "border-border hover:border-primary/60"
                            }`}
                    >
                        {group.isActive && <Radio className="h-2.5 w-2.5 text-background fill-background" />}
                    </button>

                    <button
                        onClick={() => toggleGroupExpanded(group.id)}
                        className="flex items-center justify-center h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{group.name}</span>
                            {group.isActive && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                                    Active
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {group.links.length} {group.links.length === 1 ? "menu item" : "menu items"}
                        </p>
                        {group.position === "footer" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {group.footerColumns} {group.footerColumns === 1 ? "column" : "columns"}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {group.position === "footer" && (
                            <>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">Columns:</span>
                                    <select
                                        value={String(group.footerColumns || 1)}
                                        onChange={(e) => handleFooterColumnsChange(group, e.target.value)}
                                        className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                                        title="Footer columns"
                                    >
                                        {[1, 2, 3, 4, 5, 6].map((count) => (
                                            <option key={count} value={count}>{count}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-px h-5 bg-border" />
                            </>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddLink(group.id)}
                            className="h-7 w-7 p-0"
                            title="Add menu item"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteClick("group", group)}
                            className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-400"
                            title="Delete group"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {isExpanded && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-border">
                        {group.links.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-xs text-muted-foreground mb-2">No menu items added yet</p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAddLink(group.id)}
                                    className="gap-1 h-7"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add Menu Item
                                </Button>
                            </div>
                        ) : (
                            <>
                                <p className="text-[11px] text-muted-foreground ml-8">Drag items using the handle to reorder</p>
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={(event) => handleDragEnd(group, event)}
                                >
                                    <SortableContext
                                        items={group.links
                                            .sort((a, b) => a.sortOrder - b.sortOrder)
                                            .map((link) => link.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2">
                                            {group.links
                                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                                .map((link) => (
                                                    <SortableMenuLinkItem
                                                        key={link.id}
                                                        link={link}
                                                        group={group}
                                                        onDelete={(groupId, item) =>
                                                            handleDeleteClick("link", { ...item, groupId })
                                                        }
                                                    />
                                                ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const MenuSection = ({ title, groups, position }: { title: string; groups: MenuGroup[]; position: MenuPosition }) => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-widest">{title} Menu Groups</h3>
                <Button
                    size="sm"
                    onClick={() => handleAddGroup(position)}
                    variant="outline"
                    className="gap-1"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Group
                </Button>
            </div>

            {groups.length === 0 ? (
                <div className="rounded-xl border border-border bg-secondary/20 px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                        No {title.toLowerCase()} menu groups yet. Create one to get started.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {groups.map((group) => (
                        <MenuGroupItem key={group.id} group={group} />
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex items-start gap-3 px-4 py-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-muted-foreground">
                <span className="text-blue-500 mt-0.5 shrink-0">i</span>
                <span>
                    Create menu groups and add multiple menu items within each group. Only one menu group per position
                    (header/footer) can be active at a time.
                </span>
            </div>

            {error && (
                <div className="flex items-start gap-3 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs">
                    <span className="text-red-500 mt-0.5 shrink-0">x</span>
                    <span className="text-red-400">{error}</span>
                </div>
            )}

            {loading ? (
                <div className="space-y-6">
                    {["Header", "Footer"].map((section) => (
                        <div key={section} className="space-y-3">
                            <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
                            <div className="space-y-3">
                                {[1, 2].map((i) => (
                                    <div key={i} className="h-20 bg-secondary rounded-lg animate-pulse" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <MenuSection title="Header" groups={headerGroups} position="header" />
                    <MenuSection title="Footer" groups={footerGroups} position="footer" />
                </>
            )}

            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-red-500/10 p-2 shrink-0">
                                <AlertTriangle className="h-5 w-5 text-red-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">Delete {deleteConfirm.type}?</p>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    {deleteConfirm.type === "group"
                                        ? `Menu group \"${deleteConfirm.data.name}\" and all its links will be permanently deleted.`
                                        : `Menu item \"${deleteConfirm.data.label}\" will be permanently deleted.`}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={deleteBusy}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleDeleteConfirm}
                                disabled={deleteBusy}
                            >
                                {deleteBusy ? "Deleting..." : "Delete"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {toastMsg && (
                <div className="fixed bottom-4 right-4 z-40 flex items-start gap-3 px-4 py-3 rounded-lg bg-card border border-border shadow-lg animate-in">
                    <span className={toastMsg.ok ? "text-emerald-500" : "text-red-500"}>
                        {toastMsg.ok ? "OK" : "ERR"}
                    </span>
                    <p className="text-sm text-muted-foreground">{toastMsg.text}</p>
                </div>
            )}

            <MenuForm
                open={formOpen}
                onClose={() => {
                    setFormOpen(false);
                    setSelectedGroupId(null);
                    setSelectedGroup(null);
                }}
                onSubmit={handleFormSubmit}
                formType={formType}
                position={selectedPosition}
                selectedGroup={selectedGroup}
            />
        </div>
    );
}
