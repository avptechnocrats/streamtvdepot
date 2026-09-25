"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Eye,
    Archive,
    Loader2,
    RefreshCw,
    Mail,
    Send,
    ChevronDown,
    ChevronUp,
    Inbox,
} from "lucide-react";
import {
    listDemoBookings,
    getDemoBooking,
    archiveDemoBooking,
    replyDemoBooking,
    type DemoBookingSummary,
    type DemoBookingDetail,
    type DemoBookingStatus,
    type DemoBookingTab,
    type DemoBookingListCounts,
} from "@/lib/api";

const STATUS_STYLE: Record<DemoBookingStatus, string> = {
    unread: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    read: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
    archived: "bg-muted text-muted-foreground border border-border",
};

function StatusBadge({ status }: { status: DemoBookingStatus }) {
    const label = status === "unread" ? "Unread" : status === "read" ? "Read" : "Archived";
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[status]}`}>
            {label}
        </span>
    );
}

function TabButton({
    active,
    label,
    count,
    onClick,
    icon: Icon,
}: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
    icon: React.ElementType;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${active
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
                }`}
        >
            <Icon size={14} />
            {label}
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {count}
            </span>
        </button>
    );
}

function BookingDetail({
    bookingId,
    onClose,
    onUpdated,
}: {
    bookingId: string;
    onClose: () => void;
    onUpdated: () => void;
}) {
    const [booking, setBooking] = useState<DemoBookingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [reply, setReply] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getDemoBooking(bookingId);
            setBooking(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load booking details");
        } finally {
            setLoading(false);
        }
    }, [bookingId]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleArchive() {
        if (!booking || booking.status === "archived") return;
        setArchiving(true);
        setError(null);
        try {
            await archiveDemoBooking(booking.id);
            await load();
            onUpdated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to archive request");
        } finally {
            setArchiving(false);
        }
    }

    async function handleReply(e: React.FormEvent) {
        e.preventDefault();
        if (!booking || !reply.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            await replyDemoBooking(booking.id, reply.trim());
            setReply("");
            await load();
            onUpdated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send reply");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="bg-card border border-border rounded-xl p-6 animate-pulse space-y-4">
                <div className="h-5 bg-muted rounded w-64" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-4 py-3 text-sm">
                {error}
            </div>
        );
    }

    if (!booking) return null;

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{booking.full_name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        {booking.work_email} · {booking.company}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <StatusBadge status={booking.status} />
                        <span className="text-xs text-muted-foreground">
                            #{booking.id.slice(0, 8)} · {new Date(booking.created_at).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {booking.status !== "archived" && (
                        <button
                            onClick={handleArchive}
                            disabled={archiving}
                            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                            Archive
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>

            <div className="px-6 py-4 border-b border-border grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Role</p>
                    <p className="text-foreground/85">{booking.role || "-"}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Country / Region</p>
                    <p className="text-foreground/85">{booking.country_region}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-foreground/85">{booking.phone}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Acknowledge Mail</p>
                    <p className="text-foreground/85">
                        {booking.acknowledged_email_sent_at
                            ? `Sent at ${new Date(booking.acknowledged_email_sent_at).toLocaleString()}`
                            : "Not sent"
                        }
                    </p>
                </div>
            </div>

            <div className="px-6 py-4 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Project Requirements</p>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{booking.project_details}</p>
            </div>

            <div className="px-6 py-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                    <Mail size={12} /> Replies ({booking.replies.length})
                </div>

                {booking.replies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No replies sent yet.</p>
                ) : (
                    <div className="space-y-3">
                        {booking.replies.map((item) => (
                            <div key={item.id} className="rounded-xl px-4 py-3 bg-primary/5 border border-primary/20">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">Super Admin</span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(item.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{item.message}</p>
                            </div>
                        ))}
                    </div>
                )}

                {booking.status !== "archived" ? (
                    <form onSubmit={handleReply} className="flex gap-2 pt-1">
                        <input
                            type="text"
                            placeholder="Write a reply email..."
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            className="flex-1 h-9 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                        <button
                            type="submit"
                            disabled={submitting || !reply.trim()}
                            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Reply
                        </button>
                    </form>
                ) : (
                    <p className="text-xs text-muted-foreground">Reply is disabled for archived requests.</p>
                )}
            </div>
        </div>
    );
}

export default function SuperAdminDemoBookingsPage() {
    const [items, setItems] = useState<DemoBookingSummary[]>([]);
    const [counts, setCounts] = useState<DemoBookingListCounts>({ all: 0, unread: 0, read: 0, archived: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<DemoBookingTab>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [archivingId, setArchivingId] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listDemoBookings({ tab });
            setItems(res.items);
            setCounts(res.counts);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load demo bookings");
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    async function handleArchive(id: string) {
        setArchivingId(id);
        setError(null);
        try {
            await archiveDemoBooking(id);
            if (selectedId === id) {
                setSelectedId(null);
            }
            await fetchItems();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to archive request");
        } finally {
            setArchivingId(null);
        }
    }

    const tabs: { key: DemoBookingTab; label: string; count: number; icon: React.ElementType }[] = [
        { key: "all", label: "All", count: counts.all, icon: Inbox },
        { key: "unread", label: "Unread", count: counts.unread, icon: Mail },
        { key: "read", label: "Read", count: counts.read, icon: Eye },
        { key: "archived", label: "Archived", count: counts.archived, icon: Archive },
    ];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Demo Bookings</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Track incoming demo requests and respond directly by email
                    </p>
                </div>
                <button
                    onClick={fetchItems}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                    <RefreshCw size={13} />
                    Refresh
                </button>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                {tabs.map((t) => (
                    <TabButton
                        key={t.key}
                        active={tab === t.key}
                        label={t.label}
                        count={t.count}
                        icon={t.icon}
                        onClick={() => {
                            setTab(t.key);
                            setSelectedId(null);
                        }}
                    />
                ))}
            </div>

            {selectedId && (
                <BookingDetail
                    bookingId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onUpdated={fetchItems}
                />
            )}

            {error ? (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                    {error}
                </div>
            ) : loading ? (
                <div className="bg-card border border-border rounded-xl divide-y divide-border animate-pulse">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="px-5 py-4 flex items-center gap-4">
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-64" />
                                <div className="h-3 bg-muted rounded w-40" />
                            </div>
                            <div className="h-5 w-16 bg-muted rounded-full" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {/* Header Row */}
                    <div className="flex items-center gap-4 px-5 py-3 border-b-0 border-border bg-muted/30">
                        <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Contact</p>
                        <p className="hidden sm:block w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Date</p>
                        <p className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                        <p className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></p>
                    </div>

                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                            <Mail size={32} className="opacity-30" />
                            <p className="text-sm">No demo bookings found</p>
                        </div>
                    ) : (
                        <>
                            {items.map((item) => (
                        <div key={item.id} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{item.full_name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {item.work_email} · {item.company} · {new Date(item.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <StatusBadge status={item.status} />
                                <button
                                    onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                                    className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors inline-flex items-center gap-1"
                                >
                                    <Eye size={13} />
                                    View
                                    {selectedId === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                <button
                                    onClick={() => handleArchive(item.id)}
                                    disabled={item.status === "archived" || archivingId === item.id}
                                    className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    {archivingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                                    Archive
                                </button>
                            </div>
                        </div>
                        ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
