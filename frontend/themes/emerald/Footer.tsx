/**
 * emerald/Footer.tsx
 *
 * Prime Video comprehensive footer.
 * 5 columns of links + bottom bar with app downloads + language selector.
 */
"use client";

const cols = [
    { heading: "Interest-Based Ads", links: ["Privacy Notice", "Cookies", "Ad Preferences", "Your Privacy Choices"] },
    { heading: "Watch Anywhere", links: ["Amazon Fire TV", "Apple TV", "Android", "iOS", "Smart TVs"] },
    { heading: "Explore", links: ["Prime Video Home", "Movies", "TV Shows", "Originals", "Channels", "Sports"] },
    { heading: "Help & Support", links: ["Help Center", "Contact Us", "Feedback", "Accessibility", "Subtitle Settings"] },
    { heading: "About Prime", links: ["What is Prime?", "Subscription Plans", "Corporate Info", "Careers", "Press Room"] },
];

export default function Footer() {
    return (
        <footer className="border-t border-border/30 mt-10 bg-secondary/20">
            <div className="px-4 lg:px-10 pt-8 pb-6">

                {/* 5-col link grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
                    {cols.map((col) => (
                        <div key={col.heading}>
                            <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.18em] mb-3">{col.heading}</p>
                            <div className="space-y-2">
                                {col.links.map((l) => (
                                    <a key={l} href="#" className="block text-[11px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-5 border-t border-border/20">
                    <div className="flex items-center gap-3">
                        <span className="text-[14px] font-black text-foreground tracking-tight">
                            Stream<span className="text-primary">Vault</span>
                        </span>
                        <span className="text-[9px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">PLUS</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {["iOS App", "Android App", "Fire TV", "Roku"].map((b) => (
                            <a key={b} href="#" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground border border-border/40 px-2.5 py-1 rounded transition-colors">
                                ↓ {b}
                            </a>
                        ))}
                    </div>

                    <p className="text-[10px] text-muted-foreground/35">
                        © 1996–{new Date().getFullYear()} SignalView, Inc.
                    </p>
                </div>
            </div>
        </footer>
    );
}
