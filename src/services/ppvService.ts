import { publicApiClient } from "@/api/client";

export interface PpvEvent {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  source: "rtmp" | "external";
  stream_url: string | null;
  thumbnails: {
    banner: string | null;
    portrait: string | null;
    wide: string | null;
  };
  pricing_plan_id: string | null;
  is_live: boolean;
  created_at: string;
}

export async function fetchPpvEvents(): Promise<PpvEvent[]> {
  const { data } = await publicApiClient.get<PpvEvent[]>("/ppv-events", {
    params: { page_size: 100 },
  });
  return data ?? [];
}

export async function fetchPpvEvent(id: string): Promise<PpvEvent> {
  const { data } = await publicApiClient.get<PpvEvent>(`/ppv-events/${id}`);
  return data;
}
