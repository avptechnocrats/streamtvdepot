import apiClient from "../client";

export interface ClientTax {
    id: string;
    client_id: string;
    name: string;
    tax_type: "percentage" | "flat";
    percentage: number;
    flat_amount: number | null;
    is_active: boolean;
    created_at: string;
}

export interface ClientTaxInput {
    name: string;
    tax_type: "percentage" | "flat";
    percentage?: number;
    flat_amount?: number;
}

export interface ClientTaxUpdate extends Partial<ClientTaxInput> {
    is_active?: boolean;
}

export async function listTaxes(): Promise<ClientTax[]> {
    const res = await apiClient.get<ClientTax[]>("/admin/taxes");
    return res.data;
}

export async function createTax(payload: ClientTaxInput): Promise<ClientTax> {
    const res = await apiClient.post<ClientTax>("/admin/taxes", payload);
    return res.data;
}

export async function updateTax(id: string, payload: ClientTaxUpdate): Promise<ClientTax> {
    const res = await apiClient.patch<ClientTax>(`/admin/taxes/${id}`, payload);
    return res.data;
}

export async function deleteTax(id: string): Promise<void> {
    await apiClient.delete(`/admin/taxes/${id}`);
}