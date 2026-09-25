/**
 * Public API surface for lib/api
 *
 * Import everything your components need from "@/lib/api"
 */

export { default as apiClient, setTokens, clearTokens, TOKEN_KEYS, setClientSlug } from "./client";
export { ENDPOINTS } from "./endpoints";
export * from "./error-utils";
export * from "./services/auth";
export * from "./services/superadmin";
export * from "./services/videos";
export * from "./services/categories";
export * from "./services/audios";
export * from "./services/users";
export * from "./services/roles";
export * from "./services/subscriptions";
export * from "./services/upload";
export * from "./services/ppv-events";
export * from "./services/live-tv";
export * from "./services/series";
export * from "./services/theme-settings";
export * from "./services/admin-dashboard";
export * from "./services/site-settings";
export * from "./services/payment-gateways";
export * from "./services/public-client";
export * from "./services/epg";
export * from "./services/tickets";
export * from "./services/payments";
export * from "./services/pages";
export * from "./services/public-live-streams";
export * from "./services/menus";
export * from "./services/advertisements";
export * from "./services/demo-bookings";
export * from "./services/public-demo-bookings";
export * from "./services/contact-submissions";
export * from "./services/public-contact-submissions";
export * from "./services/billing";
export * from "./services/mail-logs";
export * from "./services/jobs";
export * from "./services/licensing";
export * from "./services/coupons";
export * from "./services/taxes";
export * from "./services/content-partners";
