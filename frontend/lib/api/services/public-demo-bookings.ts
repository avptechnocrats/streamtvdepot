import apiClient from "../client";

export interface CreateDemoBookingPayload {
    full_name: string;
    work_email: string;
    company: string;
    role?: string;
    country_region: string;
    phone: string;
    project_details: string;
}

export interface CreateDemoBookingResponse {
    id: string;
    message: string;
    acknowledged_email_triggered: boolean;
}

export async function createDemoBooking(
    payload: CreateDemoBookingPayload,
): Promise<CreateDemoBookingResponse> {
    const res = await apiClient.post<CreateDemoBookingResponse>("/public/demo-bookings", payload);
    return res.data;
}
