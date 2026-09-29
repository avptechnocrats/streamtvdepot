/**
 * Checkout service
 *
 * - fetchGatewayConfig  — public, returns enabled gateways + Stripe publishable key
 * - initiateCheckout    — authenticated, creates a Payment and returns gateway details
 * - confirmCheckout     — authenticated, verifies payment and activates subscription
 */

import apiClient from "./client";
import publicApiClient from "./public-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GatewayConfig {
    stripe_enabled: boolean;
    paypal_enabled: boolean;
    razorpay_enabled: boolean;
    cashfree_enabled: boolean;
    default_gateway: "stripe" | "paypal" | "razorpay" | "cashfree" | null;
    stripe_publishable_key: string | null;
    razorpay_key_id: string | null;
    cashfree_mode: string | null;
}

export interface CheckoutInitiatePayload {
    plan_id: string;
    gateway?: "stripe" | "paypal" | "razorpay" | "cashfree";
    payment_method_id?: string;
    content_id?: string;
    coupon_code?: string;
    country?: string | null;  // User's country for localized pricing
    skip_trial?: boolean;     // Force the normal paid flow, bypassing an available trial
}

export interface CheckoutInitiateResult {
    payment_id: string;
    gateway: "stripe" | "paypal" | "razorpay" | "cashfree" | "free";
    amount?: number | null;
    currency?: string | null;
    // Coupon details
    coupon_applied?: boolean;
    original_amount?: number | null;
    discount_amount?: number | null;
    // Gateway-specific fields
    stripe_client_secret?: string | null;
    paypal_order_id?: string | null;
    paypal_approval_url?: string | null;
    razorpay_order_id?: string | null;
    razorpay_key_id?: string | null;
    cashfree_order_id?: string | null;
    cashfree_payment_session_id?: string | null;
    cashfree_mode?: string | null;
    subscription_id?: string | null;
    invoice_number?: string | null;
}

export interface CheckoutTaxLine {
    name: string;
    tax_type: "percentage" | "flat";
    percentage?: number | null;
    flat_amount?: number | null;
    amount: number;
}

export interface CheckoutTaxQuote {
    subtotal: number;
    tax_amount: number;
    total: number;
    currency: string;
    tax_lines: CheckoutTaxLine[];
}

export interface UpgradeInitiatePayload {
    new_plan_id: string;
    gateway?: "stripe" | "paypal" | "razorpay" | "cashfree";
    payment_method_id?: string;
    country?: string | null;  // ISO 3166-1 alpha-2 code for localized pricing
}

export interface UpgradeInitiateResult {
    payment_required: boolean;
    subscription_id?: string | null;
    payment_id?: string | null;
    gateway?: "stripe" | "paypal" | "razorpay" | "cashfree" | null;
    prorated_charge?: number | null;
    currency?: string | null;
    stripe_client_secret?: string | null;
    paypal_order_id?: string | null;
    paypal_approval_url?: string | null;
    razorpay_order_id?: string | null;
    razorpay_key_id?: string | null;
    cashfree_order_id?: string | null;
    cashfree_payment_session_id?: string | null;
    cashfree_mode?: string | null;
}

export interface ScheduleDowngradeResult {
    subscription_id: string;
    starts_at: string;
    expires_at?: string | null;
}

export interface CheckoutConfirmPayload {
    payment_id: string;
    stripe_payment_intent_id?: string;
    paypal_order_id?: string;
    paypal_payer_id?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    cashfree_order_id?: string;
}

export interface CheckoutConfirmResult {
    success: boolean;
    subscription_id: string;
    invoice_number: string;
}

export interface UserPurchase {
    id: string;
    plan_id: string;
    plan_name: string;
    plan_type: "subscription" | "ppv" | "rent";
    status: string;
    started_at: string;
    expires_at: string | null;
    content_id: string | null;
    auto_renew: boolean;
    content_title: string | null;
    content_type: string | null;
    content_thumbnail_url: string | null;
    content_detail_url: string | null;
    amount: number | null;
    currency: string | null;
}

export interface ContentAccess {
    has_access: boolean;
    access_type: "subscription" | "ppv" | "rent" | null;
    expires_at: string | null;
}

export interface CouponValidateRequest {
    coupon_code: string;
    plan_id: string;
    amount: number;
}

export interface CouponValidateResponse {
    valid: boolean;
    message: string;
    discount_amount?: number;
    final_amount?: number;
    discount_percentage?: number;
}

export interface PaymentMethodSetupResult {
    gateway: "stripe";
    stripe_client_secret: string | null;
    stripe_publishable_key: string | null;
}

export interface PaymentMethodStatusResult {
    has_payment_method: boolean;
    gateway: "stripe" | "paypal" | null;
}

export interface SavedPaymentMethod {
    id: string;
    gateway: "stripe" | "paypal";
    type: "card" | "paypal";
    brand: string | null;
    last4: string | null;
    exp_month: number | null;
    exp_year: number | null;
    is_default: boolean;
}

export interface SavedPaymentMethodsResult {
    payment_methods: SavedPaymentMethod[];
    paypal_connected: boolean;
}

// ── Functions ─────────────────────────────────────────────────────────────────

export async function fetchGatewayConfig(): Promise<GatewayConfig> {
    const { data } = await publicApiClient.get<GatewayConfig>("/checkout-config");
    return data;
}

export async function initiateCheckout(
    payload: CheckoutInitiatePayload,
): Promise<CheckoutInitiateResult> {
    const { data } = await apiClient.post<CheckoutInitiateResult>(
        "/auth/user/checkout/initiate",
        payload,
    );
    return data;
}

