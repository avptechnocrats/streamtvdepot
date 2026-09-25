function Bone({ className = "" }: { className?: string }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

export function AssetRowSkeleton() {
    return (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            {/* Thumbnail */}
            <Bone className="w-10 h-10 rounded-lg shrink-0" />
            {/* Filename + mime */}
            <div className="flex-1 space-y-1.5 min-w-0">
                <Bone className="h-4 w-40" />
                <Bone className="h-3 w-28" />
            </div>
            {/* Type pill — w-16 */}
            <Bone className="h-5 w-14 rounded-full shrink-0 hidden sm:block" />
            {/* Size — w-20 */}
            <Bone className="h-3 w-20 shrink-0 hidden sm:block" />
            {/* Dimensions — w-24 */}
            <Bone className="h-3 w-24 shrink-0 hidden md:block" />
            {/* Uploaded — w-28 */}
            <Bone className="h-3 w-28 shrink-0 hidden lg:block" />
            {/* Status — w-16 */}
            <Bone className="h-5 w-12 rounded-full shrink-0 hidden sm:block" />
            {/* Actions — w-24 */}
            <div className="w-24 shrink-0 flex items-center justify-end gap-1">
                <Bone className="h-7 w-7 rounded-md" />
                <Bone className="h-7 w-7 rounded-md" />
                <Bone className="h-7 w-7 rounded-md" />
            </div>
        </div>
    );
}
