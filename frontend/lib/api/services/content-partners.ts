import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface PartnerDeliveryInput {
    principal_arn: string;
    enabled: boolean;
    method: "direct" | "replication";
    metadata_format: "none" | "filmhub_csv_3";
    rights_timezone: string;
    rights_snapshot_confirmed: boolean;
    auto_publish: boolean;
    access_type: "subscription" | "free" | "pay_per_view" | "rental";
    subscription_plan_ids: string[];
}

export interface PartnerDelivery {
    id: string;
    principal_arn: string;
    bucket: string;
    region: string;
    prefix: string;
    enabled: boolean;
    status: string;
    error: string | null;
    attempts: number;
    options: Omit<PartnerDeliveryInput, "principal_arn" | "enabled">;
    last_reconciled_at: string | null;
    delivery_uri: string;
}

export interface PartnerIngest {
    id: string;
    metadata_key: string;
    version_id: string;
    source_modified_at: string;
    status: string;
    attempts: number;
    error: string | null;
    summary: { entities?: number; assets?: number; warnings?: string[]; skipped?: string; media?: { status: string; progress: number | null; error: string | null }[] };
    completed_at: string | null;
    created_at: string;
}

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
    delivery: PartnerDelivery | null;
}

export interface ContentPartnerInput {
    delivery?: PartnerDeliveryInput | null;
    invite_account?: boolean;
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

export async function getPartnerDeliveryCapabilities(): Promise<{ enabled: boolean; region: string; metadata_formats: string[] }> {
    return (await apiClient.get(`${ENDPOINTS.admin.contentPartners}/delivery-capabilities`)).data;
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

export async function listPartnerIngests(id: string, page = 1): Promise<PartnerIngest[]> {
    return (await apiClient.get<PartnerIngest[]>(`${ENDPOINTS.admin.contentPartner(id)}/ingests`, { params: { page } })).data;
}

export async function retryPartnerDelivery(id: string): Promise<ContentPartner> {
    return (await apiClient.post<ContentPartner>(`${ENDPOINTS.admin.contentPartner(id)}/delivery/retry`)).data;
}

export async function retryPartnerIngest(id: string, ingestId: string): Promise<PartnerIngest> {
    return (await apiClient.post<PartnerIngest>(`${ENDPOINTS.admin.contentPartner(id)}/ingests/${ingestId}/retry`)).data;
}

export async function takedownPartnerContent(id: string, payload: { kind: string; sku: string; reason: string }): Promise<void> {
    await apiClient.post(`${ENDPOINTS.admin.contentPartner(id)}/takedown`, payload);
}