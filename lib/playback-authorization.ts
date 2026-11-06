const AUTH_PARAMETERS = ["token", "Policy", "Signature", "Key-Pair-Id", "Expires"];

export function playbackResource(source: string): string {
    const url = new URL(source);
    for (const name of AUTH_PARAMETERS) url.searchParams.delete(name);
    for (const name of Array.from(url.searchParams.keys())) {
        if (name.startsWith("X-Amz-")) url.searchParams.delete(name);
    }
    return url.toString();
}

export function authorizePlaybackRequest(uri: string, source: string): string {
    try {
        const authorization = new URL(source);
        const target = new URL(uri, source);
        if (target.origin !== authorization.origin) return uri;
        const directory = authorization.pathname.slice(0, authorization.pathname.lastIndexOf("/") + 1);
        if (!target.pathname.startsWith(directory)) return uri;
        if (authorization.searchParams.has("X-Amz-Signature")) {
            return target.pathname === authorization.pathname ? authorization.toString() : uri;
        }
        const stem = authorization.pathname.replace(/\.m3u8$/i, "");
        if (authorization.searchParams.has("token") && target.pathname !== authorization.pathname && !target.pathname.startsWith(stem + "_") && !target.pathname.startsWith(stem + "-")) return uri;
        if (authorization.searchParams.has("Expires") && !authorization.searchParams.has("Policy") && target.pathname !== authorization.pathname) return uri;
        for (const name of AUTH_PARAMETERS) {
            const value = authorization.searchParams.get(name);
            if (value !== null) target.searchParams.set(name, value);
        }
        return target.toString();
    } catch {
        return uri;
    }
}

export function playbackAuthorizationExpiry(source: string): number | null {
    try {
        const params = new URL(source).searchParams;
        if (params.has("Expires")) return Number(params.get("Expires")) * 1000;
        const token = params.get("token");
        if (token) {
            const payload = JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
            return typeof payload.exp === "number" ? payload.exp * 1000 : null;
        }
        const policy = params.get("Policy");
        if (policy) {
            const data = JSON.parse(atob(policy.replaceAll("-", "+").replaceAll("_", "=").replaceAll("~", "/")));
            const expiry = data.Statement?.[0]?.Condition?.DateLessThan?.["AWS:EpochTime"];
            return typeof expiry === "number" ? expiry * 1000 : null;
        }
        const date = params.get("X-Amz-Date");
        const seconds = Number(params.get("X-Amz-Expires"));
        if (date && /^\d{8}T\d{6}Z$/.test(date) && seconds > 0) {
            return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)), Number(date.slice(9, 11)), Number(date.slice(11, 13)), Number(date.slice(13, 15))) + seconds * 1000;
        }
    } catch {
        return null;
    }
    return null;
}