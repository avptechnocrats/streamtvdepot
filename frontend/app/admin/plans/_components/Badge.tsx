export function Badge({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border ${active
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-muted text-muted-foreground border-border"
                }`}
        >
            {active ? "Active" : "Inactive"}
        </span>
    );
}
