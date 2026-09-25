/**
 * Strip all query parameters from a URL.
 * Used to convert a presigned S3 URL → permanent base S3 URL for storage.
 * The backend will re-sign the base URL on every API response.
 */
export function stripQuery(url: string): string {
    try {
        const u = new URL(url);
        u.search = "";
        u.hash = "";
        return u.toString();
    } catch {
        // Not a valid absolute URL (e.g. relative path) — return as-is
        return url;
    }
}

/** Shared helper - replicates how duration seconds → HH:MM:SS */
export function fmtDuration(seconds: number | null): string {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/** Auto-generate a URL-safe slug from a title string */
export function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-{2,}/g, "-");
}
