"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Search, XCircle, Mail } from "lucide-react";

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
import { listSuperadminMailLogs, type MailLogItem, type MailLogStatus } from "@/lib/api";

const STATUS_STYLE: Record<MailLogStatus, string> = {
    sent: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
    failed: "bg-red-500/10 text-red-600 border border-red-500/20",
    skipped: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
};

function StatusBadge({ status }: { status: MailLogStatus }) {
    const icon = status === "sent" ? <CheckCircle2 size={12} /> : status === "failed" ? <XCircle size={12} /> : <AlertCircle size={12} />;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[status]}`}>
            {icon}
            {status}
        </span>
    );
}

export default function SystemMailLogsPage() {
    const PAGE_SIZE = 10;
    const [items, setItems] = useState<MailLogItem[]>([]);
    const [counts, setCounts] = useState({ all: 0, sent: 0, failed: 0, skipped: 0 });
    const [status, setStatus] = useState<"all" | MailLogStatus>("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const visiblePages = getPaginationItems(page, totalPages, 1);

    const fetchLogs = useCallback(async (nextPage = page) => {
        setLoading(true);
        setError(null);
        try {
            const res = await listSuperadminMailLogs({
                status: status === "all" ? undefined : status,
                search: search.trim() || undefined,
                page: nextPage,
                page_size: PAGE_SIZE,
            });
            setItems(res.items);
            setCounts(res.counts);
            setTotal(res.total);
            setPage(res.page);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load mail logs");
        } finally {
            setLoading(false);
        }
    }, [page, status, search]);

    useEffect(() => {
        fetchLogs(page);
    }, [fetchLogs, page]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">System Mail Logs</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Track every system-generated mail, delivery status, and configuration source.
                    </p>
                </div>
                <button
                    onClick={() => fetchLogs(page)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-surface-hover/50 border border-border w-fit">
                    {(["all", "sent", "failed", "skipped"] as const).map((key) => {
                        const Icon = key === "all" ? Mail : key === "sent" ? CheckCircle2 : key === "failed" ? XCircle : AlertCircle;
                        return (
                            <button
                                key={key}
                                onClick={() => {
                                    setStatus(key);
                                    setPage(1);
                                }}
                                className={`flex items-center gap-2 px-3 py-0.5 rounded-lg text-sm font-medium transition-colors ${
                                    status === key
                                        ? "bg-card text-foreground shadow-sm border border-border/50"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon size={14} />
                                {key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
                                <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                    {counts[key as keyof typeof counts]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="ml-auto relative w-full lg:w-auto lg:max-w-xs">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search email or subject"
                        className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background"
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/40 border-b border-border">
                            <tr>
                                <th className="text-left px-4 py-2.5 font-medium">Time</th>
                                <th className="text-left px-4 py-2.5 font-medium">Event</th>
                                <th className="text-left px-4 py-2.5 font-medium">Recipient</th>
                                <th className="text-left px-4 py-2.5 font-medium">Subject</th>
                                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                                <th className="text-left px-4 py-2.5 font-medium">Config</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: PAGE_SIZE }).map((_, index) => (
                                    <tr key={`mail-log-skeleton-${index}`} className="border-b border-border last:border-0 align-top">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-20 animate-pulse rounded bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-32 animate-pulse rounded bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-44 animate-pulse rounded bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-6 w-20 animate-pulse rounded-full bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-16 animate-pulse rounded bg-muted/70" />
                                        </td>
                                    </tr>
                                ))
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                                            <Mail size={32} className="opacity-30" />
                                            <p className="text-sm">No mail logs found</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((row) => (
                                    <tr key={row.id} className="border-b border-border last:border-0 align-top">
                                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                                        <td className="px-4 py-2.5 font-mono text-xs">{row.event_key}</td>
                                        <td className="px-4 py-2.5">{row.recipient_email}</td>
                                        <td className="px-4 py-2.5">
                                            <p className="text-foreground">{row.subject}</p>
                                            {row.error_message && <p className="text-xs text-destructive mt-1">{row.error_message}</p>}
                                        </td>
                                        <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.config_source}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {items.length > 0 && (
                <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="w-60 text-sm text-muted-foreground">
                        Showing {items.length} of {total}
                    </div>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page > 1) setPage((p) => p - 1);
                                    }}
                                    aria-disabled={page <= 1}
                                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            {visiblePages.map((nextPage, index) => {
                                if (nextPage === "ellipsis") {
                                    return (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis className="h-9 w-9" />
                                        </PaginationItem>
                                    );
                                }

                                return (
                                    <PaginationItem key={nextPage}>
                                        <PaginationLink
                                            href="#"
                                            isActive={nextPage === page}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setPage(nextPage);
                                            }}
                                        >
                                            {nextPage}
                                        </PaginationLink>
                                    </PaginationItem>
                                );
                            })}
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page < totalPages) setPage((p) => p + 1);
                                    }}
                                    aria-disabled={page >= totalPages}
                                    className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
