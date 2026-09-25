function Bone({ className = "" }: { className?: string }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

export function CategoryRowSkeleton() {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <Bone className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-56" />
            </div>
            <Bone className="h-3 w-28 hidden sm:block" />
            <Bone className="h-5 w-48 rounded-full hidden sm:block" />
            <Bone className="h-3 w-16 hidden md:block" />
            <div className="flex w-24 gap-1 shrink-0">
                <Bone className="h-7 w-7 rounded-md" />
                <Bone className="h-7 w-7 rounded-md" />
            </div>
        </div>
    );
}
