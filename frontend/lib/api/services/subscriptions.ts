import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "active" | "expired" | "cancelled" | "paused" | "trial";

export interface AdminPlanOut {
    id: string;
    name: string;
    price_monthly: number;
    currency: string;
    is_active: boolean;
}

export interface UserSubscriptionOut {
    id: string;
    client_id: string;
    user_id: string;
    plan_id: string;
    status: SubscriptionStatus;
    started_at: string;
    expires_at: string | null;
    auto_renew: boolean;
    created_at: string;
    user_name?: string | null;
    user_email?: string | null;
    plan_name?: string | null;
    plan_price?: number | null;
    plan_currency?: string | null;
    plan_type?: PlanType | null;
}

export interface UserSubscriptionCreate {
    user_id: string;
    plan_id: string;
    started_at: string;
    expires_at?: string | null;
    auto_renew?: boolean;
}

export interface SubscriptionListResponse {
    items: UserSubscriptionOut[];
    total: number;
    page: number;
    page_size: number;
    counts: { all: number; active: number; trial: number; expired: number; cancelled: number; paused: number };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listSubscriptions(
    params?: { page?: number; page_size?: number; plan_type?: PlanType; search?: string },
): Promise<UserSubscriptionOut[]> {
    const res = await apiClient.get(ENDPOINTS.admin.subscriptionUsers, { params });
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items as UserSubscriptionOut[];
    return [];
}

/** Paginated, one-row-per-user subscription listing (used by the admin subscriptions list page). */
export async function listSubscriptionsPaged(
    params?: {
        page?: number;
        page_size?: number;
        plan_type?: PlanType;
        search?: string;
        status?: SubscriptionStatus;
    },
): Promise<SubscriptionListResponse> {
    const res = await apiClient.get<SubscriptionListResponse>(ENDPOINTS.admin.subscriptionUsers, {
        params: { ...params, latest_only: true },
    });
    return res.data;
}

export async function createSubscription(data: UserSubscriptionCreate): Promise<UserSubscriptionOut> {
    const res = await apiClient.post<UserSubscriptionOut>(ENDPOINTS.admin.subscriptionUsers, data);
    return res.data;
}

export async function listAdminPlans(): Promise<AdminPlanOut[]> {
    const res = await apiClient.get<AdminPlanOut[]>(ENDPOINTS.admin.subscriptionPlans);
    return res.data;
}

// ─── Client Pricing Plans ─────────────────────────────────────────────────────

export type BillingCycle = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "lifetime";
export type PlanType = "subscription" | "ppv" | "rent";

export interface CountryPriceOverride {
    country: string;
    price: number;
    currency: string;
}

export interface ClientPricingPlanOut {
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    billing_cycle: BillingCycle;
    plan_type: PlanType;
    trial_days: number;
    trial_requires_active_payment_method: boolean;
    applies_to_all_content: boolean;
    applies_to_scope: "content" | "category_subcategory";
    applies_to_content_ids: string[] | null;
    applies_to_category_ids: string[] | null;
    max_screens: number | null;
    max_downloads: number | null;
    can_download: boolean;
    is_active: boolean;
    sort_order: number;
    restriction_months: number | null;
    restriction_hours_per_day: number | null;
    restriction_days: number | null;
    country_pricing: CountryPriceOverride[] | null;
    created_at: string;
}

export interface ClientPricingPlanCreate {
    name: string;
    description?: string | null;
    price: number;
    currency?: string;
    billing_cycle?: BillingCycle;
    plan_type?: PlanType;
    trial_days?: number;
    trial_requires_active_payment_method?: boolean;
    applies_to_all_content?: boolean;
    applies_to_scope?: "content" | "category_subcategory";
    applies_to_content_ids?: string[] | null;
    applies_to_category_ids?: string[] | null;
    max_screens?: number | null;
    max_downloads?: number | null;
    can_download?: boolean;
    sort_order?: number;
    restriction_months?: number | null;
    restriction_hours_per_day?: number | null;
    restriction_days?: number | null;
    country_pricing?: CountryPriceOverride[] | null;
}

export interface ClientPricingPlanUpdate extends Partial<ClientPricingPlanCreate> {
    is_active?: boolean;
}

export async function listClientPlans(params?: {
    plan_type?: PlanType;
    is_active?: boolean;
}): Promise<ClientPricingPlanOut[]> {
    const res = await apiClient.get<ClientPricingPlanOut[]>(ENDPOINTS.admin.subscriptionPlans, { params });
    return res.data;
}

export async function getClientPlan(id: string): Promise<ClientPricingPlanOut> {
    const res = await apiClient.get<ClientPricingPlanOut>(ENDPOINTS.admin.subscriptionPlan(id));
    return res.data;
}

export async function createClientPlan(payload: ClientPricingPlanCreate): Promise<ClientPricingPlanOut> {
    const res = await apiClient.post<ClientPricingPlanOut>(ENDPOINTS.admin.subscriptionPlans, payload);
    return res.data;
}

export async function updateClientPlan(id: string, payload: ClientPricingPlanUpdate): Promise<ClientPricingPlanOut> {
    const res = await apiClient.patch<ClientPricingPlanOut>(ENDPOINTS.admin.subscriptionPlan(id), payload);
    return res.data;
}

export async function deleteClientPlan(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.subscriptionPlan(id));
}

export async function reorderClientPlans(items: { id: string; sort_order: number }[]): Promise<void> {
    await apiClient.post(ENDPOINTS.admin.subscriptionPlansReorder, items);
}
