/**
 * Generalized backend-driven PDF download utility.
 *
 * Usage:
 *   await downloadPDFFromAPI("/admin/billing/payment-history/{id}/invoice.pdf", "invoice-INV123.pdf");
 *
 * The function authenticates with the stored Bearer token, receives the PDF
 * blob from the API, and triggers a direct browser download — no new tab,
 * no print dialog.
 */

import { TOKEN_KEYS } from "@/lib/api/client";

export async function downloadPDFFromAPI(
    /** Relative API path, e.g. "/admin/billing/payment-history/{id}/invoice.pdf" */
    apiPath: string,
    /** Filename shown in the browser's Save dialog, e.g. "invoice-INV123.pdf" */
    filename: string,
): Promise<void> {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const token =
        typeof window !== "undefined"
            ? localStorage.getItem(TOKEN_KEYS.access)
            : null;

    const response = await fetch(`${baseUrl}${apiPath}`, {
        method: "GET",
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!response.ok) {
        let detail = `Failed to download PDF (HTTP ${response.status})`;
        try {
            const body = await response.json();
            if (body?.detail) detail = String(body.detail);
        } catch {
            /* ignore parse errors */
        }
        throw new Error(detail);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL after the browser has had time to start the download
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
