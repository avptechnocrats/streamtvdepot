export interface MediaThumbs {
  video_banner: string | null;
  video_h_thumbnail: string | null;
  video_w_thumbnail: string | null;
}

export interface ContentItem {
  id: string;
  title: string;
  description?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  rating?: number | null;
  duration?: number | null;
  content_type?: string;
  access_type?: "free" | "subscription" | "pay_per_view" | "rental";
  publish_at?: string | null;
  created_at?: string;
  video_url?: string | null;
  video_display_url?: string | null;
  hls_url?: string | null;
  hls_display_url?: string | null;
  trailer_display_url?: string | null;
  trailer_hls_url?: string | null;
  drm_enabled?: boolean;
  thumbnails?: MediaThumbs;
}

export interface HomeRow {
  category_id: string;
  category_name: string;
  category_slug: string;
  content_type: string;
  items: ContentItem[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  billing_cycle: "monthly" | "yearly" | "daily" | string;
  price: number;
  currency: string;
  description?: string;
  country_pricing?: Array<{
    country: string;
    price: number;
    currency: string;
  }>;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  avatar_url?: string | null;
}

export interface SiteBranding {
  site_title: string | null;
  logo_url: string | null;
  tagline: string | null;
}

export interface WatchlistItem {
  id: string;
  video_id: string;
  added_at: string;
  title: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  access_type: string | null;
  content_type?: "video" | "live_stream" | "series";
}

export interface SubscriptionHistoryItem {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_type: "subscription" | "ppv" | "rent";
  status: string;
  started_at: string;
  expires_at: string | null;
  content_id: string | null;
  auto_renew: boolean;
}

export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "ABANDONED";

export interface TransactionItem {
  id: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  payment_method: string;
  gateway_transaction_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface ContentAccess {
  has_access: boolean;
  access_type: "subscription" | "ppv" | "rent" | null;
  expires_at: string | null;
}

export interface PlaybackProgress {
  content_id: string;
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
}

export interface SupportTicketSummary {
  id: string;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  created_at: string;
  updated_at: string;
}

export interface SupportTicketListResponse {
  items: SupportTicketSummary[];
  total: number;
  page: number;
  page_size: number;
}
