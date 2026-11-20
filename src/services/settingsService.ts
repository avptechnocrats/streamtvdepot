import { publicApiClient } from "@/api/client";
import { SiteBranding } from "@/types/models";

export async function fetchSiteBranding(): Promise<SiteBranding> {
  const { data } = await publicApiClient.get<SiteBranding>("/site-settings");
  return data;
}

export async function fetchThemeSettings(): Promise<{ radius: "sharp" | "default" | "rounded"; radius_size?: number }> {
  const { data } = await publicApiClient.get<{ radius: "sharp" | "default" | "rounded"; radius_size?: number }>("/theme-settings");
  return data;
}

