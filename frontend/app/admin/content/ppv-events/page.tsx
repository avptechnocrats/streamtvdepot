"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Radio, AlertTriangle, CheckCircle2 } from "lucide-react";
import { listPpvEvents, deletePpvEvent, type PpvEventOut } from "@/lib/api";
import { PpvEventCard } from "./_components/PpvEventCard";

export default function PpvEventsPage() {
    const [events, setEvents] = useState<PpvEventOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<PpvEventOut | null>(null);
    const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

    function toast(text: string, ok = true) {
        setToastMsg({ text, ok });
        setTimeout(() => setToastMsg(null), 3000);
    }

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setEvents(await listPpvEvents({ search: search || undefined }));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load PPV events");
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleDeleteConfirm = async () => {
        if (!confirmDelete) return;
        try {
            await deletePpvEvent(confirmDelete.id);
            setEvents((prev) => prev.filter((e) => e.id !== confirmDelete.id));
            toast(`"${confirmDelete.title}" deleted`);
        } catch {
            toast("Failed to delete PPV event", false);
        } finally {
            setConfirmDelete(null);
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-foreground">PPV Events</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage your pay-per-view live events</p>
                </div>
                <Link
                    href="/admin/content/ppv-events/new"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
                >
                    <Plus size={16} /> Add PPV Event
                </Link>
            </div>

            {/* Search */}
            <div className="flex items-center gap-4 flex-wrap pb-4">
                <div className="relative ml-auto">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="search"
                        placeholder="Search events…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 w-64 pl-8 pr-3 rounded-md bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    <AlertTriangle size={14} /> {error}
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
                            <div className="h-36 bg-muted" />
                            <div className="p-4 space-y-3">
                                <div className="h-4 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                                <div className="h-3 bg-muted rounded w-full" />
                            </div>
                        </div>
                    ))
                    : events.length === 0
                        ? (
                            <div className="col-span-full py-16 flex flex-col border border-border rounded-xl bg-background items-center gap-3 text-muted-foreground">
                                <div className="rounded-xl bg-secondary p-4">
                                    <Radio size={40} className="opacity-20" />
                                </div>
                                <p className="text-sm">No PPV events found</p>
                            </div>
                        )
                        : events.map((event) => (
                            <PpvEventCard
                                key={event.id}
                                event={event}
                                onDelete={() => setConfirmDelete(event)}
                                onUpdate={(updated) => setEvents((previous) => previous.map((item) => item.id === updated.id ? updated : item))}
                            />
                        ))}
            </div>

            {/* Delete confirm dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4 shadow-2xl">
                        <h2 className="text-base font-semibold text-foreground">Delete PPV Event</h2>
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">&ldquo;{confirmDelete.title}&rdquo;</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toastMsg && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${toastMsg.ok ? "bg-card border-border text-foreground" : "bg-red-500/10 border-red-500/20 text-red-300"}`}>
                    {toastMsg.ok
                        ? <CheckCircle2 size={15} className="text-primary" />
                        : <AlertTriangle size={15} />}
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
