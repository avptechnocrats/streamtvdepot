"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Eye, Loader2, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    archiveContactSubmission,
    getContactSubmission,
    listContactSubmissions,
    type ClientContactSubmissionDetail,
    type ClientContactSubmissionSummary,
    type ContactSubmissionListCounts,
    type ContactSubmissionStatus,
    type ContactSubmissionTab,
} from "@/lib/api";

const STATUS_STYLE: Record<ContactSubmissionStatus, string> = {
    unread: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    read: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
    archived: "bg-muted text-muted-foreground border border-border",
};

const TABS: { key: ContactSubmissionTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "read", label: "Read" },
    { key: "archived", label: "Archived" },
];

function StatusBadge({ status }: { status: ContactSubmissionStatus }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_STYLE[status]}`}>
            {status}
        </span>
    );
}

export default function ClientContactSubmissions() {
    const [items, setItems] = useState<ClientContactSubmissionSummary[]>([]);
    const [counts, setCounts] = useState<ContactSubmissionListCounts>({ all: 0, unread: 0, read: 0, archived: 0 });
    const [tab, setTab] = useState<ContactSubmissionTab>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<ClientContactSubmissionDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [archiving, setArchiving] = useState(false);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listContactSubmissions({ tab });
            setItems(res.items);
            setCounts(res.counts);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load submissions");
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => { void fetchItems(); }, [fetchItems]);

    const preview = async (id: string) => {
        setOpen(true);
        setDetail(null);
        setDetailLoading(true);
        try {
            setDetail(await getContactSubmission(id));
            void fetchItems();
        } catch {
            setOpen(false);
            setError("Failed to load submission");
        } finally {
            setDetailLoading(false);
        }
    };

    const archive = async () => {
        if (!detail) return;
        setArchiving(true);
        try {
            setDetail(await archiveContactSubmission(detail.id));
            void fetchItems();
        } catch {
            setError("Failed to archive submission");
        } finally {
            setArchiving(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Submissions</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Contact Us form submissions from your storefront.</p>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                {TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${tab === key ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        {label}
                        <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{counts[key]}</span>
                    </button>
                ))}
            </div>

            {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">{error}</div>}

            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3 bg-muted/30">
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Date</p>
                    <p className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className="w-10 shrink-0" />
                </div>
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <Mail size={32} className="opacity-30" />
                        <p className="text-sm">No submissions found</p>
                    </div>
                ) : items.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                        <p className="flex-1 text-sm text-foreground">{new Date(item.created_at).toLocaleString()}</p>
                        <div className="w-24 shrink-0"><StatusBadge status={item.status} /></div>
                        <button onClick={() => void preview(item.id)} title="Preview" className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                            <Eye size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader><DialogTitle>Submission</DialogTitle></DialogHeader>
                    {detailLoading || !detail ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span>{new Date(detail.created_at).toLocaleString()}</span>
                                <StatusBadge status={detail.status} />
                            </div>
                            <dl className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                                {detail.form_data.map((answer) => (
                                    <div key={answer.id} className="rounded-lg bg-secondary/50 px-3 py-2">
                                        <dt className="text-[11px] text-muted-foreground">{answer.label}</dt>
                                        <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                                            {Array.isArray(answer.value) ? answer.value.join(", ") : answer.value || "-"}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            {detail.status !== "archived" && (
                                <div className="flex justify-end">
                                    <button onClick={() => void archive()} disabled={archiving} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50">
                                        {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                                        Archive
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
