import { BillingPaymentHistoryItem } from "@/lib/api";
import { formatCurrencyAmount, resolveInvoiceCurrency } from "@/lib/currency";
import { downloadPDFFromAPI } from "@/lib/pdf-download";

export interface BillTo {
    name: string | null;
    companyName: string | null;
    address1: string | null;
    address2: string | null;
    vatId?: string | null;
}

interface ReceiptOptions {
    invoice: BillingPaymentHistoryItem;
    address?: string;
    autoTriggerPrint?: boolean;
}

interface InvoiceOptions {
    invoice: BillingPaymentHistoryItem;
    billTo?: BillTo;
    address?: string;
    autoTriggerPrint?: boolean;
}

function formatDate(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(amount: number, currency: string): string {
    return formatCurrencyAmount(amount, currency || "USD");
}

export function generateReceiptHTML(options: ReceiptOptions): string {
    const { invoice, address = "" } = options;
    const currency = resolveInvoiceCurrency(invoice);
    const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
    const statusColor = {
        paid: "#10b981",
        pending: "#f59e0b",
        failed: "#ef4444",
        refunded: "#3b82f6",
        cancelled: "#9ca3af",
    }[invoice.status] || "#6b7280";

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Receipt ${invoice.invoice_number}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    background: #ffffff;
                    padding: 40px;
                    line-height: 1.6;
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .header {
                    margin-bottom: 40px;
                    border-bottom: 1px solid #e5e7eb;
                    padding-bottom: 20px;
                    text-align: center;
                }
                .logo {
                    max-width: 150px;
                    height: auto;
                    margin: 0 auto;
                }
                .intro {
                    margin-bottom: 40px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #4b5563;
                }
                .details-grid {
                    margin-bottom: 40px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                }
                .detail-item {
                    margin-bottom: 20px;
                }
                .detail-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: #6b7280;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }
                .detail-value {
                    font-size: 14px;
                    font-weight: 500;
                    color: #1f2937;
                    word-break: break-all;
                }
                .status-badge {
                    font-size: 12px;
                    font-weight: 600;
                    color: ${statusColor};
                    padding: 4px 8px;
                    border-radius: 4px;
                    display: inline-block;
                    border: 1px solid ${statusColor}33;
                    background-color: ${statusColor}11;
                    text-transform: uppercase;
                }
                .line-items {
                    margin-bottom: 40px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                thead tr {
                    border-bottom: 2px solid #e5e7eb;
                }
                th {
                    text-align: left;
                    padding: 12px 0;
                    font-size: 12px;
                    font-weight: 600;
                    color: #6b7280;
                    text-transform: uppercase;
                }
                th.text-right {
                    text-align: right;
                }
                tbody tr {
                    border-bottom: 1px solid #e5e7eb;
                }
                td {
                    padding: 12px 0;
                    font-size: 14px;
                    color: #1f2937;
                }
                td.text-right {
                    text-align: right;
                    font-weight: 500;
                }
                .totals {
                    margin-bottom: 40px;
                    text-align: right;
                }
                .totals-box {
                    display: inline-block;
                    min-width: 200px;
                }
                .subtotal-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 14px;
                    color: #6b7280;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 0;
                    border-top: 2px solid #e5e7eb;
                    border-bottom: 2px solid #e5e7eb;
                    font-size: 18px;
                    font-weight: 700;
                    color: #1f2937;
                    margin-bottom: 12px;
                }
                .footer {
                    margin-top: auto;
                    border-top: 1px solid #e5e7eb;
                    padding-top: 24px;
                    font-size: 12px;
                    color: #6b7280;
                    text-align: center;
                    line-height: 1.6;
                }
                .footer-text {
                    margin: 0;
                    white-space: pre-line;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                        min-height: 100vh;
                    }
                    .container {
                        padding: 40px;
                        max-width: 100%;
                        margin: 0;
                        min-height: 100vh;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="/logo_light.png" alt="Logo" class="logo" />
                </div>

                <p class="intro">
                    We received payment for your subscription. Thank you for your business!<br><br>
                    Questions? Visit our support page.
                </p>

                <div class="details-grid">
                    <div>
                        <div class="detail-item">
                            <div class="detail-label">Invoice Number</div>
                            <div class="detail-value">${invoice.invoice_number}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Date</div>
                            <div class="detail-value">${formatDate(invoice.paid_at || invoice.created_at)}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="status-badge">${statusLabel}</div>
                        </div>
                    </div>
                    <div>
                        ${invoice.transaction_id ? `
                            <div class="detail-item">
                                <div class="detail-label">Transaction ID</div>
                                <div class="detail-value">${invoice.transaction_id}</div>
                            </div>
                        ` : ""}
                        ${invoice.payment_method ? `
                            <div class="detail-item">
                                <div class="detail-label">Payment Method</div>
                                <div class="detail-value">${invoice.payment_method.charAt(0).toUpperCase() + invoice.payment_method.slice(1)}</div>
                            </div>
                        ` : ""}
                        ${invoice.period_start && invoice.period_end ? `
                            <div class="detail-item">
                                <div class="detail-label">Billing Period</div>
                                <div class="detail-value">${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}</div>
                            </div>
                        ` : ""}
                    </div>
                </div>

                <div class="line-items">
                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${invoice.plan_name || "Subscription"} - ${invoice.period_start && invoice.period_end ? "Monthly" : "Annual"}</td>
                                <td class="text-right">${formatCurrency(invoice.amount, currency)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="totals">
                    <div class="totals-box">
                        <div class="subtotal-row">
                            <span>Subtotal:</span>
                            <span>${formatCurrency(invoice.amount, currency)}</span>
                        </div>
                        <div class="total-row">
                            <span>Total:</span>
                            <span>${formatCurrency(invoice.amount, currency)}</span>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    ${address ? `<p class="footer-text">${address}</p>` : ""}
                    <p class="footer-text">Thank you for your business!</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

export function generateInvoiceHTML(options: InvoiceOptions): string {
    const { invoice, billTo, address = "" } = options;
    const currency = resolveInvoiceCurrency(invoice);
    const invoiceDate = formatDateShort(invoice.created_at);
    const dueDate = formatDateShort(invoice.created_at);

    const billToLines: string[] = [];
    if (billTo?.name) billToLines.push(`<strong>${billTo.name}</strong>`);
    if (billTo?.companyName) billToLines.push(billTo.companyName);
    if (billTo?.address1) billToLines.push(billTo.address1);
    if (billTo?.address2) billToLines.push(billTo.address2);
    const billToHTML = billToLines.length > 0
        ? billToLines.join("<br>") + (billTo?.vatId ? `<br><span style="color:#6b7280">VAT ID: ${billTo.vatId}</span>` : "")
        : "<span style='color:#9ca3af'>—</span>";

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Invoice ${invoice.invoice_number}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    background: #ffffff;
                    padding: 40px;
                    line-height: 1.6;
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .doc-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 24px;
                }
                .doc-logo { max-width: 130px; height: auto; }
                .doc-title {
                    font-size: 32px;
                    font-weight: 800;
                    color: #1f2937;
                    letter-spacing: -0.5px;
                }
                .bill-meta {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 32px;
                    margin-bottom: 40px;
                }
                .section-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: #9ca3af;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 10px;
                }
                .bill-to-content { font-size: 14px; color: #1f2937; line-height: 1.75; }
                .meta-table { width: 100%; border-collapse: collapse; }
                .meta-table tr td { padding: 5px 0; font-size: 13px; vertical-align: top; }
                .meta-table tr td:first-child { color: #6b7280; width: 45%; padding-right: 12px; }
                .meta-table tr td:last-child { color: #1f2937; font-weight: 500; }
                .line-items { margin-bottom: 32px; }
                table.items { width: 100%; border-collapse: collapse; }
                table.items thead tr { border-bottom: 2px solid #e5e7eb; }
                table.items th {
                    text-align: left;
                    padding: 10px 0;
                    font-size: 11px;
                    font-weight: 700;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                table.items th.text-right { text-align: right; }
                table.items tbody tr { border-bottom: 1px solid #f3f4f6; }
                table.items td { padding: 12px 0; font-size: 14px; color: #1f2937; }
                table.items td.text-right { text-align: right; font-weight: 500; }
                .totals { margin-bottom: 40px; display: flex; justify-content: flex-end; }
                .totals-box { min-width: 220px; }
                .subtotal-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 6px;
                    font-size: 13px;
                    color: #6b7280;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 0;
                    border-top: 2px solid #1f2937;
                    border-bottom: 2px solid #1f2937;
                    font-size: 18px;
                    font-weight: 800;
                    color: #1f2937;
                    margin-top: 6px;
                }
                .footer {
                    margin-top: auto;
                    border-top: 1px solid #e5e7eb;
                    padding-top: 20px;
                    font-size: 12px;
                    color: #9ca3af;
                    text-align: center;
                    line-height: 1.6;
                }
                .footer-text { margin: 0; white-space: pre-line; }
                @media print {
                    body { margin: 0; padding: 0; background: white; min-height: 100vh; }
                    .container { padding: 40px; max-width: 100%; margin: 0; min-height: 100vh; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="doc-header">
                    <img src="/logo_light.png" alt="Logo" class="doc-logo" />
                    <div class="doc-title">INVOICE</div>
                </div>

                <div class="bill-meta">
                    <div>
                        <div class="section-label">Bill To</div>
                        <div class="bill-to-content">${billToHTML}</div>
                    </div>
                    <div>
                        <table class="meta-table">
                            <tr><td>Invoice #</td><td>${invoice.invoice_number}</td></tr>
                            <tr><td>Invoice Date</td><td>${invoiceDate}</td></tr>
                            <tr><td>Terms</td><td>Due Upon Receipt</td></tr>
                            <tr><td>Due Date</td><td>${dueDate}</td></tr>
                            <tr><td>Currency</td><td>${currency}</td></tr>
                        </table>
                    </div>
                </div>

                <div class="line-items">
                    <table class="items">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    ${invoice.plan_name || "Subscription Plan"}
                                    ${invoice.period_start && invoice.period_end
                                        ? ` <span style="color:#6b7280;font-size:12px">(${formatDateShort(invoice.period_start)} – ${formatDateShort(invoice.period_end)})</span>`
                                        : ""}
                                </td>
                                <td class="text-right">${formatCurrency(invoice.amount, currency)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="totals">
                    <div class="totals-box">
                        <div class="subtotal-row">
                            <span>Subtotal</span>
                            <span>${formatCurrency(invoice.amount, currency)}</span>
                        </div>
                        <div class="total-row">
                            <span>Total Due</span>
                            <span>${formatCurrency(invoice.amount, currency)}</span>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    ${address ? `<p class="footer-text">${address}</p>` : ""}
                    <p class="footer-text">Thank you for your business!</p>
                </div>
            </div>
        </body>
        </html>
    `;
}


// ─── Download functions — backend-generated PDFs ─────────────────────────────

/**
 * Download a formal Invoice PDF from the backend.
 * The PDF is generated server-side (reportlab) and streamed as application/pdf.
 * No new tab or print dialog — file lands directly in the browser's Downloads folder.
 */
export async function downloadInvoicePDF(
    invoice: BillingPaymentHistoryItem,
    _billTo?: BillTo,   // kept for signature compat; BILL TO is built server-side
    _address?: string,  // kept for signature compat; footer is built server-side
): Promise<void> {
    await downloadPDFFromAPI(
        `/admin/billing/payment-history/${invoice.id}/invoice.pdf`,
        `invoice-${invoice.invoice_number}.pdf`,
    );
}

/**
 * Download a Receipt PDF from the backend (only available for paid invoices).
 */
export async function downloadReceiptPDF(
    invoice: BillingPaymentHistoryItem,
    _address?: string,  // kept for signature compat; footer is built server-side
): Promise<void> {
    await downloadPDFFromAPI(
        `/admin/billing/payment-history/${invoice.id}/receipt.pdf`,
        `receipt-${invoice.invoice_number}.pdf`,
    );
}

// ─── View functions (open in new tab for reading) ─────────────────────────────

export function viewInvoice(
    invoice: BillingPaymentHistoryItem,
    billTo?: BillTo,
    address?: string,
): void {
    const win = window.open("", "_blank");
    if (!win) {
        alert("Please allow pop-ups to view invoices");
        return;
    }
    win.document.write(generateInvoiceHTML({ invoice, billTo, address }));
    win.document.close();
}

export function viewReceipt(
    invoice: BillingPaymentHistoryItem,
    address?: string,
): void {
    const win = window.open("", "_blank");
    if (!win) {
        alert("Please allow pop-ups to view receipts");
        return;
    }
    win.document.write(generateReceiptHTML({ invoice, address, autoTriggerPrint: false }));
    win.document.close();
}
