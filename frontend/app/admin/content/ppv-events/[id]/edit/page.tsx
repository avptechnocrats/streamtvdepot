"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { getPpvEvent, type PpvEventOut } from "@/lib/api";
import { PpvEventForm, ppvEventToFormValues } from "../../_components/PpvEventForm";

interface EditPpvEventPageProps {
    params: Promise<{ id: string }>;
}

export default function EditPpvEventPage({ params }: EditPpvEventPageProps) {
    const [event, setEvent] = useState<PpvEventOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [eventId, setEventId] = useState<string>("");

    useEffect(() => {
        params.then(({ id }) => {
            setEventId(id);
            getPpvEvent(id)
                .then(setEvent)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Failed to load PPV event"),
                )
                .finally(() => setLoading(false));
        });
    }, [params]);

    return (
        <div className="p-6 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <Link
                    href="/admin/content/ppv-events"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft size={15} />
                    PPV Events
                </Link>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-foreground font-medium">
                    {event ? event.title : "Edit PPV Event"}
                </span>
            </div>

            <div>
                <h1 className="text-xl font-bold text-foreground">Edit PPV Event</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Update event details, stream source and thumbnails
                </p>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Loading event…
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {!loading && !error && event && (
                <PpvEventForm
                    mode="edit"
                    eventId={eventId}
                    defaultValues={ppvEventToFormValues(event)}
                />
            )}
        </div>
    );
}
