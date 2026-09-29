export function toDisplayName(slug: string): string {
    return slug
        .trim()
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function getTenantNameFromHost(hostname: string): string | null {
    const host = hostname.toLowerCase();

    // Preview tenant host format: <slug>.preview.signalview.tech
    if (host.endsWith(".preview.signalview.tech")) {
        const slug = host.slice(0, host.length - ".preview.signalview.tech".length);
        if (slug && !slug.includes(".")) {
            const name = toDisplayName(slug);
            if (name) return name;
        }
    }

    return null;
}