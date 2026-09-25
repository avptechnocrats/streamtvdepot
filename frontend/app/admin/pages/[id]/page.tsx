"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getPage, type PageOut } from "@/lib/api";
import { PageForm } from "../_components/PageForm";

export default function EditPagePage() {
    const { id } = useParams<{ id: string }>();
    const [page, setPage] = useState<PageOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        getPage(id)
            .then(setPage)
            .catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Failed to load page"),
            )
            .finally(() => setLoading(false));
    }, [id]);

    return (
        <div className="p-6 space-y-6">
            <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Link href="/admin/pages" className="hover:text-foreground transition-colors">
                        Pages
                    </Link>
                    <span>/</span>
                    <span className="text-foreground font-medium">
                        {loading ? "Loading…" : (page?.title ?? "Edit Page")}
                    </span>
                </div>
                <h1 className="text-xl font-bold text-foreground">
                    {loading ? "Loading…" : (page?.title ?? "Edit Page")}
                </h1>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {page && <PageForm mode="edit" initialData={page} />}
        </div>
    );
}
