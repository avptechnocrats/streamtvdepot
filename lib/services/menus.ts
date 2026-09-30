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
}

export interface PublicMenuGroup {
    id: string;
    name: string;
    position: MenuPosition;
    is_active: boolean;
    sort_order: number;
    max_menu_display?: number | null;
    links: PublicMenuLink[];
}

export interface PublicActiveMenus {
    header: PublicMenuGroup | null;
    footer: PublicMenuGroup | null;
}

export async function fetchPublicActiveMenus(): Promise<PublicActiveMenus> {
    const { data } = await publicApiClient.get<PublicActiveMenus>("/menus/active");
    return {
        header: data.header,
        footer: data.footer,
    };
}
