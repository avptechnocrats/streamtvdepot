import axios from "axios";
import publicApiClient from "./public-client";

const TENANT_INACTIVE_CODE = "tenant_plan_inactive";

function readTenantInactiveCode(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;

    const root = payload as Record<string, unknown>;
    const detail = root.detail;

    if (detail && typeof detail === "object") {
        const code = (detail as Record<string, unknown>).code;
        return typeof code === "string" ? code : null;
    }

    const code = root.code;
    return typeof code === "string" ? code : null;
}

export function isTenantInactiveError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (error.response?.status !== 503) return false;

    const code = readTenantInactiveCode(error.response?.data);
    return code === TENANT_INACTIVE_CODE;
}

export async function checkTenantAvailability(): Promise<{ inactive: boolean }> {
    try {
        await publicApiClient.get("/videos", {
            params: { page_size: 1, page: 1 },
            timeout: 8000,
        });
        return { inactive: false };
    } catch (error) {
        if (isTenantInactiveError(error)) {
            return { inactive: true };
        }

        // Network/transient failures should not lock users into maintenance mode.
        return { inactive: false };
    }
}
