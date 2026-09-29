"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown in place of the Banner while:
 *  - the slider-videos API request is in-flight, OR
 *  - theme settings have not yet been loaded from the backend
 *
 * Matches the full-viewport height of all Banner variants so there is no
 * layout shift once the real banner mounts.
 */
export function BannerSkeleton() {
    return (
        <section className="relative w-full h-[85vh] min-h-[500px] overflow-hidden">
            {/* Full-screen image placeholder */}
            <Skeleton className="absolute inset-0 w-full h-full rounded-none" />

            {/* Gradient overlay — mirrors the real banner's bottom fade */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />

            {/* Content skeleton — bottom-left, same layout as BannerContent */}
            <div className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-20 space-y-5">
                {/* Badge */}
                <Skeleton className="h-6 w-28 rounded-full" />

                {/* Title — two lines */}
                <div className="space-y-3">
                    <Skeleton className="h-10 w-[420px] max-w-[70vw]" />
                    <Skeleton className="h-10 w-64 max-w-[50vw]" />
                </div>

                {/* Description lines */}
                <div className="space-y-2">
                    <Skeleton className="h-3.5 w-[480px] max-w-[75vw]" />
                    <Skeleton className="h-3.5 w-96 max-w-[60vw] opacity-70" />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-1">
                    <Skeleton className="h-12 w-36 rounded-lg" />
                    <Skeleton className="h-12 w-28 rounded-lg" />
                    <Skeleton className="h-12 w-12 rounded-lg" />
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-3 w-14" />
                </div>
            </div>
        </section>
    );
}
