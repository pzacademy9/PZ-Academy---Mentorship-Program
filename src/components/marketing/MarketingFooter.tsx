import Link from "next/link";
import Image from "next/image";

type FooterLink = { label: string; href: string };

// Only links that lead somewhere real. Add social / blog / policy links here
// once they exist — never a "#" placeholder.
const PROGRAM_LINKS: FooterLink[] = [
  { label: "Home", href: "/" },
  { label: "Webinars", href: "/webinars" },
  { label: "Workshops", href: "/workshops" },
  { label: "Courses", href: "/courses" },
  { label: "Mentorship", href: "/mentorship" },
];

const ACCOUNT_LINKS: FooterLink[] = [
  { label: "Sign In", href: "/login" },
  { label: "Create Account", href: "/register" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Certificates", href: "https://cert.pharmacozyme.com" },
];

const CONTACT_LINKS: FooterLink[] = [
  { label: "WhatsApp: +92 370 019 9429", href: "https://wa.me/923700199429" },
  { label: "info@pharmacozyme.com", href: "mailto:info@pharmacozyme.com" },
  { label: "pharmacozyme.com", href: "https://pharmacozyme.com" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[.75rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.62)] mb-3 font-montserrat">{title}</h2>
      <ul className="flex flex-col">
        {links.map(({ label, href }) => {
          const external = /^https?:\/\//.test(href);
          return (
            <li key={label}>
              <Link
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex min-h-11 items-center text-[.875rem] text-[rgba(255,255,255,.78)] font-poppins transition-colors duration-200 hover:text-pz-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-pz-bright"
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-pz-ink text-[rgba(255,255,255,.7)] pt-[4.5rem] pb-8 px-6 relative z-10">
      <div className="max-w-[1060px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-8 md:gap-12 pb-10 border-b border-[rgba(255,255,255,.07)] mb-8">
          {/* Brand */}
          <div>
            <Image
              src="https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png"
              alt="PZ Academy"
              width={52} height={52}
              className="h-[52px] w-auto mb-4 opacity-90"
              unoptimized
            />
            <p className="text-[rgba(255,255,255,.72)] text-[.875rem] leading-[1.75] mb-5 font-poppins">
              PZ Academy by Pharmacozyme is committed to advancing pharmaceutical education through high-quality courses, expert mentorship, and clinical training.
            </p>
          </div>

          {/* Programs */}
          <FooterColumn title="Programs" links={PROGRAM_LINKS} />

          {/* Account */}
          <FooterColumn title="Account" links={ACCOUNT_LINKS} />

          {/* Contact */}
          <FooterColumn title="Contact" links={CONTACT_LINKS} />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[.8rem] text-[rgba(255,255,255,.62)] font-poppins">© 2026 PZ Academy by Pharmacozyme. All rights reserved.</p>
          <p className="text-[.8rem] text-[rgba(255,255,255,.62)] font-poppins">Educating with Innovation</p>
        </div>
      </div>
    </footer>
  );
}
