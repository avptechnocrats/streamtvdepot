/**
 * Superadmin API Service
 *
 * Covers all superadmin-scoped endpoints (clients, plans, modules, billing).
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Client types ─────────────────────────────────────────────────────────────

export type ClientStatus = "trial" | "active" | "inactive" | "suspended";

export interface ClientOut {
    id: string;
    name: string;
    slug: string;
    email: string;
    phone: string | null;
    website: string | null;
    logo_url: string | null;
    domain: string | null;
    country: string | null;
    timezone: string;
    status: ClientStatus;
    is_active: boolean;
    theme_config: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
}

export interface ClientSubscriptionOut {
    id: string;
    client_id: string;
    plan_id: string;
    status: string;
    started_at: string | null;
    expires_at: string | null;
    auto_renew: boolean;
    created_at: string;
}

export interface ListClientsParams {
    page?: number;
    page_size?: number;
    search?: string;
    tab?: "all" | "active" | "expired" | "archived";
    status?: "all" | "active" | "expired" | "archived";
}

export interface ClientTabCounts {
    active: number;
    expired: number;
    archived: number;
}

export interface SuperadminDashboardOut {
    total_clients: number;
    active_clients: number;
    trial_clients: number;
    total_revenue: number;
    pending_invoices: number;
}

export interface SuperadminDashboardChartPoint {
    month: string;
    value: number;
}

export interface SuperadminDashboardAnalyticsOut {
    months: Array<{
        year: number;
        month: number;
        key: string;
        label: string;
    }>;
    widgets: {
        plans: number;
        clients: number;
        invoices: number;
        demo_bookings: number;
        tickets: number;
    };
    charts: {
        clients: SuperadminDashboardChartPoint[];
        demo_requests: SuperadminDashboardChartPoint[];
        invoices: SuperadminDashboardChartPoint[];
    };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export interface ClientCreatePayload {
    name: string;
    slug: string;
    email: string;
    phone?: string | null;
    website?: string | null;
    domain?: string | null;
    address?: string | null;
    country?: string | null;
    timezone?: string;
}

export interface ClientUpdatePayload {
    name?: string;
    email?: string;
    phone?: string | null;
    website?: string | null;
    logo_url?: string | null;
    domain?: string | null;
    address?: string | null;
    country?: string | null;
    timezone?: string;
    status?: ClientStatus;
    is_active?: boolean;
    theme_config?: Record<string, unknown> | null;
}

export async function listClients(params: ListClientsParams = {}): Promise<ClientOut[]> {
    const { data } = await apiClient.get<ClientOut[]>(ENDPOINTS.superadmin.clients, { params });
    return data;
}

export async function getClientTabCounts(search?: string): Promise<ClientTabCounts> {
    const { data } = await apiClient.get<ClientTabCounts>(`${ENDPOINTS.superadmin.clients}/counts`, {
        params: search ? { search } : undefined,
    });
    return data;
}

export async function createClient(payload: ClientCreatePayload): Promise<ClientOut> {
    const { data } = await apiClient.post<ClientOut>(ENDPOINTS.superadmin.clients, payload);
    return data;
}

export async function getClient(clientId: string): Promise<ClientOut> {
    const { data } = await apiClient.get<ClientOut>(ENDPOINTS.superadmin.client(clientId));
    return data;
}

export async function updateClient(clientId: string, payload: ClientUpdatePayload): Promise<ClientOut> {
    const { data } = await apiClient.patch<ClientOut>(ENDPOINTS.superadmin.client(clientId), payload);
    return data;
}

export async function archiveClient(clientId: string): Promise<ClientOut> {
    const { data } = await apiClient.patch<ClientOut>(ENDPOINTS.superadmin.client(clientId), {
        status: "inactive",
        is_active: false,
    });
    return data;
}

export async function unarchiveClient(
    clientId: string,
    status: ClientStatus,
): Promise<ClientOut> {
    const { data } = await apiClient.patch<ClientOut>(ENDPOINTS.superadmin.client(clientId), {
        status,
        is_active: true,
    });
    return data;
}

export interface CreateAdminUserPayload {
    email: string;
    password: string;
    full_name: string;
}

export async function deleteClient(clientId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.superadmin.client(clientId));
}

export interface SaasBillingOut {
    id: string;
    client_id: string;
    plan_id: string | null;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    billing_period_start: string | null;
    billing_period_end: string | null;
    period_year: number | null;
    period_month: number | null;
    usage_record_id: string | null;
    plan_snapshot: Record<string, any> | null;
    usage_snapshot: Record<string, any> | null;
    subtotal: number;
    overage_total: number;
    discount_amount: number;
    tax_amount: number;
    total_due: number;
    proration_factor: number;
    active_days: number | null;
    billing_days: number | null;
    finalized_at: string | null;
    paid_at: string | null;
    payment_method: string | null;
    transaction_id: string | null;
    notes: string | null;
    created_at: string;
    client_name?: string | null;
    client_slug?: string | null;
}

export async function listClientBillingRecords(
    clientId: string,
    params?: { page?: number; page_size?: number },
): Promise<SaasBillingOut[]> {
    const { data } = await apiClient.get<SaasBillingOut[]>(
        `${ENDPOINTS.superadmin.billing}`,
        { params: { client_id: clientId, ...params } },
    );
    return data;
}

export async function createClientAdminUser(
    clientId: string,
    payload: CreateAdminUserPayload,
): Promise<{ id: string; email: string; message: string }> {
    const { data } = await apiClient.post(
        ENDPOINTS.superadmin.clientAdminUsers(clientId),
        payload,
    );
    return data;
}

export async function provisionClientDemoContent(
    clientId: string,
    force = false,
): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>(
        ENDPOINTS.superadmin.clientProvisionDemo(clientId),
        null,
        { params: force ? { force: "true" } : {} },
    );
    return data;
}

export async function getClientSubscription(clientId: string): Promise<ClientSubscriptionOut | null> {
    const { data } = await apiClient.get<ClientSubscriptionOut | null>(
        `${ENDPOINTS.superadmin.client(clientId)}/subscription`,
    );
    return data;
}

export async function fetchSuperadminDashboard(): Promise<SuperadminDashboardOut> {
    const { data } = await apiClient.get<SuperadminDashboardOut>(ENDPOINTS.superadmin.dashboard);
    return data;
}

export async function fetchSuperadminDashboardAnalytics(months = 4): Promise<SuperadminDashboardAnalyticsOut> {
    const { data } = await apiClient.get<SuperadminDashboardAnalyticsOut>(
        ENDPOINTS.superadmin.dashboardAnalytics,
        { params: { months } },
    );
    return data;
}

// ─── Plan types ───────────────────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const APP_PLATFORMS = ["android", "ios", "roku", "apple_tv", "fire_tv"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export interface PlanOut {
    id: string;
    name: string;
    sub_text: string | null;
    slug: string;
    description: string | null;
    price_monthly: number;
    price_quarterly: number | null;
    price_yearly: number | null;
    currency: Currency;
    key_features: string[] | null;
    additional_apps: Partial<Record<AppPlatform, boolean>> | null;
    additional_app_price: number | null;
    // User Limits
    max_users: number | null;
    max_admin_users: number | null;
    // Usage Limits (AWS-metered)
    max_storage_gb: number | null;
    max_streams: number | null;
    bandwidth_gb_monthly: number | null;
    encoding_minutes_monthly: number | null;
    api_calls_per_month: number | null;
    concurrent_users_peak: number | null;
    simultaneous_uploads: number;
    // Overage Pricing
    overage_bandwidth_per_gb: number | null;
    overage_storage_per_gb: number | null;
    overage_encoding_per_minute: number | null;
    overage_api_per_1m_calls: number | null;
    // Content Restrictions
    allowed_content_types: string[] | null;
    max_bitrate_mbps: number | null;
    content_retention_days: number;
    is_active: boolean;
    is_trial: boolean;
    deleted_at: string | null;
    created_at: string;
}

export interface PlanCreate {
    name: string;
    sub_text?: string;
    slug: string;
    description?: string;
    price_monthly: number;
    price_quarterly: number;
    price_yearly: number;
    currency?: Currency;
    key_features?: string[];
    additional_apps?: Partial<Record<AppPlatform, boolean>>;
    additional_app_price?: number | null;
    max_users?: number | null;
    max_admin_users?: number | null;
    max_storage_gb?: number | null;
    max_streams?: number | null;
    bandwidth_gb_monthly?: number | null;
    encoding_minutes_monthly?: number | null;
    api_calls_per_month?: number | null;
    concurrent_users_peak?: number | null;
    simultaneous_uploads?: number;
    overage_bandwidth_per_gb?: number | null;
    overage_storage_per_gb?: number | null;
    overage_encoding_per_minute?: number | null;
    overage_api_per_1m_calls?: number | null;
    allowed_content_types?: string[];
    max_bitrate_mbps?: number | null;
    content_retention_days?: number;
    is_trial?: boolean;
}

export interface PlanUpdate {
    name?: string;
    sub_text?: string | null;
    description?: string | null;
    price_monthly?: number;
    price_quarterly?: number;
    price_yearly?: number;
    currency?: Currency;
    key_features?: string[];
    additional_apps?: Partial<Record<AppPlatform, boolean>>;
    additional_app_price?: number | null;
    max_users?: number | null;
    max_admin_users?: number | null;
    max_storage_gb?: number | null;
    max_streams?: number | null;
    bandwidth_gb_monthly?: number | null;
    encoding_minutes_monthly?: number | null;
    api_calls_per_month?: number | null;
    concurrent_users_peak?: number | null;
    simultaneous_uploads?: number;
    overage_bandwidth_per_gb?: number | null;
    overage_storage_per_gb?: number | null;
    overage_encoding_per_minute?: number | null;
    overage_api_per_1m_calls?: number | null;
    allowed_content_types?: string[];
    max_bitrate_mbps?: number | null;
    content_retention_days?: number;
    is_active?: boolean;
    is_trial?: boolean;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function listPlans(): Promise<PlanOut[]> {
    const { data } = await apiClient.get<PlanOut[]>(ENDPOINTS.superadmin.plans);
    return data;
}

export async function listTrashPlans(): Promise<PlanOut[]> {
    const { data } = await apiClient.get<PlanOut[]>(ENDPOINTS.superadmin.plansTrash);
    return data;
}

export async function getPlan(id: string): Promise<PlanOut> {
    const { data } = await apiClient.get<PlanOut>(ENDPOINTS.superadmin.plan(id));
    return data;
}

export async function createPlan(payload: PlanCreate): Promise<PlanOut> {
    const { data } = await apiClient.post<PlanOut>(ENDPOINTS.superadmin.plans, payload);
    return data;
}

export async function updatePlan(id: string, payload: PlanUpdate): Promise<PlanOut> {
    const { data } = await apiClient.patch<PlanOut>(ENDPOINTS.superadmin.plan(id), payload);
    return data;
}

export async function togglePlan(id: string): Promise<PlanOut> {
    const { data } = await apiClient.patch<PlanOut>(ENDPOINTS.superadmin.planToggle(id));
    return data;
}

export async function deletePlan(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.superadmin.plan(id));
}

export async function restorePlan(id: string): Promise<PlanOut> {
    const { data } = await apiClient.post<PlanOut>(ENDPOINTS.superadmin.planRestore(id));
    return data;
}

export async function permanentDeletePlan(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.superadmin.planPermanent(id));
}

// ─── Superadmin Settings types ────────────────────────────────────────────────

export interface SuperadminGeneralSettingsOut {
    company_name: string | null;
    contact_email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    youtube_url: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
}

export interface SuperadminEmailSettingsOut {
    admin_email: string | null;
    mail_server: string | null;
    mail_port: number | null;
    mail_login: string | null;
    mail_password_set: boolean;
}

export interface SuperadminAwsSettingsOut {
    storage_backend: "local" | "s3";
    aws_access_key_id: string | null;
    aws_secret_access_key_set: boolean;
    aws_s3_bucket: string | null;
    aws_region: string;
    aws_s3_storage_class: string;
    cloudfront_domain: string | null;
    cloudfront_distribution_id: string | null;
    mediaconvert_endpoint: string | null;
    mediaconvert_role_arn: string | null;
}

export interface SuperadminPayPalOut {
    enabled: boolean;
    is_default: boolean;
    mode: "sandbox" | "live";
    client_id: string | null;
    client_secret_set: boolean;
}

export interface SuperadminStripeOut {
    enabled: boolean;
    is_default: boolean;
    mode: "test" | "live";
    publishable_key: string | null;
    secret_key_set: boolean;
    webhook_secret_set: boolean;
}

export interface SuperadminRazorpayOut {
    enabled: boolean;
    is_default: boolean;
    mode: "test" | "live";
    key_id: string | null;
    key_secret_set: boolean;
    webhook_secret_set: boolean;
}

export interface SuperadminCashfreeOut {
    enabled: boolean;
    is_default: boolean;
    mode: "test" | "live";
    app_id: string | null;
    app_secret_set: boolean;
}

export interface SuperadminPaymentGatewayOut {
    default_gateway: "paypal" | "stripe" | "razorpay" | "cashfree" | null;
    paypal: SuperadminPayPalOut;
    stripe: SuperadminStripeOut;
    razorpay: SuperadminRazorpayOut;
    cashfree: SuperadminCashfreeOut;
}

export interface SuperadminSettingsOut {
    general: SuperadminGeneralSettingsOut;
    email: SuperadminEmailSettingsOut;
    aws: SuperadminAwsSettingsOut;
    payment_gateway: SuperadminPaymentGatewayOut;
}

export interface SuperadminGeneralSettingsIn {
    company_name?: string | null;
    contact_email?: string | null;
    phone?: string | null;
    address1?: string | null;
    address2?: string | null;
    youtube_url?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
}

export interface SuperadminEmailSettingsIn {
    admin_email?: string | null;
    mail_server?: string | null;
    mail_port?: number | null;
    mail_login?: string | null;
    mail_password?: string | null;
}

export interface SuperadminAwsSettingsIn {
    storage_backend?: "local" | "s3" | null;
    aws_access_key_id?: string | null;
    aws_secret_access_key?: string | null;
    aws_s3_bucket?: string | null;
    aws_region?: string | null;
    aws_s3_storage_class?: string | null;
    cloudfront_domain?: string | null;
    cloudfront_distribution_id?: string | null;
    mediaconvert_endpoint?: string | null;
    mediaconvert_role_arn?: string | null;
}

export interface SuperadminPayPalIn {
    enabled?: boolean;
    is_default?: boolean;
    mode?: "sandbox" | "live";
    client_id?: string | null;
    client_secret?: string | null;
}

export interface SuperadminStripeIn {
    enabled?: boolean;
    is_default?: boolean;
    mode?: "test" | "live";
    publishable_key?: string | null;
    secret_key?: string | null;
    webhook_secret?: string | null;
}

export interface SuperadminRazorpayIn {
    enabled?: boolean;
    is_default?: boolean;
    mode?: "test" | "live";
    key_id?: string | null;
    key_secret?: string | null;
    webhook_secret?: string | null;
}

export interface SuperadminCashfreeIn {
    enabled?: boolean;
    is_default?: boolean;
    mode?: "test" | "live";
    app_id?: string | null;
    app_secret?: string | null;
}

export interface SuperadminPaymentGatewayIn {
    default_gateway?: "paypal" | "stripe" | "razorpay" | "cashfree" | null;
    paypal?: SuperadminPayPalIn;
    stripe?: SuperadminStripeIn;
    razorpay?: SuperadminRazorpayIn;
    cashfree?: SuperadminCashfreeIn;
}

export interface SuperadminSettingsIn {
    general?: SuperadminGeneralSettingsIn;
    email?: SuperadminEmailSettingsIn;
    aws?: SuperadminAwsSettingsIn;
    payment_gateway?: SuperadminPaymentGatewayIn;
}

export interface SuperadminSmtpTestRequest {
    to_email: string;
    message: string;
    subject: string;
    mail_server?: string;
    mail_port?: number;
    mail_login?: string;
    mail_password?: string;
}

export interface SuperadminSmtpTestDebug {
    credential_source?: {
        mail_server?: string;
        mail_port?: string;
        mail_login?: string;
        mail_password?: string;
        from_email?: string;
    };
    used_db_stored_credentials?: boolean;
    used_env_fallback?: boolean;
}

export interface SuperadminSmtpTestResponse {
    success: boolean;
    message: string;
    debug?: SuperadminSmtpTestDebug;
}

// ─── Superadmin Settings functions ───────────────────────────────────────────

export async function fetchSuperadminSettings(): Promise<SuperadminSettingsOut> {
    const { data } = await apiClient.get<SuperadminSettingsOut>(ENDPOINTS.superadmin.settings);
    return data;
}

export async function saveSuperadminSettings(payload: SuperadminSettingsIn): Promise<SuperadminSettingsOut> {
    const { data } = await apiClient.put<SuperadminSettingsOut>(ENDPOINTS.superadmin.settings, payload);
    return data;
}

export async function testSuperadminSmtpConnection(
    payload: SuperadminSmtpTestRequest,
): Promise<SuperadminSmtpTestResponse> {
    const { data } = await apiClient.post<SuperadminSmtpTestResponse>(
        ENDPOINTS.superadmin.settingsEmailTest,
        payload,
    );
    return data;
}

// ─── Demo Category types ──────────────────────────────────────────────────────

export interface DemoCategoryOut {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    content_type: string | null;
    thumbnail_url: string | null;
    sort_order: number;
    created_at: string;
}

export interface DemoCategoryCreate {
    name: string;
    slug: string;
    description?: string | null;
    content_type?: string | null;
    thumbnail_url?: string | null;
    sort_order?: number;
}

export interface DemoCategoryUpdate {
    name?: string;
    description?: string | null;
    content_type?: string | null;
    thumbnail_url?: string | null;
    sort_order?: number;
}

// ─── Demo Content types ───────────────────────────────────────────────────────

export type DemoContentType = "video" | "audio" | "series" | "live_stream";

export interface DemoEpisode {
    title: string;
    season_number: number;
    episode_number: number;
    stream_url: string;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
    description?: string | null;
}

export interface DemoContentItem {
    id: string;
    title: string;
    content_type: DemoContentType;
    stream_url: string | null;
    thumbnail_url: string | null;
    description: string | null;
    short_description: string | null;
    duration_seconds: number | null;
    genre: string | null;
    language: string | null;
    artist: string | null;
    album: string | null;
    age_rating: string | null;
    is_featured: boolean;
    extra_data: Record<string, unknown>;
    categories: Array<{ id: string; name: string; slug: string; content_type: string | null }>;
    created_at: string;
}

export interface DemoContentCreatePayload {
    title: string;
    content_type: DemoContentType;
    stream_url?: string | null;
    thumbnail_url?: string | null;
    description?: string | null;
    short_description?: string | null;
    duration_seconds?: number | null;
    genre?: string | null;
    language?: string | null;
    artist?: string | null;
    album?: string | null;
    age_rating?: string | null;
    is_featured?: boolean;
    extra_data?: Record<string, unknown>;
    category_ids?: string[];
}

export type DemoContentUpdatePayload = Partial<DemoContentCreatePayload>;

// ─── Demo Category functions ──────────────────────────────────────────────────

export async function listDemoCategories(): Promise<DemoCategoryOut[]> {
    const { data } = await apiClient.get<DemoCategoryOut[]>(ENDPOINTS.superadmin.demoCategories);
    return data;
}

export async function createDemoCategory(payload: DemoCategoryCreate): Promise<DemoCategoryOut> {
    const { data } = await apiClient.post<DemoCategoryOut>(ENDPOINTS.superadmin.demoCategories, payload);
    return data;
}

export async function updateDemoCategory(id: string, payload: DemoCategoryUpdate): Promise<DemoCategoryOut> {
    const { data } = await apiClient.patch<DemoCategoryOut>(ENDPOINTS.superadmin.demoCategoryItem(id), payload);
    return data;
}

export async function deleteDemoCategory(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.superadmin.demoCategoryItem(id));
}

// ─── Demo Content functions ───────────────────────────────────────────────────

export async function listDemoContent(): Promise<DemoContentItem[]> {
    const { data } = await apiClient.get<DemoContentItem[]>(ENDPOINTS.superadmin.demoContent);
    return data;
}

export async function addDemoContent(payload: DemoContentCreatePayload): Promise<DemoContentItem> {
    const { data } = await apiClient.post<DemoContentItem>(ENDPOINTS.superadmin.demoContent, payload);
    return data;
}

export async function updateDemoContent(id: string, payload: DemoContentUpdatePayload): Promise<DemoContentItem> {
    const { data } = await apiClient.patch<DemoContentItem>(ENDPOINTS.superadmin.demoContentItem(id), payload);
    return data;
}

export async function removeDemoContent(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.superadmin.demoContentItem(id));
}
