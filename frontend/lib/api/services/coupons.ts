import apiClient from "../client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DiscountType = "percentage" | "fixed_amount";

export interface CouponOut {
    id: string;
    client_id: string;
    code: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_amount: number | null;
    max_discount_amount: number | null;
    max_uses: number | null;
    max_uses_per_user: number | null;
    current_uses: number;
    currency: string | null;
    valid_from: string | null;
    valid_until: string | null;
    applies_to_plan_ids: string[] | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface CouponCreate {
    code: string;
    description?: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_amount?: number | null;
    max_discount_amount?: number | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
    currency: string;
    valid_from?: string | null;
    valid_until?: string | null;
    applies_to_plan_ids?: string[] | null;
    is_active?: boolean;
}

export interface CouponUpdate {
    description?: string | null;
    discount_type?: DiscountType;
    discount_value?: number;
    min_amount?: number | null;
    max_discount_amount?: number | null;
    max_uses?: number | null;
    max_uses_per_user?: number | null;
    currency?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    applies_to_plan_ids?: string[] | null;
    is_active?: boolean;
}

export interface CouponUsageOut {
    id: string;
    coupon_id: string;
    user_id: string;
    payment_id: string;
    discount_amount: number;
    original_amount: number;
    final_amount: number;
    used_at: string;
    created_at: string;
}

export interface CouponValidateRequest {
    code: string;
    plan_id: string;
    amount: number;
}

export interface CouponValidateResponse {
    valid: boolean;
    message: string | null;
    discount_amount: number | null;
    final_amount: number | null;
    coupon: CouponOut | null;
}

export interface CouponStatsOut {
    total_coupons: number;
    active_coupons: number;
    total_usage: number;
    total_discount_given: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getCouponStats(): Promise<CouponStatsOut> {
    const res = await apiClient.get<CouponStatsOut>("/admin/coupons/stats");
    return res.data;
}

export async function listCoupons(params?: {
    is_active?: boolean;
    search?: string;
    discount_type?: "percentage" | "fixed_amount";
}): Promise<CouponOut[]> {
    const res = await apiClient.get<CouponOut[]>("/admin/coupons", { params });
    return res.data;
}

export async function getCoupon(id: string): Promise<CouponOut> {
    const res = await apiClient.get<CouponOut>(`/admin/coupons/${id}`);
    return res.data;
}

export async function createCoupon(payload: CouponCreate): Promise<CouponOut> {
    const res = await apiClient.post<CouponOut>("/admin/coupons", payload);
    return res.data;
}

export async function updateCoupon(id: string, payload: CouponUpdate): Promise<CouponOut> {
    const res = await apiClient.patch<CouponOut>(`/admin/coupons/${id}`, payload);
    return res.data;
}

export async function deleteCoupon(id: string): Promise<void> {
    await apiClient.delete(`/admin/coupons/${id}`);
}

export async function getCouponUsages(id: string): Promise<CouponUsageOut[]> {
    const res = await apiClient.get<CouponUsageOut[]>(`/admin/coupons/${id}/usages`);
    return res.data;
}

export async function validateCoupon(payload: CouponValidateRequest): Promise<CouponValidateResponse> {
    const res = await apiClient.post<CouponValidateResponse>("/admin/coupons/validate", payload);
    return res.data;
}
