import { publicApiClient, apiClient } from "@/api/client";
import { SubscriptionPlan } from "@/types/models";

export type CheckoutGateway = "stripe" | "paypal" | "razorpay" | "cashfree";

export interface CheckoutResult {
  payment_id?: string;
  gateway?: CheckoutGateway | "free";
  checkout_url?: string | null;
  paypal_approval_url?: string | null;
  amount?: number | null;
  currency?: string | null;
  subscription_id?: string | null;
  invoice_number?: string | null;
}

// Public — no auth needed, slug auto-injected by publicApiClient
export async function fetchSubscriptionPlans(planType: "subscription" | "ppv" | "rent" = "subscription"): Promise<SubscriptionPlan[]> {
  const { data } = await publicApiClient.get<SubscriptionPlan[]>("/subscription-plans", {
    params: { plan_type: planType },
  });
  return data ?? [];
}

// Authenticated — initiates a checkout session
export async function beginCheckout(
  planId: string,
  options?: { contentId?: string; purchaseType?: "rent" | "ppv"; gateway?: CheckoutGateway; country?: string | null },
): Promise<CheckoutResult> {
  const { data } = await apiClient.post<CheckoutResult>("/auth/user/checkout/initiate", {
    plan_id: planId,
    gateway: options?.gateway ?? "stripe",
    ...(options?.purchaseType ? { plan_type: options.purchaseType } : {}),
    ...(options?.contentId ? { content_id: options.contentId } : {}),
    ...(options?.country ? { country: options.country } : {}),
  });
  return data;
}
