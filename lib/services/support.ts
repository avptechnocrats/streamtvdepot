/**
 * Support ticket service — calls the Next.js route handlers under /api/tickets/*.
 * These routes proxy to the backend end-user ticket endpoints.
 */

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";
export type TicketAuthorType = "end_user" | "client_admin";

export interface TicketAttachment {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface TicketCommentAttachment {
    id: string;
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

export interface TicketComment {
    id: string;
    ticket_id: string;
    author_type: TicketAuthorType;
    author_id: string;
    message: string;
    created_at: string;
    attachments: TicketCommentAttachment[];
}

export interface SupportTicket {
    id: string;
    client_id: string;
    raised_by: string;
    title: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    created_at: string;
    updated_at: string;
    attachments: TicketAttachment[];
    comments: TicketComment[];
}

export interface SupportTicketSummary {
    id: string;
    title: string;
    status: TicketStatus;
    priority: TicketPriority;
    created_at: string;
    updated_at: string;
    attachments: TicketAttachment[];
}

export interface SupportTicketListResponse {
    items: SupportTicketSummary[];
    total: number;
    page: number;
    page_size: number;
}

export interface CreateTicketPayload {
    title: string;
    description: string;
    priority?: TicketPriority;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
        ...options,
        headers,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail ?? "Request failed");
    return data as T;
}

// ─── End-User Ticket API ─────────────────────────────────────────────────────

export async function fetchMyTickets(
    accessToken: string,
    page = 1,
): Promise<SupportTicketListResponse> {
    return apiFetch<SupportTicketListResponse>(
        `/auth/user/tickets?page=${page}`,
        {},
        accessToken,
    );
}

export async function fetchTicket(
    id: string,
    accessToken: string,
): Promise<SupportTicket> {
    return apiFetch<SupportTicket>(`/auth/user/tickets/${id}`, {}, accessToken);
}

/**
 * Creates a support ticket via the API.
 * Accepts either a CreateTicketPayload (JSON) or FormData (for file uploads).
 */
export async function createTicket(
    payload: FormData | CreateTicketPayload,
    accessToken: string,
): Promise<SupportTicket> {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    // Only set Content-Type for JSON payloads; for FormData the browser
    // automatically sets multipart/form-data with the correct boundary.
    if (!(payload instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    let body: string | FormData;
    if (payload instanceof FormData) {
        // FormData is sent as-is; the browser sets Content-Type with boundary
        body = payload;
    } else {
        body = JSON.stringify(payload);
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/user/tickets`, {
        method: "POST",
        headers,
        body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail ?? "Request failed");
    return data as SupportTicket;
}

export async function addTicketComment(
    ticketId: string,
    message: string,
    accessToken: string,
    files?: File[],
): Promise<TicketComment> {
    const formData = new FormData();
    formData.append("message", message);
    if (files && files.length > 0) {
        files.forEach((file) => formData.append("attachments", file));
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/user/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail ?? "Request failed");
    return data as TicketComment;
}
