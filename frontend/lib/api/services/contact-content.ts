import apiClient from "../client";

export type ContactFieldType = "text" | "email" | "textarea" | "select" | "radio" | "checkbox";

export interface ContactFormField {
    id: string;
    label: string;
    type: ContactFieldType;
    required: boolean;
    placeholder: string | null;
    options: string[];
}

export interface ContactContent {
    body: string | null;
    fields: ContactFormField[];
}

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQContent {
    body: string | null;
    items: FAQItem[];
}

export interface PlatformContent {
    contact: ContactContent;
    faq: FAQContent;
}

export async function getPlatformContent(): Promise<PlatformContent> {
    const res = await apiClient.get<PlatformContent>("/admin/contact-content");
    return res.data;
}

export async function updateContactContent(data: ContactContent): Promise<ContactContent> {
    const res = await apiClient.put<ContactContent>("/admin/contact-content/contact", data);
    return res.data;
}

export async function updateFAQContent(data: FAQContent): Promise<FAQContent> {
    const res = await apiClient.put<FAQContent>("/admin/contact-content/faq", data);
    return res.data;
}