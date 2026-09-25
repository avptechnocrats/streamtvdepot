"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock3, Loader2, Play, RefreshCw, CheckCircle2, XCircle, Info } from "lucide-react";
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
import { listSchedulerJobs, runSchedulerJob, type SchedulerJobItem } from "@/lib/api";

const STATUS_STYLE: Record<SchedulerJobItem["last_status"], string> = {
    never: "bg-slate-500/10 text-slate-600 border border-slate-500/20",
    success: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
    failed: "bg-red-500/10 text-red-600 border border-red-500/20",
    running: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
};

function StatusBadge({ status }: { status: SchedulerJobItem["last_status"] }) {
    const label = status === "never" ? "Never" : status === "success" ? "Success" : status === "failed" ? "Failed" : "Running";
    const icon = status === "success" ? <CheckCircle2 size={12} /> : status === "failed" ? <XCircle size={12} /> : status === "running" ? <Loader2 size={12} className="animate-spin" /> : <Clock3 size={12} />;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[status]}`}>
            {icon}
            {label}
        </span>
    );
}

export default function JobSchedulerPage() {
    const PAGE_SIZE = 10;
    const [jobs, setJobs] = useState<SchedulerJobItem[]>([]);
    const [totalJobs, setTotalJobs] = useState(0);
    const [recentFailures, setRecentFailures] = useState<any[]>([]);
    const [summary, setSummary] = useState({
        total_jobs: 0,
        running_now: 0,
        success_today: 0,
        failed_today: 0,
        success_week: 0,
        failed_week: 0,
        success_month: 0,
        failed_month: 0,
        today_failure_rate: 0,
        week_failure_rate: 0,
        month_failure_rate: 0,
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runningJobId, setRunningJobId] = useState<string | null>(null);
    const [selectedError, setSelectedError] = useState<string | null>(null);

    const fetchJobs = useCallback(async (page = currentPage) => {
        setLoading(true);
        setError(null);
        try {
            const data = await listSchedulerJobs({ page, page_size: PAGE_SIZE });
            setJobs(data.items);
            setTotalJobs(data.total);
            setSummary(data.summary);
            setRecentFailures(
                data.recent_failures?.length
                    ? data.recent_failures
                    : (data.items || [])
                          .filter((job) => job.last_status === "failed")
                          .map((job) => ({
                              job_id: job.id,
                              job_name: job.name,
                              status: "failed",
                              started_at: job.last_run_at,
                              finished_at: job.last_run_at,
                              duration_ms: null,
                              error_message: job.last_error || "Job reported a failure.",
                          }))
            );
            setCurrentPage(data.page);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load job scheduler");
        } finally {
            setLoading(false);
        }
    }, [currentPage]);

    useEffect(() => {
        fetchJobs(currentPage);
    }, [fetchJobs, currentPage]);

    const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));
    const visiblePages = getPaginationItems(currentPage, totalPages, 1);

    const summaryCards = useMemo(() => ({
        total: summary.total_jobs || jobs.length,
        running: summary.running_now,
        today: {
            success: summary.success_today,
            failed: summary.failed_today,
            failureRate: summary.today_failure_rate,
        },
        week: {
            success: summary.success_week,
            failed: summary.failed_week,
            failureRate: summary.week_failure_rate,
        },
        month: {
            success: summary.success_month,
            failed: summary.failed_month,
            failureRate: summary.month_failure_rate,
        },
    }), [jobs.length, summary]);

    const handleRunNow = async (jobId: string) => {
        setRunningJobId(jobId);
        setError(null);
        try {
            await runSchedulerJob(jobId);
            await fetchJobs();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to trigger job");
        } finally {
            setRunningJobId(null);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Job Scheduler</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Monitor the platform background jobs, view their cron timing, and trigger them manually when needed.
                    </p>
                </div>
                <button
                    onClick={() => fetchJobs(currentPage)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
                >
                    <RefreshCw size={14} />
                    Refresh
                </button>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Total Jobs</div>
                    <div className="mt-2 text-2xl font-semibold">{summaryCards.total}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Running Now</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-600">{summaryCards.running}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Today</div>
                    <div className="mt-2 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-emerald-600">{summaryCards.today.success}</span>
                        <span className="text-muted-foreground">success</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-red-600">{summaryCards.today.failed}</span>
                        <span className="text-muted-foreground">failed</span>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Failure {summaryCards.today.failureRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">This Week</div>
                    <div className="mt-2 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-emerald-600">{summaryCards.week.success}</span>
                        <span className="text-muted-foreground">success</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-red-600">{summaryCards.week.failed}</span>
                        <span className="text-muted-foreground">failed</span>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Failure {summaryCards.week.failureRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">This Month</div>
                    <div className="mt-2 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-emerald-600">{summaryCards.month.success}</span>
                        <span className="text-muted-foreground">success</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-red-600">{summaryCards.month.failed}</span>
                        <span className="text-muted-foreground">failed</span>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Failure {summaryCards.month.failureRate.toFixed(1)}%</div>
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
                                <th className="text-left px-4 py-2.5 font-medium">Job</th>
                                <th className="text-left px-4 py-2.5 font-medium">Schedule</th>
                                <th className="text-left px-4 py-2.5 font-medium">Last Run</th>
                                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                                <th className="text-left px-4 py-2.5 font-medium">Failure</th>
                                <th className="text-left px-4 py-2.5 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: PAGE_SIZE }).map((_, index) => (
                                    <tr key={`job-skeleton-${index}`} className="border-b border-border last:border-0 align-top">
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-28 animate-pulse rounded bg-muted/70" />
                                            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted/60" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-6 w-28 animate-pulse rounded-full bg-muted/70" />
                                            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted/60" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-32 animate-pulse rounded bg-muted/70" />
                                            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted/60" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-6 w-24 animate-pulse rounded-full bg-muted/70" />
                                            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted/60" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-4 w-20 animate-pulse rounded bg-muted/70" />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="h-9 w-24 animate-pulse rounded-lg bg-muted/70" />
                                        </td>
                                    </tr>
                                ))
                            ) : jobs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                                        No scheduler jobs found
                                    </td>
                                </tr>
                            ) : (
                                jobs.map((job) => (
                                    <tr key={job.id} className="border-b border-border last:border-0 align-top">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-foreground">{job.name}</div>
                                            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{job.id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] bg-muted/30 text-muted-foreground">
                                                <Clock3 size={12} />
                                                {job.schedule}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground mt-1">{job.timezone}</div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : "Never"}
                                            {job.next_run_at && (
                                                <div className="text-[11px] text-muted-foreground mt-1">Next: {new Date(job.next_run_at).toLocaleString()}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={job.last_status} />
                                            <div className="mt-2 text-[11px] text-muted-foreground">Failure: {job.failure_percentage.toFixed(1)}%</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {job.last_error ? (
                                                <button
                                                    onClick={() => setSelectedError(job.last_error || "No detailed report available")}
                                                    className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-700"
                                                >
                                                    <Info size={14} />
                                                    View report
                                                </button>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleRunNow(job.id)}
                                                disabled={runningJobId === job.id || job.is_running}
                                                className="inline-flex items-center gap-2 rounded-lg border border-border bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                                            >
                                                {runningJobId === job.id || job.is_running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                                {runningJobId === job.id || job.is_running ? "Running..." : "Run now"}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                    <h2 className="text-sm font-semibold text-foreground">Recent Failed Runs</h2>
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Last 10</span>
                </div>
                {recentFailures.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">No failed job runs recorded yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-muted/20">
                                <tr>
                                    <th className="text-left px-4 py-2.5 font-medium">Job</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Started</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Ended</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentFailures.map((failure) => (
                                    <tr key={`${failure.job_id}-${failure.started_at}`} className="border-t border-border align-top">
                                        <td className="px-4 py-3 font-medium text-foreground">{failure.job_name}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{failure.started_at ? new Date(failure.started_at).toLocaleString() : "—"}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{failure.finished_at ? new Date(failure.finished_at).toLocaleString() : "—"}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {failure.duration_ms != null ? `${(failure.duration_ms / 1000).toFixed(1)}s` : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-red-600">
                                            <div className="max-w-xl whitespace-pre-wrap break-words">{failure.error_message || "No error details captured."}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {jobs.length > 0 && (
                <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="w-60 text-sm text-muted-foreground">
                        Showing {jobs.length} of {totalJobs}
                    </div>
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (currentPage > 1) setCurrentPage((p) => p - 1);
                                    }}
                                    aria-disabled={currentPage <= 1}
                                    className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                            {visiblePages.map((page, index) => {
                                if (page === "ellipsis") {
                                    return (
                                        <PaginationItem key={`ellipsis-${index}`}>
                                            <PaginationEllipsis className="h-9 w-9" />
                                        </PaginationItem>
                                    );
                                }

                                return (
                                    <PaginationItem key={page}>
                                        <PaginationLink
                                            href="#"
                                            isActive={page === currentPage}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setCurrentPage(page);
                                            }}
                                        >
                                            {page}
                                        </PaginationLink>
                                    </PaginationItem>
                                );
                            })}
                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (currentPage < totalPages) setCurrentPage((p) => p + 1);
                                    }}
                                    aria-disabled={currentPage >= totalPages}
                                    className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}

            {selectedError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <AlertCircle size={16} className="text-red-500" />
                                Job failure report
                            </div>
                            <button onClick={() => setSelectedError(null)} className="text-muted-foreground hover:text-foreground">✕</button>
                        </div>
                        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-6 text-foreground/90">
                            {selectedError}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
