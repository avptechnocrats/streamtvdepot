type ApiErrorShape = {
    message?: unknown;
    response?: {
        data?: {
            detail?: unknown;
            message?: unknown;
        };
    };
};

export function getApiErrorMessage(err: unknown, fallback: string): string {
    if (!err || typeof err !== "object") return fallback;

    const maybe = err as ApiErrorShape;
    const responseData = maybe.response?.data;
    const detail = responseData?.detail;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
        const firstString = detail.find((item) => typeof item === "string" && item.trim());
        if (typeof firstString === "string") return firstString;
    }

    if (detail && typeof detail === "object") {
        const nested = detail as { message?: unknown; detail?: unknown };
        if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
        if (typeof nested.detail === "string" && nested.detail.trim()) return nested.detail;
    }

    if (typeof responseData?.message === "string" && responseData.message.trim()) {
        return responseData.message;
    }

    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;

    return fallback;
}