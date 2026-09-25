import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "ABANDONED";
export type PaymentMethod =
    | "stripe"
    | "paypal"
    | "razorpay"
    | "paytm"
    | "upi"
    | "bank_transfer"
    | "wallet"
    | "other";

export interface PaymentOut {
    id: string;
    client_id: string;
    user_id: string;
    user_name: string | null;
    user_email: string | null;
    amount: number;
    currency: string;
    status: PaymentStatus;
    payment_method: PaymentMethod;
    gateway_transaction_id: string | null;
    reference_type: string | null; // "subscription" | "ppv" | "rental"
    reference_id: string | null;
    paid_at: string | null;
    created_at: string;
}

export interface InvoiceOut {
    id: string;
    client_id: string;
    user_id: string;
    payment_id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    tax_amount: number;
    issued_at: string;
    due_at: string | null;
    pdf_url: string | null;
    created_at: string;
    user_name: string | null;
    user_email: string | null;
    user_address: string | null;
    client_name: string | null;
    client_address: string | null;
    client_logo_url: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listAdminPayments(params?: {
    page?: number;
    page_size?: number;
}): Promise<PaymentOut[]> {
    const res = await apiClient.get<PaymentOut[]>(ENDPOINTS.admin.payments, { params });
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as { items?: PaymentOut[] }).items))
        return (data as { items: PaymentOut[] }).items;
    return [];
}

export async function listAdminInvoices(params?: {
    page?: number;
    page_size?: number;
}): Promise<InvoiceOut[]> {
    const res = await apiClient.get<InvoiceOut[]>(`${ENDPOINTS.admin.payments}/invoices`, { params });
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as { items?: InvoiceOut[] }).items))
        return (data as { items: InvoiceOut[] }).items;
    return [];
}
