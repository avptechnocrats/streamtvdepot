/**
 * Payment Gateway Settings API Service
 *
 * GET /admin/payment-gateways  – load current gateway config (secrets masked)
 * PUT /admin/payment-gateways  – persist gateway config
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayPalSettingsOut {
    enabled: boolean;
    mode: "sandbox" | "live";
    is_default: boolean;
    client_id: string | null;
    client_secret_set: boolean;
    sandbox: { client_id: string | null; client_secret_set: boolean };
    live: { client_id: string | null; client_secret_set: boolean };
}

export interface StripeSettingsOut {
    enabled: boolean;
    mode: "test" | "live";
    is_default: boolean;
    publishable_key: string | null;
    secret_key_set: boolean;
    webhook_secret_set: boolean;
    test: { publishable_key: string | null; secret_key_set: boolean; webhook_secret_set: boolean };
    live: { publishable_key: string | null; secret_key_set: boolean; webhook_secret_set: boolean };
}

export interface RazorpaySettingsOut {
    enabled: boolean;
    mode: "test" | "live";
    is_default: boolean;
    key_id: string | null;
    key_secret_set: boolean;
    webhook_secret_set: boolean;
    test: { key_id: string | null; key_secret_set: boolean; webhook_secret_set: boolean };
    live: { key_id: string | null; key_secret_set: boolean; webhook_secret_set: boolean };
}

export interface CashfreeSettingsOut {
    enabled: boolean;
    mode: "test" | "live";
    is_default: boolean;
    app_id: string | null;
    app_secret_set: boolean;
    test: { app_id: string | null; app_secret_set: boolean };
    live: { app_id: string | null; app_secret_set: boolean };
}

export interface PaymentGatewaysOut {
    default_gateway: "cashfree" | "razorpay" | "stripe" | "paypal" | null;
    paypal: PayPalSettingsOut;
    stripe: StripeSettingsOut;
    razorpay: RazorpaySettingsOut;
    cashfree: CashfreeSettingsOut;
}

export interface PayPalSettingsIn {
    enabled?: boolean;
    mode?: "sandbox" | "live";
    is_default?: boolean;
    client_id?: string | null;
    client_secret?: string | null;
    sandbox?: { client_id?: string | null; client_secret?: string | null };
    live?: { client_id?: string | null; client_secret?: string | null };
}

export interface StripeSettingsIn {
    enabled?: boolean;
    mode?: "test" | "live";
    is_default?: boolean;
    publishable_key?: string | null;
    secret_key?: string | null;
    webhook_secret?: string | null;
    test?: { publishable_key?: string | null; secret_key?: string | null; webhook_secret?: string | null };
    live?: { publishable_key?: string | null; secret_key?: string | null; webhook_secret?: string | null };
}

export interface RazorpaySettingsIn {
    enabled?: boolean;
    mode?: "test" | "live";
    is_default?: boolean;
    key_id?: string | null;
    key_secret?: string | null;
    webhook_secret?: string | null;
    test?: { key_id?: string | null; key_secret?: string | null; webhook_secret?: string | null };
    live?: { key_id?: string | null; key_secret?: string | null; webhook_secret?: string | null };
}

export interface CashfreeSettingsIn {
    enabled?: boolean;
    mode?: "test" | "live";
    is_default?: boolean;
    app_id?: string | null;
    app_secret?: string | null;
    test?: { app_id?: string | null; app_secret?: string | null };
    live?: { app_id?: string | null; app_secret?: string | null };
}

export interface PaymentGatewaysIn {
    default_gateway?: "cashfree" | "razorpay" | "stripe" | "paypal" | null;
    paypal?: PayPalSettingsIn;
    stripe?: StripeSettingsIn;
    razorpay?: RazorpaySettingsIn;
    cashfree?: CashfreeSettingsIn;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function fetchPaymentGateways(): Promise<PaymentGatewaysOut> {
    const res = await apiClient.get<PaymentGatewaysOut>(ENDPOINTS.admin.paymentGateways);
    return res.data;
}

export async function savePaymentGateways(payload: PaymentGatewaysIn): Promise<PaymentGatewaysOut> {
    const res = await apiClient.put<PaymentGatewaysOut>(ENDPOINTS.admin.paymentGateways, payload);
    return res.data;
}
