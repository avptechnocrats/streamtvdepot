"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    MessageSquare,
    Clock,
    CheckCircle2,
    AlertCircle,
    X,
    ChevronDown,
    ChevronUp,
    Send,
    Loader2,
    RefreshCw,
    Maximize2,
    Search,
    User,
    FileText,
    Paperclip,
    Image as ImageIcon,
} from "lucide-react";
import {
    listEndUserTickets,
    getEndUserTicket,
    updateEndUserTicketStatus,
    addEndUserTicketComment,
    type SupportTicketSummary,
    type SupportTicketOut,
    type TicketStatus,
    type TicketPriority,
} from "@/lib/api";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
    getPaginationItems,
} from "@/components/ui/pagination";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string; icon: React.ReactNode }> = {
    open: { label: "Open", className: "bg-blue-500/10 text-blue-500 border border-blue-500/20", icon: <AlertCircle size={11} /> },
    in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-500 border border-amber-500/20", icon: <Clock size={11} /> },
    resolved: { label: "Resolved", className: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20", icon: <CheckCircle2 size={11} /> },
    closed: { label: "Closed", className: "bg-muted text-muted-foreground border border-border", icon: <X size={11} /> },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-muted text-muted-foreground border border-border" },
    medium: { label: "Medium", className: "bg-amber-500/10 text-amber-600 border border-amber-500/20" },
    high: { label: "High", className: "bg-red-500/10 text-red-500 border border-red-500/20" },
};

function StatusBadge({ status }: { status: TicketStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.className}`}>
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
    const cfg = PRIORITY_CONFIG[priority];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.className}`}>
            {cfg.label}
        </span>
    );
}

// ─── Ticket detail panel ──────────────────────────────────────────────────────

