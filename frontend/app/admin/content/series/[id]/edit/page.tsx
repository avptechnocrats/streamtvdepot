"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { getSeries, type SeriesOut } from "@/lib/api";
import { SeriesForm, seriesToFormValues } from "../../_components/SeriesForm";

interface EditSeriesPageProps {
    params: Promise<{ id: string }>;
}

export default function EditSeriesPage({ params }: EditSeriesPageProps) {
    const [series, setSeries] = useState<SeriesOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [seriesId, setSeriesId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setSeriesId(id);
            getSeries(id)
                .then(setSeries)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load series"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/series"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    Series
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {series ? series.title : "Edit Series"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit Series</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update series details, categories and access settings
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Loading series…
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {!loading && !error && series && (
                <SeriesForm
                    mode="edit"
                    seriesId={seriesId}
                    defaultValues={seriesToFormValues(series)}
                />
            )}
        </div>
    );
}
