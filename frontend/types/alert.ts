export type AlertThresholdType = "at_risk" | "over_limit" | "critical";
export type AlertMetricType = "bandwidth" | "storage" | "encoding" | "api_calls";
export type AlertStatus = "active" | "resolved" | "acknowledged";

export interface UsageAlert {
  id: string;
  client_id: string;
  client_name: string | null;
  billing_year: number;
  billing_month: number;
  metric_type: AlertMetricType;
  threshold_type: AlertThresholdType;
  status: AlertStatus;
  current_usage: number;
  plan_limit: number | null;
  usage_percentage: number;
  notified_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AlertListParams {
  client_id?: string;
  status?: AlertStatus;
  page?: number;
  page_size?: number;
}