function TicketDetail({
    ticketId,
    onClose,
    onUpdated,
}: {
    ticketId: string;
    onClose: () => void;
    onUpdated: () => void;
}) {
    const [ticket, setTicket] = useState<SupportTicketOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const t = await getEndUserTicket(ticketId);
            setTicket(t);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleComment(e: React.FormEvent) {
        e.preventDefault();
        if (!comment.trim()) return;
        setSubmitting(true);
        try {
            await addEndUserTicketComment(ticketId, comment);
            setComment("");
            await load();
        } finally {
            setSubmitting(false);
        }
    }

    async function handleStatusChange(newStatus: TicketStatus) {
        setStatusUpdating(true);
        try {
            await updateEndUserTicketStatus(ticketId, newStatus);
            await load();
            onUpdated();
        } finally {
            setStatusUpdating(false);
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

    if (!ticket) return null;

    return (
        <div className="bg-blue-500/10 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 shrink-0">
                    {/* Status changer */}
                    <select
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                        disabled={statusUpdating}
                        className="h-8 text-xs px-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>

            <div className="flex gap-4 px-5 py-3 shrink-0">
                {/* Description */}
                <div className="flex-1 px-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Description</p>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ticket.description}</p>
                </div>

                {/* Attachments */}
                {ticket.attachments && ticket.attachments.length > 0 && (
                    <div className="px-6">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                            Attachments ({ticket.attachments.length})
                        </p>
                        <div className="space-y-2">
                            {ticket.attachments.map((att, idx) => {
                                const isImage = att.file_type.startsWith("image/");
                                const isPDF = att.file_type === "application/pdf";
                                
                                return (
                                    <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => setImagePreview(att.file_url)}
                                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50 transition-colors w-full"
                                    >
                                        {isImage ? (
                                            <ImageIcon size={16} className="text-blue-500 shrink-0" />
                                        ) : isPDF ? (
                                            <FileText size={16} className="text-red-500 shrink-0" />
                                        ) : (
                                            <Paperclip size={16} className="text-muted-foreground shrink-0" />
                                        )}
                                        <span className="text-foreground font-medium">file#{idx + 1}</span>
                                        <Maximize2 size={12} className="ml-auto text-muted-foreground" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Comments */}
            <div className="px-6 py-4 space-y-3 border-b border-border">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Conversation ({ticket.comments.length})
                </p>
                {ticket.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No messages yet.</p>
                ) : (
                    <div className="space-y-3">
                        {ticket.comments.map((c) => (
                            <div
                                key={c.id}
                                className={`rounded-xl px-4 py-3 text-sm ${c.author_type === "end_user"
                                    ? "bg-muted/50 border border-border mr-8"
                                    : "bg-primary/5 border border-primary/20 ml-8"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {c.author_type === "end_user" ? "User" : "Support (You)"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(c.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-foreground/80 whitespace-pre-wrap">{c.message}</p>
                                
                                {/* Comment attachments */}
                                {c.attachments && c.attachments.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {c.attachments.map((att, idx) => {
                                            const isImage = att.file_type.startsWith("image/");
                                            const isPDF = att.file_type === "application/pdf";
                                            
                                            return (
                                                <button
                                                    key={att.id}
                                                    type="button"
                                                    onClick={() => setImagePreview(att.file_url)}
                                                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md border border-border hover:border-primary/40 bg-background/50 hover:bg-background transition-colors"
                                                >
                                                    {isImage ? (
                                                        <ImageIcon size={12} className="text-blue-500" />
                                                    ) : isPDF ? (
                                                        <FileText size={12} className="text-red-500" />
                                                    ) : (
                                                        <Paperclip size={12} className="text-muted-foreground" />
                                                    )}
                                                    <span>file#{idx + 1}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <form onSubmit={handleComment} className="flex gap-2 pt-1">
                    <input
                        type="text"
                        placeholder="Add a reply…"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="flex-1 h-9 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    <button
                        type="submit"
                        disabled={submitting || !comment.trim()}
                        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Reply
                    </button>
                </form>
            </div>

            {/* Attachment preview modal */}
            {imagePreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                    onClick={() => setImagePreview(null)}
                    role="presentation"
                >
                    <div className="relative max-w-6xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        {/* Close button */}
                        <button
                            onClick={() => setImagePreview(null)}
                            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors z-10"
                        >
                            <X size={20} />
                        </button>
                        
                        {/* Image or PDF preview */}
                        {imagePreview.endsWith('.pdf') || imagePreview.includes('application/pdf') ? (
                            <div className="flex flex-col items-center gap-4">
                                <FileText size={64} className="text-white" />
                                <p className="text-white text-lg">PDF Document</p>
                                <a
                                    href={imagePreview}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                                >
                                    Open PDF
                                </a>
                            </div>
                        ) : (
                            <img
                                src={imagePreview}
                                alt="Full size attachment"
                                className="max-h-full max-w-full object-contain rounded-lg"
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterStatus = "all" | TicketStatus;

const PAGE_SIZE = 10;

export default function AdminTicketsPage() {
    const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listEndUserTickets({
                page,
                page_size: PAGE_SIZE,
                q: debouncedSearch || undefined,
                status: statusFilter === "all" ? undefined : statusFilter,
            });
            setTickets(res.items);
            setTotal(res.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page, statusFilter]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, statusFilter]);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    const filters: { key: FilterStatus; label: string; icon: React.ElementType }[] = [
        { key: "all", label: "All", icon: MessageSquare },
        { key: "open", label: "Open", icon: AlertCircle },
        { key: "in_progress", label: "In Progress", icon: Clock },
        { key: "resolved", label: "Resolved", icon: CheckCircle2 },
        { key: "closed", label: "Closed", icon: X },
    ];

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageNumbers = getPaginationItems(page, totalPages);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Support Tickets</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage and respond to end-user support requests</p>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {filters.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => { setStatusFilter(key); setSelectedId(null); }}
                            className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === key
                                ? "bg-card text-foreground shadow-sm border border-border/50"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            <Icon size={14} />
                            {label}
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {key === "all" ? tickets.length : tickets.filter(t => t.status === key).length}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <div className="relative w-full max-w-md">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by subject or user name…"
                            className="w-full h-10 rounded-xl bg-secondary border border-border pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                        />
                    </div>
                    <button
                        onClick={fetchTickets}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-border bg-secondary hover:bg-muted/60 text-muted-foreground transition-colors"
                    >
                        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Ticket list */}
            {error ? (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                    {error}
                </div>
            ) : loading ? (
                <div className="bg-card border border-border rounded-xl divide-y divide-border animate-pulse">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="px-5 py-4 flex items-center gap-4">
                            <div className="h-4 w-4 bg-muted rounded" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-64" />
                                <div className="h-3 bg-muted rounded w-40" />
                            </div>
                            <div className="h-5 w-40 bg-muted rounded-full" />
                            <div className="h-5 w-28 bg-muted rounded-full" />
                            <div className="h-5 w-28 bg-muted rounded-full" />
                            <div className="h-5 w-10 bg-muted rounded-full" />
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {(() => {
                        const filtered = statusFilter === "all" ? tickets : tickets.filter(t => t.status === statusFilter);
                        return (
                            <div className="bg-card border border-border rounded-xl overflow-hidden">
                                {/* Header Row */}
                                <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/30">
                                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ticket</p>
                                    <p className="hidden md:block w-40 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">User</p>
                                    <p className="hidden sm:block w-28 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Priority</p>
                                    <p className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                                    <p className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></p>
                                </div>

                                {filtered.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                                        <MessageSquare size={32} className="opacity-30" />
                                        <p className="text-sm">No tickets found</p>
                                    </div>
                                ) : (
                                    <>
                                        {filtered.map((ticket) => (
                                            <div key={ticket.id}>
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setSelectedId(selectedId === ticket.id ? null : ticket.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            setSelectedId(selectedId === ticket.id ? null : ticket.id);
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left border-b border-border last:border-b-0 cursor-pointer"
                                                >
                                                    <MessageSquare size={15} className="text-muted-foreground shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                                                            {ticket.attachments && ticket.attachments.length > 0 && (
                                                                <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                                    <Paperclip size={10} />
                                                                    {ticket.attachments.length}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            #{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div className="hidden md:flex w-40 items-center shrink-0 min-w-0">
                                                        <Link
                                                            href={`/admin/users/${ticket.raised_by}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate min-w-0"
                                                        >
                                                            <User size={13} className="shrink-0 text-primary " />
                                                            <span className="truncate">{ticket.raised_by_name || "Unknown"}</span>
                                                        </Link>
                                                    </div>
                                                    <div className="flex w-28 items-center shrink-0">
                                                        <PriorityBadge priority={ticket.priority} />
                                                    </div>

                                                    <div className="flex w-28 items-center shrink-0">
                                                        <StatusBadge status={ticket.status} />
                                                    </div>
                                                    <div className="flex w-10 items-center shrink-0 justify-center">
                                                        {selectedId === ticket.id
                                                            ? <ChevronUp size={14} className="text-muted-foreground" />
                                                            : <ChevronDown size={14} className="text-muted-foreground" />
                                                        }
                                                    </div>
                                                </div>
                                                {selectedId === ticket.id && (
                                                    <TicketDetail
                                                        ticketId={ticket.id}
                                                        onClose={() => setSelectedId(null)}
                                                        onUpdated={fetchTickets}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        );
                    })()}
                </>
            )}

            {!loading && (
                <div className="flex items-center justify-between gap-3">
                    <p className="w-full text-xs text-muted-foreground">
                        Page {page} · {tickets.length} records shown
                    </p>

                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 1) setPage((p) => p - 1);
                                        }}
                                        aria-disabled={page === 1 || loading}
                                        className={page === 1 || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>

                                {pageNumbers.map((item, index) => (
                                    <PaginationItem key={`${item}-${index}`}>
                                        {item === "ellipsis" ? (
                                            <PaginationEllipsis />
                                        ) : (
                                            <PaginationLink
                                                href="#"
                                                isActive={item === page}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setPage(item);
                                                }}
                                            >
                                                {item}
                                            </PaginationLink>
                                        )}
                                    </PaginationItem>
                                ))}

                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page < totalPages) setPage((p) => p + 1);
                                        }}
                                        aria-disabled={page >= totalPages || loading}
                                        className={page >= totalPages || loading ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            )}
        </div>
    );
}
