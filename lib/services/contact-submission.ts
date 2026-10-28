import publicApiClient from "./public-client";

export interface CreateContactSubmissionPayload {
    form_data: Record<string, string | string[]>;
}

export async function createContactSubmission(payload: CreateContactSubmissionPayload): Promise<{ id: string; message: string }> {
    const response = await publicApiClient.post<{ id: string; message: string }>("/client-contact-submissions", payload);
    return response.data;
}