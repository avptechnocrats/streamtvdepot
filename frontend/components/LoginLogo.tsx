"use client";

import Link from "next/link";

interface LoginLogoProps {
    href?: string;
    className?: string;
    style?: React.CSSProperties;
}

export default function LoginLogo({
    href = "/",
    className = "flex items-center gap-2 w-fit group relative z-10",
    style
}: LoginLogoProps) {
    const content = (
        <img src="/logo.png" alt="StreamTVDepot" className="h-14 w-auto" />
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
