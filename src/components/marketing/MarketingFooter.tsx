import Link from "next/link";

type FooterLink = { label: string; href: string };

// Only links that lead somewhere real. Add social / blog / policy links here
// once they exist — never a "#" placeholder.
const PROGRAM_LINKS: FooterLink[] = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/courses" },
  { label: "Workshops", href: "/workshops" },
  { label: "Webinars", href: "/webinars" },
  { label: "Mentorship", href: "/mentorship" },
];

const HELP_LINKS: FooterLink[] = [
  { label: "Find my ID", href: "/progress" },
  { label: "Verify a certificate", href: "https://cert.pharmacozyme.com" },
  { label: "Sign In", href: "/login" },
  { label: "Create Account", href: "/register" },
  { label: "Dashboard", href: "/dashboard" },
];

const CONTACT_LINKS: FooterLink[] = [
  { label: "WhatsApp: +92 370 019 9429", href: "https://wa.me/923700199429" },
  { label: "info@pharmacozyme.com", href: "mailto:info@pharmacozyme.com" },
  { label: "pharmacozyme.com", href: "https://pharmacozyme.com" },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-montserrat text-xl font-bold text-white">{title}</h2>
      <ul className="flex flex-col">
        {links.map(({ label, href }) => {
          const external = /^https?:\/\//.test(href);
          return (
            <li key={label}>
              <Link
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex min-h-11 items-center font-poppins text-[15px] text-white/75 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pz-bright"
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

/** Deep green site footer (Stitch "PZ Academy Platform 2"): wordmark, three link columns, copyright line. */
export function MarketingFooter() {
  return (
    <footer className="relative z-10 w-full bg-pz-solid-deep px-5 pb-8 pt-12 text-white md:px-6">
      <div className="mx-auto max-w-[1320px]">
        <div className="grid grid-cols-1 gap-10 pb-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col leading-none">
              <span className="font-montserrat text-xl font-extrabold tracking-tight text-white">PZ ACADEMY</span>
              <span className="mt-1 font-poppins text-[11px] font-semibold uppercase tracking-wide text-pz-bright">by Pharmacozyme</span>
            </div>
            <p className="mt-2 font-poppins text-[15px] font-semibold text-pz-bright">Educating with Innovation</p>
            <p className="font-poppins text-sm leading-relaxed text-white/75">
              PZ Academy by Pharmacozyme is committed to advancing pharmaceutical education through high-quality courses, expert mentorship, and clinical training.
            </p>
          </div>
          <FooterColumn title="Programs" links={PROGRAM_LINKS} />
          <FooterColumn title="Help" links={HELP_LINKS} />
          <FooterColumn title="Contact" links={CONTACT_LINKS} />
        </div>

        <div className="border-t border-white/10 pt-6">
          <p className="font-poppins text-[13px] text-white/70">© 2026 PZ Academy by Pharmacozyme. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
