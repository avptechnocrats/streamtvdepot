import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface AdminDashboardChartPoint {
    month: string;
    value: number;
}

export interface AdminDashboardAnalyticsOut {
    months: Array<{
        year: number;
        month: number;
        key: string;
        label: string;
    }>;
    widgets: {
        plans: number;
        users: number;
        live_tv: number;
        themes: number;
        tickets: number;
    };
    charts: {
        users: AdminDashboardChartPoint[];
        videos: AdminDashboardChartPoint[];
        transactions: AdminDashboardChartPoint[];
    };
}

export interface AdminReportsOut {
    months: Array<{ year: number; month: number; key: string; label: string }>;
    revenue_by_currency: Array<{ currency: string; amount: number }>;
    payment_statuses: Record<string, number>;
    subscription_statuses: Record<string, number>;
    ticket_statuses: Record<string, number>;
    summary: {
        total_users: number;
        active_subscriptions: number;
        auto_renewing_subscriptions: number;
        total_videos: number;
        total_audios: number;
        total_series: number;
        total_live_channels: number;
        total_ppv_events: number;
        open_tickets: number;
        high_priority_tickets: number;
    };
    charts: {
        revenue: AdminDashboardChartPoint[];
        new_users: AdminDashboardChartPoint[];
        subscriptions_started: AdminDashboardChartPoint[];
    };
}

export async function fetchAdminDashboardAnalytics(months = 6): Promise<AdminDashboardAnalyticsOut> {
    const { data } = await apiClient.get<AdminDashboardAnalyticsOut>(ENDPOINTS.admin.dashboardAnalytics, {
        params: { months },
    });
    return data;
}

export async function fetchAdminReports(months = 6): Promise<AdminReportsOut> {
    const { data } = await apiClient.get<AdminReportsOut>(ENDPOINTS.admin.reports, {
        params: { months },
    });
    return data;
}