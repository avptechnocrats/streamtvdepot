import publicApiClient from "./public-client";

export type MenuPosition = "header" | "footer";
export type MenuLinkTarget = "_self" | "_blank";

export interface PublicMenuLink {
    id: string;
    label: string;
    url: string;
    sort_order: number;
    description?: string | null;
    target?: MenuLinkTarget;
    column_index?: number;
}

export interface PublicMenuGroup {
    id: string;
    name: string;
    position: MenuPosition;
    is_active: boolean;
    sort_order: number;
    footer_columns?: number;
    footer_column_headers?: string[];
    max_menu_display?: number | null;
    links: PublicMenuLink[];
}

export interface PublicActiveMenus {
    header: PublicMenuGroup | null;
    footer: PublicMenuGroup | null;
}

export function getFallbackHeaderLinks(defaultLinks: PublicMenuLink[]): PublicMenuLink[] {
    const configuredLinks = process.env.NEXT_PUBLIC_CLIENT_HEADER_LINKS;
    if (!configuredLinks) return defaultLinks;
    try {
        const links: unknown = JSON.parse(configuredLinks);
        if (!Array.isArray(links)) return defaultLinks;
        const validLinks = links.flatMap((item, index) => {
            if (!item || typeof item.label !== "string" || !item.label.trim() || typeof item.url !== "string") return [];
            const url = item.url.trim();
            if (!/^\/(?!\/)|^https?:\/\//i.test(url)) return [];
            return [{
                id: typeof item.id === "string" ? item.id : `fallback-${index}`,
                label: item.label.trim(),
                url,
                sort_order: index,
                target: item.target === "_blank" ? "_blank" as const : "_self" as const,
            }];
        });
        return links.length && !validLinks.length ? defaultLinks : validLinks;
    } catch {
        return defaultLinks;
    }
}

export async function fetchPublicActiveMenus(): Promise<PublicActiveMenus> {
    const { data } = await publicApiClient.get<PublicActiveMenus>("/menus/active");
    return {
        header: data.header,
        footer: data.footer,
    };
}
