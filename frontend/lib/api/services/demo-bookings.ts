import apiClient from "../client";

export type DemoBookingStatus = "unread" | "read" | "archived";
export type DemoBookingTab = "all" | DemoBookingStatus;

export interface DemoBookingReplyOut {
    id: string;
    booking_id: string;
    author_id: string;
    message: string;
    email_sent_at: string | null;
    created_at: string;
}

export interface DemoBookingSummary {
    id: string;
    full_name: string;
    work_email: string;
    company: string;
    status: DemoBookingStatus;
    created_at: string;
    updated_at: string;
}

export interface DemoBookingDetail extends DemoBookingSummary {
    role: string | null;
    country_region: string;
    phone: string;
    project_details: string;
    acknowledged_email_sent_at: string | null;
    replies: DemoBookingReplyOut[];
}

export interface DemoBookingListCounts {
    all: number;
    unread: number;
    read: number;
    archived: number;
}

export interface DemoBookingListResponse {
    items: DemoBookingSummary[];
    total: number;
    page: number;
    page_size: number;
    counts: DemoBookingListCounts;
}

export async function listDemoBookings(params?: {
    tab?: DemoBookingTab;
    page?: number;
    page_size?: number;
}): Promise<DemoBookingListResponse> {
    const res = await apiClient.get<DemoBookingListResponse>("/superadmin/demo-bookings", { params });
    return res.data;
}

export async function getDemoBooking(id: string): Promise<DemoBookingDetail> {
    const res = await apiClient.get<DemoBookingDetail>(`/superadmin/demo-bookings/${id}`);
    return res.data;
}

export async function archiveDemoBooking(id: string): Promise<DemoBookingDetail> {
    const res = await apiClient.patch<DemoBookingDetail>(`/superadmin/demo-bookings/${id}/archive`);
    return res.data;
}

export async function replyDemoBooking(id: string, message: string): Promise<DemoBookingReplyOut> {
    const res = await apiClient.post<DemoBookingReplyOut>(`/superadmin/demo-bookings/${id}/reply`, { message });
    return res.data;
}
