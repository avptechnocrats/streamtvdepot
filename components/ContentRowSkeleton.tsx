"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { HOME_CONTENT_ITEMS_PER_ROW } from "@/lib/services/home-contents";
import { useTheme } from "@/hooks/use-theme";
import { WIDER_LANDSCAPE_CARD_WIDTH } from "@/components/VideoHoverPreview";

export default function ContentRowSkeleton({ count = HOME_CONTENT_ITEMS_PER_ROW, variant = "portrait" }: { count?: number; variant?: "portrait" | "landscape" | "wider-landscape" }) {
    const { activeTheme } = useTheme();
    const isEmber = activeTheme.id === "ember";
    const widerLandscape = variant === "wider-landscape";
    const landscape = isEmber && (variant === "landscape" || widerLandscape);
    return (
        <section aria-label="Loading content row" data-skeleton-row className={isEmber ? "storefront-row space-y-3" : "px-6 lg:px-12 space-y-4"}>
            <Skeleton className="h-6 w-44 rounded" />
            <div className={isEmber ? `flex ${landscape ? "gap-3" : "gap-5 sm:gap-6"} overflow-hidden pt-1 pb-2 px-10 -mx-10` : "flex gap-4 overflow-hidden py-2 px-1"}>
                {Array.from({ length: count }, (_, index) => (
                    <div key={index} data-skeleton-poster className={widerLandscape ? `shrink-0 ${WIDER_LANDSCAPE_CARD_WIDTH}` : isEmber ? landscape ? "shrink-0 w-56 sm:w-60 lg:w-64" : "shrink-0 w-44 sm:w-48 lg:w-52" : "content-card shrink-0"}>
                        <Skeleton className={`w-full ${landscape || widerLandscape ? "aspect-video" : "aspect-[2/3]"} rounded-lg`} />
                        {!landscape && !widerLandscape && <div className="mt-1.5 px-0.5">
                            <Skeleton className="h-4 w-3/4 rounded" />
                            <Skeleton className="h-4 w-1/2 rounded" />
                        </div>}
                    </div>
                ))}
            </div>
        </section>
    );
}