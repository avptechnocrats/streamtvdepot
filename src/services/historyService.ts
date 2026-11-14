import { apiClient } from "@/api/client";
import { ContentAccess, SubscriptionHistoryItem, TransactionItem } from "@/types/models";

export async function fetchMySubscriptions(planType?: "subscription" | "ppv" | "rent"): Promise<SubscriptionHistoryItem[]> {
  const { data } = await apiClient.get<SubscriptionHistoryItem[]>("/auth/user/my-subscriptions", {
    params: planType ? { plan_type: planType } : undefined,
  });
  return data;
}

export async function fetchMyTransactions(params?: { page?: number; page_size?: number }): Promise<TransactionItem[]> {
  const { data } = await apiClient.get<TransactionItem[]>("/auth/user/my-transactions", {
    params,
  });
  return data;
}

export async function checkContentAccess(contentId: string): Promise<ContentAccess> {
  const { data } = await apiClient.get<ContentAccess>("/auth/user/my-subscriptions/access", {
    params: { content_id: contentId },
  });
  return data;
}
