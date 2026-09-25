import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";
import { UsageAlert, AlertListParams } from "../../../types/alert";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class AlertService {
  static async listAlerts(params: AlertListParams = {}): Promise<UsageAlert[]> {
    const { data } = await apiClient.get<UsageAlert[]>(ENDPOINTS.superadmin.alerts, {
      params,
    });
    return data;
  }

  static async getAlert(alertId: string): Promise<UsageAlert> {
    const { data } = await apiClient.get<UsageAlert>(ENDPOINTS.superadmin.alert(alertId));
    return data;
  }

  static async acknowledgeAlert(alertId: string, email: string): Promise<void> {
    await apiClient.patch(ENDPOINTS.superadmin.alertAcknowledge(alertId), {
      acknowledged_by: email,
    });
  }
}

export class InvoiceService {
  static downloadInvoice(
    clientId: string,
    year: number,
    month: number,
    format: "pdf" | "csv" = "pdf"
  ): void {
    const url = `${API_URL}${ENDPOINTS.superadmin.invoice(clientId)}?year=${year}&month=${month}&format=${format}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice_${year}-${month.toString().padStart(2, "0")}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  static getInvoiceUrl(
    clientId: string,
    year: number,
    month: number,
    format: "pdf" | "csv" = "pdf"
  ): string {
    return `${API_URL}${ENDPOINTS.superadmin.invoice(clientId)}?year=${year}&month=${month}&format=${format}`;
  }
}
