// src/components/landing/LandingFooter.tsx
// Built from the Stitch footer rather than reusing MarketingFooter: that component is the app's
// dark-mode-aware marketing chrome (pz-* tokens, next/image, raw rgba values, links to app routes)
// and does not match the landing brand.
import type { NavItem } from "./MobileMenu";

export function LandingFooter({ title, items, whatsapp }: { title: string; items: NavItem[]; whatsapp: string }) {
  return (
    <footer className="border-t border-landing-on-primary/10 bg-landing-near-black px-4 pb-8 pt-10 text-xs text-landing-on-primary/70 md:px-6 md:pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-8 border-b border-landing-on-primary/10 pb-8 md:grid-cols-2 md:gap-10 md:pb-12 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-landing bg-landing-primary font-headline text-sm font-black text-landing-mint md:h-9 md:w-9 md:text-base">PZ</span>
              <span className="font-headline text-sm font-extrabold text-landing-on-primary md:text-lg">{title || "PZ Academy"}</span>
            </div>
            <p className="max-w-sm leading-relaxed text-landing-on-primary/60">
              PZ Academy by Pharmacozyme is committed to advancing pharmaceutical education through high-quality courses, expert mentorship, and clinical training.
            </p>
          </div>
          {items.length > 0 ? (
            <nav aria-label="Footer">
              <p className="mb-3 font-headline text-[11px] font-bold uppercase tracking-wider text-landing-on-primary md:mb-4 md:text-xs">On this page</p>
              <ul className="space-y-2">
                {items.map((n) => (
                  <li key={n.id}><a href={`#${n.id}`} className="transition-colors hover:text-landing-mint">{n.label}</a></li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div>
            <p className="mb-3 font-headline text-[11px] font-bold uppercase tracking-wider text-landing-on-primary md:mb-4 md:text-xs">Contact</p>
            <ul className="space-y-2">
              {whatsapp ? (
                <li>
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-landing-mint hover:underline">
                    WhatsApp admissions
                  </a>
                </li>
              ) : null}
              <li><a href="mailto:info@pharmacozyme.com" className="transition-colors hover:text-landing-on-primary">info@pharmacozyme.com</a></li>
            </ul>
          </div>
        </div>
        <p className="pt-6 text-[11px] text-landing-on-primary/45">© {new Date().getFullYear()} PZ Academy by Pharmacozyme. All rights reserved.</p>
      </div>
    </footer>
  );
}
