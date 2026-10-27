"use client";

import Link from "next/link";

interface LoginLogoProps {
    href?: string;
    className?: string;
    style?: React.CSSProperties;
    light?: boolean;
}

export default function LoginLogo({
    href = "/",
    className = "flex items-center gap-2 w-fit group relative z-10",
    style,
    light = false,
}: LoginLogoProps) {
    const content = (
        <img src={light ? "/logo_light.png" : "/logo.png"} alt="StreamTVDepot" className="h-14 w-auto" />
    );

    if (href) {
        return (
            <Link href={href} className={className} style={style}>
                {content}
            </Link>
        );
    }

    return <div className={className} style={style}>{content}</div>;
}
