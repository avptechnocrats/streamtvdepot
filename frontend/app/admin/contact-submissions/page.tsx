"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Archive,
    ChevronDown,
    ChevronUp,
    Eye,
    Loader2,
    Mail,
    MessageSquareText,
    Phone,
    RefreshCw,
    Inbox,
} from "lucide-react";
import {
    archiveContactSubmission,
    archiveSuperAdminContactSubmission,
    getContactSubmission,
    getSuperAdminContactSubmission,
    listContactSubmissions,
    listSuperAdminContactSubmissions,
    type ContactSubmissionDetail,
    type ContactSubmissionListCounts,
    type ContactSubmissionStatus,
    type ContactSubmissionSummary,
    type ContactSubmissionTab,
} from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";

type ContactSubmissionSummaryWithClient = ContactSubmissionSummary & {
    client_name?: string;
    client_slug?: string | null;
};

type ContactSubmissionDetailWithClient = ContactSubmissionDetail & {
    client_name?: string;
    client_slug?: string | null;
};

const STATUS_STYLE: Record<ContactSubmissionStatus, string> = {
    unread: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    read: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
    archived: "bg-muted text-muted-foreground border border-border",
};

function StatusBadge({ status }: { status: ContactSubmissionStatus }) {
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

function SubmissionDetail({
    submissionId,
    isSuperAdmin,
    onClose,
    onUpdated,
}: {
    submissionId: string;
    isSuperAdmin: boolean;
    onClose: () => void;
    onUpdated: () => void;
}) {
    const [submission, setSubmission] = useState<ContactSubmissionDetailWithClient | null>(null);
    const [loading, setLoading] = useState(true);
    const [archiving, setArchiving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = isSuperAdmin
                ? await getSuperAdminContactSubmission(submissionId)
                : await getContactSubmission(submissionId);
            setSubmission(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load submission details");
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin, submissionId]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleArchive() {
        if (!submission || submission.status === "archived") return;
        setArchiving(true);
        setError(null);
        try {
            if (isSuperAdmin) {
                await archiveSuperAdminContactSubmission(submission.id);
            } else {
                await archiveContactSubmission(submission.id);
            }
            await load();
            onUpdated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to archive submission");
        } finally {
            setArchiving(false);
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

    if (!submission) return null;

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{submission.full_name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        {submission.work_email}
                        {submission.company ? ` · ${submission.company}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <StatusBadge status={submission.status} />
                        <span className="text-xs text-muted-foreground">
                            #{submission.id.slice(0, 8)} · {new Date(submission.created_at).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {submission.status !== "archived" && (
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
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Topic</p>
                    <p className="text-foreground/85">{submission.subject || "-"}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-foreground/85">{submission.phone || "-"}</p>
                </div>
                {isSuperAdmin && (
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Source</p>
                        <p className="text-foreground/85">{submission.client_name || "[Main Site Inquiry]"}</p>
                    </div>
                )}
            </div>

            <div className="px-6 py-4">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Message</p>
                <p className="text-sm text-foreground/85 whitespace-pre-wrap">{submission.message}</p>
            </div>
        </div>
    );
}

export default function ContactSubmissionsPage() {
    const { role } = useAdminAuth();
    const isSuperAdmin = role === "superadmin";

    const [items, setItems] = useState<ContactSubmissionSummaryWithClient[]>([]);
    const [counts, setCounts] = useState<ContactSubmissionListCounts>({ all: 0, unread: 0, read: 0, archived: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<ContactSubmissionTab>("all");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [archivingId, setArchivingId] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = isSuperAdmin
                ? await listSuperAdminContactSubmissions({ tab })
                : await listContactSubmissions({ tab });
            setItems(res.items as ContactSubmissionSummaryWithClient[]);
            setCounts(res.counts);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load contact submissions");
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin, tab]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    async function handleArchive(id: string) {
        setArchivingId(id);
        setError(null);
        try {
            if (isSuperAdmin) {
                await archiveSuperAdminContactSubmission(id);
            } else {
                await archiveContactSubmission(id);
            }
            if (selectedId === id) {
                setSelectedId(null);
            }
            await fetchItems();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to archive submission");
        } finally {
            setArchivingId(null);
        }
    }

    const tabs: { key: ContactSubmissionTab; label: string; count: number; icon: React.ElementType }[] = [
        { key: "all", label: "All", count: counts.all, icon: Inbox },
        { key: "unread", label: "Unread", count: counts.unread, icon: Mail },
        { key: "read", label: "Read", count: counts.read, icon: MessageSquareText },
        { key: "archived", label: "Archived", count: counts.archived, icon: Archive },
    ];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Contact Submissions</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isSuperAdmin
                            ? "Review inbound contact requests from main site and all client platforms"
                            : "Review inbound contact requests from your public storefront"}
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
                {tabs.map((item) => (
                    <TabButton
                        key={item.key}
                        active={tab === item.key}
                        label={item.label}
                        count={item.count}
                        icon={item.icon}
                        onClick={() => {
                            setTab(item.key);
                            setSelectedId(null);
                        }}
                    />
                ))}
            </div>

            {selectedId && (
                <SubmissionDetail
                    submissionId={selectedId}
                    isSuperAdmin={isSuperAdmin}
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
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="px-5 py-4 flex items-center gap-4">
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
                            <p className="text-sm">No contact submissions found</p>
                        </div>
                    ) : (
                        <>
                            {items.map((item) => (
                        <div key={item.id} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{item.full_name}</p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 truncate max-w-full">
                                        <Mail size={12} />
                                        {item.work_email}
                                    </span>
                                    {item.company ? <span>{item.company}</span> : null}
                                    {item.subject ? (
                                        <span className="inline-flex items-center gap-1 truncate max-w-full">
                                            <MessageSquareText size={12} />
                                            {item.subject}
                                        </span>
                                    ) : null}
                                    {isSuperAdmin && item.client_name ? <span>{item.client_name}</span> : null}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                    {new Date(item.created_at).toLocaleDateString()}
                                </span>
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