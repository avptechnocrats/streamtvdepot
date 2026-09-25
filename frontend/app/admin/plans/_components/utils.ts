import type { PlanOut } from "@/lib/api";

export function slugify(val: string) {
    return val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function limitLabel(val: number | null | undefined): string {
    if (val === null || val === undefined) return "—";
    if (val === -1) return "Unlimited";
    return val.toLocaleString();
}
