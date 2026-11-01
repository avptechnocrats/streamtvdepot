"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

function TitleArtwork({ title, imageUrl, fallback }: { title: string; imageUrl: string; fallback: ReactNode }) {
    const [failed, setFailed] = useState(false);
    return failed ? fallback : <img src={imageUrl} alt={title} className="block max-h-28 w-full max-w-[360px] object-contain object-left sm:max-h-36" onError={() => setFailed(true)} />;
}

export default function BannerTitle({ title, imageUrl, children, className, style }: {
    title: string;
    imageUrl?: string | null;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
}) {
    return <h2 className={className} style={style}>{imageUrl ? <TitleArtwork key={imageUrl} title={title} imageUrl={imageUrl} fallback={children ?? title} /> : children ?? title}</h2>;
}