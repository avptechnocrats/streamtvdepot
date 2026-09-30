"use client";

import SiteLogo from "@/components/SiteLogo";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTenantName } from "@/hooks/use-tenant-name";
import { Youtube, Instagram, Facebook } from "lucide-react";

const Footer = () => {
  const { copyright_text, youtube_url, instagram_url, facebook_url } = useSiteSettings();
  const label = useTenantName();

  const socialLinks = [
    { icon: Youtube, url: youtube_url, label: "YouTube" },
    { icon: Instagram, url: instagram_url, label: "Instagram" },
    { icon: Facebook, url: facebook_url, label: "Facebook" },
  ];

  return (
    <footer className="px-6 lg:px-12 pt-12 pb-6 border-t border-border/50">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
        <div className="space-y-3">
          <h4 className="text-sm font-display font-600 text-foreground">Company</h4>
          <div className="space-y-2">
            {["About Us", "Careers", "Press"].map((l) => (
              <a key={l} href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l}</a>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-display font-600 text-foreground">Support</h4>
          <div className="space-y-2">
            {["Help Center", "Contact Us", "FAQ"].map((l) => (
              <a key={l} href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l}</a>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-display font-600 text-foreground">Legal</h4>
          <div className="space-y-2">
            {["Privacy Policy", "Terms of Use", "Cookie Policy"].map((l) => (
              <a key={l} href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l}</a>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-display font-600 text-foreground">Follow Us</h4>
          <div className="flex items-center gap-3 pt-1">
            {socialLinks.map(({ icon: Icon, url, label: name }) => (
              url ? (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  className="w-9 h-9 rounded-md bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  <Icon size={16} />
                </a>
              ) : (
                <span
                  key={name}
                  aria-label={name}
                  className="w-9 h-9 rounded-md bg-secondary border border-border/50 flex items-center justify-center text-muted-foreground/30"
                >
                  <Icon size={16} />
                </span>
              )
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border/30">
        <SiteLogo
          className="flex items-center gap-2"
          imageSize={40}
          labelClassName="text-gradient-gold font-display font-800 text-lg"
        />
        <p className="text-xs text-muted-foreground">
          {copyright_text || `© ${new Date().getFullYear()} ${label}. All rights reserved.`}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
