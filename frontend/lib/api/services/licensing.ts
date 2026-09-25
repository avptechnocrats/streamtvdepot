import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface SaasPlanOption {
    id: string;
    name: string;
    slug: string;
    sub_text: string | null;
    currency: string;
    price_monthly: number;
    price_quarterly: number | null;
    price_yearly: number | null;
    description: string | null;
    key_features: string[];
    is_trial?: boolean;
    is_current_plan?: boolean;
    can_upgrade?: boolean;
    can_downgrade?: boolean;
}

export type SaasBillingCycle = "monthly" | "quarterly" | "yearly";

export interface CurrentSaasPlan extends SaasPlanOption {
    status: string;
    started_at: string | null;
    expires_at: string | null;
    service_period_started_at: string | null;
    service_period_ends_at: string | null;
    auto_renew: boolean;
    billing_cycle: SaasBillingCycle;
    grace_period_ends_at: string | null;
    pending_downgrade_plan_id: string | null;
    pending_downgrade_plan_name: string | null;
    pending_downgrade_requested_at: string | null;
}

export interface BillingLicensingOut {
    client_id: string;
    current_plan: CurrentSaasPlan | null;
    plans?: SaasPlanOption[];
    available_gateways?: {
        stripe: boolean;
        paypal: boolean;
        razorpay: boolean;
        cashfree: boolean;
    };
}

export interface BillingUpgradeInitiateInput {
    new_plan_id: string;
    billing_cycle: SaasBillingCycle;
    gateway?: "stripe" | "paypal" | "razorpay" | "cashfree";
}

export interface BillingUpgradeInitiateOut {
    payment_required: boolean;
    billing_id: string;
    gateway?: "stripe" | "paypal" | "razorpay" | "cashfree";
    prorated_credit: number;
    prorated_charge: number;
    currency: string;
    message?: string;
    redirect_url?: string | null;
    stripe_checkout_session_id?: string | null;
    paypal_order_id?: string | null;
    razorpay_order_id?: string | null;
    razorpay_key_id?: string | null;
    cashfree_order_id?: string | null;
    cashfree_payment_session_id?: string | null;
    cashfree_mode?: "test" | "live";
}

export interface BillingUpgradeConfirmInput {
    billing_id: string;
    gateway: "stripe" | "paypal" | "razorpay" | "cashfree";
    stripe_session_id?: string;
    paypal_order_id?: string;
    paypal_payer_id?: string;
}

export interface BillingUpgradeConfirmOut {
    success: boolean;
    billing_id: string;
    transaction_id?: string;
    message: string;
}

export interface BillingPaymentHistoryItem {
    id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    payment_method: string | null;
    transaction_id: string | null;
    plan_name: string | null;
    period_start: string | null;
    period_end: string | null;
    paid_at: string | null;
    created_at: string;
    notes: string | null;
}

export interface BillingPaymentHistoryOut {
    items: BillingPaymentHistoryItem[];
    page: number;
    page_size: number;
    total: number;
}

export interface BillingDowngradeRequestOut {
    success: boolean;
    message: string;
    effective_at: string | null;
}

export interface BillingPaymentMethod {
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    is_default: boolean;
    provider: "stripe";
}

export interface BillingPaymentMethodsOut {
    payment_methods: BillingPaymentMethod[];
}

export async function fetchBillingLicensing(): Promise<BillingLicensingOut> {
    const { data } = await apiClient.get<BillingLicensingOut>(ENDPOINTS.admin.billingLicensing);
    return data;
}

export async function listBillingPaymentMethods(): Promise<BillingPaymentMethod[]> {
    const { data } = await apiClient.get<BillingPaymentMethodsOut>(ENDPOINTS.admin.billingPaymentMethods);
    return data.payment_methods;
}

export async function createBillingPaymentMethodSetup(): Promise<{
    stripe_client_secret: string;
    stripe_publishable_key: string | null;
}> {
    const { data } = await apiClient.post<{
        stripe_client_secret: string;
        stripe_publishable_key: string | null;
    }>(ENDPOINTS.admin.billingPaymentMethodSetup);
    return data;
}

export async function deleteBillingPaymentMethod(paymentMethodId: string): Promise<BillingPaymentMethodsOut> {
    const { data } = await apiClient.delete<BillingPaymentMethodsOut>(
        `${ENDPOINTS.admin.billingPaymentMethods}/${paymentMethodId}`,
    );
    return data;
}

export async function initiateBillingUpgrade(
    payload: BillingUpgradeInitiateInput,
): Promise<BillingUpgradeInitiateOut> {
    const { data } = await apiClient.post<BillingUpgradeInitiateOut>(
        ENDPOINTS.admin.billingUpgradeInitiate,
        payload,
    );
    return data;
}

export async function confirmBillingUpgrade(
    payload: BillingUpgradeConfirmInput,
): Promise<BillingUpgradeConfirmOut> {
    const { data } = await apiClient.post<BillingUpgradeConfirmOut>(
        ENDPOINTS.admin.billingUpgradeConfirm,
        payload,
    );
    return data;
}

export async function requestBillingDowngrade(
    new_plan_id: string,
): Promise<BillingDowngradeRequestOut> {
    const { data } = await apiClient.post<BillingDowngradeRequestOut>(
        ENDPOINTS.admin.billingDowngradeRequest,
        { new_plan_id },
    );
    return data;
}

export async function cancelBillingDowngrade(): Promise<{ success: boolean; message: string }> {
    const { data } = await apiClient.delete<{ success: boolean; message: string }>(
        ENDPOINTS.admin.billingDowngradeRequest,
    );
    return data;
}

export async function setAutoRenew(
    enabled: boolean,
): Promise<{ success: boolean; auto_renew: boolean; message: string }> {
    const { data } = await apiClient.put<{ success: boolean; auto_renew: boolean; message: string }>(
        ENDPOINTS.admin.billingAutoRenew,
        { enabled },
    );
    return data;
}

export async function fetchBillingPaymentHistory(params?: {
    page?: number;
    page_size?: number;
}): Promise<BillingPaymentHistoryOut> {
    const { data } = await apiClient.get<BillingPaymentHistoryOut>(
        ENDPOINTS.admin.billingPaymentHistory,
        { params },
    );
    return data;
}
