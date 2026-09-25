export function PricingPlanCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-pulse">
            <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-2/3 rounded bg-secondary" />
                    <div className="h-3 w-full rounded bg-secondary" />
                </div>
                <div className="h-5 w-14 rounded-full bg-secondary shrink-0" />
            </div>
            <div className="h-7 w-1/2 rounded bg-secondary" />
            <div className="h-3 w-1/3 rounded bg-secondary" />
            <div className="h-16 rounded-xl bg-secondary" />
            <div className="flex gap-2 pt-1 border-t border-border">
                <div className="h-7 w-14 rounded-lg bg-secondary" />
                <div className="h-7 w-14 rounded-lg bg-secondary ml-auto" />
            </div>
        </div>
    );
}

function Bone({ className = "" }: { className?: string }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

export function PricingPlanRowSkeleton() {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <Bone className="h-3 w-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-56" />
            </div>
            <Bone className="h-3 w-40 hidden sm:block" />
            <Bone className="h-5 w-24 rounded-full hidden sm:block" />
            <Bone className="h-3 w-40 hidden sm:block" />
            <Bone className="h-3 w-24 hidden sm:block" />
            <Bone className="h-5 w-20 rounded-full shrink-0" />
            <div className="flex w-24 gap-1 shrink-0 justify-end">
                <Bone className="h-7 w-7 rounded-md" />
                <Bone className="h-7 w-7 rounded-md" />
            </div>
        </div>
    );
}
