import { apiClient } from "@/api/client";
import { UserProfile } from "@/types/models";

export interface UserProfileUpdate {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  country?: string | null;
  billing_line1?: string | null;
  billing_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
}

export async function getMyProfile(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>("/auth/user/account");
  return data;
}

export async function updateMyProfile(payload: UserProfileUpdate): Promise<UserProfile> {
  const { data } = await apiClient.patch<UserProfile>("/auth/user/account", payload);
  return data;
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/user/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
