function Bone({ className = "" }: { className?: string }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

export function UserRowSkeleton() {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <Bone className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-36" />
                <Bone className="h-3 w-48" />
            </div>
            <Bone className="h-3 w-16 hidden md:block" />
            <Bone className="h-3 w-16 hidden sm:block" />
            <Bone className="h-5 w-14 rounded-full hidden sm:block" />
            <Bone className="h-3 w-20 hidden lg:block" />
            <div className="flex gap-1 shrink-0">
                <Bone className="h-7 w-7 rounded-md" />
                <Bone className="h-7 w-7 rounded-md" />
            </div>
        </div>
    );
}
