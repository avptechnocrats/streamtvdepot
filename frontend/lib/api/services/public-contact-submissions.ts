import apiClient from "../client";

export interface CreateContactSubmissionPayload {
    client_slug?: string;
    full_name: string;
    work_email: string;
    company?: string;
    phone?: string;
    subject?: string;
    message: string;
}

export interface CreateContactSubmissionResponse {
    id: string;
    message: string;
}

export async function createContactSubmission(
    payload: CreateContactSubmissionPayload,
): Promise<CreateContactSubmissionResponse> {
    const res = await apiClient.post<CreateContactSubmissionResponse>("/public/contact-submissions", payload);
    return res.data;
}