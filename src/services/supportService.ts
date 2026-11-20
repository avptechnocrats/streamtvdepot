import { apiClient } from "@/api/client";
import { SupportTicketListResponse } from "@/types/models";

export async function fetchMyTickets(page = 1): Promise<SupportTicketListResponse> {
  const { data } = await apiClient.get<SupportTicketListResponse>("/auth/user/tickets", {
    params: { page },
  });
  return data;
}

export async function createTicket(payload: { title: string; description: string; priority?: "low" | "medium" | "high" }): Promise<void> {
  const form = new FormData();
  form.append("title", payload.title);
  form.append("description", payload.description);
  if (payload.priority) form.append("priority", payload.priority);
  await apiClient.post("/auth/user/tickets", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
