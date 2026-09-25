import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export type JobStatus = "never" | "success" | "failed" | "running";

export interface SchedulerJobItem {
    id: string;
    name: string;
    schedule: string;
    timezone: string;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: JobStatus;
    last_error: string | null;
    is_running: boolean;
    failure_percentage: number;
}

export interface SchedulerJobSummary {
    total_jobs: number;
    running_now: number;
    success_today: number;
    failed_today: number;
    success_week: number;
    failed_week: number;
    success_month: number;
    failed_month: number;
    today_failure_rate: number;
    week_failure_rate: number;
    month_failure_rate: number;
}

export interface SchedulerJobHistoryItem {
    job_id: string;
    job_name: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    duration_ms: number | null;
    error_message: string | null;
}

export interface SchedulerJobListResponse {
    items: SchedulerJobItem[];
    total: number;
    page: number;
    page_size: number;
    summary: SchedulerJobSummary;
    recent_failures: SchedulerJobHistoryItem[];
}

export async function listSchedulerJobs(params?: {
    page?: number;
    page_size?: number;
}): Promise<SchedulerJobListResponse> {
    const { data } = await apiClient.get<SchedulerJobListResponse>(ENDPOINTS.superadmin.jobs, { params });
    return data;
}

export async function runSchedulerJob(jobId: string): Promise<SchedulerJobItem> {
    const { data } = await apiClient.post<SchedulerJobItem>(ENDPOINTS.superadmin.jobRun(jobId));
    return data;
}
