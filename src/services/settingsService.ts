import { publicApiClient } from "@/api/client";
import { SiteBranding } from "@/types/models";

export async function fetchSiteBranding(): Promise<SiteBranding> {
  const { data } = await publicApiClient.get<SiteBranding>("/site-settings");
  return data;
}

