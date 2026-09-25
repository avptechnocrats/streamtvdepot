import apiClient from "../client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export interface TicketAttachmentOut {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface TicketCommentAttachmentOut {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface TicketCommentOut {
    id: string;
    ticket_id: string;
    author_type: string;
    author_id: string;
    message: string;
    created_at: string;
    attachments: TicketCommentAttachmentOut[];
}

export interface SupportTicketSummary {
    id: string;
    raised_by: string;
    raised_by_name?: string | null;
    raised_by_email?: string | null;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    created_at: string;
    updated_at: string;
    attachments: TicketAttachmentOut[];
}

export interface SupportTicketOut extends SupportTicketSummary {
    client_id: string;
    description: string;
    comments: TicketCommentOut[];
}

export interface TicketListResponse {
    items: SupportTicketSummary[];
    total: number;
    page: number;
    page_size: number;
}

// Admin support ticket types (client admin → super admin)
export interface AdminTicketAttachmentOut {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface AdminTicketCommentAttachmentOut {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface AdminTicketCommentOut {
    id: string;
    ticket_id: string;
    author_type: "client_admin" | "super_admin";
    author_id: string;
    message: string;
    created_at: string;
    attachments: AdminTicketCommentAttachmentOut[];
}

export interface AdminSupportTicketSummary {
    id: string;
    client_id: string;
    client_name: string;
    raised_by: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    created_at: string;
    updated_at: string;
    attachments: AdminTicketAttachmentOut[];
}

export interface AdminSupportTicketOut extends AdminSupportTicketSummary {
    description: string;
    comments: AdminTicketCommentOut[];
}

export interface AdminTicketListResponse {
    items: AdminSupportTicketSummary[];
    total: number;
    page: number;
    page_size: number;
}

// ─── Client Admin — Tier-1 tickets (end user → admin) ─────────────────────────

export async function listEndUserTickets(params?: {
    page?: number;
    page_size?: number;
    status?: TicketStatus;
    q?: string;
}): Promise<TicketListResponse> {
    const res = await apiClient.get<TicketListResponse>("/admin/tickets", { params });
    return res.data;
}

export async function getEndUserTicket(id: string): Promise<SupportTicketOut> {
    const res = await apiClient.get<SupportTicketOut>(`/admin/tickets/${id}`);
    return res.data;
}

export async function updateEndUserTicketStatus(
    id: string,
    status: TicketStatus,
): Promise<SupportTicketOut> {
    const res = await apiClient.patch<SupportTicketOut>(`/admin/tickets/${id}/status`, { status });
    return res.data;
}

export async function addEndUserTicketComment(
    id: string,
    message: string,
): Promise<TicketCommentOut> {
    const res = await apiClient.post<TicketCommentOut>(`/admin/tickets/${id}/comments`, { message });
    return res.data;
}

// ─── Client Admin — Tier-2 support tickets (admin → super admin) ──────────────

export async function listAdminSupportTickets(params?: {
    page?: number;
    page_size?: number;
}): Promise<AdminTicketListResponse> {
    const res = await apiClient.get<AdminTicketListResponse>("/admin/support", { params });
    return res.data;
}

export async function createAdminSupportTicket(payload: {
    title: string;
    description: string;
    priority?: TicketPriority;
    files?: File[];
}): Promise<AdminSupportTicketOut> {
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("description", payload.description);
    formData.append("priority", payload.priority || "medium");
    
    if (payload.files) {
        payload.files.forEach((file) => {
            formData.append("attachments", file);
        });
    }
    
    const res = await apiClient.post<AdminSupportTicketOut>("/admin/support", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
}

export async function getAdminSupportTicket(id: string): Promise<AdminSupportTicketOut> {
    const res = await apiClient.get<AdminSupportTicketOut>(`/admin/support/${id}`);
    return res.data;
}

export async function addAdminTicketComment(
    id: string,
    message: string,
    files?: File[],
): Promise<AdminTicketCommentOut> {
    const formData = new FormData();
    formData.append("message", message);
    
    if (files) {
        files.forEach((file) => {
            formData.append("attachments", file);
        });
    }
    
    const res = await apiClient.post<AdminTicketCommentOut>(`/admin/support/${id}/comments`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
}

// ─── Super Admin — Tier-2 tickets management ──────────────────────────────────

export async function listSuperAdminTickets(params?: {
    page?: number;
    page_size?: number;
    status?: TicketStatus;
    client_id?: string;
}): Promise<AdminTicketListResponse> {
    const res = await apiClient.get<AdminTicketListResponse>("/superadmin/tickets", { params });
    return res.data;
}

export async function getSuperAdminTicket(id: string): Promise<AdminSupportTicketOut> {
    const res = await apiClient.get<AdminSupportTicketOut>(`/superadmin/tickets/${id}`);
    return res.data;
}

export async function updateSuperAdminTicketStatus(
    id: string,
    status: TicketStatus,
): Promise<AdminSupportTicketOut> {
    const res = await apiClient.patch<AdminSupportTicketOut>(`/superadmin/tickets/${id}/status`, { status });
    return res.data;
}

export async function addSuperAdminTicketComment(
    id: string,
    message: string,
): Promise<TicketCommentOut> {
    const res = await apiClient.post<TicketCommentOut>(`/superadmin/tickets/${id}/comments`, { message });
    return res.data;
}
