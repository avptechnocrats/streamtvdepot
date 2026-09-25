/**
 * Usage Tracking API Service (Superadmin)
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UsageStatus = "normal" | "at_risk" | "over_limit";

export interface ClientUsageSummary {
    client_id: string;
    client_name: string;
    client_slug: string;
    client_logo_url: string | null;
    client_status: string;
    // Plan
    plan_id: string | null;
    plan_name: string | null;
    plan_currency: string;
    plan_price_monthly: number | null;
    // Limits (null = unlimited)
    limit_storage_gb: number | null;
    limit_bandwidth_gb: number | null;
    limit_encoding_minutes: number | null;
    limit_users: number | null;
    limit_streams: number | null;
    // Overage rates
    overage_bandwidth_per_gb: number | null;
    overage_storage_per_gb: number | null;
    overage_encoding_per_minute: number | null;
    // Actuals
    storage_gb_used: number;
    bandwidth_gb_used: number;
    encoding_minutes_used: number;
    api_calls_used: number;
    concurrent_users_peak: number;
    // Content counts
    total_videos: number;
    total_audio: number;
    total_live_streams: number;
    total_end_users: number;
    total_admin_users: number;
    // Overages (computed by backend)
    overage_storage: number;
    overage_bandwidth: number;
    overage_encoding: number;
    overage_api: number;
    total_overage: number;
    total_invoice: number;
    currency: string;
    // Period
    billing_year: number;
    billing_month: number;
    // Computed
    storage_pct: number | null;
    bandwidth_pct: number | null;
    encoding_pct: number | null;
    usage_status: UsageStatus;
}

export interface MonthlyUsageRecord {
    billing_year: number;
    billing_month: number;
    storage_gb_used: number;
    bandwidth_gb_used: number;
    encoding_minutes_used: number;
    api_calls_used: number;
    concurrent_users_peak: number;
    total_videos: number;
    total_audio: number;
    total_live_streams: number;
    total_end_users: number;
    overage_storage: number;
    overage_bandwidth: number;
    overage_encoding: number;
    overage_api: number;
    total_overage: number;
    base_fee: number;
    total_invoice: number;
    is_finalized: boolean;
    currency: string;
}

export interface ClientUsageDetail {
    client_id: string;
    client_name: string;
    client_slug: string;
    client_status: string;
    plan_name: string | null;
    plan_currency: string;
    plan_price_monthly: number | null;
    // Limits
    limit_storage_gb: number | null;
    limit_bandwidth_gb: number | null;
    limit_encoding_minutes: number | null;
    limit_users: number | null;
    limit_streams: number | null;
    limit_api_calls: number | null;
    // Overage rates
    overage_bandwidth_per_gb: number | null;
    overage_storage_per_gb: number | null;
    overage_encoding_per_minute: number | null;
    overage_api_per_1m_calls: number | null;
    // Monthly history (up to 12 months, newest first)
    monthly_history: MonthlyUsageRecord[];
}

export interface ListUsageParams {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    billing_year?: number;
    billing_month?: number;
}

export interface UsageSyncResult {
    status: string;
    message: string;
    billing_year: number;
    billing_month: number;
    attempted_clients: number;
    successful_clients: number;
    failed_clients: number;
    client_results: UsageSyncClientResult[];
}

export interface UsageSyncClientMetrics {
    bandwidth_gb_used: number;
    storage_gb_used: number;
    encoding_minutes_used: number;
    concurrent_users_peak: number;
}

export interface UsageSyncClientResult {
    client_id: string;
    client_slug: string;
    success: boolean;
    metrics: UsageSyncClientMetrics | null;
    diagnostics: Record<string, string>;
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function listClientUsage(params: ListUsageParams = {}): Promise<ClientUsageSummary[]> {
    const { data } = await apiClient.get<ClientUsageSummary[]>(ENDPOINTS.superadmin.usage, { params });
    return data;
}

export async function getClientUsageDetail(clientId: string): Promise<ClientUsageDetail> {
    const { data } = await apiClient.get<ClientUsageDetail>(ENDPOINTS.superadmin.clientUsage(clientId));
    return data;
}

export async function syncUsageFromAws(billing_year: number, billing_month: number): Promise<UsageSyncResult> {
    const { data } = await apiClient.post<UsageSyncResult>(`${ENDPOINTS.superadmin.usage}/sync`, {
        billing_year,
        billing_month,
    });
    return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatBytes(gb: number): string {
    if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(gb * 1024).toFixed(0)} MB`;
}

export function formatMinutes(minutes: number): string {
    if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
    return `${minutes.toFixed(0)}m`;
}

export function formatCurrency(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}
