"use client";

import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPageBanners, type BannerPage, type BannerPosition, type PublicBanner } from "@/lib/services/banners";

function BannerImage({ banner }: { banner: PublicBanner }) {
    const [failed, setFailed] = useState(false);
    const images = banner.images;
    const desktop = images.desktop ?? images.custom ?? images.tablet ?? images.mobile;
    const tablet = images.tablet ?? images.custom ?? images.desktop ?? images.mobile;
    const mobile = images.mobile ?? images.custom ?? images.tablet ?? images.desktop;
    if (failed || !desktop || !tablet || !mobile) return null;
    const ratios = {
        "--banner-desktop-ratio": `${desktop.width} / ${desktop.height}`,
        "--banner-tablet-ratio": `${tablet.width} / ${tablet.height}`,
        "--banner-mobile-ratio": `${mobile.width} / ${mobile.height}`,
    } as CSSProperties;
    const link = banner.link?.trim();
    const safeLink = link && !/[\\\s\u0000-\u001f\u007f]/.test(link) && (
        (link.startsWith("/") && !link.startsWith("//")) || /^https?:\/\//i.test(link)
    );
    const picture = (
        <picture className="block aspect-[var(--banner-mobile-ratio)] sm:aspect-[var(--banner-tablet-ratio)] lg:aspect-[var(--banner-desktop-ratio)]" style={ratios}>
            <source media="(min-width: 1024px)" srcSet={desktop.display_url || desktop.url} />
            <source media="(min-width: 640px)" srcSet={tablet.display_url || tablet.url} />
            <img src={mobile.display_url || mobile.url} alt={banner.name} width={mobile.width} height={mobile.height} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        </picture>
    );

    return (
        <div data-banner-id={banner.id} className="overflow-hidden" style={banner.border_enabled ? {
            border: `${banner.border_width}px solid ${banner.border_color}`,
            borderRadius: banner.border_radius,
            padding: banner.padding,
        } : undefined}>
            {safeLink ? <a href={link} aria-label={banner.name} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary">{picture}</a> : picture}
        </div>
    );
}

export function usePageBanners(page?: BannerPage) {
    return useQuery({
        queryKey: ["storefront-banners", page],
        queryFn: () => listPageBanners(page!),
        enabled: Boolean(page),
        staleTime: 30_000,
        retry: 1,
    });
}

export default function ManagedBannerSlot({ page, position, inset = false, className = "" }: { page: BannerPage; position: BannerPosition; inset?: boolean; className?: string }) {
    const { data = [], isError } = usePageBanners(page);
    const banners = data.filter(banner => banner.page === page && banner.position === position);
    if (isError || !banners.length) return null;

    return (
        <section aria-label={`${position.replace(/_/g, " ")} banners`} data-banner-page={page} data-banner-position={position} className={`${inset ? "w-full py-6" : "w-full px-4 py-6 sm:px-6 lg:px-14"} ${className}`}>
            <div className="space-y-6">
                {banners.map(banner => <BannerImage key={`${banner.id}:${JSON.stringify(banner.images)}`} banner={banner} />)}
            </div>
        </section>
    );
}