"use client";

import React from "react";
import { BillingPaymentHistoryItem } from "@/lib/api";

interface InvoiceTemplateProps {
    invoice: BillingPaymentHistoryItem;
    platformName?: string;
}

export default function InvoiceTemplate({ invoice, platformName = "SignalView" }: InvoiceTemplateProps) {
    const formatDate = (value: string | null | undefined): string => {
        if (!value) return "-";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const formatCurrency = (amount: number, currency: string): string => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency || "USD",
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
    const statusColor = {
        paid: "#10b981",
        pending: "#f59e0b",
        failed: "#ef4444",
        refunded: "#3b82f6",
        cancelled: "#9ca3af",
    }[invoice.status] || "#6b7280";

    return (
        <div style={{ padding: "40px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#ffffff" }}>
            {/* Header */}
            <div style={{ marginBottom: "40px", borderBottom: "1px solid #e5e7eb", paddingBottom: "20px" }}>
                <div style={{ fontSize: "28px", fontWeight: "900", marginBottom: "8px" }}>
                    {platformName}
                </div>
                <div style={{ fontSize: "24px", fontWeight: "300", color: "#6b7280" }}>
                    Invoice
                </div>
            </div>

            {/* Main Content */}
            <div style={{ marginBottom: "40px" }}>
                <p style={{ margin: "0 0 24px 0", fontSize: "14px", lineHeight: "1.6", color: "#4b5563" }}>
                    Thank you for your subscription to {platformName}. We've received your payment and your subscription is active.
                    <br />
                    <br />
                    Questions? Visit our{" "}
                    <span style={{ color: "#2563eb" }}>support page</span>.
                </p>
            </div>

            {/* Invoice Details Grid */}
            <div style={{ marginBottom: "40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                {/* Left Column */}
                <div>
                    <div style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                            Invoice Number
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: "500", color: "#1f2937" }}>
                            {invoice.invoice_number}
                        </div>
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                            Date
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: "500", color: "#1f2937" }}>
                            {formatDate(invoice.paid_at || invoice.created_at)}
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                            Status
                        </div>
                        <div
                            style={{
                                fontSize: "12px",
                                fontWeight: "600",
                                color: statusColor,
                                padding: "4px 8px",
                                borderRadius: "4px",
                                display: "inline-block",
                                border: `1px solid ${statusColor}33`,
                                backgroundColor: `${statusColor}11`,
                                textTransform: "uppercase",
                            }}
                        >
                            {statusLabel}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div>
                    {invoice.transaction_id && (
                        <div style={{ marginBottom: "20px" }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                                Transaction ID
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: "500", color: "#1f2937", wordBreak: "break-all" }}>
                                {invoice.transaction_id}
                            </div>
                        </div>
                    )}

                    {invoice.payment_method && (
                        <div style={{ marginBottom: "20px" }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                                Payment Method
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: "500", color: "#1f2937", textTransform: "capitalize" }}>
                                {invoice.payment_method}
                            </div>
                        </div>
                    )}

                    {invoice.period_start && invoice.period_end && (
                        <div>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase" }}>
                                Billing Period
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: "500", color: "#1f2937" }}>
                                {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Line Items Table */}
            <div style={{ marginBottom: "40px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                            <th style={{ textAlign: "left", padding: "12px 0", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>
                                Description
                            </th>
                            <th style={{ textAlign: "right", padding: "12px 0", fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase" }}>
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "12px 0", fontSize: "14px", color: "#1f2937" }}>
                                {invoice.plan_name || "Subscription"} - {invoice.period_start && invoice.period_end ? "Monthly" : "Annual"}
                            </td>
                            <td style={{ textAlign: "right", padding: "12px 0", fontSize: "14px", fontWeight: "500", color: "#1f2937" }}>
                                {formatCurrency(invoice.amount, invoice.currency)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Total */}
            <div style={{ marginBottom: "40px", textAlign: "right" }}>
                <div style={{ display: "inline-block", minWidth: "200px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px", color: "#6b7280" }}>
                        <span>Subtotal:</span>
                        <span>{formatCurrency(invoice.amount, invoice.currency)}</span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "12px 0",
                            borderTop: "2px solid #e5e7eb",
                            borderBottom: "2px solid #e5e7eb",
                            fontSize: "18px",
                            fontWeight: "700",
                            color: "#1f2937",
                            marginBottom: "12px",
                        }}
                    >
                        <span>Total:</span>
                        <span>{formatCurrency(invoice.amount, invoice.currency)}</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "24px", fontSize: "12px", color: "#6b7280" }}>
                <div style={{ fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>SignalView</div>
                <p style={{ margin: "0 0 4px 0" }}>White-Label OTT Platform</p>
                <p style={{ margin: "0" }}>Thank you for your business!</p>
            </div>

            {/* Print Styles */}
            <style>{`
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .invoice-container {
                        margin: 0;
                        padding: 0;
                    }
                }
            `}</style>
        </div>
    );
}
