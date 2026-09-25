"use client";

import { useCallback, useEffect, useState } from "react";
import {
    LifeBuoy,
    Plus,
    X,
    MessageSquare,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronUp,
    Send,
    RefreshCw,
    Paperclip,
    ImageIcon,
    FileText,
    Maximize2,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    listAdminSupportTickets,
    createAdminSupportTicket,
    getAdminSupportTicket,
    addAdminTicketComment,
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

// ─── New ticket form ──────────────────────────────────────────────────────────

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;

function NewTicketForm({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<TicketPriority>("medium");
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFiles = Array.from(e.target.files || []);
        const newFiles = [...files, ...selectedFiles];

        if (newFiles.length > MAX_ATTACHMENTS) {
            setError(`Cannot attach more than ${MAX_ATTACHMENTS} files`);
            return;
        }

        for (const file of selectedFiles) {
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                setError(`File type ${file.type} not allowed`);
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                setError(`File ${file.name} exceeds maximum size of 10MB`);
                return;
            }
        }

        setFiles(newFiles);
        setError(null);
    }

    function removeFile(index: number) {
        setFiles(files.filter((_, i) => i !== index));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await createAdminSupportTicket({ title, description, priority, files });
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create ticket.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                        {error}
                    </div>
                )}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <input
                        type="text"
                        required
                        placeholder="Brief description of your issue"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full h-9 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                        rows={4}
                        required
                        placeholder="Please describe your issue in detail…"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Priority</label>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as TicketPriority)}
                        className="w-full h-9 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Attachments (Optional)
                    </label>
                    <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
                        onChange={handleFilesChange}
                        className="w-full text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground">
                        Maximum {MAX_ATTACHMENTS} files, 10MB each. Supported: JPG, PNG, WebP, GIF, PDF
                    </p>
                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {files.map((file, idx) => {
                                const isImage = file.type.startsWith("image/");
                                const isPDF = file.type === "application/pdf";
                                return (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-sm"
                                    >
                                        {isImage ? (
                                            <ImageIcon size={14} className="text-blue-500" />
                                        ) : isPDF ? (
                                            <FileText size={14} className="text-red-500" />
                                        ) : (
                                            <Paperclip size={14} className="text-muted-foreground" />
                                        )}
                                        <span className="text-foreground truncate max-w-[120px]">
                                            {file.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            ({(file.size / 1024).toFixed(0)}KB)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(idx)}
                                            className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : null}
                        Submit Ticket
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 h-9 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
    );
}

// ─── Ticket detail ────────────────────────────────────────────────────────────

function TicketDetail({
    ticketId,
    onClose,
}: {
    ticketId: string;
    onClose: () => void;
}) {
    const [ticket, setTicket] = useState<AdminSupportTicketOut | null>(null);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState("");
    const [commentFiles, setCommentFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    function handleCommentFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFiles = Array.from(e.target.files || []);
        const newFiles = [...commentFiles, ...selectedFiles];

        if (newFiles.length > MAX_ATTACHMENTS) {
            return;
        }

        for (const file of selectedFiles) {
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                return;
            }
        }

        setCommentFiles(newFiles);
    }

    function removeCommentFile(index: number) {
        setCommentFiles(commentFiles.filter((_, i) => i !== index));
    }

    async function load() {
        setLoading(true);
        try {
            const t = await getAdminSupportTicket(ticketId);
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
            await addAdminTicketComment(ticketId, comment, commentFiles.length > 0 ? commentFiles : undefined);
            setComment("");
            setCommentFiles([]);
            await load();
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

    if (!ticket) return null;

    return (
        <div className="bg-blue-500/10 overflow-hidden">
            <div className="px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Description</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ticket.description}</p>
                
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

            <div className="px-6 py-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Conversation ({ticket.comments.length})
                </p>
                {ticket.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No replies yet from Super Admin.</p>
                ) : (
                    <div className="space-y-3">
                        {ticket.comments.map((c) => (
                            <div
                                key={c.id}
                                className={`rounded-xl px-4 py-3 text-sm ${c.author_type === "client_admin"
                                    ? "bg-primary/5 border border-primary/20 ml-8"
                                    : "bg-muted/50 border border-border mr-8"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {c.author_type === "client_admin" ? "You" : "Super Admin"}
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
                {ticket.status !== "closed" && ticket.status !== "resolved" && (
                    <form onSubmit={handleComment} className="space-y-3 pt-1">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Add a reply…"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="flex-1 h-9 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                            <label className="h-9 px-3 rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition-colors cursor-pointer flex items-center">
                                <Paperclip size={14} />
                                <input
                                    type="file"
                                    multiple
                                    accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
                                    onChange={handleCommentFilesChange}
                                    className="hidden"
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={submitting || !comment.trim()}
                                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                                Reply
                            </button>
                        </div>
                        {commentFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {commentFiles.map((file, idx) => {
                                    const isImage = file.type.startsWith("image/");
                                    const isPDF = file.type === "application/pdf";
                                    return (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-muted/30 text-xs"
                                        >
                                            {isImage ? (
                                                <ImageIcon size={12} className="text-blue-500" />
                                            ) : isPDF ? (
                                                <FileText size={12} className="text-red-500" />
                                            ) : (
                                                <Paperclip size={12} className="text-muted-foreground" />
                                            )}
                                            <span className="text-foreground truncate max-w-[100px]">
                                                {file.name}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeCommentFile(idx)}
                                                className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </form>
                )}
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

export default function AdminSupportPage() {
    const [tickets, setTickets] = useState<AdminSupportTicketSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewForm, setShowNewForm] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listAdminSupportTickets();
            setTickets(res.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tickets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTickets(); }, [fetchTickets]);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Help & Support</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Raise tickets to Super Admin for platform issues</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchTickets}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                    >
                        <RefreshCw size={13} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setShowNewForm(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                    >
                        <Plus size={13} />
                        New Ticket
                    </button>
                </div>
            </div>

            {/* New ticket modal */}
            <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
                <DialogContent className="sm:max-w-lg !rounded-xl">
                    <DialogHeader>
                        <DialogTitle>New Support Ticket</DialogTitle>
                    </DialogHeader>
                    <div className="mt-2">
                        <NewTicketForm
                            onClose={() => setShowNewForm(false)}
                            onCreated={fetchTickets}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/* List */}
            {error ? (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                    {error}
                </div>
            ) : loading ? (
                <div className="bg-card border border-border rounded-xl divide-y divide-border animate-pulse">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="px-5 py-4 flex items-center gap-4">
                            <div className="h-4 w-4 bg-muted rounded" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-muted rounded w-64" />
                                <div className="h-3 bg-muted rounded w-40" />
                            </div>
                            <div className="h-5 w-16 bg-muted rounded-full" />
                        </div>
                    ))}
                </div>
            ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <LifeBuoy size={20} className="text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No tickets yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Raise a ticket to contact the Super Admin team.</p>
                    <button
                        onClick={() => setShowNewForm(true)}
                        className="mt-4 flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                    >
                        <Plus size={13} />
                        New Ticket
                    </button>
                </div>
            ) : (
                <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {tickets.map((ticket) => (
                        <div key={ticket.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedId(selectedId === ticket.id ? null : ticket.id)}
                                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                                aria-expanded={selectedId === ticket.id}
                            >
                                <MessageSquare size={15} className="text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        #{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <PriorityBadge priority={ticket.priority} />
                                    <StatusBadge status={ticket.status} />
                                    {selectedId === ticket.id
                                        ? <ChevronUp size={14} className="text-muted-foreground" />
                                        : <ChevronDown size={14} className="text-muted-foreground" />
                                    }
                                </div>
                            </button>
                            {selectedId === ticket.id && (
                                <div className="border-t border-border bg-muted/10 ">
                                    <TicketDetail
                                        ticketId={ticket.id}
                                        onClose={() => setSelectedId(null)}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
