function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
    return <div className={`rounded bg-muted animate-pulse ${className}`} style={style} />;
}

// ─── Reusable skeleton pieces ────────────────────────────────────────────────

function SkelSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl border border-border bg-card p-6 space-y-4 ${className}`}>
            {children}
        </div>
    );
}

function SkelHeading() {
    return <Bone className="h-3.5 w-28" />;
}

function SkelField({ labelW = "w-20" }: { labelW?: string }) {
    return (
        <div className="space-y-1.5">
            <Bone className={`h-3 ${labelW}`} />
            <Bone className="h-9 w-full rounded-lg" />
        </div>
    );
}

function SkelTextarea({ labelW = "w-20", rows = 3 }: { labelW?: string; rows?: number }) {
    const heightCls = rows <= 2 ? "h-12" : rows <= 4 ? "h-24" : "h-36";
    return (
        <div className="space-y-1.5">
            <Bone className={`h-3 ${labelW}`} />
            <Bone className={`w-full rounded-lg ${heightCls}`} />
        </div>
    );
}

function SkelToggle() {
    return (
        <div className="flex items-center justify-between py-1">
            <div className="space-y-1">
                <Bone className="h-3 w-28" />
                <Bone className="h-2.5 w-40" />
            </div>
            <Bone className="h-6 w-11 rounded-full shrink-0" />
        </div>
    );
}

// ─── VideoForm skeleton ───────────────────────────────────────────────────────

export function VideoFormSkeleton() {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-6">

                {/* Basic Information */}
                <SkelSection>
                    <SkelHeading />
                    <SkelField labelW="w-8" />
                    <SkelField labelW="w-8" />
                    <SkelTextarea labelW="w-32" rows={2} />
                    <SkelTextarea labelW="w-32" rows={4} />
                    <div className="grid grid-cols-2 gap-4">
                        <SkelField labelW="w-16" />
                        <SkelField labelW="w-16" />
                        <SkelField labelW="w-20" />
                        <SkelField labelW="w-12" />
                        <SkelField labelW="w-24" />
                        <SkelField labelW="w-16" />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <SkelToggle />
                    </div>
                </SkelSection>

                {/* Thumbnails */}
                <SkelSection>
                    <SkelHeading />
                    {/* Video Banner full-width */}
                    <div className="space-y-1.5">
                        <Bone className="h-3 w-24" />
                        <Bone className="h-2.5 w-48" />
                        <Bone className="h-32 w-full rounded-xl" />
                        <div className="flex gap-2">
                            <Bone className="h-8 flex-1 rounded-lg" />
                            <Bone className="h-8 flex-1 rounded-lg" />
                        </div>
                    </div>
                    {/* Portrait + Wide side-by-side */}
                    <div className="grid grid-cols-2 gap-6">
                        {[0, 1].map((i) => (
                            <div key={i} className="space-y-1.5">
                                <Bone className="h-3 w-28" />
                                <Bone className="h-2.5 w-20" />
                                <Bone className="h-40 w-full rounded-xl" />
                                <div className="flex gap-2">
                                    <Bone className="h-8 flex-1 rounded-lg" />
                                    <Bone className="h-8 flex-1 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                </SkelSection>

                {/* Cast & Crew */}
                <SkelSection>
                    <div className="flex items-center justify-between">
                        <SkelHeading />
                        <Bone className="h-4 w-20 rounded" />
                    </div>
                    {[0, 1].map((i) => (
                        <div key={i} className="grid grid-cols-3 gap-3">
                            <Bone className="h-9 rounded-lg" />
                            <Bone className="h-9 rounded-lg" />
                            <Bone className="h-9 rounded-lg" />
                        </div>
                    ))}
                </SkelSection>

                {/* Intro / Skip Times */}
                <SkelSection>
                    <SkelHeading />
                    <div className="grid grid-cols-2 gap-4">
                        <SkelField labelW="w-24" />
                        <SkelField labelW="w-24" />
                        <SkelField labelW="w-20" />
                        <SkelField labelW="w-20" />
                    </div>
                </SkelSection>

                {/* SEO */}
                <SkelSection>
                    <SkelHeading />
                    <SkelField labelW="w-20" />
                    <SkelTextarea labelW="w-32" rows={2} />
                    <SkelField labelW="w-20" />
                    <SkelField labelW="w-16" />
                </SkelSection>

                {/* Advertisement */}
                <SkelSection>
                    <SkelHeading />
                    <div className="grid grid-cols-2 gap-4">
                        <SkelField labelW="w-16" />
                        <SkelField labelW="w-16" />
                        <SkelField labelW="w-24" />
                        <SkelField labelW="w-24" />
                    </div>
                </SkelSection>

                {/* Submit bar */}
                <div className="flex justify-end gap-3">
                    <Bone className="h-10 w-24 rounded-xl" />
                    <Bone className="h-10 w-32 rounded-xl" />
                </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-6">

                {/* Video Upload */}
                <SkelSection>
                    <SkelHeading />
                    <Bone className="h-40 w-full rounded-xl" />
                    <Bone className="h-8 w-full rounded-lg" />
                </SkelSection>

                {/* Status Settings */}
                <SkelSection>
                    <SkelHeading />
                    <SkelToggle />
                    <SkelToggle />
                    <SkelToggle />
                    <SkelToggle />
                </SkelSection>

                {/* Visibility */}
                <SkelSection>
                    <SkelHeading />
                    <SkelField labelW="w-28" />
                    <SkelField labelW="w-20" />
                </SkelSection>

                {/* User Access */}
                <SkelSection>
                    <SkelHeading />
                    <SkelField labelW="w-24" />
                </SkelSection>

                {/* Trailer */}
                <SkelSection>
                    <SkelHeading />
                    <SkelField labelW="w-24" />
                    <Bone className="h-9 w-full rounded-lg" />
                </SkelSection>

                {/* Related Videos */}
                <SkelSection>
                    <div className="flex items-center justify-between">
                        <SkelHeading />
                        <Bone className="h-4 w-16 rounded" />
                    </div>
                    <Bone className="h-9 w-full rounded-lg" />
                </SkelSection>

                {/* Geo Fencing */}
                <SkelSection>
                    <SkelHeading />
                    <div className="space-y-3">
                        <SkelField labelW="w-32" />
                        <SkelField labelW="w-32" />
                    </div>
                </SkelSection>
            </div>
        </div>
    );
}

export function VideoCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <Bone className="h-36 w-full rounded-none" />
            <div className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1.5">
                        <Bone className="h-4 w-3/4" />
                        <Bone className="h-3 w-1/3" />
                    </div>
                    <Bone className="h-5 w-14 rounded" />
                </div>
                <div className="flex gap-2">
                    <Bone className="h-4 w-16 rounded" />
                    <Bone className="h-4 w-10 rounded" />
                    <Bone className="h-4 w-14 rounded" />
                </div>
                <Bone className="h-3 w-full" />
                <Bone className="h-3 w-4/5" />
                <div className="flex gap-2 pt-1 border-t border-border">
                    <Bone className="h-7 w-16 rounded-lg" />
                    <Bone className="h-7 w-16 rounded-lg ml-auto" />
                </div>
            </div>
        </div>
    );
}

export function TrashVideoCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
            <Bone className="w-16 h-16 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-2/3" />
                <Bone className="h-3 w-1/3" />
            </div>
            <div className="flex gap-2 shrink-0">
                <Bone className="h-7 w-20 rounded-lg" />
                <Bone className="h-7 w-28 rounded-lg" />
            </div>
        </div>
    );
}
