/**
 * Superadmin Billing API Service
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export type BillingStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";

export interface SaasBillingRecord {
    id: string;
    client_id: string;
    plan_id: string | null;
    invoice_number: string;
    amount: number;
    currency: string;
    status: BillingStatus;
    billing_period_start: string | null;
    billing_period_end: string | null;
    period_year: number | null;
    period_month: number | null;
    usage_record_id: string | null;
    plan_snapshot: Record<string, unknown> | null;
    usage_snapshot: Record<string, unknown> | null;
    subtotal: number;
    overage_total: number;
    discount_amount: number;
    tax_amount: number;
    total_due: number;
    proration_factor: number;
    active_days: number | null;
    billing_days: number | null;
    finalized_at: string | null;
    paid_at: string | null;
    payment_method: string | null;
    transaction_id: string | null;
    notes: string | null;
    created_at: string;
    client_name: string | null;
    client_slug: string | null;
}

export interface BillingStats {
    total_invoices: number;
    pending_amount: number;
    paid_amount: number;
    failed_count: number;
    refunded_amount: number;
    by_status: Record<string, { count: number; total: number }>;
}

export interface ListSuperadminBillingParams {
    client_id?: string;
    status?: BillingStatus;
    period_year?: number;
    period_month?: number;
    page?: number;
    page_size?: number;
}

export interface UpdateBillingPayload {
    status?: BillingStatus;
    paid_at?: string | null;
    payment_method?: string | null;
    transaction_id?: string | null;
    notes?: string | null;
}

export async function fetchBillingStats(): Promise<BillingStats> {
    const { data } = await apiClient.get<BillingStats>(`${ENDPOINTS.superadmin.billing}/stats`);
    return data;
}

export async function listSuperadminBilling(
    params: ListSuperadminBillingParams = {},
): Promise<SaasBillingRecord[]> {
    const { data } = await apiClient.get<SaasBillingRecord[]>(ENDPOINTS.superadmin.billing, { params });
    return data;
}

export async function updateSuperadminBilling(
    billingId: string,
    payload: UpdateBillingPayload,
): Promise<SaasBillingRecord> {
    const { data } = await apiClient.patch<SaasBillingRecord>(
        `${ENDPOINTS.superadmin.billing}/${billingId}`,
        payload,
    );
    return data;
}
