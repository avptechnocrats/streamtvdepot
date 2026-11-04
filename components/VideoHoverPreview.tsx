"use client";

import { BannerTrailer, useBannerHover } from "@/components/BannerTrailer";

export const WIDER_LANDSCAPE_CARD_WIDTH = "w-[35rem] sm:w-[37.5rem] lg:w-[40rem]";

export function VideoHoverPreview({ src, hlsSrc }: { src?: string | null; hlsSrc?: string | null }) {
    const { hovered, hoverProps } = useBannerHover();

    if (!src && !hlsSrc) return null;

    return (
        <div {...hoverProps} className="absolute inset-0 z-10">
            <BannerTrailer
                src={src ?? null}
                hlsSrc={hlsSrc}
                hovered={hovered}
                showSoundControl
                soundControlPlacement="bottom-right"
            />
        </div>
    );
}