export function StatusBadge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${active
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
        >
            {active ? "Active" : "Inactive"}
        </span>
    );
}

export function AccessTypeBadge({ accessType }: { accessType: string }) {
    const accessTypeConfig: Record<string, { bg: string; text: string; label: string }> = {
        free: {
            bg: "bg-blue-500/10",
            text: "text-blue-400",
            label: "Free",
        },
        subscription: {
            bg: "bg-purple-500/10",
            text: "text-purple-400",
            label: "Subscription",
        },
        pay_per_view: {
            bg: "bg-orange-500/10",
            text: "text-orange-400",
            label: "PPV",
        },
        rental: {
            bg: "bg-cyan-500/10",
            text: "text-cyan-400",
            label: "Rental",
        },
    };

    const config = accessTypeConfig[accessType] || accessTypeConfig.free;

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${config.bg} ${config.text} border-current border-opacity-20`}
        >
            {config.label}
        </span>
    );
}

export function FeaturedBadge() {
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border bg-amber-500/10 text-amber-400 border-amber-500/20">
            Featured
        </span>
    );
}
