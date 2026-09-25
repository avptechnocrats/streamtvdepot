import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export interface ClientPermission {
    code: string;
    module: string;
    description: string;
}

export interface ClientRole {
    id: string;
    client_id: string;
    name: string;
    description: string | null;
    is_owner_role: boolean;
    is_system_role: boolean;
    permission_codes: string[];
    assigned_users_count: number;
}

export interface ClientRoleInput {
    name: string;
    description?: string;
    permission_codes: string[];
}

export interface ClientAdminUser {
    id: string;
    client_id: string;
    email: string;
    full_name: string;
    role: "owner" | "admin" | "editor" | "viewer";
    role_id: string | null;
    is_active: boolean;
    is_email_verified: boolean;
    created_at: string;
}

export interface ClientAdminUserInput {
    email: string;
    full_name: string;
    role_id: string;
}

export async function listRoles(): Promise<ClientRole[]> {
    const response = await apiClient.get<ClientRole[]>(ENDPOINTS.admin.roles);
    return response.data;
}

export async function listRolePermissions(): Promise<ClientPermission[]> {
    const response = await apiClient.get<ClientPermission[]>(ENDPOINTS.admin.rolePermissions);
    return response.data;
}

export async function getCurrentRolePermissions(): Promise<string[]> {
    const response = await apiClient.get<string[]>(ENDPOINTS.admin.currentRolePermissions);
    return response.data;
}

export async function createRole(data: ClientRoleInput): Promise<ClientRole> {
    const response = await apiClient.post<ClientRole>(ENDPOINTS.admin.roles, data);
    return response.data;
}

export async function updateRole(id: string, data: ClientRoleInput): Promise<ClientRole> {
    const response = await apiClient.patch<ClientRole>(ENDPOINTS.admin.role(id), data);
    return response.data;
}

export async function deleteRole(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.role(id));
}

export async function listAdminUsers(): Promise<ClientAdminUser[]> {
    const response = await apiClient.get<ClientAdminUser[]>(ENDPOINTS.admin.adminUsers);
    return response.data;
}

export async function createAdminUser(data: ClientAdminUserInput): Promise<ClientAdminUser> {
    const response = await apiClient.post<ClientAdminUser>(ENDPOINTS.admin.adminUsersCreate, data);
    return response.data;
}

export async function updateAdminUser(
    id: string,
    data: { full_name?: string; role_id?: string; is_active?: boolean },
): Promise<ClientAdminUser> {
    const response = await apiClient.patch<ClientAdminUser>(ENDPOINTS.admin.adminUser(id), data);
    return response.data;
}

export async function resendAdminUserInvitation(id: string): Promise<void> {
    await apiClient.post(ENDPOINTS.admin.adminUserResendInvitation(id));
}

export async function deleteAdminUser(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.adminUser(id));
}