import apiClient from "../client";
import { ENDPOINTS } from "../endpoints";

export type MenuPosition = "header" | "footer";
export type MenuLinkTarget = "_self" | "_blank";
export type MenuItemType = "name" | "icon";

export interface MenuLink {
    id: string;
    label?: string;
    url: string;
    sortOrder: number;
    description?: string;
    target?: MenuLinkTarget;
    itemType?: MenuItemType;
    icon?: string;
    columnIndex?: number;
}

export interface MenuGroup {
    id: string;
    name: string;
    position: MenuPosition;
    isActive: boolean;
    sortOrder: number;
    footerColumns: number;
    maxMenuDisplay?: number | null;
    links: MenuLink[];
}

export interface MenuGroupPayload {
    name: string;
    position: MenuPosition;
    footerColumns?: number;
    maxMenuDisplay?: number | null;
}

export interface MenuLinkPayload {
    label?: string;
    url: string;
    description?: string;
    target?: MenuLinkTarget;
    itemType?: MenuItemType;
    icon?: string;
    columnIndex?: number;
}

interface ApiMenuLink {
    id: string;
    label?: string;
    url: string;
    sort_order: number;
    description?: string;
    target?: MenuLinkTarget;
    item_type?: MenuItemType;
    icon?: string;
    column_index?: number;
}

interface ApiMenuGroup {
    id: string;
    name: string;
    position: MenuPosition;
    is_active: boolean;
    sort_order: number;
    footer_columns: number;
    max_menu_display?: number | null;
    links: ApiMenuLink[];
}

function toMenuLink(api: ApiMenuLink): MenuLink {
    return {
        id: api.id,
        label: api.label,
        url: api.url,
        sortOrder: api.sort_order,
        description: api.description,
        target: api.target,
        itemType: api.item_type,
        icon: api.icon,
        columnIndex: api.column_index,
    };
}

function toMenuGroup(api: ApiMenuGroup): MenuGroup {
    return {
        id: api.id,
        name: api.name,
        position: api.position,
        isActive: api.is_active,
        sortOrder: api.sort_order,
        footerColumns: api.footer_columns,
        maxMenuDisplay: api.max_menu_display,
        links: (api.links || []).map(toMenuLink).sort((a, b) => a.sortOrder - b.sortOrder),
    };
}

export async function listMenuGroups(): Promise<MenuGroup[]> {
    const res = await apiClient.get<ApiMenuGroup[]>(ENDPOINTS.admin.menus);
    return res.data.map(toMenuGroup);
}

export async function getMenusByPosition(position: MenuPosition): Promise<MenuGroup[]> {
    const res = await apiClient.get<ApiMenuGroup[]>(ENDPOINTS.admin.menus, {
        params: { position },
    });
    return res.data.map(toMenuGroup).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createMenuGroup(payload: MenuGroupPayload): Promise<MenuGroup> {
    const res = await apiClient.post<ApiMenuGroup>(ENDPOINTS.admin.menuGroups, {
        name: payload.name,
        position: payload.position,
        footer_columns: payload.footerColumns,
        max_menu_display: payload.maxMenuDisplay,
    });
    return toMenuGroup(res.data);
}

export async function updateMenuGroup(id: string, payload: Partial<MenuGroupPayload>): Promise<MenuGroup> {
    const res = await apiClient.patch<ApiMenuGroup>(ENDPOINTS.admin.menuGroup(id), {
        name: payload.name,
        footer_columns: payload.footerColumns,
        max_menu_display: payload.maxMenuDisplay,
    });
    return toMenuGroup(res.data);
}

export async function deleteMenuGroup(id: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.menuGroup(id));
}

export async function setActiveMenuGroup(id: string, _position: MenuPosition): Promise<MenuGroup> {
    const res = await apiClient.post<ApiMenuGroup>(ENDPOINTS.admin.menuGroupActivate(id));
    return toMenuGroup(res.data);
}

export async function addMenuLink(groupId: string, payload: MenuLinkPayload): Promise<MenuLink> {
    const res = await apiClient.post<ApiMenuLink>(ENDPOINTS.admin.menuLinks(groupId), {
        label: payload.label,
        url: payload.url,
        description: payload.description,
        target: payload.target,
        item_type: payload.itemType,
        icon: payload.icon,
        column_index: payload.columnIndex,
    });
    return toMenuLink(res.data);
}

export async function updateMenuLink(groupId: string, linkId: string, payload: Partial<MenuLinkPayload>): Promise<MenuLink> {
    const res = await apiClient.patch<ApiMenuLink>(ENDPOINTS.admin.menuLink(groupId, linkId), {
        label: payload.label,
        url: payload.url,
        description: payload.description,
        target: payload.target,
        item_type: payload.itemType,
        icon: payload.icon,
        column_index: payload.columnIndex,
    });
    return toMenuLink(res.data);
}

export async function deleteMenuLink(groupId: string, linkId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.admin.menuLink(groupId, linkId));
}

export async function reorderMenuLinks(groupId: string, links: Array<{ id: string; sortOrder: number }>): Promise<MenuLink[]> {
    const linkIds = [...links]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id);

    const res = await apiClient.put<ApiMenuLink[]>(ENDPOINTS.admin.menuLinksReorder(groupId), {
        link_ids: linkIds,
    });
    return res.data.map(toMenuLink).sort((a, b) => a.sortOrder - b.sortOrder);
}
