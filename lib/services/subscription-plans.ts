import publicApiClient from "./public-client";

export interface CountryPricing {
    country: string;
    price: number;
    currency: string;
}

export interface SubscriptionPlan {
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    billing_cycle: "monthly" | "yearly" | "daily" | string;
    plan_type: "subscription" | "rent" | "ppv" | string;
    trial_days: number;
    trial_requires_active_payment_method: boolean;
    applies_to_all_content: boolean;
    applies_to_scope: "content" | "category_subcategory";
    applies_to_content_ids: string[] | null;
    applies_to_category_ids: string[] | null;
    max_screens: number | null;
    max_downloads: number | null;
    can_download: boolean;
    is_active: boolean;
    sort_order: number;
    restriction_months: number | null;
    restriction_hours_per_day: number | null;
    restriction_days: number | null;
    country_pricing: CountryPricing[] | null;
    created_at: string;
}

export async function fetchSubscriptionPlans(
    planType: "subscription" | "rent" | "ppv" = "subscription",
    contentId?: string,
): Promise<SubscriptionPlan[]> {
    const { data } = await publicApiClient.get<SubscriptionPlan[]>("/subscription-plans", {
        params: { plan_type: planType, ...(contentId ? { content_id: contentId } : {}) },
    });
    return data;
}
