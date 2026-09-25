/**
 * midnight/Footer.tsx
 *
 * HBO Max editorial two-column footer.
 * LEFT: brand tagline + social icons
 * RIGHT: 3 columns of links
 * Bottom bar: copyright + legal links
 */
"use client";

const cols = [
    { heading: "Explore", links: ["Series", "Movies", "Originals", "Sports", "Kids", "Documentaries"] },
    { heading: "Account", links: ["Sign In", "Manage Profile", "Subscription", "Gift Cards", "Devices"] },
    { heading: "Help", links: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Use", "Accessibility"] },
];

export default function Footer() {
    return (
        <footer className="px-6 lg:px-14 pt-12 pb-8 border-t border-border/30 mt-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
                {/* Brand column */}
                <div>
                    <p className="text-xl font-black text-foreground tracking-tighter mb-3">
                        Stream<span className="text-primary">Vault</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[200px]">
                        Premium streaming. Unlimited stories. Watch anywhere.
                    </p>
                    <div className="flex gap-3 mt-5">
                        {["tw", "ig", "fb", "yt"].map((s) => (
                            <a key={s} href="#" className="w-7 h-7 rounded-sm bg-secondary border border-border/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors uppercase">
                                {s}
                            </a>
                        ))}
                    </div>
                </div>

                {/* Link columns */}
                {cols.map((col) => (
                    <div key={col.heading}>
                        <p className="text-[11px] font-bold text-foreground/60 uppercase tracking-[0.18em] mb-4">{col.heading}</p>
                        <div className="space-y-2.5">
                            {col.links.map((l) => (
                                <a key={l} href="#" className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border/20">
                <p className="text-[11px] text-muted-foreground/50">© {new Date().getFullYear()} StreamTVDepot, Inc. All rights reserved.</p>
                <div className="flex gap-4">
                    {["Privacy", "Terms", "Cookies"].map((l) => (
                        <a key={l} href="#" className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">{l}</a>
                    ))}
                </div>
            </div>
        </footer>
    );
}
