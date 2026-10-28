"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getPublicPage } from "@/lib/services";

export default function PublicPage() {
    const { slug } = useParams<{ slug: string }>();
    const { data: page, isLoading, isError } = useQuery({
        queryKey: ["public-page", slug],
        queryFn: () => getPublicPage(slug),
        enabled: Boolean(slug),
    });

    if (isLoading) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </main>
        );
    }

    if (isError || !page) {
        return (
            <main className="min-h-[60vh] flex items-center justify-center px-6 text-center">
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">Page not found</h1>
                    <p className="mt-2 text-sm text-muted-foreground">This page is unavailable or has not been published.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-[60vh] w-full bg-white px-6 py-16 lg:px-14 lg:py-20">
            <article className="rounded-lg  bg-white p-6 sm:p-10">
                <header className="border-b border-slate-200 pb-6">
                    <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{page.title}</h1>
                    {page.short_description && (
                        <p className="mt-3 text-base text-slate-600">{page.short_description}</p>
                    )}
                </header>
                {page.body && (
                    <div
                        className="prose prose-sm mt-8 max-w-none prose-headings:text-slate-950 prose-p:my-[0.25em] prose-p:text-slate-700 prose-a:text-blue-700 prose-strong:text-slate-950 prose-li:text-slate-700 prose-blockquote:border-slate-300 prose-blockquote:text-slate-600 sm:prose-base"
                        dangerouslySetInnerHTML={{ __html: page.body }}
                    />
                )}
            </article>
        </main>
    );
}