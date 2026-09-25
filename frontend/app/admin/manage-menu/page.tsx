"use client";

import { MenuManager } from "../themes/_components/MenuManager";

export default function AdminManageMenuPage() {
    return (
        <div className="p-8 space-y-8">
            <div className="space-y-1">
                <h1 className="text-2xl font-display font-700 text-foreground">Manage Menu</h1>
                <p className="text-sm text-muted-foreground max-w-2xl">
                    Create header and footer menu groups, add menu items, and reorder links with drag and drop.
                </p>
            </div>

            <MenuManager />
        </div>
    );
}
