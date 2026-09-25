"use client";

const Footer = () => {
  return (
    <footer className="px-6 lg:px-12 py-12 border-t border-border/50">
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
          <div className="space-y-2">
            {["Twitter", "Instagram", "Facebook"].map((l) => (
              <a key={l} href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border/30">
        <img src="/logo-new.png" alt="StreamTVDepot" className="h-8 w-auto" />
        <p className="text-xs text-muted-foreground">© 2024 StreamTVDepot. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
