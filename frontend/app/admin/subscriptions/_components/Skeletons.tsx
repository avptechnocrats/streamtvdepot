function Bone({ className = "" }: { className?: string }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

export function SubscriptionRowSkeleton() {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <Bone className="h-8 flex-1" />
            <Bone className="h-3 w-40 hidden sm:block shrink-0" />
            <Bone className="h-5 w-20 rounded-full shrink-0" />
            <Bone className="h-5 w-20 rounded-full hidden md:block shrink-0" />
            <Bone className="h-3 w-20 hidden sm:block shrink-0" />
            <Bone className="h-3 w-20 hidden lg:block shrink-0" />
        </div>
    );
}
