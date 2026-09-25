function Bone({ className = "" }: { className?: string }) {
    return (
        <div
            className={`rounded bg-muted animate-pulse ${className}`}
        />
    );
}

export function PlanCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
            {/* Top row: name + badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1.5">
                    <Bone className="h-4 w-2/3" />
                    <Bone className="h-3 w-1/3" />
                </div>
                <Bone className="h-5 w-14 rounded" />
            </div>

            {/* Price + cycle chip */}
            <div className="flex items-center gap-2">
                <Bone className="h-7 w-20" />
                <Bone className="h-5 w-16 rounded" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-4/5" />
            </div>

            {/* Limits grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                        <Bone className="h-3 w-10" />
                        <Bone className="h-3 w-12" />
                    </div>
                ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1 border-t border-border">
                <Bone className="h-7 w-14 rounded-lg" />
                <Bone className="h-7 w-16 rounded-lg ml-auto" />
            </div>
        </div>
    );
}

export function TrashCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border border-dashed bg-card/50 p-5 flex flex-col gap-3">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1.5">
                    <Bone className="h-4 w-2/3" />
                    <Bone className="h-3 w-1/3" />
                </div>
                <Bone className="h-5 w-16 rounded" />
            </div>

            {/* Price */}
            <Bone className="h-6 w-20" />

            {/* Action buttons */}
            <div className="flex gap-2 pt-1 border-t border-border">
                <Bone className="h-7 w-16 rounded-lg" />
                <Bone className="h-7 w-24 rounded-lg ml-auto" />
            </div>
        </div>
    );
}
