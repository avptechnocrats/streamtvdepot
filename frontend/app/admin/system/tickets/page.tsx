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
    Search,
    Paperclip,
    ImageIcon,
    FileText,
    Maximize2,
} from "lucide-react";
import {
    listSuperAdminTickets,
    getSuperAdminTicket,
    updateSuperAdminTicketStatus,
    addSuperAdminTicketComment,
    type AdminSupportTicketSummary,
    type AdminSupportTicketOut,
    type TicketStatus,
    type TicketPriority,
} from "@/lib/api";

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
            {cfg.icon}{cfg.label}
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
    const [ticket, setTicket] = useState<AdminSupportTicketOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const t = await getSuperAdminTicket(ticketId);
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
            await addSuperAdminTicketComment(ticketId, comment);
            setComment("");
            await load();
        } finally {
            setSubmitting(false);
        }
    }

    async function handleStatusChange(newStatus: TicketStatus) {
        setStatusUpdating(true);
        try {
            await updateSuperAdminTicketStatus(ticketId, newStatus);
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
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 shrink-0">
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
                
                {/* Ticket attachments */}
                {ticket.attachments && ticket.attachments.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                            Attachments ({ticket.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {ticket.attachments.map((att, idx) => {
                                const isImage = att.file_type.startsWith("image/");
                                const isPDF = att.file_type === "application/pdf";
                                
                                return (
                                    <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => setImagePreview(att.file_url)}
                                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50 transition-colors"
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
            <div className="px-6 py-4 space-y-3">
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
                                className={`rounded-xl px-4 py-3 text-sm ${c.author_type === "client_admin"
                                    ? "bg-muted/50 border border-border mr-8"
                                    : "bg-primary/5 border border-primary/20 ml-8"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {c.author_type === "client_admin" ? "Client Admin" : "Super Admin (You)"}
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

export default function SuperAdminTicketsPage() {
    const [tickets, setTickets] = useState<AdminSupportTicketSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listSuperAdminTickets();
            setTickets(res.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    const filters: { key: FilterStatus; label: string; icon: React.ElementType }[] = [
        { key: "all", label: "All", icon: MessageSquare },
        { key: "open", label: "Open", icon: AlertCircle },
        { key: "in_progress", label: "In Progress", icon: Clock },
        { key: "resolved", label: "Resolved", icon: CheckCircle2 },
        { key: "closed", label: "Closed", icon: X },
    ];

    // Filter tickets by status and search query
    const getFilteredTickets = useCallback(() => {
        let filtered = statusFilter === "all" ? tickets : tickets.filter(t => t.status === statusFilter);
        
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.title.toLowerCase().includes(query) ||
                t.id.toLowerCase().includes(query) ||
                t.client_id.toLowerCase().includes(query) ||
                t.client_name.toLowerCase().includes(query)
            );
        }
        
        return filtered;
    }, [tickets, statusFilter, searchQuery]);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Client Support Tickets</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage support requests from client admins</p>
                </div>
                <button
                    onClick={fetchTickets}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                    <RefreshCw size={13} />
                    Refresh
                </button>
            </div>

            {/* Search and Tabs */}
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
                
                {/* Search */}
                <div className="relative w-full max-w-md">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by ticket ID, title, client name…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-10 pr-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
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
                        const filtered = getFilteredTickets();
                        return (
                            <div className="bg-card border border-border rounded-xl overflow-hidden">
                                {/* Header Row */}
                                <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-muted/30">
                                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ticket</p>
                                    <p className="hidden md:block w-32 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Client</p>
                                    <p className="hidden sm:block w-28 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Priority</p>
                                    <p className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                                    <p className="w-10 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"></p>
                                </div>

                                {filtered.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                                        <MessageSquare size={32} className="opacity-30" />
                                        <p className="text-sm">
                                            {searchQuery.trim() ? "No tickets match your search" : "No tickets found"}
                                        </p>
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
                                                        <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            #{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div className="hidden md:block w-32 shrink-0">
                                                        <Link
                                                            href={`/admin/system/clients/${ticket.client_id}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-sm text-primary hover:underline truncate block"
                                                        >
                                                            {ticket.client_name}
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
        </div>
    );
}
