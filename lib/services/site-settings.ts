/**
 * Public Site Settings — fetched via the middleware proxy at /api/public/site-settings
 * Returns logo URL, site title, tagline, and language. No auth required.
 */

import publicApiClient from "./public-client";

export interface PublicSiteSettings {
    site_title: string | null;
    tagline: string | null;
    site_language: string | null;
    copyright_text: string | null;
    logo_s3_key: string | null;
    logo_url: string | null;
    contact_email: string | null;
    youtube_url: string | null;
    instagram_url: string | null;
    facebook_url: string | null;
}

export interface SocialAuthConfigOut {
    google: {
        enabled: boolean;
        client_id: string | null;
        redirect_uri: string | null;
    };
}

export async function fetchPublicSiteSettings(): Promise<PublicSiteSettings> {
    const res = await publicApiClient.get<PublicSiteSettings>("/site-settings");
    return res.data;
}

export async function fetchSocialAuthConfig(): Promise<SocialAuthConfigOut> {
    const res = await publicApiClient.get<SocialAuthConfigOut>("/auth/config/social-auth");
    return res.data;
}
