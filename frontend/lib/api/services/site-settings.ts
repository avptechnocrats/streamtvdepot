/**
 * Site Settings API Service
 *
 * GET  /admin/site-settings              – load current site settings
 * PUT  /admin/site-settings              – save site settings
 * POST /admin/site-settings/logo/presign – get a presigned S3 PUT URL for logo upload
 */

import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneralSettingsOut {
    site_title: string | null;
    site_url: string | null;
    tagline: string | null;
    site_language: string | null;
    copyright_text: string | null;
    logo_s3_key: string | null;
    logo_url: string | null;
    favicon_s3_key: string | null;
    favicon_url: string | null;
    address1: string | null;
    address2: string | null;
    phone: string | null;
    contact_email: string | null;
    youtube_url: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
}

export interface EmailSettingsOut {
    admin_email: string | null;
    mail_server: string | null;
    mail_port: number | null;
    mail_login: string | null;
    mail_password_set: boolean;
}

export interface GoogleOAuthSettingsOut {
    enabled: boolean;
    client_id: string | null;
    client_secret_set: boolean;
    redirect_uri: string | null;
}

export interface SocialAuthSettingsOut {
    google: GoogleOAuthSettingsOut;
}

export interface SiteSettingsOut {
    general: GeneralSettingsOut;
    email: EmailSettingsOut;
    social_auth: SocialAuthSettingsOut;
    client_name: string | null;
}

export interface GeneralSettingsIn {
    site_title?: string | null;
    site_url?: string | null;
    tagline?: string | null;
    site_language?: string | null;
    copyright_text?: string | null;
    logo_s3_key?: string | null;
    clear_logo?: boolean;
    favicon_s3_key?: string | null;
    clear_favicon?: boolean;
    address1?: string | null;
    address2?: string | null;
    phone?: string | null;
    contact_email?: string | null;
    youtube_url?: string | null;
    instagram_url?: string | null;
    facebook_url?: string | null;
}

export interface EmailSettingsIn {
    admin_email?: string | null;
    mail_server?: string | null;
    mail_port?: number | null;
    mail_login?: string | null;
    mail_password?: string | null;
}

export interface GoogleOAuthSettingsIn {
    enabled?: boolean;
    client_id?: string | null;
    client_secret?: string | null;
    redirect_uri?: string | null;
}

export interface SocialAuthSettingsIn {
    google?: GoogleOAuthSettingsIn;
}

export interface SiteSettingsIn {
    general?: GeneralSettingsIn;
    email?: EmailSettingsIn;
    social_auth?: SocialAuthSettingsIn;
}

export interface LogoPresignRequest {
    filename: string;
    content_type: string;
    file_size: number;
    asset_type?: "logo" | "favicon";
}

export interface LogoPresignResponse {
    upload_url: string;
    s3_key: string;
}

export interface SmtpTestRequest {
    to_email: string;
    message: string;
    subject: string;
    mail_server?: string;
    mail_port?: number;
    mail_login?: string;
    mail_password?: string;
}

export interface SmtpTestDebug {
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

export interface SmtpTestResponse {
    success: boolean;
    message: string;
    debug?: SmtpTestDebug;
}

export interface PlatformIssuerInfo {
    company_name: string | null;
    logo_url: string | null;
    address1: string | null;
    address2: string | null;
    phone: string | null;
    contact_email: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function fetchSiteSettings(): Promise<SiteSettingsOut> {
    const res = await apiClient.get<SiteSettingsOut>(ENDPOINTS.admin.siteSettings);
    return res.data;
}

export async function saveSiteSettings(payload: SiteSettingsIn): Promise<SiteSettingsOut> {
    const res = await apiClient.put<SiteSettingsOut>(ENDPOINTS.admin.siteSettings, payload);
    return res.data;
}

export async function presignLogoUpload(
    payload: LogoPresignRequest,
): Promise<LogoPresignResponse> {
    const res = await apiClient.post<LogoPresignResponse>(
        ENDPOINTS.admin.siteSettingsLogoPresign,
        payload,
    );
    return res.data;
}

export async function testSiteSmtpConnection(
    payload: SmtpTestRequest,
): Promise<SmtpTestResponse> {
    const res = await apiClient.post<SmtpTestResponse>(
        ENDPOINTS.admin.siteSettingsEmailTest,
        payload,
    );
    return res.data;
}

export async function fetchPlatformIssuerInfo(): Promise<PlatformIssuerInfo> {
    const res = await apiClient.get<PlatformIssuerInfo>(ENDPOINTS.admin.platformIssuer);
    return res.data;
}

// ─── Public Endpoints (no auth required) ──────────────────────────────────────

export interface SocialAuthConfigOut {
    google: {
        enabled: boolean;
        client_id: string | null;
        redirect_uri: string | null;
    };
}

export async function fetchSocialAuthConfig(): Promise<SocialAuthConfigOut> {
    const res = await apiClient.get<SocialAuthConfigOut>(ENDPOINTS.auth.socialAuthConfig);
    return res.data;
}
