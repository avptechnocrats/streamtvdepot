import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface ContentTagOut {
    id: string;
    name: string;
}

export async function listContentTags(search = ""): Promise<ContentTagOut[]> {
    const { data } = await apiClient.get<ContentTagOut[]>(ENDPOINTS.admin.contentTags, {
        params: { search, limit: 100 },
    });
    return data;
}

export async function createContentTag(name: string): Promise<ContentTagOut> {
    const { data } = await apiClient.post<ContentTagOut>(ENDPOINTS.admin.contentTags, { name });
    return data;
}