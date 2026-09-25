import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export type MailLogStatus = "sent" | "failed" | "skipped";

export interface MailLogItem {
    id: string;
    client_id: string | null;
    event_key: string;
    recipient_email: string;
    recipient_name: string | null;
    subject: string;
    status: MailLogStatus;
    transport: string;
    config_source: string;
    error_message: string | null;
    metadata_json: Record<string, unknown> | null;
    created_at: string;
}

export interface MailLogListResponse {
    items: MailLogItem[];
    total: number;
    page: number;
    page_size: number;
    counts: {
        all: number;
        sent: number;
        failed: number;
        skipped: number;
    };
}

export async function listSuperadminMailLogs(params?: {
    page?: number;
    page_size?: number;
    status?: MailLogStatus;
    event_key?: string;
    search?: string;
}): Promise<MailLogListResponse> {
    const res = await apiClient.get<MailLogListResponse>(ENDPOINTS.superadmin.mailLogs, { params });
    return res.data;
}
