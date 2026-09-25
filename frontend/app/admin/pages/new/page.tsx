"use client";

import Link from "next/link";
import { PageForm } from "../_components/PageForm";

export default function NewPagePage() {
    return (
        <div className="p-6 space-y-6">
            <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Link href="/admin/pages" className="hover:text-foreground transition-colors">
                        Pages
                    </Link>
                    <span>/</span>
                    <span className="text-foreground font-medium">New Page</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">New Page</h1>
            </div>
            <PageForm mode="create" />
        </div>
    );
}
