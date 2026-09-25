"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { MenuPosition, MenuGroupPayload, MenuLinkPayload, MenuGroup, MenuItemType } from "@/lib/api/services/menus";

const PREDEFINED_MENU_LINKS = [
    { label: "Home", url: "/" },
    { label: "Movies", url: "/movies" },
    { label: "Series", url: "/series" },
    { label: "TV-Shows", url: "/tv-shows" },
    { label: "PPV Events", url: "/ppv-events" },
    { label: "Pricing", url: "/pricing" },
] as const;

const CUSTOM_LINK_OPTION = "__custom__";

const ICON_OPTIONS = [
    "House",
    "Film",
    "Clapperboard",
    "Tv",
    "DollarSign",
    "CircleHelp",
    "Phone",
    "Mail",
    "Instagram",
    "Facebook",
    "Youtube",
] as const;

interface MenuFormProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: MenuGroupPayload | MenuLinkPayload) => Promise<void>;
    formType: "group" | "link";
    position?: MenuPosition;
    selectedGroup?: MenuGroup | null;
    initialData?: any;
}

export function MenuForm({ open, onClose, onSubmit, formType, position = "header", selectedGroup, initialData }: MenuFormProps) {
    // Group form fields
    const [groupName, setGroupName] = useState("");
    const [footerColumns, setFooterColumns] = useState("4");

    // Link form fields
    const [label, setLabel] = useState("");
    const [customUrl, setCustomUrl] = useState("");
    const [selectedLink, setSelectedLink] = useState<string>(CUSTOM_LINK_OPTION);
    const [description, setDescription] = useState("");
    const [target, setTarget] = useState<"_self" | "_blank">("_self");
    const [itemType, setItemType] = useState<MenuItemType>("name");
    const [iconName, setIconName] = useState<string>(ICON_OPTIONS[0]);
    const [columnIndex, setColumnIndex] = useState("1");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (formType === "group") {
            if (initialData) {
                setGroupName(initialData.name);
                setFooterColumns(String(initialData.footerColumns ?? (position === "footer" ? 4 : 1)));
            } else {
                setGroupName("");
                setFooterColumns(position === "footer" ? "4" : "1");
            }
        } else {
            if (initialData) {
                setLabel(initialData.label || "");
                const matched = PREDEFINED_MENU_LINKS.find((item) => item.url === initialData.url);
                if (matched) {
                    setSelectedLink(matched.url);
                    setCustomUrl("");
                } else {
                    setSelectedLink(CUSTOM_LINK_OPTION);
                    setCustomUrl(initialData.url);
                }
                setDescription(initialData.description || "");
                setTarget(initialData.target || "_self");
                setItemType(initialData.itemType || "name");
                setIconName(initialData.icon || ICON_OPTIONS[0]);
                setColumnIndex(String(initialData.columnIndex || 1));
            } else {
                setLabel("");
                setCustomUrl("");
                setSelectedLink(CUSTOM_LINK_OPTION);
                setDescription("");
                setTarget("_self");
                setItemType("name");
                setIconName(ICON_OPTIONS[0]);
                setColumnIndex("1");
            }
        }
        setError(null);
    }, [initialData, open, formType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            setLoading(true);

            if (formType === "group") {
                if (!groupName.trim()) {
                    setError("Menu group name is required");
                    return;
                }
                await onSubmit({
                    name: groupName.trim(),
                    position,
                    footerColumns: position === "footer" ? Number(footerColumns) : 1,
                } as MenuGroupPayload);
            } else {
                if (itemType === "name" && !label.trim()) {
                    setError("Menu name is required for name items");
                    return;
                }
                const resolvedUrl = selectedLink === CUSTOM_LINK_OPTION ? customUrl.trim() : selectedLink;

                if (!resolvedUrl) {
                    setError("Menu link is required");
                    return;
                }

                await onSubmit({
                    label: itemType === "name" ? label.trim() : undefined,
                    url: resolvedUrl,
                    description: description.trim() || undefined,
                    target,
                    itemType,
                    icon: itemType === "icon" ? iconName : undefined,
                    columnIndex: Number(columnIndex),
                } as MenuLinkPayload);
            }

            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setGroupName("");
        setFooterColumns(position === "footer" ? "4" : "1");
        setLabel("");
        setCustomUrl("");
        setSelectedLink(CUSTOM_LINK_OPTION);
        setDescription("");
        setTarget("_self");
        setItemType("name");
        setIconName(ICON_OPTIONS[0]);
        setColumnIndex("1");
        setError(null);
        onClose();
    };

    const maxColumns = selectedGroup?.position === "footer"
        ? Math.max(1, selectedGroup.footerColumns || 1)
        : 1;

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {formType === "group"
                            ? `Add ${position.charAt(0).toUpperCase() + position.slice(1)} Menu Group`
                            : "Add Link to Menu"}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="col-span-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {formType === "group" ? (
                            <>
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="group-name">Menu Group Name *</Label>
                                    <Input
                                        id="group-name"
                                        placeholder="e.g., Main Navigation, Footer Links"
                                        value={groupName}
                                        onChange={(e) => setGroupName(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>

                                {position === "footer" && (
                                    <div className="col-span-2 space-y-2">
                                        <Label htmlFor="footer-columns">Footer Columns *</Label>
                                        <Select value={footerColumns} onValueChange={setFooterColumns} disabled={loading}>
                                            <SelectTrigger id="footer-columns">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[1, 2, 3, 4, 5, 6].map((count) => (
                                                    <SelectItem key={count} value={String(count)}>
                                                        {count} {count === 1 ? "column" : "columns"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="item-type">Menu Item Type *</Label>
                                    <Select value={itemType} onValueChange={(value) => setItemType(value as MenuItemType)} disabled={loading}>
                                        <SelectTrigger id="item-type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="name">Name</SelectItem>
                                            <SelectItem value="icon">Icon</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    {itemType === "name" ? (
                                        <>
                                            <Label htmlFor="link-label">Menu Name *</Label>
                                            <Input
                                                id="link-label"
                                                placeholder="e.g., Home, Movies"
                                                value={label}
                                                onChange={(e) => setLabel(e.target.value)}
                                                disabled={loading}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Label htmlFor="icon-name">Icon *</Label>
                                            <Select value={iconName} onValueChange={setIconName} disabled={loading}>
                                                <SelectTrigger id="icon-name">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ICON_OPTIONS.map((icon) => (
                                                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </>
                                    )}
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="link-select">Menu Link *</Label>
                                    <Select
                                        value={selectedLink}
                                        onValueChange={(value) => setSelectedLink(value)}
                                        disabled={loading}
                                    >
                                        <SelectTrigger id="link-select">
                                            <SelectValue placeholder="Select menu link" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PREDEFINED_MENU_LINKS.map((item) => (
                                                <SelectItem key={item.url} value={item.url}>
                                                    {item.label} ({item.url})
                                                </SelectItem>
                                            ))}
                                            <SelectItem value={CUSTOM_LINK_OPTION}>Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedLink === CUSTOM_LINK_OPTION && (
                                    <div className="col-span-2 space-y-2">
                                        <Label htmlFor="link-url">Custom URL *</Label>
                                        <Input
                                            id="link-url"
                                            placeholder="e.g., /about or https://example.com"
                                            value={customUrl}
                                            onChange={(e) => setCustomUrl(e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                )}

                                {selectedLink !== CUSTOM_LINK_OPTION && (
                                    <p className="col-span-2 text-xs text-muted-foreground">
                                        Selected route: {selectedLink}
                                    </p>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="column-index">Footer Column</Label>
                                    <Select value={columnIndex} onValueChange={setColumnIndex} disabled={loading || maxColumns === 1}>
                                        <SelectTrigger id="column-index">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Array.from({ length: maxColumns }, (_, i) => i + 1).map((idx) => (
                                                <SelectItem key={idx} value={String(idx)}>
                                                    Column {idx}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="link-target">Open Link In</Label>
                                    <Select
                                        value={target}
                                        onValueChange={(val) => setTarget(val as "_self" | "_blank")}
                                        disabled={loading}
                                    >
                                        <SelectTrigger id="link-target">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="_self">Same Tab</SelectItem>
                                            <SelectItem value="_blank">New Tab</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {selectedGroup?.position !== "footer" && (
                                    <p className="col-span-2 text-xs text-muted-foreground">Header items always use column 1.</p>
                                )}

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="link-description">Description</Label>
                                    <Textarea
                                        id="link-description"
                                        placeholder="Optional description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        disabled={loading}
                                        rows={2}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Add"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
