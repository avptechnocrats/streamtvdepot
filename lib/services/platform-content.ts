import publicApiClient from "./public-client";

export type ContactFieldType = "text" | "email" | "textarea" | "select" | "radio" | "checkbox";

export interface ContactFormField {
    id: string;
    label: string;
    type: ContactFieldType;
    required: boolean;
    placeholder: string | null;
    options: string[];
}

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQGroup {
    label: string;
    items: FAQItem[];
}

export interface PlatformContent {
    contact: { body: string | null; fields: ContactFormField[] };
    faq: { body: string | null; groups: FAQGroup[] };
}

export async function getPlatformContent(): Promise<PlatformContent> {
    const response = await publicApiClient.get<PlatformContent>("/platform-content");
    return response.data;
}