import apiClient from "./client";

export type NotificationType =
    | "new_content"
    | "subscription_renewal"
    | "subscription_expiry"
    | "rental_expiry"
    | "payment_success"
    | "payment_failed"
    | "promotional"
    | "system";

export interface UserNotification {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    action_url: string | null;
    image_url: string | null;
    is_read: boolean;
    created_at: string;
}

export async function fetchNotifications(params?: {
    page?: number;
    page_size?: number;
    unread_only?: boolean;
}): Promise<UserNotification[]> {
    const { data } = await apiClient.get<UserNotification[]>("/auth/user/notifications", { params });
    return data;
}

export async function fetchUnreadCount(): Promise<number> {
    const { data } = await apiClient.get<{ count: number }>("/auth/user/notifications/unread-count");
    return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
    await apiClient.post(`/auth/user/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
    await apiClient.post("/auth/user/notifications/read-all");
}

export async function deleteNotification(id: string): Promise<void> {
    await apiClient.delete(`/auth/user/notifications/${id}`);
}