export async function fetchCheckoutTaxQuote(payload: {
    plan_id: string;
    coupon_code?: string;
}): Promise<CheckoutTaxQuote> {
    const { data } = await apiClient.post<CheckoutTaxQuote>(
        "/auth/user/checkout/tax-quote",
        payload,
    );
    return data;
}

export async function initiateUpgrade(
    payload: UpgradeInitiatePayload,
): Promise<UpgradeInitiateResult> {
    const { data } = await apiClient.post<UpgradeInitiateResult>(
        "/auth/user/checkout/upgrade/initiate",
        payload,
    );
    return data;
}

export async function scheduleDowngrade(newPlanId: string): Promise<ScheduleDowngradeResult> {
    const { data } = await apiClient.post<ScheduleDowngradeResult>(
        "/auth/user/checkout/schedule-downgrade",
        { new_plan_id: newPlanId },
    );
    return data;
}

export async function confirmCheckout(
    payload: CheckoutConfirmPayload,
): Promise<CheckoutConfirmResult> {
    const { data } = await apiClient.post<CheckoutConfirmResult>(
        "/auth/user/checkout/confirm",
        payload,
    );
    return data;
}

export async function validateCoupon(
    payload: CouponValidateRequest,
): Promise<CouponValidateResponse> {
    const { data } = await apiClient.post<CouponValidateResponse>(
        "/auth/user/checkout/validate-coupon",
        payload,
    );
    return data;
}

export async function createPaymentMethodSetupIntent(): Promise<PaymentMethodSetupResult> {
    const { data } = await apiClient.post<PaymentMethodSetupResult>(
        "/auth/user/checkout/payment-method/setup-intent",
    );
    return data;
}

export async function getPaymentMethodStatus(): Promise<PaymentMethodStatusResult> {
    const { data } = await apiClient.get<PaymentMethodStatusResult>(
        "/auth/user/checkout/payment-method/status",
    );
    return data;
}

export async function fetchSavedPaymentMethods(): Promise<SavedPaymentMethodsResult> {
    const { data } = await apiClient.get<SavedPaymentMethodsResult>(
        "/auth/user/checkout/payment-methods",
    );
    return data;
}

export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<SavedPaymentMethodsResult> {
    const { data } = await apiClient.post<SavedPaymentMethodsResult>(
        `/auth/user/checkout/payment-methods/${paymentMethodId}/default`,
    );
    return data;
}

export async function removeSavedPaymentMethod(paymentMethodId: string): Promise<SavedPaymentMethodsResult> {
    const { data } = await apiClient.delete<SavedPaymentMethodsResult>(
        `/auth/user/checkout/payment-methods/${paymentMethodId}`,
    );
    return data;
}

export async function fetchMySubscriptions(
    planType?: "subscription" | "ppv" | "rent",
    params?: { page?: number; page_size?: number },
): Promise<UserPurchase[]> {
    const { data } = await apiClient.get<UserPurchase[]>("/auth/user/my-subscriptions", {
        params: { ...(planType ? { plan_type: planType } : {}), ...params },
    });
    return data;
}

export async function fetchSubscriptionHistory(limit = 5): Promise<UserPurchase[]> {
    const { data } = await apiClient.get<UserPurchase[]>("/auth/user/my-subscriptions/history", {
        params: { limit },
    });
    return data;
}

export async function checkContentAccess(contentId: string): Promise<ContentAccess> {
    const { data } = await apiClient.get<ContentAccess>(
        "/auth/user/my-subscriptions/access",
        { params: { content_id: contentId } },
    );
    return data;
}

// ── User transactions ─────────────────────────────────────────────────────────

export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "ABANDONED";
export type TransactionMethod =
    | "stripe" | "paypal" | "razorpay" | "paytm"
    | "upi" | "bank_transfer" | "wallet" | "other";

export interface UserTransaction {
    id: string;
    amount: number;
    currency: string;
    status: TransactionStatus;
    payment_method: TransactionMethod;
    gateway_transaction_id: string | null;
    reference_type: string | null; // "subscription" | "ppv" | "rental"
    reference_id: string | null;
    invoice_number: string | null;
    paid_at: string | null;
    created_at: string;
}

export interface UserTransactionReceipt {
    payment_id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    payment_method: string;
    transaction_id: string | null;
    reference_type: string | null;
    plan_name: string | null;
    plan_amount: number | null;
    discount_amount: number | null;
    tax_amount: number;
    paid_at: string | null;
    created_at: string;
    tenant_name: string;
    tenant_logo_url: string | null;
}

export async function fetchMyTransactions(params?: {
    page?: number;
    page_size?: number;
    status?: TransactionStatus;
}): Promise<UserTransaction[]> {
    const { data } = await apiClient.get<UserTransaction[]>(
        "/auth/user/my-transactions",
        { params },
    );
    return data;
}

export async function fetchTransactionReceiptPdf(
    paymentId: string,
    download = false,
): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(
        `/auth/user/my-transactions/${paymentId}/receipt.pdf`,
        {
            params: { download },
            responseType: "blob",
        },
    );
    return data;
}

export async function fetchTransactionReceipt(
    paymentId: string,
): Promise<UserTransactionReceipt> {
    const { data } = await apiClient.get<UserTransactionReceipt>(
        `/auth/user/my-transactions/${paymentId}/receipt`,
    );
    return data;
}
