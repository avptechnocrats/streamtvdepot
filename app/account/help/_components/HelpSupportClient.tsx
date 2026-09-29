"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    ImageIcon,
    Maximize2,
    FileText,
    Paperclip,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    fetchMyTickets,
    createTicket,
    fetchTicket,
    addTicketComment,
    type SupportTicketSummary,
    type SupportTicket,
    type TicketStatus,
    type TicketPriority,
} from "@/lib/services/support";

// ─── Status helpers ───────────────────────────────────────────────────────────

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


const ALLOWED_FILE_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;

function NewTicketForm({
    onClose,
    onCreated,
    accessToken,
}: {
    onClose: () => void;
    onCreated: () => void;
    accessToken: string;
}) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<TicketPriority>("medium");
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        
        if (files.length + selectedFiles.length > MAX_ATTACHMENTS) {
            setError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
            e.target.value = "";
            return;
        }

        for (const file of selectedFiles) {
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                setError(`Unsupported file type: ${file.name}. Use JPEG, PNG, WebP, GIF or PDF.`);
                e.target.value = "";
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                setError(`File ${file.name} must be 10 MB or smaller.`);
                e.target.value = "";
                return;
            }
        }
        
        setError(null);
        setFiles(prev => [...prev, ...selectedFiles]);
        e.target.value = "";
    }

    function removeFile(index: number) {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append("title", title);
            formData.append("description", description);
            formData.append("priority", priority);
            files.forEach((file) => formData.append("attachments", file));

            await createTicket(formData, accessToken);
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
                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                        <span className="mt-0.5 shrink-0">⚠</span>
                        {error}
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label htmlFor="ticket-title" className="text-sm font-medium">Subject</Label>
                    <Input
                        id="ticket-title"
                        placeholder="Brief description of your issue"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-10"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ticket-desc" className="text-sm font-medium">Description</Label>
                    <textarea
                        id="ticket-desc"
                        rows={4}
                        required
                        placeholder="Please describe your issue in detail…"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ticket-priority" className="text-sm font-medium">Priority</Label>
                    <select
                        id="ticket-priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as TicketPriority)}
                        className="w-full h-10 rounded-md border border-border/60 bg-secondary/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="ticket-files" className="text-sm font-medium">Attachments (optional)</Label>
                    <Input
                        type="file"
                        id="ticket-files"
                        accept={ALLOWED_FILE_TYPES.join(",")}
                        onChange={handleFilesChange}
                        multiple
                        className="h-10 w-full rounded-md border border-border/60 bg-secondary/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <p className="text-xs text-muted-foreground">
                        Images (JPEG, PNG, WebP, GIF) or PDF · max 10 MB each · up to {MAX_ATTACHMENTS} files
                    </p>
                    {files.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {files.map((file, idx) => {
                                const isImage = file.type.startsWith("image/");
                                const isPDF = file.type === "application/pdf";
                                return (
                                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-muted/30">
                                        {isImage ? (
                                            <ImageIcon size={16} className="text-muted-foreground shrink-0" />
                                        ) : isPDF ? (
                                            <FileText size={16} className="text-muted-foreground shrink-0" />
                                        ) : (
                                            <Paperclip size={16} className="text-muted-foreground shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {(file.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(idx)}
                                            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                            aria-label="Remove file"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex gap-3 pt-1">
                    <Button type="submit" disabled={loading} className="flex-1">
                        {loading ? <><Loader2 size={14} className="mr-2 animate-spin" />Submitting…</> : "Submit Ticket"}
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                        Cancel
                    </Button>
                </div>
            </form>
    );
}

// ─── Ticket detail ────────────────────────────────────────────────────────────

function TicketDetail({
    ticketId,
    accessToken,
    onClose,
}: {
    ticketId: string;
    accessToken: string;
    onClose: () => void;
}) {
    const [ticket, setTicket] = useState<SupportTicket | null>(null);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState("");
    const [commentFiles, setCommentFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    function handleCommentFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        
        if (commentFiles.length + selectedFiles.length > MAX_ATTACHMENTS) {
            alert(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
            e.target.value = "";
            return;
        }

        for (const file of selectedFiles) {
            if (!ALLOWED_FILE_TYPES.includes(file.type)) {
                alert(`Unsupported file type: ${file.name}. Use JPEG, PNG, WebP, GIF or PDF.`);
                e.target.value = "";
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                alert(`File ${file.name} must be 10 MB or smaller.`);
                e.target.value = "";
                return;
            }
        }
        
        setCommentFiles(prev => [...prev, ...selectedFiles]);
        e.target.value = "";
    }

    function removeCommentFile(index: number) {
        setCommentFiles(prev => prev.filter((_, i) => i !== index));
    }

    async function load() {
        setLoading(true);
        try {
            const t = await fetchTicket(ticketId, accessToken);
            setTicket(t);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleComment(e: React.FormEvent) {
        e.preventDefault();
        if (!comment.trim() && commentFiles.length === 0) return;
        setSubmitting(true);
        try {
            await addTicketComment(ticketId, comment || " ", accessToken, commentFiles.length > 0 ? commentFiles : undefined);
            setComment("");
            setCommentFiles([]);
            await load();
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        );
    }

    if (!ticket) return null;

    return (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground truncate">{ticket.title}</h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                        <span className="text-xs text-muted-foreground">
                            {new Date(ticket.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                    <X size={16} />
                </button>
            </div>

            {/* Description */}
            <div className="px-6 py-4 border-b border-border/50">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Attachments */}
            {ticket.attachments.length > 0 && (
                <div className="px-6 py-4 border-b border-border/50">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                        Attachments ({ticket.attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {ticket.attachments.map((att) => {
                            const isImage = att.file_type.startsWith("image/");
                            const isPDF = att.file_type === "application/pdf";
                            if (isImage) {
                                return (
                                    <button
                                        key={att.id}
                                        onClick={() => setImagePreview(att.file_url)}
                                        className="group relative rounded-xl overflow-hidden border border-border/60 hover:border-primary/40 transition-colors"
                                    >
                                        <img
                                            src={att.file_url}
                                            alt={att.file_name}
                                            className="max-h-32 w-auto object-contain bg-muted/30"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                                            <Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                                        </div>
                                    </button>
                                );
                            }
                            return (
                                <a
                                    key={att.id}
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 hover:border-primary/40 bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                    {isPDF ? <FileText size={16} className="text-muted-foreground" /> : <Paperclip size={16} className="text-muted-foreground" />}
                                    <span className="text-sm text-foreground truncate max-w-[200px]">{att.file_name}</span>
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Comments */}
            <div className="px-6 py-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Conversation ({ticket.comments.length})
                </p>
                {ticket.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No replies yet. Our support team will respond soon.</p>
                ) : (
                    <div className="space-y-3">
                        {ticket.comments.map((c) => (
                            <div
                                key={c.id}
                                className={`rounded-xl px-4 py-3 text-sm ${c.author_type === "end_user"
                                    ? "bg-primary/5 border border-primary/20 ml-4"
                                    : "bg-muted/50 border border-border/50 mr-4"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {c.author_type === "end_user" ? "You" : "Support Team"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(c.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-foreground/80 whitespace-pre-wrap">{c.message}</p>
                                {c.attachments && c.attachments.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {c.attachments.map((att) => {
                                            const isImage = att.file_type.startsWith("image/");
                                            const isPDF = att.file_type === "application/pdf";
                                            if (isImage) {
                                                return (
                                                    <button
                                                        key={att.id}
                                                        onClick={() => setImagePreview(att.file_url)}
                                                        className="group relative rounded-lg overflow-hidden border border-border/60 hover:border-primary/40 transition-colors"
                                                    >
                                                        <img
                                                            src={att.file_url}
                                                            alt={att.file_name}
                                                            className="max-h-24 w-auto object-contain bg-muted/30"
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                                                            <Maximize2 size={14} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                                                        </div>
                                                    </button>
                                                );
                                            }
                                            return (
                                                <a
                                                    key={att.id}
                                                    href={att.file_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 hover:border-primary/40 bg-background/50 hover:bg-background transition-colors text-xs"
                                                >
                                                    {isPDF ? <FileText size={12} className="text-muted-foreground" /> : <Paperclip size={12} className="text-muted-foreground" />}
                                                    <span className="truncate max-w-[150px]">{att.file_name}</span>
                                                </a>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Reply form — only if not closed */}
                {ticket.status !== "closed" && ticket.status !== "resolved" && (
                    <div className="pt-2 space-y-2">
                        {commentFiles.length > 0 && (
                            <div className="space-y-1.5">
                                {commentFiles.map((file, idx) => {
                                    const isImage = file.type.startsWith("image/");
                                    const isPDF = file.type === "application/pdf";
                                    return (
                                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-muted/20">
                                            {isImage ? (
                                                <ImageIcon size={14} className="text-muted-foreground shrink-0" />
                                            ) : isPDF ? (
                                                <FileText size={14} className="text-muted-foreground shrink-0" />
                                            ) : (
                                                <Paperclip size={14} className="text-muted-foreground shrink-0" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeCommentFile(idx)}
                                                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                aria-label="Remove file"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <form onSubmit={handleComment} className="flex gap-2">
                            <Input
                                placeholder="Add a reply…"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="h-10 flex-1"
                            />
                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    multiple
                                    accept={ALLOWED_FILE_TYPES.join(",")}
                                    onChange={handleCommentFilesChange}
                                    className="sr-only"
                                />
                                <Button type="button" variant="outline" size="sm" className="h-10 px-3" asChild>
                                    <span>
                                        <Paperclip size={14} />
                                    </span>
                                </Button>
                            </label>
                            <Button type="submit" disabled={submitting || (!comment.trim() && commentFiles.length === 0)} size="sm" className="h-10 px-4">
                                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            </Button>
                        </form>
                    </div>
                )}
            </div>

            {/* Image lightbox */}
            <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
                <DialogContent className="max-w-4xl p-2 bg-black/90 border-none">
                    {imagePreview && (
                        <img
                            src={imagePreview}
                            alt="Full size attachment"
                            className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HelpSupportClient() {
    const { user, isLoading, accessToken } = useAuth();
    const router = useRouter();
    const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(true);
    const [showNewForm, setShowNewForm] = useState(false);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoading && !user) router.replace("/login");
    }, [user, isLoading, router]);

    async function loadTickets() {
        if (!accessToken) return;
        setTicketsLoading(true);
        try {
            const res = await fetchMyTickets(accessToken);
            setTickets(res.items);
        } catch {
            // silently ignore
        } finally {
            setTicketsLoading(false);
        }
    }

    useEffect(() => {
        if (accessToken) loadTickets();
    }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48 rounded mb-6" />
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
        );
    }

    if (!user) return null;

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-black text-foreground tracking-tight">Help & Support</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Raise a ticket or check existing requests</p>
                </div>
                <Button size="sm" onClick={() => setShowNewForm(true)} className="shrink-0">
                    <Plus size={14} className="mr-1.5" />
                    New Ticket
                </Button>
            </div>

            {/* New ticket form modal */}
            <Dialog open={showNewForm} onOpenChange={setShowNewForm}>
                <DialogContent className="sm:max-w-lg !rounded-xl">
                    <DialogHeader>
                        <DialogTitle>New Support Ticket</DialogTitle>
                    </DialogHeader>

                    <div className="mt-2">
                        {accessToken && (
                            <NewTicketForm
                                accessToken={accessToken}
                                onClose={() => setShowNewForm(false)}
                                onCreated={loadTickets}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Ticket list */}
            {ticketsLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
            ) : tickets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 px-6 py-10 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <LifeBuoy size={22} className="text-primary" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">No tickets yet</h2>
                    <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
                        If you need help, raise a support ticket and our team will get back to you.
                    </p>
                    <Button size="sm" className="mt-4" onClick={() => setShowNewForm(true)}>
                        <Plus size={14} className="mr-1.5" />
                        Raise a Ticket
                    </Button>
                </div>
            ) : (
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                    {tickets.map((ticket) => (
                        <div key={ticket.id}>
                            <div
                                onClick={() => setSelectedTicketId(selectedTicketId === ticket.id ? null : ticket.id)}
                                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
                            >
                                <MessageSquare size={16} className="text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{ticket.title}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {new Date(ticket.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <StatusBadge status={ticket.status} />
                                    <PriorityBadge priority={ticket.priority} />
                                    {selectedTicketId === ticket.id
                                        ? <ChevronUp size={14} className="text-muted-foreground" />
                                        : <ChevronDown size={14} className="text-muted-foreground" />
                                    }
                                </div>
                            </div>
                            {selectedTicketId === ticket.id && (
                                <TicketDetail
                                    ticketId={ticket.id}
                                    accessToken={accessToken}
                                    onClose={() => setSelectedTicketId(null)}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
