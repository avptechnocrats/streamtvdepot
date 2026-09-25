import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface ContentPartner {
    id: string;
    client_id: string;
    name: string;
    legal_name: string | null;
    contact_name: string;
    contact_email: string;
    status: "pending" | "active" | "inactive";
    subscription_share_percent: number;
    rental_share_percent: number;
    ppv_share_percent: number;
    settlement_currency: string;
    created_at: string;
    account_invited: boolean;
}

export interface ContentPartnerInput {
    name: string;
    legal_name?: string;
    contact_name: string;
    contact_email: string;
    subscription_share_percent: number;
    rental_share_percent: number;
    ppv_share_percent: number;
    settlement_currency: string;
}

export async function listContentPartners(): Promise<ContentPartner[]> {
    return (await apiClient.get<ContentPartner[]>(ENDPOINTS.admin.contentPartners)).data;
}

export async function createContentPartner(payload: ContentPartnerInput): Promise<ContentPartner> {
    return (await apiClient.post<ContentPartner>(ENDPOINTS.admin.contentPartners, payload)).data;
}

export async function updateContentPartner(
    id: string,
    payload: Partial<Omit<ContentPartnerInput, "contact_email">> & { status?: "inactive" },
): Promise<ContentPartner> {
    return (await apiClient.patch<ContentPartner>(ENDPOINTS.admin.contentPartner(id), payload)).data;
}