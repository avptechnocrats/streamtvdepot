import apiClient from "../client";

export type ContactSubmissionStatus = "unread" | "read" | "archived";
export type ContactSubmissionTab = "all" | ContactSubmissionStatus;

export interface ContactSubmissionListCounts {
    all: number;
    unread: number;
    read: number;
    archived: number;
}

export interface ContactSubmissionSummary {
    id: string;
    full_name: string;
    work_email: string;
    company: string | null;
    subject: string | null;
    status: ContactSubmissionStatus;
    created_at: string;
    updated_at: string;
}

export interface ContactSubmissionDetail extends ContactSubmissionSummary {
    client_id: string | null;
    phone: string | null;
    message: string;
}

export interface SuperAdminContactSubmissionSummary extends ContactSubmissionSummary {
    client_id: string | null;
    client_name: string;
    client_slug: string | null;
}

export interface SuperAdminContactSubmissionDetail extends ContactSubmissionDetail {
    client_name: string;
    client_slug: string | null;
}

export interface ContactSubmissionListResponse {
    items: ContactSubmissionSummary[];
    total: number;
    page: number;
    page_size: number;
    counts: ContactSubmissionListCounts;
}

export interface SuperAdminContactSubmissionListResponse {
    items: SuperAdminContactSubmissionSummary[];
    total: number;
    page: number;
    page_size: number;
    counts: ContactSubmissionListCounts;
}

export async function listContactSubmissions(params?: {
    tab?: ContactSubmissionTab;
    page?: number;
    page_size?: number;
}): Promise<ContactSubmissionListResponse> {
    const res = await apiClient.get<ContactSubmissionListResponse>("/admin/contact-submissions", { params });
    return res.data;
}

export async function getContactSubmission(id: string): Promise<ContactSubmissionDetail> {
    const res = await apiClient.get<ContactSubmissionDetail>(`/admin/contact-submissions/${id}`);
    return res.data;
}

export async function archiveContactSubmission(id: string): Promise<ContactSubmissionDetail> {
    const res = await apiClient.patch<ContactSubmissionDetail>(`/admin/contact-submissions/${id}/archive`);
    return res.data;
}

// Superadmin functions
export async function listSuperAdminContactSubmissions(params?: {
    tab?: ContactSubmissionTab;
    page?: number;
    page_size?: number;
    client_id?: string;
    include_main_site?: boolean;
}): Promise<SuperAdminContactSubmissionListResponse> {
    const res = await apiClient.get<SuperAdminContactSubmissionListResponse>("/superadmin/contact-submissions", { params });
    return res.data;
}

export async function getSuperAdminContactSubmission(id: string): Promise<SuperAdminContactSubmissionDetail> {
    const res = await apiClient.get<SuperAdminContactSubmissionDetail>(`/superadmin/contact-submissions/${id}`);
    return res.data;
}

export async function archiveSuperAdminContactSubmission(id: string): Promise<SuperAdminContactSubmissionDetail> {
    const res = await apiClient.patch<SuperAdminContactSubmissionDetail>(`/superadmin/contact-submissions/${id}/archive`);
    return res.data;
}